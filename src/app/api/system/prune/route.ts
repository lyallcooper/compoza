import { NextRequest } from "next/server";
import { systemPrune } from "@/lib/docker";
import type { SystemPruneOptions } from "@/types";
import type { SystemPruneStep } from "@/lib/docker";

export type SystemPruneEvent =
  | { type: "step"; step: SystemPruneStep }
  | { type: "done"; result: import("@/types").SystemPruneResult }
  | { type: "error"; message: string };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const options: SystemPruneOptions = {
    containers: body.containers === true,
    networks: body.networks === true,
    images: body.images === true,
    volumes: body.volumes === true,
    buildCache: body.buildCache === true,
    allImages: body.allImages === true,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SystemPruneEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const result = await systemPrune(options, (step) => send({ type: "step", step }));
        send({ type: "done", result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to prune system";
        send({ type: "error", message });
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
