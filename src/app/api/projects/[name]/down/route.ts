import { NextRequest } from "next/server";
import { composeDown } from "@/lib/projects";
import { success, error, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ name: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    const { volumes, removeOrphans } = body;

    const result = await composeDown(name, { volumes, removeOrphans });

    if (!result.success) {
      return error(result.error || "Failed to stop project");
    }

    return success({ output: result.output });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to stop project"));
  }
}
