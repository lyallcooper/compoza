import type { TagInfo, VersionInfo, RegistryClient } from "./types";
import { parseImageRef, getRegistryType } from "./parse";
import { DockerHubClient } from "./docker-hub";
import { OciClient } from "./oci";

// Semver-like pattern: starts with digit or 'v' followed by digit
const SEMVER_PATTERN = /^v?\d+(\.\d+)*(-[\w.]+)?(\+[\w.]+)?$/;

/**
 * Check if a tag looks like a semantic version.
 */
export function isSemverLike(tag: string): boolean {
  return SEMVER_PATTERN.test(tag);
}

// Cache for tag lists to avoid repeated API calls
const tagCache = new Map<string, { tags: TagInfo[]; fetchedAt: number }>();
const TAG_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Resolve semantic versions for an image's current and latest digests.
 *
 * This queries the registry to find which semantic version tags
 * point to the given digests.
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
    // For pinned semver tags, current and latest are the same tag
    // The digest comparison already told us if there's an update
    return {
      currentDigest,
      latestDigest,
      currentVersion: ref.tag,
      latestVersion: ref.tag,
    };
  }

  // Skip unsupported registries
  if (registryType === "unknown") {
    return { currentDigest, latestDigest };
  }

  try {
    const tags = await getTagsWithCache(ref.registry, ref.namespace, ref.repository, registryType);

    // Find semver tags matching each digest
    const currentVersion = findVersionForDigest(tags, currentDigest);
    const latestVersion = findVersionForDigest(tags, latestDigest);

    return {
      currentDigest,
      latestDigest,
      currentVersion,
      latestVersion,
    };
  } catch (error) {
    console.warn(`[Version Resolution] Failed for ${image}:`, error);
    return { currentDigest, latestDigest };
  }
}

/**
 * Get tags for a repository, using cache when available.
 */
async function getTagsWithCache(
  registry: string,
  namespace: string,
  repository: string,
  registryType: "dockerhub" | "ghcr" | "lscr"
): Promise<TagInfo[]> {
  const cacheKey = `${registry}/${namespace}/${repository}`;
  const cached = tagCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < TAG_CACHE_TTL) {
    return cached.tags;
  }

  const client = createClient(registryType, registry);
  const tags = await client.listTags(namespace, repository);

  tagCache.set(cacheKey, { tags, fetchedAt: Date.now() });

  return tags;
}

/**
 * Create a registry client based on the registry type.
 */
function createClient(type: "dockerhub" | "ghcr" | "lscr", registry: string): RegistryClient {
  if (type === "dockerhub") {
    return new DockerHubClient();
  }
  // GHCR and lscr.io use the OCI Distribution API
  return new OciClient(`https://${registry}`);
}

/**
 * Find the most specific semver tag that points to a given digest.
 */
function findVersionForDigest(tags: TagInfo[], digest?: string): string | undefined {
  if (!digest) return undefined;

  // Find all semver tags pointing to this digest
  const matching = tags.filter(
    (t) => t.digest === digest && isSemverLike(t.name)
  );

  if (matching.length === 0) return undefined;

  // Sort by specificity (more segments = more specific) and value
  // e.g., prefer "1.25.3" over "1.25" over "1"
  matching.sort((a, b) => {
    const aSpecificity = countVersionSegments(a.name);
    const bSpecificity = countVersionSegments(b.name);

    if (aSpecificity !== bSpecificity) {
      return bSpecificity - aSpecificity; // More specific first
    }

    // Same specificity: compare actual version numbers
    return compareVersions(b.name, a.name);
  });

  return matching[0].name;
}

/**
 * Count the number of segments in a version string.
 */
function countVersionSegments(version: string): number {
  const v = version.startsWith("v") ? version.slice(1) : version;
  return v.split(/[.-]/).filter((s) => /^\d+$/.test(s)).length;
}

/**
 * Compare two version strings.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareVersions(a: string, b: string): number {
  const aParts = parseVersionParts(a);
  const bParts = parseVersionParts(b);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aNum = aParts[i] ?? 0;
    const bNum = bParts[i] ?? 0;
    if (aNum !== bNum) {
      return aNum - bNum;
    }
  }

  return 0;
}

/**
 * Parse a version string into numeric parts.
 */
function parseVersionParts(version: string): number[] {
  const v = version.startsWith("v") ? version.slice(1) : version;
  return v
    .split(/[.-]/)
    .map((part) => parseInt(part, 10))
    .filter((n) => !isNaN(n));
}

/**
 * Clear the tag cache (useful after updates).
 */
export function clearTagCache(): void {
  tagCache.clear();
}
