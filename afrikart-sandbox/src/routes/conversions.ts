import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import { FEE_CONFIG, TIMING_CONFIG } from "../config";
import type { AppEnv } from "../context";
import { getSandbox, getStore } from "../context";
import { authSecret, chaosGuard } from "../middleware";
import {
  conversionExecutionRequestSchema,
  conversionSchema,
  conversionsQuerySchema,
  errorSchema,
  jsonResponse,
  paginatedConversionsSchema,
  providerUnavailableResponse,
  quoteRequestSchema,
  quoteSchema,
  secretRoute,
  successSchema,
  successWithMessageSchema,
  validateJson,
  validateQuery,
} from "../openapi";
import { validateQuote } from "../services/quotes";
import { scheduleWebhookDispatch } from "../services/webhooks";
import { exchangeRates, isExchangeRatePair } from "../store";
import {
  asOptionalString,
  createReference,
  nowIso,
  paginate,
  parsePage,
  roundToCents,
  toNumber,
} from "../utils";
import type { Conversion, Quote } from "../types";

export function registerConversionRoutes(app: Hono<AppEnv>): void {
  const conversions = new Hono<AppEnv>();
  conversions.use("*", authSecret);

  conversions.post(
    "/quotes",
    describeRoute(
      secretRoute({
        tags: ["Conversions"],
        summary: "Generate an FX quote",
        responses: {
          200: jsonResponse(
            "Generated quote",
            successWithMessageSchema(quoteSchema),
          ),
          400: jsonResponse("Validation error", errorSchema),
        },
      }),
    ),
    validateJson(quoteRequestSchema),
    async (c) => {
      const store = getStore(c);
      const body = c.req.valid("json");
      const sourceCurrency = asOptionalString(body.sourceCurrency)?.toUpperCase();
      const destinationCurrency = asOptionalString(
        body.destinationCurrency,
      )?.toUpperCase();
      const amount = toNumber(body.amount);
      const action = asOptionalString(body.action) ?? "send";

      if (
        !sourceCurrency ||
        !destinationCurrency ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return c.json(
          {
            success: false,
            error:
              "sourceCurrency, destinationCurrency, and amount are required",
          },
          400,
        );
      }

      const pair = `${sourceCurrency}-${destinationCurrency}`;
      if (!isExchangeRatePair(pair)) {
        return c.json(
          { success: false, error: `Unsupported currency pair: ${pair}` },
          400,
        );
      }
      const rate = exchangeRates[pair];

      const fee = roundToCents(amount * FEE_CONFIG.conversionRate);
      const destinationAmount = roundToCents(amount * rate);
      const quoteRef = createReference("quote");
      const expiresAt = new Date(
        Date.now() + TIMING_CONFIG.quoteTtlMs,
      ).toISOString();

      const quote: Quote = {
        sourceCurrency,
        destinationCurrency,
        sourceAmount: amount,
        destinationAmount,
        action,
        transactionType: "disbursement",
        fee,
        rate,
        amountToCharge: amount + fee,
        amountToReceive: destinationAmount,
        reference: quoteRef,
        expireAt: expiresAt,
        createdAt: Date.now(),
      };

      store.quotes.set(quoteRef, quote);

      return c.json({
        success: true,
        message: "Quote generated successfully",
        data: {
          ...quote,
          createdAt: undefined,
        },
      });
    },
  );

  conversions.post(
    "/",
    describeRoute(
      secretRoute({
        tags: ["Conversions"],
        summary: "Execute a conversion from a quote",
        responses: {
          201: jsonResponse(
            "Executed conversion",
            successSchema(conversionSchema),
          ),
          400: jsonResponse("Validation or quote error", errorSchema),
          ...providerUnavailableResponse,
        },
      }),
    ),
    chaosGuard,
    validateJson(conversionExecutionRequestSchema),
    async (c) => {
      const store = getStore(c);
      const sandbox = getSandbox(c);
      const body = c.req.valid("json");
      const quoteReference = asOptionalString(body.quoteReference);

      if (!quoteReference) {
        return c.json(
          { success: false, error: "quoteReference is required" },
          400,
        );
      }

      const { quote, error } = validateQuote(store, quoteReference);
      if (!quote || error) {
        return c.json({ success: false, ...error }, 400);
      }

      const conversion: Conversion = {
        id: createReference("conv"),
        quoteReference,
        sourceCurrency: quote.sourceCurrency,
        destinationCurrency: quote.destinationCurrency,
        sourceAmount: quote.sourceAmount,
        destinationAmount: quote.destinationAmount,
        rate: quote.rate,
        fee: quote.fee,
        status: "successful",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      store.conversions.push(conversion);
      await scheduleWebhookDispatch(
        sandbox,
        "conversion.successful",
        conversion,
      );

      return c.json({ success: true, data: conversion }, 201);
    },
  );

  conversions.get(
    "/",
    describeRoute(
      secretRoute({
        tags: ["Conversions"],
        summary: "List conversions",
        responses: {
          200: jsonResponse(
            "Paginated conversions",
            successSchema(paginatedConversionsSchema),
          ),
        },
      }),
    ),
    validateQuery(conversionsQuerySchema),
    (c) => {
      const store = getStore(c);
      const query = c.req.valid("query");
      const sourceCurrency = query.sourceCurrency;
      const destinationCurrency = query.destinationCurrency;
      const page = parsePage(query.page, 1, Number.MAX_SAFE_INTEGER);
      const limit = parsePage(query.limit, 20, 100);

      let results = [...store.conversions];
      if (sourceCurrency) {
        results = results.filter(
          (item) => item.sourceCurrency === sourceCurrency.toUpperCase(),
        );
      }
      if (destinationCurrency) {
        results = results.filter(
          (item) =>
            item.destinationCurrency === destinationCurrency.toUpperCase(),
        );
      }

      return c.json({
        success: true,
        data: paginate(results, page, limit),
      });
    },
  );

  app.route("/conversions", conversions);
}
