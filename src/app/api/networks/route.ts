import { NextRequest } from "next/server";
import { listNetworks, createNetwork } from "@/lib/docker";
import { success, error, badRequest, getErrorMessage, validateJsonContentType } from "@/lib/api";

export async function GET() {
  try {
    const networks = await listNetworks();
    return success(networks);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to list networks"));
  }
}

export async function POST(request: NextRequest) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const { name, driver, subnet, gateway } = body;

    if (!name) {
      return badRequest("Network name is required");
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
      return badRequest(
        "Network name must start with a letter or number and can only contain letters, numbers, underscores, periods, and hyphens"
      );
    }

    await createNetwork({ name, driver, subnet, gateway });
    return success({ message: "Network created" }, 201);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to create network"));
  }
}
