interface RuntimeEnvInput {
  PORT?: string | number;
  PUBLIC_BASE_URL?: string;
  FINCRA_SECRET_KEY?: string;
  FINCRA_PUBLIC_KEY?: string;
  FINCRA_WEBHOOK_SECRET?: string;
  WEBHOOK_TARGET_URL?: string;
  CHAOS_RATE?: string | number;
  PAYOUT_DELAY_MS?: string | number;
  SLOW_PAYOUT_DELAY_MS?: string | number;
}

export interface RuntimeConfig {
  port: number;
  publicBaseUrl: string;
  secretKey: string;
  publicKey: string;
  webhookSecret: string;
  webhookTargetUrl: string;
  chaosRate: number;
  payoutDelayMs: number;
  slowPayoutDelayMs: number;
}

export function resolveRuntimeConfig(
  input: RuntimeEnvInput = (globalThis as { process?: { env?: RuntimeEnvInput } })
    .process?.env ?? {},
): RuntimeConfig {
  return {
    port: Number(input.PORT ?? 4000),
    publicBaseUrl: input.PUBLIC_BASE_URL ?? "",
    secretKey: input.FINCRA_SECRET_KEY ?? "sk_test_afrikart_secret",
    publicKey: input.FINCRA_PUBLIC_KEY ?? "pk_test_afrikart_public",
    webhookSecret: input.FINCRA_WEBHOOK_SECRET ?? "whsec_afrikart_secret",
    webhookTargetUrl: input.WEBHOOK_TARGET_URL ?? "",
    chaosRate: Number.parseFloat(String(input.CHAOS_RATE ?? "0")),
    payoutDelayMs: Number(input.PAYOUT_DELAY_MS ?? 2000),
    slowPayoutDelayMs: Number(input.SLOW_PAYOUT_DELAY_MS ?? 15000),
  };
}

export const localRuntimeConfig = resolveRuntimeConfig();

export const PORT = localRuntimeConfig.port;
export const PUBLIC_BASE_URL = localRuntimeConfig.publicBaseUrl;
export const SECRET_KEY = localRuntimeConfig.secretKey;
export const PUBLIC_KEY = localRuntimeConfig.publicKey;
export const WEBHOOK_SECRET = localRuntimeConfig.webhookSecret;
export const WEBHOOK_TARGET_URL = localRuntimeConfig.webhookTargetUrl;
export const CHAOS_RATE = localRuntimeConfig.chaosRate;
export const PAYOUT_DELAY_MS = localRuntimeConfig.payoutDelayMs;
export const SLOW_PAYOUT_DELAY_MS = localRuntimeConfig.slowPayoutDelayMs;

export const FEE_CONFIG = {
  checkoutRate: 0.015,
  vatRate: 0.075,
  conversionRate: 0.01,
  localPayoutFlatFee: 50,
  crossCurrencyPayoutRate: 0.015,
} as const;

export const TIMING_CONFIG = {
  virtualAccountApprovalDelayMs: 3_000,
  virtualAccountExpiryMs: 30 * 60_000,
  checkoutVirtualAccountExpiryMs: 30 * 60_000,
  quoteTtlMs: 5 * 60_000,
  chargebackDeadlineMs: 7 * 86_400_000,
} as const;
