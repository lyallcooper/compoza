import { NextRequest } from "next/server";
import { getContainer } from "@/lib/docker";
import { composePullService, composeUpService } from "@/lib/projects";
import { clearCachedUpdates } from "@/lib/updates";
import { success, error, notFound, badRequest, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    const container = await getContainer(id);

    if (!container) {
      return notFound("Container not found");
    }

    // Verify this is a compose-managed container that can be updated
    // Destructure to narrow types (TypeScript needs explicit presence check)
    const { projectName, serviceName } = container;
    if (!projectName || !serviceName || !container.actions.canUpdate) {
      return badRequest("Container cannot be updated (not compose-managed or in invalid state)");
    }

    const wasRunning = container.state === "running";
    let output = "";

    // Pull the image for this service
    const pullResult = await composePullService(projectName, serviceName);
    output += pullResult.output;

    if (!pullResult.success) {
      return error(pullResult.error || "Failed to pull image");
    }

    // Clear update cache after pull so stale cached "no update" is removed
    // (must happen even if up fails below)
    if (container.image) {
      clearCachedUpdates([container.image]);
    }

    // Recreate the service if it was running
    let restarted = false;
    if (wasRunning) {
      const upResult = await composeUpService(projectName, serviceName);
      output += "\n" + upResult.output;

      if (!upResult.success) {
        return error(upResult.error || "Failed to recreate container");
      }
      restarted = true;
    }

    return success({ output, restarted, image: container.image });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to update container"));
  }
}
