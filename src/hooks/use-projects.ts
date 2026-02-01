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
    onSuccess: async () => {
      // Clear update cache so pulled images get rechecked
      await fetch("/api/images/check-updates", { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["projects", name] });
      queryClient.invalidateQueries({ queryKey: ["projects"], exact: true });
      queryClient.invalidateQueries({ queryKey: ["images"] });
      queryClient.invalidateQueries({ queryKey: ["image-updates"] });
    },
  });
}

export function useProjectUpdate(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Check current project status before pulling
      const statusRes = await fetch(`/api/projects/${encodeURIComponent(name)}`);
      const statusData: ApiResponse<Project> = await statusRes.json();
      if (statusData.error) throw new Error(statusData.error);
      const wasRunning = statusData.data?.status === "running" || statusData.data?.status === "partial";

      // Pull latest images
      const pullRes = await fetch(`/api/projects/${encodeURIComponent(name)}/pull`, {
        method: "POST",
      });
      const pullData: ApiResponse<{ output: string }> = await pullRes.json();
      if (pullData.error) throw new Error(pullData.error);

      // Only recreate containers if project was running
      if (wasRunning) {
        const upRes = await fetch(`/api/projects/${encodeURIComponent(name)}/up`, {
          method: "POST",
        });
        const upData: ApiResponse<{ output: string }> = await upRes.json();
        if (upData.error) throw new Error(upData.error);
        return { output: pullData.data?.output + "\n" + upData.data?.output, restarted: true };
      }

      return { output: pullData.data?.output, restarted: false };
    },
    onSuccess: async () => {
      // Clear update cache so pulled images get rechecked
      await fetch("/api/images/check-updates", { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["projects", name] });
      queryClient.invalidateQueries({ queryKey: ["projects"], exact: true });
      queryClient.invalidateQueries({ queryKey: ["containers"] });
      queryClient.invalidateQueries({ queryKey: ["images"] });
      queryClient.invalidateQueries({ queryKey: ["image-updates"] });
    },
  });
}

export function useProjectCompose(name: string) {
  return useQuery({
    queryKey: ["projects", name, "compose"],
    queryFn: async (): Promise<string> => {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/compose`);
      const data: ApiResponse<{ content: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data?.content || "";
    },
    enabled: !!name,
  });
}

export function useProjectEnv(name: string) {
  return useQuery({
    queryKey: ["projects", name, "env"],
    queryFn: async (): Promise<string> => {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/env`);
      const data: ApiResponse<{ content: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data?.content || "";
    },
    enabled: !!name,
  });
}
