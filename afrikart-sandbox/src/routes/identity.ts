import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import type { AppEnv } from "../context";
import { getStore } from "../context";
import {
  bankListSchema,
  bvnResolutionSchema,
  banksQuerySchema,
  errorSchema,
  jsonResponse,
  resolvedAccountSchema,
  resolveBvnRequestSchema,
  secretRoute,
  successSchema,
  validateJson,
  validateQuery,
  verifyAccountNumberRequestSchema,
} from "../openapi";
import { authSecret } from "../middleware";
import { asRequiredString, notFound } from "../utils";

export function registerIdentityRoutes(app: Hono<AppEnv>): void {
  const banks = new Hono<AppEnv>();
  banks.use("*", authSecret);

  banks.get(
    "/",
    describeRoute(
      secretRoute({
        tags: ["Identity"],
        summary: "List supported banks",
        responses: {
          200: jsonResponse("Supported banks", successSchema(bankListSchema)),
        },
      }),
    ),
    validateQuery(banksQuerySchema),
    (c) => {
      const store = getStore(c);
      const query = c.req.valid("query");
      const country = query.country;
      const currency = query.currency;
      let banks = [...store.banks];

      if (country) {
        banks = banks.filter((bank) => bank.country === country.toUpperCase());
      }
      if (currency) {
        banks = banks.filter((bank) => bank.currency === currency.toUpperCase());
      }

      return c.json({ success: true, data: banks });
    },
  );
  app.route("/banks", banks);

  const identity = new Hono<AppEnv>();
  identity.use("*", authSecret);

  identity.post(
    "/verify-account-number",
    describeRoute(
      secretRoute({
        tags: ["Identity"],
        summary: "Verify account number",
        responses: {
          200: jsonResponse("Resolved account", successSchema(resolvedAccountSchema)),
          400: jsonResponse("Validation error", errorSchema),
          404: jsonResponse("Account not found", errorSchema),
        },
      }),
    ),
    validateJson(verifyAccountNumberRequestSchema),
    async (c) => {
      const store = getStore(c);
      const body = c.req.valid("json");
      const accountNumber = asRequiredString(body.accountNumber);
      const bankCode = asRequiredString(body.bankCode);

      if (!accountNumber || !bankCode) {
        return c.json(
          { success: false, error: "accountNumber and bankCode are required" },
          400,
        );
      }

      const key = `${bankCode}:${accountNumber}`;
      const record = store.accountDirectory[key];

      if (!record) {
        return notFound(c, "Account not found", {
          accountNumber,
          bankCode,
          resolved: false,
        });
      }

      return c.json({
        success: true,
        data: {
          accountNumber,
          bankCode,
          accountName: record.accountName,
          bankName: record.bankName,
          currency: record.currency,
          resolved: true,
        },
      });
    },
  );

  identity.post(
    "/resolve-bvn",
    describeRoute(
      secretRoute({
        tags: ["Identity"],
        summary: "Resolve BVN",
        responses: {
          200: jsonResponse("BVN details", successSchema(bvnResolutionSchema)),
          400: jsonResponse("Validation error", errorSchema),
        },
      }),
    ),
    validateJson(resolveBvnRequestSchema),
    async (c) => {
      const body = c.req.valid("json");
      const bvn = asRequiredString(body.bvn);

      if (!bvn) {
        return c.json({ success: false, error: "bvn is required" }, 400);
      }

      if (bvn.length !== 11) {
        return c.json({ success: false, error: "BVN must be 11 digits" }, 400);
      }

      return c.json({
        success: true,
        data: {
          bvn,
          firstName: "JOHN",
          lastName: "DOE",
          middleName: "TEST",
          dateOfBirth: "1990-01-15",
          phoneNumber: `0801234${bvn.slice(-4)}`,
          gender: "Male",
        },
      });
    },
  );

  app.route("/identity", identity);
}
