"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";
import {
  queryKeys,
  invalidateProjectQueries,
  invalidateContainerQueries,
  invalidateAllQueries,
  clearUpdateCacheAndInvalidate,
} from "@/lib/query";
import { withReconnection } from "@/lib/reconnect";
import { isProjectRunning, type Project } from "@/types";

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
      withReconnection(
        () => apiPost<{ output: string }>(`/api/projects/${encodeURIComponent(name)}/up`),
        { fallbackValue: { output: "Restarted (reconnected)" } }
      ),
    onSuccess: () => {
      invalidateAllQueries(queryClient);
    },
    onError: () => {
      invalidateProjectQueries(queryClient, name);
    },
  });
}

export function useProjectDown(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiPost<{ output: string }>(`/api/projects/${encodeURIComponent(name)}/down`),
    onSettled: () => invalidateProjectQueries(queryClient, name),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; composeContent: string; envContent?: string }) =>
      apiPost<{ message: string }>("/api/projects", data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
  });
}

export function useDeleteProject(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiDelete<{ message: string }>(`/api/projects/${encodeURIComponent(name)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
  });
}

export function useProjectPull(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Fetch project to get image names for cache clearing
      const project = await apiFetch<Project>(`/api/projects/${encodeURIComponent(name)}`);
      const images = project?.services
        .map((s) => s.image)
        .filter((img): img is string => !!img) || [];

      const result = await apiPost<{ output: string }>(
        `/api/projects/${encodeURIComponent(name)}/pull`
      );

      return { ...result, images };
    },
    onSuccess: async (data) => {
      await clearUpdateCacheAndInvalidate(queryClient, data?.images);
    },
    onSettled: () => invalidateProjectQueries(queryClient, name),
  });
}

export function useProjectUpdate(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { rebuild?: boolean }) => {
      // Check current project status before pulling
      const project = await apiFetch<Project>(`/api/projects/${encodeURIComponent(name)}`);
      const wasRunning = isProjectRunning(project);

      // Collect images from project for cache clearing
      const images = project?.services
        .map((s) => s.image)
        .filter((img): img is string => !!img) || [];

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
          images,
        };
      }

      return { output: pullResult?.output, restarted: false, images };
    },
    onSuccess: async (data) => {
      await clearUpdateCacheAndInvalidate(queryClient, data?.images);
    },
    onSettled: () => {
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
