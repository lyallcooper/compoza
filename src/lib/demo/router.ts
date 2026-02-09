import { getDemoState } from "./index";
import * as containers from "./handlers/containers";
import * as projects from "./handlers/projects";
import * as composeOps from "./handlers/compose-ops";
import * as images from "./handlers/images";
import * as volumes from "./handlers/volumes";
import * as networks from "./handlers/networks";
import * as system from "./handlers/system";
import * as logs from "./handlers/logs";

/** Simulate Docker latency for mutation operations */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Return a JSON response after a simulated delay */
async function delayed(response: Response, ms = 300): Promise<Response> {
  await delay(ms);
  return response;
}

/**
 * Route a demo-mode request to the appropriate handler.
 * Returns a Response (JSON or SSE stream) matching the real API contract.
 */
export async function demoRoute(url: string, init?: RequestInit): Promise<Response> {
  const parsedUrl = new URL(url, "http://localhost");
  const path = parsedUrl.pathname;
  const method = init?.method?.toUpperCase() ?? "GET";
  const state = getDemoState();

  const body = init?.body ? JSON.parse(init.body as string) : undefined;

  // --- Health ---
  if (path === "/api/health") return system.health();

  // --- Containers ---
  if (path === "/api/containers" && method === "GET") return containers.listContainers(state);
  if (path === "/api/containers/prune" && method === "POST") return delayed(containers.pruneContainers(state), 1500);

  const containerMatch = path.match(/^\/api\/containers\/([a-zA-Z0-9_.-]+)(?:\/(.+))?$/);
  if (containerMatch) {
    const [, id, action] = containerMatch;
    if (!action && method === "GET") return containers.getContainer(state, id);
    if (!action && method === "DELETE") return delayed(containers.removeContainer(state, id, body?.force), 800);
    if (action === "start" && method === "POST") return delayed(containers.startContainer(state, id), 800);
    if (action === "stop" && method === "POST") return delayed(containers.stopContainer(state, id), 1200);
    if (action === "restart" && method === "POST") return delayed(containers.restartContainer(state, id), 1500);
    if (action === "stats" && method === "GET") return containers.containerStats(state, id);
    if (action === "logs" && method === "GET") return logs.containerLogs(state, id);
    if (action === "update" && method === "POST") return containers.updateContainer(state, id);
  }

  // --- Images ---
  if (path === "/api/images" && method === "GET") return images.listImages(state);
  if (path === "/api/images/pull" && method === "POST") return images.pullImage(state, body);
  if (path === "/api/images/prune" && method === "POST") return delayed(images.pruneImages(state), 1500);
  if (path === "/api/images/check-updates" && method === "GET") return images.checkUpdatesGet(state);
  if (path === "/api/images/check-updates" && method === "POST") return images.checkUpdatesPost(state, body ?? {});
  if (path === "/api/images/check-updates" && method === "DELETE") return delayed(images.checkUpdatesDelete(state, body), 200);

  const imageMatch = path.match(/^\/api\/images\/(.+)$/);
  if (imageMatch && !["pull", "prune", "check-updates"].includes(imageMatch[1])) {
    const id = decodeURIComponent(imageMatch[1]);
    if (method === "GET") return images.getImage(state, id);
    if (method === "DELETE") return delayed(images.deleteImage(state, id), 800);
  }

  // --- Projects ---
  if (path === "/api/projects" && method === "GET") return projects.listProjects(state);
  if (path === "/api/projects" && method === "POST") return delayed(projects.createProject(state, body));

  const projectMatch = path.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)(?:\/(.+))?$/);
  if (projectMatch) {
    const [, name, action] = projectMatch;
    if (!action && method === "GET") return projects.getProject(state, name);
    if (!action && method === "DELETE") return composeOps.deleteProject(state, name);
    if (action === "compose" && method === "GET") return projects.readComposeFile(state, name);
    if (action === "compose" && method === "PUT") return projects.writeComposeFile(state, name, body);
    if (action === "env" && method === "GET") return projects.readEnvFile(state, name);
    if (action === "env" && method === "PUT") return projects.writeEnvFile(state, name, body);
    if (action === "up" && method === "POST") return composeOps.projectUp(state, name);
    if (action === "down" && method === "POST") return composeOps.projectDown(state, name);
    if (action === "pull" && method === "POST") return composeOps.projectPull(state, name);
    if (action === "logs" && method === "GET") {
      const service = parsedUrl.searchParams.get("service") ?? undefined;
      return logs.projectLogs(state, name, service);
    }
  }

  // --- Volumes ---
  if (path === "/api/volumes" && method === "GET") return volumes.listVolumes(state);
  if (path === "/api/volumes" && method === "POST") return delayed(volumes.createVolume(state, body));
  if (path === "/api/volumes/prune" && method === "POST") return delayed(volumes.pruneVolumes(state), 1500);

  const volumeMatch = path.match(/^\/api\/volumes\/([a-zA-Z0-9_.-]+)$/);
  if (volumeMatch && volumeMatch[1] !== "prune") {
    const name = volumeMatch[1];
    if (method === "GET") return volumes.getVolume(state, name);
    if (method === "DELETE") return delayed(volumes.deleteVolume(state, name));
  }

  // --- Networks ---
  if (path === "/api/networks" && method === "GET") return networks.listNetworks(state);
  if (path === "/api/networks" && method === "POST") return delayed(networks.createNetwork(state, body));
  if (path === "/api/networks/prune" && method === "POST") return delayed(networks.pruneNetworks(state), 1200);

  const networkMatch = path.match(/^\/api\/networks\/([a-zA-Z0-9_.-]+)$/);
  if (networkMatch && networkMatch[1] !== "prune") {
    const name = networkMatch[1];
    if (method === "GET") return networks.getNetwork(state, name);
    if (method === "DELETE") return delayed(networks.deleteNetwork(state, name));
  }

  // --- System ---
  if (path === "/api/system/info" && method === "GET") return system.systemInfo(state);
  if (path === "/api/system/disk-usage" && method === "GET") return system.diskUsage(state);
  if (path === "/api/system/prune" && method === "POST") return system.systemPrune(state, body ?? {});
  if (path === "/api/self-update" && method === "POST") return system.selfUpdate();

  // Fallback
  return new Response(JSON.stringify({ error: `Demo: unhandled route ${method} ${path}` }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Demo fetch for JSON endpoints — parses the Response as ApiResponse<T>.
 * Drop-in replacement for the real fetch in apiFetch().
 */
export async function demoFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await demoRoute(url, init);
  const json = await response.json();

  // Error may be at top level or nested under data (handlers wrap all responses in { data })
  const error = json.error || json.data?.error;
  if (!response.ok || error) throw new Error(error || `HTTP error: ${response.status}`);
  return json.data as T;
}

/**
 * Demo fetch returning a raw Response — used by SSE consumers
 * that need to read the body as a stream.
 */
export async function demoFetchRaw(url: string, init?: RequestInit): Promise<Response> {
  const response = await demoRoute(url, init);

  // For SSE error responses, throw like the real fetch path would
  if (!response.ok && response.headers.get("Content-Type")?.includes("json")) {
    const json = await response.json();
    throw new Error(json.error || json.data?.error || `HTTP error: ${response.status}`);
  }

  return response;
}
