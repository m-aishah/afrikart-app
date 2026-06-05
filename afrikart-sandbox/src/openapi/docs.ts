import type { GenerateSpecOptions } from "hono-openapi";

export const apiDocumentation: GenerateSpecOptions["documentation"] = {
  info: {
    title: "Afrikart Sandbox API",
    version: "2.0.0",
    description:
      "Schema-driven OpenAPI for the Afrikart sandbox. The server is intentionally in-memory, single-business, and deterministic for testing collection settlement, payouts, webhook replay, chargebacks, and quote expiry.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Health", description: "Service status and business profile" },
    { name: "Wallets", description: "Balances and balance history" },
    { name: "Identity", description: "Bank and account identity helpers" },
    { name: "Virtual Accounts", description: "Virtual account lifecycle" },
    { name: "Checkout", description: "Checkout payment initiation and status" },
    { name: "Conversions", description: "FX quotes and conversions" },
    { name: "Payouts", description: "Disbursement and payout tracking" },
    { name: "Events", description: "Webhook event log and replay" },
    {
      name: "Simulation",
      description: "Sandbox state transitions and fixtures",
    },
  ],
  components: {
    securitySchemes: {
      SecretApiKey: {
        type: "apiKey",
        in: "header",
        name: "api-key",
        description: "Use sk_test_afrikart_secret",
      },
      PublicKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-pub-key",
        description: "Use pk_test_afrikart_public",
      },
    },
  },
};
