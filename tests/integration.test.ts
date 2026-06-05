import { describe, it, expect, beforeEach, beforeAll, jest } from "@jest/globals";
import request from "supertest";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { setDb } from "../src/db/index.js";
import { SCHEMA_SQL } from "../src/db/schema.js";
import { createApp } from "../src/app.js";

const WEBHOOK_SECRET = "whsec_afrikart_secret";

function sign(body: string): string {
  return createHmac("sha512", WEBHOOK_SECRET).update(body).digest("hex");
}

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  setDb(db);
});

// ─── Health ─────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("ok");
  });
});

// ─── POST /orders ────────────────────────────────────────────────────────────

describe("POST /orders", () => {
  it("returns 400 when required fields missing", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ amount: 5000 }); // missing customerName, customerEmail
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for non-positive amount", async () => {
    const res = await request(app).post("/orders").send({
      amount: 0,
      customerName: "Ada",
      customerEmail: "ada@example.com",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    const res = await request(app).post("/orders").send({
      amount: 1000,
      customerName: "Ada",
      customerEmail: "not-an-email",
    });
    expect(res.status).toBe(400);
  });
});

// ─── GET /orders/:orderId ────────────────────────────────────────────────────

describe("GET /orders/:orderId", () => {
  it("returns 404 for unknown order", async () => {
    const res = await request(app).get("/orders/ord_nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─── POST /orders/:orderId/payouts ───────────────────────────────────────────

describe("POST /orders/:orderId/payouts", () => {
  it("returns 404 for unknown order", async () => {
    const res = await request(app)
      .post("/orders/ord_nonexistent/payouts")
      .send({
        amount: 5000,
        recipientName: "Ada",
        recipientAccount: "0123456789",
        recipientBankCode: "058",
      });
    expect(res.status).toBe(404);
  });

  it("returns 422 if order not settled", async () => {
    // Seed an order in 'initiated' state (not settled)
    const { getDb } = await import("../src/db/index.js");
    getDb().prepare(`
      INSERT INTO orders (id, checkout_ref, amount, currency, customer_name, customer_email, metadata, status)
      VALUES ('ord_unsettled', 'ref_unsettled', 10000, 'NGN', 'Ada', 'ada@e.com', '{}', 'initiated')
    `).run();

    const res = await request(app)
      .post("/orders/ord_unsettled/payouts")
      .send({
        amount: 5000,
        recipientName: "Ada",
        recipientAccount: "0123456789",
        recipientBankCode: "058",
      });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not settled/);
  });

  it("returns 400 for missing payout fields", async () => {
    const { getDb } = await import("../src/db/index.js");
    getDb().prepare(`
      INSERT INTO orders (id, checkout_ref, amount, currency, customer_name, customer_email, metadata, status)
      VALUES ('ord_settled', 'ref_settled', 10000, 'NGN', 'Ada', 'ada@e.com', '{}', 'settled')
    `).run();

    const res = await request(app)
      .post("/orders/ord_settled/payouts")
      .send({ amount: 5000 }); // missing recipient fields
    expect(res.status).toBe(400);
  });
});

// ─── POST /webhooks/fincra ───────────────────────────────────────────────────

describe("POST /webhooks/fincra", () => {
  it("rejects webhook with missing signature — 401", async () => {
    const res = await request(app)
      .post("/webhooks/fincra")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event: "collection.successful", data: {} }));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature/i);
  });

  it("rejects webhook with wrong signature — 401", async () => {
    const body = JSON.stringify({ event: "collection.successful", data: { reference: "ref_1" } });
    const res = await request(app)
      .post("/webhooks/fincra")
      .set("Content-Type", "application/json")
      .set("x-fincra-signature", "deadbeef")
      .send(body);
    expect(res.status).toBe(401);
  });

  it("accepts a correctly signed webhook — 200", async () => {
    const payload = { event: "collection.successful", data: { reference: "ref_x", amountReceived: 5000, paymentSource: "bank_transfer" } };
    const body = JSON.stringify(payload);
    const sig = sign(body);

    const res = await request(app)
      .post("/webhooks/fincra")
      .set("Content-Type", "application/json")
      .set("x-fincra-signature", sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("marks duplicate webhook — returns duplicate:true without reprocessing", async () => {
    // Seed order
    const { getDb } = await import("../src/db/index.js");
    getDb().prepare(`
      INSERT INTO orders (id, checkout_ref, amount, currency, customer_name, customer_email, metadata, status)
      VALUES ('ord_wh', 'ref_wh', 10000, 'NGN', 'Kofi', 'k@k.com', '{}', 'initiated')
    `).run();

    const payload = { event: "collection.successful", data: { id: "evt_dedup_http", reference: "ref_wh", amountReceived: 10000, paymentSource: "bank_transfer" } };
    const body = JSON.stringify(payload);
    const sig = sign(body);

    // First delivery
    const r1 = await request(app)
      .post("/webhooks/fincra")
      .set("Content-Type", "application/json")
      .set("x-fincra-signature", sig)
      .send(body);
    expect(r1.status).toBe(200);
    expect(r1.body.duplicate).toBe(false);

    // Order should be settled
    const order = getDb().prepare("SELECT status FROM orders WHERE id = 'ord_wh'").get() as { status: string };
    expect(order.status).toBe("settled");

    // Second delivery — same event id in data
    const r2 = await request(app)
      .post("/webhooks/fincra")
      .set("Content-Type", "application/json")
      .set("x-fincra-signature", sig)
      .send(body);
    expect(r2.status).toBe(200);
    expect(r2.body.duplicate).toBe(true);

    // Status unchanged
    const orderAfter = getDb().prepare("SELECT status FROM orders WHERE id = 'ord_wh'").get() as { status: string };
    expect(orderAfter.status).toBe("settled");
  });

  it("handles payout.failed webhook — updates payout status", async () => {
    const { getDb } = await import("../src/db/index.js");
    const db = getDb();

    db.prepare(`
      INSERT INTO orders (id, checkout_ref, amount, currency, customer_name, customer_email, metadata, status)
      VALUES ('ord_pf', 'ref_pf', 5000, 'NGN', 'Fatima', 'f@f.com', '{}', 'settled')
    `).run();
    db.prepare(`
      INSERT INTO payouts (id, order_id, internal_ref, provider_ref, customer_ref, amount,
        source_currency, destination_currency, recipient_name, recipient_account, recipient_bank_code, status)
      VALUES ('pout_pf', 'ord_pf', 'iref_pf', 'po_fail_001', 'cref_pf', 5000,
        'NGN', 'NGN', 'Fatima', '0000000009', '058', 'submitted')
    `).run();

    const payload = { event: "payout.failed", data: { id: "po_fail_001", reason: "Invalid account number" } };
    const body = JSON.stringify(payload);
    const sig = sign(body);

    const res = await request(app)
      .post("/webhooks/fincra")
      .set("Content-Type", "application/json")
      .set("x-fincra-signature", sig)
      .send(body);

    expect(res.status).toBe(200);

    // Payout should now be failed
    const payout = db.prepare("SELECT status FROM payouts WHERE provider_ref = 'po_fail_001'").get() as { status: string };
    expect(payout.status).toBe("failed");

    // Timeline should record the failure with recovery note
    const events = db.prepare(
      "SELECT detail FROM transaction_events WHERE order_id = 'ord_pf' AND event_type = 'payout.failed'"
    ).all() as { detail: string }[];
    expect(events.length).toBe(1);
    const detail = JSON.parse(events[0].detail);
    expect(detail.recoveryNote).toBeDefined();
  });

  it("handles chargeback.created webhook", async () => {
    const { getDb } = await import("../src/db/index.js");
    const db = getDb();

    db.prepare(`
      INSERT INTO orders (id, checkout_ref, amount, currency, customer_name, customer_email, metadata, status)
      VALUES ('ord_cb', 'ref_cb', 25000, 'NGN', 'Maya', 'm@m.com', '{}', 'settled')
    `).run();

    const payload = {
      event: "chargeback.created",
      data: {
        id: "cb_001",
        paymentReference: "ref_cb",
        paymentId: "txn_001",
        amount: 25000,
        currency: "NGN",
        reason: "Unauthorized transaction",
        deadline: "2026-06-12T00:00:00.000Z",
      },
    };
    const body = JSON.stringify(payload);
    const sig = sign(body);

    const res = await request(app)
      .post("/webhooks/fincra")
      .set("Content-Type", "application/json")
      .set("x-fincra-signature", sig)
      .send(body);

    expect(res.status).toBe(200);

    // Order should be charged_back
    const order = db.prepare("SELECT status FROM orders WHERE id = 'ord_cb'").get() as { status: string };
    expect(order.status).toBe("charged_back");

    // Chargeback row should exist
    const cb = db.prepare("SELECT * FROM chargebacks WHERE order_id = 'ord_cb'").get() as { status: string; reason: string } | undefined;
    expect(cb).toBeDefined();
    expect(cb!.status).toBe("open");
    expect(cb!.reason).toBe("Unauthorized transaction");
  });
});
