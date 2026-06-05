import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import { TIMING_CONFIG } from "../config";
import type { AppEnv } from "../context";
import { getSandbox, getStore } from "../context";
import { authSecret } from "../middleware";
import {
  errorSchema,
  jsonResponse,
  secretRoute,
  successSchema,
  validateJson,
  validateParam,
  validateQuery,
  virtualAccountIdParamSchema,
  virtualAccountListSchema,
  virtualAccountRequestSchema,
  virtualAccountSchema,
  virtualAccountsQuerySchema,
} from "../openapi";
import { scheduleWebhookDispatch } from "../services/webhooks";
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
import type { VirtualAccount } from "../types";

function resolveVirtualAccountExpiry(
  isPermanent: boolean,
  expiresInMinutes: number,
): string | null {
  if (isPermanent) return null;
  if (!Number.isFinite(expiresInMinutes)) {
    return new Date(
      Date.now() + TIMING_CONFIG.virtualAccountExpiryMs,
    ).toISOString();
  }
  return new Date(Date.now() + expiresInMinutes * 60_000).toISOString();
}

export function registerVirtualAccountRoutes(app: Hono<AppEnv>): void {
  const virtualAccounts = new Hono<AppEnv>();
  virtualAccounts.use("*", authSecret);

  virtualAccounts.post(
    "/requests",
    describeRoute(
      secretRoute({
        tags: ["Virtual Accounts"],
        summary: "Create a virtual account",
        description:
          "NGN virtual accounts require BVN and are approved immediately. Other supported currencies start as pending and are auto-approved later.",
        responses: {
          201: jsonResponse(
            "Created virtual account",
            successSchema(virtualAccountSchema),
          ),
          400: jsonResponse("Validation error", errorSchema),
        },
      }),
    ),
    validateJson(virtualAccountRequestSchema),
    async (c) => {
      const store = getStore(c);
      const sandbox = getSandbox(c);
      const body = c.req.valid("json");
      const currency = asOptionalString(body.currency)?.toUpperCase() ?? "NGN";
      const customer = asRecord(body.customer);
      const kycInformation = asRecord(body.KYCInformation);
      const cust = Object.keys(customer).length > 0 ? customer : kycInformation;
      const reference = asOptionalString(body.reference);
      const expiresInMinutes = toNumber(body.expiresInMinutes);
      const isPermanent = Boolean(body.isPermanent);

      if (
        !asOptionalString(cust.name) &&
        !(asOptionalString(cust.firstName) && asOptionalString(cust.lastName))
      ) {
        return c.json(
          {
            success: false,
            error: "customer.name (or firstName + lastName) is required",
          },
          400,
        );
      }

      if (!asOptionalString(cust.email)) {
        return c.json(
          { success: false, error: "customer.email is required" },
          400,
        );
      }

      if (
        currency === "NGN" &&
        !(asOptionalString(cust.bvn) || asOptionalString(kycInformation.bvn))
      ) {
        return c.json(
          { success: false, error: "BVN is required for NGN virtual accounts" },
          400,
        );
      }

      const id = createReference("va");
      const vaRef = reference ?? createReference("vref");
      const displayName =
        asOptionalString(cust.name) ??
        `${asRequiredString(cust.firstName)} ${asRequiredString(cust.lastName)}`.trim();

      const bankMap: Record<string, { name: string; code: string }> = {
        NGN: { name: "Globus Bank", code: "103" },
        GHS: { name: "Accra Commercial Bank", code: "GH001" },
        KES: { name: "Nairobi Settlement Bank", code: "KE001" },
      };

      const bank = bankMap[currency] ?? bankMap.NGN;
      const account: VirtualAccount = {
        id,
        reference: vaRef,
        status: currency === "NGN" ? "approved" : "pending",
        currency,
        isPermanent,
        accountType: isPermanent ? "permanent" : "temporary",
        accountInformation: {
          accountNumber: randomDigits(10),
          accountName: displayName,
          bankName: bank.name,
          bankCode: bank.code,
        },
        customer: cust,
        expiresAt: resolveVirtualAccountExpiry(isPermanent, expiresInMinutes),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      store.virtualAccounts.set(id, account);

      if (account.status === "pending") {
        await sandbox.scheduleJob({
          id: createReference("job"),
          type: "approveVirtualAccount",
          runAt: Date.now() + TIMING_CONFIG.virtualAccountApprovalDelayMs,
          virtualAccountId: id,
        });
      } else {
        await scheduleWebhookDispatch(
          sandbox,
          "virtualaccount.approved",
          account,
        );
      }

      return c.json({ success: true, data: account }, 201);
    },
  );

  virtualAccounts.get(
    "/:virtualAccountId",
    describeRoute(
      secretRoute({
        tags: ["Virtual Accounts"],
        summary: "Get a virtual account by id",
        responses: {
          200: jsonResponse(
            "Virtual account",
            successSchema(virtualAccountSchema),
          ),
          404: jsonResponse("Virtual account not found", errorSchema),
        },
      }),
    ),
    validateParam(virtualAccountIdParamSchema),
    (c) => {
      const store = getStore(c);
      const { virtualAccountId } = c.req.valid("param");
      const account = store.virtualAccounts.get(virtualAccountId);

      if (!account) {
        return notFound(c, "Virtual account not found");
      }

      return c.json({ success: true, data: account });
    },
  );

  virtualAccounts.get(
    "/",
    describeRoute(
      secretRoute({
        tags: ["Virtual Accounts"],
        summary: "List virtual accounts",
        responses: {
          200: jsonResponse(
            "Virtual account list",
            successSchema(virtualAccountListSchema),
          ),
        },
      }),
    ),
    validateQuery(virtualAccountsQuerySchema),
    (c) => {
      const store = getStore(c);
      const { currency } = c.req.valid("query");
      let accounts = [...store.virtualAccounts.values()];

      if (currency) {
        accounts = accounts.filter(
          (account) => account.currency === currency.toUpperCase(),
        );
      }

      return c.json({
        success: true,
        data: { results: accounts, total: accounts.length },
      });
    },
  );

  app.route("/profile/virtual-accounts", virtualAccounts);
}
