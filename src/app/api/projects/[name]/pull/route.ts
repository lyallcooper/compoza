import { NextRequest } from "next/server";
import { composePull } from "@/lib/projects";
import { createSSEResponse } from "@/lib/api";
import type { ComposeStreamEvent } from "../up/route";

type RouteContext = { params: Promise<{ name: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;

  return createSSEResponse<ComposeStreamEvent>(async (send) => {
    const result = await composePull(name, (data) => {
      send({ type: "output", data });
    });

    if (!result.success) {
      send({ type: "error", message: result.error || "Failed to pull images" });
    } else {
      send({ type: "done" });
    }
  });
}
