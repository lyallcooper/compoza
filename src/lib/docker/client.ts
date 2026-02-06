import Docker from "dockerode";
import type { DistributionInfo } from "@/types";
import { getRegistryCredentials, disableRegistryCredentials, isDockerHub, isGhcr } from "@/lib/registries/credentials";

let dockerClient: Docker | null = null;

const DOCKER_TIMEOUT = 30000; // 30 second timeout

export function getDocker(): Docker {
  if (!dockerClient) {
    dockerClient = createDockerClient(DOCKER_TIMEOUT);
  }
  return dockerClient;
}

/**
 * Create a Docker client with a longer timeout for slow operations
 * like system prune or build cache cleanup.
 */
export function getDockerLongRunning(): Docker {
  return createDockerClient(300000); // 5 minutes
}

function createDockerClient(timeout: number): Docker {
  const socketPath = process.env.DOCKER_HOST || "/var/run/docker.sock";

  if (socketPath.startsWith("tcp://") || socketPath.startsWith("http://")) {
    const url = new URL(socketPath);
    return new Docker({
      host: url.hostname,
      port: parseInt(url.port, 10) || 2375,
      protocol: url.protocol === "https:" ? "https" : "http",
      timeout,
    });
  }

  return new Docker({ socketPath, timeout });
}

export function resetDockerClient(): void {
  dockerClient = null;
}

/**
 * Get distribution info for an image from the registry.
 * The distribution() method exists on dockerode but is not in @types/dockerode.
 * Uses env var credentials if available.
 */
export async function getImageDistribution(imageName: string): Promise<DistributionInfo> {
  const docker = getDocker();
  const image = docker.getImage(imageName);

  // Type assertion needed because @types/dockerode doesn't include distribution()
  const imageWithDistribution = image as typeof image & {
    distribution: (options?: { authconfig?: { username: string; password: string } }) => Promise<DistributionInfo>;
  };

  const creds = getRegistryCredentials(imageName);
  const authconfig = creds ? { username: creds.username, password: creds.token } : undefined;

  if (authconfig) {
    try {
      return await imageWithDistribution.distribution({ authconfig });
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 401) {
        // Invalid credentials — disable and retry without auth (works for public images)
        if (isDockerHub(imageName)) disableRegistryCredentials("dockerhub");
        else if (isGhcr(imageName)) disableRegistryCredentials("ghcr");
        return imageWithDistribution.distribution();
      }
      throw error;
    }
  }

  return imageWithDistribution.distribution();
}
