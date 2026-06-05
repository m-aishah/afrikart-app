# Afrikart Sandbox API Notes

Narrative companion to the OpenAPI contract served at `/openapi.json` and the interactive docs served at `/docs`. The OpenAPI document is generated from the Hono route metadata and Valibot-backed validators in `src/routes/*` and `src/openapi.ts`.

Base URL: `http://localhost:4000`

All endpoints return JSON.

## Auth

The credentials shown in this file are local development defaults for this repo.
They are not the hosted judging credentials. In the judging environment,
organizers may rotate and assign temporary credentials per presenter.

### Secret-key protected endpoints

Send:

```http
api-key: sk_test_afrikart_secret
```

Secret-key requests are rate limited to 120 requests per minute per key.

### Public endpoint

Send:

```http
x-pub-key: pk_test_afrikart_public
```

The public endpoint is not currently rate limited.

The sandbox does not use `x-business-id`.

## Global behavior

### Response conventions

Most endpoints return one of these envelopes:

```json
{
  "success": true,
  "data": {}
}
```

```json
{
  "success": false,
  "error": "Human-readable message",
  "errorType": "OPTIONAL_MACHINE_CODE"
}
```

Common extra fields:

| Field | Type | Notes |
|---|---|---|
| `message` | string | Present on some success responses |
| `meta` | object | Present on `GET /events` |
| `retryAfter` | number | Present on `429` responses |
| `webhook` | object | Present on some simulation endpoints |

Exceptions:

| Endpoint | Shape |
|---|---|
| `GET /health` | Plain object, not wrapped in `success/data` |

### Common status codes

| Status | When |
|---|---|
| `200` | Successful read/update or idempotent payout replay |
| `201` | Resource created |
| `400` | Validation failure, unsupported currency pair, invalid quote, insufficient balance |
| `401` | Missing or invalid `api-key` / `x-pub-key` |
| `404` | Resource or account not found |
| `409` | Duplicate checkout reference |
| `429` | Secret-key rate limit exceeded |
| `503` | Chaos-mode provider error on selected transactional endpoints |

### Pagination shape

Endpoints that paginate return:

```json
{
  "results": [],
  "total": 0,
  "page": 1,
  "limit": 20
}
```

### Chaos mode

When `CHAOS_RATE` is greater than `0`, these endpoints may return:

```json
{
  "success": false,
  "error": "Provider temporarily unavailable — please retry with backoff",
  "errorType": "PROVIDER_ERROR"
}
```

Affected endpoints:

| Method | Path |
|---|---|
| `POST` | `/checkout/initiate` |
| `POST` | `/conversions` |
| `POST` | `/disbursements/payouts/bank` |

### Deterministic sandbox behavior

| Trigger | Effect |
|---|---|
| Recipient account ends in `9` | Payout resolves as `failed`; funds are restored |
| Recipient account ends in `7` | Payout resolves after about 15 seconds |
| Temporary virtual account with non-NGN currency | Starts `pending`, later becomes `approved` |
| Quote older than 5 minutes | Rejected as expired |

### Fees and timing

| Item | Value |
|---|---|
| Checkout fee | `1.5%` of amount |
| Checkout VAT | `7.5%` of checkout fee |
| Conversion quote fee | `1%` of source amount |
| Same-currency payout fee | Flat `50` |
| Cross-currency payout fee | `1.5%` of source amount |
| Temporary virtual account expiry | 30 minutes by default |
| Checkout virtual account expiry | 30 minutes |
| Non-NGN virtual account approval delay | About 3 seconds |
| Standard payout resolution delay | About 2 seconds |
| Slow payout resolution delay | About 15 seconds |
| Chargeback deadline | 7 days from creation |

## Reference data

### Credentials

| Credential | Value | Header |
|---|---|---|
| Secret Key | `sk_test_afrikart_secret` | `api-key` |
| Public Key | `pk_test_afrikart_public` | `x-pub-key` |
| Webhook Secret | `whsec_afrikart_secret` | n/a |

### Pre-loaded test accounts

| Bank Code | Account Number | Name | Currency | Notes |
|---|---|---|---|---|
| `058` | `0123456789` | Ada Lovelace | `NGN` | Success |
| `044` | `0001112223` | Kofi Mensah | `NGN` | Success |
| `011` | `2233445566` | Chinwe Obi | `NGN` | Success |
| `033` | `3344556677` | Emeka Nwosu | `NGN` | Success |
| `058` | `0000000009` | Fatima Invalid | `NGN` | Payout fails |
| `044` | `1111111117` | Chidi Timeout | `NGN` | Payout slow |
| `GH001` | `1002003004` | Akosua Boateng | `GHS` | Success |
| `KE001` | `5556667778` | Amina Wanjiku | `KES` | Success |

### Supported FX pairs

`NGN-USD`, `USD-NGN`, `NGN-GBP`, `GBP-NGN`, `NGN-EUR`, `EUR-NGN`, `NGN-GHS`, `GHS-NGN`, `NGN-KES`, `KES-NGN`, `USD-GBP`, `GBP-USD`, `USD-EUR`, `EUR-USD`, `KES-GBP`, `GBP-KES`, `KES-USD`, `USD-KES`, `GHS-USD`, `USD-GHS`

## Resource shapes

### Business

```json
{
  "id": "biz_afrikart_001",
  "name": "Afrikart Demo Business",
  "environment": "sandbox",
  "createdAt": "2026-03-07T20:00:00.000Z"
}
```

### Wallet

```json
{
  "currency": "NGN",
  "balance": 150000000,
  "availableBalance": 145000000
}
```

### Balance log

```json
{
  "id": "log_1741370000000_ab12cd34",
  "currency": "NGN",
  "type": "credit",
  "amount": 25000,
  "balanceAfter": 150025000,
  "availableAfter": 145025000,
  "reference": "pay_1741370000000_ab12cd34",
  "description": "Collection from Maya Okafor",
  "createdAt": "2026-03-07T20:00:00.000Z"
}
```

### Bank

```json
{
  "code": "058",
  "name": "GTBank",
  "country": "NG",
  "currency": "NGN"
}
```

### Payment

```json
{
  "id": "txn_1741370000000_ab12cd34",
  "reference": "order_1001",
  "amount": 25000,
  "currency": "NGN",
  "fee": 375,
  "vat": 28.13,
  "feeBearer": "business",
  "metadata": {
    "orderId": "1001"
  },
  "customer": {
    "name": "Maya Okafor",
    "email": "maya@example.com"
  },
  "redirectUrl": null,
  "status": "pending",
  "paymentDestination": "checkout",
  "virtualAccount": {
    "bankName": "Globus Bank",
    "accountName": "Afrikart Demo Business",
    "accountNumber": "1234567890",
    "bankCode": "103",
    "expiresAt": "2026-03-07T20:30:00.000Z"
  },
  "createdAt": "2026-03-07T20:00:00.000Z",
  "updatedAt": "2026-03-07T20:00:00.000Z",
  "channel": "bank_transfer",
  "amountReceived": 25000
}
```

Optional fields `channel` and `amountReceived` appear after settlement or checkout completion.

### Virtual account

```json
{
  "id": "va_1741370000000_ab12cd34",
  "reference": "vref_1741370000000_ab12cd34",
  "status": "approved",
  "currency": "NGN",
  "isPermanent": false,
  "accountType": "temporary",
  "accountInformation": {
    "accountNumber": "1234567890",
    "accountName": "Maya Okafor",
    "bankName": "Globus Bank",
    "bankCode": "103"
  },
  "customer": {
    "name": "Maya Okafor",
    "email": "maya@example.com",
    "bvn": "12345678901"
  },
  "expiresAt": "2026-03-07T20:30:00.000Z",
  "createdAt": "2026-03-07T20:00:00.000Z",
  "updatedAt": "2026-03-07T20:00:00.000Z"
}
```

### Quote

```json
{
  "sourceCurrency": "NGN",
  "destinationCurrency": "GBP",
  "sourceAmount": 500000,
  "destinationAmount": 245,
  "action": "send",
  "transactionType": "disbursement",
  "fee": 5000,
  "rate": 0.00049,
  "amountToCharge": 505000,
  "amountToReceive": 245,
  "reference": "quote_1741370000000_ab12cd34",
  "expireAt": "2026-03-07T20:05:00.000Z"
}
```

Note: the current API field name is `expireAt`.

### Conversion

```json
{
  "id": "conv_1741370000000_ab12cd34",
  "quoteReference": "quote_1741370000000_ab12cd34",
  "sourceCurrency": "NGN",
  "destinationCurrency": "GBP",
  "sourceAmount": 500000,
  "destinationAmount": 245,
  "rate": 0.00049,
  "fee": 5000,
  "status": "successful",
  "createdAt": "2026-03-07T20:00:00.000Z",
  "updatedAt": "2026-03-07T20:00:00.000Z"
}
```

### Payout

```json
{
  "id": "po_1741370000000_ab12cd34",
  "reference": "payout_1741370000000_ab12cd34",
  "customerReference": "vendor_settlement_1",
  "amountCharged": 10050,
  "amountReceived": 10000,
  "sourceCurrency": "NGN",
  "destinationCurrency": "NGN",
  "fee": 50,
  "rate": 1,
  "narration": "Afrikart payout",
  "paymentScheme": "instant",
  "paymentDestination": "bank_account",
  "recipient": {
    "name": "Ada Lovelace",
    "accountNumber": "0123456789",
    "bankCode": "058",
    "email": "ada@example.com"
  },
  "status": "processing",
  "reason": "Payout initiated",
  "quoteReference": null,
  "createdAt": "2026-03-07T20:00:00.000Z",
  "updatedAt": "2026-03-07T20:00:00.000Z"
}
```

### Chargeback

```json
{
  "id": "cb_1741370000000_ab12cd34",
  "paymentReference": "order_1001",
  "paymentId": "txn_1741370000000_ab12cd34",
  "amount": 25000,
  "currency": "NGN",
  "reason": "Unauthorized transaction",
  "status": "open",
  "deadline": "2026-03-14T20:00:00.000Z",
  "createdAt": "2026-03-07T20:00:00.000Z",
  "updatedAt": "2026-03-07T20:00:00.000Z"
}
```

### Event log entry

```json
{
  "id": "evt_1741370000000_ab12cd34",
  "event": "payout.successful",
  "delivered": true,
  "payload": {
    "event": "payout.successful",
    "data": {}
  },
  "signature": "hex-hmac-sha512",
  "createdAt": "2026-03-07T20:00:00.000Z",
  "target": "http://localhost:3000/webhooks/fincra",
  "httpStatus": 200,
  "error": "optional network error"
}
```

The event log keeps the most recent 500 events. Balance logs keep the most recent 1000 entries.

## Endpoints

## Health and profile

### GET /health

Auth: none

Returns server status and active chaos rate.

Response `200`:

```json
{
  "status": "ok",
  "service": "afrikart-sandbox-api",
  "version": "2.0.0",
  "chaosRate": 0,
  "timestamp": "2026-03-07T20:00:00.000Z"
}
```

### GET /profile/business

Auth: secret key

Response `200`:

```json
{
  "success": true,
  "data": {
    "id": "biz_afrikart_001",
    "name": "Afrikart Demo Business",
    "environment": "sandbox",
    "createdAt": "2026-03-07T20:00:00.000Z"
  }
}
```

## Wallets

### GET /wallets

Auth: secret key

Returns all wallets.

Response `200`: `data` is `Wallet[]`.

### GET /wallets/logs

Auth: secret key

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `currency` | string | no | Case-insensitive by client convention; server uppercases |
| `type` | `credit` or `debit` | no | Exact match |
| `page` | number | no | Default `1`; minimum `1` |
| `limit` | number | no | Default `20`; maximum `100` |

Response `200`:

```json
{
  "success": true,
  "data": {
    "results": [],
    "total": 0,
    "page": 1,
    "limit": 20
  }
}
```

### POST /wallets/topup

Auth: secret key

Body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `currency` | string | yes | Uppercased by server |
| `amount` | number | yes | Must be greater than `0` |

Response `200`:

```json
{
  "success": true,
  "message": "Balance topped up",
  "data": {
    "currency": "NGN",
    "balance": 150010000,
    "availableBalance": 145010000
  }
}
```

Error `400`:

```json
{
  "success": false,
  "error": "currency and positive amount are required"
}
```

## Identity

### GET /banks

Auth: secret key

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `country` | string | no | Filters by bank country code such as `NG`, `GH`, `KE` |
| `currency` | string | no | Filters by bank currency such as `NGN`, `GHS`, `KES` |

Response `200`: `data` is `Bank[]`.

### POST /identity/verify-account-number

Auth: secret key

Body:

| Field | Type | Required |
|---|---|---|
| `accountNumber` | string | yes |
| `bankCode` | string | yes |

Response `200`:

```json
{
  "success": true,
  "data": {
    "accountNumber": "0123456789",
    "bankCode": "058",
    "accountName": "Ada Lovelace",
    "bankName": "GTBank",
    "currency": "NGN",
    "resolved": true
  }
}
```

Error `404`:

```json
{
  "success": false,
  "error": "Account not found",
  "data": {
    "accountNumber": "9999999999",
    "bankCode": "058",
    "resolved": false
  }
}
```

### POST /identity/resolve-bvn

Auth: secret key

Body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `bvn` | string | yes | Must be 11 digits |

Response `200`:

```json
{
  "success": true,
  "data": {
    "bvn": "12345678901",
    "firstName": "JOHN",
    "lastName": "DOE",
    "middleName": "TEST",
    "dateOfBirth": "1990-01-15",
    "phoneNumber": "08012348901",
    "gender": "Male"
  }
}
```

## Virtual accounts

### POST /profile/virtual-accounts/requests

Auth: secret key

Body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `currency` | string | no | Default `NGN` |
| `reference` | string | no | If omitted, server generates one |
| `expiresInMinutes` | number | no | Used only for temporary accounts |
| `isPermanent` | boolean | no | Default `false` |
| `customer` | object | conditional | Preferred customer payload |
| `KYCInformation` | object | conditional | Accepted alternate payload shape |

Customer / KYC fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | conditional | Required unless `firstName` and `lastName` are both present |
| `firstName` | string | conditional | Alternative to `name` |
| `lastName` | string | conditional | Alternative to `name` |
| `email` | string | yes | Required in either payload shape |
| `bvn` | string | conditional | Required for `NGN` virtual accounts |

Behavior:

| Scenario | Result |
|---|---|
| `currency = NGN` | Account is created as `approved` immediately |
| `currency != NGN` | Account is created as `pending`, then promoted to `approved` after about 3 seconds |
| `isPermanent = true` | `expiresAt` is `null` |
| `isPermanent = false` and `expiresInMinutes` omitted | Expires in 30 minutes |

Response `201`: `data` is a `Virtual account`.

### GET /profile/virtual-accounts/:virtualAccountId

Auth: secret key

Path parameter:

| Name | Type | Notes |
|---|---|---|
| `virtualAccountId` | string | This is the internal `id`, not the `reference` |

Response `200`: `data` is a `Virtual account`.

Error `404`:

```json
{
  "success": false,
  "error": "Virtual account not found"
}
```

### GET /profile/virtual-accounts

Auth: secret key

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `currency` | string | no | Filters by exact uppercased currency |

Response `200`:

```json
{
  "success": true,
  "data": {
    "results": [],
    "total": 0
  }
}
```

## Checkout and collections

### POST /checkout/initiate

Auth: public key

Chaos mode can return `503`.

Body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | number | yes | Must be greater than `0` |
| `currency` | string | no | Default `NGN` |
| `reference` | string | no | Must be unique if supplied |
| `feeBearer` | string | no | Default `business` |
| `customer` | object | yes | Must include `name` and `email` |
| `metadata` | object | no | Any JSON object |
| `redirectUrl` | string | no | Stored only |

Response `201`:

```json
{
  "success": true,
  "data": {
    "reference": "order_1001",
    "checkoutUrl": "http://localhost:4000/checkout/mock/order_1001",
    "payment": {}
  }
}
```

Error `400`:

```json
{
  "success": false,
  "error": "customer.name and customer.email are required"
}
```

Error `409`:

```json
{
  "success": false,
  "error": "Duplicate reference — payment already exists"
}
```

Important: the response includes a `checkoutUrl`, but the current mock server does not implement a hosted `/checkout/mock/:reference` page. Treat it as a placeholder value, not a navigable endpoint.

### GET /checkout/payments/:reference

Auth: secret key

Response `200`: `data` is a `Payment`.

Error `404`:

```json
{
  "success": false,
  "error": "Payment not found"
}
```

### POST /simulate/collections/settle

Auth: none

Use this to settle a checkout or bank-transfer style collection and emit a collection webhook.

Body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `reference` | string | yes | Payment reference from checkout initiation |
| `status` | string | no | Default `successful` |
| `channel` | string | no | Default `bank_transfer` |

Response `200`:

```json
{
  "success": true,
  "data": {},
  "webhook": {}
}
```

Webhook event emitted:

| `status` | Event |
|---|---|
| `successful` | `collection.successful` |
| any other value | `collection.failed` |

### POST /simulate/checkout/complete/:reference

Auth: none

Use this to complete a checkout/card-style payment and emit a charge webhook.

Path parameter:

| Name | Type |
|---|---|
| `reference` | string |

Body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | no | Default `card` |
| `status` | string | no | Default `successful` |

Response `200`:

```json
{
  "success": true,
  "data": {},
  "webhook": {}
}
```

Error `400` if the payment is already successful.

## Conversions

### POST /conversions/quotes

Auth: secret key

Body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `sourceCurrency` | string | yes | Uppercased by server |
| `destinationCurrency` | string | yes | Uppercased by server |
| `amount` | number | yes | Must be greater than `0` |
| `action` | string | no | Default `send` |

Response `200`:

```json
{
  "success": true,
  "message": "Quote generated successfully",
  "data": {
    "sourceCurrency": "NGN",
    "destinationCurrency": "GBP",
    "sourceAmount": 500000,
    "destinationAmount": 245,
    "action": "send",
    "transactionType": "disbursement",
    "fee": 5000,
    "rate": 0.00049,
    "amountToCharge": 505000,
    "amountToReceive": 245,
    "reference": "quote_1741370000000_ab12cd34",
    "expireAt": "2026-03-07T20:05:00.000Z"
  }
}
```

The quote response does not include the server's internal `createdAt` field.

Error `400`:

```json
{
  "success": false,
  "error": "Unsupported currency pair: NGN-CAD"
}
```

### POST /conversions

Auth: secret key

Chaos mode can return `503`.

Body:

| Field | Type | Required |
|---|---|---|
| `quoteReference` | string | yes |

Behavior:

| Condition | Result |
|---|---|
| Valid quote | Conversion is created immediately with `status = successful` |
| Missing quote | `400` with `quoteReference is required` |
| Unknown quote | `400` with `Invalid quoteReference` |
| Expired quote | `400` with `errorType = QUOTE_EXPIRED` |

Response `201`: `data` is a `Conversion`.

This endpoint emits `conversion.successful`.

### GET /conversions

Auth: secret key

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `sourceCurrency` | string | no | Exact uppercase match |
| `destinationCurrency` | string | no | Exact uppercase match |
| `page` | number | no | Default `1`; minimum `1` |
| `limit` | number | no | Default `20`; maximum `100` |

Response `200`:

```json
{
  "success": true,
  "data": {
    "results": [],
    "total": 0,
    "page": 1,
    "limit": 20
  }
}
```

## Payouts

### POST /disbursements/payouts/bank

Auth: secret key

Headers:

| Header | Required | Notes |
|---|---|---|
| `x-idempotency-key` | no | If reused, returns the cached payout response |

Chaos mode can return `503`.

Body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | number | yes | Must be greater than `0` |
| `sourceCurrency` | string | no | Default `NGN` |
| `destinationCurrency` | string | no | Defaults to `sourceCurrency` |
| `customerReference` | string | no | Stored as-is |
| `narration` | string | no | Default `Afrikart payout` |
| `quoteReference` | string | conditional | Required for cross-currency payouts |
| `recipient` | object | yes | See recipient fields below |

Recipient fields:

| Field | Type | Required |
|---|---|---|
| `name` | string | yes |
| `accountNumber` | string | yes |
| `bankCode` | string | yes |
| `email` | string | no |

Business rules:

| Scenario | Result |
|---|---|
| `sourceCurrency == destinationCurrency` | Flat fee `50`, rate `1` |
| `sourceCurrency != destinationCurrency` | `quoteReference` required; fee `1.5%` |
| Wallet balance too low | `400` with `errorType = INSUFFICIENT_FUNDS` |
| Account ends in `9` | Payout later resolves as `failed` and balance is restored |
| Account ends in `7` | Payout stays `processing` for about 15 seconds before success |
| Idempotency key reused | Returns cached payout with `200` |

Response `201`: `data` is a `Payout` with initial `status = processing`.

Idempotent replay response `200`:

```json
{
  "success": true,
  "message": "Payout already processed (idempotent)",
  "data": {}
}
```

Relevant errors:

```json
{
  "success": false,
  "error": "quoteReference is required for cross-currency payouts"
}
```

```json
{
  "success": false,
  "error": "Insufficient balance",
  "errorType": "INSUFFICIENT_FUNDS"
}
```

This endpoint later emits either `payout.successful` or `payout.failed`.

### GET /disbursements/payouts/reference/:reference

Auth: secret key

Path parameter:

| Name | Type |
|---|---|
| `reference` | string |

Response `200`: `data` is a `Payout`.

Error `404`:

```json
{
  "success": false,
  "error": "Payout not found"
}
```

### GET /disbursements/payouts

Auth: secret key

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `status` | string | no | Exact match such as `processing`, `successful`, `failed` |

Response `200`:

```json
{
  "success": true,
  "data": {
    "results": [],
    "total": 0
  }
}
```

This endpoint does not currently support page/limit parameters.

## Events and simulations

### GET /events

Auth: secret key

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `event` | string | no | Filter by exact event name |
| `limit` | number | no | Default `50`; maximum `200` |

Response `200`:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "total": 0,
    "webhookTargetUrl": "http://localhost:3000/webhooks/fincra",
    "webhookHeader": "x-fincra-signature",
    "webhookAlgorithm": "HMAC-SHA512",
    "webhookSecretConfigured": true
  }
}
```

Results are returned newest first.

### POST /simulate/webhooks/replay/:eventId

Auth: secret key

Path parameter:

| Name | Type | Notes |
|---|---|---|
| `eventId` | string | Event log entry id from `GET /events` |

Response `200`:

```json
{
  "success": true,
  "message": "Webhook replayed",
  "data": {}
}
```

Error `404`:

```json
{
  "success": false,
  "error": "Event not found"
}
```

### POST /simulate/chargeback

Auth: secret key

Body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `paymentReference` | string | yes | Existing payment reference |
| `amount` | number | no | Defaults to the original payment amount |
| `reason` | string | no | Default `Unauthorized transaction` |

Behavior:

| Effect | Notes |
|---|---|
| Chargeback is created with `status = open` | Immediate |
| Wallet balance is debited immediately | If a wallet exists for the payment currency |
| Webhook emitted | `chargeback.created` |

Response `201`: `data` is a `Chargeback`.

Relevant errors:

```json
{
  "success": false,
  "error": "paymentReference is required"
}
```

```json
{
  "success": false,
  "error": "Payment not found"
}
```

## Webhooks

Set `WEBHOOK_TARGET_URL` to have the mock server deliver outbound webhooks to your app.

Headers sent:

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `x-fincra-signature` | HMAC-SHA512 hex digest |

Payload envelope:

```json
{
  "event": "payout.successful",
  "data": {}
}
```

Signature algorithm:

1. Serialize the payload envelope with `JSON.stringify`.
2. Sign that exact string with HMAC-SHA512 using `FINCRA_WEBHOOK_SECRET`.
3. Compare the hex digest with the `x-fincra-signature` header.

Event types:

| Event | Payload data |
|---|---|
| `collection.successful` | Collection settlement summary |
| `collection.failed` | Collection settlement summary |
| `charge.successful` | `Payment` |
| `charge.failed` | `Payment` |
| `payout.successful` | `Payout` |
| `payout.failed` | `Payout` |
| `virtualaccount.approved` | `Virtual account` |
| `conversion.successful` | `Conversion` |
| `chargeback.created` | `Chargeback` |

Collection settlement summary shape:

```json
{
  "id": "txn_1741370000000_ab12cd34",
  "amountReceived": 25000,
  "amountCredited": 25000,
  "currency": "NGN",
  "fee": 375,
  "vat": 28.13,
  "paymentStatus": "successful",
  "paymentSource": "bank_transfer",
  "customer": {
    "name": "Maya Okafor",
    "email": "maya@example.com"
  },
  "feeBearer": "business",
  "reference": "order_1001",
  "createdAt": "2026-03-07T20:00:00.000Z",
  "updatedAt": "2026-03-07T20:00:00.000Z",
  "metadata": {
    "orderId": "1001"
  },
  "settlementDestination": "wallet"
}
```

## Known limitations

| Limitation | Detail |
|---|---|
| Hosted checkout page | `checkoutUrl` is returned, but no `/checkout/mock/:reference` route exists in this server |
| Single-business sandbox | Business context is fixed to one preloaded business |
| Payout list pagination | `GET /disbursements/payouts` returns all matching payouts; no page/limit support |
| Event storage | Event log is in-memory and capped at 500 entries |
| Balance log storage | Balance log is in-memory and capped at 1000 entries |
