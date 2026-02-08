import { AsyncLocalStorage } from "node:async_hooks";

// Use globalThis to share the AsyncLocalStorage instance across module systems.
// The custom server (server/index.ts) and Next.js API routes are compiled by
// different bundlers but run in the same Node process — globalThis is the only
// reliable way to guarantee they reference the same storage instance.
const STORAGE_KEY = Symbol.for("compoza:demo-session");

function getStorage(): AsyncLocalStorage<string> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[STORAGE_KEY]) {
    g[STORAGE_KEY] = new AsyncLocalStorage<string>();
  }
  return g[STORAGE_KEY] as AsyncLocalStorage<string>;
}

export function runWithSession<T>(sessionId: string, fn: () => T): T {
  return getStorage().run(sessionId, fn);
}

export function getCurrentSessionId(): string | undefined {
  return getStorage().getStore();
}
