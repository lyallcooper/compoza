import { getDocker, getImageDistribution } from "@/lib/docker";
import {
  getCachedUpdate,
  setCachedUpdate,
  shouldCheckImage,
  markCheckPending,
  markCheckComplete,
  updateCachedVersions,
  markVersionResolutionFailed,
} from "./cache";
import { resolveVersions } from "@/lib/registries";

export interface ImageUpdateInfo {
  image: string;
  currentDigest?: string;
  latestDigest?: string;
  updateAvailable: boolean;
  status: "checked" | "unknown" | "error";
  fromCache?: boolean;
  currentVersion?: string;
  latestVersion?: string;
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
        currentDigest: cached.currentDigest,
        latestDigest: cached.latestDigest,
        updateAvailable: cached.updateAvailable,
        status: cached.status,
        fromCache: true,
        currentVersion: cached.currentVersion,
        latestVersion: cached.latestVersion,
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
          currentDigest: cached.currentDigest,
          latestDigest: cached.latestDigest,
          updateAvailable: cached.updateAvailable,
          status: cached.status,
          fromCache: true,
          currentVersion: cached.currentVersion,
          latestVersion: cached.latestVersion,
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

        // Trigger async version resolution when we have digests
        const willResolveVersions = currentDigest || latestDigest;

        setCachedUpdate(imageName, {
          ...result,
          versionStatus: willResolveVersions ? "pending" : undefined,
        });
        results.push(result);

        if (willResolveVersions) {
          triggerVersionResolution(imageName, currentDigest, latestDigest);
        }
      } catch (error) {
        // Distribution API failures are common (private registries, local images, rate limits, etc.)
        // Only log if it's not a typical expected error
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode && ![401, 403, 404, 429].includes(statusCode)) {
          console.warn(`[Update Check] Distribution API failed for ${imageName}:`, error);
        }
        const result: ImageUpdateInfo = {
          image: imageName,
          currentDigest,
          updateAvailable: false,
          status: "unknown",
        };
        // Cache rate-limited results longer to avoid hammering the API
        const ttl = statusCode === 429 ? 30 * 60 * 1000 : undefined; // 30 min for rate limits
        setCachedUpdate(imageName, result, ttl);
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

/**
 * Trigger async version resolution for an image.
 * Updates the cache when complete.
 */
function triggerVersionResolution(
  imageName: string,
  currentDigest?: string,
  latestDigest?: string
): void {
  resolveVersions(imageName, currentDigest, latestDigest)
    .then(({ currentVersion, latestVersion }) => {
      if (currentVersion || latestVersion) {
        updateCachedVersions(imageName, currentVersion, latestVersion);
      }
    })
    .catch(() => {
      markVersionResolutionFailed(imageName);
    });
}
