import { createHmac } from "node:crypto";

import type { SandboxBackend } from "../backend/types";
import type { WebhookEvent, WebhookPayload } from "../types";
import { createReference, nowIso } from "../utils";
import type { Store } from "../types";

export function signPayload(payload: string, webhookSecret: string): string {
  return createHmac("sha512", webhookSecret).update(payload).digest("hex");
}

export async function dispatchWebhook(
  backend: SandboxBackend,
  store: Store,
  eventName: string,
  data: unknown,
): Promise<WebhookEvent> {
  const config = backend.getConfig();
  const payloadObj: WebhookPayload = { event: eventName, data };
  const payload = JSON.stringify(payloadObj);
  const signature = signPayload(payload, config.webhookSecret);

  const entry: WebhookEvent = {
    id: createReference("evt"),
    event: eventName,
    delivered: false,
    payload: payloadObj,
    signature,
    createdAt: nowIso(),
    target: config.webhookTargetUrl || null,
  };

  if (config.webhookTargetUrl) {
    try {
      const response = await fetch(config.webhookTargetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-fincra-signature": signature,
        },
        body: payload,
      });
      entry.delivered = response.ok;
      entry.httpStatus = response.status;
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
    }
  }

  store.events.unshift(entry);
  if (store.events.length > 500) {
    store.events.length = 500;
  }

  return entry;
}

export async function scheduleWebhookDispatch(
  backend: SandboxBackend,
  eventName: string,
  data: unknown,
): Promise<void> {
  await backend.scheduleJob({
    id: createReference("job"),
    type: "dispatchWebhook",
    runAt: Date.now(),
    eventName,
    data,
  });
}
