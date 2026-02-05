import { NextRequest } from "next/server";
import { listVolumes, createVolume } from "@/lib/docker";
import { success, error, badRequest, getErrorMessage, validateJsonContentType } from "@/lib/api";

export async function GET() {
  try {
    const volumes = await listVolumes();
    return success(volumes);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to list volumes"));
  }
}

export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const { name, driver, labels } = body;

    if (!name) {
      return badRequest("Volume name is required");
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
      return badRequest(
        "Volume name must start with a letter or number and can only contain letters, numbers, underscores, periods, and hyphens"
      );
    }

    await createVolume({ name, driver, labels });
    return success({ message: "Volume created" }, 201);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to create volume"));
  }
}
