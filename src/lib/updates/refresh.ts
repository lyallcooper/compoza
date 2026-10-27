import { normalizeImageName } from "@/lib/format";
import { listContainers } from "@/lib/docker";
import { checkImageUpdates } from "./image-updates";
import { getAllCachedUpdates } from "./cache";

interface ImageTrackingContainer {
  image?: string;
  imageId?: string;
  created: number;
}

export function buildImageTrackingMap(
  containers: readonly ImageTrackingContainer[]
): Map<string, string[] | undefined> {
  const imageCandidates = new Map<string, Map<string, number>>();
  for (const container of containers) {
    if (!container.image) continue;

    let imageIds = imageCandidates.get(container.image);
    if (!imageIds) {
      imageIds = new Map<string, number>();
      imageCandidates.set(container.image, imageIds);
    }

    if (container.imageId) {
      const existingCreated = imageIds.get(container.imageId);
      if (existingCreated === undefined || container.created < existingCreated) {
        imageIds.set(container.imageId, container.created);
      }
    }
  }

  const imageMap = new Map<string, string[] | undefined>();
  for (const [image, imageIds] of imageCandidates) {
    if (imageIds.size === 0) {
      imageMap.set(image, undefined);
      continue;
    }
    const orderedImageIds = [...imageIds.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([imageId]) => imageId);
    imageMap.set(image, orderedImageIds);
  }
  return imageMap;
}

let pendingRefresh: Promise<void> | null = null;
let lastRefreshAttempt = 0;

export async function refreshImageUpdates(force = false, images?: string[]): Promise<void> {
  while (pendingRefresh) {
    if (!force) return pendingRefresh;
    await pendingRefresh;
  }
  lastRefreshAttempt = Date.now();
  const refresh = (async () => {
    const containers = await listContainers({ all: true });
    const tracked = buildImageTrackingMap(containers);
    const selected = images ? new Set(images.map(normalizeImageName)) : null;
    const imageMap = new Map([...tracked].filter(([image]) => !selected || selected.has(image)));
    // Wait for stale checks too, so the next refresh cannot reuse an older snapshot.
    await checkImageUpdates(imageMap, { force: true });
  })();
  pendingRefresh = refresh;
  try {
    await refresh;
  } finally {
    if (pendingRefresh === refresh) pendingRefresh = null;
  }
}

export function shouldRefreshUpdates(): boolean {
  if (Date.now() - lastRefreshAttempt < 30000) return false;
  const cached = getAllCachedUpdates();
  return cached.length === 0 || cached.some((entry) => Date.now() - entry.checkedAt > 5 * 60 * 1000);
}
