import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import type { AppEnv } from "../context";
import { getStore } from "../context";
import {
  errorSchema,
  jsonResponse,
  paginatedBalanceLogsSchema,
  secretRoute,
  successSchema,
  successWithMessageSchema,
  topupRequestSchema,
  validateJson,
  validateQuery,
  walletLogsQuerySchema,
  walletListSchema,
  walletSchema,
} from "../openapi";
import { authSecret } from "../middleware";
import { addBalanceLog, walletForCurrency } from "../services/ledger";
import {
  asOptionalString,
  createReference,
  paginate,
  parsePage,
  toNumber,
} from "../utils";

export function registerWalletRoutes(app: Hono<AppEnv>): void {
  const wallets = new Hono<AppEnv>();
  wallets.use("*", authSecret);

  wallets.get(
    "/",
    describeRoute(
      secretRoute({
        tags: ["Wallets"],
        summary: "List wallets",
        responses: {
          200: jsonResponse("Wallet list", successSchema(walletListSchema)),
        },
      }),
    ),
    (c) => c.json({ success: true, data: getStore(c).wallets }),
  );

  wallets.get(
    "/logs",
    describeRoute(
      secretRoute({
        tags: ["Wallets"],
        summary: "List balance logs",
        responses: {
          200: jsonResponse(
            "Paginated balance logs",
            successSchema(paginatedBalanceLogsSchema),
          ),
        },
      }),
    ),
    validateQuery(walletLogsQuerySchema),
    (c) => {
      const store = getStore(c);
      const query = c.req.valid("query");
      const currency = query.currency;
      const type = query.type;
      const page = parsePage(query.page, 1, Number.MAX_SAFE_INTEGER);
      const limit = parsePage(query.limit, 20, 100);

      let logs = [...store.balanceLogs];
      if (currency) {
        logs = logs.filter((log) => log.currency === currency.toUpperCase());
      }
      if (type) logs = logs.filter((log) => log.type === type);

      const paginated = paginate(logs, page, limit);

      return c.json({
        success: true,
        data: paginated,
      });
    },
  );

  wallets.post(
    "/topup",
    describeRoute(
      secretRoute({
        tags: ["Wallets"],
        summary: "Top up a test wallet",
        responses: {
          200: jsonResponse(
            "Wallet topped up",
            successWithMessageSchema(walletSchema),
          ),
          400: jsonResponse("Validation error", errorSchema),
        },
      }),
    ),
    validateJson(topupRequestSchema),
    async (c) => {
      const store = getStore(c);
      const body = c.req.valid("json");
      const currency = asOptionalString(body.currency)?.toUpperCase();
      const amount = toNumber(body.amount);

      if (!currency || !Number.isFinite(amount) || amount <= 0) {
        return c.json(
          { success: false, error: "currency and positive amount are required" },
          400,
        );
      }

      let wallet = walletForCurrency(store, currency);
      if (!wallet) {
        wallet = { currency, balance: 0, availableBalance: 0 };
        store.wallets.push(wallet);
      }

      wallet.balance += amount;
      wallet.availableBalance += amount;
      addBalanceLog(
        store,
        currency,
        "credit",
        amount,
        createReference("topup"),
        "Test balance top-up",
      );

      return c.json({
        success: true,
        message: "Balance topped up",
        data: wallet,
      });
    },
  );

  app.route("/wallets", wallets);
}
