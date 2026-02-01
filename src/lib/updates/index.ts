import { getDocker, getImageDistribution } from "@/lib/docker";
import {
  getCachedUpdate,
  setCachedUpdate,
  shouldCheckImage,
  markCheckPending,
  markCheckComplete,
} from "./cache";

export { getAllCachedUpdates, getCacheStats, clearCachedUpdates } from "./cache";

interface ImageUpdateInfo {
  image: string;
  currentDigest?: string;
  latestDigest?: string;
  updateAvailable: boolean;
  status: "checked" | "unknown" | "error";
  fromCache?: boolean;
}

export async function checkImageUpdates(images: string[]): Promise<ImageUpdateInfo[]> {
  const results: ImageUpdateInfo[] = [];
  const imagesToCheck: string[] = [];

  // First, return cached results and identify what needs checking
  for (const imageName of images) {
    const cached = getCachedUpdate(imageName);
    if (cached) {
      results.push({
        image: cached.image,
        updateAvailable: cached.updateAvailable,
        status: cached.status,
        fromCache: true,
      });

      // Schedule background refresh if stale
      if (shouldCheckImage(imageName)) {
        imagesToCheck.push(imageName);
      }
    } else {
      imagesToCheck.push(imageName);
    }
  }

  // Check images that aren't cached (or need refresh)
  if (imagesToCheck.length > 0) {
    // For images without cache, check synchronously
    // For stale cache refreshes, check in background
    const uncachedImages = imagesToCheck.filter((img) => !getCachedUpdate(img));
    const staleImages = imagesToCheck.filter((img) => getCachedUpdate(img));

    // Check uncached images synchronously
    if (uncachedImages.length > 0) {
      const freshResults = await checkImagesDirectly(uncachedImages);
      results.push(...freshResults);
    }

    // Refresh stale images in background (don't await)
    if (staleImages.length > 0) {
      checkImagesDirectly(staleImages).catch((err) => {
        console.error("Background update check failed:", err);
      });
    }
  }

  return results;
}

async function checkImagesDirectly(images: string[]): Promise<ImageUpdateInfo[]> {
  const docker = getDocker();
  const results: ImageUpdateInfo[] = [];

  for (const imageName of images) {
    // Skip if already being checked
    if (!shouldCheckImage(imageName)) {
      const cached = getCachedUpdate(imageName);
      if (cached) {
        results.push({
          image: cached.image,
          updateAvailable: cached.updateAvailable,
          status: cached.status,
          fromCache: true,
        });
      }
      continue;
    }

    markCheckPending(imageName);

    try {
      let currentDigest: string | undefined;

      // Get local image info
      const localImages = await docker.listImages({
        filters: { reference: [imageName] },
      });

      const repoDigests = localImages[0]?.RepoDigests;
      if (localImages.length > 0 && repoDigests && repoDigests.length > 0) {
        const matchingDigest = repoDigests.find((d) =>
          d.startsWith(imageName.split(":")[0] + "@")
        );
        currentDigest = matchingDigest?.split("@")[1] || repoDigests[0]?.split("@")[1];
      }

      // Try inspecting directly if no digest from list
      if (!currentDigest && localImages.length > 0) {
        try {
          const image = docker.getImage(imageName);
          const inspection = await image.inspect();
          if (inspection.RepoDigests?.length > 0) {
            const matchingDigest = inspection.RepoDigests.find((d: string) =>
              d.startsWith(imageName.split(":")[0] + "@")
            );
            currentDigest = matchingDigest?.split("@")[1] || inspection.RepoDigests[0]?.split("@")[1];
          }
        } catch {
          // Image inspect failed - not critical, we'll continue without digest
        }
      }

      // Image not pulled locally - mark as unknown, not an error
      if (localImages.length === 0) {
        const result: ImageUpdateInfo = {
          image: imageName,
          updateAvailable: false,
          status: "unknown",
        };
        setCachedUpdate(imageName, result);
        results.push(result);
        continue;
      }

      // Check remote digest via distribution API
      try {
        const distribution = await getImageDistribution(imageName);
        const latestDigest = distribution.Descriptor?.digest;

        let result: ImageUpdateInfo;

        if (!latestDigest) {
          result = {
            image: imageName,
            currentDigest,
            updateAvailable: false,
            status: "unknown",
          };
        } else if (!currentDigest) {
          result = {
            image: imageName,
            latestDigest,
            updateAvailable: true,
            status: "unknown",
          };
        } else {
          result = {
            image: imageName,
            currentDigest,
            latestDigest,
            updateAvailable: latestDigest !== currentDigest,
            status: "checked",
          };
        }

        setCachedUpdate(imageName, result);
        results.push(result);
      } catch (error) {
        // Distribution API failures are common (private registries, local images, etc.)
        // Only log if it's not a typical 404/401/403 error
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode && ![401, 403, 404].includes(statusCode)) {
          console.warn(`[Update Check] Distribution API failed for ${imageName}:`, error);
        }
        const result: ImageUpdateInfo = {
          image: imageName,
          currentDigest,
          updateAvailable: false,
          status: "unknown",
        };
        setCachedUpdate(imageName, result);
        results.push(result);
      }
    } catch (error) {
      console.error(`[Update Check] Failed to check image ${imageName}:`, error);
      const result: ImageUpdateInfo = {
        image: imageName,
        updateAvailable: false,
        status: "error",
      };
      setCachedUpdate(imageName, result);
      results.push(result);
    } finally {
      markCheckComplete(imageName);
    }
  }

  return results;
}

export async function pullLatestImage(imageName: string): Promise<void> {
  const docker = getDocker();

  return new Promise((resolve, reject) => {
    docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) {
        reject(err);
        return;
      }

      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

export async function selfUpdate(): Promise<{ success: boolean; message: string }> {
  const docker = getDocker();
  const imageName = process.env.COMPOZA_IMAGE || "compoza:latest";

  try {
    await pullLatestImage(imageName);

    const containerId = process.env.HOSTNAME || "";

    if (!containerId) {
      return {
        success: false,
        message: "Could not determine current container ID",
      };
    }

    return {
      success: true,
      message: `Image ${imageName} pulled successfully. Container will be recreated.`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update",
    };
  }
}
