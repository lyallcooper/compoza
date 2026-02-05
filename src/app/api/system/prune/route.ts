import { NextRequest } from "next/server";
import { systemPrune } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";
import type { SystemPruneOptions } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const options: SystemPruneOptions = {
      containers: body.containers === true,
      networks: body.networks === true,
      images: body.images === true,
      volumes: body.volumes === true,
      allImages: body.allImages === true,
    };
    const result = await systemPrune(options);
    return success(result);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to prune system"));
  }
}
