import { pullLatestImage } from "./pull";
import { getDocker, getSelfProjectName } from "@/lib/docker";
import { getProject, getHostProjectsDir, toHostPath } from "@/lib/projects/scanner";
import { log } from "@/lib/logger";

export interface SelfUpdateResult {
  success: boolean;
  message: string;
}

/**
 * The Docker CLI image to use for running compose commands.
 * This image includes the compose plugin.
 */
const DOCKER_CLI_IMAGE = "docker:cli";

/**
 * Update the Compoza container itself by pulling the latest image
 * and spawning an external updater container to run compose up.
 *
 * The updater container runs independently from Compoza, so it survives
 * when Compoza's container is recreated during the update.
 */
export async function selfUpdate(): Promise<SelfUpdateResult> {
  const imageName = process.env.COMPOZA_IMAGE || "compoza:latest";

  try {
    // Step 1: Pull the new image
    await pullLatestImage(imageName);

    // Step 2: Check if auto-restart is possible
    const canAutoRestart = await checkAutoRestartPossible();
    if (!canAutoRestart.possible) {
      return {
        success: true,
        message: `Image pulled. ${canAutoRestart.reason}`,
      };
    }

    // Step 3: Spawn updater container and wait for result
    try {
      const result = await spawnUpdaterContainer(canAutoRestart.projectName!, canAutoRestart.composeFile!);
      if (!result.success) {
        log.updates.error("Self-update failed", { output: result.output });
        return {
          success: false,
          message: `Update failed: ${result.output.slice(0, 200)}`,
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.updates.error("Failed to spawn updater container", error);
      return {
        success: true, // Image was pulled
        message: `Image pulled. Restart manually: ${msg}`,
      };
    }

    return {
      success: true,
      message: "Update complete. Restarting...",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update",
    };
  }
}

interface AutoRestartCheck {
  possible: boolean;
  reason?: string;
  projectName?: string;
  composeFile?: string;
}

/**
 * Check if automatic restart via updater container is possible.
 */
async function checkAutoRestartPossible(): Promise<AutoRestartCheck> {
  // Check 1: Need to detect our compose project
  const projectName = await getSelfProjectName();
  if (!projectName) {
    return {
      possible: false,
      reason: "Restart manually (not running in Docker Compose).",
    };
  }

  // Check 2: Need to find our project's compose file
  const project = await getProject(projectName);
  if (!project) {
    return {
      possible: false,
      reason: "Restart manually (compose project not found).",
    };
  }

  return {
    possible: true,
    projectName,
    composeFile: project.composeFile,
  };
}

/**
 * Spawn a temporary container that runs `docker compose up -d` for the given project.
 * This container runs independently from Compoza, so it survives when Compoza is recreated.
 *
 * Waits for the container to finish and captures its output. If the compose command
 * succeeds and recreates Compoza, this function may never return (we get killed).
 *
 * Exported for use by compose.ts when updating Compoza via the update-all route.
 */
export async function spawnUpdaterContainer(
  projectName: string,
  composeFile: string
): Promise<{ success: boolean; output: string }> {
  const docker = getDocker();

  // Convert paths to host paths for the updater container
  const hostComposeFile = toHostPath(composeFile);
  const hostProjectDir = toHostPath(composeFile.substring(0, composeFile.lastIndexOf("/")));
  const hostProjectsDir = getHostProjectsDir();
  const dockerSocket = process.env.DOCKER_HOST || "/var/run/docker.sock";
  const isUnixSocket = !dockerSocket.startsWith("tcp://") && !dockerSocket.startsWith("http://");

  log.updates.info("Spawning updater container", {
    projectName,
    hostComposeFile,
    hostProjectDir,
    isUnixSocket,
  });

  // Ensure the Docker CLI image is available
  try {
    await docker.getImage(DOCKER_CLI_IMAGE).inspect();
  } catch {
    log.updates.info("Pulling Docker CLI image", { image: DOCKER_CLI_IMAGE });
    await pullLatestImage(DOCKER_CLI_IMAGE);
  }

  // Build container configuration
  const binds = [`${hostProjectsDir}:${hostProjectsDir}:ro`];
  const env: string[] = [];
  let networkMode: string | undefined;
  let endpointsConfig: Record<string, object> | undefined;

  if (isUnixSocket) {
    // Unix socket: mount it directly
    binds.push(`${dockerSocket}:${dockerSocket}`);
  } else {
    // TCP socket: need to be on same network(s) as Compoza to reach the proxy
    env.push(`DOCKER_HOST=${dockerSocket}`);

    const networks = await getSelfNetworks(docker);
    if (networks.length > 0) {
      // Connect to all of Compoza's networks so we can reach the proxy
      networkMode = networks[0];
      endpointsConfig = Object.fromEntries(networks.map(name => [name, {}]));
      log.updates.info("Updater will join networks", { networks });
    }
  }

  // Create the updater container (without AutoRemove so we can read logs)
  const container = await docker.createContainer({
    Image: DOCKER_CLI_IMAGE,
    Cmd: [
      "docker", "compose",
      "-f", hostComposeFile,
      "--project-directory", hostProjectDir,
      "up", "-d", "--force-recreate",
    ],
    Env: env.length > 0 ? env : undefined,
    HostConfig: {
      AutoRemove: false,
      Binds: binds,
      NetworkMode: networkMode,
    },
    NetworkingConfig: endpointsConfig ? { EndpointsConfig: endpointsConfig } : undefined,
    name: `compoza-updater-${Date.now()}`,
  });

  log.updates.info("Starting updater container", {
    containerId: container.id,
    hostComposeFile,
    hostProjectDir,
    binds,
  });

  await container.start();

  // Wait for container to finish (with timeout)
  const TIMEOUT_MS = 30000; // 30 seconds
  try {
    const waitPromise = container.wait();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Updater timed out")), TIMEOUT_MS)
    );

    const result = await Promise.race([waitPromise, timeoutPromise]) as { StatusCode: number };

    // Get container logs
    const logs = await container.logs({ stdout: true, stderr: true });
    const output = demuxDockerLogs(logs as Buffer);

    // Remove container
    try {
      await container.remove();
    } catch {
      // Ignore removal errors
    }

    log.updates.info("Updater container finished", {
      exitCode: result.StatusCode,
      output: output.slice(0, 1000),
    });

    if (result.StatusCode !== 0) {
      return {
        success: false,
        output: output || `Exit code: ${result.StatusCode}`,
      };
    }

    return { success: true, output };
  } catch (err) {
    // Timeout or other error - try to get logs and clean up
    try {
      const logs = await container.logs({ stdout: true, stderr: true });
      const output = demuxDockerLogs(logs as Buffer);
      log.updates.error("Updater error", { error: err, output });
      await container.remove({ force: true });
      return { success: false, output: output || String(err) };
    } catch {
      return { success: false, output: String(err) };
    }
  }
}

/**
 * Demultiplex Docker log stream (which has an 8-byte header per chunk).
 * Docker's multiplexed stream format: [8-byte header][payload]
 * Header: [stream type (1 byte)][0 0 0][size (4 bytes big-endian)]
 */
function demuxDockerLogs(buffer: Buffer): string {
  const lines: string[] = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset + 4);
    if (offset + 8 + size > buffer.length) break;
    lines.push(buffer.subarray(offset + 8, offset + 8 + size).toString("utf8"));
    offset += 8 + size;
  }
  return lines.join("").trim();
}

/**
 * Get the Docker networks that Compoza is connected to.
 */
async function getSelfNetworks(docker: ReturnType<typeof getDocker>): Promise<string[]> {
  try {
    const containerId = process.env.HOSTNAME;
    if (!containerId) {
      return [];
    }

    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    const networks = info.NetworkSettings?.Networks;

    if (!networks) {
      return [];
    }

    // Return network names, excluding special networks
    return Object.keys(networks).filter(
      name => name !== "host" && name !== "none" && name !== "bridge"
    );
  } catch (error) {
    log.updates.warn("Failed to get container networks", { error });
    return [];
  }
}

