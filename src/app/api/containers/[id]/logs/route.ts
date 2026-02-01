import { NextRequest } from "next/server";
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const line of streamContainerLogs(id, { follow: true, tail, since })) {
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
