import type Docker from "dockerode";
import type { DockerState } from "@/test/mock-docker/state";
import { createMockDocker } from "@/test/mock-docker/mock-dockerode";
import { createDemoState } from "./demo-state";

interface Session {
  state: DockerState;
  client: Docker;
  lastAccess: number;
}

const MAX_SESSIONS = 100;
const SESSION_TTL = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 60 seconds

// Per-session state size caps
const MAX_CONTAINERS = 50;
const MAX_IMAGES = 50;
const MAX_NETWORKS = 20;
const MAX_VOLUMES = 20;

// Use globalThis so the session store survives Next.js HMR reloads
const SESSIONS_KEY = Symbol.for("compoza:demo-sessions");
const CLEANUP_KEY = Symbol.for("compoza:demo-cleanup");

function getSessions(): Map<string, Session> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[SESSIONS_KEY]) {
    g[SESSIONS_KEY] = new Map<string, Session>();
  }
  return g[SESSIONS_KEY] as Map<string, Session>;
}

function startCleanup() {
  const g = globalThis as Record<symbol, unknown>;
  if (g[CLEANUP_KEY]) return;

  const timer = setInterval(() => {
    const sessions = getSessions();
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastAccess > SESSION_TTL) {
        sessions.delete(id);
      }
    }
  }, CLEANUP_INTERVAL);
  timer.unref();
  g[CLEANUP_KEY] = timer;
}

function evictLRU() {
  const sessions = getSessions();
  let oldest: string | null = null;
  let oldestTime = Infinity;
  for (const [id, session] of sessions) {
    if (session.lastAccess < oldestTime) {
      oldestTime = session.lastAccess;
      oldest = id;
    }
  }
  if (oldest) sessions.delete(oldest);
}

function createSession(): Session {
  const state = createDemoState();
  enforceSizeCaps(state);
  const client = createMockDocker(state);
  return {
    state,
    client,
    lastAccess: Date.now(),
  };
}

/** Wrap a DockerState to enforce size caps on mutations. */
function enforceSizeCaps(state: DockerState): void {
  const originalContainersSet = state.containers.set.bind(state.containers);
  state.containers.set = (key, value) => {
    if (!state.containers.has(key) && state.containers.size >= MAX_CONTAINERS) {
      throw Object.assign(new Error("Demo session container limit reached"), { statusCode: 400 });
    }
    return originalContainersSet(key, value);
  };

  const originalImagesSet = state.images.set.bind(state.images);
  state.images.set = (key, value) => {
    if (!state.images.has(key) && state.images.size >= MAX_IMAGES) {
      throw Object.assign(new Error("Demo session image limit reached"), { statusCode: 400 });
    }
    return originalImagesSet(key, value);
  };

  const originalNetworksSet = state.networks.set.bind(state.networks);
  state.networks.set = (key, value) => {
    if (!state.networks.has(key) && state.networks.size >= MAX_NETWORKS) {
      throw Object.assign(new Error("Demo session network limit reached"), { statusCode: 400 });
    }
    return originalNetworksSet(key, value);
  };

  const originalVolumesSet = state.volumes.set.bind(state.volumes);
  state.volumes.set = (key, value) => {
    if (!state.volumes.has(key) && state.volumes.size >= MAX_VOLUMES) {
      throw Object.assign(new Error("Demo session volume limit reached"), { statusCode: 400 });
    }
    return originalVolumesSet(key, value);
  };
}

export function getSessionClient(sessionId: string): Docker {
  startCleanup();
  const sessions = getSessions();

  let session = sessions.get(sessionId);
  if (!session) {
    if (sessions.size >= MAX_SESSIONS) {
      evictLRU();
    }
    session = createSession();
    sessions.set(sessionId, session);
  }

  session.lastAccess = Date.now();
  return session.client;
}
