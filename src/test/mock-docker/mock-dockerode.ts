import type Docker from "dockerode";
import { Readable } from "node:stream";
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

    listImages: async (opts?: { filters?: { reference?: string[] } }) => {
      const all = [...state.images.values()].map((img) => img.listInfo);
      const refs = opts?.filters?.reference;
      if (!refs || refs.length === 0) return all;
      return all.filter((img) => {
        const tags = img.RepoTags || [];
        return refs.some((ref) => tags.some((tag) => tag === ref || tag.startsWith(ref.split(":")[0] + ":")));
      });
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

    // Pull image — returns a mock progress stream via callback
    pull: (name: string, callback: (err: Error | null, stream: NodeJS.ReadableStream) => void) => {
      const events = [
        JSON.stringify({ status: "Pulling from library/" + name.split(":")[0] }),
        JSON.stringify({ status: "Digest: sha256:mock" }),
        JSON.stringify({ status: "Status: Image is up to date for " + name }),
      ];
      const stream = Readable.from(events.map((e) => e + "\n"));
      callback(null, stream);
    },

    // Create container — no-op, returns object with id and start()
    createContainer: async (opts: { Image?: string; name?: string }) => {
      const id = "mock-" + (opts.name || "container") + "-" + Date.now();
      return {
        id,
        start: async () => {},
        attach: async () => Readable.from([]),
        wait: async () => ({ StatusCode: 0 }),
      };
    },

    // Modem (for pull progress tracking)
    modem: {
      followProgress: (
        stream: NodeJS.ReadableStream,
        onFinished: (err: Error | null, output: unknown[]) => void,
        onProgress?: (event: unknown) => void,
      ) => {
        const output: unknown[] = [];
        stream.on("data", (chunk: Buffer | string) => {
          try {
            const event = JSON.parse(typeof chunk === "string" ? chunk : chunk.toString());
            output.push(event);
            onProgress?.(event);
          } catch {
            // ignore non-JSON chunks
          }
        });
        stream.on("end", () => onFinished(null, output));
        stream.on("error", (err: Error) => onFinished(err, output));
      },
    },
  } as unknown as Docker;
}
