import { getNetwork, removeNetwork } from "@/lib/docker";
import { success, error, notFound, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const network = await getNetwork(id);
    if (!network) {
      return notFound("Network not found");
    }
    return success(network);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get network"));
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    await removeNetwork(id);
    return success({ message: "Network removed" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to remove network"));
  }
}
