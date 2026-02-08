import type Docker from "dockerode";
import type { DockerState } from "./state";
import { createMockContainer } from "./mock-container";
import { createMockImage } from "./mock-image";
import { createMockNetwork } from "./mock-network";
import { createMockVolume } from "./mock-volume";

export function createMockDocker(state: DockerState): Docker {
  return {
    // --- Containers ---

    listContainers: async (opts?: { all?: boolean; size?: boolean }) => {
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

    // --- Images ---

    listImages: async () => {
      return [...state.images.values()].map((img) => img.listInfo);
    },

    getImage: (id: string) => {
      return createMockImage(state, id) as unknown as Docker.Image;
    },

    pruneImages: async () => {
      const deleted: Array<{ id: string; size: number }> = [];
      for (const [id, img] of state.images) {
        const tags = img.listInfo.RepoTags || [];
        const isDangling = tags.length === 0 || tags[0] === "<none>:<none>";
        if (isDangling) {
          deleted.push({ id, size: img.listInfo.Size ?? 0 });
        }
      }
      for (const { id } of deleted) {
        state.images.delete(id);
      }
      return {
        ImagesDeleted: deleted.length > 0 ? deleted.map(({ id }) => ({ Deleted: id })) : null,
        SpaceReclaimed: deleted.reduce((sum, { size }) => sum + size, 0),
      };
    },

    // --- Networks ---

    listNetworks: async () => {
      return [...state.networks.values()].map((net) => net.listInfo);
    },

    getNetwork: (id: string) => {
      return createMockNetwork(state, id) as unknown as Docker.Network;
    },

    createNetwork: async (opts: { Name: string; Driver?: string; IPAM?: unknown }) => {
      // Just a no-op for testing — the test verifies the config passed
      return { id: `net-${opts.Name}` };
    },

    pruneNetworks: async () => {
      return {
        NetworksDeleted: [] as string[],
      };
    },

    // --- Volumes ---

    listVolumes: async () => {
      return {
        Volumes: [...state.volumes.values()].map((vol) => vol.info),
        Warnings: null,
      };
    },

    getVolume: (name: string) => {
      return createMockVolume(state, name) as unknown as Docker.Volume;
    },

    createVolume: async () => {
      return {};
    },

    pruneVolumes: async () => {
      return {
        VolumesDeleted: [] as string[],
        SpaceReclaimed: 0,
      };
    },

    // --- System ---

    df: (...args: unknown[]) => {
      // Support both callback and promise styles
      const callback = args.find((a) => typeof a === "function") as
        | ((err: Error | null, data: unknown) => void)
        | undefined;
      if (callback) {
        callback(null, state.dfData);
        return;
      }
      return Promise.resolve(state.dfData);
    },

    info: async () => {
      return state.systemInfo;
    },

    pruneBuilder: async () => {
      return { SpaceReclaimed: 0 };
    },

    // Modem (for pull progress tracking — not used in tests)
    modem: {
      followProgress: () => {},
    },
  } as unknown as Docker;
}
