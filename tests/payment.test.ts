import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { setDb } from "../src/db/index.js";
import { SCHEMA_SQL } from "../src/db/schema.js";
import { handleWebhook } from "../src/services/webhook.service.js";
import { verifyWebhookSignature } from "../src/lib/webhook-verify.js";
import {
  settleOrder,
  failCollection,
  getOrderTimeline,
  appendTimelineEvent,
} from "../src/services/order.service.js";

// Fresh DB before each test
let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  setDb(db);
});

// ─── Webhook signature verification ────────────────────────────────────────

describe("verifyWebhookSignature", () => {
  const secret = "whsec_test_secret";

  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ event: "collection.successful", data: { reference: "ref_1" } });
    const sig = createHmac("sha512", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const body = JSON.stringify({ event: "collection.successful", data: { reference: "ref_1" } });
    const sig = createHmac("sha512", secret).update(body + "x").digest("hex");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(false);
  });

  it("rejects an empty signature", () => {
    const body = JSON.stringify({ event: "payout.successful", data: {} });
    expect(verifyWebhookSignature(body, "", secret)).toBe(false);
  });

  it("rejects wrong secret", () => {
    const body = JSON.stringify({ event: "payout.failed", data: {} });
    const sig = createHmac("sha512", "wrong_secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(false);
  });
});

// ─── Webhook deduplication ──────────────────────────────────────────────────

describe("handleWebhook deduplication", () => {
  it("processes an event the first time", async () => {
    const result = await handleWebhook("evt_001", {
      event: "collection.successful",
      data: { reference: "nonexistent_ref", amountReceived: 10000, paymentSource: "bank_transfer" },
    });
    expect(result.duplicate).toBe(false);
    expect(result.accepted).toBe(true);
  });

  it("marks a replayed event as duplicate and does not re-process", async () => {
    // Seed an order so the first delivery has something to act on
    db.prepare(`
      INSERT INTO orders (id, checkout_ref, amount, currency, customer_name, customer_email, metadata, status)
      VALUES ('ord_1', 'ref_settle', 10000, 'NGN', 'Test User', 'test@test.com', '{}', 'initiated')
    `).run();

    const payload = {
      event: "collection.successful",
      data: { reference: "ref_settle", amountReceived: 10000, paymentSource: "bank_transfer" },
    };

    const first = await handleWebhook("evt_dupe_001", payload);
    expect(first.duplicate).toBe(false);

    // Verify order was settled after first delivery
    const order = db.prepare("SELECT status FROM orders WHERE checkout_ref = 'ref_settle'").get() as { status: string };
    expect(order.status).toBe("settled");

    // Second delivery — same event id
    const second = await handleWebhook("evt_dupe_001", payload);
    expect(second.duplicate).toBe(true);

    // Order status unchanged — no double processing
    const orderAfter = db.prepare("SELECT status FROM orders WHERE checkout_ref = 'ref_settle'").get() as { status: string };
    expect(orderAfter.status).toBe("settled");
  });

  it("prevents duplicate credits on concurrent deliveries", async () => {
    db.prepare(`
      INSERT INTO orders (id, checkout_ref, amount, currency, customer_name, customer_email, metadata, status)
      VALUES ('ord_2', 'ref_concurrent', 5000, 'NGN', 'User', 'u@u.com', '{}', 'initiated')
    `).run();

    const payload = {
      event: "collection.successful",
      data: { reference: "ref_concurrent", amountReceived: 5000, paymentSource: "bank_transfer" },
    };

    // Simulate concurrent delivery
    const [r1, r2] = await Promise.all([
      handleWebhook("evt_concurrent_001", payload),
      handleWebhook("evt_concurrent_001", payload),
    ]);

    const results = [r1, r2];
    const nonDupe = results.filter((r) => !r.duplicate);
    const dupes = results.filter((r) => r.duplicate);

    // Exactly one should process, one should be dedup'd
    expect(nonDupe.length + dupes.length).toBe(2);
    // At most one non-duplicate (SQLite serializes the INSERT OR IGNORE)
    expect(nonDupe.length).toBeLessThanOrEqual(1);
  });
});

// ─── Order state machine ────────────────────────────────────────────────────

describe("order state transitions", () => {
  beforeEach(() => {
    db.prepare(`
      INSERT INTO orders (id, checkout_ref, amount, currency, customer_name, customer_email, metadata, status)
      VALUES ('ord_sm', 'ref_sm', 20000, 'NGN', 'Ada', 'ada@example.com', '{}', 'initiated')
    `).run();
  });

  it("settles an order on collection.successful", () => {
    settleOrder("ref_sm", 20000, "bank_transfer");
    const row = db.prepare("SELECT status FROM orders WHERE id = 'ord_sm'").get() as { status: string };
    expect(row.status).toBe("settled");
  });

  it("marks an order failed on collection.failed", () => {
    failCollection("ref_sm", "Insufficient funds");
    const row = db.prepare("SELECT status FROM orders WHERE id = 'ord_sm'").get() as { status: string };
    expect(row.status).toBe("failed");
  });

  it("returns null for unknown ref", () => {
    expect(settleOrder("unknown_ref", 0, "bank_transfer")).toBeNull();
  });
});

// ─── Operator timeline ──────────────────────────────────────────────────────

describe("operator timeline", () => {
  beforeEach(() => {
    db.prepare(`
      INSERT INTO orders (id, checkout_ref, amount, currency, customer_name, customer_email, metadata, status)
      VALUES ('ord_tl', 'ref_tl', 10000, 'NGN', 'Kofi', 'kofi@example.com', '{}', 'initiated')
    `).run();
  });

  it("records and retrieves timeline events in chronological order", () => {
    appendTimelineEvent("ord_tl", "checkout.initiated", "customer", { ref: "ref_tl" });
    appendTimelineEvent("ord_tl", "collection.received", "system", { amount: 10000 });
    appendTimelineEvent("ord_tl", "payout.initiated", "operator", { internalRef: "iref_1" });

    const result = getOrderTimeline("ord_tl");
    expect(result).not.toBeNull();
    expect(result!.timeline).toHaveLength(3);
    expect(result!.timeline[0].event_type).toBe("checkout.initiated");
    expect(result!.timeline[2].event_type).toBe("payout.initiated");
  });

  it("returns null for unknown orderId", () => {
    expect(getOrderTimeline("nonexistent")).toBeNull();
  });

  it("includes parsed detail objects in timeline", () => {
    appendTimelineEvent("ord_tl", "payout.failed", "system", {
      reason: "Invalid account",
      recoveryNote: "Restore funds",
    });

    const result = getOrderTimeline("ord_tl");
    const failEvent = result!.timeline.find((e) => e.event_type === "payout.failed");
    expect(failEvent).toBeDefined();
    expect((failEvent!.detail as Record<string, unknown>).reason).toBe("Invalid account");
  });
});

// ─── Idempotency key store ──────────────────────────────────────────────────

describe("idempotency key store", () => {
  it("INSERT OR IGNORE prevents duplicate writes", () => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO idempotency_keys (key, resource, resource_id, response)
      VALUES (?, 'payout', ?, ?)
    `);

    const r1 = stmt.run("key_1", "pout_1", '{"status":"submitted"}');
    const r2 = stmt.run("key_1", "pout_1", '{"status":"submitted"}');

    expect(r1.changes).toBe(1);
    expect(r2.changes).toBe(0); // ignored

    const rows = db.prepare("SELECT COUNT(*) as c FROM idempotency_keys WHERE key = 'key_1'").get() as { c: number };
    expect(rows.c).toBe(1);
  });
});

// ─── Payout state regression guard ─────────────────────────────────────────

describe("payout state regression guard", () => {
  it("does not regress a terminal payout state", async () => {
    // Seed a payout already in 'successful' state
    db.prepare(`
      INSERT INTO orders (id, checkout_ref, amount, currency, customer_name, customer_email, metadata, status)
      VALUES ('ord_pr', 'ref_pr', 5000, 'NGN', 'Emeka', 'e@e.com', '{}', 'settled')
    `).run();

    db.prepare(`
      INSERT INTO payouts (id, order_id, internal_ref, provider_ref, customer_ref, amount, source_currency,
        destination_currency, recipient_name, recipient_account, recipient_bank_code, status)
      VALUES ('pout_pr', 'ord_pr', 'iref_pr', 'po_terminal', 'cref_pr', 5000, 'NGN', 'NGN',
        'Emeka', '3344556677', '033', 'successful')
    `).run();

    const { resolvePayoutFromWebhook } = await import("../src/services/payout.service.js");
    const result = resolvePayoutFromWebhook("po_terminal", "failed", "late failure");

    // Status should remain 'successful', not regressed to 'failed'
    const row = db.prepare("SELECT status FROM payouts WHERE provider_ref = 'po_terminal'").get() as { status: string };
    expect(row.status).toBe("successful");
  });
});
