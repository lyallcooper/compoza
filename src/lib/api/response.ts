import { NextResponse } from "next/server";

/**
 * Standard API response format
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}

/**
 * Create a success response with data
 */
export function success<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

/**
 * Create an error response
 */
export function error(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Create a not found response
 */
export function notFound(message = "Not found") {
  return error(message, 404);
}

/**
 * Create a bad request response
 */
export function badRequest(message: string) {
  return error(message, 400);
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Wrap an async handler with standard error handling
 */
export function withErrorHandling(
  handler: () => Promise<NextResponse>,
  fallbackMessage: string
): Promise<NextResponse> {
  return handler().catch((err: unknown) => {
    console.error(fallbackMessage, err);
    return error(getErrorMessage(err, fallbackMessage));
  });
}
