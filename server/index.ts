import { createServer } from "http";
import { randomUUID } from "crypto";
import { config } from "dotenv";
import next from "next";
import { Server as SocketServer } from "socket.io";
import Docker from "dockerode";
import { runWithSession } from "../src/lib/mock-mode/context";

// Load .env files (Next.js does this automatically, but our custom server doesn't)
const dev = process.env.NODE_ENV === "development";
config({ path: ".env.local", debug: dev, quiet: !dev });
config({ path: ".env", debug: dev, quiet: !dev });
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const mockMode = process.env.DOCKER_HOST?.startsWith("mock") ?? false;

const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes
// Timeout for update check - half the interval, minimum 2 minutes
const UPDATE_CHECK_TIMEOUT = Math.max(UPDATE_CHECK_INTERVAL / 2, 120000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Docker client - handle both socket and TCP connections
// Note: similar factory exists in src/lib/docker/client.ts for the Next.js API routes.
// Duplicated because the server and src use different TS module systems.
function createDockerClient(): Docker {
  const dockerHost = process.env.DOCKER_HOST || "/var/run/docker.sock";
  console.log(`[Docker] Connecting to: ${dockerHost}`);

  if (dockerHost.startsWith("tcp://") || dockerHost.startsWith("http://")) {
    const url = new URL(dockerHost);
    console.log(`[Docker] Using TCP connection: ${url.hostname}:${url.port || 2375}`);
    return new Docker({
      host: url.hostname,
      port: parseInt(url.port, 10) || 2375,
      protocol: url.protocol === "https:" ? "https" : "http",
    });
  }

  console.log(`[Docker] Using socket: ${dockerHost}`);
  return new Docker({ socketPath: dockerHost });
}

const docker = mockMode ? null! as Docker : createDockerClient();

if (mockMode) {
  console.log("[Mock Mode] Running with mock Docker backend — no real Docker needed");
}

// --- Mock mode rate limiting (inline, uses globalThis for cross-module sharing) ---
const RATE_LIMIT_KEY = Symbol.for("compoza:demo-rate-limits");
interface RateLimitEntry { timestamps: number[] }

function getDemoRateLimits(): Map<string, RateLimitEntry> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[RATE_LIMIT_KEY]) g[RATE_LIMIT_KEY] = new Map<string, RateLimitEntry>();
  return g[RATE_LIMIT_KEY] as Map<string, RateLimitEntry>;
}

function checkDemoRateLimit(sessionId: string): boolean {
  const limits = getDemoRateLimits();
  let entry = limits.get(sessionId);
  if (!entry) {
    entry = { timestamps: [] };
    limits.set(sessionId, entry);
  }
  const now = Date.now();
  const cutoff = now - 60_000; // 1 minute window
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);
  if (entry.timestamps.length >= 120) return false; // exceeded
  entry.timestamps.push(now);
  return true;
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

// Track active exec sessions for cleanup
const activeSessions = new Map<string, { exec: Docker.Exec; stream: NodeJS.ReadWriteStream }>();

// Session inactivity timeout (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;


// Background update checker
let updateCheckInterval: NodeJS.Timeout | null = null;

async function runUpdateCheck() {
  console.log("[Update Check] Starting background update check...");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT);

  try {
    // Trigger the API endpoint which handles the update check
    // This ensures we use the same module instance as the API routes
    // Use localhost for self-fetch (hostname is the bind address, e.g., 0.0.0.0)
    const res = await fetch(`http://localhost:${port}/api/images/check-updates`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }
    const data = await res.json();
    const updates = data.data || [];
    const updatesAvailable = updates.filter((r: { updateAvailable: boolean }) => r.updateAvailable).length;
    console.log(`[Update Check] Complete. ${updates.length} images checked, ${updatesAvailable} updates available.`);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[Update Check] Timed out after ${UPDATE_CHECK_TIMEOUT / 1000} seconds`);
    } else {
      console.error("[Update Check] Error:", error);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function startUpdateChecker() {
  // Run immediately on startup (after a short delay to let things initialize)
  setTimeout(() => {
    runUpdateCheck();
  }, 10000); // 10 second delay

  // Then run on interval
  updateCheckInterval = setInterval(runUpdateCheck, UPDATE_CHECK_INTERVAL);
  console.log(`[Update Check] Scheduled to run every ${UPDATE_CHECK_INTERVAL / 1000 / 60} minutes`);
}

function stopUpdateChecker() {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Parse URL path and query (req.url is path only, not full URL)
    const url = new URL(req.url!, "http://localhost");
    const query: Record<string, string | string[]> = {};
    url.searchParams.forEach((value, key) => {
      const existing = query[key];
      if (existing) {
        query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        query[key] = value;
      }
    });
    const parsedUrl = {
      pathname: url.pathname,
      query,
      search: url.search || null,
      path: req.url!,
    } as Parameters<typeof handle>[2];

    if (mockMode) {
      // Parse or generate demo-session cookie
      let sessionId = parseCookie(req.headers.cookie, "demo-session");
      if (!sessionId) {
        sessionId = randomUUID();
        res.setHeader("Set-Cookie", `demo-session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
      }

      // Rate limit check
      if (!checkDemoRateLimit(sessionId)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Rate limit exceeded" }));
        return;
      }

      // Wrap Next.js handler in session context
      runWithSession(sessionId, () => {
        handle(req, res, parsedUrl);
      });
      return;
    }

    handle(req, res, parsedUrl);
  });

  // Socket.io server
  const io = new SocketServer(httpServer, {
    path: "/socket.io",
    pingInterval: 25000,
    pingTimeout: 60000,
    cors: {
      origin: dev ? "*" : undefined,
    },
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    let currentExec: Docker.Exec | null = null;
    let currentStream: NodeJS.ReadWriteStream | null = null;
    let isStarting = false;
    let sessionTimeoutId: NodeJS.Timeout | null = null;

    // Reset session inactivity timeout
    const resetSessionTimeout = () => {
      if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
      sessionTimeoutId = setTimeout(() => {
        console.log(`[Socket.io] Session timeout for ${socket.id}`);
        socket.emit("exec:error", { message: "Session timeout due to inactivity" });
        cleanup("inactivity timeout");
      }, SESSION_TIMEOUT);
    };

    // Cleanup function
    const cleanup = (reason: string = "unknown") => {
      if (sessionTimeoutId) {
        clearTimeout(sessionTimeoutId);
        sessionTimeoutId = null;
      }
      if (currentStream) {
        try {
          currentStream.end();
        } catch {
          // Stream may already be closed
        }
        currentStream = null;
      }
      currentExec = null;
      activeSessions.delete(socket.id);
      if (reason !== "unknown") {
        console.log(`[Socket.io] Session cleaned up for ${socket.id}: ${reason}`);
      }
    };

    // Run a probe command and return its exit code (or -1 on error/timeout)
    const probeExec = async (container: Docker.Container, cmd: string[]): Promise<number> => {
      try {
        const exec = await container.exec({
          Cmd: cmd,
          AttachStdout: false,
          AttachStderr: false,
        });

        await exec.start({});

        // Poll for completion with timeout
        const timeout = Date.now() + 5000;
        while (Date.now() < timeout) {
          const info = await exec.inspect();
          if (!info.Running) {
            return info.ExitCode ?? -1;
          }
          await new Promise((r) => setTimeout(r, 50));
        }
        return -1; // timeout
      } catch {
        return -1; // error
      }
    };

    // Detect which shell is available in the container
    const detectShell = async (container: Docker.Container): Promise<string | null> => {
      // Use sh to check if bash exists
      const exitCode = await probeExec(container, ["/bin/sh", "-c", "test -x /bin/bash"]);

      if (exitCode === 0) {
        return "/bin/bash";
      } else if (exitCode === 1) {
        // sh works but bash doesn't exist
        return "/bin/sh";
      } else {
        // sh failed, try bash directly as last resort
        const bashCode = await probeExec(container, ["/bin/bash", "-c", "exit 0"]);
        return bashCode === 0 ? "/bin/bash" : null;
      }
    };

    // Start an interactive exec session
    const startExec = async (
      container: Docker.Container,
      cmd: string[]
    ): Promise<{ exec: Docker.Exec; stream: NodeJS.ReadWriteStream }> => {
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Env: ["TERM=xterm-256color"],
      });

      const stream = await exec.start({
        hijack: true,
        stdin: true,
        Tty: true,
      });

      return { exec, stream };
    };

    // Handle terminal exec request
    socket.on("exec:start", async (data: { containerId: string; cmd?: string[] }) => {
      // Terminal is not available in mock/demo mode
      if (mockMode) {
        socket.emit("exec:error", { message: "Terminal is not available in demo mode" });
        return;
      }

      // Prevent overlapping exec:start calls
      if (isStarting) {
        socket.emit("exec:error", { message: "Session already starting" });
        return;
      }

      // Clean up any existing session first
      if (currentExec || currentStream) {
        cleanup("new session requested");
      }

      isStarting = true;
      const { containerId, cmd } = data;

      try {
        const container = docker.getContainer(containerId);

        // Verify container exists and is running
        const info = await container.inspect();
        if (info.State.Status !== "running") {
          socket.emit("exec:error", { message: "Container is not running" });
          return;
        }

        let shellUsed: string | null;

        if (cmd) {
          // User specified a command, use it directly
          shellUsed = cmd[0];
        } else {
          // Detect available shell
          shellUsed = await detectShell(container);

          if (!shellUsed) {
            socket.emit("exec:error", {
              message: "No shell available in container",
            });
            return;
          }
        }

        // Start the interactive session
        let result: { exec: Docker.Exec; stream: NodeJS.ReadWriteStream };
        try {
          result = await startExec(container, cmd || [shellUsed]);
        } catch (error) {
          socket.emit("exec:error", {
            message: `Failed to start: ${String(error)}`,
          });
          return;
        }

        const { exec, stream } = result;
        currentExec = exec;
        currentStream = stream;

        // Store session for cleanup
        activeSessions.set(socket.id, { exec, stream });

        // Start session timeout
        resetSessionTimeout();

        socket.emit("exec:started", { shell: shellUsed });

        // Stream output to client
        stream.on("data", (chunk: Buffer) => {
          socket.emit("exec:data", chunk.toString("utf8"));
        });

        stream.on("end", () => {
          socket.emit("exec:end");
          cleanup("stream ended");
        });

        stream.on("error", (err: Error) => {
          socket.emit("exec:error", { message: err.message });
          cleanup("stream error");
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start exec";
        socket.emit("exec:error", { message });
      } finally {
        isStarting = false;
      }
    });

    // Handle input from client
    socket.on("exec:input", (data: string) => {
      if (currentStream) {
        // Reset timeout on activity
        resetSessionTimeout();
        try {
          currentStream.write(data);
        } catch (error) {
          console.error(`[Socket.io] Error writing to stream:`, error);
          socket.emit("exec:error", { message: "Failed to write to terminal" });
          cleanup("write error");
        }
      }
    });

    // Handle terminal resize
    socket.on("exec:resize", async (data: { cols: number; rows: number }) => {
      if (currentExec) {
        // Reset timeout on activity
        resetSessionTimeout();
        try {
          await currentExec.resize({ h: data.rows, w: data.cols });
        } catch {
          // Resize may fail if exec has ended
        }
      }
    });

    // Handle keepalive ping from client
    socket.on("exec:ping", () => {
      if (currentExec) {
        resetSessionTimeout();
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      cleanup("client disconnected");
    });

    // Handle explicit stop
    socket.on("exec:stop", () => {
      cleanup("explicit stop");
      socket.emit("exec:end");
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);

    // Start background update checker (skip in mock mode — no real registry to query)
    if (!mockMode) {
      startUpdateChecker();
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("Shutting down...");

    // Stop update checker
    stopUpdateChecker();

    // Clean up all active sessions
    for (const [socketId, session] of activeSessions) {
      try {
        session.stream.end();
      } catch {
        // Ignore errors during cleanup
      }
      activeSessions.delete(socketId);
    }

    io.close();
    httpServer.close(() => {
      process.exit(0);
    });
  };

  // Remove existing listeners to avoid leaks during hot reload
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
});
