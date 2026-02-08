import { NextRequest } from "next/server";
import { getProject, deleteProject } from "@/lib/projects";
import { success, notFound, error, getErrorMessage, createSSEResponse } from "@/lib/api";
import type { ComposeStreamEvent } from "./up/route";

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

  return createSSEResponse<ComposeStreamEvent>(async (send) => {
    const result = await deleteProject(name, {}, (data) => {
      send({ type: "output", data });
    });

    if (!result.success) {
      send({ type: "error", message: result.error || "Failed to delete project" });
    } else {
      send({ type: "done" });
    }
  });
}
