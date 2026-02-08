import type { DockerState } from "./state";
import { createMockLogStream } from "./mock-log-stream";

export function createMockContainer(state: DockerState, id: string) {
  const getState = () => {
    // Look up by ID, then by name, then by ID prefix
    let cs = state.containers.get(id);
    if (!cs) {
      for (const c of state.containers.values()) {
        if (c.inspectInfo.Name === `/${id}` || c.inspectInfo.Name === id) {
          cs = c;
          break;
        }
      }
    }
    if (!cs && id.length >= 12) {
      for (const c of state.containers.values()) {
        if (c.id.startsWith(id)) {
          cs = c;
          break;
        }
      }
    }
    if (!cs) {
      const err = new Error("no such container") as Error & { statusCode: number; reason: string };
      err.statusCode = 404;
      err.reason = "no such container";
      throw err;
    }
    return cs;
  };

  return {
    inspect: async () => {
      return getState().inspectInfo;
    },

    start: async () => {
      const cs = getState();
      const info = cs.inspectInfo as unknown as Record<string, unknown>;
      const stateObj = info.State as Record<string, unknown>;
      stateObj.Status = "running";
      stateObj.Running = true;
      cs.listInfo.State = "running";
    },

    stop: async () => {
      const cs = getState();
      const info = cs.inspectInfo as unknown as Record<string, unknown>;
      const stateObj = info.State as Record<string, unknown>;
      stateObj.Status = "exited";
      stateObj.Running = false;
      cs.listInfo.State = "exited";
    },

    restart: async () => {
      const cs = getState();
      const info = cs.inspectInfo as unknown as Record<string, unknown>;
      const stateObj = info.State as Record<string, unknown>;
      stateObj.Status = "running";
      stateObj.Running = true;
      cs.listInfo.State = "running";
    },

    remove: async () => {
      getState(); // throws 404 if not found
      state.containers.delete(id);
    },

    stats: async () => {
      return getState().stats;
    },

    logs: async () => {
      const cs = getState();
      return createMockLogStream(cs.logs);
    },
  };
}
