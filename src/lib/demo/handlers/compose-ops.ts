import { DEMO_UPDATES } from "../fixtures";
import type { DemoState } from "../state";
import { createDemoSSEStream, buildOutputEvents } from "../sse";
import { jsonError, sse } from "../response";

export function projectUp(state: DemoState, name: string): Response {
  const project = state.getProject(name);
  if (!project) return jsonError("Project not found", 404);

  const hasContainers = project.services.some((s) => s.containerId);
  const lines: string[] = [];

  if (!hasContainers) {
    lines.push(` Network ${name}_default  Created`);
    for (const s of project.services) {
      lines.push(` Container ${name}-${s.name}-1  Created`);
    }
  }
  for (const s of project.services) {
    lines.push(` Container ${name}-${s.name}-1  Started`);
  }

  state.projectUp(name);
  return sse(createDemoSSEStream(buildOutputEvents(lines), 300));
}

export function projectDown(state: DemoState, name: string): Response {
  const project = state.getProject(name);
  if (!project) return jsonError("Project not found", 404);

  const lines = [
    ...project.services.map((s) => ` Container ${name}-${s.name}-1  Stopped`),
    ...project.services.map((s) => ` Container ${name}-${s.name}-1  Removed`),
    ` Network ${name}_default  Removed`,
  ];
  state.projectDown(name);
  return sse(createDemoSSEStream(buildOutputEvents(lines), 300));
}

export function projectPull(state: DemoState, name: string): Response {
  const project = state.getProject(name);
  if (!project) return jsonError("Project not found", 404);

  const lines: string[] = [];
  for (const s of project.services) {
    if (s.image) {
      lines.push(`Pulling ${s.name} (${s.image})...`);
      lines.push(`Digest: sha256:mock...`);
      lines.push(`Status: Image is up to date for ${s.image}`);
      state.clearImageUpdate(s.image);
    }
  }
  return sse(createDemoSSEStream(buildOutputEvents(lines), 400));
}

export function deleteProject(state: DemoState, name: string): Response {
  if (!state.deleteProject(name)) return jsonError("Project not found", 404);
  const events = buildOutputEvents([
    `Stopping containers...`,
    `Removing containers...`,
    `Removing network ${name}_default...`,
    `Project "${name}" deleted`,
  ]);
  return sse(createDemoSSEStream(events, 400));
}


export function projectUpdate(state: DemoState, name: string, body?: { images?: string[] }): Response {
  const project = state.getProject(name);
  if (!project) return jsonError("Project not found", 404);
  if (!Array.isArray(body?.images) || body.images.length === 0) return jsonError("Select images to update", 400);
  const selected = project.services.filter((service) => {
    const info = service.image ? DEMO_UPDATES[service.image] : undefined;
    return service.image && body.images!.includes(service.image) && info
      && !state.clearedImageUpdates.has(service.image)
      && !state.ignoredImageUpdates.get(service.image)?.has(info.latestDigest);
  });
  const images = [...new Set(selected.map((service) => service.image!))];
  const running = selected.filter((service) => service.status === "running" || service.status === "restarting");
  const lines = selected.map((service) => `Pulling ${service.name} (${service.image})...`);
  lines.push(...running.map((service) => `Recreating ${service.name}...`));
  for (const image of images) state.clearImageUpdate(image);
  return sse(createDemoSSEStream([
    ...lines.map((data) => ({ type: "output", data })),
    { type: "done", result: { projectName: name, images, services: selected.map((service) => service.name), restarted: running.length > 0 } },
  ], 100));
}
