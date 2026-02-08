"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";
import { queryKeys, invalidateContainerQueries } from "@/lib/query";
import { useBackgroundOperation, type OperationCallbacks } from "./use-background-operation";
import type { ContainerPruneResult } from "@/lib/docker";
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

  const config = useMemo(() => ({
    type: "container-start",
    getLabel: (id: string) => `Starting ${id}`,
    execute: async (id: string, { signal }: OperationCallbacks) => {
      await apiPost<{ message: string }>(
        `/api/containers/${encodeURIComponent(id)}/start`,
        undefined,
        { signal }
      );
    },
    onSuccess: async (_result: void | undefined, id: string) => {
      invalidateContainerQueries(queryClient, id);
    },
    onError: async (_error: Error, id: string) => {
      invalidateContainerQueries(queryClient, id);
    },
  }), [queryClient]);

  return useBackgroundOperation<string>(config);
}

export function useStopContainer() {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "container-stop",
    getLabel: (id: string) => `Stopping ${id}`,
    execute: async (id: string, { signal }: OperationCallbacks) => {
      await apiPost<{ message: string }>(
        `/api/containers/${encodeURIComponent(id)}/stop`,
        undefined,
        { signal }
      );
    },
    onSuccess: async (_result: void | undefined, id: string) => {
      invalidateContainerQueries(queryClient, id);
    },
    onError: async (_error: Error, id: string) => {
      invalidateContainerQueries(queryClient, id);
    },
  }), [queryClient]);

  return useBackgroundOperation<string>(config);
}

export function useRestartContainer() {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "container-restart",
    getLabel: (id: string) => `Restarting ${id}`,
    execute: async (id: string, { signal }: OperationCallbacks) => {
      await apiPost<{ message: string }>(
        `/api/containers/${encodeURIComponent(id)}/restart`,
        undefined,
        { signal }
      );
    },
    onSuccess: async (_result: void | undefined, id: string) => {
      invalidateContainerQueries(queryClient, id);
    },
    onError: async (_error: Error, id: string) => {
      invalidateContainerQueries(queryClient, id);
    },
  }), [queryClient]);

  return useBackgroundOperation<string>(config);
}

export function useRemoveContainer() {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "container-remove",
    getLabel: ({ id }: { id: string }) => `Removing ${id}`,
    execute: async (
      { id, force = false }: { id: string; force?: boolean },
      { signal }: OperationCallbacks
    ) => {
      await apiDelete<{ message: string }>(
        `/api/containers/${encodeURIComponent(id)}${force ? "?force=true" : ""}`,
        undefined,
        { signal }
      );
    },
    onSuccess: async () => {
      invalidateContainerQueries(queryClient);
    },
    onError: async () => {
      invalidateContainerQueries(queryClient);
    },
  }), [queryClient]);

  return useBackgroundOperation<{ id: string; force?: boolean }>(config);
}

export function usePruneContainers() {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "container-prune",
    getLabel: () => "Removing stopped containers",
    execute: async (_args: void, { signal }: OperationCallbacks) => {
      return await apiPost<ContainerPruneResult>(
        "/api/containers/prune",
        undefined,
        { signal }
      );
    },
    onSuccess: async () => {
      invalidateContainerQueries(queryClient);
    },
    onError: async () => {
      invalidateContainerQueries(queryClient);
    },
  }), [queryClient]);

  return useBackgroundOperation<void, ContainerPruneResult>(config);
}
