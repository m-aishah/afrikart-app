/**
 * Order service — owns the collection side of the payment lifecycle.
 *
 * Identifier linkage:
 *   orders.id           → our stable internal order id
 *   orders.checkout_ref → fincra checkout.reference / payment.reference
 *   orders.payment_id   → fincra payment.id (txn_xxx)
 *
 * These three are the join keys between our DB and fincra's event payloads.
 */

import { getDb } from "../db/index.js";
import { fincraRequest } from "../lib/fincra-client.js";
import { logger } from "../lib/logger.js";
import { newId } from "../lib/ids.js";

export interface CreateOrderInput {
  amount: number;
  currency?: string;
  customerName: string;
  customerEmail: string;
  metadata?: Record<string, unknown>;
  reference?: string; // caller-supplied; generated if omitted
}

export interface OrderRow {
  id: string;
  checkout_ref: string;
  payment_id: string | null;
  amount: number;
  currency: string;
  customer_name: string;
  customer_email: string;
  metadata: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Initiate checkout with Fincra and persist our order record. */
export async function createOrder(input: CreateOrderInput) {
  const db = getDb();
  const orderId = newId("ord");
  const reference = input.reference ?? newId("ref");

  // Call Fincra checkout initiation
  const result = await fincraRequest<{
    reference: string;
    checkoutUrl: string;
    payment: { id: string };
  }>("POST", "/checkout/initiate", {
    authType: "public",
    body: {
      amount: input.amount,
      currency: input.currency ?? "NGN",
      reference,
      customer: { name: input.customerName, email: input.customerEmail },
      metadata: input.metadata ?? {},
    },
  });

  if (!result.ok) {
    logger.warn({ reference, error: result.error }, "checkout.initiate failed");
    throw Object.assign(new Error(result.error), { status: result.status, errorType: result.errorType });
  }

  const fincraRef = result.data.reference;
  const paymentId = result.data.payment?.id ?? null;

  db.prepare(`
    INSERT INTO orders (id, checkout_ref, payment_id, amount, currency, customer_name, customer_email, metadata, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'initiated')
  `).run(
    orderId,
    fincraRef,
    paymentId,
    input.amount,
    input.currency ?? "NGN",
    input.customerName,
    input.customerEmail,
    JSON.stringify(input.metadata ?? {})
  );

  appendTimelineEvent(orderId, "checkout.initiated", "customer", {
    checkoutRef: fincraRef,
    paymentId,
    checkoutUrl: result.data.checkoutUrl,
    amount: input.amount,
    currency: input.currency ?? "NGN",
  });

  logger.info({ orderId, fincraRef, paymentId }, "order created");

  return { orderId, reference: fincraRef, checkoutUrl: result.data.checkoutUrl };
}

/** Mark an order as settled following a collection webhook. */
export function settleOrder(checkoutRef: string, amountReceived: number, channel: string) {
  const db = getDb();
  const order = db.prepare(
    "SELECT * FROM orders WHERE checkout_ref = ?"
  ).get(checkoutRef) as OrderRow | undefined;

  if (!order) {
    logger.warn({ checkoutRef }, "settleOrder: order not found");
    return null;
  }

  db.prepare(`
    UPDATE orders SET status = 'settled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE checkout_ref = ?
  `).run(checkoutRef);

  appendTimelineEvent(order.id, "collection.received", "system", {
    checkoutRef,
    amountReceived,
    channel,
    previousStatus: order.status,
  });

  logger.info({ orderId: order.id, checkoutRef, amountReceived }, "order settled");
  return order;
}

/** Mark an order collection as failed. */
export function failCollection(checkoutRef: string, reason: string) {
  const db = getDb();
  const order = db.prepare(
    "SELECT * FROM orders WHERE checkout_ref = ?"
  ).get(checkoutRef) as OrderRow | undefined;

  if (!order) return null;

  db.prepare(`
    UPDATE orders SET status = 'failed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE checkout_ref = ?
  `).run(checkoutRef);

  appendTimelineEvent(order.id, "collection.failed", "system", { checkoutRef, reason });
  return order;
}

/** Apply a chargeback to an order. */
export function applyChargeback(
  orderId: string,
  chargebackData: {
    id: string;
    amount: number;
    currency: string;
    reason: string;
    deadline: string;
    paymentReference: string;
    paymentId: string;
  }
) {
  const db = getDb();

  db.prepare(`
    INSERT OR IGNORE INTO chargebacks
      (id, order_id, provider_id, payment_ref, amount, currency, reason, status, deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(
    newId("cb"),
    orderId,
    chargebackData.id,
    chargebackData.paymentReference,
    chargebackData.amount,
    chargebackData.currency,
    chargebackData.reason,
    chargebackData.deadline
  );

  db.prepare(`
    UPDATE orders SET status = 'charged_back', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(orderId);

  appendTimelineEvent(orderId, "chargeback.created", "system", {
    chargebackId: chargebackData.id,
    amount: chargebackData.amount,
    reason: chargebackData.reason,
    deadline: chargebackData.deadline,
    balanceImpact: `Wallet debited ${chargebackData.amount} ${chargebackData.currency}`,
  });

  logger.warn({ orderId, chargebackData }, "chargeback applied to order");
}

export function getOrderByRef(checkoutRef: string): OrderRow | undefined {
  return getDb().prepare(
    "SELECT * FROM orders WHERE checkout_ref = ?"
  ).get(checkoutRef) as OrderRow | undefined;
}

export function getOrderById(orderId: string): OrderRow | undefined {
  return getDb().prepare(
    "SELECT * FROM orders WHERE id = ?"
  ).get(orderId) as OrderRow | undefined;
}

/** Append a structured event to the operator timeline. */
export function appendTimelineEvent(
  orderId: string,
  eventType: string,
  actor: "system" | "operator" | "customer",
  detail: Record<string, unknown>
) {
  getDb().prepare(`
    INSERT INTO transaction_events (id, order_id, event_type, actor, detail)
    VALUES (?, ?, ?, ?, ?)
  `).run(newId("tev"), orderId, eventType, actor, JSON.stringify(detail));
}

/** Return the full timeline for an order — the operator view. */
export interface TimelineEvent {
  id: string;
  order_id: string;
  event_type: string;
  actor: string;
  detail: string;
  created_at: string;
}

export function getOrderTimeline(orderId: string) {
  const db = getDb();
  const order = db.prepare(
    "SELECT * FROM orders WHERE id = ?"
  ).get(orderId) as OrderRow | undefined;

  if (!order) return null;

  const events = db.prepare(
    "SELECT * FROM transaction_events WHERE order_id = ? ORDER BY created_at ASC"
  ).all(orderId) as unknown as TimelineEvent[];

  const payouts = db.prepare(
    "SELECT * FROM payouts WHERE order_id = ? ORDER BY created_at ASC"
  ).all(orderId);

  const chargebacks = db.prepare(
    "SELECT * FROM chargebacks WHERE order_id = ? ORDER BY created_at ASC"
  ).all(orderId);

  return {
    order: {
      ...order,
      metadata: JSON.parse(order.metadata),
    },
    timeline: events.map((e) => ({
      ...e,
      detail: JSON.parse(e.detail),
    })),
    payouts,
    chargebacks,
  };
}
