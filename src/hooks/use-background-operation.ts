"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBackgroundTasks } from "@/contexts";
import { handleDisconnection, isNetworkError } from "@/lib/reconnect";

/**
 * Parse an SSE stream from a fetch Response, calling onEvent for each parsed event.
 */
export async function consumeSSEStream<TEvent extends { type: string }>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    signal: AbortSignal;
    onEvent: (event: TEvent) => void;
  }
): Promise<void> {
  const { method = "POST", body, signal, onEvent } = options;

  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = `HTTP error: ${response.status}`;
    try {
      const json = JSON.parse(text);
      if (json.error) message = json.error;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as TEvent;
          onEvent(event);
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  // Process any remaining data
  if (buffer.startsWith("data: ")) {
    try {
      const event = JSON.parse(buffer.slice(6)) as TEvent;
      onEvent(event);
    } catch {
      // Ignore parse errors
    }
  }
}

/**
 * Convenience wrapper for SSE streams that use the standard output/error/done event shape.
 * Pipes output events to appendOutput and throws on error events.
 */
export async function consumeOutputStream(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    signal: AbortSignal;
    appendOutput: (lines: string[]) => void;
  }
): Promise<void> {
  let streamError: string | undefined;
  await consumeSSEStream<{ type: string; data?: string; message?: string }>(
    url,
    {
      method: options.method,
      body: options.body,
      signal: options.signal,
      onEvent: (event) => {
        if (event.type === "output" && event.data) options.appendOutput([event.data]);
        if (event.type === "error") streamError = event.message;
      },
    }
  );
  if (streamError) throw new Error(streamError);
}

export interface OperationCallbacks {
  setProgress: (msg: string) => void;
  appendOutput: (lines: string[]) => void;
  signal: AbortSignal;
}

export interface BackgroundOperationConfig<TArgs, TResult> {
  type: string;
  getLabel: (args: TArgs) => string;
  initialProgress?: string;
  execute: (
    args: TArgs,
    callbacks: OperationCallbacks
  ) => Promise<TResult | undefined>;
  onSuccess?: (result: TResult | undefined, args: TArgs) => void | Promise<void>;
  onError?: (error: Error, args: TArgs) => void | Promise<void>;
  cancellable?: boolean;
}

export function useBackgroundOperation<TArgs = void, TResult = void>(
  config: BackgroundOperationConfig<TArgs, TResult>
) {
  const queryClient = useQueryClient();
  const { addTask, updateTask, appendOutput } = useBackgroundTasks();
  const [inflightCount, setInflightCount] = useState(0);

  const execute = useCallback(
    async (args: TArgs): Promise<boolean> => {
      setInflightCount((c) => c + 1);
      const taskId = `${config.type}-${Date.now()}`;
      const abortController = new AbortController();

      let cancelled = false;
      const cancel = config.cancellable !== false
        ? () => {
            cancelled = true;
            abortController.abort();
            updateTask(taskId, {
              status: "error",
              error: "Cancelled",
              cancel: undefined,
            });
          }
        : undefined;

      addTask({
        id: taskId,
        type: config.type,
        label: config.getLabel(args),
        progress: config.initialProgress,
        status: "running",
        hidden: true,
        cancel,
      });

      // After 500ms, if still running, make visible
      const visibilityTimer = setTimeout(() => {
        updateTask(taskId, { hidden: false });
      }, 500);

      try {
        const result = await config.execute(args, {
          setProgress: (msg) => updateTask(taskId, { progress: msg }),
          appendOutput: (lines) => appendOutput(taskId, lines),
          signal: abortController.signal,
        });

        if (cancelled) return false;

        clearTimeout(visibilityTimer);

        updateTask(taskId, {
          status: "complete",
          result: result !== undefined ? (result as Record<string, unknown>) : undefined,
          cancel: undefined,
          hidden: false,
        });

        try {
          await config.onSuccess?.(result, args);
        } catch {
          // Ignore callback errors
        }

        return true;
      } catch (err) {
        clearTimeout(visibilityTimer);

        if ((err as Error).name === "AbortError" || cancelled) return false;

        if (isNetworkError(err)) {
          updateTask(taskId, { hidden: false });
          await handleDisconnection(taskId, updateTask, queryClient);
        } else {
          updateTask(taskId, {
            status: "error",
            error: err instanceof Error ? err.message : "Operation failed",
            cancel: undefined,
            hidden: false,
          });
        }

        try {
          await config.onError?.(err instanceof Error ? err : new Error(String(err)), args);
        } catch {
          // Ignore callback errors
        }

        return false;
      } finally {
        setInflightCount((c) => c - 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.type, queryClient, addTask, updateTask, appendOutput]
  );

  return { execute, isPending: inflightCount > 0 };
}
