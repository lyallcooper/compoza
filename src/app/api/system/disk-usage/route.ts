import { getDiskUsage } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

export async function GET() {
  try {
    const diskUsage = await getDiskUsage();
    return success(diskUsage);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get disk usage"));
  }
}
