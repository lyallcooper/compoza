import { NextRequest } from "next/server";
import { getDocker } from "@/lib/docker";
import { success, error, badRequest, notFound } from "@/lib/api";
import { normalizeImageName } from "@/lib/format";

export async function GET(request: NextRequest) {
  // Only allow in development mode
  if (process.env.NODE_ENV === "production") {
    return notFound("Not found");
  }

  const rawImageName = request.nextUrl.searchParams.get("image");

  if (!rawImageName) {
    return badRequest("image parameter required");
  }

  const imageName = normalizeImageName(rawImageName);
  const docker = getDocker();
  const debug: Record<string, unknown> = { imageName };

  try {
    // Step 1: List local images
    const localImages = await docker.listImages({
      filters: { reference: [imageName] },
    });
    debug.localImagesCount = localImages.length;

    if (localImages.length > 0) {
      debug.localImage = {
        id: localImages[0].Id,
        repoTags: localImages[0].RepoTags,
        repoDigests: localImages[0].RepoDigests,
      };
      debug.currentDigest = localImages[0].RepoDigests?.[0]?.split("@")[1];
    }

    // Step 2: Try distribution API
    try {
      const image = docker.getImage(imageName);
      debug.imageObject = "created";

      // Check if distribution method exists
      const imageAny = image as unknown as Record<string, unknown>;
      debug.hasDistributionMethod = typeof imageAny.distribution === "function";

      if (typeof imageAny.distribution === "function") {
        const distribution = await (imageAny.distribution as () => Promise<unknown>)();
        debug.distributionResult = distribution;
      }
    } catch (distError) {
      debug.distributionError = distError instanceof Error ? distError.message : String(distError);
    }

    return success(debug);
  } catch (err) {
    debug.error = err instanceof Error ? err.message : String(err);
    return error(JSON.stringify(debug), 500);
  }
}
