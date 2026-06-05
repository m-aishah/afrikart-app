import * as v from "valibot";
import { resolver, validator } from "hono-openapi";
import type { DescribeRouteOptions } from "hono-openapi";

import { errorSchema, webhookEventSchema } from "./schemas";

type ApiSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;
type ValidationHookResult = {
  success: boolean;
  error?: ReadonlyArray<{ message?: string | undefined }>;
};
type JsonResponder = {
  json: (body: unknown, status?: number) => Response;
};
type OperationSecurity = NonNullable<DescribeRouteOptions["security"]>;
type OperationResponses = NonNullable<DescribeRouteOptions["responses"]>;
type AuthenticatedRouteOptions = Omit<
  DescribeRouteOptions,
  "security" | "responses"
> & {
  responses?: OperationResponses;
};

export function successSchema(dataSchema: ApiSchema) {
  return v.object({
    success: v.literal(true),
    data: dataSchema,
  });
}

export function successWithMessageSchema(dataSchema: ApiSchema) {
  return v.object({
    success: v.literal(true),
    message: v.string(),
    data: dataSchema,
  });
}

export function simulationSchema(dataSchema: ApiSchema) {
  return v.object({
    success: v.literal(true),
    data: dataSchema,
    webhook: webhookEventSchema,
  });
}

export function jsonResponse(description: string, schema: ApiSchema) {
  return {
    description,
    content: {
      "application/json": {
        schema: resolver(schema),
      },
    },
  };
}

export function validationErrorHook(fallback: string) {
  return (
    result: ValidationHookResult,
    c: JsonResponder,
  ): Response | undefined => {
    if (result.success) return;

    return c.json(
      {
        success: false,
        error: result.error?.[0]?.message ?? fallback,
      },
      400,
    );
  };
}

export function validateJson<TSchema extends ApiSchema>(
  schema: TSchema,
  fallback = "Invalid request",
) {
  return validator("json", schema, validationErrorHook(fallback));
}

export function validateQuery<TSchema extends ApiSchema>(
  schema: TSchema,
  fallback = "Invalid query",
) {
  return validator("query", schema, validationErrorHook(fallback));
}

export function validateParam<TSchema extends ApiSchema>(schema: TSchema) {
  return validator("param", schema);
}

const secretSecurity: OperationSecurity = [{ SecretApiKey: [] }];
const publicSecurity: OperationSecurity = [{ PublicKeyAuth: [] }];

const secretAuthResponses = {
  401: jsonResponse("Missing or invalid api-key header", errorSchema),
  429: jsonResponse("Rate limit exceeded", errorSchema),
};

const publicAuthResponses = {
  401: jsonResponse("Missing or invalid x-pub-key header", errorSchema),
};

export const providerUnavailableResponse = {
  503: jsonResponse("Chaos-mode provider error", errorSchema),
};

export function secretRoute(
  options: AuthenticatedRouteOptions,
): DescribeRouteOptions {
  return {
    ...options,
    security: secretSecurity,
    responses: {
      ...secretAuthResponses,
      ...options.responses,
    },
  };
}

export function publicRoute(
  options: AuthenticatedRouteOptions,
): DescribeRouteOptions {
  return {
    ...options,
    security: publicSecurity,
    responses: {
      ...publicAuthResponses,
      ...options.responses,
    },
  };
}
