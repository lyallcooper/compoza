import type { RegistryClient, TagInfo } from "./types";
import { isSemverLike } from "./version";

interface OciTagListResponse {
  name: string;
  tags: string[];
}

interface TokenResponse {
  token: string;
}

// Cache tokens per registry/scope
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * OCI Distribution API client.
 * Works with GHCR, lscr.io, and other OCI-compliant registries.
 * Handles anonymous token authentication for public images.
 */
export class OciClient implements RegistryClient {
  constructor(private baseUrl: string) {}

  async listTags(namespace: string, repository: string): Promise<TagInfo[]> {
    const name = `${namespace}/${repository}`;

    try {
      // Get tag list (with auth retry)
      const listRes = await this.fetchWithAuth(`${this.baseUrl}/v2/${name}/tags/list`, name);

      if (!listRes.ok) {
        if (listRes.status === 404) {
          return [];
        }
        if (listRes.status === 401 || listRes.status === 403) {
          console.warn(`[OCI] Access denied for ${name}`);
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
   * Fetch with automatic anonymous token authentication.
   */
  private async fetchWithAuth(url: string, scope: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      // Try with cached token first
      const cachedToken = this.getCachedToken(scope);
      const headers: Record<string, string> = {
        "Accept": "application/json",
      };
      if (cachedToken) {
        headers["Authorization"] = `Bearer ${cachedToken}`;
      }

      const response = await fetch(url, { headers, signal: controller.signal });

      // If unauthorized, try to get a token
      if (response.status === 401) {
        const token = await this.getAnonymousToken(response, scope);
        if (token) {
          // Retry with token
          const retryController = new AbortController();
          const retryTimeout = setTimeout(() => retryController.abort(), 10000);
          try {
            return await fetch(url, {
              headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`,
              },
              signal: retryController.signal,
            });
          } finally {
            clearTimeout(retryTimeout);
          }
        }
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get an anonymous token from the registry's auth service.
   */
  private async getAnonymousToken(response: Response, scope: string): Promise<string | null> {
    const wwwAuth = response.headers.get("www-authenticate");
    if (!wwwAuth) {
      return null;
    }

    // Parse WWW-Authenticate header
    // Format: Bearer realm="https://...",service="...",scope="..."
    const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
    const serviceMatch = wwwAuth.match(/service="([^"]+)"/);
    const scopeMatch = wwwAuth.match(/scope="([^"]+)"/);

    if (!realmMatch) {
      return null;
    }

    const realm = realmMatch[1];
    const service = serviceMatch?.[1];
    const authScope = scopeMatch?.[1] || `repository:${scope}:pull`;

    try {
      const tokenUrl = new URL(realm);
      if (service) {
        tokenUrl.searchParams.set("service", service);
      }
      tokenUrl.searchParams.set("scope", authScope);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const tokenRes = await fetch(tokenUrl.toString(), {
          signal: controller.signal,
        });

        if (!tokenRes.ok) {
          return null;
        }

        const data: TokenResponse = await tokenRes.json();

        // Cache the token for 5 minutes
        tokenCache.set(scope, {
          token: data.token,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });

        return data.token;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      console.warn(`[OCI] Failed to get token:`, error);
      return null;
    }
  }

  /**
   * Get a cached token if still valid.
   */
  private getCachedToken(scope: string): string | null {
    const cached = tokenCache.get(scope);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }
    return null;
  }

  /**
   * Get the digest for a specific tag by fetching its manifest.
   */
  private async getManifestDigest(name: string, tag: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const cachedToken = this.getCachedToken(name);
      const headers: Record<string, string> = {
        "Accept": [
          "application/vnd.oci.image.index.v1+json",
          "application/vnd.docker.distribution.manifest.list.v2+json",
          "application/vnd.oci.image.manifest.v1+json",
          "application/vnd.docker.distribution.manifest.v2+json",
        ].join(", "),
      };
      if (cachedToken) {
        headers["Authorization"] = `Bearer ${cachedToken}`;
      }

      const response = await fetch(`${this.baseUrl}/v2/${name}/manifests/${tag}`, {
        method: "HEAD",
        headers,
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
