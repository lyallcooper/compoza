import type { DockerState } from "./state";

export function createMockImage(state: DockerState, id: string) {
  const getState = () => {
    // Look up by ID, then by repo tag, then by ID prefix
    let img = state.images.get(id);
    if (!img) {
      for (const i of state.images.values()) {
        if (i.listInfo.RepoTags?.includes(id)) {
          img = i;
          break;
        }
      }
    }
    if (!img && id.startsWith("sha256:") && id.length >= 19) {
      for (const i of state.images.values()) {
        if (i.id.startsWith(id)) {
          img = i;
          break;
        }
      }
    }
    if (!img) {
      const err = new Error("no such image") as Error & { statusCode: number; reason: string };
      err.statusCode = 404;
      err.reason = "no such image";
      throw err;
    }
    return img;
  };

  return {
    inspect: async () => {
      return getState().inspectInfo;
    },

    remove: async () => {
      getState();
      state.images.delete(id);
    },
  };
}
