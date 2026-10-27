import { getSelfProjectName } from "@/lib/docker/self";

import { getProject } from "@/lib/projects/scanner";

export async function GET() {
  const composeName = await getSelfProjectName();
  const project = composeName ? await getProject(composeName) : null;
  const name = project?.name || composeName;
  return Response.json({ name });
}
