"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Container, ContainerStats, ApiResponse } from "@/types";

export function useContainers() {
  return useQuery({
    queryKey: ["containers"],
    queryFn: async (): Promise<Container[]> => {
      const res = await fetch("/api/containers");
      const data: ApiResponse<Container[]> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data || [];
    },
  });
}

export function useContainer(id: string) {
  return useQuery({
    queryKey: ["containers", id],
    queryFn: async (): Promise<Container | null> => {
      const res = await fetch(`/api/containers/${encodeURIComponent(id)}`);
      if (res.status === 404) return null;
      const data: ApiResponse<Container> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data || null;
    },
    enabled: !!id,
  });
}

export function useContainerStats(id: string, enabled = true) {
  return useQuery({
    queryKey: ["containers", id, "stats"],
    queryFn: async (): Promise<ContainerStats> => {
      const res = await fetch(`/api/containers/${encodeURIComponent(id)}/stats`);
      const data: ApiResponse<ContainerStats> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data!;
    },
    enabled: !!id && enabled,
    refetchInterval: 2000,
  });
}

export function useStartContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/containers/${encodeURIComponent(id)}/start`, {
        method: "POST",
      });
      const data: ApiResponse<{ message: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: (_data, id) => {
      // Invalidate the specific container and the list
      queryClient.invalidateQueries({ queryKey: ["containers", id] });
      queryClient.invalidateQueries({ queryKey: ["containers"], exact: true });
      // Projects need refresh since container status affects project status
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useStopContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/containers/${encodeURIComponent(id)}/stop`, {
        method: "POST",
      });
      const data: ApiResponse<{ message: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["containers", id] });
      queryClient.invalidateQueries({ queryKey: ["containers"], exact: true });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useRestartContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/containers/${encodeURIComponent(id)}/restart`, {
        method: "POST",
      });
      const data: ApiResponse<{ message: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["containers", id] });
      queryClient.invalidateQueries({ queryKey: ["containers"], exact: true });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useContainerUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/containers/${encodeURIComponent(id)}/update`, {
        method: "POST",
      });
      const data: ApiResponse<{ output: string; restarted: boolean }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: async (_data, id) => {
      // Clear update cache so pulled images get rechecked
      await fetch("/api/images/check-updates", { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["containers", id] });
      queryClient.invalidateQueries({ queryKey: ["containers"], exact: true });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["images"] });
      queryClient.invalidateQueries({ queryKey: ["image-updates"] });
    },
  });
}
