import type { DockerState } from "./state";

export function createMockImage(state: DockerState, id: string) {
  const getState = () => {
    const img = state.images.get(id);
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
