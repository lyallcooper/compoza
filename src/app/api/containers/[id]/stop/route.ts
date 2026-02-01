import { NextRequest } from "next/server";
import { stopContainer } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    await stopContainer(id);
    return success({ message: "Container stopped" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to stop container"));
  }
}
