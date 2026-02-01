import { NextRequest, NextResponse } from "next/server";
import { getAllCachedUpdates, getCacheStats, checkImageUpdates } from "@/lib/updates";
import { scanProjects } from "@/lib/projects";
import { validateJsonContentType } from "@/lib/api/validation";

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
    } catch (error) {
      console.error("[Update Check] Initial check failed:", error);
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
      return NextResponse.json({ data: getCacheStats() });
    }

    // Trigger initial check if cache is empty
    const cached = getAllCachedUpdates();
    if (cached.length === 0 && !initialCheckDone) {
      await ensureInitialCheck();
      return NextResponse.json({ data: getAllCachedUpdates() });
    }

    return NextResponse.json({ data: cached });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get updates" },
      { status: 500 }
    );
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
      return NextResponse.json({ data: filtered });
    }

    return NextResponse.json({ data: cached });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get updates" },
      { status: 500 }
    );
  }
}
