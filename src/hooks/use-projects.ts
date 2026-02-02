"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";
import {
  queryKeys,
  invalidateProjectQueries,
  invalidateContainerQueries,
  clearUpdateCacheAndInvalidate,
} from "@/lib/query";
import type { Project } from "@/types";

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.all,
    queryFn: () => apiFetch<Project[]>("/api/projects"),
  });
}

export function useProject(name: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(name),
    queryFn: () =>
      apiFetch<Project | null>(`/api/projects/${encodeURIComponent(name)}`, {
        nullOn404: true,
      }),
    enabled: !!name,
  });
}

export function useProjectUp(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiPost<{ output: string }>(`/api/projects/${encodeURIComponent(name)}/up`),
    onSuccess: () => {
      invalidateProjectQueries(queryClient, name);
    },
  });
}

export function useProjectDown(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiPost<{ output: string }>(`/api/projects/${encodeURIComponent(name)}/down`),
    onSuccess: () => {
      invalidateProjectQueries(queryClient, name);
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; composeContent: string; envContent?: string }) =>
      apiPost<{ message: string }>("/api/projects", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useDeleteProject(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiDelete<{ message: string }>(`/api/projects/${encodeURIComponent(name)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useProjectPull(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiPost<{ output: string }>(`/api/projects/${encodeURIComponent(name)}/pull`),
    onSuccess: async () => {
      await clearUpdateCacheAndInvalidate(queryClient);
      invalidateProjectQueries(queryClient, name);
    },
  });
}

export function useProjectUpdate(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { rebuild?: boolean }) => {
      // Check current project status before pulling
      const project = await apiFetch<Project>(`/api/projects/${encodeURIComponent(name)}`);
      const wasRunning = project?.status === "running" || project?.status === "partial";

      // Pull latest images
      const pullResult = await apiPost<{ output: string }>(
        `/api/projects/${encodeURIComponent(name)}/pull`
      );

      // Only recreate containers if project was running
      if (wasRunning) {
        const upResult = await apiPost<{ output: string }>(
          `/api/projects/${encodeURIComponent(name)}/up`,
          { build: options?.rebuild }
        );
        return {
          output: (pullResult?.output || "") + "\n" + (upResult?.output || ""),
          restarted: true,
        };
      }

      return { output: pullResult?.output, restarted: false };
    },
    onSuccess: async () => {
      await clearUpdateCacheAndInvalidate(queryClient);
      invalidateProjectQueries(queryClient, name);
      invalidateContainerQueries(queryClient);
    },
  });
}

export function useProjectCompose(name: string) {
  return useQuery({
    queryKey: queryKeys.projects.compose(name),
    queryFn: async () => {
      const result = await apiFetch<{ content: string }>(
        `/api/projects/${encodeURIComponent(name)}/compose`
      );
      // Normalize line endings to match CodeMirror's internal format (LF)
      return (result?.content || "").replace(/\r\n/g, "\n");
    },
    enabled: !!name,
  });
}

export function useProjectEnv(name: string) {
  return useQuery({
    queryKey: queryKeys.projects.env(name),
    queryFn: async () => {
      const result = await apiFetch<{ content: string }>(
        `/api/projects/${encodeURIComponent(name)}/env`
      );
      // Normalize line endings to match CodeMirror's internal format (LF)
      // This prevents false "unsaved changes" detection when the file has CRLF
      return (result?.content || "").replace(/\r\n/g, "\n");
    },
    enabled: !!name,
  });
}
