import { describe, expect, it } from "bun:test";

import app from "../src/app";
import {
  PAYOUT_DELAY_MS,
  PUBLIC_KEY,
  SECRET_KEY,
  SLOW_PAYOUT_DELAY_MS,
} from "../src/config";
import {
  applyPaymentOutcome,
  calculateCheckoutCharges,
  calculateCollectionNetAmount,
  creditWalletForPayment,
} from "../src/services/payments";
import {
  calculatePayoutAmounts,
  getPayoutResolutionProfile,
} from "../src/services/payouts";
import { validateQuote } from "../src/services/quotes";
import { paginate, roundToCents } from "../src/utils";
import { store } from "../src/store";
import type { Payment } from "../src/types";

function createTestPayment(overrides: Partial<Payment> = {}): Payment {
  const timestamp = new Date().toISOString();

  return {
    id: "txn_test",
    reference: "pay_test",
    amount: 25_000,
    currency: "NGN",
    fee: 375,
    vat: 28.13,
    feeBearer: "business",
    metadata: {},
    customer: { name: "Maya Okafor", email: "maya@example.com" },
    redirectUrl: null,
    status: "pending",
    paymentDestination: "checkout",
    virtualAccount: {
      bankName: "Globus Bank",
      accountName: "Afrikart Demo Business",
      accountNumber: "1234567890",
      bankCode: "103",
      expiresAt: timestamp,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("checkout charge helpers", () => {
  it("calculates fee and vat for a business-borne checkout charge", () => {
    expect(calculateCheckoutCharges(25_000)).toEqual({
      fee: 375,
      vat: 28.13,
    });
  });

  it("calculates the credited amount after business fees", () => {
    const credited = calculateCollectionNetAmount({
      amount: 25_000,
      fee: 375,
      vat: 28.13,
      feeBearer: "business",
    });

    expect(credited).toBe(24_596.87);
  });
});

describe("pagination helper", () => {
  it("returns a page slice with metadata", () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({
      results: [3, 4],
      total: 5,
      page: 2,
      limit: 2,
    });
  });
});

describe("rounding helper", () => {
  it("rounds values to two decimal places", () => {
    expect(roundToCents(28.125)).toBe(28.13);
    expect(roundToCents(375)).toBe(375);
  });
});

describe("wallet credit helper", () => {
  it("credits the matching wallet and writes a balance log", () => {
    const wallet = store.wallets.find((entry) => entry.currency === "NGN");
    if (!wallet) throw new Error("Missing NGN wallet");

    const initialBalance = wallet.balance;
    const initialAvailableBalance = wallet.availableBalance;
    const initialLogCount = store.balanceLogs.length;
    const payment = createTestPayment();

    const credited = creditWalletForPayment(
      store,
      payment,
      "Collection from Maya Okafor",
    );

    expect(credited).toBe(24_596.87);
    expect(wallet.balance).toBe(initialBalance + 24_596.87);
    expect(wallet.availableBalance).toBe(initialAvailableBalance + 24_596.87);
    expect(store.balanceLogs).toHaveLength(initialLogCount + 1);
    expect(store.balanceLogs[0]?.reference).toBe("pay_test");

    wallet.balance = initialBalance;
    wallet.availableBalance = initialAvailableBalance;
    store.balanceLogs.splice(0, 1);
  });
});

describe("payment outcome helper", () => {
  it("credits a payment only once when success is applied repeatedly", () => {
    const wallet = store.wallets.find((entry) => entry.currency === "NGN");
    if (!wallet) throw new Error("Missing NGN wallet");

    const initialBalance = wallet.balance;
    const initialAvailableBalance = wallet.availableBalance;
    const initialLogCount = store.balanceLogs.length;
    const payment = createTestPayment({ reference: "pay_apply_once" });

    const first = applyPaymentOutcome(store, payment, {
      status: "successful",
      channel: "bank_transfer",
      successDescription: "Collection from Maya Okafor",
    });
    const second = applyPaymentOutcome(store, payment, {
      status: "successful",
      channel: "bank_transfer",
      successDescription: "Collection from Maya Okafor",
    });

    expect(first.creditedAmount).toBe(24_596.87);
    expect(second.creditedAmount).toBeNull();
    expect(payment.status).toBe("successful");
    expect(payment.channel).toBe("bank_transfer");
    expect(wallet.balance).toBe(initialBalance + 24_596.87);
    expect(wallet.availableBalance).toBe(initialAvailableBalance + 24_596.87);
    expect(store.balanceLogs).toHaveLength(initialLogCount + 1);

    wallet.balance = initialBalance;
    wallet.availableBalance = initialAvailableBalance;
    store.balanceLogs.splice(0, 1);
  });
});

describe("payout helpers", () => {
  it("calculates payout fees and received amounts", () => {
    expect(calculatePayoutAmounts("NGN", "NGN", 10_000)).toEqual({
      fee: 50,
      totalDebit: 10_050,
      rate: 1,
      amountReceived: 10_000,
    });
    expect(calculatePayoutAmounts("NGN", "USD", 500_000)).toEqual({
      fee: 7_500,
      totalDebit: 507_500,
      rate: 0.00062,
      amountReceived: 310,
    });
  });

  it("derives failure and delay behaviour from account suffixes", () => {
    expect(getPayoutResolutionProfile("0000000009")).toEqual({
      shouldFail: true,
      delayMs: PAYOUT_DELAY_MS,
    });
    expect(getPayoutResolutionProfile("1111111117")).toEqual({
      shouldFail: false,
      delayMs: SLOW_PAYOUT_DELAY_MS,
    });
  });
});

describe("quote validation helper", () => {
  it("returns the quote when it is valid", () => {
    const quoteReference = "quote_test_valid";
    store.quotes.set(quoteReference, {
      sourceCurrency: "NGN",
      destinationCurrency: "USD",
      sourceAmount: 500_000,
      destinationAmount: 310,
      action: "send",
      transactionType: "disbursement",
      fee: 5_000,
      rate: 0.00062,
      amountToCharge: 505_000,
      amountToReceive: 310,
      reference: quoteReference,
      expireAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: Date.now(),
    });

    const result = validateQuote(store, quoteReference, {
      sourceCurrency: "NGN",
      destinationCurrency: "USD",
      amount: 500_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.quote?.reference).toBe(quoteReference);

    store.quotes.delete(quoteReference);
  });

  it("returns a mismatch error when payout currencies differ", () => {
    const quoteReference = "quote_test_mismatch";
    store.quotes.set(quoteReference, {
      sourceCurrency: "NGN",
      destinationCurrency: "USD",
      sourceAmount: 500_000,
      destinationAmount: 310,
      action: "send",
      transactionType: "disbursement",
      fee: 5_000,
      rate: 0.00062,
      amountToCharge: 505_000,
      amountToReceive: 310,
      reference: quoteReference,
      expireAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: Date.now(),
    });

    const result = validateQuote(store, quoteReference, {
      sourceCurrency: "NGN",
      destinationCurrency: "GBP",
      amount: 500_000,
    });

    expect(result.error).toEqual({
      error: "Quote currencies do not match payout currencies",
      errorType: "QUOTE_MISMATCH",
    });

    store.quotes.delete(quoteReference);
  });
});

describe("documentation routes", () => {
  it("serves an OpenAPI spec", async () => {
    const response = await app.request("http://localhost/openapi.json");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("Afrikart Sandbox API");
    expect(body.servers).toEqual([{ url: "/" }]);
    expect(body.paths["/health"]).toBeDefined();
    expect(body.paths["/docs"]).toBeUndefined();
    expect(body.paths["/checkout/initiate"].post.requestBody).toBeDefined();
    expect(
      body.paths["/checkout/initiate"].post.requestBody.content[
        "application/json"
      ].schema.required,
    ).toEqual(["amount", "customer"]);
    expect(body.paths["/wallets/logs"].get.parameters).toEqual([
      expect.objectContaining({ in: "query", name: "currency" }),
      expect.objectContaining({ in: "query", name: "type" }),
      expect.objectContaining({ in: "query", name: "page" }),
      expect.objectContaining({ in: "query", name: "limit" }),
    ]);
  });

  it("serves Swagger UI", async () => {
    const response = await app.request("http://localhost/docs");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("SwaggerUIBundle");
    expect(body).toContain("url: '/openapi.json'");
  });
});

describe("auth enforcement", () => {
  it("keeps secret-key routes protected after router-level auth refactors", async () => {
    const response = await app.request("http://localhost/wallets");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      success: false,
      error: "Invalid or missing api-key header",
      errorType: "AUTH_FAILED",
    });
  });

  it("keeps the public checkout route protected by x-pub-key", async () => {
    const response = await app.request("http://localhost/checkout/initiate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: 25000,
        customer: {
          name: "Maya Okafor",
          email: "maya@example.com",
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      success: false,
      error: "Invalid or missing x-pub-key header",
      errorType: "AUTH_FAILED",
    });
  });
});
