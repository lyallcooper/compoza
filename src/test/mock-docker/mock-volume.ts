import type { DockerState } from "./state";

export function createMockVolume(state: DockerState, name: string) {
  const getState = () => {
    const vol = state.volumes.get(name);
    if (!vol) {
      const err = new Error("no such volume") as Error & { statusCode: number; reason: string };
      err.statusCode = 404;
      err.reason = "no such volume";
      throw err;
    }
    return vol;
  };

  return {
    inspect: async () => {
      return getState().info;
    },

    remove: async () => {
      getState();
      state.volumes.delete(name);
    },
  };
}
