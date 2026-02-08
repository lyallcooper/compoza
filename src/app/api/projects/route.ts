import { NextRequest } from "next/server";
import { scanProjects, createProject, isValidProjectName } from "@/lib/projects";
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

    if (
      typeof name !== "string"
      || typeof composeContent !== "string"
      || !name.trim()
      || !composeContent.trim()
    ) {
      return badRequest("Name and compose content are required");
    }

    if (envContent !== undefined && typeof envContent !== "string") {
      return badRequest("Env content must be a string when provided");
    }

    const projectName = name.trim();

    if (!isValidProjectName(projectName)) {
      return badRequest("Project name can only contain letters, numbers, hyphens, and underscores");
    }

    const result = await createProject(projectName, composeContent, envContent);

    if (!result.success) {
      return error(result.error || "Failed to create project", result.status || 500);
    }

    return success({ message: result.output }, 201);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to create project"));
  }
}
