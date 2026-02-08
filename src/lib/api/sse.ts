/**
 * Create an SSE (Server-Sent Events) Response from an async handler.
 * Extracts the boilerplate of creating a ReadableStream, TextEncoder,
 * wrapping in try/catch, and sending structured events.
 */
interface SSEOptions {
  /**
   * When true, aborts the handler signal if the client disconnects.
   * Defaults to false so long-running operations continue server-side.
   */
  cancelOnDisconnect?: boolean;
}

export function createSSEResponse<TEvent>(
  handler: (send: (event: TEvent) => boolean, signal: AbortSignal) => Promise<void>,
  options: SSEOptions = {}
): Response {
  const { cancelOnDisconnect = false } = options;
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Stream may already be closed
        }
      };

      const send = (event: TEvent): boolean => {
        if (closed || abortController.signal.aborted) return false;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          return true;
        } catch {
          close();
          return false;
        }
      };

      try {
        await handler(send, abortController.signal);
      } catch (err) {
        if (!abortController.signal.aborted) {
          const message = err instanceof Error ? err.message : "Unknown error";
          send({ type: "error", message } as TEvent);
        }
      }

      close();
    },
    cancel() {
      if (cancelOnDisconnect && !abortController.signal.aborted) {
        abortController.abort();
      }
      closed = true;
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
