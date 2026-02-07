import type { ImageRef } from "./types";
import { parseImageRef, getRegistryType } from "./parse";
import { getRegistryCredentials, disableRegistryCredentials } from "./credentials";
import { isSemverLike } from "./version";
import { log } from "@/lib/logger";

export interface RegistryQueryResult {
  latestDigest?: string;
  updateAvailable: boolean;
  currentVersion?: string;
  latestVersion?: string;
  matchedTags?: string[];
}

/**
 * Try to resolve update status, versions, and matched tags via a single
 * registry-specific API call. Returns null if the registry is unsupported
 * or the API call fails (caller should fall back to Distribution API + OCI).
 */
export async function queryRegistry(
  imageName: string,
  currentDigest: string
): Promise<RegistryQueryResult | null> {
  const ref = parseImageRef(imageName);
  const registryType = getRegistryType(ref.registry);

  try {
    switch (registryType) {
      case "dockerhub":
        return await queryDockerHub(ref, currentDigest);
      case "ghcr":
      case "lscr":
        return await queryGhcr(ref, currentDigest);
      default:
        return null;
    }
  } catch (error) {
    log.registry.warn(`Registry query failed for ${imageName}`, { error: String(error) });
    return null;
  }
}

// --- Docker Hub ---

interface DockerHubTag {
  name: string;
  digest: string | null;
  images: Array<{
    architecture: string;
    os: string;
    digest: string;
  }>;
}

interface DockerHubTagsResponse {
  count: number;
  next: string | null;
  results: DockerHubTag[];
}

async function queryDockerHub(
  ref: ImageRef,
  currentDigest: string
): Promise<RegistryQueryResult | null> {
  const allTags = await fetchDockerHubTags(ref.namespace, ref.repository);
  if (allTags.length === 0) return null;

  return buildResult(allTags, ref.tag, currentDigest);
}

/**
 * Fetch tags from Docker Hub API (up to 2 pages = 200 tags).
 * No auth needed for public repos.
 */
async function fetchDockerHubTags(
  namespace: string,
  repository: string
): Promise<Array<{ name: string; digest: string }>> {
  const tags: Array<{ name: string; digest: string }> = [];
  let url: string | null =
    `https://hub.docker.com/v2/repositories/${namespace}/${repository}/tags?page_size=100&ordering=last_updated`;
  let page = 0;

  while (url && page < 2) {
    page++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 404) return [];
        return [];
      }

      const data: DockerHubTagsResponse = await response.json();

      for (const tag of data.results) {
        // Prefer manifest-list digest (top-level), fall back to platform-specific
        const digest = tag.digest || findPlatformDigest(tag.images);
        if (digest) {
          tags.push({ name: tag.name, digest });
        }
      }

      url = data.next;
    } finally {
      clearTimeout(timeout);
    }
  }

  return tags;
}

function findPlatformDigest(
  images: DockerHubTag["images"]
): string | null {
  if (!images || images.length === 0) return null;
  const amd64 = images.find(
    (img) => img.os === "linux" && img.architecture === "amd64"
  );
  if (amd64?.digest) return amd64.digest;
  const linux = images.find((img) => img.os === "linux");
  return linux?.digest || images[0]?.digest || null;
}

// --- GHCR / lscr.io ---

interface GhcrVersion {
  id: number;
  name: string; // digest
  metadata: {
    container: {
      tags: string[];
    };
  };
}

async function queryGhcr(
  ref: ImageRef,
  currentDigest: string
): Promise<RegistryQueryResult | null> {
  const creds = getRegistryCredentials(`ghcr.io/${ref.namespace}/${ref.repository}`);
  if (!creds) return null;

  const tags = await fetchGhcrTags(
    ref.namespace,
    ref.repository,
    creds.token,
    ref.tag,
    currentDigest
  );
  if (tags.length === 0) return null;

  return buildResult(tags, ref.tag, currentDigest);
}

/**
 * Fetch tag→digest pairs from the GitHub Packages API.
 * Paginates through versions (up to 10 pages), stopping early once we've
 * found both the tracked tag and the current digest.
 * Tries /orgs/ first, falls back to /users/ on 404.
 */
async function fetchGhcrTags(
  namespace: string,
  repository: string,
  token: string,
  trackedTag: string,
  currentDigest: string
): Promise<Array<{ name: string; digest: string }>> {
  const encodedRepo = encodeURIComponent(repository);
  const orgUrl = `https://api.github.com/orgs/${namespace}/packages/container/${encodedRepo}/versions?per_page=100`;
  const userUrl = `https://api.github.com/users/${namespace}/packages/container/${encodedRepo}/versions?per_page=100`;

  // Try org endpoint first
  let tags = await fetchGhcrTagPages(orgUrl, token, trackedTag, currentDigest);
  if (tags === null) {
    // 404 on org → try user endpoint
    tags = await fetchGhcrTagPages(userUrl, token, trackedTag, currentDigest);
  }

  return tags || [];
}

async function fetchGhcrTagPages(
  startUrl: string,
  token: string,
  trackedTag: string,
  currentDigest: string
): Promise<Array<{ name: string; digest: string }> | null> {
  const tags: Array<{ name: string; digest: string }> = [];
  let url: string | null = startUrl;
  let page = 0;
  let foundTrackedTag = false;
  let foundCurrentDigest = false;

  while (url && page < 10) {
    page++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: controller.signal,
      });

      if (response.status === 404) return null; // Not found → caller tries user endpoint
      if (response.status === 401) {
        disableRegistryCredentials("ghcr");
        return tags;
      }
      if (!response.ok) return tags; // Server error → stop with what we have

      const data: GhcrVersion[] = await response.json();

      for (const version of data) {
        if (version.metadata.container.tags.length === 0) continue;
        for (const tag of version.metadata.container.tags) {
          tags.push({ name: tag, digest: version.name });
          if (tag === trackedTag) foundTrackedTag = true;
        }
        if (version.name === currentDigest) foundCurrentDigest = true;
      }

      // Stop early once we've found everything we need
      if (foundTrackedTag && foundCurrentDigest) break;

      // Parse Link header for next page
      url = parseLinkNext(response.headers.get("link"));
    } finally {
      clearTimeout(timeout);
    }
  }

  return tags;
}

function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match?.[1] || null;
}

// --- Shared helpers ---

/**
 * Build a RegistryQueryResult from a flat list of tag→digest pairs.
 */
function buildResult(
  tags: Array<{ name: string; digest: string }>,
  currentTag: string,
  currentDigest: string
): RegistryQueryResult | null {
  // Find the latest digest: the digest that the tracked tag currently points to
  const latestEntry = tags.find((t) => t.name === currentTag);
  if (!latestEntry) return null; // Tag not found in results — let caller fall through
  const latestDigest = latestEntry.digest;

  // Tags matching the local digest (for currentVersion)
  const currentTags = tags
    .filter((t) => t.digest === currentDigest)
    .map((t) => t.name);

  // Tags matching the remote digest (for latestVersion + display)
  const latestTags = latestDigest
    ? tags.filter((t) => t.digest === latestDigest).map((t) => t.name)
    : [];

  const currentVersion = findBestSemver(currentTags);
  const latestVersion = findBestSemver(latestTags);

  // Show tags for the latest remote version of the tracked tag — this is what
  // the tracked tag currently resolves to on the registry. When the local image
  // is outdated, the old digest's tags will have been moved to the new one, so
  // matching against currentDigest would return nothing useful.
  const matchedTags = (latestTags.length > 0 ? latestTags : currentTags)
    .sort(compareTagSpecificity);

  return {
    latestDigest,
    updateAvailable: latestDigest ? latestDigest !== currentDigest : false,
    currentVersion: currentVersion || undefined,
    latestVersion: latestVersion || undefined,
    matchedTags: matchedTags.length > 0 ? matchedTags : undefined,
  };
}

/**
 * Pick the most specific semver tag from a list.
 * Prefers 1.2.3 over 1.2 over 1 (more segments = more specific).
 */
export function findBestSemver(tags: string[]): string | null {
  const semverTags = tags.filter(isSemverLike);
  if (semverTags.length === 0) return null;

  semverTags.sort(compareTagSpecificity);
  return semverTags[0];
}

/**
 * Compare tags by version specificity, most specific first.
 * Semver tags sort by segment count descending (v1.2.3 > v1.2 > v1).
 * Non-semver tags sort after semver tags alphabetically.
 */
function compareTagSpecificity(a: string, b: string): number {
  const aIsSemver = isSemverLike(a);
  const bIsSemver = isSemverLike(b);

  // Semver tags before non-semver
  if (aIsSemver && !bIsSemver) return -1;
  if (!aIsSemver && bIsSemver) return 1;
  if (!aIsSemver && !bIsSemver) return a.localeCompare(b);

  // Both semver: more segments = more specific = first
  const aParts = (a.startsWith("v") ? a.slice(1) : a).split(".").length;
  const bParts = (b.startsWith("v") ? b.slice(1) : b).split(".").length;
  return bParts - aParts;
}
