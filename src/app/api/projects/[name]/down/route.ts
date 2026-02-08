import { NextRequest } from "next/server";
import { composeDown } from "@/lib/projects";
import { applyRateLimit, createSSEResponse } from "@/lib/api";
import type { ComposeStreamEvent } from "../up/route";

type RouteContext = { params: Promise<{ name: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  // Rate limit: 10 requests per minute for expensive operations
  const rateLimited = applyRateLimit(request, { limit: 10, windowMs: 60000 });
  if (rateLimited) return rateLimited;

  const { name } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { volumes, removeOrphans } = body;

  return createSSEResponse<ComposeStreamEvent>(async (send) => {
    const result = await composeDown(name, { volumes, removeOrphans }, (data) => {
      send({ type: "output", data });
    });

    if (!result.success) {
      send({ type: "error", message: result.error || "Failed to stop project" });
    } else {
      send({ type: "done" });
    }
  });
}
