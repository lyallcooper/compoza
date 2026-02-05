import { getSystemInfo } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

export async function GET() {
  try {
    const info = await getSystemInfo();
    return success(info);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get system info"));
  }
}
