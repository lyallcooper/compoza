import type { QueryClient } from "@tanstack/react-query";
import { invalidateAllQueries } from "@/lib/query";
import { isDemoMode } from "@/lib/demo";

/**
 * Check if an error is a network/connection error (fetch failed, server down, etc.)
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // TypeError is thrown by fetch when network fails
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network") ||
      msg.includes("connection") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset")
    );
  }
  return false;
}

export async function waitForReconnection(
  onProgress?: (attempt: number) => void,
  maxAttempts = 30,
  interval = 1000
): Promise<boolean> {
  if (isDemoMode()) return true; // Always "connected" in demo mode

  for (let i = 0; i < maxAttempts; i++) {
    onProgress?.(i + 1);
    try {
      const res = await fetch("/api/health", {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return true;
    } catch {
      // Still down
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

/**
 * Handle disconnection during a background task by attempting to reconnect.
 * Returns true if reconnected, false if gave up.
 */
export async function handleDisconnection(
  taskId: string,
  updateTask: (id: string, updates: Record<string, unknown>) => void,
  queryClient: QueryClient
): Promise<boolean> {
  updateTask(taskId, {
    status: "disconnected",
    progress: "Reconnecting...",
    cancel: undefined,
  });

  const reconnected = await waitForReconnection((n) => {
    updateTask(taskId, { progress: `Reconnecting... (${n}s)` });
  });

  if (reconnected) {
    updateTask(taskId, {
      status: "complete",
      progress: "Completed (reconnected)",
    });
    invalidateAllQueries(queryClient);
  } else {
    updateTask(taskId, {
      status: "error",
      error: "Connection lost",
    });
  }

  return reconnected;
}

