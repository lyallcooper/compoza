"use client";

import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAllQueries } from "@/lib/query";
import { handleDisconnection } from "@/lib/reconnect";
import { useBackgroundTasks } from "@/contexts";
import type { UpdateAllEvent } from "@/app/api/projects/update-all/route";

export function useUpdateAllProjects() {
  const queryClient = useQueryClient();
  const { addTask, updateTask } = useBackgroundTasks();
  const abortControllerRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (projectNames: string[]) => {
      const taskId = `update-all-${Date.now()}`;
      const projectCount = projectNames.length;

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
        type: "update-all",
        label: `Updating ${projectCount} project${projectCount !== 1 ? "s" : ""}`,
        status: "running",
        total: projectCount,
        current: 0,
        cancel,
      });

      let current = 0;
      let currentProject = "";
      const errors: string[] = [];

      try {
        const response = await fetch("/api/projects/update-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projects: projectNames }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = (event: UpdateAllEvent) => {
          switch (event.type) {
            case "start":
              current = event.current;
              currentProject = event.project;
              updateTask(taskId, {
                current,
                progress: `${currentProject}: Checking...`,
              });
              break;

            case "progress":
              updateTask(taskId, {
                progress: `${currentProject}: ${getStepText(event.step)}`,
              });
              break;

            case "complete":
              // Progress updated via done event summary
              break;

            case "error":
              if (event.project) {
                // Track individual project errors
                errors.push(`${event.project}: ${event.message}`);
              } else {
                // Global error - show immediately
                updateTask(taskId, {
                  status: "error",
                  error: event.message,
                  cancel: undefined,
                });
              }
              break;

            case "done":
              if (event.summary.failed > 0 && errors.length > 0) {
                updateTask(taskId, {
                  status: "error",
                  progress: `${event.summary.updated} updated, ${event.summary.failed} failed`,
                  error: errors.join("\n"),
                  cancel: undefined,
                });
              } else {
                updateTask(taskId, {
                  status: "complete",
                  progress: `${event.summary.updated} updated`,
                  cancel: undefined,
                });
              }
              break;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event: UpdateAllEvent = JSON.parse(line.slice(6));
                handleEvent(event);
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        if (buffer.startsWith("data: ")) {
          try {
            const event: UpdateAllEvent = JSON.parse(buffer.slice(6));
            handleEvent(event);
          } catch {
            // Ignore parse errors
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError" || cancelled) return;
        await handleDisconnection(taskId, updateTask, queryClient);
        return;
      }

      invalidateAllQueries(queryClient);
    },
    [queryClient, addTask, updateTask]
  );

  return { start };
}

function getStepText(step: string): string {
  switch (step) {
    case "checking":
      return "Checking...";
    case "pulling":
      return "Pulling images...";
    case "restarting":
      return "Restarting...";
    default:
      return step;
  }
}
