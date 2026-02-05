import { getNetwork, removeNetwork } from "@/lib/docker";
import { success, error, notFound, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { name } = await context.params;

  try {
    const network = await getNetwork(name);
    if (!network) {
      return notFound("Network not found");
    }
    return success(network);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get network"));
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { name } = await context.params;

  try {
    await removeNetwork(name);
    return success({ message: "Network removed" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to remove network"));
  }
}
