import type { ApiResponse } from "./response";

interface FetchOptions extends RequestInit {
  /** If true, return null instead of throwing on 404 */
  nullOn404?: boolean;
}

/** Error thrown when server disconnects mid-request */
export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

/**
 * Fetch wrapper that handles API response parsing and error handling.
 * Reduces boilerplate in React Query hooks.
 */
export async function apiFetch<T>(
  url: string,
  options?: FetchOptions
): Promise<T> {
  const { nullOn404, ...fetchOptions } = options || {};

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err) {
    // Network error (server down, connection refused, etc.)
    if ((err as Error).name === "AbortError") throw err;
    throw new ConnectionError((err as Error).message || "Network error");
  }

  if (nullOn404 && res.status === 404) {
    return null as T;
  }

  let data: ApiResponse<T>;
  try {
    data = await res.json();
  } catch {
    // JSON parse error usually means connection dropped mid-response
    throw new ConnectionError("Connection lost during response");
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data.data as T;
}

/**
 * POST request helper with JSON body.
 */
export async function apiPost<T>(
  url: string,
  body?: unknown,
  options?: Omit<FetchOptions, "method" | "body">
): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request helper with JSON body.
 */
export async function apiPut<T>(
  url: string,
  body: unknown
): Promise<T> {
  return apiFetch<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request helper.
 */
export async function apiDelete<T>(
  url: string,
  body?: unknown,
  options?: Omit<FetchOptions, "method" | "body">
): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method: "DELETE",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
