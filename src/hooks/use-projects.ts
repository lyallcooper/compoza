"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project, ApiResponse } from "@/types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const res = await fetch("/api/projects");
      const data: ApiResponse<Project[]> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data || [];
    },
  });
}

export function useProject(name: string) {
  return useQuery({
    queryKey: ["projects", name],
    queryFn: async (): Promise<Project | null> => {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`);
      if (res.status === 404) return null;
      const data: ApiResponse<Project> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data || null;
    },
    enabled: !!name,
  });
}

export function useProjectUp(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/up`, {
        method: "POST",
      });
      const data: ApiResponse<{ output: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      // Invalidate this specific project and the list
      queryClient.invalidateQueries({ queryKey: ["projects", name] });
      queryClient.invalidateQueries({ queryKey: ["projects"], exact: true });
      // Containers change when project comes up
      queryClient.invalidateQueries({ queryKey: ["containers"] });
    },
  });
}

export function useProjectDown(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/down`, {
        method: "POST",
      });
      const data: ApiResponse<{ output: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", name] });
      queryClient.invalidateQueries({ queryKey: ["projects"], exact: true });
      queryClient.invalidateQueries({ queryKey: ["containers"] });
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; composeContent: string; envContent?: string }) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result: ApiResponse<{ message: string }> = await res.json();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteProject(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data: ApiResponse<{ message: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useProjectPull(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/pull`, {
        method: "POST",
      });
      const data: ApiResponse<{ output: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", name] });
      queryClient.invalidateQueries({ queryKey: ["projects"], exact: true });
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}

export function useProjectUpdate(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Pull images and recreate containers
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pull: true }),
      });
      const data: ApiResponse<{ output: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", name] });
      queryClient.invalidateQueries({ queryKey: ["projects"], exact: true });
      queryClient.invalidateQueries({ queryKey: ["containers"] });
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}
