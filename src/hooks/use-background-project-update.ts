"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  invalidateProjectQueries,
  invalidateContainerQueries,
  clearUpdateCacheAndInvalidate,
} from "@/lib/query";
import { isProjectRunning, type Project } from "@/types";
import { useBackgroundOperation, consumeSSEStream, consumeOutputStream, type OperationCallbacks } from "./use-background-operation";
import type { ContainerUpdateStreamEvent } from "@/types";

interface UpdateProjectArgs {
  projectName: string;
  rebuild?: boolean;
}

export function useBackgroundProjectUpdate() {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "update-project",
    getLabel: (args: UpdateProjectArgs) => `Updating ${args.projectName}`,
    initialProgress: "Checking status...",
    execute: async (args: UpdateProjectArgs, { setProgress, appendOutput, signal }: OperationCallbacks) => {
      const { projectName } = args;

      // Check current project status
      setProgress("Checking status...");
      const project = await apiFetch<Project>(
        `/api/projects/${encodeURIComponent(projectName)}`,
        { signal }
      );

      const wasRunning = isProjectRunning(project);
      const images = project?.services
        .map((s) => s.image)
        .filter((img): img is string => !!img) || [];

      // Pull latest images via SSE
      setProgress("Pulling images...");
      await consumeOutputStream(`/api/projects/${encodeURIComponent(projectName)}/pull`, { signal, appendOutput });

      // Recreate containers if project was running
      if (wasRunning) {
        setProgress("Restarting...");
        await consumeOutputStream(`/api/projects/${encodeURIComponent(projectName)}/up`, {
          body: { build: args.rebuild },
          signal,
          appendOutput,
        });
      }

      setProgress(wasRunning ? "Updated and restarted" : "Updated");
      return { projectName, images };
    },
    onSuccess: async (result: { projectName: string; images: string[] } | undefined) => {
      await clearUpdateCacheAndInvalidate(queryClient, result?.images);
      if (result) invalidateProjectQueries(queryClient, result.projectName);
      invalidateContainerQueries(queryClient);
    },
    onError: async () => {
      // Clear cache even on failure — pull may have succeeded before up failed
      await clearUpdateCacheAndInvalidate(queryClient);
    },
  }), [queryClient]);

  const { execute } = useBackgroundOperation<UpdateProjectArgs, { projectName: string; images: string[] }>(config);

  const updateProject = useCallback(
    (projectName: string, options?: { rebuild?: boolean }) =>
      execute({ projectName, ...options }),
    [execute]
  );

  return { updateProject };
}

interface UpdateContainerArgs {
  containerId: string;
  containerName: string;
}

export function useBackgroundContainerUpdate() {
  const queryClient = useQueryClient();

  const config = useMemo(() => ({
    type: "update-container",
    getLabel: (args: UpdateContainerArgs) => `Updating ${args.containerName}`,
    initialProgress: "Pulling image...",
    execute: async (args: UpdateContainerArgs, { setProgress, appendOutput, signal }: OperationCallbacks) => {
      let updateResult: { restarted: boolean; image?: string } | undefined;
      let streamError: string | undefined;

      await consumeSSEStream<ContainerUpdateStreamEvent>(
        `/api/containers/${encodeURIComponent(args.containerId)}/update`,
        {
          signal,
          onEvent: (event) => {
            if (event.type === "output") appendOutput([event.data]);
            if (event.type === "done") {
              updateResult = event.result;
              setProgress(event.result.restarted ? "Updated and restarted" : "Updated");
            }
            if (event.type === "error") streamError = event.message;
          },
        }
      );

      if (streamError) throw new Error(streamError);
      return updateResult;
    },
    onSuccess: async (result: { restarted: boolean; image?: string } | undefined, args: UpdateContainerArgs) => {
      const images = result?.image ? [result.image] : undefined;
      await clearUpdateCacheAndInvalidate(queryClient, images);
      invalidateContainerQueries(queryClient, args.containerId);
    },
    onError: async (_error: Error, args: UpdateContainerArgs) => {
      await clearUpdateCacheAndInvalidate(queryClient);
      invalidateContainerQueries(queryClient, args.containerId);
    },
  }), [queryClient]);

  const { execute } = useBackgroundOperation<UpdateContainerArgs, { restarted: boolean; image?: string }>(config);

  const updateContainer = useCallback(
    (args: UpdateContainerArgs) => execute(args),
    [execute]
  );

  return { updateContainer };
}
