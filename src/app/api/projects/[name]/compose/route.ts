import { NextRequest, NextResponse } from "next/server";
import { readComposeFile, saveComposeFile } from "@/lib/projects";
import { validateJsonContentType } from "@/lib/api/validation";

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;
  try {
    const content = await readComposeFile(name);

    if (content === null) {
      return NextResponse.json({ error: "Compose file not found" }, { status: 404 });
    }

    return NextResponse.json({ data: { content } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read compose file" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  const { name } = await context.params;
  try {
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const result = await saveComposeFile(name, content);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: { message: result.output } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save compose file" },
      { status: 500 }
    );
  }
}
