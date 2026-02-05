import { NextRequest } from "next/server";
import { removeImage, getImage } from "@/lib/docker";
import { success, error, notFound, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const image = await getImage(decodeURIComponent(id));
    if (!image) return notFound("Image not found");
    return success(image);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to get image"));
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    await removeImage(decodeURIComponent(id), force);
    return success({ message: "Image deleted" });
  } catch (err) {
    return error(getErrorMessage(err, "Failed to delete image"));
  }
}
