/**
 * Create an SSE (Server-Sent Events) Response from an async handler.
 * Extracts the boilerplate of creating a ReadableStream, TextEncoder,
 * wrapping in try/catch, and sending structured events.
 */
export function createSSEResponse<TEvent>(
  handler: (send: (event: TEvent) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: TEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await handler(send);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        send({ type: "error", message } as TEvent);
      }

      controller.close();
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
