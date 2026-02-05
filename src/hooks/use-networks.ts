"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";
import { queryKeys, invalidateNetworkQueries } from "@/lib/query";
import type { DockerNetwork } from "@/types";
import type { CreateNetworkOptions, NetworkPruneResult } from "@/lib/docker";

export function useNetworks() {
  return useQuery({
    queryKey: queryKeys.networks.all,
    queryFn: () => apiFetch<DockerNetwork[]>("/api/networks"),
  });
}

export function useNetwork(id: string) {
  return useQuery({
    queryKey: queryKeys.networks.detail(id),
    queryFn: () =>
      apiFetch<DockerNetwork | null>(`/api/networks/${encodeURIComponent(id)}`, {
        nullOn404: true,
      }),
    enabled: !!id,
  });
}

export function useCreateNetwork() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateNetworkOptions) =>
      apiPost<{ message: string }>("/api/networks", params),
    onSuccess: () => {
      invalidateNetworkQueries(queryClient);
    },
  });
}

export function useRemoveNetwork() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ message: string }>(`/api/networks/${encodeURIComponent(id)}`),
    onSuccess: () => {
      invalidateNetworkQueries(queryClient);
    },
  });
}

export function usePruneNetworks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost<NetworkPruneResult>("/api/networks/prune"),
    onSuccess: () => {
      invalidateNetworkQueries(queryClient);
    },
  });
}
