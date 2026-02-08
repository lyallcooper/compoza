import { NextRequest } from "next/server";
import { composeUp } from "@/lib/projects";
import { applyRateLimit, createSSEResponse } from "@/lib/api";

export type ComposeStreamEvent =
  | { type: "output"; data: string }
  | { type: "done" }
  | { type: "error"; message: string };

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
  const { build, pull } = body;

  return createSSEResponse<ComposeStreamEvent>(async (send) => {
    const result = await composeUp(name, { build, pull }, (data) => {
      send({ type: "output", data });
    });

    if (!result.success) {
      send({ type: "error", message: result.error || "Failed to start project" });
    } else {
      send({ type: "done" });
    }
  });
}
