import { getDocker } from "@/lib/docker";

export async function GET() {
  try {
    await getDocker().ping();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
