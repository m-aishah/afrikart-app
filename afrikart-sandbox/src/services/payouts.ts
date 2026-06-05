import type { ContentfulStatusCode } from "hono/utils/http-status";

import { FEE_CONFIG, type RuntimeConfig, localRuntimeConfig } from "../config";
import type { SandboxBackend } from "../backend/types";
import { exchangeRates, isExchangeRatePair } from "../store";
import type { Payout, Recipient, Store, Wallet } from "../types";
import {
  asOptionalString,
  asRecord,
  asRequiredString,
  createReference,
  nowIso,
  roundToCents,
  toNumber,
} from "../utils";
import { addBalanceLog } from "./ledger";

export interface ParsedPayoutRequest {
  amount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  customerReference: string | null;
  narration: string;
  recipient: Recipient;
  quoteReference: string | null;
}

export interface PayoutAmounts {
  fee: number;
  totalDebit: number;
  rate: number;
  amountReceived: number;
}

export interface PayoutRouteError {
  status: ContentfulStatusCode;
  body: {
    success: false;
    error: string;
    errorType?: string;
  };
}

export function parsePayoutRequest(body: unknown): ParsedPayoutRequest {
  const data = asRecord(body);
  const recipientInput = asRecord(data.recipient);

  return {
    amount: toNumber(data.amount),
    sourceCurrency:
      asOptionalString(data.sourceCurrency)?.toUpperCase() ?? "NGN",
    destinationCurrency:
      asOptionalString(data.destinationCurrency)?.toUpperCase() ??
      asOptionalString(data.sourceCurrency)?.toUpperCase() ??
      "NGN",
    customerReference: asOptionalString(data.customerReference) ?? null,
    narration: asOptionalString(data.narration) ?? "Afrikart payout",
    recipient: {
      ...recipientInput,
      name: asRequiredString(recipientInput.name),
      accountNumber: asRequiredString(recipientInput.accountNumber),
      bankCode: asRequiredString(recipientInput.bankCode),
      email: asOptionalString(recipientInput.email),
    },
    quoteReference: asOptionalString(data.quoteReference) ?? null,
  };
}

export function validatePayoutRequest(
  request: ParsedPayoutRequest,
): PayoutRouteError | null {
  if (!Number.isFinite(request.amount) || request.amount <= 0) {
    return {
      status: 400,
      body: {
        success: false,
        error: "amount must be greater than zero",
      },
    };
  }

  if (
    !request.recipient.name ||
    !request.recipient.accountNumber ||
    !request.recipient.bankCode
  ) {
    return {
      status: 400,
      body: {
        success: false,
        error:
          "recipient.name, recipient.accountNumber and recipient.bankCode are required",
      },
    };
  }

  if (
    request.sourceCurrency !== request.destinationCurrency &&
    !request.quoteReference
  ) {
    return {
      status: 400,
      body: {
        success: false,
        error: "quoteReference is required for cross-currency payouts",
      },
    };
  }

  return null;
}

export function calculatePayoutAmounts(
  sourceCurrency: string,
  destinationCurrency: string,
  amount: number,
): PayoutAmounts {
  const fee =
    sourceCurrency === destinationCurrency
      ? FEE_CONFIG.localPayoutFlatFee
      : roundToCents(amount * FEE_CONFIG.crossCurrencyPayoutRate);
  const pair = `${sourceCurrency}-${destinationCurrency}`;
  const rate =
    sourceCurrency === destinationCurrency
      ? 1
      : isExchangeRatePair(pair)
        ? exchangeRates[pair]
        : 1;
  const amountReceived =
    sourceCurrency === destinationCurrency
      ? amount
      : roundToCents(amount * rate);

  return {
    fee,
    totalDebit: amount + fee,
    rate,
    amountReceived,
  };
}

export function reservePayoutFunds(
  wallet: Wallet,
  totalDebit: number,
): boolean {
  if (wallet.availableBalance < totalDebit) {
    return false;
  }

  wallet.availableBalance -= totalDebit;
  wallet.balance -= totalDebit;
  return true;
}

export function createPayout(
  request: ParsedPayoutRequest,
  amounts: PayoutAmounts,
): Payout {
  const timestamp = nowIso();
  const reference = createReference("payout");

  return {
    id: createReference("po"),
    reference,
    customerReference: request.customerReference,
    amountCharged: amounts.totalDebit,
    amountReceived: amounts.amountReceived,
    sourceCurrency: request.sourceCurrency,
    destinationCurrency: request.destinationCurrency,
    fee: amounts.fee,
    rate: amounts.rate,
    narration: request.narration,
    paymentScheme: "instant",
    paymentDestination: "bank_account",
    recipient: request.recipient,
    status: "processing",
    reason: "Payout initiated",
    quoteReference: request.quoteReference,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function recordPayoutCreation(store: Store, payout: Payout): void {
  addBalanceLog(
    store,
    payout.sourceCurrency,
    "debit",
    payout.amountCharged,
    payout.reference,
    `Payout to ${payout.recipient.name}`,
  );
}

export function getPayoutResolutionProfile(
  accountNumber: string,
  config: Pick<RuntimeConfig, "payoutDelayMs" | "slowPayoutDelayMs"> = localRuntimeConfig,
): {
  shouldFail: boolean;
  delayMs: number;
} {
  const shouldFail = accountNumber.endsWith("9");
  const isSlow = accountNumber.endsWith("7");

  return {
    shouldFail,
    delayMs: isSlow ? config.slowPayoutDelayMs : config.payoutDelayMs,
  };
}

export async function schedulePayoutResolution(
  backend: SandboxBackend,
  payout: Payout,
): Promise<void> {
  const { delayMs } = getPayoutResolutionProfile(
    payout.recipient.accountNumber,
    backend.getConfig(),
  );
  await backend.scheduleJob({
    id: createReference("job"),
    type: "resolvePayout",
    runAt: Date.now() + delayMs,
    payoutReference: payout.reference,
  });
}
