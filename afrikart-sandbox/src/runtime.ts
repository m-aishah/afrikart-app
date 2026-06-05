import { localSandboxBackend } from "./backend/in-memory";

export function getDemoCredentials() {
  return localSandboxBackend.getDemoCredentials();
}

export function rotateDemoCredentials(overrides?: {
  secretKey?: string;
  publicKey?: string;
}) {
  return localSandboxBackend.rotateDemoCredentials(overrides);
}

export function resetSandboxState() {
  return localSandboxBackend.resetSandboxState();
}

export function getSandboxSummary() {
  return localSandboxBackend.getSandboxSummary();
}

export function scheduleSandboxTask(
  callback: () => void,
  delayMs: number,
): ReturnType<typeof setTimeout> {
  return localSandboxBackend.scheduleTask(callback, delayMs);
}
