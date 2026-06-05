import { Hono } from "hono";
import { cors } from "hono/cors";
import { swaggerUI } from "@hono/swagger-ui";
import { openAPIRouteHandler } from "hono-openapi";

import { localSandboxBackend } from "./backend/in-memory";
import type { SandboxBackend } from "./backend/types";
import type { AppEnv } from "./context";
import { registerCheckoutRoutes } from "./routes/checkout";
import { registerConversionRoutes } from "./routes/conversions";
import { registerEventRoutes } from "./routes/events";
import { registerHealthRoutes } from "./routes/health";
import { registerIdentityRoutes } from "./routes/identity";
import { registerPayoutRoutes } from "./routes/payouts";
import { registerSimulationRoutes } from "./routes/simulation";
import { registerVirtualAccountRoutes } from "./routes/virtual-accounts";
import { registerWalletRoutes } from "./routes/wallets";
import { apiDocumentation } from "./openapi";

export function createApp(backend: SandboxBackend): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", cors());
  app.use("*", async (c, next) => {
    const store = await backend.load();
    c.set("sandbox", backend);
    c.set("store", store);
    try {
      await next();
    } finally {
      await backend.flush(store);
    }
  });

  app.get(
    "/openapi.json",
    openAPIRouteHandler(app, {
      documentation: apiDocumentation,
      includeEmptyPaths: false,
      exclude: [/^\/(?:docs|openapi\.json)$/],
    }),
  );

  app.get(
    "/docs",
    swaggerUI({
      title: "Afrikart Sandbox API Docs",
      url: "/openapi.json",
    }),
  );

  registerHealthRoutes(app);
  registerWalletRoutes(app);
  registerIdentityRoutes(app);
  registerVirtualAccountRoutes(app);
  registerCheckoutRoutes(app);
  registerConversionRoutes(app);
  registerPayoutRoutes(app);
  registerSimulationRoutes(app);
  registerEventRoutes(app);

  app.notFound((c) =>
    c.json(
      {
        success: false,
        error: `Route not found: ${c.req.method} ${new URL(c.req.url).pathname}`,
      },
      404,
    ),
  );

  app.onError((error, c) => {
    console.error(error);
    return c.json(
      {
        success: false,
        error: "Internal server error",
      },
      500,
    );
  });

  return app;
}

const app = createApp(localSandboxBackend);
export default app;
