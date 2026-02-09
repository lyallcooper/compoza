import type { DemoState } from "../state";
import { getVolumeContainers } from "../fixtures";
import { json } from "../response";

export function listVolumes(state: DemoState): Response {
  const volumes = [...state.volumes.values()].map((v) => {
    const usingCount = getVolumeContainers(v, state.containers).length;
    return {
      ...v,
      containerCount: usingCount,
      actions: { canDelete: usingCount === 0 },
    };
  });
  return json(volumes);
}

export function getVolume(state: DemoState, name: string): Response {
  const v = findVolumeByName(state, name);
  if (!v) return json({ error: "Volume not found" }, 404);
  const containers = getVolumeContainers(v, state.containers);
  return json({
    ...v,
    containers,
    containerCount: containers.length,
    actions: { canDelete: containers.length === 0 },
  });
}

export function createVolume(state: DemoState, body: { name: string; driver?: string; labels?: Record<string, string> }): Response {
  if (!body.name) return json({ error: "Name required" }, 400);
  if (findVolumeByName(state, body.name)) return json({ error: "Volume already exists" }, 409);
  state.createVolume(body.name, body.driver, body.labels);
  return json({ message: "Volume created" }, 201);
}

export function deleteVolume(state: DemoState, name: string): Response {
  const v = findVolumeByName(state, name);
  if (!v) return json({ error: "Volume not found" }, 404);
  state.deleteVolume(v.name);
  return json({ message: "Volume removed" });
}

export function pruneVolumes(state: DemoState): Response {
  const result = state.pruneVolumes();
  return json({ VolumesDeleted: result.deleted, SpaceReclaimed: result.spaceReclaimed });
}

function findVolumeByName(state: DemoState, name: string) {
  return [...state.volumes.values()].find((v) => v.name === name);
}

