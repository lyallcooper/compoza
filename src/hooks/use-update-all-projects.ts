"use client";

import type { ProjectWithUpdates } from "./use-image-updates";
import { useCallback } from "react";
import { useBackgroundProjectUpdate } from "./use-background-project-update";

const CONCURRENCY = 3;

async function fetchSelfProjectName(): Promise<string | null> {
  try {
    const res = await fetch("/api/self-project");
    if (!res.ok) return null;
    const data = await res.json();
    return data.name ?? null;
  } catch {
    return null;
  }
}

export function useUpdateAllProjects() {
  const { updateProject } = useBackgroundProjectUpdate();

  const start = useCallback(
    (projects: Pick<ProjectWithUpdates, "name" | "images">[]) => {
      (async () => {
        const selfName = await fetchSelfProjectName();

        // Separate self-project from the rest so it runs last
        const others = selfName
          ? projects.filter((project) => project.name !== selfName)
          : projects;
        const selfLast = projects.find((project) => project.name === selfName);

        // Run non-self projects with concurrency limit
        const executing = new Set<Promise<boolean>>();

        for (const project of others) {
          const p = updateProject(project.name, { images: project.images.map((image) => image.image) }).finally(() => executing.delete(p));
          executing.add(p);

          if (executing.size >= CONCURRENCY) {
            await Promise.race(executing);
          }
        }

        await Promise.all(executing);

        // Run self-project last (alone) so its restart doesn't kill other streams
        if (selfLast) {
          await updateProject(selfLast.name, { images: selfLast.images.map((image) => image.image) });
        }
      })();
    },
    [updateProject]
  );

  return { start };
}
