import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/docker";
import { composePullService, composeUpService } from "@/lib/projects";
import { clearCachedUpdates } from "@/lib/updates";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    const container = await getContainer(id);

    if (!container) {
      return NextResponse.json({ error: "Container not found" }, { status: 404 });
    }

    // Verify this is a compose-managed container
    if (!container.projectName || !container.serviceName) {
      return NextResponse.json(
        { error: "Container is not managed by compose" },
        { status: 400 }
      );
    }

    const wasRunning = container.state === "running";
    let output = "";

    // Pull the image for this service
    const pullResult = await composePullService(container.projectName, container.serviceName);
    output += pullResult.output;

    if (!pullResult.success) {
      return NextResponse.json({ error: pullResult.error || "Failed to pull image" }, { status: 500 });
    }

    // Recreate the service if it was running
    let restarted = false;
    if (wasRunning) {
      const upResult = await composeUpService(container.projectName, container.serviceName);
      output += "\n" + upResult.output;

      if (!upResult.success) {
        return NextResponse.json({ error: upResult.error || "Failed to recreate container" }, { status: 500 });
      }
      restarted = true;
    }

    // Clear update cache for this image so it gets rechecked
    if (container.image) {
      clearCachedUpdates([container.image]);
    }

    return NextResponse.json({ data: { output, restarted } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update container" },
      { status: 500 }
    );
  }
}
