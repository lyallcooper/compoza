import { NextRequest } from "next/server";
import { createLogResponse } from "@/lib/api/log-response";
import { composeLogs } from "@/lib/projects";

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const tail = parseInt(searchParams.get("tail") || "100", 10);
  const service = searchParams.get("service") || undefined;

  return createLogResponse(
    (signal) => composeLogs(name, { follow: true, tail, service, signal }), request.signal
  );
}
