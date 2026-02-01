import { selfUpdate } from "@/lib/updates";
import { success, error, getErrorMessage } from "@/lib/api";

export async function POST() {
  try {
    const result = await selfUpdate();

    if (!result.success) {
      return error(result.message);
    }

    return success({ message: result.message });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to update"));
  }
}
