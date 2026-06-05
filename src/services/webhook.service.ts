/**
 * Webhook handler service.
 *
 * Duplicate delivery handling:
 *   Fincra can deliver the same event multiple times (network retries, replay).
 *   We INSERT OR IGNORE into processed_webhook_events keyed by event.id.
 *   If the insert finds an existing row, we return early with {duplicate: true}.
 *   This means any side effects (credit, state change) happen exactly once.
 *
 * Security:
 *   Signature is verified before this service is called (done in the route middleware).
 *   We reject unsigned or incorrectly signed payloads at the HTTP layer.
 */

import { getDb } from "../db/index.js";
import { logger } from "../lib/logger.js";
import {
  getOrderByRef,
  settleOrder,
  failCollection,
  applyChargeback,
} from "./order.service.js";
import { resolvePayoutFromWebhook } from "./payout.service.js";

export interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
}

export interface WebhookHandleResult {
  accepted: boolean;
  duplicate: boolean;
  eventType: string;
  eventId?: string;
}

export async function handleWebhook(
  eventId: string,
  payload: WebhookPayload
): Promise<WebhookHandleResult> {
  const db = getDb();
  const { event: eventType, data } = payload;

  // --- Dedup check ---
  // INSERT OR IGNORE: if eventId already exists, the insert is a no-op
  const insertResult = db.prepare(`
    INSERT OR IGNORE INTO processed_webhook_events (event_id, event_type)
    VALUES (?, ?)
  `).run(eventId, eventType);

  if (insertResult.changes === 0) {
    // Row already existed — this is a duplicate delivery
    logger.warn({ eventId, eventType }, "duplicate webhook event ignored");
    return { accepted: true, duplicate: true, eventType, eventId };
  }

  logger.info({ eventId, eventType }, "processing webhook event");

  try {
    await routeWebhookEvent(eventType, data);
  } catch (err) {
    logger.error({ eventId, eventType, err }, "webhook handler threw — event was deduplicated but processing failed");
    // We still return accepted:true because we don't want Fincra to retry —
    // the event is recorded and can be replayed manually via /simulate/webhooks/replay
    return { accepted: true, duplicate: false, eventType, eventId };
  }

  return { accepted: true, duplicate: false, eventType, eventId };
}

async function routeWebhookEvent(
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  switch (eventType) {
    case "collection.successful": {
      const ref = String(data["reference"] ?? "");
      const amountReceived = Number(data["amountReceived"] ?? 0);
      const channel = String(data["paymentSource"] ?? "bank_transfer");
      if (ref) settleOrder(ref, amountReceived, channel);
      break;
    }

    case "collection.failed": {
      const ref = String(data["reference"] ?? "");
      if (ref) failCollection(ref, "Collection failed per Fincra webhook");
      break;
    }

    case "charge.successful": {
      // Card checkout completion
      const ref = String(data["reference"] ?? "");
      const amountReceived = Number(data["amountReceived"] ?? data["amount"] ?? 0);
      if (ref) settleOrder(ref, amountReceived, "card");
      break;
    }

    case "charge.failed": {
      const ref = String(data["reference"] ?? "");
      if (ref) failCollection(ref, "Charge failed per Fincra webhook");
      break;
    }

    case "payout.successful": {
      const providerRef = String(data["id"] ?? "");
      if (providerRef) resolvePayoutFromWebhook(providerRef, "successful");
      break;
    }

    case "payout.failed": {
      const providerRef = String(data["id"] ?? "");
      const reason = String(data["reason"] ?? "Payout failed");
      if (providerRef) resolvePayoutFromWebhook(providerRef, "failed", reason);
      break;
    }

    case "chargeback.created": {
      const paymentRef = String(data["paymentReference"] ?? "");
      if (!paymentRef) break;

      const order = getOrderByRef(paymentRef);
      if (!order) {
        logger.warn({ paymentRef }, "chargeback webhook: order not found for ref");
        break;
      }

      applyChargeback(order.id, {
        id: String(data["id"] ?? ""),
        amount: Number(data["amount"] ?? 0),
        currency: String(data["currency"] ?? "NGN"),
        reason: String(data["reason"] ?? ""),
        deadline: String(data["deadline"] ?? ""),
        paymentReference: paymentRef,
        paymentId: String(data["paymentId"] ?? ""),
      });
      break;
    }

    case "virtualaccount.approved":
    case "conversion.successful":
      // Log only — not primary domain events for this submission
      logger.info({ eventType }, "webhook received — no action required");
      break;

    default:
      logger.warn({ eventType }, "unhandled webhook event type");
  }
}
