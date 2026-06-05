import type { Context } from "hono";

import type { SandboxBackend } from "./backend/types";
import type { Store } from "./types";

export interface AppEnv {
  Variables: {
    sandbox: SandboxBackend;
    store: Store;
  };
}

export function getSandbox(c: Context<AppEnv>): SandboxBackend {
  return c.get("sandbox");
}

export function getStore(c: Context<AppEnv>): Store {
  return c.get("store");
}
