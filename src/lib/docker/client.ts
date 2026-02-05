import Docker from "dockerode";
import type { DistributionInfo } from "@/types";
import { getRegistryCredentials } from "@/lib/registries/credentials";

let dockerClient: Docker | null = null;

const DOCKER_TIMEOUT = 30000; // 30 second timeout

export function getDocker(): Docker {
  if (!dockerClient) {
    const socketPath = process.env.DOCKER_HOST || "/var/run/docker.sock";

    if (socketPath.startsWith("tcp://") || socketPath.startsWith("http://")) {
      const url = new URL(socketPath);
      dockerClient = new Docker({
        host: url.hostname,
        port: parseInt(url.port, 10) || 2375,
        protocol: url.protocol === "https:" ? "https" : "http",
        timeout: DOCKER_TIMEOUT,
      });
    } else {
      dockerClient = new Docker({
        socketPath,
        timeout: DOCKER_TIMEOUT,
      });
    }
  }
  return dockerClient;
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
  return imageWithDistribution.distribution(authconfig ? { authconfig } : undefined);
}
