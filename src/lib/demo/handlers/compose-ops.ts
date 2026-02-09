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

