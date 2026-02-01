import { NextRequest, NextResponse } from "next/server";
import { getAllCachedUpdates } from "@/lib/updates";
import { validateJsonContentType } from "@/lib/api/validation";

// GET returns all cached update info (no checking, just returns cache)
export async function GET() {
  try {
    const cached = getAllCachedUpdates();
    return NextResponse.json({ data: cached });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get updates" },
      { status: 500 }
    );
  }
}

// POST with specific images filters the cached results
export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const { images } = body;

    const cached = getAllCachedUpdates();

    // If specific images requested, filter to those
    if (images && Array.isArray(images)) {
      const imageSet = new Set(images);
      const filtered = cached.filter((c) => imageSet.has(c.image));
      return NextResponse.json({ data: filtered });
    }

    return NextResponse.json({ data: cached });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get updates" },
      { status: 500 }
    );
  }
}
