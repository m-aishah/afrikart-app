import type { BalanceLogType, Store, Wallet } from "../types";
import { createReference, nowIso } from "../utils";

export function walletForCurrency(
  store: Store,
  currency: string,
): Wallet | undefined {
  return store.wallets.find((wallet) => wallet.currency === currency);
}

export function addBalanceLog(
  store: Store,
  currency: string,
  type: BalanceLogType,
  amount: number,
  reference: string,
  description: string,
): void {
  const wallet = walletForCurrency(store, currency);
  store.balanceLogs.unshift({
    id: createReference("log"),
    currency,
    type,
    amount,
    balanceAfter: wallet ? wallet.balance : null,
    availableAfter: wallet ? wallet.availableBalance : null,
    reference,
    description,
    createdAt: nowIso(),
  });

  if (store.balanceLogs.length > 1000) {
    store.balanceLogs.length = 1000;
  }
}
