"use client";

import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api";
import {
  invalidateProjectQueries,
  invalidateContainerQueries,
  clearUpdateCacheAndInvalidate,
} from "@/lib/query";
import { handleDisconnection, isNetworkError } from "@/lib/reconnect";
import { useBackgroundTasks } from "@/contexts";
import { isProjectRunning, type Project } from "@/types";

interface UpdateProjectOptions {
  rebuild?: boolean;
}

interface UpdateContainerOptions {
  containerId: string;
  containerName: string;
}

export function useBackgroundProjectUpdate(projectName: string) {
  const queryClient = useQueryClient();
  const { addTask, updateTask } = useBackgroundTasks();
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateProject = useCallback(
    async (options?: UpdateProjectOptions) => {
      const taskId = `update-project-${projectName}-${Date.now()}`;
      abortControllerRef.current = new AbortController();

      let cancelled = false;
      const cancel = () => {
        cancelled = true;
        abortControllerRef.current?.abort();
        updateTask(taskId, {
          status: "error",
          error: "Cancelled",
          cancel: undefined,
        });
      };

      addTask({
        id: taskId,
        type: "update-project",
        label: `Updating ${projectName}`,
        progress: "Checking status...",
        status: "running",
        cancel,
      });

      try {
        // Check current project status
        updateTask(taskId, { progress: "Checking status..." });
        const project = await apiFetch<Project>(
          `/api/projects/${encodeURIComponent(projectName)}`,
          { signal: abortControllerRef.current.signal }
        );
        if (cancelled) return;

        const wasRunning = isProjectRunning(project);
        const images = project?.services
          .map((s) => s.image)
          .filter((img): img is string => !!img) || [];

        // Pull latest images
        updateTask(taskId, { progress: "Pulling images..." });
        await apiPost<{ output: string }>(
          `/api/projects/${encodeURIComponent(projectName)}/pull`,
          undefined,
          { signal: abortControllerRef.current.signal }
        );
        if (cancelled) return;

        // Recreate containers if project was running
        if (wasRunning) {
          updateTask(taskId, { progress: "Restarting..." });
          await apiPost<{ output: string }>(
            `/api/projects/${encodeURIComponent(projectName)}/up`,
            { build: options?.rebuild },
            { signal: abortControllerRef.current.signal }
          );
          if (cancelled) return;
        }

        updateTask(taskId, {
          status: "complete",
          progress: wasRunning ? "Updated and restarted" : "Updated",
          cancel: undefined,
        });

        await clearUpdateCacheAndInvalidate(queryClient, images);
        invalidateProjectQueries(queryClient, projectName);
        invalidateContainerQueries(queryClient);
      } catch (err) {
        if ((err as Error).name === "AbortError" || cancelled) return;
        if (isNetworkError(err)) {
          await handleDisconnection(taskId, updateTask, queryClient);
        } else {
          updateTask(taskId, {
            status: "error",
            error: err instanceof Error ? err.message : "Update failed",
            cancel: undefined,
          });
        }
      }
    },
    [projectName, queryClient, addTask, updateTask]
  );

  return { updateProject };
}

export function useBackgroundContainerUpdate() {
  const queryClient = useQueryClient();
  const { addTask, updateTask } = useBackgroundTasks();
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateContainer = useCallback(
    async ({ containerId, containerName }: UpdateContainerOptions) => {
      const taskId = `update-container-${containerId}-${Date.now()}`;
      abortControllerRef.current = new AbortController();

      let cancelled = false;
      const cancel = () => {
        cancelled = true;
        abortControllerRef.current?.abort();
        updateTask(taskId, {
          status: "error",
          error: "Cancelled",
          cancel: undefined,
        });
      };

      addTask({
        id: taskId,
        type: "update-container",
        label: `Updating ${containerName}`,
        progress: "Pulling image...",
        status: "running",
        cancel,
      });

      try {
        const result = await apiPost<{ output: string; restarted: boolean; image?: string }>(
          `/api/containers/${encodeURIComponent(containerId)}/update`,
          undefined,
          { signal: abortControllerRef.current.signal }
        );
        if (cancelled) return;

        updateTask(taskId, {
          status: "complete",
          progress: result?.restarted ? "Updated and restarted" : "Updated",
          cancel: undefined,
        });

        const images = result?.image ? [result.image] : undefined;
        await clearUpdateCacheAndInvalidate(queryClient, images);
        invalidateContainerQueries(queryClient, containerId);
      } catch (err) {
        if ((err as Error).name === "AbortError" || cancelled) return;
        if (isNetworkError(err)) {
          await handleDisconnection(taskId, updateTask, queryClient);
        } else {
          updateTask(taskId, {
            status: "error",
            error: err instanceof Error ? err.message : "Update failed",
            cancel: undefined,
          });
        }
      }
    },
    [queryClient, addTask, updateTask]
  );

  return { updateContainer };
}
