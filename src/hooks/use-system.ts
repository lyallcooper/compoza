"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api";
import {
  queryKeys,
  invalidateSystemQueries,
  invalidateContainerQueries,
  invalidateNetworkQueries,
  invalidateImageQueries,
} from "@/lib/query";
import type { DockerSystemInfo, DiskUsage, SystemPruneOptions, SystemPruneResult } from "@/types";

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

  return useMutation({
    mutationFn: (options: SystemPruneOptions) =>
      apiPost<SystemPruneResult>("/api/system/prune", options),
    onSuccess: (_data, options) => {
      // Invalidate all affected queries
      invalidateSystemQueries(queryClient);

      if (options.containers) {
        invalidateContainerQueries(queryClient);
      }
      if (options.networks) {
        invalidateNetworkQueries(queryClient);
      }
      if (options.images) {
        invalidateImageQueries(queryClient);
      }
      // Volumes don't have their own queries currently, but disk usage will update
    },
  });
}
