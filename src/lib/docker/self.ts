import { readFile } from "fs/promises";
import { hostname } from "os";
import { getDocker } from "./client";

// Cache the detected project name and image name
let selfProjectName: string | null = null;
let selfImageName: string | null = null;
let detectionAttempted = false;

/**
 * Detect the Docker Compose project name we're running as.
 * Returns null if not running in Docker or detection fails.
 */
export async function getSelfProjectName(): Promise<string | null> {
  // Return cached result if we've already tried detection
  if (detectionAttempted) {
    return selfProjectName;
  }
  detectionAttempted = true;

  try {
    // Check if we're running in Docker by looking for /.dockerenv
    try {
      await readFile("/.dockerenv");
    } catch {
      // Not running in Docker
      return null;
    }

    // Get our container ID from cgroup, mountinfo, or hostname
    const containerId = await getOwnContainerId();
    if (!containerId) {
      return null;
    }

    // Query Docker API to get our container's compose project label
    const docker = getDocker();
    const container = docker.getContainer(containerId);
    const info = await container.inspect();

    // Cache image name from the same inspect call
    if (info.Config?.Image) {
      selfImageName = info.Config.Image;
    }

    // Docker Compose sets this label on all containers it manages
    const projectName = info.Config?.Labels?.["com.docker.compose.project"];
    if (projectName) {
      selfProjectName = projectName;
      return projectName;
    }

    return null;
  } catch {
    // Detection failed - not critical, just means auto-restart won't work
    return null;
  }
}

/**
 * Get the image name of the running Compoza container (e.g., "ghcr.io/lyallcooper/compoza:latest").
 * Must be called after getSelfProjectName() which populates the cache.
 */
export function getSelfImageName(): string | null {
  return selfImageName;
}

/**
 * Get our own container ID by reading from cgroup, mountinfo, or hostname.
 * Returns the container ID or name that can be used with Docker API.
 */
export async function getOwnContainerId(): Promise<string | null> {
  // Try to get container ID from /proc/self/cgroup (works in most Docker setups)
  try {
    const cgroup = await readFile("/proc/self/cgroup", "utf8");
    // Look for docker container ID in cgroup paths
    // Format varies but usually contains /docker/<container-id>
    const match = cgroup.match(/[0-9a-f]{64}/);
    if (match) {
      return match[0];
    }
  } catch {
    // cgroup not available
  }

  // Try to get from /proc/self/mountinfo (cgroupv2)
  // This handles both /docker/containers/<id> and /docker/<id> patterns
  try {
    const mountinfo = await readFile("/proc/self/mountinfo", "utf8");
    // Try /docker/containers/<id> first (more specific)
    let match = mountinfo.match(/\/docker\/containers\/([0-9a-f]{64})/);
    if (match) {
      return match[1];
    }
    // Fall back to /docker/<id> pattern
    match = mountinfo.match(/\/docker\/([0-9a-f]{64})/);
    if (match) {
      return match[1];
    }
  } catch {
    // mountinfo not available
  }

  // Fall back to hostname - Docker API accepts container names too
  // When container_name is set in compose, hostname defaults to the container name
  const hn = hostname();
  if (hn) {
    return hn;
  }

  return null;
}
