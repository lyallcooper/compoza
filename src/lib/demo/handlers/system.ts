import type { DemoState } from "../state";
import type { SystemPruneOptions } from "@/types";
import { createDemoSSEStream } from "../sse";
import { json, sse } from "../response";

export function systemInfo(state: DemoState): Response {
  const containers = [...state.containers.values()];
  const running = containers.filter((c) => c.state === "running" || c.state === "restarting").length;
  const stopped = containers.filter((c) => c.state === "exited").length;
  const paused = containers.filter((c) => c.state === "paused").length;
  return json({
    ...state.systemInfo,
    containers: { total: containers.length, running, paused, stopped },
    images: state.images.size,
  });
}

export function diskUsage(state: DemoState): Response {
  return json(state.getDiskUsage());
}

export function systemPrune(state: DemoState, body: SystemPruneOptions): Response {
  const result = state.systemPrune(body);

  const events = [
    { type: "output", data: "Pruning system..." },
    ...(body.containers ? [{ type: "step", data: `Deleted ${result.containersDeleted} containers` }] : []),
    ...(body.networks ? [{ type: "step", data: `Deleted ${result.networksDeleted} networks` }] : []),
    ...(body.images ? [{ type: "step", data: `Deleted ${result.imagesDeleted} images` }] : []),
    ...(body.volumes ? [{ type: "step", data: `Deleted ${result.volumesDeleted} volumes` }] : []),
    ...(body.buildCache ? [{ type: "step", data: `Reclaimed ${formatBytes(result.buildCacheSpaceReclaimed)} of build cache` }] : []),
    { type: "done", data: JSON.stringify(result) },
  ];

  return sse(createDemoSSEStream(events, 200));
}

export function selfUpdate(): Response {
  return json({ message: "Self-update is not available in demo mode" });
}

export function health(): Response {
  return json({ ok: true });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)}GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  return `${(bytes / 1_000).toFixed(1)}KB`;
}

