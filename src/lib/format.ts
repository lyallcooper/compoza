/**
 * Date/time formatting utilities using ISO 8601 format.
 */

const pad = (n: number): string => n.toString().padStart(2, "0");

/**
 * Format a date as ISO 8601 datetime: "2024-01-15 14:30:00"
 */
export function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Format a date as ISO 8601 date: "2024-01-15"
 */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Format a date as ISO 8601 time: "14:30:00"
 */
export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Format bytes into human-readable format using IEC binary prefixes: "1.5 GiB"
 * Uses base 2 (1024) with correct binary prefixes (KiB, MiB, GiB, TiB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Extract short ID from Docker image/container ID: "sha256:abc123..." -> "abc123..."
 */
export function formatShortId(id: string): string {
  const hash = id.replace(/^sha256:/, "");
  return hash.slice(0, 12);
}

/**
 * Patterns that indicate a key contains sensitive data.
 */
const SENSITIVE_PATTERNS = ["PASSWORD", "SECRET", "KEY", "TOKEN", "CREDENTIAL", "API_KEY", "APIKEY", "PRIVATE"];

/**
 * Check if a key (env var name, label key, etc.) likely contains sensitive data.
 */
export function isSensitiveKey(key: string): boolean {
  const upperKey = key.toUpperCase();
  return SENSITIVE_PATTERNS.some((pattern) => upperKey.includes(pattern));
}

/**
 * Mask for hidden sensitive values.
 */
export const SENSITIVE_MASK = "••••••••";

/**
 * Normalize Docker image names by stripping the `docker.io/` prefix that
 * Docker Compose v2 adds when creating containers. This ensures image names
 * match the short form used in Docker's image store (RepoTags).
 *
 * - `docker.io/library/nginx` → `nginx`
 * - `docker.io/linuxserver/sonarr` → `linuxserver/sonarr`
 * - `ghcr.io/foo/bar` → `ghcr.io/foo/bar` (unchanged)
 */
export function normalizeImageName(name: string): string {
  if (name.startsWith("docker.io/library/")) {
    return name.slice("docker.io/library/".length);
  }
  if (name.startsWith("docker.io/")) {
    return name.slice("docker.io/".length);
  }
  return name;
}

/**
 * Extract source URL from image labels, validating it relates to the image name.
 * Checks org.opencontainers.image.source and org.label-schema.url labels.
 * Validates the URL's owner/repo matches the image namespace/repository
 * to filter out labels inherited from base images.
 */
export function extractSourceUrl(
  labels: Record<string, string> | undefined,
  imageName: string
): string | undefined {
  if (!labels) return undefined;

  const sourceKeys = [
    "org.opencontainers.image.source",
    "org.label-schema.url",
  ];

  let raw: string | undefined;
  for (const key of sourceKeys) {
    if (labels[key]) {
      raw = labels[key];
      break;
    }
  }

  if (!raw) return undefined;

  // Extract namespace/repo from image name (e.g., "linuxserver/sonarr:latest" → "linuxserver", "sonarr")
  const nameWithoutTag = imageName.replace(/:.*$/, "");
  const parts = nameWithoutTag.split("/");
  const imageRepo = parts[parts.length - 1].toLowerCase();
  const imageNamespace = parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : "";

  try {
    const url = new URL(raw);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) return raw;

    const urlOwner = pathParts[0].toLowerCase();
    const urlRepo = pathParts[1].toLowerCase();

    // Owner matches namespace (e.g., linuxserver/sonarr → github.com/linuxserver/...)
    if (urlOwner === imageNamespace) return raw;

    // Image repo name appears in URL repo (e.g., nginx → github.com/nginxinc/docker-nginx)
    if (urlRepo.includes(imageRepo) && imageRepo.length >= 3) return raw;

    // URL repo (minus "docker-" prefix) appears in image repo
    const cleanUrlRepo = urlRepo.replace(/^docker-/, "");
    if (cleanUrlRepo.length >= 3 && imageRepo.includes(cleanUrlRepo)) return raw;

    return undefined;
  } catch {
    return raw;
  }
}

/**
 * Get a releases/changelog URL from a source repository URL.
 * GitHub repos get /releases appended; others are returned as-is.
 */
export function getReleasesUrl(sourceUrl: string): string {
  if (sourceUrl.includes("github.com")) {
    return `${sourceUrl.replace(/\/$/, "")}/releases`;
  }
  return sourceUrl;
}
