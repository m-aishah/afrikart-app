import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  createOrder,
  getOrderTimeline,
  getOrderById,
} from "../services/order.service.js";
import { initiatePayout } from "../services/payout.service.js";

export const ordersRouter = Router();

const CreateOrderSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().optional(),
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  metadata: z.record(z.unknown()).optional(),
  reference: z.string().optional(),
});

const InitiatePayoutSchema = z.object({
  amount: z.number().positive(),
  sourceCurrency: z.string().optional(),
  destinationCurrency: z.string().optional(),
  recipientName: z.string().min(1),
  recipientAccount: z.string().min(1),
  recipientBankCode: z.string().min(1),
  recipientEmail: z.string().email().optional(),
  customerReference: z.string().optional(),
  narration: z.string().optional(),
  quoteReference: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

// POST /orders — initiate a checkout
ordersRouter.post("/", async (req: Request, res: Response) => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await createOrder(parsed.data);
    res.status(201).json({ success: true, data: result });
  } catch (err: unknown) {
    const e = err as { message: string; status?: number; errorType?: string };
    res.status(e.status ?? 502).json({
      success: false,
      error: e.message,
      errorType: e.errorType,
    });
  }
});

// GET /orders/:orderId — fetch order and its full timeline
ordersRouter.get("/:orderId", (req: Request, res: Response) => {
  const timeline = getOrderTimeline(req.params.orderId);
  if (!timeline) {
    res.status(404).json({ success: false, error: "Order not found" });
    return;
  }
  res.json({ success: true, data: timeline });
});

// POST /orders/:orderId/payouts — initiate a payout for a settled order
ordersRouter.post("/:orderId/payouts", async (req: Request, res: Response) => {
  const order = getOrderById(req.params.orderId);
  if (!order) {
    res.status(404).json({ success: false, error: "Order not found" });
    return;
  }

  if (order.status !== "settled") {
    res.status(422).json({
      success: false,
      error: `Order is not settled (current status: ${order.status}). Cannot initiate payout.`,
    });
    return;
  }

  const parsed = InitiatePayoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await initiatePayout({
      orderId: req.params.orderId,
      ...parsed.data,
    });
    res.status(result.idempotent ? 200 : 201).json({
      success: true,
      idempotent: result.idempotent,
      data: result.payout,
    });
  } catch (err: unknown) {
    const e = err as { message: string; status?: number; errorType?: string };
    res.status(e.status && e.status > 0 ? e.status : 502).json({
      success: false,
      error: e.message,
      errorType: e.errorType,
    });
  }
});
