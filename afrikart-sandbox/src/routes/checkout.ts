import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import { TIMING_CONFIG } from "../config";
import type { AppEnv } from "../context";
import { getSandbox, getStore } from "../context";
import { authPublic, authSecret, chaosGuard } from "../middleware";
import {
  checkoutInitiateRequestSchema,
  checkoutInitiationDataSchema,
  errorSchema,
  jsonResponse,
  paymentReferenceParamSchema,
  paymentSchema,
  providerUnavailableResponse,
  publicRoute,
  secretRoute,
  successSchema,
  validateJson,
  validateParam,
} from "../openapi";
import { calculateCheckoutCharges } from "../services/payments";
import {
  asOptionalString,
  asRecord,
  asRequiredString,
  createReference,
  notFound,
  nowIso,
  randomDigits,
  toNumber,
} from "../utils";
import type { Payment } from "../types";

export function registerCheckoutRoutes(app: Hono<AppEnv>): void {
  const checkout = new Hono<AppEnv>();
  checkout.use("/initiate", authPublic);
  checkout.use("/payments/*", authSecret);

  checkout.post(
    "/initiate",
    describeRoute(
      publicRoute({
        tags: ["Checkout"],
        summary: "Initiate a checkout payment",
        description:
          "Creates a pending checkout payment with a temporary virtual account and placeholder checkout URL.",
        responses: {
          201: jsonResponse(
            "Checkout payment initiated",
            successSchema(checkoutInitiationDataSchema),
          ),
          400: jsonResponse("Validation error", errorSchema),
          409: jsonResponse("Duplicate payment reference", errorSchema),
          ...providerUnavailableResponse,
        },
      }),
    ),
    chaosGuard,
    validateJson(checkoutInitiateRequestSchema),
    async (c) => {
      const store = getStore(c);
      const { publicBaseUrl, port } = getSandbox(c).getConfig();
      const body = c.req.valid("json");
      const amount = toNumber(body.amount);
      const currency = asOptionalString(body.currency)?.toUpperCase() ?? "NGN";
      const reference = asOptionalString(body.reference);
      const feeBearer = asOptionalString(body.feeBearer) ?? "business";
      const metadata = asRecord(body.metadata);
      const customer = asRecord(body.customer);
      const redirectUrl = asOptionalString(body.redirectUrl);

      if (!Number.isFinite(amount) || amount <= 0) {
        return c.json(
          { success: false, error: "amount must be greater than zero" },
          400,
        );
      }

      if (!asOptionalString(customer.name) || !asOptionalString(customer.email)) {
        return c.json(
          {
            success: false,
            error: "customer.name and customer.email are required",
          },
          400,
        );
      }

      const txRef = reference ?? createReference("pay");
      if (store.payments.has(txRef)) {
        return c.json(
          {
            success: false,
            error: "Duplicate reference — payment already exists",
          },
          409,
        );
      }

      const { fee, vat } = calculateCheckoutCharges(amount);

      const payment: Payment = {
        id: createReference("txn"),
        reference: txRef,
        amount,
        currency,
        fee,
        vat,
        feeBearer,
        metadata,
        customer: {
          ...customer,
          name: asRequiredString(customer.name),
          email: asRequiredString(customer.email),
        },
        redirectUrl: redirectUrl ?? null,
        status: "pending",
        paymentDestination: "checkout",
        virtualAccount: {
          bankName: "Globus Bank",
          accountName: "Afrikart Demo Business",
          accountNumber: randomDigits(10),
          bankCode: "103",
          expiresAt: new Date(
            Date.now() + TIMING_CONFIG.checkoutVirtualAccountExpiryMs,
          ).toISOString(),
        },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      store.payments.set(txRef, payment);
      const checkoutBaseUrl = publicBaseUrl || `http://localhost:${port}`;

      return c.json(
        {
          success: true,
          data: {
            reference: txRef,
            checkoutUrl: `${checkoutBaseUrl}/checkout/mock/${txRef}`,
            payment,
          },
        },
        201,
      );
    },
  );

  checkout.get(
    "/payments/:reference",
    describeRoute(
      secretRoute({
        tags: ["Checkout"],
        summary: "Get a checkout payment by reference",
        responses: {
          200: jsonResponse("Checkout payment", successSchema(paymentSchema)),
          404: jsonResponse("Payment not found", errorSchema),
        },
      }),
    ),
    validateParam(paymentReferenceParamSchema),
    (c) => {
      const store = getStore(c);
      const { reference } = c.req.valid("param");
      const payment = store.payments.get(reference);

      if (!payment) {
        return notFound(c, "Payment not found");
      }

      return c.json({ success: true, data: payment });
    },
  );

  app.route("/checkout", checkout);
}
