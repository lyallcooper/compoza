"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api";
import { queryKeys, invalidateContainerQueries, clearUpdateCacheAndInvalidate } from "@/lib/query";
import type { Container, ContainerStats } from "@/types";

interface UseContainersOptions {
  includeHealth?: boolean;
}

export function useContainers(options: UseContainersOptions = {}) {
  const { includeHealth = false } = options;
  return useQuery({
    queryKey: includeHealth ? queryKeys.containers.withHealth : queryKeys.containers.all,
    queryFn: () => apiFetch<Container[]>(
      includeHealth ? "/api/containers?includeHealth=true" : "/api/containers"
    ),
  });
}

export function useContainer(id: string) {
  return useQuery({
    queryKey: queryKeys.containers.detail(id),
    queryFn: () =>
      apiFetch<Container | null>(`/api/containers/${encodeURIComponent(id)}`, {
        nullOn404: true,
      }),
    enabled: !!id,
  });
}

export function useContainerStats(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.containers.stats(id),
    queryFn: () =>
      apiFetch<ContainerStats>(`/api/containers/${encodeURIComponent(id)}/stats`),
    enabled: !!id && enabled,
    refetchInterval: 2000,
  });
}

export function useStartContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ message: string }>(`/api/containers/${encodeURIComponent(id)}/start`),
    onSuccess: (_data, id) => {
      invalidateContainerQueries(queryClient, id);
    },
  });
}

export function useStopContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ message: string }>(`/api/containers/${encodeURIComponent(id)}/stop`),
    onSuccess: (_data, id) => {
      invalidateContainerQueries(queryClient, id);
    },
  });
}

export function useRestartContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ message: string }>(`/api/containers/${encodeURIComponent(id)}/restart`),
    onSuccess: (_data, id) => {
      invalidateContainerQueries(queryClient, id);
    },
  });
}

export function useContainerUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ output: string; restarted: boolean }>(
        `/api/containers/${encodeURIComponent(id)}/update`
      ),
    onSuccess: async (_data, id) => {
      await clearUpdateCacheAndInvalidate(queryClient);
      invalidateContainerQueries(queryClient, id);
    },
  });
}
