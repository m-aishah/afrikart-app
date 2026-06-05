/**
 * Database schema for AfriKart payment service.
 *
 * Design decisions:
 * - SQLite chosen for zero-dependency local dev; schema is portable to Postgres
 * - Separate idempotency_keys table (not inline on payouts) so it works across
 *   any future resource type and survives process restarts
 * - processed_webhook_events is a write-once dedup table; we never update it,
 *   only INSERT OR IGNORE, which gives us cheap at-least-once idempotency
 * - transaction_events is the operator timeline — append-only audit log
 */

export const SCHEMA_SQL = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Core order/payment record (our internal view of a Fincra payment)
CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,              -- our internal order id
  checkout_ref   TEXT NOT NULL UNIQUE,          -- fincra checkout.reference / payment.reference
  payment_id     TEXT,                          -- fincra payment.id (set after checkout created)
  amount         INTEGER NOT NULL,              -- in lowest denomination (kobo, pesewas, etc.)
  currency       TEXT NOT NULL DEFAULT 'NGN',
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  metadata       TEXT NOT NULL DEFAULT '{}',    -- JSON blob
  status         TEXT NOT NULL DEFAULT 'initiated',
  -- status: initiated | pending | settled | failed | charged_back
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Payout records linked to orders
CREATE TABLE IF NOT EXISTS payouts (
  id                  TEXT PRIMARY KEY,         -- our internal payout id
  order_id            TEXT NOT NULL REFERENCES orders(id),
  internal_ref        TEXT NOT NULL UNIQUE,     -- our stable reference (idempotency anchor)
  provider_ref        TEXT,                     -- fincra payout.id (set after API call)
  customer_ref        TEXT,                     -- fincra customerReference
  amount              INTEGER NOT NULL,
  source_currency     TEXT NOT NULL DEFAULT 'NGN',
  destination_currency TEXT NOT NULL DEFAULT 'NGN',
  recipient_name      TEXT NOT NULL,
  recipient_account   TEXT NOT NULL,
  recipient_bank_code TEXT NOT NULL,
  quote_reference     TEXT,                     -- populated for cross-currency payouts
  status              TEXT NOT NULL DEFAULT 'pending',
  -- status: pending | submitted | processing | successful | failed | cancelled
  failure_reason      TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Idempotency store — covers both payouts and any future resource
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key          TEXT PRIMARY KEY,
  resource     TEXT NOT NULL,   -- 'payout'
  resource_id  TEXT NOT NULL,   -- our internal id
  response     TEXT NOT NULL,   -- JSON snapshot of the response at creation time
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Webhook event dedup — write-once, INSERT OR IGNORE
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id    TEXT PRIMARY KEY,              -- fincra evt_xxx id
  event_type  TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Operator timeline — append-only audit log per order
CREATE TABLE IF NOT EXISTS transaction_events (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  event_type  TEXT NOT NULL,
  -- event_type: checkout.initiated | collection.received | collection.failed |
  --             payout.initiated | payout.submitted | payout.processing |
  --             payout.successful | payout.failed | webhook.duplicate |
  --             chargeback.created | quote.expired | account.verify.failed
  actor       TEXT NOT NULL DEFAULT 'system',  -- 'system' | 'operator' | 'customer'
  detail      TEXT NOT NULL DEFAULT '{}',      -- JSON blob
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Chargebacks
CREATE TABLE IF NOT EXISTS chargebacks (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id),
  provider_id      TEXT,                        -- fincra cb_xxx id
  payment_ref      TEXT NOT NULL,
  amount           INTEGER NOT NULL,
  currency         TEXT NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',
  deadline         TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_checkout_ref ON orders(checkout_ref);
CREATE INDEX IF NOT EXISTS idx_payouts_order_id    ON payouts(order_id);
CREATE INDEX IF NOT EXISTS idx_payouts_internal_ref ON payouts(internal_ref);
CREATE INDEX IF NOT EXISTS idx_tx_events_order_id  ON transaction_events(order_id);
CREATE INDEX IF NOT EXISTS idx_chargebacks_order   ON chargebacks(order_id);
`;
