import type { RegistryClient, TagInfo } from "./types";
import { isSemverLike } from "./version";

interface OciTagListResponse {
  name: string;
  tags: string[];
}

/**
 * OCI Distribution API client.
 * Works with GHCR, lscr.io, and other OCI-compliant registries.
 */
export class OciClient implements RegistryClient {
  constructor(private baseUrl: string) {}

  async listTags(namespace: string, repository: string): Promise<TagInfo[]> {
    const name = `${namespace}/${repository}`;

    try {
      // Get tag list
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const listRes = await fetch(`${this.baseUrl}/v2/${name}/tags/list`, {
        headers: {
          "Accept": "application/json",
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!listRes.ok) {
        if (listRes.status === 404) {
          return [];
        }
        // Try to get auth challenge for better error message
        if (listRes.status === 401) {
          console.warn(`[OCI] Authentication required for ${name}`);
          return [];
        }
        throw new Error(`OCI API error: ${listRes.status}`);
      }

      const data: OciTagListResponse = await listRes.json();

      if (!data.tags || data.tags.length === 0) {
        return [];
      }

      // Filter to semver-like tags to reduce API calls
      const semverTags = data.tags.filter(isSemverLike);

      // Sort by version (descending) and limit
      const sortedTags = semverTags
        .sort((a, b) => compareTags(b, a))
        .slice(0, 50);

      // Fetch digest for each tag
      const tagInfos: TagInfo[] = [];

      for (const tag of sortedTags) {
        try {
          const digest = await this.getManifestDigest(name, tag);
          if (digest) {
            tagInfos.push({ name: tag, digest });
          }
        } catch {
          // Skip tags we can't fetch
        }
      }

      return tagInfos;
    } catch (error) {
      console.warn(`[OCI] Failed to list tags for ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get the digest for a specific tag by fetching its manifest.
   */
  private async getManifestDigest(name: string, tag: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout per manifest

    try {
      const response = await fetch(`${this.baseUrl}/v2/${name}/manifests/${tag}`, {
        method: "HEAD",
        headers: {
          // Request manifest list or image index
          "Accept": [
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.v2+json",
          ].join(", "),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      return response.headers.get("docker-content-digest");
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Compare two version tags for sorting.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareTags(a: string, b: string): number {
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);

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
function parseVersion(tag: string): number[] {
  // Remove 'v' prefix if present
  const version = tag.startsWith("v") ? tag.slice(1) : tag;

  // Split on dots and dashes, take numeric parts
  return version
    .split(/[.-]/)
    .map((part) => parseInt(part, 10))
    .filter((n) => !isNaN(n));
}
