import type { DemoState } from "../state";
import { json } from "../response";

export function listProjects(state: DemoState): Response {
  return json(state.listProjects());
}

export function getProject(state: DemoState, name: string): Response {
  const p = state.getProject(name);
  if (!p) return json({ error: "Project not found" }, 404);
  return json(p);
}

export function createProject(state: DemoState, body: { name: string; composeContent: string; envContent?: string }): Response {
  if (!body.name || !body.composeContent) return json({ error: "Name and compose content required" }, 400);
  if (state.composeFiles[body.name]) return json({ error: "Project already exists" }, 409);
  state.createProject(body.name, body.composeContent, body.envContent);
  return json({ message: `Project "${body.name}" created` }, 201);
}

export function readComposeFile(state: DemoState, name: string): Response {
  const content = state.composeFiles[name];
  if (content === undefined) return json({ error: "Project not found" }, 404);
  return json({ content });
}

export function writeComposeFile(state: DemoState, name: string, body: { content: string }): Response {
  if (!state.composeFiles[name]) return json({ error: "Project not found" }, 404);
  state.composeFiles[name] = body.content;
  return json({ message: "Compose file saved" });
}

export function readEnvFile(state: DemoState, name: string): Response {
  return json({ content: state.envFiles[name] ?? "" });
}

export function writeEnvFile(state: DemoState, name: string, body: { content: string }): Response {
  state.envFiles[name] = body.content;
  return json({ message: "Env file saved" });
}

