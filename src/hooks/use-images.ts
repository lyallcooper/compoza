"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";
import { queryKeys, invalidateImageQueries, clearUpdateCacheAndInvalidate } from "@/lib/query";
import type { DockerImage } from "@/types";

export function useImages() {
  return useQuery({
    queryKey: queryKeys.images.all,
    queryFn: () => apiFetch<DockerImage[]>("/api/images"),
  });
}

export function usePullImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      apiPost<{ message: string }>("/api/images/pull", { name }),
    onSuccess: async (_data, name) => {
      // Clear update cache for this image and optimistically remove from UI
      await clearUpdateCacheAndInvalidate(queryClient, [name]);
    },
  });
}

export function useDeleteImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      apiDelete<{ message: string }>(`/api/images/${encodeURIComponent(id)}`, { force }),
    onSuccess: () => invalidateImageQueries(queryClient),
  });
}

// Re-export PruneResult from docker lib for convenience
export type { PruneResult } from "@/lib/docker";

export function usePruneImages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (all: boolean = false) =>
      apiPost<{ imagesDeleted: number; spaceReclaimed: number }>("/api/images/prune", { all }),
    onSuccess: () => invalidateImageQueries(queryClient),
  });
}
