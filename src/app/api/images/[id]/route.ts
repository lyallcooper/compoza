import { NextRequest } from "next/server";
import { removeImage } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

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
