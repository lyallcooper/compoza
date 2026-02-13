import { NextRequest } from "next/server";
import { getAllCachedUpdates, getCacheStats, checkImageUpdates, clearCachedUpdates } from "@/lib/updates";
import { listContainers } from "@/lib/docker";
import { success, error, getErrorMessage, validateJsonContentType } from "@/lib/api";

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

// GET returns all cached update info
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("stats") === "true") {
      return success(getCacheStats());
    }

    // Server-triggered refresh: check all images, return results
    if (request.nextUrl.searchParams.has("refresh")) {
      const containers = await listContainers({ all: true });
      const imageMap = buildImageTrackingMap(containers);
      if (imageMap.size > 0) {
        await checkImageUpdates(imageMap);
      }
      return success(getAllCachedUpdates());
    }

    // Client poll: return cached data instantly
    return success(getAllCachedUpdates());
  } catch (err) {
    return error(getErrorMessage(err, "Failed to check updates"));
  }
}

// POST with specific images filters the cached results
export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const { images } = body;

    const cached = getAllCachedUpdates();

    // If specific images requested, filter to those
    if (images && Array.isArray(images)) {
      const imageSet = new Set(images);
      const filtered = cached.filter((c) => imageSet.has(c.image));
      return success(filtered);
    }

    return success(cached);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get updates"));
  }
}

// DELETE clears cache for specific images (or all)
// Does NOT wait for recheck - the next GET will trigger it
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { images } = body;

    // Clear cache for specified images (or all if none specified)
    if (images && Array.isArray(images) && images.length > 0) {
      clearCachedUpdates(images);
    } else {
      clearCachedUpdates();
    }

    return success({ message: "Cache cleared" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to clear cache"));
  }
}
