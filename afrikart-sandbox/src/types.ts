export type JsonRecord = Record<string, unknown>;
export type BalanceLogType = "credit" | "debit";

export interface Business {
  id: string;
  name: string;
  environment: string;
  createdAt: string;
}

export interface Wallet {
  currency: string;
  balance: number;
  availableBalance: number;
}

export interface Bank {
  code: string;
  name: string;
  country: string;
  currency: string;
}

export interface AccountDirectoryRecord {
  accountName: string;
  currency: string;
  bankCode: string;
  bankName: string;
}

export interface BalanceLog {
  id: string;
  currency: string;
  type: BalanceLogType;
  amount: number;
  balanceAfter: number | null;
  availableAfter: number | null;
  reference: string;
  description: string;
  createdAt: string;
}

export interface VirtualAccount {
  id: string;
  reference: string;
  status: string;
  currency: string;
  isPermanent: boolean;
  accountType: "permanent" | "temporary";
  accountInformation: {
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
  };
  customer: JsonRecord;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentCustomer extends JsonRecord {
  name: string;
  email: string;
}

export interface Payment {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  fee: number;
  vat: number;
  feeBearer: string;
  metadata: JsonRecord;
  customer: PaymentCustomer;
  redirectUrl: string | null;
  status: string;
  paymentDestination: string;
  virtualAccount: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    bankCode: string;
    expiresAt: string;
  };
  createdAt: string;
  updatedAt: string;
  channel?: string;
  amountReceived?: number;
}

export interface Quote {
  sourceCurrency: string;
  destinationCurrency: string;
  sourceAmount: number;
  destinationAmount: number;
  action: string;
  transactionType: string;
  fee: number;
  rate: number;
  amountToCharge: number;
  amountToReceive: number;
  reference: string;
  expireAt: string;
  createdAt: number;
}

export interface Conversion {
  id: string;
  quoteReference: string;
  sourceCurrency: string;
  destinationCurrency: string;
  sourceAmount: number;
  destinationAmount: number;
  rate: number;
  fee: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recipient extends JsonRecord {
  name: string;
  accountNumber: string;
  bankCode: string;
  email?: string;
}

export interface Payout {
  id: string;
  reference: string;
  customerReference: string | null;
  amountCharged: number;
  amountReceived: number;
  sourceCurrency: string;
  destinationCurrency: string;
  fee: number;
  rate: number;
  narration: string;
  paymentScheme: string;
  paymentDestination: string;
  recipient: Recipient;
  status: string;
  reason: string;
  quoteReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Chargeback {
  id: string;
  paymentReference: string;
  paymentId: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  deadline: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookPayload {
  event: string;
  data: unknown;
}

export interface WebhookEvent {
  id: string;
  event: string;
  delivered: boolean;
  payload: WebhookPayload;
  signature: string;
  createdAt: string;
  target: string | null;
  httpStatus?: number;
  error?: string;
}

export interface Store {
  business: Business;
  wallets: Wallet[];
  banks: Bank[];
  accountDirectory: Record<string, AccountDirectoryRecord>;
  virtualAccounts: Map<string, VirtualAccount>;
  payments: Map<string, Payment>;
  payouts: Map<string, Payout>;
  chargebacks: Map<string, Chargeback>;
  conversions: Conversion[];
  balanceLogs: BalanceLog[];
  events: WebhookEvent[];
  quotes: Map<string, Quote>;
  idempotencyStore: Map<string, Payout>;
}
