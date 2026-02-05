import { NextRequest } from "next/server";
import { pruneVolumes } from "@/lib/docker";
import { success, error, getErrorMessage } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const all = body.all === true;
    const result = await pruneVolumes({ all });
    return success(result);
  } catch (err) {
    return error(getErrorMessage(err, "Failed to prune volumes"));
  }
}
