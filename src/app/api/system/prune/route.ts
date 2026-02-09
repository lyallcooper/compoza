import { NextRequest } from "next/server";
import { systemPrune } from "@/lib/docker";
import { createSSEResponse } from "@/lib/api";
import type { SystemPruneOptions, SystemPruneEvent } from "@/types";

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

  return createSSEResponse<SystemPruneEvent>(async (send) => {
    const result = await systemPrune(options, (step) => send({ type: "step", step }));
    send({ type: "done", result });
  });
}
