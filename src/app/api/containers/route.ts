import { NextRequest } from "next/server";
import { listContainers } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const includeHealth = request.nextUrl.searchParams.get("includeHealth") === "true";
    const containers = await listContainers({ all: true, includeHealth });
    return success(containers);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to list containers"));
  }
}
