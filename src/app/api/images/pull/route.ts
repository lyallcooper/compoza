import { NextRequest } from "next/server";
import { pullImage } from "@/lib/docker";
import { success, error, badRequest, getErrorMessage, validateJsonContentType } from "@/lib/api";

export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return badRequest("Image name is required");
    }

    await pullImage(name);
    return success({ message: `Image ${name} pulled successfully` });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to pull image"));
  }
}
