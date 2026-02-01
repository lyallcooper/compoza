import type { RegistryClient, TagInfo } from "./types";

interface DockerHubTagResponse {
  count: number;
  next: string | null;
  results: Array<{
    name: string;
    images: Array<{
      architecture: string;
      os: string;
      digest: string;
    }>;
  }>;
}

/**
 * Docker Hub registry client.
 * Uses the Docker Hub API v2 to list tags with their digests.
 */
export class DockerHubClient implements RegistryClient {
  private baseUrl = "https://hub.docker.com/v2";

  async listTags(namespace: string, repository: string): Promise<TagInfo[]> {
    const tags: TagInfo[] = [];
    let url: string | null = `${this.baseUrl}/repositories/${namespace}/${repository}/tags?page_size=100`;

    try {
      while (url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(url, {
          headers: {
            "Accept": "application/json",
          },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!response.ok) {
          if (response.status === 404) {
            return [];
          }
          throw new Error(`Docker Hub API error: ${response.status}`);
        }

        const data: DockerHubTagResponse = await response.json();

        for (const tag of data.results) {
          const digest = this.findBestDigest(tag.images);
          if (digest) {
            tags.push({ name: tag.name, digest });
          }
        }

        url = data.next;

        // Limit to avoid excessive API calls
        if (tags.length >= 200) {
          break;
        }
      }
    } catch (error) {
      console.warn(`[DockerHub] Failed to list tags for ${namespace}/${repository}:`, error);
      throw error;
    }

    return tags;
  }

  /**
   * Find the best digest from the available images.
   * Prefers linux/amd64, falls back to any linux image.
   */
  private findBestDigest(images: DockerHubTagResponse["results"][0]["images"]): string | null {
    if (!images || images.length === 0) {
      return null;
    }

    // Prefer linux/amd64
    const amd64 = images.find(
      (img) => img.os === "linux" && img.architecture === "amd64"
    );
    if (amd64?.digest) {
      return amd64.digest;
    }

    // Fall back to any linux image
    const linux = images.find((img) => img.os === "linux");
    if (linux?.digest) {
      return linux.digest;
    }

    // Fall back to first image with a digest
    const first = images.find((img) => img.digest);
    return first?.digest || null;
  }
}
