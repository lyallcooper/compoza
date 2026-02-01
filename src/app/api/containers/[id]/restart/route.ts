import { NextRequest } from "next/server";
import { restartContainer } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    await restartContainer(id);
    return success({ message: "Container restarted" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to restart container"));
  }
}
