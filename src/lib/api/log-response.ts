/** Stream logs on demand and close Docker connections when the viewer leaves. */
export function createLogResponse(
  getLogs: (signal: AbortSignal) => AsyncIterable<string> | Promise<AsyncIterable<string>>,
  requestSignal: AbortSignal
): Response {
  const controller = new AbortController();
  const encoder = new TextEncoder();
  let iterator: AsyncIterator<string> | undefined;
  const abort = () => controller.abort();
  requestSignal.addEventListener("abort", abort, { once: true });
  if (requestSignal.aborted) abort();
  const cleanup = () => {
    controller.abort();
    requestSignal.removeEventListener("abort", abort);
  };
  const stream = new ReadableStream<Uint8Array>({
    async pull(output) {
      try {
        if (!iterator) iterator = (await getLogs(controller.signal))[Symbol.asyncIterator]();
        const result = await iterator.next();
        if (result.done || controller.signal.aborted) {
          cleanup();
          output.close();
        } else {
          output.enqueue(encoder.encode(`data: ${JSON.stringify({ line: result.value })}\n\n`));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : "Unknown error";
          output.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        }
        try {
          output.close();
        } catch {
          // Cancellation may already have closed the response.
        }
        cleanup();
      }
    },
    async cancel() {
      cleanup();
      await iterator?.return?.();
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
