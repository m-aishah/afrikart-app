import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import type { AppEnv } from "../context";
import { getSandbox, getStore } from "../context";
import { authSecret } from "../middleware";
import {
  errorSchema,
  eventIdParamSchema,
  eventsQuerySchema,
  eventsResponseSchema,
  jsonResponse,
  secretRoute,
  successWithMessageSchema,
  validateParam,
  validateQuery,
  webhookEventSchema,
} from "../openapi";
import { dispatchWebhook } from "../services/webhooks";
import { notFound, paginate, parsePage } from "../utils";

export function registerEventRoutes(app: Hono<AppEnv>): void {
  const eventsApp = new Hono<AppEnv>();
  eventsApp.use("*", authSecret);

  eventsApp.get(
    "/",
    describeRoute(
      secretRoute({
        tags: ["Events"],
        summary: "List webhook events",
        responses: {
          200: jsonResponse("Webhook events", eventsResponseSchema),
        },
      }),
    ),
    validateQuery(eventsQuerySchema),
    (c) => {
      const store = getStore(c);
      const config = getSandbox(c).getConfig();
      const query = c.req.valid("query");
      const event = query.event;
      const limit = parsePage(query.limit, 50, 200);
      let events = [...store.events];

      if (event) events = events.filter((entry) => entry.event === event);

      const paginated = paginate(events, 1, limit);

      return c.json({
        success: true,
        data: paginated.results,
        meta: {
          total: paginated.total,
          webhookTargetUrl: config.webhookTargetUrl || null,
          webhookHeader: "x-fincra-signature",
          webhookAlgorithm: "HMAC-SHA512",
          webhookSecretConfigured: Boolean(config.webhookSecret),
        },
      });
    },
  );

  app.route("/events", eventsApp);

  const webhookReplay = new Hono<AppEnv>();
  webhookReplay.use("*", authSecret);

  webhookReplay.post(
    "/:eventId",
    describeRoute(
      secretRoute({
        tags: ["Events"],
        summary: "Replay a webhook event",
        responses: {
          200: jsonResponse(
            "Webhook replayed",
            successWithMessageSchema(webhookEventSchema),
          ),
          404: jsonResponse("Event not found", errorSchema),
        },
      }),
    ),
    validateParam(eventIdParamSchema),
    async (c) => {
      const store = getStore(c);
      const sandbox = getSandbox(c);
      const { eventId } = c.req.valid("param");
      const event = store.events.find((entry) => entry.id === eventId);

      if (!event) {
        return notFound(c, "Event not found");
      }

      const replay = await dispatchWebhook(
        sandbox,
        store,
        event.event,
        event.payload.data,
      );
      return c.json({
        success: true,
        message: "Webhook replayed",
        data: replay,
      });
    },
  );

  app.route("/simulate/webhooks/replay", webhookReplay);
}
