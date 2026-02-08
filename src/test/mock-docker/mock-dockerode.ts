import type Docker from "dockerode";
import type { DockerState } from "./state";
import { createMockContainer } from "./mock-container";

export function createMockDocker(state: DockerState): Docker {
  return {
    listContainers: async (opts?: { all?: boolean }) => {
      const all = opts?.all ?? false;
      const entries = [...state.containers.values()];
      if (all) {
        return entries.map((c) => c.listInfo);
      }
      return entries
        .filter((c) => c.listInfo.State === "running")
        .map((c) => c.listInfo);
    },

    getContainer: (id: string) => {
      return createMockContainer(state, id) as unknown as Docker.Container;
    },

    pruneContainers: async () => {
      const deleted: string[] = [];
      for (const [id, cs] of state.containers) {
        if (cs.listInfo.State === "exited") {
          deleted.push(id);
        }
      }
      for (const id of deleted) {
        state.containers.delete(id);
      }
      return {
        ContainersDeleted: deleted.length > 0 ? deleted : null,
        SpaceReclaimed: 0,
      };
    },
  } as unknown as Docker;
}
