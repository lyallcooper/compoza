/**
 * Formatting utilities for dates, bytes, Docker IDs, and terminal output.
 */

const ANSI_RE = /\x1b\[([0-9;]*)m/g;

/** Standard ANSI 3/4-bit foreground colors → CSS color values */
const ANSI_COLORS: Record<number, string> = {
  30: "#4e4e4e", 31: "#e06c75", 32: "#98c379", 33: "#e5c07b",
  34: "#61afef", 35: "#c678dd", 36: "#56b6c2", 37: "#dcdfe4",
  90: "#7f8490", 91: "#e06c75", 92: "#98c379", 93: "#e5c07b",
  94: "#61afef", 95: "#c678dd", 96: "#56b6c2", 97: "#ffffff",
};

export interface AnsiSpan {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

/**
 * Parse ANSI color codes into styled spans for rendering in the UI.
 * Supports SGR codes: reset (0), bold (1), dim (2), and 3/4-bit foreground colors (30-37, 90-97).
 */
export function parseAnsi(str: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  let color: string | undefined;
  let bold = false;
  let dim = false;
  let lastIndex = 0;

  for (const match of str.matchAll(ANSI_RE)) {
    // Flush text before this escape
    if (match.index > lastIndex) {
      spans.push({ text: str.slice(lastIndex, match.index), color, bold, dim });
    }
    lastIndex = match.index + match[0].length;

    // Parse semicolon-separated SGR codes
    const codes = match[1] ? match[1].split(";").map(Number) : [0];
    for (const code of codes) {
      if (code === 0) { color = undefined; bold = false; dim = false; }
      else if (code === 1) { bold = true; }
      else if (code === 2) { dim = true; }
      else if (code in ANSI_COLORS) { color = ANSI_COLORS[code]; }
    }
  }

  // Flush remaining text
  if (lastIndex < str.length) {
    spans.push({ text: str.slice(lastIndex), color, bold, dim });
  }

  return spans;
}

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

/** Strip protocol prefix for display: "https://github.com/foo" -> "github.com/foo" */
export function formatDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
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

/**
 * Return the best display string for a single image version.
 * Prefers semantic version, falls back to 8-char digest prefix.
 */
export function formatVersion(info: {
  currentVersion?: string;
  currentDigest?: string;
}): string | undefined {
  if (info.currentVersion) return info.currentVersion;
  if (info.currentDigest) return info.currentDigest.replace("sha256:", "").slice(0, 8);
  return undefined;
}

/**
 * Return a transition string like "1.2.3 → 1.2.4" or "abc12345 → def67890".
 * Prefers version change, falls back to digest prefix change.
 * Returns null if no meaningful change to show.
 */
export function formatVersionChange(info: {
  currentVersion?: string;
  latestVersion?: string;
  currentDigest?: string;
  latestDigest?: string;
}): string | null {
  if (info.currentVersion && info.latestVersion && info.currentVersion !== info.latestVersion) {
    return `${info.currentVersion} → ${info.latestVersion}`;
  }
  if (info.currentDigest && info.latestDigest && info.currentDigest !== info.latestDigest) {
    const current = info.currentDigest.replace("sha256:", "").slice(0, 8);
    const latest = info.latestDigest.replace("sha256:", "").slice(0, 8);
    return `${current} → ${latest}`;
  }
  return null;
}
