import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import { TIMING_CONFIG } from "../config";
import type { AppEnv } from "../context";
import { getSandbox, getStore } from "../context";
import { authSecret } from "../middleware";
import {
  chargebackRequestSchema,
  chargebackSchema,
  checkoutCompleteRequestSchema,
  collectionSettlementRequestSchema,
  errorSchema,
  jsonResponse,
  paymentReferenceParamSchema,
  paymentSchema,
  secretRoute,
  simulationSchema,
  validateJson,
  validateParam,
} from "../openapi";
import { addBalanceLog, walletForCurrency } from "../services/ledger";
import { applyPaymentOutcome } from "../services/payments";
import { dispatchWebhook } from "../services/webhooks";
import {
  asOptionalString,
  asRequiredString,
  createReference,
  notFound,
  nowIso,
  toNumber,
} from "../utils";
import type { Chargeback } from "../types";

export function registerSimulationRoutes(app: Hono<AppEnv>): void {
  const simulate = new Hono<AppEnv>();
  simulate.use("/chargeback", authSecret);

  simulate.post(
    "/collections/settle",
    describeRoute({
      tags: ["Simulation"],
      summary: "Settle a collection into the business wallet",
      responses: {
        200: jsonResponse(
          "Collection settled",
          simulationSchema(paymentSchema),
        ),
        400: jsonResponse("Validation error", errorSchema),
        404: jsonResponse("Payment not found", errorSchema),
      },
    }),
    validateJson(collectionSettlementRequestSchema),
    async (c) => {
      const store = getStore(c);
      const sandbox = getSandbox(c);
      const body = c.req.valid("json");
      const reference = asRequiredString(body.reference);
      const status = asOptionalString(body.status) ?? "successful";
      const channel = asOptionalString(body.channel) ?? "bank_transfer";
      const payment = store.payments.get(reference);

      if (!payment) {
        return notFound(c, "Payment not found");
      }

      applyPaymentOutcome(store, payment, {
        status,
        channel,
        successDescription: `Collection from ${payment.customer.name}`,
      });

      const eventName =
        status === "successful" ? "collection.successful" : "collection.failed";
      const eventData = {
        id: payment.id,
        amountReceived: payment.amount,
        amountCredited: payment.amount,
        currency: payment.currency,
        fee: payment.fee,
        vat: payment.vat,
        paymentStatus: payment.status,
        paymentSource: channel,
        customer: payment.customer,
        feeBearer: payment.feeBearer,
        reference: payment.reference,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        metadata: payment.metadata,
        settlementDestination: "wallet",
      };

      const webhook = await dispatchWebhook(
        sandbox,
        store,
        eventName,
        eventData,
      );
      return c.json({ success: true, data: payment, webhook });
    },
  );

  simulate.post(
    "/checkout/complete/:reference",
    describeRoute({
      tags: ["Simulation"],
      summary: "Complete a checkout payment",
      responses: {
        200: jsonResponse(
          "Checkout completed",
          simulationSchema(paymentSchema),
        ),
        400: jsonResponse("Payment already completed", errorSchema),
        404: jsonResponse("Payment not found", errorSchema),
      },
    }),
    validateParam(paymentReferenceParamSchema),
    validateJson(checkoutCompleteRequestSchema),
    async (c) => {
      const store = getStore(c);
      const sandbox = getSandbox(c);
      const body = c.req.valid("json");
      const { reference } = c.req.valid("param");
      const type = asOptionalString(body.type) ?? "card";
      const status = asOptionalString(body.status) ?? "successful";
      const payment = store.payments.get(reference);

      if (!payment) {
        return notFound(c, "Payment not found");
      }

      if (payment.status === "successful") {
        return c.json(
          { success: false, error: "Payment already completed" },
          400,
        );
      }

      applyPaymentOutcome(store, payment, {
        status,
        channel: type,
        amountReceived: payment.amount,
        successDescription: `Checkout payment - ${type}`,
      });

      const eventName =
        status === "successful" ? "charge.successful" : "charge.failed";
      const webhook = await dispatchWebhook(
        sandbox,
        store,
        eventName,
        payment,
      );
      return c.json({ success: true, data: payment, webhook });
    },
  );

  simulate.post(
    "/chargeback",
    describeRoute(
      secretRoute({
        tags: ["Simulation"],
        summary: "Create a chargeback for a payment",
        responses: {
          201: jsonResponse(
            "Chargeback created",
            simulationSchema(chargebackSchema),
          ),
          400: jsonResponse("Validation error", errorSchema),
          404: jsonResponse("Payment not found", errorSchema),
        },
      }),
    ),
    validateJson(chargebackRequestSchema),
    async (c) => {
      const store = getStore(c);
      const sandbox = getSandbox(c);
      const body = c.req.valid("json");
      const paymentReference = asOptionalString(body.paymentReference);
      const reason = asOptionalString(body.reason) ?? "Unauthorized transaction";

      if (!paymentReference) {
        return c.json(
          { success: false, error: "paymentReference is required" },
          400,
        );
      }

      const payment = store.payments.get(paymentReference);
      if (!payment) {
        return notFound(c, "Payment not found");
      }

      const parsedChargebackAmount = toNumber(body.amount);
      const chargebackAmount =
        Number.isFinite(parsedChargebackAmount) && parsedChargebackAmount > 0
          ? parsedChargebackAmount
          : payment.amount;
      const timestamp = nowIso();

      const chargeback: Chargeback = {
        id: createReference("cb"),
        paymentReference: payment.reference,
        paymentId: payment.id,
        amount: chargebackAmount,
        currency: payment.currency,
        reason,
        status: "open",
        deadline: new Date(
          Date.now() + TIMING_CONFIG.chargebackDeadlineMs,
        ).toISOString(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      store.chargebacks.set(chargeback.id, chargeback);

      const wallet = walletForCurrency(store, payment.currency);
      if (wallet) {
        wallet.balance -= chargebackAmount;
        wallet.availableBalance -= chargebackAmount;
        addBalanceLog(
          store,
          payment.currency,
          "debit",
          chargebackAmount,
          chargeback.id,
          `Chargeback - ${chargeback.reason}`,
        );
      }

      const webhook = await dispatchWebhook(
        sandbox,
        store,
        "chargeback.created",
        chargeback,
      );
      return c.json({ success: true, data: chargeback, webhook }, 201);
    },
  );

  app.route("/simulate", simulate);
}
