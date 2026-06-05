import type { Payout, Quote, Store, VirtualAccount } from "../types";
import {
  cloneAccountDirectory,
  cloneBanks,
  cloneWallets,
  createBusiness,
} from "./seed-data";

export {
  exchangeRates,
  isExchangeRatePair,
  type ExchangeRatePair,
} from "./seed-data";

export function createStore(): Store {
  return {
    business: createBusiness(),
    wallets: cloneWallets(),
    banks: cloneBanks(),
    accountDirectory: cloneAccountDirectory(),
    virtualAccounts: new Map<string, VirtualAccount>(),
    payments: new Map(),
    payouts: new Map<string, Payout>(),
    chargebacks: new Map(),
    conversions: [],
    balanceLogs: [],
    events: [],
    quotes: new Map<string, Quote>(),
    idempotencyStore: new Map<string, Payout>(),
  };
}

export let store: Store = createStore();

export function resetStore(): Store {
  store = createStore();
  return store;
}
