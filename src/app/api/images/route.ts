import { listImages } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

export async function GET() {
  try {
    const images = await listImages();
    return success(images);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to list images"));
  }
}
