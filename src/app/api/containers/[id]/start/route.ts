import { NextRequest } from "next/server";
import { startContainer } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    await startContainer(id);
    return success({ message: "Container started" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to start container"));
  }
}
