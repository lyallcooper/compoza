import { NextRequest } from "next/server";
import { readEnvFile, saveEnvFile } from "@/lib/projects";
import { success, error, badRequest, getErrorMessage, validateJsonContentType } from "@/lib/api";

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;
  try {
    const content = await readEnvFile(name);

    // Return empty string if no env file exists (not an error)
    return success({ content: content || "" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to read env file"));
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

    if (content === undefined) {
      return badRequest("Content is required");
    }

    const result = await saveEnvFile(name, content);

    if (!result.success) {
      return error(result.error || "Failed to save env file");
    }

    return success({ message: result.output });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to save env file"));
  }
}
