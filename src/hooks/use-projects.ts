"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiPut } from "@/lib/api";
import {
  queryKeys,
  invalidateProjectQueries,
  invalidateAllQueries,
  clearUpdateCacheAndInvalidate,
} from "@/lib/query";
import { type Project } from "@/types";
import { useBackgroundOperation, consumeOutputStream, type OperationCallbacks } from "./use-background-operation";

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

  const config = useMemo(() => ({
    type: "project-up",
    getLabel: () => `Starting ${name}`,
    execute: async (_args: void, { appendOutput, signal }: OperationCallbacks) => {
      await consumeOutputStream(`/api/projects/${encodeURIComponent(name)}/up`, { signal, appendOutput });
    },
    onSuccess: async () => {
      invalidateAllQueries(queryClient);
    },
    onError: async () => {
      invalidateProjectQueries(queryClient, name);
    },
  }), [name, queryClient]);

  return useBackgroundOperation(config);
}

export function useProjectDown(name: string) {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "project-down",
    getLabel: () => `Stopping ${name}`,
    execute: async (_args: void, { appendOutput, signal }: OperationCallbacks) => {
      await consumeOutputStream(`/api/projects/${encodeURIComponent(name)}/down`, { signal, appendOutput });
    },
    onSuccess: async () => {
      invalidateProjectQueries(queryClient, name);
    },
    onError: async () => {
      invalidateProjectQueries(queryClient, name);
    },
  }), [name, queryClient]);

  return useBackgroundOperation(config);
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

  const config = useMemo(() => ({
    type: "project-delete",
    getLabel: () => `Deleting ${name}`,
    execute: async (_args: void, { appendOutput, signal }: OperationCallbacks) => {
      await consumeOutputStream(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE", signal, appendOutput });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
    onError: async () => {
      invalidateProjectQueries(queryClient, name);
    },
  }), [name, queryClient]);

  return useBackgroundOperation(config);
}

export function useProjectPull(name: string) {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "project-pull",
    getLabel: () => `Pulling images for ${name}`,
    execute: async (_args: void, { appendOutput, signal }: OperationCallbacks) => {
      // Fetch project to get image names for cache clearing
      const project = await apiFetch<Project>(
        `/api/projects/${encodeURIComponent(name)}`,
        { signal }
      );
      const images = project?.services
        .map((s) => s.image)
        .filter((img): img is string => !!img) || [];

      await consumeOutputStream(`/api/projects/${encodeURIComponent(name)}/pull`, { signal, appendOutput });

      return { images };
    },
    onSuccess: async (result: { images: string[] } | undefined) => {
      await clearUpdateCacheAndInvalidate(queryClient, result?.images);
      invalidateProjectQueries(queryClient, name);
    },
    onError: async () => {
      invalidateProjectQueries(queryClient, name);
    },
  }), [name, queryClient]);

  return useBackgroundOperation<void, { images: string[] }>(config);
}

export function useSaveProjectCompose(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      apiPut<{ message: string }>(`/api/projects/${encodeURIComponent(name)}/compose`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.compose(name) });
    },
  });
}

export function useSaveProjectEnv(name: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      apiPut<{ message: string }>(`/api/projects/${encodeURIComponent(name)}/env`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.env(name) });
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
