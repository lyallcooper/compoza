import { NextRequest } from "next/server";
import { readComposeFile, saveComposeFile } from "@/lib/projects";
import { success, error, notFound, badRequest, getErrorMessage, validateJsonContentType } from "@/lib/api";

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;
  try {
    const content = await readComposeFile(name);

    if (content === null) {
      return notFound("Compose file not found");
    }

    return success({ content });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to read compose file"));
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  const { name } = await context.params;
  try {
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return badRequest("Content is required");
    }

    const result = await saveComposeFile(name, content);

    if (!result.success) {
      return error(result.error || "Failed to save compose file");
    }

    return success({ message: result.output });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to save compose file"));
  }
}
