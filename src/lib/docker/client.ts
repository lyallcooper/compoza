import Docker from "dockerode";
import type { DistributionInfo } from "@/types";
import { getRegistryCredentials, disableRegistryCredentials, isDockerHub, isGhcr } from "@/lib/registries/credentials";
import { isMockMode } from "@/lib/mock-mode";
import { getCurrentSessionId } from "@/lib/mock-mode/context";
import { getSessionClient } from "@/lib/mock-mode/sessions";

let dockerClient: Docker | null = null;

const DOCKER_TIMEOUT = 30000; // 30 second timeout

export function getDocker(): Docker {
  if (isMockMode()) {
    const sessionId = getCurrentSessionId() ?? "__default__";
    return getSessionClient(sessionId);
  }

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
  if (isMockMode()) return getDocker();
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

export function setDockerClient(client: Docker): void {
  dockerClient = client;
}

/**
 * Get distribution info for an image from the registry.
 * The distribution() method exists on dockerode but is not in @types/dockerode.
 * Uses env var credentials if available.
 */
export async function getImageDistribution(imageName: string): Promise<DistributionInfo> {
  if (isMockMode()) {
    return {
      Descriptor: {
        digest: "sha256:mock-distribution-digest-" + imageName.replace(/[^a-z0-9]/g, ""),
        mediaType: "application/vnd.docker.distribution.manifest.v2+json",
        size: 1234,
      },
      Platforms: [{ architecture: "amd64", os: "linux" }],
    };
  }

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
