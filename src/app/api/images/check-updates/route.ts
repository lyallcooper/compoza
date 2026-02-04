import { NextRequest } from "next/server";
import { getAllCachedUpdates, getCacheStats, checkImageUpdates, clearCachedUpdates } from "@/lib/updates";
import { scanProjects } from "@/lib/projects";
import { success, error, getErrorMessage, validateJsonContentType } from "@/lib/api";

// Track if we've done an initial check in this process
let initialCheckDone = false;
let initialCheckPromise: Promise<void> | null = null;

async function ensureInitialCheck() {
  if (initialCheckDone) return;
  if (initialCheckPromise) return initialCheckPromise;

  initialCheckPromise = (async () => {
    try {
      console.log("[Update Check] Triggering initial check from API...");
      const projects = await scanProjects();
      const images = new Set<string>();

      for (const project of projects) {
        for (const service of project.services) {
          if (service.image) {
            images.add(service.image);
          }
        }
      }

      if (images.size > 0) {
        await checkImageUpdates(Array.from(images));
      }
      initialCheckDone = true;
      console.log("[Update Check] Initial check complete.");
    } catch (err) {
      console.error("[Update Check] Initial check failed:", err);
      initialCheckPromise = null; // Allow retry on failure
    }
  })();

  return initialCheckPromise;
}

// GET returns all cached update info (triggers check if cache is empty)
export async function GET(request: NextRequest) {
  try {
    // Debug: return cache stats if requested
    if (request.nextUrl.searchParams.get("stats") === "true") {
      return success(getCacheStats());
    }

    // Trigger check if cache is empty (entries expire after 1 hour)
    const cached = getAllCachedUpdates();

    if (cached.length === 0) {
      // Reset flag so ensureInitialCheck actually runs
      initialCheckDone = false;
      initialCheckPromise = null;
      await ensureInitialCheck();
      return success(getAllCachedUpdates());
    }

    return success(cached);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get updates"));
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
      // Reset flags so next GET triggers fresh check
      initialCheckDone = false;
      initialCheckPromise = null;
    }

    return success({ message: "Cache cleared" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to clear cache"));
  }
}
