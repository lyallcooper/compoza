import { NextRequest } from "next/server";
import { getContainer, removeContainer } from "@/lib/docker";
import { success, notFound, error, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    const container = await getContainer(id);

    if (!container) {
      return notFound("Container not found");
    }

    return success(container);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get container"));
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  try {
    await removeContainer(id, force);
    return success({ message: "Container removed" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to remove container"));
  }
}
