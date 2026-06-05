import { randomBytes } from "node:crypto";

import { createStore, resetStore, store } from "../store";
import { nowIso } from "../utils";
import { localRuntimeConfig } from "../config";
import { processScheduledJob } from "./jobs";
import type {
  DemoCredentials,
  SandboxBackend,
  SandboxSummary,
  ScheduledJob,
} from "./types";
import type { Store } from "../types";

function generateCredential(prefix: "sk_demo" | "pk_demo"): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export class InMemorySandboxBackend implements SandboxBackend {
  private credentials: DemoCredentials = {
    secretKey: localRuntimeConfig.secretKey,
    publicKey: localRuntimeConfig.publicKey,
    rotatedAt: nowIso(),
  };
  private jobHandles = new Map<string, ReturnType<typeof setTimeout>>();
  private taskHandles = new Set<ReturnType<typeof setTimeout>>();

  async load(): Promise<Store> {
    return store;
  }

  async flush(_: Store): Promise<void> {}

  getConfig() {
    return localRuntimeConfig;
  }

  async getDemoCredentials(): Promise<DemoCredentials> {
    return this.credentials;
  }

  async rotateDemoCredentials(overrides?: {
    secretKey?: string;
    publicKey?: string;
  }): Promise<DemoCredentials> {
    this.credentials = {
      secretKey: overrides?.secretKey || generateCredential("sk_demo"),
      publicKey: overrides?.publicKey || generateCredential("pk_demo"),
      rotatedAt: nowIso(),
    };
    return this.credentials;
  }

  async resetSandboxState(): Promise<Store> {
    for (const handle of this.jobHandles.values()) {
      clearTimeout(handle);
    }
    this.jobHandles.clear();
    for (const handle of this.taskHandles) {
      clearTimeout(handle);
    }
    this.taskHandles.clear();
    return resetStore();
  }

  async getSandboxSummary(): Promise<SandboxSummary> {
    return {
      businessId: store.business.id,
      activeSecretKey: this.credentials.secretKey,
      activePublicKey: this.credentials.publicKey,
      rotatedAt: this.credentials.rotatedAt,
    };
  }

  async scheduleJob(job: ScheduledJob): Promise<void> {
    const delayMs = Math.max(0, job.runAt - Date.now());
    const handle = setTimeout(() => {
      this.jobHandles.delete(job.id);
      processScheduledJob(this, store, job)
        .catch((error) => {
          console.error(`Failed to process scheduled job: ${job.type}`, error);
        });
    }, delayMs);
    handle.unref?.();
    this.jobHandles.set(job.id, handle);
  }

  async processDueJobs(): Promise<void> {}

  scheduleTask(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    let handle: ReturnType<typeof setTimeout>;
    handle = setTimeout(() => {
      this.taskHandles.delete(handle);
      callback();
    }, delayMs);
    handle.unref?.();
    this.taskHandles.add(handle);
    return handle;
  }
}

export const localSandboxBackend = new InMemorySandboxBackend();
