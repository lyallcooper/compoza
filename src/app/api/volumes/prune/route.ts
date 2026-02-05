import { pruneVolumes } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

export async function POST() {
  try {
    const result = await pruneVolumes();
    return success(result);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to prune volumes"));
  }
}
