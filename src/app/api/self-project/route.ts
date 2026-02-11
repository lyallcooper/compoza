import { getSelfProjectName } from "@/lib/docker/self";

export async function GET() {
  const name = await getSelfProjectName();
  return Response.json({ name });
}
