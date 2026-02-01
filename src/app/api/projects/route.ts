import { NextRequest, NextResponse } from "next/server";
import { scanProjects, createProject } from "@/lib/projects";
import { validateJsonContentType } from "@/lib/api/validation";

export async function GET() {
  try {
    const projects = await scanProjects();
    return NextResponse.json({ data: projects });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to scan projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const { name, composeContent, envContent } = body;

    if (!name || !composeContent) {
      return NextResponse.json(
        { error: "Name and compose content are required" },
        { status: 400 }
      );
    }

    // Validate project name
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return NextResponse.json(
        { error: "Project name can only contain letters, numbers, hyphens, and underscores" },
        { status: 400 }
      );
    }

    const result = await createProject(name, composeContent, envContent);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: { message: result.output } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create project" },
      { status: 500 }
    );
  }
}
