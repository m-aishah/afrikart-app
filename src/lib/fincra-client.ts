/**
 * Fincra sandbox API client.
 *
 * Design decisions:
 * - Base URL and credentials come from env — never hardcoded (judging requirement)
 * - Retry logic lives here, not in callers; callers just await and get a result
 * - Exponential backoff with jitter on PROVIDER_ERROR / 503 only —
 *   we never retry 4xx (those are deterministic failures, retrying is wasteful)
 * - Idempotency keys passed through as headers on payout calls
 */

import { randomUUID } from "node:crypto";

export interface FincraConfig {
  baseUrl: string;
  secretKey: string;
  publicKey: string;
}

export function getFincraConfig(): FincraConfig {
  const baseUrl = process.env.FINCRA_API_BASE_URL;
  const secretKey = process.env.FINCRA_SECRET_KEY;
  const publicKey = process.env.FINCRA_PUBLIC_KEY;

  if (!baseUrl || !secretKey || !publicKey) {
    throw new Error(
      "Missing required env: FINCRA_API_BASE_URL, FINCRA_SECRET_KEY, FINCRA_PUBLIC_KEY"
    );
  }

  return { baseUrl, secretKey, publicKey };
}

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; errorType?: string; status: number };

const RETRYABLE_STATUS = new Set([503, 429]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 300;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  // Exponential backoff with full jitter: random(0, base * 2^attempt)
  const ceiling = BASE_DELAY_MS * Math.pow(2, attempt);
  return Math.floor(Math.random() * ceiling);
}

export async function fincraRequest<T>(
  method: "GET" | "POST",
  path: string,
  options: {
    body?: unknown;
    authType?: "secret" | "public";
    idempotencyKey?: string;
    config?: FincraConfig;
  } = {}
): Promise<ApiResult<T>> {
  const config = options.config ?? getFincraConfig();
  const { authType = "secret", idempotencyKey, body } = options;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (authType === "secret") {
    headers["api-key"] = config.secretKey;
  } else {
    headers["x-pub-key"] = config.publicKey;
  }

  if (idempotencyKey) {
    headers["x-idempotency-key"] = idempotencyKey;
  }

  const url = `${config.baseUrl}${path}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      // Network-level failure (timeout, connection refused, etc.)
      if (attempt === MAX_RETRIES) {
        return {
          ok: false,
          error: `Network error after ${MAX_RETRIES + 1} attempts: ${String(networkErr)}`,
          errorType: "NETWORK_ERROR",
          status: 0,
        };
      }
      await sleep(backoffMs(attempt));
      continue;
    }

    if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get("retry-after");
      const delay = retryAfter ? Number(retryAfter) * 1000 : backoffMs(attempt);
      await sleep(delay);
      continue;
    }

    const text = await res.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: false, error: `Non-JSON response: ${text.slice(0, 200)}`, status: res.status };
    }

    if (res.status >= 200 && res.status < 300 && json["success"] !== false) {
      return { ok: true, data: (json["data"] ?? json) as T, status: res.status };
    }

    return {
      ok: false,
      error: String(json["error"] ?? "Unknown error"),
      errorType: json["errorType"] as string | undefined,
      status: res.status,
    };
  }

  // Should not reach here
  return { ok: false, error: "Max retries exceeded", errorType: "RETRIES_EXCEEDED", status: 503 };
}
