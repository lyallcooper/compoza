"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";
import { queryKeys, invalidateImageQueries, clearUpdateCacheAndInvalidate } from "@/lib/query";
import { useBackgroundOperation, consumeOutputStream, type OperationCallbacks } from "./use-background-operation";
import type { DockerImage, DockerImageDetail } from "@/types";

export function useImages() {
  return useQuery({
    queryKey: queryKeys.images.all,
    queryFn: () => apiFetch<DockerImage[]>("/api/images"),
  });
}

export function useImage(id: string) {
  return useQuery({
    queryKey: queryKeys.images.detail(id),
    queryFn: () => apiFetch<DockerImageDetail>(`/api/images/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function usePullImage() {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "image-pull",
    getLabel: (name: string) => `Pulling ${name}`,
    execute: async (name: string, { appendOutput, signal }: OperationCallbacks) => {
      await consumeOutputStream("/api/images/pull", { body: { name }, signal, appendOutput });
      return { name };
    },
    onSuccess: async (result: { name: string } | undefined) => {
      if (result) {
        await clearUpdateCacheAndInvalidate(queryClient, [result.name]);
      }
      invalidateImageQueries(queryClient);
    },
    onError: async () => {
      invalidateImageQueries(queryClient);
    },
  }), [queryClient]);

  return useBackgroundOperation<string, { name: string }>(config);
}

export function useDeleteImage() {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "image-delete",
    getLabel: ({ id }: { id: string }) => `Deleting ${id}`,
    execute: async (
      { id, force }: { id: string; force?: boolean },
      { signal }: OperationCallbacks
    ) => {
      await apiDelete<{ message: string }>(
        `/api/images/${encodeURIComponent(id)}`,
        force ? { force } : undefined,
        { signal }
      );
    },
    onSuccess: async () => {
      invalidateImageQueries(queryClient);
    },
    onError: async () => {
      invalidateImageQueries(queryClient);
    },
  }), [queryClient]);

  return useBackgroundOperation<{ id: string; force?: boolean }>(config);
}

export function usePruneImages() {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "image-prune",
    getLabel: () => "Removing unused images",
    execute: async (all: boolean, { signal }: OperationCallbacks) => {
      return await apiPost<{ imagesDeleted: number; spaceReclaimed: number }>(
        "/api/images/prune",
        { all },
        { signal }
      );
    },
    onSuccess: async () => {
      invalidateImageQueries(queryClient);
    },
    onError: async () => {
      invalidateImageQueries(queryClient);
    },
  }), [queryClient]);

  return useBackgroundOperation<boolean, { imagesDeleted: number; spaceReclaimed: number }>(config);
}
