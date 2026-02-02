import { NextRequest } from "next/server";
import { composeDown } from "@/lib/projects";
import { success, error, getErrorMessage, applyRateLimit } from "@/lib/api";

type RouteContext = { params: Promise<{ name: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  // Rate limit: 10 requests per minute for expensive operations
  const rateLimited = applyRateLimit(request, { limit: 10, windowMs: 60000 });
  if (rateLimited) return rateLimited;

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
