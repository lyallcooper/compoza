import type { DemoState } from "../state";
import { getImageDetail, DEMO_UPDATES } from "../fixtures";
import { createDemoSSEStream, buildOutputEvents } from "../sse";
import { json, sse } from "../response";

export function listImages(state: DemoState): Response {
  return json([...state.images.values()]);
}

export function getImage(state: DemoState, id: string): Response {
  // Look up by ID first, then fall back to matching by name/tag (the list page links by tag)
  let img = state.images.get(id);
  if (!img) {
    img = [...state.images.values()].find(
      (i) => i.name === id || i.tags.includes(id)
    );
  }
  if (!img) return json({ error: "Image not found" }, 404);
  return json(getImageDetail(img, state.containers));
}

export function deleteImage(state: DemoState, id: string): Response {
  // Support lookup by tag name as well as ID
  let resolvedId = id;
  if (!state.images.has(id)) {
    const img = [...state.images.values()].find(
      (i) => i.name === id || i.tags.includes(id)
    );
    if (!img) return json({ error: "Image not found" }, 404);
    resolvedId = img.id;
  }
  if (!state.deleteImage(resolvedId)) return json({ error: "Image not found" }, 404);
  return json({ message: "Image deleted" });
}

export function pullImage(state: DemoState, body: { name: string }): Response {
  if (!body.name) return json({ error: "Image name required" }, 400);

  // Add or update the image in state
  const existing = [...state.images.values()].find(
    (i) => i.name === body.name || i.tags.includes(body.name)
  );
  if (!existing) {
    const id = "sha256:" + Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64);
    state.images.set(id, {
      id,
      name: body.name,
      tags: [body.name],
      size: Math.floor(Math.random() * 200_000_000) + 20_000_000,
      created: Math.floor(Date.now() / 1000),
      digest: "sha256:" + Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64),
    });
  }

  const events = buildOutputEvents([
    `Pulling ${body.name}...`,
    `Pulling from library/${body.name.split(":")[0]}`,
    `Digest: sha256:mock...`,
    `Status: Downloaded newer image for ${body.name}`,
  ]);
  return sse(createDemoSSEStream(events, 400));
}

export function pruneImages(state: DemoState): Response {
  const result = state.pruneImages();
  return json({ ImagesDeleted: result.deleted, SpaceReclaimed: result.spaceReclaimed });
}

export function checkUpdatesGet(state: DemoState): Response {
  const results = Object.entries(DEMO_UPDATES)
    .filter(([image]) => !state.clearedImageUpdates.has(image))
    .map(([image, info]) => ({
      image,
      updateAvailable: true,
      status: "checked",
      currentVersion: info.currentVersion,
      latestVersion: info.latestVersion,
    }));
  return json(results);
}

export function checkUpdatesPost(state: DemoState, body: { images?: string[] }): Response {
  const images = body.images ?? Object.keys(DEMO_UPDATES);
  const results = images.map((image) => {
    const info = DEMO_UPDATES[image];
    const cleared = state.clearedImageUpdates.has(image);
    return {
      image,
      updateAvailable: !!info && !cleared,
      status: "checked" as const,
      currentVersion: info?.currentVersion,
      latestVersion: info?.latestVersion,
    };
  });
  return json(results);
}

export function checkUpdatesDelete(state: DemoState, body?: { images?: string[] }): Response {
  if (body?.images) {
    for (const image of body.images) {
      state.clearImageUpdate(image);
    }
  } else {
    state.clearAllImageUpdates();
  }
  return json({ message: "Cache cleared" });
}

