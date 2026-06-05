import type {
  AccountDirectoryRecord,
  Bank,
  Business,
  Wallet,
} from "../types";

const baseWallets: Wallet[] = [
  { currency: "NGN", balance: 150_000_000, availableBalance: 145_000_000 },
  { currency: "GHS", balance: 5_000_000, availableBalance: 5_000_000 },
  { currency: "KES", balance: 8_000_000, availableBalance: 8_000_000 },
  { currency: "USD", balance: 100_000, availableBalance: 100_000 },
  { currency: "EUR", balance: 80_000, availableBalance: 80_000 },
  { currency: "GBP", balance: 60_000, availableBalance: 60_000 },
];

const baseBanks: Bank[] = [
  {
    code: "090267",
    name: "Demo Microfinance Bank",
    country: "NG",
    currency: "NGN",
  },
  { code: "058", name: "GTBank", country: "NG", currency: "NGN" },
  { code: "044", name: "Access Bank", country: "NG", currency: "NGN" },
  {
    code: "011",
    name: "First Bank of Nigeria",
    country: "NG",
    currency: "NGN",
  },
  {
    code: "033",
    name: "United Bank For Africa",
    country: "NG",
    currency: "NGN",
  },
  { code: "057", name: "Zenith Bank", country: "NG", currency: "NGN" },
  { code: "050", name: "Ecobank Nigeria", country: "NG", currency: "NGN" },
  { code: "103", name: "Globus Bank", country: "NG", currency: "NGN" },
  {
    code: "GH001",
    name: "Accra Commercial Bank",
    country: "GH",
    currency: "GHS",
  },
  {
    code: "KE001",
    name: "Nairobi Settlement Bank",
    country: "KE",
    currency: "KES",
  },
];

const baseAccountDirectory: Record<string, AccountDirectoryRecord> = {
  "058:0123456789": {
    accountName: "Ada Lovelace",
    currency: "NGN",
    bankCode: "058",
    bankName: "GTBank",
  },
  "044:0001112223": {
    accountName: "Kofi Mensah",
    currency: "NGN",
    bankCode: "044",
    bankName: "Access Bank",
  },
  "011:2233445566": {
    accountName: "Chinwe Obi",
    currency: "NGN",
    bankCode: "011",
    bankName: "First Bank of Nigeria",
  },
  "033:3344556677": {
    accountName: "Emeka Nwosu",
    currency: "NGN",
    bankCode: "033",
    bankName: "United Bank For Africa",
  },
  "058:0000000009": {
    accountName: "Fatima Invalid",
    currency: "NGN",
    bankCode: "058",
    bankName: "GTBank",
  },
  "044:1111111117": {
    accountName: "Chidi Timeout",
    currency: "NGN",
    bankCode: "044",
    bankName: "Access Bank",
  },
  "GH001:1002003004": {
    accountName: "Akosua Boateng",
    currency: "GHS",
    bankCode: "GH001",
    bankName: "Accra Commercial Bank",
  },
  "KE001:5556667778": {
    accountName: "Amina Wanjiku",
    currency: "KES",
    bankCode: "KE001",
    bankName: "Nairobi Settlement Bank",
  },
};

export function createBusiness(): Business {
  return {
    id: "biz_afrikart_001",
    name: "Afrikart Demo Business",
    environment: "sandbox",
    createdAt: new Date().toISOString(),
  };
}

export function cloneWallets(): Wallet[] {
  return baseWallets.map((wallet) => ({ ...wallet }));
}

export function cloneBanks(): Bank[] {
  return baseBanks.map((bank) => ({ ...bank }));
}

export function cloneAccountDirectory(): Record<string, AccountDirectoryRecord> {
  return Object.fromEntries(
    Object.entries(baseAccountDirectory).map(([key, value]) => [
      key,
      { ...value },
    ]),
  );
}

export const exchangeRates = {
  "NGN-USD": 0.00062,
  "USD-NGN": 1612.5,
  "NGN-GBP": 0.00049,
  "GBP-NGN": 2040.82,
  "NGN-EUR": 0.00057,
  "EUR-NGN": 1754.39,
  "NGN-GHS": 0.0094,
  "GHS-NGN": 106.38,
  "NGN-KES": 0.08,
  "KES-NGN": 12.5,
  "USD-GBP": 0.79,
  "GBP-USD": 1.27,
  "USD-EUR": 0.92,
  "EUR-USD": 1.09,
  "KES-GBP": 0.0061,
  "GBP-KES": 163.93,
  "KES-USD": 0.0077,
  "USD-KES": 129.87,
  "GHS-USD": 0.066,
  "USD-GHS": 15.15,
} as const satisfies Record<string, number>;

export type ExchangeRatePair = keyof typeof exchangeRates;

export function isExchangeRatePair(pair: string): pair is ExchangeRatePair {
  return Object.prototype.hasOwnProperty.call(exchangeRates, pair);
}
