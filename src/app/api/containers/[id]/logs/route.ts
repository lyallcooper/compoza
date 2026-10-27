import { NextRequest } from "next/server";
import { createLogResponse } from "@/lib/api/log-response";
import { streamContainerLogs } from "@/lib/docker";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const tail = parseInt(searchParams.get("tail") || "100", 10);
  const since = searchParams.get("since") ? parseInt(searchParams.get("since")!, 10) : undefined;

  return createLogResponse(
    (signal) => streamContainerLogs(id, { follow: true, tail, since, signal }), request.signal
  );
}
