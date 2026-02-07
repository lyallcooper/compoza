"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";
import { queryKeys, invalidateVolumeQueries } from "@/lib/query";
import type { DockerVolume } from "@/types";
import type { CreateVolumeOptions, VolumePruneResult } from "@/lib/docker";

export function useVolumes() {
  return useQuery({
    queryKey: queryKeys.volumes.all,
    queryFn: () => apiFetch<DockerVolume[]>("/api/volumes"),
  });
}

export function useVolume(name: string) {
  return useQuery({
    queryKey: queryKeys.volumes.detail(name),
    queryFn: () =>
      apiFetch<DockerVolume | null>(`/api/volumes/${encodeURIComponent(name)}`, {
        nullOn404: true,
      }),
    enabled: !!name,
  });
}

export function useCreateVolume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateVolumeOptions) =>
      apiPost<{ message: string }>("/api/volumes", params),
    onSettled: () => invalidateVolumeQueries(queryClient),
  });
}

export function useRemoveVolume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      apiDelete<{ message: string }>(`/api/volumes/${encodeURIComponent(name)}`),
    onSettled: () => invalidateVolumeQueries(queryClient),
  });
}

export function usePruneVolumes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (all: boolean = false) =>
      apiPost<VolumePruneResult>("/api/volumes/prune", { all }),
    onSettled: () => invalidateVolumeQueries(queryClient),
  });
}
