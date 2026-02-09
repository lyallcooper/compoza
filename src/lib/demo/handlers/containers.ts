import type { DemoState } from "../state";
import { getContainerStats } from "../fixtures";
import { createDemoSSEStream, buildOutputEvents } from "../sse";
import { json, sse } from "../response";

/** Look up a container by ID first, then fall back to name */
function resolve(state: DemoState, idOrName: string) {
  return state.containers.get(idOrName)
    ?? [...state.containers.values()].find((c) => c.name === idOrName);
}

export function listContainers(state: DemoState): Response {
  return json([...state.containers.values()]);
}

export function getContainer(state: DemoState, id: string): Response {
  const c = resolve(state, id);
  if (!c) return json({ error: "Container not found" }, 404);
  return json(c);
}

export function startContainer(state: DemoState, id: string): Response {
  const c = resolve(state, id);
  if (!c || !state.startContainer(c.id)) return json({ error: "Container not found or already running" }, 400);
  return json({ message: "Container started" });
}

export function stopContainer(state: DemoState, id: string): Response {
  const c = resolve(state, id);
  if (!c || !state.stopContainer(c.id)) return json({ error: "Container not found or already stopped" }, 400);
  return json({ message: "Container stopped" });
}

export function restartContainer(state: DemoState, id: string): Response {
  const c = resolve(state, id);
  if (!c || !state.restartContainer(c.id)) return json({ error: "Container not found" }, 404);
  return json({ message: "Container restarted" });
}

export function removeContainer(state: DemoState, id: string, force?: boolean): Response {
  const c = resolve(state, id);
  if (!c) return json({ error: "Container not found" }, 404);
  const result = state.removeContainer(c.id, force);
  if (result === "running") return json({ error: "You cannot remove a running container. Stop the container before attempting removal or force remove" }, 409);
  if (!result) return json({ error: "Container not found" }, 404);
  return json({ message: "Container removed" });
}

export function containerStats(state: DemoState, id: string): Response {
  const c = resolve(state, id);
  if (!c) return json({ error: "Container not found" }, 404);
  const stats = getContainerStats(c.id);
  if (!stats) return json({ error: "No stats available" }, 404);
  return json(stats);
}

export function updateContainer(state: DemoState, id: string): Response {
  const c = resolve(state, id);
  if (!c) return json({ error: "Container not found" }, 404);

  const events = buildOutputEvents([
    `Pulling ${c.image}...`,
    `Digest: sha256:mock...`,
    `Status: Image is up to date for ${c.image}`,
    `Recreating ${c.name}...`,
    `Container ${c.name} recreated`,
  ]);
  // Add done event with result data
  events[events.length - 1] = { type: "done", data: JSON.stringify({ restarted: true, image: c.image }) };

  state.restartContainer(c.id);
  state.clearImageUpdate(c.image);
  return sse(createDemoSSEStream(events, 400));
}

export function pruneContainers(state: DemoState): Response {
  const pruned = state.pruneContainers();
  return json({ ContainersDeleted: pruned, SpaceReclaimed: pruned.length * 500_000 });
}

