import { listContainers } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

export async function GET() {
  try {
    const containers = await listContainers(true);
    return success(containers);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to list containers"));
  }
}
