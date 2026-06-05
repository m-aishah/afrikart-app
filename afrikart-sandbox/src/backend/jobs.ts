import type { SandboxBackend, ScheduledJob } from "./types";
import { addBalanceLog, walletForCurrency } from "../services/ledger";
import { dispatchWebhook } from "../services/webhooks";
import type { Store } from "../types";
import { nowIso } from "../utils";

export async function processScheduledJob(
  backend: SandboxBackend,
  store: Store,
  job: ScheduledJob,
): Promise<void> {
  switch (job.type) {
    case "dispatchWebhook": {
      await dispatchWebhook(backend, store, job.eventName, job.data);
      return;
    }

    case "approveVirtualAccount": {
      const account = store.virtualAccounts.get(job.virtualAccountId);
      if (!account || account.status !== "pending") return;

      account.status = "approved";
      account.updatedAt = nowIso();
      await dispatchWebhook(backend, store, "virtualaccount.approved", account);
      return;
    }

    case "resolvePayout": {
      const payout = store.payouts.get(job.payoutReference);
      if (!payout || payout.status !== "processing") return;

      const shouldFail = payout.recipient.accountNumber.endsWith("9");
      payout.status = shouldFail ? "failed" : "successful";
      payout.reason = shouldFail
        ? "Destination institution timeout"
        : "Payout was successful";
      payout.updatedAt = nowIso();

      if (shouldFail) {
        const wallet = walletForCurrency(store, payout.sourceCurrency);
        if (wallet) {
          wallet.balance += payout.amountCharged;
          wallet.availableBalance += payout.amountCharged;
          addBalanceLog(
            store,
            payout.sourceCurrency,
            "credit",
            payout.amountCharged,
            payout.reference,
            `Payout reversal - ${payout.reason}`,
          );
        }
      }

      await dispatchWebhook(
        backend,
        store,
        shouldFail ? "payout.failed" : "payout.successful",
        payout,
      );
    }
  }
}
