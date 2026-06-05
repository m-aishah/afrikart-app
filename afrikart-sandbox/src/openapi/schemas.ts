import * as v from "valibot";

const isoDateTimeSchema = v.pipe(v.string(), v.isoDateTime());
const numberish = (message: string) =>
  v.pipe(
    v.union([v.number(message), v.string(message)]),
    v.transform((input) => (typeof input === "string" ? Number(input) : input)),
    v.number(message),
  );
const positiveNumberish = (message: string) =>
  v.pipe(numberish(message), v.minValue(0.01, message));
const looseUnknownObject = v.objectWithRest({}, v.unknown());

export const paymentCustomerSchema = v.objectWithRest(
  {
    name: v.string(),
    email: v.string(),
  },
  v.unknown(),
);

export const walletSchema = v.object({
  currency: v.string(),
  balance: v.number(),
  availableBalance: v.number(),
});

export const walletListSchema = v.array(walletSchema);

export const balanceLogSchema = v.object({
  id: v.string(),
  currency: v.string(),
  type: v.picklist(["credit", "debit"]),
  amount: v.number(),
  balanceAfter: v.nullable(v.number()),
  availableAfter: v.nullable(v.number()),
  reference: v.string(),
  description: v.string(),
  createdAt: isoDateTimeSchema,
});

export const paginatedBalanceLogsSchema = v.object({
  results: v.array(balanceLogSchema),
  total: v.number(),
  page: v.number(),
  limit: v.number(),
});

export const bankSchema = v.object({
  code: v.string(),
  name: v.string(),
  country: v.string(),
  currency: v.string(),
});

export const bankListSchema = v.array(bankSchema);

export const resolvedAccountSchema = v.object({
  accountNumber: v.string(),
  bankCode: v.string(),
  accountName: v.string(),
  bankName: v.string(),
  currency: v.string(),
  resolved: v.literal(true),
});

export const bvnResolutionSchema = v.object({
  bvn: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  middleName: v.string(),
  dateOfBirth: v.string(),
  phoneNumber: v.string(),
  gender: v.string(),
});

export const paymentVirtualAccountSchema = v.object({
  bankName: v.string(),
  accountName: v.string(),
  accountNumber: v.string(),
  bankCode: v.string(),
  expiresAt: isoDateTimeSchema,
});

export const paymentSchema = v.object({
  id: v.string(),
  reference: v.string(),
  amount: v.number(),
  currency: v.string(),
  fee: v.number(),
  vat: v.number(),
  feeBearer: v.string(),
  metadata: looseUnknownObject,
  customer: paymentCustomerSchema,
  redirectUrl: v.nullable(v.string()),
  status: v.string(),
  paymentDestination: v.string(),
  virtualAccount: paymentVirtualAccountSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  channel: v.optional(v.string()),
  amountReceived: v.optional(v.number()),
});

export const checkoutInitiationDataSchema = v.object({
  reference: v.string(),
  checkoutUrl: v.string(),
  payment: paymentSchema,
});

export const virtualAccountInputCustomerSchema = v.objectWithRest(
  {
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    bvn: v.optional(v.string()),
  },
  v.unknown(),
);

export const virtualAccountSchema = v.object({
  id: v.string(),
  reference: v.string(),
  status: v.string(),
  currency: v.string(),
  isPermanent: v.boolean(),
  accountType: v.picklist(["permanent", "temporary"]),
  accountInformation: v.object({
    accountNumber: v.string(),
    accountName: v.string(),
    bankName: v.string(),
    bankCode: v.string(),
  }),
  customer: looseUnknownObject,
  expiresAt: v.nullable(v.string()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const virtualAccountListSchema = v.object({
  results: v.array(virtualAccountSchema),
  total: v.number(),
});

export const quoteSchema = v.object({
  sourceCurrency: v.string(),
  destinationCurrency: v.string(),
  sourceAmount: v.number(),
  destinationAmount: v.number(),
  action: v.string(),
  transactionType: v.string(),
  fee: v.number(),
  rate: v.number(),
  amountToCharge: v.number(),
  amountToReceive: v.number(),
  reference: v.string(),
  expireAt: isoDateTimeSchema,
});

export const conversionSchema = v.object({
  id: v.string(),
  quoteReference: v.string(),
  sourceCurrency: v.string(),
  destinationCurrency: v.string(),
  sourceAmount: v.number(),
  destinationAmount: v.number(),
  rate: v.number(),
  fee: v.number(),
  status: v.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const paginatedConversionsSchema = v.object({
  results: v.array(conversionSchema),
  total: v.number(),
  page: v.number(),
  limit: v.number(),
});

export const recipientSchema = v.objectWithRest(
  {
    name: v.string(),
    accountNumber: v.string(),
    bankCode: v.string(),
    email: v.optional(v.string()),
  },
  v.unknown(),
);

export const payoutSchema = v.object({
  id: v.string(),
  reference: v.string(),
  customerReference: v.nullable(v.string()),
  amountCharged: v.number(),
  amountReceived: v.number(),
  sourceCurrency: v.string(),
  destinationCurrency: v.string(),
  fee: v.number(),
  rate: v.number(),
  narration: v.string(),
  paymentScheme: v.string(),
  paymentDestination: v.string(),
  recipient: recipientSchema,
  status: v.string(),
  reason: v.string(),
  quoteReference: v.nullable(v.string()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const payoutListSchema = v.object({
  results: v.array(payoutSchema),
  total: v.number(),
});

export const chargebackSchema = v.object({
  id: v.string(),
  paymentReference: v.string(),
  paymentId: v.string(),
  amount: v.number(),
  currency: v.string(),
  reason: v.string(),
  status: v.string(),
  deadline: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const webhookPayloadSchema = v.object({
  event: v.string(),
  data: v.unknown(),
});

export const webhookEventSchema = v.object({
  id: v.string(),
  event: v.string(),
  delivered: v.boolean(),
  payload: webhookPayloadSchema,
  signature: v.string(),
  createdAt: isoDateTimeSchema,
  target: v.nullable(v.string()),
  httpStatus: v.optional(v.number()),
  error: v.optional(v.string()),
});

export const eventsMetaSchema = v.object({
  total: v.number(),
  webhookTargetUrl: v.nullable(v.string()),
  webhookHeader: v.string(),
  webhookAlgorithm: v.string(),
  webhookSecretConfigured: v.boolean(),
});

export const eventsResponseSchema = v.object({
  success: v.literal(true),
  data: v.array(webhookEventSchema),
  meta: eventsMetaSchema,
});

export const collectionSettlementWebhookDataSchema = v.object({
  id: v.string(),
  amountReceived: v.number(),
  amountCredited: v.number(),
  currency: v.string(),
  fee: v.number(),
  vat: v.number(),
  paymentStatus: v.string(),
  paymentSource: v.string(),
  customer: paymentCustomerSchema,
  feeBearer: v.string(),
  reference: v.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  metadata: looseUnknownObject,
  settlementDestination: v.string(),
});

export const healthSchema = v.object({
  status: v.string(),
  service: v.string(),
  version: v.string(),
  chaosRate: v.number(),
  timestamp: isoDateTimeSchema,
});

export const businessSchema = v.object({
  id: v.string(),
  name: v.string(),
  environment: v.string(),
  createdAt: isoDateTimeSchema,
});

export const errorSchema = v.object({
  success: v.literal(false),
  error: v.string(),
  errorType: v.optional(v.string()),
  retryAfter: v.optional(v.number()),
  data: v.optional(v.unknown()),
});

export const topupRequestSchema = v.object({
  currency: v.string("currency and positive amount are required"),
  amount: positiveNumberish("currency and positive amount are required"),
});

export const banksQuerySchema = v.object({
  country: v.optional(v.string()),
  currency: v.optional(v.string()),
});

export const walletLogsQuerySchema = v.object({
  currency: v.optional(v.string()),
  type: v.optional(v.picklist(["credit", "debit"])),
  page: v.optional(v.string()),
  limit: v.optional(v.string()),
});

export const verifyAccountNumberRequestSchema = v.object({
  accountNumber: v.string("accountNumber and bankCode are required"),
  bankCode: v.string("accountNumber and bankCode are required"),
});

export const resolveBvnRequestSchema = v.object({
  bvn: v.string("bvn is required"),
});

export const virtualAccountsQuerySchema = v.object({
  currency: v.optional(v.string()),
});

export const virtualAccountIdParamSchema = v.object({
  virtualAccountId: v.string(),
});

export const virtualAccountRequestSchema = v.object({
  currency: v.optional(v.string()),
  customer: v.optional(virtualAccountInputCustomerSchema),
  KYCInformation: v.optional(virtualAccountInputCustomerSchema),
  reference: v.optional(v.string()),
  expiresInMinutes: v.optional(v.union([v.number(), v.string()])),
  isPermanent: v.optional(v.union([v.boolean(), v.string(), v.number()])),
});

export const checkoutInitiateRequestSchema = v.object({
  amount: positiveNumberish("amount must be greater than zero"),
  currency: v.optional(v.string()),
  reference: v.optional(v.string()),
  feeBearer: v.optional(v.string()),
  customer: v.object(
    {
      name: v.string("customer.name and customer.email are required"),
      email: v.string("customer.name and customer.email are required"),
    },
    "customer.name and customer.email are required",
  ),
  metadata: v.optional(looseUnknownObject),
  redirectUrl: v.optional(v.string()),
});

export const paymentReferenceParamSchema = v.object({
  reference: v.string(),
});

export const quoteRequestSchema = v.object({
  sourceCurrency: v.string(
    "sourceCurrency, destinationCurrency, and amount are required",
  ),
  destinationCurrency: v.string(
    "sourceCurrency, destinationCurrency, and amount are required",
  ),
  amount: positiveNumberish(
    "sourceCurrency, destinationCurrency, and amount are required",
  ),
  action: v.optional(v.string()),
});

export const conversionExecutionRequestSchema = v.object({
  quoteReference: v.string("quoteReference is required"),
});

export const conversionsQuerySchema = v.object({
  sourceCurrency: v.optional(v.string()),
  destinationCurrency: v.optional(v.string()),
  page: v.optional(v.string()),
  limit: v.optional(v.string()),
});

export const payoutRequestSchema = v.object({
  amount: positiveNumberish("amount must be greater than zero"),
  sourceCurrency: v.optional(v.string()),
  destinationCurrency: v.optional(v.string()),
  customerReference: v.optional(v.string()),
  narration: v.optional(v.string()),
  quoteReference: v.optional(v.string()),
  recipient: v.object(
    {
      name: v.string(
        "recipient.name, recipient.accountNumber and recipient.bankCode are required",
      ),
      accountNumber: v.string(
        "recipient.name, recipient.accountNumber and recipient.bankCode are required",
      ),
      bankCode: v.string(
        "recipient.name, recipient.accountNumber and recipient.bankCode are required",
      ),
      email: v.optional(v.string()),
    },
    "recipient.name, recipient.accountNumber and recipient.bankCode are required",
  ),
});

export const payoutReferenceParamSchema = v.object({
  reference: v.string(),
});

export const payoutsQuerySchema = v.object({
  status: v.optional(v.string()),
});

export const eventsQuerySchema = v.object({
  event: v.optional(v.string()),
  limit: v.optional(v.string()),
});

export const eventIdParamSchema = v.object({
  eventId: v.string(),
});

export const collectionSettlementRequestSchema = v.object({
  reference: v.string("reference is required"),
  status: v.optional(v.string()),
  channel: v.optional(v.string()),
});

export const checkoutCompleteRequestSchema = v.object({
  type: v.optional(v.string()),
  status: v.optional(v.string()),
});

export const chargebackRequestSchema = v.object({
  paymentReference: v.string("paymentReference is required"),
  amount: v.optional(v.union([v.number(), v.string()])),
  reason: v.optional(v.string()),
});
