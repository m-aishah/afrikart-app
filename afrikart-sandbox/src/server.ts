/**
 * AFRIKART SANDBOX API SERVER (Merged v2)
 * ==========================================
 * Hono + Bun mock of Fincra-style payment flows for take-home use.
 */

import app from "./app";
import {
  CHAOS_RATE,
  PORT,
  PUBLIC_BASE_URL,
  SLOW_PAYOUT_DELAY_MS,
  WEBHOOK_TARGET_URL,
} from "./config";
import { getSandboxSummary } from "./runtime";

if (import.meta.main) {
  const server = Bun.serve({
    port: PORT,
    fetch: app.fetch,
  });
  const sandboxSummary = await getSandboxSummary();
  const openApiUrl = new URL("/openapi.json", server.url).toString();
  const docsUrl = new URL("/docs", server.url).toString();
  const bannerContentWidth = 78;
  const bannerLine = (content = "") =>
    `║ ${content.slice(0, bannerContentWidth).padEnd(bannerContentWidth)} ║`;
  const bannerField = (label: string, value: string) =>
    bannerLine(` ${label.padEnd(12)} ${value}`);

  console.log(`
╔════════════════════════════════════════════════════════════════════════════════╗
${bannerLine("           AFRIKART SANDBOX API SERVER v2")}
╠════════════════════════════════════════════════════════════════════════════════╣
${bannerField("URL:", server.url.toString())}
${bannerField("Public URL:", PUBLIC_BASE_URL || "(not set)")}
${bannerField("OpenAPI:", openApiUrl)}
${bannerField("Docs:", docsUrl)}
${bannerField("Chaos Rate:", `${CHAOS_RATE}%`)}
${bannerField("Webhook:", WEBHOOK_TARGET_URL || "(not set)")}
${bannerLine()}
${bannerField("Secret Key:", "(configured)")}
${bannerField("Public Key:", "(configured)")}
${bannerField("Admin Key:", "(configured)")}
${bannerField("Business ID:", sandboxSummary.businessId)}
${bannerField("Webhook Key:", "(configured)")}
${bannerLine()}
${bannerLine(" Failure triggers:")}
${bannerLine("   Account ending in 9 → payout fails")}
${bannerLine(
  `   Account ending in 7 → payout slow (${String(SLOW_PAYOUT_DELAY_MS / 1000)}s)`,
)}
${bannerLine(`   CHAOS_RATE=${String(CHAOS_RATE).padEnd(4)} → random 503s`)}
╚════════════════════════════════════════════════════════════════════════════════╝
`);
}

export default app;
