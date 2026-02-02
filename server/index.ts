import { createServer } from "http";
import { parse } from "url";
import { config } from "dotenv";
import next from "next";
import { Server as SocketServer } from "socket.io";
import Docker from "dockerode";

// Load .env files (Next.js does this automatically, but our custom server doesn't)
const dotenvDebug = process.env.NODE_ENV === "development";
config({ path: ".env.local", debug: dotenvDebug });
config({ path: ".env", debug: dotenvDebug });

const dev = process.env.NODE_ENV === "development";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

// Update check interval (default: 30 minutes)
const UPDATE_CHECK_INTERVAL = parseInt(process.env.UPDATE_CHECK_INTERVAL || "1800000", 10);
// Timeout for update check - half the interval, minimum 2 minutes
const UPDATE_CHECK_TIMEOUT = Math.max(UPDATE_CHECK_INTERVAL / 2, 120000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Docker client - handle both socket and TCP connections
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

const docker = createDockerClient();

// Track active exec sessions for cleanup
const activeSessions = new Map<string, { exec: Docker.Exec; stream: NodeJS.ReadWriteStream }>();

// Background update checker
let updateCheckInterval: NodeJS.Timeout | null = null;

async function runUpdateCheck() {
  console.log("[Update Check] Starting background update check...");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT);

  try {
    // Trigger the API endpoint which handles the update check
    // This ensures we use the same module instance as the API routes
    const res = await fetch(`http://${hostname}:${port}/api/images/check-updates`, {
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
    const parsedUrl = parse(req.url!, true);
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

    // Handle terminal exec request
    socket.on("exec:start", async (data: { containerId: string; cmd?: string[] }) => {
      const { containerId, cmd = ["/bin/sh"] } = data;

      try {
        const container = docker.getContainer(containerId);

        // Verify container exists and is running
        const info = await container.inspect();
        if (info.State.Status !== "running") {
          socket.emit("exec:error", { message: "Container is not running" });
          return;
        }

        // Create exec instance
        const exec = await container.exec({
          Cmd: cmd,
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Env: ["TERM=xterm-256color"],
        });

        // Start exec and get stream
        const stream = await exec.start({
          hijack: true,
          stdin: true,
          Tty: true,
        });

        currentExec = exec;
        currentStream = stream;

        // Store session for cleanup
        activeSessions.set(socket.id, { exec, stream });

        socket.emit("exec:started");

        // Stream output to client
        stream.on("data", (chunk: Buffer) => {
          socket.emit("exec:data", chunk.toString("utf8"));
        });

        stream.on("end", () => {
          socket.emit("exec:end");
          cleanup();
        });

        stream.on("error", (err: Error) => {
          socket.emit("exec:error", { message: err.message });
          cleanup();
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start exec";
        socket.emit("exec:error", { message });
      }
    });

    // Handle input from client
    socket.on("exec:input", (data: string) => {
      if (currentStream) {
        try {
          currentStream.write(data);
        } catch (error) {
          console.error(`[Socket.io] Error writing to stream:`, error);
          socket.emit("exec:error", { message: "Failed to write to terminal" });
          cleanup();
        }
      }
    });

    // Handle terminal resize
    socket.on("exec:resize", async (data: { cols: number; rows: number }) => {
      if (currentExec) {
        try {
          await currentExec.resize({ h: data.rows, w: data.cols });
        } catch {
          // Resize may fail if exec has ended
        }
      }
    });

    // Cleanup function
    const cleanup = () => {
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
    };

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      cleanup();
    });

    // Handle explicit stop
    socket.on("exec:stop", () => {
      cleanup();
      socket.emit("exec:end");
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);

    // Start background update checker
    startUpdateChecker();
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
