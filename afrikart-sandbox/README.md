# Afrikart Sandbox

A self-contained take-home sandbox with a mock Fincra-style API server for the
Afrikart integration challenge.

The sandbox runs on `Hono`, `Bun 1.3.10`, and `TypeScript`.

## What's inside

```
├── API.md                        ← Narrative API notes and sandbox behavior
├── HOW.md                        ← How candidates use the sandbox
├── src/
│   └── server.ts                 ← Mock Fincra API server
├── sample-data/
│   └── test-payouts.csv          ← 50 test cases for data-driven testing
├── package.json
├── .env.example
└── README.md                     ← You are here
```

## Prerequisite

Candidates need Bun installed locally to run this project. This starter kit uses
`bun install`, `bun run start`, and `bun test`, so `npm install` / `npm start`
are not supported for this repo.

Install Bun from the official resources:

- [Bun installation guide](https://bun.sh/docs/installation)
- [Bun homepage install instructions](https://bun.sh/)

Verify your install with:

```bash
bun --version
```

## Quick start

```bash
cp .env.example .env
bun install
bun run start
```

The server starts on `http://localhost:4000`.

Machine-readable API contract: [openapi.json](http://localhost:4000/openapi.json) (generated from the Hono route schemas)
Interactive API docs: [docs](http://localhost:4000/docs)
Narrative API notes: [API.md](API.md) (sandbox behavior and implementation notes)
Workflow guide: [HOW.md](HOW.md)

For chaos mode (random 503 errors on ~15% of transactional requests):

```bash
bun run start:chaos
```

Run tests with:

```bash
bun run test
```

## Judging environment

For the take-home, treat this local mock server as a development convenience, not
as the authoritative judging environment.

Recommended setup:

- Candidates build against the API contract in `/openapi.json`, `/docs`, and the
  shared challenge brief.
- Organizers run a hosted canonical sandbox for evaluation.
- Submissions are judged against the hosted sandbox, not against a candidate's
  locally modified copy of this repo.

Important notes for participants:

- Keep the API base URL configurable with an environment variable.
- Do not hardcode `http://localhost:4000` in the submitted solution.
- Modifying the local mock server will not improve your evaluation result and may
  cause your submission to fail when pointed at the hosted sandbox.

## Auth model

The credentials below are local development defaults for this repo only.

They are not the hosted judging credentials.

In the judging environment, organizers assign temporary credentials for the
current presenter, and those hosted credentials may change between demos.

### Secret-key protected endpoints

```http
api-key: sk_test_afrikart_secret
```

### Public-key endpoint

```http
x-pub-key: pk_test_afrikart_public
```


## Example flow

### 1) Create a checkout session

```bash
curl -X POST http://localhost:4000/checkout/initiate \
  -H 'content-type: application/json' \
  -H 'x-pub-key: pk_test_afrikart_public' \
  -d '{
    "amount": 25000,
    "currency": "NGN",
    "reference": "order_1001",
    "feeBearer": "business",
    "customer": {
      "name": "Maya Okafor",
      "email": "maya@example.com"
    },
    "metadata": { "orderId": "1001" }
  }'
```

### 2) Simulate settlement and emit a collection webhook

```bash
curl -X POST http://localhost:4000/simulate/collections/settle \
  -H 'content-type: application/json' \
  -d '{
    "reference": "order_1001",
    "status": "successful",
    "channel": "bank_transfer"
  }'
```

### 3) Verify a bank account

```bash
curl -X POST http://localhost:4000/identity/verify-account-number \
  -H 'content-type: application/json' \
  -H 'api-key: sk_test_afrikart_secret' \
  -d '{
    "accountNumber": "0123456789",
    "bankCode": "058"
  }'
```

### 4) Make a payout

```bash
curl -X POST http://localhost:4000/disbursements/payouts/bank \
  -H 'content-type: application/json' \
  -H 'api-key: sk_test_afrikart_secret' \
  -H 'x-idempotency-key: payout-vendor-settlement-1001' \
  -d '{
    "amount": 10000,
    "sourceCurrency": "NGN",
    "customerReference": "vendor_settlement_1",
    "recipient": {
      "name": "Ada Lovelace",
      "accountNumber": "0123456789",
      "bankCode": "058",
      "email": "ada@example.com"
    }
  }'
```

### 5) Check wallet balances and history

```bash
# Balances
curl http://localhost:4000/wallets \
  -H 'api-key: sk_test_afrikart_secret'

# Balance history (paginated)
curl 'http://localhost:4000/wallets/logs?currency=NGN&page=1&limit=20' \
  -H 'api-key: sk_test_afrikart_secret'
```

### 6) Get an FX quote

```bash
curl -X POST http://localhost:4000/conversions/quotes \
  -H 'content-type: application/json' \
  -H 'api-key: sk_test_afrikart_secret' \
  -d '{
    "sourceCurrency": "NGN",
    "destinationCurrency": "GBP",
    "amount": 500000
  }'
```

### 7) Replay a webhook (for testing duplicate handling)

```bash
# List events
curl http://localhost:4000/events \
  -H 'api-key: sk_test_afrikart_secret'

# Replay a specific event
curl -X POST http://localhost:4000/simulate/webhooks/replay/evt_1234_abcd \
  -H 'api-key: sk_test_afrikart_secret'
```

## Failure simulation

| Trigger | Behaviour |
|---|---|
| Recipient account number ends in `9` | Payout fails asynchronously, balance restored |
| Recipient account number ends in `7` | Payout takes ~15s to resolve (tests timeout handling) |
| `CHAOS_RATE=15` env var | ~15% of transactional requests return 503 |
| Rate limit exceeded (120 req/min) | Returns 429 with retry guidance |

## Pre-loaded test accounts

| Bank Code | Account Number | Name | Currency | Notes |
|---|---|---|---|---|
| 058 | 0123456789 | Ada Lovelace | NGN | Success |
| 044 | 0001112223 | Kofi Mensah | NGN | Success |
| 011 | 2233445566 | Chinwe Obi | NGN | Success |
| 033 | 3344556677 | Emeka Nwosu | NGN | Success |
| 058 | 0000000009 | Fatima Invalid | NGN | Payout fails (ends in 9) |
| 044 | 1111111117 | Chidi Timeout | NGN | Payout slow (ends in 7) |
| GH001 | 1002003004 | Akosua Boateng | GHS | Success |
| KE001 | 5556667778 | Amina Wanjiku | KES | Success |

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Health check |
| GET | `/profile/business` | secret | Business profile |
| GET | `/wallets` | secret | List multi-currency balances |
| GET | `/wallets/logs` | secret | Balance history (paginated, filterable) |
| POST | `/wallets/topup` | secret | Fund test balance |
| GET | `/banks` | secret | List supported banks |
| POST | `/identity/verify-account-number` | secret | Resolve bank account |
| POST | `/identity/resolve-bvn` | secret | Resolve BVN |
| POST | `/profile/virtual-accounts/requests` | secret | Create virtual account |
| GET | `/profile/virtual-accounts/:virtualAccountId` | secret | Fetch virtual account |
| GET | `/profile/virtual-accounts` | secret | List virtual accounts |
| POST | `/checkout/initiate` | public | Start collection |
| GET | `/checkout/payments/:reference` | secret | Check collection status |
| POST | `/conversions/quotes` | secret | Get FX quote (5 min TTL) |
| POST | `/conversions` | secret | Execute FX conversion |
| GET | `/conversions` | secret | List executed conversions |
| POST | `/disbursements/payouts/bank` | secret | Start payout |
| GET | `/disbursements/payouts/reference/:reference` | secret | Payout status by reference |
| GET | `/disbursements/payouts` | secret | List all payouts |
| GET | `/events` | secret | Inspect webhook event log |
| POST | `/simulate/collections/settle` | none | Settle collection + webhook |
| POST | `/simulate/checkout/complete/:reference` | none | Complete a checkout |
| POST | `/simulate/webhooks/replay/:eventId` | secret | Replay a webhook |
| POST | `/simulate/chargeback` | secret | Simulate chargeback |

## Webhook verification

Webhooks are signed with HMAC-SHA512. Validate before processing:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto.createHmac('sha512', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return expected === signature;
}

// In your webhook handler:
app.post('/webhooks/fincra', (req, res) => {
  const signature = req.headers['x-fincra-signature'];
  if (!verifyWebhook(req.body, signature, process.env.FINCRA_WEBHOOK_SECRET)) {
    console.error('Invalid webhook signature — discarding');
    return res.status(401).send('Invalid signature');
  }
  // Process the event...
  res.status(200).send('OK');
});
```

## Webhook events

| Event | When |
|---|---|
| `collection.successful` | Collection settled successfully |
| `collection.failed` | Collection settlement failed |
| `charge.successful` | Checkout payment completed |
| `charge.failed` | Checkout payment failed |
| `payout.successful` | Payout delivered |
| `payout.failed` | Payout rejected by destination bank |
| `virtualaccount.approved` | Virtual account activated |
| `conversion.successful` | Currency conversion completed |
| `chargeback.created` | Chargeback initiated on a payment |
