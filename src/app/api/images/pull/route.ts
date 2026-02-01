import { NextRequest, NextResponse } from "next/server";
import { pullImage } from "@/lib/docker";
import { validateJsonContentType } from "@/lib/api/validation";

export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Image name is required" }, { status: 400 });
    }

    await pullImage(name);
    return NextResponse.json({ data: { message: `Image ${name} pulled successfully` } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to pull image" },
      { status: 500 }
    );
  }
}
