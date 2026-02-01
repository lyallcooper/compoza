import { NextRequest } from "next/server";
import { getContainerStats } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    const stats = await getContainerStats(id);
    return success(stats);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get container stats"));
  }
}
