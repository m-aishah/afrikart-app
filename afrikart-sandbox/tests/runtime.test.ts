import { afterEach, describe, expect, it } from "bun:test";

import { PUBLIC_KEY, SECRET_KEY } from "../src/config";
import {
  getDemoCredentials,
  getSandboxSummary,
  resetSandboxState,
  rotateDemoCredentials,
  scheduleSandboxTask,
} from "../src/runtime";
import { store } from "../src/store";

describe("runtime sandbox controls", () => {
  afterEach(async () => {
    await resetSandboxState();
    await rotateDemoCredentials({
      secretKey: SECRET_KEY,
      publicKey: PUBLIC_KEY,
    });
  });

  it("generates temporary demo credentials with the expected prefixes", async () => {
    const credentials = await rotateDemoCredentials();

    expect(credentials.secretKey).toMatch(/^sk_demo_[0-9a-f]{16}$/);
    expect(credentials.publicKey).toMatch(/^pk_demo_[0-9a-f]{16}$/);
    expect(credentials.rotatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await getDemoCredentials()).toEqual(credentials);
  });

  it("uses provided demo credentials verbatim when rotating", async () => {
    const credentials = await rotateDemoCredentials({
      secretKey: "sk_demo_presenter_one",
      publicKey: "pk_demo_presenter_one",
    });

    expect(credentials).toEqual({
      secretKey: "sk_demo_presenter_one",
      publicKey: "pk_demo_presenter_one",
      rotatedAt: credentials.rotatedAt,
    });
    expect(await getSandboxSummary()).toEqual({
      businessId: "biz_afrikart_001",
      activeSecretKey: "sk_demo_presenter_one",
      activePublicKey: "pk_demo_presenter_one",
      rotatedAt: credentials.rotatedAt,
    });
  });

  it("resets mutable sandbox state without reverting the active demo credentials", async () => {
    await rotateDemoCredentials({
      secretKey: "sk_demo_presenter_two",
      publicKey: "pk_demo_presenter_two",
    });

    store.payments.set("pay_runtime_reset", {
      id: "txn_runtime_reset",
      reference: "pay_runtime_reset",
      amount: 5000,
      currency: "NGN",
      fee: 75,
      vat: 5.63,
      feeBearer: "business",
      metadata: {},
      customer: {
        name: "Runtime Test",
        email: "runtime@example.com",
      },
      redirectUrl: null,
      status: "pending",
      paymentDestination: "checkout",
      virtualAccount: {
        bankName: "Globus Bank",
        accountName: "Afrikart Demo Business",
        accountNumber: "1234567890",
        bankCode: "103",
        expiresAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const ngnWallet = store.wallets.find((wallet) => wallet.currency === "NGN");
    if (!ngnWallet) throw new Error("Missing NGN wallet");
    ngnWallet.balance = 1;
    ngnWallet.availableBalance = 2;

    const nextStore = await resetSandboxState();

    expect(nextStore.payments.size).toBe(0);
    expect(store.payments.size).toBe(0);
    expect(store.wallets.find((wallet) => wallet.currency === "NGN")).toEqual({
      currency: "NGN",
      balance: 150_000_000,
      availableBalance: 145_000_000,
    });
    const credentials = await getDemoCredentials();
    expect(credentials.secretKey).toBe("sk_demo_presenter_two");
    expect(credentials.publicKey).toBe("pk_demo_presenter_two");
  });

  it("cancels scheduled sandbox tasks when the sandbox is reset", async () => {
    let fired = false;

    scheduleSandboxTask(() => {
      fired = true;
    }, 20);

    await resetSandboxState();

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fired).toBe(false);
  });

  it("runs scheduled sandbox tasks if they are not cleared", async () => {
    let fired = false;

    scheduleSandboxTask(() => {
      fired = true;
    }, 5);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fired).toBe(true);
  });
});
