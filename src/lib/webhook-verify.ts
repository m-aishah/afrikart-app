import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Fincra webhook signature.
 *
 * Algorithm (from API.md):
 *   1. Serialize the raw payload with JSON.stringify
 *   2. Sign with HMAC-SHA512 using FINCRA_WEBHOOK_SECRET
 *   3. Compare hex digest with x-fincra-signature header
 *
 * We use timingSafeEqual to prevent timing attacks.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false;

  const expected = createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    // Buffers different length — definitely not equal
    return false;
  }
}

export function getWebhookSecret(): string {
  const secret = process.env.FINCRA_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing required env: FINCRA_WEBHOOK_SECRET");
  return secret;
}
