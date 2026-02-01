import { NextRequest, NextResponse } from "next/server";

/**
 * Validates that a request has a JSON content type.
 * Returns an error response if invalid, null if valid.
 */
export function validateJsonContentType(request: NextRequest): NextResponse | null {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 }
    );
  }
  return null;
}
