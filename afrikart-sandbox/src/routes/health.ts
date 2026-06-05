import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import type { AppEnv } from "../context";
import { getSandbox, getStore } from "../context";
import {
  businessSchema,
  healthSchema,
  jsonResponse,
  secretRoute,
  successSchema,
} from "../openapi";
import { authSecret } from "../middleware";
import { nowIso } from "../utils";

export function registerHealthRoutes(app: Hono<AppEnv>): void {
  const profile = new Hono<AppEnv>();
  profile.use("*", authSecret);

  app.get(
    "/health",
    describeRoute({
      tags: ["Health"],
      summary: "Health check",
      responses: {
        200: jsonResponse("Server health and active chaos rate", healthSchema),
      },
    }),
    (c) =>
      c.json({
        status: "ok",
        service: "afrikart-sandbox-api",
        version: "2.0.0",
        chaosRate: getSandbox(c).getConfig().chaosRate,
        timestamp: nowIso(),
      }),
  );

  profile.get(
    "/business",
    describeRoute(
      secretRoute({
        tags: ["Health"],
        summary: "Get business profile",
        responses: {
          200: jsonResponse("Business profile", successSchema(businessSchema)),
        },
      }),
    ),
    (c) => c.json({ success: true, data: getStore(c).business }),
  );

  app.route("/profile", profile);
}
