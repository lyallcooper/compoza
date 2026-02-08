"use client";

import { useCallback } from "react";
import { useBackgroundProjectUpdate } from "./use-background-project-update";

const CONCURRENCY = 3;

export function useUpdateAllProjects() {
  const { updateProject } = useBackgroundProjectUpdate();

  const start = useCallback(
    (projectNames: string[]) => {
      (async () => {
        const executing = new Set<Promise<boolean>>();

        for (const name of projectNames) {
          const p = updateProject(name).finally(() => executing.delete(p));
          executing.add(p);

          if (executing.size >= CONCURRENCY) {
            await Promise.race(executing);
          }
        }

        await Promise.all(executing);
      })();
    },
    [updateProject]
  );

  return { start };
}
