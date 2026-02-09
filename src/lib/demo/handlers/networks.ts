import type { DemoState } from "../state";
import { getNetworkContainers } from "../fixtures";
import { json } from "../response";

/** Built-in Docker networks that can never be deleted */
const BUILTIN_NETWORKS = new Set(["bridge", "host", "none"]);

export function listNetworks(state: DemoState): Response {
  const networks = [...state.networks.values()].map((n) => {
    const connectedCount = getNetworkContainers(n, state.containers).length;
    return {
      ...n,
      containerCount: connectedCount,
      actions: { canDelete: !BUILTIN_NETWORKS.has(n.name) && connectedCount === 0 },
    };
  });
  return json(networks);
}

export function getNetwork(state: DemoState, name: string): Response {
  const n = findNetworkByName(state, name);
  if (!n) return json({ error: "Network not found" }, 404);
  const containers = getNetworkContainers(n, state.containers);
  return json({
    ...n,
    containers,
    containerCount: containers.length,
    actions: { canDelete: !BUILTIN_NETWORKS.has(n.name) && containers.length === 0 },
  });
}

export function createNetwork(state: DemoState, body: { name: string; driver?: string; subnet?: string; gateway?: string }): Response {
  if (!body.name) return json({ error: "Name required" }, 400);
  if (findNetworkByName(state, body.name)) return json({ error: "Network already exists" }, 409);
  state.createNetwork(body.name, body.driver, body.subnet, body.gateway);
  return json({ message: "Network created" }, 201);
}

export function deleteNetwork(state: DemoState, name: string): Response {
  const n = findNetworkByName(state, name);
  if (!n) return json({ error: "Network not found" }, 404);
  state.deleteNetwork(n.id);
  return json({ message: "Network removed" });
}

export function pruneNetworks(state: DemoState): Response {
  const result = state.pruneNetworks();
  return json({ NetworksDeleted: result.deleted });
}

function findNetworkByName(state: DemoState, name: string) {
  return [...state.networks.values()].find((n) => n.name === name);
}

