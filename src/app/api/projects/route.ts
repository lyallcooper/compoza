import { NextRequest } from "next/server";
import { scanProjects, createProject } from "@/lib/projects";
import { success, error, badRequest, getErrorMessage, validateJsonContentType } from "@/lib/api";

export async function GET() {
  try {
    const projects = await scanProjects();
    return success(projects);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to scan projects"));
  }
}

export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const { name, composeContent, envContent } = body;

    if (!name || !composeContent) {
      return badRequest("Name and compose content are required");
    }

    // Validate project name
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return badRequest("Project name can only contain letters, numbers, hyphens, and underscores");
    }

    const result = await createProject(name, composeContent, envContent);

    if (!result.success) {
      return error(result.error || "Failed to create project");
    }

    return success({ message: result.output }, 201);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to create project"));
  }
}
