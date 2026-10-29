import { NextRequest } from "next/server";
import { success, error, validateJsonContentType } from "@/lib/api";
import { ignoreImageUpdate } from "@/lib/updates/cache";

export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  const { image, latestDigest } = (body ?? {}) as Record<string, unknown>;
  if (typeof image !== "string" || !image.trim() || image.length > 512
    || typeof latestDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(latestDigest)) {
    return error("An image and release digest are required", 400);
  }

  // Use the selected digest so a concurrent registry refresh cannot skip a newer release.
  ignoreImageUpdate(image, latestDigest);
  return success({ message: "Image update skipped" });
}
