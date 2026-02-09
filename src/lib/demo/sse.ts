export interface DemoSSEEvent {
  type: string;
  data?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Create a ReadableStream that emits SSE-formatted chunks with delays.
 * The stream produces `data: {...}\n\n` lines matching the real server format.
 */
export function createDemoSSEStream(events: DemoSSEEvent[], delayMs = 100): ReadableStream {
  let index = 0;
  let cancelled = false;

  return new ReadableStream({
    async pull(controller) {
      if (cancelled || index >= events.length) {
        controller.close();
        return;
      }

      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      if (cancelled) {
        controller.close();
        return;
      }

      const event = events[index++];
      const chunk = `data: ${JSON.stringify(event)}\n\n`;
      controller.enqueue(new TextEncoder().encode(chunk));

      if (index >= events.length) {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}

/** Build output events from an array of log lines, ending with a done event. */
export function buildOutputEvents(lines: string[]): DemoSSEEvent[] {
  const events: DemoSSEEvent[] = lines.map((line) => ({ type: "output", data: line }));
  events.push({ type: "done" });
  return events;
}
