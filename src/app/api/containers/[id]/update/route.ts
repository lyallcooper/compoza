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

    // Verify this is a compose-managed container
    if (!container.projectName || !container.serviceName) {
      return badRequest("Container is not managed by compose");
    }

    const wasRunning = container.state === "running";
    let output = "";

    // Pull the image for this service
    const pullResult = await composePullService(container.projectName, container.serviceName);
    output += pullResult.output;

    if (!pullResult.success) {
      return error(pullResult.error || "Failed to pull image");
    }

    // Recreate the service if it was running
    let restarted = false;
    if (wasRunning) {
      const upResult = await composeUpService(container.projectName, container.serviceName);
      output += "\n" + upResult.output;

      if (!upResult.success) {
        return error(upResult.error || "Failed to recreate container");
      }
      restarted = true;
    }

    // Clear update cache for this image so it gets rechecked
    if (container.image) {
      clearCachedUpdates([container.image]);
    }

    return success({ output, restarted });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to update container"));
  }
}
