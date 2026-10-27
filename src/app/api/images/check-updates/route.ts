import { NextRequest } from "next/server";
import { getAllCachedUpdates, getCacheStats } from "@/lib/updates";
import { refreshImageUpdates, shouldRefreshUpdates } from "@/lib/updates/refresh";
import { log } from "@/lib/logger";
import { success, error, getErrorMessage, validateJsonContentType } from "@/lib/api";

export { buildImageTrackingMap } from "@/lib/updates/refresh";

// GET returns all cached update info
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("stats") === "true") {
      return success(getCacheStats());
    }

    // Server-triggered refresh: check all images, return results
    if (request.nextUrl.searchParams.has("refresh")) {
      await refreshImageUpdates();
      return success(getAllCachedUpdates());
    }

    if (shouldRefreshUpdates()) {
      void refreshImageUpdates().catch((err) => log.updates.error("Update refresh failed", err));
    }
    // Keep the last known results visible while checking containers.
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

// Recheck containers before replacing their last known update state.
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { images } = body;

    const selected = Array.isArray(images) && images.length > 0
      ? images.filter((image): image is string => typeof image === "string") : undefined;
    await refreshImageUpdates(true, selected);
    return success(getAllCachedUpdates());
  } catch (err) {
    return error(getErrorMessage(err, "Failed to clear cache"));
  }
}
