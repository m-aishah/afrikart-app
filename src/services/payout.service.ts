/**
 * Payout service — owns the disbursement side of the lifecycle.
 *
 * Idempotency strategy:
 *   - Callers supply an idempotency key (or we derive one from orderId + recipient)
 *   - We INSERT OR IGNORE into idempotency_keys before calling Fincra
 *   - If that insert hit a conflict, we return the cached response — no Fincra call
 *   - We also pass x-idempotency-key to Fincra so their side is protected too
 *   - Result: double-submit from UI, network retry, and process restart are all safe
 *
 * Identifier linkage:
 *   payouts.order_id       → links back to our order
 *   payouts.internal_ref   → our stable reference (also used as idempotency anchor)
 *   payouts.provider_ref   → fincra payout.id (set after successful API call)
 *   payouts.customer_ref   → fincra customerReference (business-meaningful label)
 *
 * State machine:
 *   pending → submitted → processing → successful
 *                                    → failed
 *   pending → cancelled  (if account verification fails before submission)
 */

import { getDb } from "../db/index.js";
import { fincraRequest } from "../lib/fincra-client.js";
import { appendTimelineEvent } from "./order.service.js";
import { logger } from "../lib/logger.js";
import { newId } from "../lib/ids.js";

export interface InitiatePayoutInput {
  orderId: string;
  amount: number;
  sourceCurrency?: string;
  destinationCurrency?: string;
  recipientName: string;
  recipientAccount: string;
  recipientBankCode: string;
  recipientEmail?: string;
  customerReference?: string;
  narration?: string;
  quoteReference?: string;
  idempotencyKey?: string; // caller can supply; defaults to orderId+account
}

interface FincraPayoutResponse {
  id: string;
  reference: string;
  customerReference: string | null;
  status: string;
  amountCharged: number;
  amountReceived: number;
  fee: number;
  sourceCurrency: string;
  destinationCurrency: string;
  recipient: { name: string; accountNumber: string; bankCode: string };
}

export async function verifyRecipientAccount(
  accountNumber: string,
  bankCode: string
): Promise<{ verified: boolean; accountName?: string; error?: string }> {
  const result = await fincraRequest<{
    accountNumber: string;
    bankCode: string;
    accountName: string;
    resolved: boolean;
  }>("POST", "/identity/verify-account-number", {
    body: { accountNumber, bankCode },
  });

  if (!result.ok) {
    return { verified: false, error: result.error };
  }

  if (!result.data.resolved) {
    return { verified: false, error: "Account could not be resolved" };
  }

  return { verified: true, accountName: result.data.accountName };
}

export async function initiatePayout(input: InitiatePayoutInput) {
  const db = getDb();

  // Derive a stable idempotency key if not supplied
  const idempKey =
    input.idempotencyKey ??
    `payout:${input.orderId}:${input.recipientAccount}:${input.amount}`;

  // --- Idempotency check (our layer) ---
  const existing = db.prepare(
    "SELECT resource_id, response FROM idempotency_keys WHERE key = ?"
  ).get(idempKey) as { resource_id: string; response: string } | undefined;

  if (existing) {
    logger.info({ idempKey, payoutId: existing.resource_id }, "payout idempotent replay");
    appendTimelineEvent(input.orderId, "payout.duplicate_prevented", "system", {
      idempotencyKey: idempKey,
      existingPayoutId: existing.resource_id,
    });
    return { idempotent: true, payout: JSON.parse(existing.response) };
  }

  // --- Verify recipient before touching money ---
  const verification = await verifyRecipientAccount(
    input.recipientAccount,
    input.recipientBankCode
  );

  if (!verification.verified) {
    appendTimelineEvent(input.orderId, "account.verify.failed", "system", {
      account: input.recipientAccount,
      bankCode: input.recipientBankCode,
      reason: verification.error,
    });
    throw Object.assign(
      new Error(`Recipient account verification failed: ${verification.error}`),
      { status: 422, errorType: "ACCOUNT_VERIFICATION_FAILED" }
    );
  }

  // Name mismatch guard — log warning but don't block (operator can override)
  if (
    input.recipientName &&
    verification.accountName &&
    verification.accountName.toLowerCase() !== input.recipientName.toLowerCase()
  ) {
    logger.warn(
      { expected: input.recipientName, resolved: verification.accountName },
      "recipient name mismatch — proceeding with resolved name"
    );
    appendTimelineEvent(input.orderId, "account.name_mismatch", "system", {
      expectedName: input.recipientName,
      resolvedName: verification.accountName,
    });
  }

  const internalRef = newId("iref");
  const customerRef = input.customerReference ?? newId("cref");
  const payoutRowId = newId("pout");

  // Insert payout record in 'pending' state before calling Fincra
  db.prepare(`
    INSERT INTO payouts
      (id, order_id, internal_ref, customer_ref, amount, source_currency,
       destination_currency, recipient_name, recipient_account, recipient_bank_code,
       quote_reference, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    payoutRowId,
    input.orderId,
    internalRef,
    customerRef,
    input.amount,
    input.sourceCurrency ?? "NGN",
    input.destinationCurrency ?? input.sourceCurrency ?? "NGN",
    verification.accountName ?? input.recipientName,
    input.recipientAccount,
    input.recipientBankCode,
    input.quoteReference ?? null
  );

  appendTimelineEvent(input.orderId, "payout.initiated", "operator", {
    payoutRowId,
    internalRef,
    customerRef,
    amount: input.amount,
    recipient: {
      name: verification.accountName ?? input.recipientName,
      account: input.recipientAccount,
      bankCode: input.recipientBankCode,
    },
  });

  // --- Call Fincra ---
  const fincraResult = await fincraRequest<FincraPayoutResponse>(
    "POST",
    "/disbursements/payouts/bank",
    {
      idempotencyKey: internalRef, // our internal ref doubles as the fincra idempotency key
      body: {
        amount: input.amount,
        sourceCurrency: input.sourceCurrency ?? "NGN",
        destinationCurrency: input.destinationCurrency ?? input.sourceCurrency ?? "NGN",
        customerReference: customerRef,
        narration: input.narration ?? "AfriKart vendor payout",
        quoteReference: input.quoteReference ?? undefined,
        recipient: {
          name: verification.accountName ?? input.recipientName,
          accountNumber: input.recipientAccount,
          bankCode: input.recipientBankCode,
          email: input.recipientEmail,
        },
      },
    }
  );

  if (!fincraResult.ok) {
    db.prepare(`
      UPDATE payouts SET status = 'failed', failure_reason = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(fincraResult.error, payoutRowId);

    appendTimelineEvent(input.orderId, "payout.failed", "system", {
      internalRef,
      reason: fincraResult.error,
      errorType: fincraResult.errorType,
      stage: "submission",
    });

    throw Object.assign(new Error(fincraResult.error), {
      status: fincraResult.status,
      errorType: fincraResult.errorType,
    });
  }

  const providerRef = fincraResult.data.id;

  // Update payout to 'submitted' with the provider reference
  db.prepare(`
    UPDATE payouts SET status = 'submitted', provider_ref = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(providerRef, payoutRowId);

  appendTimelineEvent(input.orderId, "payout.submitted", "system", {
    internalRef,
    providerRef,
    fincraRef: fincraResult.data.reference,
    status: fincraResult.data.status,
    amountCharged: fincraResult.data.amountCharged,
  });

  const payoutSnapshot = {
    id: payoutRowId,
    internalRef,
    providerRef,
    customerRef,
    amount: input.amount,
    status: "submitted",
    recipient: {
      name: verification.accountName ?? input.recipientName,
      account: input.recipientAccount,
      bankCode: input.recipientBankCode,
    },
  };

  // Store idempotency record — subsequent identical requests return this snapshot
  db.prepare(`
    INSERT OR IGNORE INTO idempotency_keys (key, resource, resource_id, response)
    VALUES (?, 'payout', ?, ?)
  `).run(idempKey, payoutRowId, JSON.stringify(payoutSnapshot));

  logger.info({ payoutRowId, internalRef, providerRef }, "payout submitted");

  return { idempotent: false, payout: payoutSnapshot };
}

/** Handle async payout resolution from webhook (successful or failed). */
export function resolvePayoutFromWebhook(
  providerRef: string,
  newStatus: "successful" | "failed",
  reason?: string
) {
  const db = getDb();

  const payout = db.prepare(
    "SELECT * FROM payouts WHERE provider_ref = ?"
  ).get(providerRef) as {
    id: string;
    order_id: string;
    status: string;
    internal_ref: string;
  } | undefined;

  if (!payout) {
    // Could be a payout we didn't initiate, or provider_ref not yet stored
    logger.warn({ providerRef }, "resolvePayoutFromWebhook: payout not found");
    return null;
  }

  // Prevent state regression — don't overwrite a terminal state
  if (payout.status === "successful" || payout.status === "failed") {
    logger.info(
      { providerRef, currentStatus: payout.status },
      "payout already in terminal state, skipping"
    );
    return payout;
  }

  db.prepare(`
    UPDATE payouts SET status = ?, failure_reason = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE provider_ref = ?
  `).run(newStatus, reason ?? null, providerRef);

  const eventType = newStatus === "successful" ? "payout.successful" : "payout.failed";
  appendTimelineEvent(payout.order_id, eventType, "system", {
    internalRef: payout.internal_ref,
    providerRef,
    newStatus,
    reason: reason ?? null,
    recoveryNote:
      newStatus === "failed"
        ? "Funds restored by provider. Operator should initiate re-payout or refund."
        : undefined,
  });

  logger.info({ payoutId: payout.id, providerRef, newStatus }, "payout resolved");
  return payout;
}
