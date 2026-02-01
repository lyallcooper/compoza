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
