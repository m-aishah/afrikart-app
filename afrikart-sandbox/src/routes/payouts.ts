import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import type { AppEnv } from "../context";
import { getSandbox, getStore } from "../context";
import { authSecret, chaosGuard } from "../middleware";
import {
  errorSchema,
  jsonResponse,
  payoutListSchema,
  payoutReferenceParamSchema,
  payoutRequestSchema,
  payoutSchema,
  payoutsQuerySchema,
  providerUnavailableResponse,
  secretRoute,
  successSchema,
  successWithMessageSchema,
  validateJson,
  validateParam,
  validateQuery,
} from "../openapi";
import { walletForCurrency } from "../services/ledger";
import {
  calculatePayoutAmounts,
  createPayout,
  parsePayoutRequest,
  recordPayoutCreation,
  reservePayoutFunds,
  schedulePayoutResolution,
  validatePayoutRequest,
} from "../services/payouts";
import { validateQuote } from "../services/quotes";
import { notFound, paginate } from "../utils";

export function registerPayoutRoutes(app: Hono<AppEnv>): void {
  const payouts = new Hono<AppEnv>();
  payouts.use("*", authSecret);

  payouts.post(
    "/bank",
    describeRoute(
      secretRoute({
        tags: ["Payouts"],
        summary: "Create a bank payout",
        description:
          "Cross-currency payouts require quoteReference. Account numbers ending in 9 fail, and those ending in 7 resolve slowly.",
        parameters: [
          {
            in: "header",
            name: "x-idempotency-key",
            required: false,
            schema: { type: "string" },
            description: "Optional idempotency key for replay-safe payout creation.",
          },
        ],
        responses: {
          200: jsonResponse(
            "Idempotent payout replay",
            successWithMessageSchema(payoutSchema),
          ),
          201: jsonResponse("Created payout", successSchema(payoutSchema)),
          400: jsonResponse("Validation or balance error", errorSchema),
          ...providerUnavailableResponse,
        },
      }),
    ),
    chaosGuard,
    validateJson(payoutRequestSchema),
    async (c) => {
      const store = getStore(c);
      const sandbox = getSandbox(c);
      const body = c.req.valid("json");
      const idempotencyKey = c.req.header("x-idempotency-key");
      const request = parsePayoutRequest(body);

      if (idempotencyKey && store.idempotencyStore.has(idempotencyKey)) {
        const cached = store.idempotencyStore.get(idempotencyKey);
        return c.json({
          success: true,
          message: "Payout already processed (idempotent)",
          data: cached,
        });
      }

      const validationError = validatePayoutRequest(request);
      if (validationError) {
        return c.json(validationError.body, validationError.status);
      }

      if (request.quoteReference) {
        const { error } = validateQuote(store, request.quoteReference, {
          sourceCurrency: request.sourceCurrency,
          destinationCurrency: request.destinationCurrency,
          amount: request.amount,
          expiredError: "Quote has expired. Please fetch a new quote.",
        });
        if (error) {
          return c.json({ success: false, ...error }, 400);
        }
      }

      const wallet = walletForCurrency(store, request.sourceCurrency);
      if (!wallet) {
        return c.json(
          {
            success: false,
            error: `Unsupported source currency: ${request.sourceCurrency}`,
          },
          400,
        );
      }

      const amounts = calculatePayoutAmounts(
        request.sourceCurrency,
        request.destinationCurrency,
        request.amount,
      );

      if (!reservePayoutFunds(wallet, amounts.totalDebit)) {
        return c.json(
          {
            success: false,
            error: "Insufficient balance",
            errorType: "INSUFFICIENT_FUNDS",
          },
          400,
        );
      }

      const payout = createPayout(request, amounts);
      store.payouts.set(payout.reference, payout);
      recordPayoutCreation(store, payout);

      if (idempotencyKey) {
        store.idempotencyStore.set(idempotencyKey, payout);
      }

      await schedulePayoutResolution(sandbox, payout);

      return c.json({ success: true, data: payout }, 201);
    },
  );

  payouts.get(
    "/reference/:reference",
    describeRoute(
      secretRoute({
        tags: ["Payouts"],
        summary: "Get a payout by reference",
        responses: {
          200: jsonResponse("Payout", successSchema(payoutSchema)),
          404: jsonResponse("Payout not found", errorSchema),
        },
      }),
    ),
    validateParam(payoutReferenceParamSchema),
    (c) => {
      const store = getStore(c);
      const { reference } = c.req.valid("param");
      const payout = store.payouts.get(reference);

      if (!payout) {
        return notFound(c, "Payout not found");
      }

      return c.json({ success: true, data: payout });
    },
  );

  payouts.get(
    "/",
    describeRoute(
      secretRoute({
        tags: ["Payouts"],
        summary: "List payouts",
        responses: {
          200: jsonResponse("Payout list", successSchema(payoutListSchema)),
        },
      }),
    ),
    validateQuery(payoutsQuerySchema),
    (c) => {
      const store = getStore(c);
      const { status } = c.req.valid("query");
      let payouts = [...store.payouts.values()];

      if (status) payouts = payouts.filter((item) => item.status === status);

      const paginated = paginate(payouts, 1, payouts.length || 1);

      return c.json({
        success: true,
        data: { results: paginated.results, total: paginated.total },
      });
    },
  );

  app.route("/disbursements/payouts", payouts);
}
