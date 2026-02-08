import { NextRequest } from "next/server";
import { pullImage } from "@/lib/docker";
import { badRequest, createSSEResponse, validateJsonContentType } from "@/lib/api";

export type ImagePullStreamEvent =
  | { type: "output"; data: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  const body = await request.json().catch(() => ({}));
  const { name } = body;

  if (!name) {
    return badRequest("Image name is required");
  }

  return createSSEResponse<ImagePullStreamEvent>(async (send) => {
    await pullImage(name, (progress) => {
      send({ type: "output", data: progress });
    });
    send({ type: "done" });
  });
}
