import { NextRequest } from "next/server";
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const logs = await composeLogs(name, { follow: true, tail, service });

        for await (const line of logs) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line })}\n\n`));
        }

        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
