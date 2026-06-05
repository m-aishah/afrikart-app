# AfriKart Payment Service

**Role:** Senior Product Engineer  
**Track:** Product Engineer  
**Candidate:** Aishah Mabayoje

A backend payment service built on top of the Fincra sandbox API. It handles the full collection-to-payout lifecycle for AfriKart — an African commerce platform — including webhook processing, idempotency, operator traceability, and failure recovery.

---

## What This Service Does

AfriKart needs to:

1. Collect payments from customers
2. Receive async confirmation from Fincra via webhooks
3. Pay vendors their share of the money
4. Give operations teams a clear picture of what happened to any transaction

This service handles all of that. It sits between AfriKart's business logic and the Fincra API, managing state, preventing duplicate processing, and maintaining a full audit trail.

---

## Prerequisites

**For local development:**

- Node.js 22+
- Bun 1.3+ (to run the Fincra sandbox)
- npm

**For Docker:**

- Docker and Docker Compose

---

## Running the Service

### Option 1 — Local (recommended)

**Terminal 1 — Start the Fincra sandbox:**

```bash
cd afrikart-sandbox
bun install
WEBHOOK_TARGET_URL=http://localhost:3001/webhooks/fincra bun run start
```

Sandbox runs on `http://localhost:4000`.

**Terminal 2 — Start our service:**

```bash
cp .env.example .env
npm install --ignore-scripts
npm run dev
```

Service runs on `http://localhost:3001`.

**Verify both are running:**

```bash
curl http://localhost:4000/health
curl http://localhost:3001/health
```

---

### Option 2 — Docker (our service only)

The sandbox must be running separately and accessible. Then:

```bash
FINCRA_API_BASE_URL=http://your-sandbox-url docker compose up --build
```

Service runs on `http://localhost:3000`.

---

### Option 3 — Hosted judging sandbox

Point the service at the hosted sandbox URL by updating `.env`:
FINCRA_API_BASE_URL=https://hosted-sandbox-url-from-fincra.com
FINCRA_SECRET_KEY=your-assigned-key
FINCRA_PUBLIC_KEY=your-assigned-public-key
FINCRA_WEBHOOK_SECRET=your-assigned-webhook-secret

Then run:

```bash
npm run dev
```

No code changes needed — everything is configurable via environment variables.

---

## Environment Variables

| Variable                | Required | Default         | Description                                     |
| ----------------------- | -------- | --------------- | ----------------------------------------------- |
| `FINCRA_API_BASE_URL`   | **yes**  | —               | Fincra sandbox base URL                         |
| `FINCRA_SECRET_KEY`     | **yes**  | —               | Fincra secret key (`api-key` header)            |
| `FINCRA_PUBLIC_KEY`     | **yes**  | —               | Fincra public key (`x-pub-key` header)          |
| `FINCRA_WEBHOOK_SECRET` | **yes**  | —               | Used to verify `x-fincra-signature` HMAC-SHA512 |
| `PORT`                  | no       | `3001`          | HTTP port our service listens on                |
| `DATABASE_PATH`         | no       | `./afrikart.db` | SQLite database file path                       |
| `LOG_LEVEL`             | no       | `info`          | `trace` / `debug` / `info` / `warn` / `error`   |
| `NODE_ENV`              | no       | `development`   | Environment name                                |

---

## Running Tests

```bash
npm test
```

29 tests across 2 files covering:

- HMAC-SHA512 webhook signature verification
- Webhook deduplication including concurrent delivery
- Order state machine transitions
- Operator timeline ordering and content
- Idempotency key store semantics
- Payout state regression guard
- Full HTTP layer integration tests

---

## API Endpoints

| Method | Path                       | Description                                          |
| ------ | -------------------------- | ---------------------------------------------------- |
| `GET`  | `/health`                  | Service and database liveness check                  |
| `POST` | `/orders`                  | Initiate a checkout — creates order and calls Fincra |
| `GET`  | `/orders/:orderId`         | Full order details + operator timeline               |
| `POST` | `/orders/:orderId/payouts` | Initiate a vendor payout for a settled order         |
| `POST` | `/webhooks/fincra`         | Receives all Fincra webhook events                   |

---

## Architecture

┌─────────────────────────────────────────────────────┐
│ AfriKart Payment Service │
│ │
│ POST /orders → Fincra /checkout/initiate │
│ POST /orders/:id/payouts → Fincra /disbursements │
│ POST /webhooks/fincra → verify → dedup → route │
│ GET /orders/:id → full operator timeline │
│ │
│ ┌─────────────────────────────────────────────┐ │
│ │ SQLite (WAL mode) │ │
│ │ orders · payouts · idempotency_keys │ │
│ │ processed_webhook_events │ │
│ │ transaction_events · chargebacks │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘

### Identifier linkage

| Our field              | Fincra field        | Purpose                          |
| ---------------------- | ------------------- | -------------------------------- |
| `orders.checkout_ref`  | `payment.reference` | Join key for collection webhooks |
| `orders.payment_id`    | `payment.id`        | Fincra payment object ID         |
| `payouts.internal_ref` | `x-idempotency-key` | Our anchor for idempotency       |
| `payouts.provider_ref` | `payout.id`         | Join key for payout webhooks     |
| `payouts.customer_ref` | `customerReference` | Business-meaningful payout label |

---

## Failure Handling

| Scenario                                 | How we handle it                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Duplicate webhook delivery               | `INSERT OR IGNORE` on `processed_webhook_events` — first delivery wins, duplicates ignored |
| Payout fails async (account ending in 9) | `payout.failed` webhook updates status, adds recovery note to operator timeline            |
| Slow payout (account ending in 7)        | Status stays `processing` — no unsafe retry until webhook resolves it                      |
| Payout state regression                  | Terminal states (`successful`, `failed`) are never overwritten                             |
| Provider chaos / 503                     | Exponential backoff with jitter, up to 3 retries                                           |
| Double-submit payout                     | Idempotency key table returns cached response — Fincra never called twice                  |
| Chargeback                               | Balance impact recorded, order marked `charged_back`, deadline visible in timeline         |
| FX quote expiry                          | Fincra rejects stale quotes — error surfaced immediately, never silently used              |
| Account verification failure             | Recipient verified before money moves — payout blocked with clear error                    |

---

## Decision Notes

### Decision 1: SQLite over in-memory store

The sandbox itself uses an in-memory store. We chose SQLite in WAL mode because the brief specifically asks about surviving process restarts — if our dedup table is in-memory, a restart means replayed webhooks get processed again. SQLite gives us ACID durability with zero infrastructure. Schema is standard SQL — portable to Postgres by swapping the driver.

**Rejected:** in-memory (loses dedup state on restart), Postgres (adds infrastructure dependency with no benefit at this scale).

### Decision 2: Two-layer idempotency

We enforce idempotency at two layers: our own `idempotency_keys` table (checked before calling Fincra) and Fincra's `x-idempotency-key` header (protects against crashes mid-call). This means a double-submit from the UI returns a cached response instantly, and if we crash after calling Fincra but before saving locally, the next attempt gets the same Fincra response rather than creating a duplicate payout.

**Rejected:** trusting Fincra's idempotency alone (no local record if our DB call fails after a successful Fincra call).

---

## Demo Script

### Happy path

```bash
# 1. Create order
curl -s -X POST http://localhost:3001/orders \
  -H 'Content-Type: application/json' \
  -d '{"amount":25000,"customerName":"Ada Lovelace","customerEmail":"ada@example.com"}' | jq .

# 2. Simulate customer paying (on sandbox)
curl -s -X POST http://localhost:4000/simulate/collections/settle \
  -H 'Content-Type: application/json' \
  -d '{"reference":"<checkout_ref from step 1>"}' | jq .

# 3. Check order settled + timeline
curl -s http://localhost:3001/orders/<orderId> | jq .

# 4. Pay vendor
curl -s -X POST http://localhost:3001/orders/<orderId>/payouts \
  -H 'Content-Type: application/json' \
  -d '{"amount":10000,"recipientName":"Kofi Mensah","recipientAccount":"0001112223","recipientBankCode":"044"}' | jq .

# 5. Check payout.successful in timeline (after ~2s)
curl -s http://localhost:3001/orders/<orderId> | jq '.data.timeline[-1]'
```

### Duplicate webhook

```bash
curl -s -X POST http://localhost:4000/simulate/webhooks/replay/<eventId> \
  -H 'api-key: sk_test_afrikart_secret' | jq .
# Our service returns duplicate:true — order unchanged
```

### Async payout failure

```bash
# Pay to account ending in 9
curl -s -X POST http://localhost:3001/orders/<orderId>/payouts \
  -H 'Content-Type: application/json' \
  -d '{"amount":5000,"recipientName":"Fatima Invalid","recipientAccount":"0000000009","recipientBankCode":"058"}' | jq .
# Check timeline after 2s — shows payout.failed with recoveryNote
```

---

## Known Limitations

- No authentication on our API endpoints — a production service would require operator JWT/API keys
- No job queue for polling unresolved payouts — if a webhook is never delivered, payout stays `submitted` indefinitely
- SQLite write throughput ceiling — high concurrency would need Postgres with advisory locks
- No mobile-money rail — adding it requires a new recipient type and endpoint route; state machine and idempotency layer need no changes
- Chargeback dispute workflow is read-only — we record and display chargebacks but don't support status updates

---

## Assumptions

- Payout is only permitted on settled orders — if collection fails, no payout is initiated
- Recipient name mismatch between intent and bank resolution is logged as a warning but does not block the payout — an operator can review the timeline
- All amounts are in the lowest denomination of the currency (kobo for NGN)
