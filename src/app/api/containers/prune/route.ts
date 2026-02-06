import { pruneContainers } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

export async function POST() {
  try {
    const result = await pruneContainers();
    return success(result);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to prune containers"));
  }
}
