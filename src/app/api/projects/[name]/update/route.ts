import { NextRequest } from "next/server";
import { applyRateLimit, badRequest, createSSEResponse, validateJsonContentType } from "@/lib/api";
import { updateProjectImages, type ProjectUpdateResult } from "@/lib/updates/project-update";

export type ProjectUpdateEvent =
  | { type: "output"; data: string }
  | { type: "done"; result: ProjectUpdateResult }
  | { type: "error"; message: string };

export async function POST(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.images) || body.images.length === 0 || body.images.length > 1000
    || !body.images.every((image: unknown) => typeof image === "string" && image.trim() && image.length <= 512)) {
    return badRequest("Select at least one valid image to update");
  }
  const rateLimited = applyRateLimit(request, { limit: 10, windowMs: 60000 });
  if (rateLimited) return rateLimited;
  const { name } = await context.params;
  return createSSEResponse<ProjectUpdateEvent>(async (send, signal) => {
    const result = await updateProjectImages(name, body.images, (data) => send({ type: "output", data }), signal);
    send({ type: "done", result });
  });
}
