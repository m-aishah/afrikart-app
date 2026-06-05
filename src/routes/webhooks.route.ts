import { Router, Request, Response, NextFunction } from "express";
import { verifyWebhookSignature, getWebhookSecret } from "../lib/webhook-verify.js";
import { handleWebhook, WebhookPayload } from "../services/webhook.service.js";
import { logger } from "../lib/logger.js";

export const webhooksRouter = Router();

/**
 * Middleware: verify x-fincra-signature before any webhook processing.
 * We need the raw body string for HMAC — Express must be configured with
 * express.raw({ type: 'application/json' }) on this route.
 */
function requireValidSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers["x-fincra-signature"] as string | undefined;

  if (!signature) {
    logger.warn("webhook received without x-fincra-signature");
    res.status(401).json({ success: false, error: "Missing webhook signature" });
    return;
  }

  const rawBody = req.body instanceof Buffer ? req.body.toString("utf8") : JSON.stringify(req.body);

  let secret: string;
  try {
    secret = getWebhookSecret();
  } catch {
    res.status(500).json({ success: false, error: "Webhook secret not configured" });
    return;
  }

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    logger.warn({ signature: signature.slice(0, 16) + "…" }, "webhook signature mismatch");
    res.status(401).json({ success: false, error: "Invalid webhook signature" });
    return;
  }

  // Attach parsed body for downstream use
  if (req.body instanceof Buffer) {
    try {
      req.body = JSON.parse(rawBody);
    } catch {
      res.status(400).json({ success: false, error: "Invalid JSON body" });
      return;
    }
  }

  next();
}

// POST /webhooks/fincra — Fincra delivers all event types here
webhooksRouter.post(
  "/fincra",
  requireValidSignature,
  async (req: Request, res: Response) => {
    const payload = req.body as WebhookPayload;

    // Fincra event id: may come from the payload or a header
    // We use payload.data.id for domain events, falling back to a timestamp-based key
    const eventId =
      (payload.data as Record<string, unknown>)?.["id"] as string ||
      `synthetic_${Date.now()}`;

    try {
      const result = await handleWebhook(eventId, payload);

      // Always return 200 to Fincra — even for duplicates and errors.
      // Non-200 would cause Fincra to retry, making duplicates worse.
      res.status(200).json({
        success: true,
        duplicate: result.duplicate,
        eventType: result.eventType,
      });
    } catch (err) {
      logger.error({ err, eventId }, "unexpected webhook handler error");
      // Still 200 — we've recorded the event, we'll reconcile manually
      res.status(200).json({ success: true, note: "Accepted with processing error" });
    }
  }
);
