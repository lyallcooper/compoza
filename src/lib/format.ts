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
