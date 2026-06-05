import { Router, Request, Response } from "express";
import { getDb } from "../db/index.js";

export const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  try {
    // Simple DB liveness check
    getDb().prepare("SELECT 1").get();
    res.json({
      status: "ok",
      service: "afrikart-payment-service",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      db: "ok",
    });
  } catch {
    res.status(503).json({ status: "degraded", db: "error" });
  }
});
