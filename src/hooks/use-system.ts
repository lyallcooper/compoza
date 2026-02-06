"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  queryKeys,
  invalidateSystemQueries,
  invalidateContainerQueries,
  invalidateNetworkQueries,
  invalidateImageQueries,
} from "@/lib/query";
import type { DockerSystemInfo, DiskUsage, SystemPruneOptions, SystemPruneResult } from "@/types";
import type { SystemPruneEvent } from "@/app/api/system/prune/route";
import type { SystemPruneStep } from "@/lib/docker";

export function useSystemInfo() {
  return useQuery({
    queryKey: queryKeys.system.info,
    queryFn: () => apiFetch<DockerSystemInfo>("/api/system/info"),
  });
}

export function useDiskUsage() {
  return useQuery({
    queryKey: queryKeys.system.diskUsage,
    queryFn: () => apiFetch<DiskUsage>("/api/system/disk-usage"),
  });
}

export function useSystemPrune() {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [currentStep, setCurrentStep] = useState<SystemPruneStep | null>(null);
  const [result, setResult] = useState<SystemPruneResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const mutateAsync = useCallback(async (options: SystemPruneOptions) => {
    setIsPending(true);
    setCurrentStep(null);
    setResult(null);
    setError(null);

    abortRef.current = new AbortController();

    try {
      const response = await fetch("/api/system/prune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: SystemPruneResult | null = null;

      const handleEvent = (event: SystemPruneEvent) => {
        switch (event.type) {
          case "step":
            setCurrentStep(event.step);
            break;
          case "done":
            finalResult = event.result;
            setResult(event.result);
            break;
          case "error":
            setError(event.message);
            break;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              handleEvent(JSON.parse(line.slice(6)));
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      if (buffer.startsWith("data: ")) {
        try {
          handleEvent(JSON.parse(buffer.slice(6)));
        } catch {
          // Ignore parse errors
        }
      }

      if (finalResult) {
        // Invalidate affected queries
        invalidateSystemQueries(queryClient);
        if (options.containers) invalidateContainerQueries(queryClient);
        if (options.networks) invalidateNetworkQueries(queryClient);
        if (options.images) invalidateImageQueries(queryClient);
      }

      return finalResult;
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const message = err instanceof Error ? err.message : "Failed to prune system";
        setError(message);
      }
      return null;
    } finally {
      setIsPending(false);
      setCurrentStep(null);
    }
  }, [queryClient]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setCurrentStep(null);
  }, []);

  return { mutateAsync, reset, isPending, currentStep, result, error };
}
