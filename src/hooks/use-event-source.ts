"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { isDemoMode } from "@/lib/demo";
import { demoFetchRaw } from "@/lib/demo/router";

export interface EventSourceState {
  connected: boolean;
  error: string | null;
}

export interface UseEventSourceOptions<T> {
  /** URL to connect to */
  url: string;
  /** Called when a message is received */
  onMessage: (data: T) => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
  /** Called when connection opens */
  onOpen?: () => void;
  /** Whether the connection is enabled */
  enabled?: boolean;
}

/**
 * Hook for managing Server-Sent Events (EventSource) connections.
 * Handles connection state, reconnection, and cleanup.
 */
export function useEventSource<T = unknown>({
  url,
  onMessage,
  onError,
  onOpen,
  enabled = true,
}: UseEventSourceOptions<T>): EventSourceState {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  // Use refs for callbacks to avoid recreating EventSource on callback changes
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onOpenRef = useRef(onOpen);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
    onOpenRef.current = onOpen;
  }, [onMessage, onError, onOpen]);

  useEffect(() => {
    if (!enabled) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const isNewUrl = currentUrlRef.current !== url;
    currentUrlRef.current = url;

    if (isDemoMode()) {
      // In demo mode, use a ReadableStream instead of EventSource
      let cancelled = false;

      demoFetchRaw(url, { method: "GET" }).then(async (response) => {
        if (cancelled) return;
        setConnected(true);
        onOpenRef.current?.();
        const reader = response.body?.getReader();
        if (!reader || cancelled) return;
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6)) as T;
                onMessageRef.current(data);
              } catch { /* ignore */ }
            }
          }
        }
        if (buffer.startsWith("data: ")) {
          try {
            const data = JSON.parse(buffer.slice(6)) as T;
            onMessageRef.current(data);
          } catch { /* ignore */ }
        }
        setConnected(false);
      }).catch(() => {
        setConnected(false);
        setError("Demo stream error");
        onErrorRef.current?.("Demo stream error");
      });

      return () => {
        cancelled = true;
        setConnected(false);
      };
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (isNewUrl) {
        setError(null);
      }
      setConnected(true);
      onOpenRef.current?.();
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T;
        onMessageRef.current(data);
      } catch {
        // If not JSON, pass raw data
        onMessageRef.current(event.data as T);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      const errorMsg = "Connection lost";
      setError(errorMsg);
      onErrorRef.current?.(errorMsg);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [url, enabled]);

  return { connected, error };
}

/**
 * Hook for reading a streaming response (POST request with SSE-like response).
 * Used when you need to send data with the request (unlike EventSource which is GET-only).
 */
export function useStreamingFetch() {
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchStream = useCallback(async <T>(
    url: string,
    options: {
      method?: string;
      body?: unknown;
      onMessage: (data: T) => void;
      onError?: (error: string) => void;
      onDone?: () => void;
    }
  ) => {
    const { method = "POST", body, onMessage, onError, onDone } = options;

    abortControllerRef.current = new AbortController();

    try {
      let response: Response;
      if (isDemoMode()) {
        response = await demoFetchRaw(url, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: abortControllerRef.current.signal,
        });
      } else {
        response = await fetch(url, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: abortControllerRef.current.signal,
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as T;
              onMessage(data);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Process any remaining data
      if (buffer.startsWith("data: ")) {
        try {
          const data = JSON.parse(buffer.slice(6)) as T;
          onMessage(data);
        } catch {
          // Ignore parse errors
        }
      }

      onDone?.();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError?.(err instanceof Error ? err.message : "Unknown error");
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { fetchStream, cancel };
}
