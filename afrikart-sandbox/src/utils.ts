import { randomBytes } from "node:crypto";

import type { JsonRecord } from "./types";

type JsonContext = {
  json: (body: unknown, status?: number) => Response;
};

export function notFound(
  c: JsonContext,
  error: string,
  data?: unknown,
): Response {
  return c.json(
    data === undefined
      ? { success: false, error }
      : { success: false, error, data },
    404,
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function randomDigits(length: number): string {
  let out = "";
  while (out.length < length) out += Math.floor(Math.random() * 10);
  return out.slice(0, length);
}

export function createReference(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function asRequiredString(value: unknown): string {
  return asOptionalString(value) ?? "";
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    return Number(value);
  }
  return Number.NaN;
}

export function parsePage(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
}

export function paginate<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const results = items.slice((page - 1) * limit, page * limit);
  return { results, total, page, limit };
}

export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
