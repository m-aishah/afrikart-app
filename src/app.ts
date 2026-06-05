import express from "express";
import { ordersRouter } from "./routes/orders.route.js";
import { webhooksRouter } from "./routes/webhooks.route.js";
import { healthRouter } from "./routes/health.route.js";
import { logger } from "./lib/logger.js";

export function createApp() {
  const app = express();

  // Parse webhooks as raw buffer FIRST so we can verify HMAC on the raw bytes
  app.use(
    "/webhooks",
    express.raw({ type: "application/json" })
  );

  // JSON for everything else
  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, "request");
    next();
  });

  app.use("/health", healthRouter);
  app.use("/orders", ordersRouter);
  app.use("/webhooks", webhooksRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: "Not found" });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "unhandled error");
    res.status(500).json({ success: false, error: "Internal server error" });
  });

  return app;
}
