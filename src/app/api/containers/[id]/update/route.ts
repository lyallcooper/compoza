import { NextRequest } from "next/server";
import { getContainer } from "@/lib/docker";
import { composePullService, composeUpService } from "@/lib/projects";
import { clearCachedUpdates } from "@/lib/updates";
import { notFound, badRequest, createSSEResponse } from "@/lib/api";
import type { ContainerUpdateStreamEvent } from "@/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;

  const container = await getContainer(id);

  if (!container) {
    return notFound("Container not found");
  }

  const { projectName, serviceName } = container;
  if (!projectName || !serviceName || !container.actions.canUpdate) {
    return badRequest("Container cannot be updated (not compose-managed or in invalid state)");
  }

  return createSSEResponse<ContainerUpdateStreamEvent>(async (send) => {
    const wasRunning = container.state === "running";

    // Pull the image for this service
    const pullResult = await composePullService(
      projectName,
      serviceName,
      {},
      (data) => {
        send({ type: "output", data });
      }
    );

    if (!pullResult.success) {
      send({ type: "error", message: pullResult.error || "Failed to pull image" });
      return;
    }

    // Clear update cache after pull
    if (container.image) {
      clearCachedUpdates([container.image]);
    }

    // Recreate the service if it was running
    let restarted = false;
    if (wasRunning) {
      const upResult = await composeUpService(
        projectName,
        serviceName,
        {},
        (data) => {
          send({ type: "output", data });
        }
      );

      if (!upResult.success) {
        send({ type: "error", message: upResult.error || "Failed to recreate container" });
        return;
      }
      restarted = true;
    }

    send({ type: "done", result: { restarted, image: container.image } });
  });
}
