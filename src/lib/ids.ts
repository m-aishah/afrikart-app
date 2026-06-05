import { randomUUID } from "node:crypto";

export const newId = (prefix: string) =>
  `${prefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
