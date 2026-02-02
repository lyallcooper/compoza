import type { RegistryClient, TagInfo } from "./types";
import { isSemverLike } from "./version";

interface OciTagListResponse {
  name: string;
  tags: string[];
}

interface TokenResponse {
  token: string;
}

interface OciManifest {
  schemaVersion: number;
  mediaType?: string;
  config?: {
    mediaType: string;
    digest: string;
    size: number;
  };
  manifests?: Array<{
    mediaType: string;
    digest: string;
    size: number;
    platform?: {
      architecture: string;
      os: string;
    };
    annotations?: Record<string, string>;
  }>;
  annotations?: Record<string, string>;
}

interface OciImageConfig {
  config?: {
    Labels?: Record<string, string>;
  };
}

// Cache tokens per registry/scope
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Get registry credentials from environment variables.
 */
function getRegistryCredentials(registry: string): { username: string; token: string } | null {
  // Docker Hub: DOCKERHUB_USERNAME + DOCKERHUB_TOKEN
  if (registry.includes("docker")) {
    const username = process.env.DOCKERHUB_USERNAME;
    const token = process.env.DOCKERHUB_TOKEN;
    if (username && token) {
      return { username, token };
    }
  }

  // GHCR: GHCR_TOKEN (username can be anything for token auth)
  if (registry.includes("ghcr.io")) {
    const token = process.env.GHCR_TOKEN;
    if (token) {
      return { username: "token", token };
    }
  }

  return null;
}

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
      // Get all tags with pagination
      const allTags = await this.fetchAllTags(name);

      if (allTags.length === 0) {
        return [];
      }

      // Filter to semver-like tags to reduce API calls
      const semverTags = allTags.filter(isSemverLike);

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
   * Fetch all tags with pagination support.
   */
  private async fetchAllTags(name: string): Promise<string[]> {
    const allTags: string[] = [];
    let url: string | null = `${this.baseUrl}/v2/${name}/tags/list?n=1000`;
    let pageCount = 0;
    const maxPages = 10; // Safety limit

    while (url && pageCount < maxPages) {
      pageCount++;
      const response = await this.fetchWithAuth(url, name);

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        if (response.status === 401 || response.status === 403) {
          console.warn(`[OCI] Access denied for ${name}`);
          return [];
        }
        throw new Error(`OCI API error: ${response.status}`);
      }

      const data: OciTagListResponse = await response.json();

      if (data.tags && data.tags.length > 0) {
        allTags.push(...data.tags);
      }

      // Check for pagination via Link header
      url = this.getNextPageUrl(response);
    }

    return allTags;
  }

  /**
   * Parse the Link header to get the next page URL.
   * Format: <url>; rel="next"
   */
  private getNextPageUrl(response: Response): string | null {
    const linkHeader = response.headers.get("link");
    if (!linkHeader) return null;

    // Parse Link header: <url>; rel="next"
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (!match) return null;

    const nextUrl = match[1];

    // Handle relative URLs
    if (nextUrl.startsWith("/")) {
      return `${this.baseUrl}${nextUrl}`;
    }

    return nextUrl;
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
        // Use credentials if available (increases rate limits)
        const headers: Record<string, string> = {};
        const creds = getRegistryCredentials(realm);
        if (creds) {
          headers["Authorization"] = `Basic ${Buffer.from(`${creds.username}:${creds.token}`).toString("base64")}`;
        }

        const tokenRes = await fetch(tokenUrl.toString(), {
          headers,
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
    const url = `${this.baseUrl}/v2/${name}/manifests/${tag}`;
    const acceptHeader = [
      "application/vnd.oci.image.index.v1+json",
      "application/vnd.docker.distribution.manifest.list.v2+json",
      "application/vnd.oci.image.manifest.v1+json",
      "application/vnd.docker.distribution.manifest.v2+json",
    ].join(", ");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const cachedToken = this.getCachedToken(name);
      const headers: Record<string, string> = { "Accept": acceptHeader };
      if (cachedToken) {
        headers["Authorization"] = `Bearer ${cachedToken}`;
      }

      let response = await fetch(url, {
        method: "HEAD",
        headers,
        signal: controller.signal,
      });

      // If unauthorized, try to get a token and retry
      if (response.status === 401) {
        const token = await this.getAnonymousToken(response, name);
        if (token) {
          const retryController = new AbortController();
          const retryTimeout = setTimeout(() => retryController.abort(), 5000);
          try {
            response = await fetch(url, {
              method: "HEAD",
              headers: {
                "Accept": acceptHeader,
                "Authorization": `Bearer ${token}`,
              },
              signal: retryController.signal,
            });
          } finally {
            clearTimeout(retryTimeout);
          }
        }
      }

      if (!response.ok) {
        return null;
      }

      return response.headers.get("docker-content-digest");
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get version from manifest labels/annotations by digest.
   * This is more efficient than listing all tags when we just need the version.
   */
  async getVersionFromDigest(namespace: string, repository: string, digest: string): Promise<string | null> {
    const name = `${namespace}/${repository}`;

    try {
      // Fetch the manifest by digest
      const manifest = await this.fetchManifest(name, digest);
      if (!manifest) return null;

      // Check for version in manifest annotations (OCI image index)
      const version = this.extractVersionFromAnnotations(manifest.annotations);
      if (version) {
        return version;
      }

      // For manifest lists/indexes, check the first manifest's annotations
      if (manifest.manifests && manifest.manifests.length > 0) {
        for (const m of manifest.manifests) {
          const v = this.extractVersionFromAnnotations(m.annotations);
          if (v) {
            return v;
          }
        }

        // Try fetching the config from a platform-specific manifest
        const linuxAmd64 = manifest.manifests.find(
          m => m.platform?.os === "linux" && m.platform?.architecture === "amd64"
        ) || manifest.manifests[0];

        if (linuxAmd64) {
          const platformManifest = await this.fetchManifest(name, linuxAmd64.digest);
          if (platformManifest?.config) {
            const configVersion = await this.getVersionFromConfig(name, platformManifest.config.digest);
            if (configVersion) return configVersion;
          }
        }
      }

      // For single-platform manifests, fetch the config blob
      if (manifest.config) {
        const configVersion = await this.getVersionFromConfig(name, manifest.config.digest);
        if (configVersion) return configVersion;
      }

      return null;
    } catch (error) {
      console.warn(`[OCI] Failed to get version from digest:`, error);
      return null;
    }
  }

  /**
   * Fetch a manifest by tag or digest.
   */
  private async fetchManifest(name: string, reference: string): Promise<OciManifest | null> {
    const url = `${this.baseUrl}/v2/${name}/manifests/${reference}`;
    const acceptHeader = [
      "application/vnd.oci.image.index.v1+json",
      "application/vnd.docker.distribution.manifest.list.v2+json",
      "application/vnd.oci.image.manifest.v1+json",
      "application/vnd.docker.distribution.manifest.v2+json",
    ].join(", ");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const cachedToken = this.getCachedToken(name);
      const headers: Record<string, string> = { "Accept": acceptHeader };
      if (cachedToken) {
        headers["Authorization"] = `Bearer ${cachedToken}`;
      }

      let response = await fetch(url, { headers, signal: controller.signal });

      // Handle auth retry
      if (response.status === 401) {
        const token = await this.getAnonymousToken(response, name);
        if (token) {
          const retryController = new AbortController();
          const retryTimeout = setTimeout(() => retryController.abort(), 10000);
          try {
            response = await fetch(url, {
              headers: { ...headers, "Authorization": `Bearer ${token}` },
              signal: retryController.signal,
            });
          } finally {
            clearTimeout(retryTimeout);
          }
        }
      }

      if (!response.ok) return null;

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch the image config blob and extract version from labels.
   */
  private async getVersionFromConfig(name: string, configDigest: string): Promise<string | null> {
    const url = `${this.baseUrl}/v2/${name}/blobs/${configDigest}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const cachedToken = this.getCachedToken(name);
      const headers: Record<string, string> = {
        "Accept": "application/vnd.oci.image.config.v1+json, application/vnd.docker.container.image.v1+json",
      };
      if (cachedToken) {
        headers["Authorization"] = `Bearer ${cachedToken}`;
      }

      let response = await fetch(url, { headers, signal: controller.signal });

      // Handle auth retry
      if (response.status === 401) {
        const token = await this.getAnonymousToken(response, name);
        if (token) {
          const retryController = new AbortController();
          const retryTimeout = setTimeout(() => retryController.abort(), 10000);
          try {
            response = await fetch(url, {
              headers: { ...headers, "Authorization": `Bearer ${token}` },
              signal: retryController.signal,
            });
          } finally {
            clearTimeout(retryTimeout);
          }
        }
      }

      if (!response.ok) return null;

      const config: OciImageConfig = await response.json();
      const labels = config.config?.Labels;

      if (labels) {
        const version = this.extractVersionFromAnnotations(labels);
        if (version) {
          return version;
        }
      }

      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Extract version from annotations or labels.
   * Returns whatever version string is set, regardless of format.
   */
  private extractVersionFromAnnotations(annotations?: Record<string, string>): string | null {
    if (!annotations) return null;

    // Common version annotation/label keys
    const versionKeys = [
      "org.opencontainers.image.version",
      "org.label-schema.version",
      "version",
    ];

    for (const key of versionKeys) {
      const value = annotations[key];
      if (value) {
        return value;
      }
    }

    return null;
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
