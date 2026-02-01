import { NextRequest } from "next/server";
import { composePull } from "@/lib/projects";
import { success, error, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ name: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;
  try {
    const result = await composePull(name);

    if (!result.success) {
      return error(result.error || "Failed to pull images");
    }

    return success({ output: result.output });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to pull images"));
  }
}
