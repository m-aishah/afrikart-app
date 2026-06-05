import type { RuntimeConfig } from "../config";
import type { Store } from "../types";

export interface DemoCredentials {
  secretKey: string;
  publicKey: string;
  rotatedAt: string;
}

export interface SandboxSummary {
  businessId: string;
  activeSecretKey: string;
  activePublicKey: string;
  rotatedAt: string;
}

export interface ApproveVirtualAccountJob {
  id: string;
  type: "approveVirtualAccount";
  runAt: number;
  virtualAccountId: string;
}

export interface ResolvePayoutJob {
  id: string;
  type: "resolvePayout";
  runAt: number;
  payoutReference: string;
}

export interface DispatchWebhookJob {
  id: string;
  type: "dispatchWebhook";
  runAt: number;
  eventName: string;
  data: unknown;
}

export type ScheduledJob =
  | ApproveVirtualAccountJob
  | ResolvePayoutJob
  | DispatchWebhookJob;

export interface SandboxBackend {
  load(): Promise<Store>;
  flush(store: Store): Promise<void>;
  getConfig(): RuntimeConfig;
  getDemoCredentials(): Promise<DemoCredentials>;
  rotateDemoCredentials(overrides?: {
    secretKey?: string;
    publicKey?: string;
  }): Promise<DemoCredentials>;
  resetSandboxState(): Promise<Store>;
  getSandboxSummary(): Promise<SandboxSummary>;
  scheduleJob(job: ScheduledJob): Promise<void>;
  processDueJobs(): Promise<void>;
}
