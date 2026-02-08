import type { DockerState } from "./state";

export function createMockNetwork(state: DockerState, id: string) {
  const getState = () => {
    // Look up by ID or by name
    let net = state.networks.get(id);
    if (!net) {
      for (const n of state.networks.values()) {
        if (n.listInfo.Name === id) {
          net = n;
          break;
        }
      }
    }
    if (!net) {
      const err = new Error("no such network") as Error & { statusCode: number; reason: string };
      err.statusCode = 404;
      err.reason = "no such network";
      throw err;
    }
    return net;
  };

  return {
    inspect: async () => {
      return getState().inspectInfo;
    },

    remove: async () => {
      const net = getState();
      state.networks.delete(net.id);
    },
  };
}
