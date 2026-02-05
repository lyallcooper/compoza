import { getVolume, removeVolume } from "@/lib/docker";
import { success, error, notFound, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { name } = await context.params;

  try {
    const volume = await getVolume(name);
    if (!volume) {
      return notFound("Volume not found");
    }
    return success(volume);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get volume"));
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { name } = await context.params;

  try {
    await removeVolume(name);
    return success({ message: "Volume removed" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to remove volume"));
  }
}
