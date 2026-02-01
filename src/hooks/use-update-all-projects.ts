"use client";

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UpdateAllEvent } from "@/app/api/projects/update-all/route";

export interface ProjectProgress {
  project: string;
  step: "checking" | "pulling" | "restarting" | "complete" | "error";
  restarted?: boolean;
  error?: string;
}

interface UpdateAllState {
  isRunning: boolean;
  progress: ProjectProgress[];
  currentProject: string | null;
  total: number;
  current: number;
  summary: { updated: number; failed: number } | null;
  error: string | null;
}

export function useUpdateAllProjects() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<UpdateAllState>({
    isRunning: false,
    progress: [],
    currentProject: null,
    total: 0,
    current: 0,
    summary: null,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    // Reset state
    setState({
      isRunning: true,
      progress: [],
      currentProject: null,
      total: 0,
      current: 0,
      summary: null,
      error: null,
    });

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/projects/update-all", {
        method: "POST",
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

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

      // Process any remaining data
      if (buffer.startsWith("data: ")) {
        try {
          const event: UpdateAllEvent = JSON.parse(buffer.slice(6));
          handleEvent(event);
        } catch {
          // Ignore parse errors
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }));
      }
    }

    function handleEvent(event: UpdateAllEvent) {
      setState((prev) => {
        switch (event.type) {
          case "start":
            return {
              ...prev,
              currentProject: event.project,
              total: event.total,
              current: event.current,
              progress: [
                ...prev.progress,
                { project: event.project, step: "checking" },
              ],
            };

          case "progress": {
            const progress = prev.progress.map((p) =>
              p.project === event.project ? { ...p, step: event.step } : p
            );
            return { ...prev, progress } as UpdateAllState;
          }

          case "complete": {
            const progress = prev.progress.map((p) =>
              p.project === event.project
                ? { ...p, step: "complete" as const, restarted: event.restarted }
                : p
            );
            return { ...prev, progress };
          }

          case "error": {
            // If project is empty string, it's a general error
            if (!event.project) {
              return {
                ...prev,
                isRunning: false,
                error: event.message,
              };
            }
            const progress = prev.progress.map((p) =>
              p.project === event.project
                ? { ...p, step: "error" as const, error: event.message }
                : p
            );
            return { ...prev, progress };
          }

          case "done":
            return {
              ...prev,
              isRunning: false,
              currentProject: null,
              summary: event.summary,
            };

          default:
            return prev;
        }
      });
    }

    // Invalidate queries on completion
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    await queryClient.invalidateQueries({ queryKey: ["containers"] });
    await queryClient.invalidateQueries({ queryKey: ["images"] });
    await queryClient.invalidateQueries({ queryKey: ["image-updates"] });
  }, [queryClient]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setState((prev) => ({
      ...prev,
      isRunning: false,
      error: "Cancelled",
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isRunning: false,
      progress: [],
      currentProject: null,
      total: 0,
      current: 0,
      summary: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    start,
    cancel,
    reset,
  };
}
