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

    // Step 3: Spawn updater container
    try {
      await spawnUpdaterContainer(canAutoRestart.projectName!, canAutoRestart.composeFile!);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.updates.error("Failed to spawn updater container", error);
      return {
        success: true,
        message: `Image pulled. Restart manually: ${msg}`,
      };
    }

    return {
      success: true,
      message: "Update initiated. Restarting...",
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
 * Exported for use by compose.ts when updating Compoza via the update-all route.
 */
export async function spawnUpdaterContainer(
  projectName: string,
  composeFile: string
): Promise<void> {
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

  // Create the updater container
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
      AutoRemove: true,
      Binds: binds,
      NetworkMode: networkMode,
    },
    NetworkingConfig: endpointsConfig ? { EndpointsConfig: endpointsConfig } : undefined,
    name: `compoza-updater-${Date.now()}`,
  });

  await container.start();
  log.updates.info("Updater container started", { containerId: container.id });
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

