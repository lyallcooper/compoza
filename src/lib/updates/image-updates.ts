import { getDocker, getImageDistribution } from "@/lib/docker";
import { log } from "@/lib/logger";
import {
  getCachedUpdate,
  setCachedUpdate,
  shouldCheckImage,
  markCheckPending,
  markCheckComplete,
  updateCachedVersions,
  markVersionResolutionFailed,
} from "./cache";
import { parseImageRef, getRegistryType, resolveVersions, queryRegistry, OciClient, getOciRegistryUrl } from "@/lib/registries";
import { extractSourceUrl, normalizeImageName } from "@/lib/format";

export interface ImageUpdateInfo {
  image: string;
  currentDigest?: string;
  latestDigest?: string;
  outdatedImageIds?: string[];
  checkedImageIds?: string[];
  updateAvailable: boolean;
  status: "checked" | "unknown" | "error";
  fromCache?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  matchedTags?: string[];
  sourceUrl?: string;
}

type ImageTrackingState = string[] | undefined;

export async function checkImageUpdates(
  images: Map<string, ImageTrackingState>,
  options: { force?: boolean } = {}
): Promise<ImageUpdateInfo[]> {
  if (options.force) return checkImagesDirectly([...images], true);
  const results: ImageUpdateInfo[] = [];
  const imagesToCheck: [string, ImageTrackingState][] = [];

  // First, return cached results and identify what needs checking
  for (const [rawName, containerImageIds] of images) {
    const imageName = normalizeImageName(rawName);
    const cached = getCachedUpdate(imageName);
    if (cached) {
      results.push({
        image: cached.image,
        currentDigest: cached.currentDigest,
        latestDigest: cached.latestDigest,
        outdatedImageIds: cached.outdatedImageIds,
        checkedImageIds: cached.checkedImageIds,
        updateAvailable: cached.updateAvailable,
        status: cached.status,
        fromCache: true,
        currentVersion: cached.currentVersion,
        latestVersion: cached.latestVersion,
        matchedTags: cached.matchedTags,
        sourceUrl: cached.sourceUrl,
      });

      // Schedule background refresh if stale
      if (shouldCheckImage(imageName)) {
        imagesToCheck.push([imageName, containerImageIds]);
      }
    } else {
      imagesToCheck.push([imageName, containerImageIds]);
    }
  }

  // Check images that aren't cached (or need refresh)
  if (imagesToCheck.length > 0) {
    // For images without cache, check synchronously
    // For stale cache refreshes, check in background
    const uncachedImages = imagesToCheck.filter(([img]) => !getCachedUpdate(img));
    const staleImages = imagesToCheck.filter(([img]) => getCachedUpdate(img));

    // Check uncached images synchronously
    if (uncachedImages.length > 0) {
      const freshResults = await checkImagesDirectly(uncachedImages);
      results.push(...freshResults);
    }

    // Refresh stale images in background (don't await)
    if (staleImages.length > 0) {
      checkImagesDirectly(staleImages).catch((err) => {
        log.updates.error(`Background update check failed for ${staleImages.length} images`, err, { images: staleImages.slice(0, 3).map(([img]) => img) });
      });
    }
  }

  return results;
}

async function checkImagesDirectly(images: [string, ImageTrackingState][], force = false): Promise<ImageUpdateInfo[]> {
  const docker = getDocker();

  const settled = await Promise.allSettled(
    images.map(([imageName, containerImageIds]) =>
      checkImageSerially(docker, imageName, containerImageIds, force)
    )
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<ImageUpdateInfo> => r.status === "fulfilled")
    .map((r) => r.value);
}

// Serialize checks so a pre-update inspection cannot overwrite a newer result.
const inFlightChecks = new Map<string, Promise<ImageUpdateInfo>>();

async function checkImageSerially(
  docker: ReturnType<typeof getDocker>,
  imageName: string,
  imageIds: string[] | undefined,
  force: boolean
): Promise<ImageUpdateInfo> {
  while (inFlightChecks.has(imageName)) {
    const pending = inFlightChecks.get(imageName)!;
    if (!force) return pending;
    await pending;
  }
  const check = checkSingleImage(docker, imageName, imageIds, force);
  inFlightChecks.set(imageName, check);
  try {
    return await check;
  } finally {
    if (inFlightChecks.get(imageName) === check) inFlightChecks.delete(imageName);
  }
}

function extractDigestForRepo(repoDigests: string[] | undefined, repoBase: string): string | undefined {
  if (!repoDigests?.length) return undefined;
  const matchingDigest = repoDigests.find((d) => d.startsWith(repoBase + "@"));
  return matchingDigest?.split("@")[1] || repoDigests[0]?.split("@")[1];
}

async function checkSingleImage(
  docker: ReturnType<typeof getDocker>,
  rawImageName: string,
  containerImageIds?: string[],
  force = false
): Promise<ImageUpdateInfo> {
  const imageName = normalizeImageName(rawImageName);

  // Digest-pinned refs (e.g. repo:tag@sha256:...) are intentionally locked
  // to a specific version — skip update checking entirely
  const ref = parseImageRef(imageName);
  if (ref.digest) {
    const result: ImageUpdateInfo = {
      image: imageName,
      currentDigest: ref.digest,
      updateAvailable: false,
      status: "checked",
    };
    setCachedUpdate(imageName, result);
    return result;
  }

  // Skip if already being checked
  if (!force && !shouldCheckImage(imageName)) {
    const cached = getCachedUpdate(imageName);
    if (cached) {
      return {
        image: cached.image,
        currentDigest: cached.currentDigest,
        latestDigest: cached.latestDigest,
        outdatedImageIds: cached.outdatedImageIds,
        checkedImageIds: cached.checkedImageIds,
        updateAvailable: cached.updateAvailable,
        status: cached.status,
        fromCache: true,
        currentVersion: cached.currentVersion,
        latestVersion: cached.latestVersion,
        sourceUrl: cached.sourceUrl,
      };
    }
  }

  const previous = getCachedUpdate(imageName);
  markCheckPending(imageName);

  try {
    let currentDigest: string | undefined;
    const currentDigests = new Set<string>();
    let unresolvedImage = false;
    const imageDigests = new Map<string, string | undefined>();
    let sourceUrl: string | undefined;
    const repoBase = imageName.slice(0, imageName.lastIndexOf(":") > imageName.lastIndexOf("/") ? imageName.lastIndexOf(":") : undefined);

    // Primary: inspect the images containers are actually running.
    const trackedImageIds = containerImageIds?.length
      ? [...new Set(containerImageIds)]
      : [];
    for (const containerImageId of trackedImageIds) {
      try {
        const inspection = await docker.getImage(containerImageId).inspect();
        const digest = extractDigestForRepo(inspection.RepoDigests, repoBase);
        if (digest) {
          currentDigests.add(digest);
          if (!currentDigest) {
            currentDigest = digest;
          }
        }
        imageDigests.set(containerImageId, digest);
        if (!digest) unresolvedImage = true;
        sourceUrl = sourceUrl || extractSourceUrl(inspection.Config?.Labels, imageName);
      } catch {
        imageDigests.set(containerImageId, undefined);
        unresolvedImage = true;
      }
    }

    // A downloaded tag cannot prove that an existing container was recreated.
    if (currentDigests.size === 0 && trackedImageIds.length === 0) {
      const localImages = await docker.listImages({
        filters: { reference: [imageName] },
      });

      sourceUrl = sourceUrl || extractSourceUrl(localImages[0]?.Labels, imageName);

      if (localImages.length > 0) {
        const digest = extractDigestForRepo(localImages[0]?.RepoDigests, repoBase);
        if (digest) {
          currentDigest = digest;
          currentDigests.add(digest);
        }
      }

      // Try inspecting directly if no digest from list
      if (!currentDigest && localImages.length > 0) {
        try {
          const image = docker.getImage(imageName);
          const inspection = await image.inspect();
          const digest = extractDigestForRepo(inspection.RepoDigests, repoBase);
          if (digest) {
            currentDigest = digest;
            currentDigests.add(digest);
          }
        } catch {
          // Image inspect failed - not critical, we'll continue without digest
        }
      }
    }

    // Try consolidated registry query first (1-2 API calls vs ~58)
    if (currentDigest) {
      const registryType = getRegistryType(ref.registry);
      if (registryType !== "unknown") {
        const registryResult = await queryRegistry(imageName, currentDigest);
        if (registryResult) {
          const result: ImageUpdateInfo = {
            image: imageName,
            currentDigest,
            latestDigest: registryResult.latestDigest ?? previous?.latestDigest,
            checkedImageIds: [...imageDigests].filter(([, digest]) => digest !== undefined).map(([id]) => id),
            outdatedImageIds: registryResult.latestDigest ? [...imageDigests].filter(([, digest]) => digest !== registryResult.latestDigest).map(([id]) => id) : undefined,
            updateAvailable: registryResult.latestDigest
              ? unresolvedImage || [...currentDigests].some((digest) => digest !== registryResult.latestDigest)
              : previous?.updateAvailable || registryResult.updateAvailable,
            status: registryResult.latestDigest ? "checked" : "unknown",
            currentVersion: registryResult.currentVersion,
            latestVersion: registryResult.latestVersion,
            matchedTags: registryResult.matchedTags,
            sourceUrl,
          };
          setCachedUpdate(imageName, {
            ...result,
            versionStatus: "resolved",
          });
          return result;
        }
      }
    }

    // Check remote digest via distribution API, then OCI fallback
    const { digest: latestDigest, cacheTtl } = await getLatestDigest(imageName, ref);

    let result: ImageUpdateInfo;

    if (!latestDigest) {
      result = {
        ...previous,
        image: imageName,
        currentDigest,
        updateAvailable: previous?.updateAvailable ?? false,
        status: "unknown",
        sourceUrl,
      };
    } else if (currentDigests.size === 0) {
      result = {
        image: imageName,
        latestDigest,
        updateAvailable: true,
        status: "unknown",
        sourceUrl,
      };
    } else {
      result = {
        image: imageName,
        currentDigest,
        latestDigest,
        checkedImageIds: [...imageDigests].filter(([, digest]) => digest !== undefined).map(([id]) => id),
        outdatedImageIds: [...imageDigests].filter(([, digest]) => digest !== latestDigest).map(([id]) => id),
        updateAvailable: unresolvedImage || [...currentDigests].some((digest) => digest !== latestDigest),
        status: "checked",
        sourceUrl,
      };
    }

    // Trigger async version resolution when we have digests
    const willResolveVersions = currentDigest || latestDigest;

    setCachedUpdate(imageName, {
      ...result,
      versionStatus: willResolveVersions ? "pending" : undefined,
    }, cacheTtl);

    if (willResolveVersions) {
      triggerVersionResolution(imageName, currentDigest, latestDigest);
    }

    return result;
  } catch (error) {
    log.updates.error(`Failed to check image ${imageName}`, error);
    const result: ImageUpdateInfo = {
      ...previous,
      image: imageName,
      updateAvailable: previous?.updateAvailable ?? false,
      status: "error",
    };
    setCachedUpdate(imageName, result);
    return result;
  } finally {
    markCheckComplete(imageName);
  }
}

interface LatestDigestResult {
  digest?: string;
  /** Override cache TTL (e.g. longer backoff for rate limits) */
  cacheTtl?: number;
}

/**
 * Get the latest remote digest for an image tag.
 * Tries Docker Engine distribution API first, falls back to OCI registry.
 */
async function getLatestDigest(
  imageName: string,
  ref: { registry: string; namespace: string; repository: string; tag: string }
): Promise<LatestDigestResult> {
  let rateLimited = false;

  // Try Docker Engine distribution API (works when Engine can auth to the registry)
  try {
    const distribution = await getImageDistribution(imageName);
    if (distribution.Descriptor?.digest) {
      return { digest: distribution.Descriptor.digest };
    }
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 429) {
      rateLimited = true;
    } else if (statusCode && ![401, 403, 404].includes(statusCode)) {
      log.updates.warn(`Distribution API failed for ${imageName}`, { statusCode });
    }
    // Try OCI directly regardless
  }

  // Fallback: query the OCI registry directly
  const registryType = getRegistryType(ref.registry);
  const ociUrl = getOciRegistryUrl(registryType, ref.registry);
  if (!ociUrl) {
    return rateLimited ? { cacheTtl: 30 * 60 * 1000 } : {};
  }

  try {
    const client = new OciClient(ociUrl);
    const digest = (await client.getDigestForTag(ref.namespace, ref.repository, ref.tag)) ?? undefined;
    return { digest };
  } catch {
    return rateLimited ? { cacheTtl: 30 * 60 * 1000 } : {};
  }
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
