import { NextRequest } from "next/server";
import { getProject, deleteProject } from "@/lib/projects";
import { success, notFound, error, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;
  try {
    const project = await getProject(name);

    if (!project) {
      return notFound("Project not found");
    }

    return success(project);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get project"));
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;
  try {
    const result = await deleteProject(name);

    if (!result.success) {
      return error(result.error || "Failed to delete project");
    }

    return success({ message: result.output });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to delete project"));
  }
}
