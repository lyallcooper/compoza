import type { DemoState } from "../state";
import { getContainerLogs } from "../fixtures";
import { createDemoSSEStream } from "../sse";
import { jsonError, sse } from "../response";

export function containerLogs(state: DemoState, id: string): Response {
  const c = state.containers.get(id)
    ?? [...state.containers.values()].find((ct) => ct.name === id);
  if (!c) return jsonError("Container not found", 404);
  const lines = getContainerLogs(c.name);
  const events = lines.map((line) => ({ type: "log", line }));
  return sse(createDemoSSEStream(events, 50));
}

export function projectLogs(state: DemoState, name: string, service?: string): Response {
  const containers = [...state.containers.values()].filter(
    (c) => c.projectName === name && (!service || c.serviceName === service)
  );

  if (containers.length === 0) return jsonError("No containers found", 404);

  const events = containers.flatMap((c) =>
    getContainerLogs(c.name).map((line) => ({ type: "log", line: `${c.serviceName} | ${line}` }))
  );

  return sse(createDemoSSEStream(events, 50));
}

