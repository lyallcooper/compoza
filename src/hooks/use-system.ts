"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  queryKeys,
  invalidateSystemQueries,
  invalidateContainerQueries,
  invalidateNetworkQueries,
  invalidateImageQueries,
} from "@/lib/query";
import { useBackgroundOperation, consumeSSEStream, type OperationCallbacks } from "./use-background-operation";
import type { DockerSystemInfo, DiskUsage, SystemPruneOptions, SystemPruneResult, SystemPruneEvent, SystemPruneStep } from "@/types";

const stepLabels: Record<SystemPruneStep, string> = {
  containers: "Removing stopped containers...",
  networks: "Removing unused networks...",
  images: "Removing unused images...",
  volumes: "Removing unused volumes...",
  buildCache: "Clearing build cache...",
};

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

  const config = useMemo(() => ({
    type: "system-prune",
    getLabel: () => "System Prune",
    initialProgress: "Starting...",
    execute: async (options: SystemPruneOptions, { setProgress, signal }: OperationCallbacks) => {
      let finalResult: SystemPruneResult | undefined;
      let streamError: string | undefined;

      await consumeSSEStream<SystemPruneEvent>(
        "/api/system/prune",
        {
          body: options,
          signal,
          onEvent: (event) => {
            switch (event.type) {
              case "step":
                setProgress(stepLabels[event.step] || event.step);
                break;
              case "done":
                finalResult = event.result;
                break;
              case "error":
                streamError = event.message;
                break;
            }
          },
        }
      );

      if (streamError) throw new Error(streamError);
      return finalResult;
    },
    onSuccess: async (_result: SystemPruneResult | undefined, options: SystemPruneOptions) => {
      invalidateSystemQueries(queryClient);
      if (options.containers) invalidateContainerQueries(queryClient);
      if (options.networks) invalidateNetworkQueries(queryClient);
      if (options.images) invalidateImageQueries(queryClient);
    },
    onError: async () => {
      invalidateSystemQueries(queryClient);
    },
  }), [queryClient]);

  return useBackgroundOperation<SystemPruneOptions, SystemPruneResult>(config);
}
