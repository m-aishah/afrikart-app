import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./context";
import { getSandbox } from "./context";

const rateLimitBuckets = new Map<string, number[]>();
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  let entries = rateLimitBuckets.get(key) ?? [];
  entries = entries.filter((timestamp) => timestamp > now - RATE_WINDOW_MS);

  if (entries.length >= RATE_LIMIT) return false;

  entries.push(now);
  rateLimitBuckets.set(key, entries);
  return true;
}

export function resetRateLimitBuckets(): void {
  rateLimitBuckets.clear();
}

function authFailed(c: { json: (body: unknown, status: number) => Response }, message: string) {
  return c.json(
    { success: false, error: message, errorType: "AUTH_FAILED" },
    401,
  );
}

export const authSecret: MiddlewareHandler<AppEnv> = async (c, next) => {
  const credentials = await getSandbox(c).getDemoCredentials();
  const apiKey = c.req.header("api-key");
  if (apiKey !== credentials.secretKey) {
    return authFailed(c, "Invalid or missing api-key header");
  }

  if (!checkRateLimit(apiKey)) {
    return c.json(
      {
        success: false,
        error: "Rate limit exceeded. Max 120 requests per minute.",
        errorType: "RATE_LIMIT",
        retryAfter: 60,
      },
      429,
    );
  }

  await next();
};

export const authPublic: MiddlewareHandler<AppEnv> = async (c, next) => {
  const credentials = await getSandbox(c).getDemoCredentials();
  const pubKey = c.req.header("x-pub-key");
  if (pubKey !== credentials.publicKey) {
    return authFailed(c, "Invalid or missing x-pub-key header");
  }

  await next();
};

export const chaosGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const chaosRate = getSandbox(c).getConfig().chaosRate;
  if (chaosRate > 0 && Math.random() * 100 < chaosRate) {
    return c.json(
      {
        success: false,
        error: "Provider temporarily unavailable — please retry with backoff",
        errorType: "PROVIDER_ERROR",
      },
      503,
    );
  }

  await next();
};
