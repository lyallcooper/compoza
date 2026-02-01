import type { VersionInfo } from "./types";
import { parseImageRef, getRegistryType } from "./parse";
import { OciClient } from "./oci";

// Semver-like pattern: starts with digit or 'v' followed by digit
const SEMVER_PATTERN = /^v?\d+(\.\d+)*(-[\w.]+)?(\+[\w.]+)?$/;

/**
 * Check if a tag looks like a semantic version.
 */
export function isSemverLike(tag: string): boolean {
  return SEMVER_PATTERN.test(tag);
}

/**
 * Resolve semantic versions for an image's current and latest digests.
 *
 * Uses manifest labels (org.opencontainers.image.version) for efficient lookup.
 * This requires only 2-3 API calls per digest instead of listing all tags.
 */
export async function resolveVersions(
  image: string,
  currentDigest?: string,
  latestDigest?: string
): Promise<VersionInfo> {
  const ref = parseImageRef(image);
  const registryType = getRegistryType(ref.registry);

  // If tag is already a semver, use it directly
  if (isSemverLike(ref.tag)) {
    return {
      currentDigest,
      latestDigest,
      currentVersion: ref.tag,
      latestVersion: ref.tag,
    };
  }

  // Get the OCI registry URL for the registry type
  const ociRegistryUrl = getOciRegistryUrl(registryType, ref.registry);
  if (!ociRegistryUrl) {
    return { currentDigest, latestDigest };
  }

  try {
    const client = new OciClient(ociRegistryUrl);

    // Fetch versions from manifest labels in parallel
    const [currentVersion, latestVersion] = await Promise.all([
      currentDigest
        ? client.getVersionFromDigest(ref.namespace, ref.repository, currentDigest)
        : null,
      latestDigest
        ? client.getVersionFromDigest(ref.namespace, ref.repository, latestDigest)
        : null,
    ]);

    return {
      currentDigest,
      latestDigest,
      currentVersion: currentVersion || undefined,
      latestVersion: latestVersion || undefined,
    };
  } catch {
    return { currentDigest, latestDigest };
  }
}

/**
 * Get the OCI Distribution API URL for a registry type.
 */
function getOciRegistryUrl(
  registryType: ReturnType<typeof getRegistryType>,
  registry: string
): string | null {
  switch (registryType) {
    case "dockerhub":
      // Docker Hub's OCI API is at registry-1.docker.io
      return "https://registry-1.docker.io";
    case "ghcr":
    case "lscr":
      return `https://${registry}`;
    default:
      return null;
  }
}

