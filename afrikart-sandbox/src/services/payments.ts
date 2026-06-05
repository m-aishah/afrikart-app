import { FEE_CONFIG } from "../config";
import { addBalanceLog, walletForCurrency } from "./ledger";
import type { Payment, Store } from "../types";
import { nowIso, roundToCents } from "../utils";

export function calculateCheckoutCharges(amount: number): {
  fee: number;
  vat: number;
} {
  const fee = roundToCents(amount * FEE_CONFIG.checkoutRate);
  const vat = roundToCents(fee * FEE_CONFIG.vatRate);
  return { fee, vat };
}

export function calculateCollectionNetAmount(payment: {
  amount: number;
  fee: number;
  vat: number;
  feeBearer: string;
}): number {
  return payment.feeBearer === "business"
    ? payment.amount - payment.fee - payment.vat
    : payment.amount;
}

export function creditWalletForPayment(
  store: Store,
  payment: Payment,
  description: string,
): number | null {
  const wallet = walletForCurrency(store, payment.currency);
  if (!wallet) return null;

  const net = calculateCollectionNetAmount(payment);
  wallet.balance += net;
  wallet.availableBalance += net;
  addBalanceLog(
    store,
    payment.currency,
    "credit",
    net,
    payment.reference,
    description,
  );
  return net;
}

interface PaymentOutcomeInput {
  status: string;
  channel: string;
  amountReceived?: number;
  successDescription: string;
}

export function applyPaymentOutcome(
  store: Store,
  payment: Payment,
  outcome: PaymentOutcomeInput,
): { creditedAmount: number | null; wasAlreadySuccessful: boolean } {
  const wasAlreadySuccessful = payment.status === "successful";

  payment.status = outcome.status;
  payment.channel = outcome.channel;
  if (typeof outcome.amountReceived === "number") {
    payment.amountReceived = outcome.amountReceived;
  }
  payment.updatedAt = nowIso();

  if (outcome.status !== "successful" || wasAlreadySuccessful) {
    return { creditedAmount: null, wasAlreadySuccessful };
  }

  return {
    creditedAmount: creditWalletForPayment(
      store,
      payment,
      outcome.successDescription,
    ),
    wasAlreadySuccessful,
  };
}
