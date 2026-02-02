import Docker from "dockerode";
import type { DistributionInfo } from "@/types";

let dockerClient: Docker | null = null;

export function getDocker(): Docker {
  if (!dockerClient) {
    const socketPath = process.env.DOCKER_HOST || "/var/run/docker.sock";

    if (socketPath.startsWith("tcp://") || socketPath.startsWith("http://")) {
      const url = new URL(socketPath);
      dockerClient = new Docker({
        host: url.hostname,
        port: parseInt(url.port, 10) || 2375,
        protocol: url.protocol === "https:" ? "https" : "http",
      });
    } else {
      dockerClient = new Docker({ socketPath });
    }
  }
  return dockerClient;
}

export function resetDockerClient(): void {
  dockerClient = null;
}

/**
 * Get registry credentials from environment variables.
 * Returns auth config for Docker API calls.
 */
function getRegistryAuth(imageName: string): { username: string; password: string } | null {
  // Parse registry from image name
  const isDockerHub = !imageName.includes("/") ||
    (!imageName.split("/")[0].includes(".") && !imageName.split("/")[0].includes(":"));
  const isGhcr = imageName.startsWith("ghcr.io/");

  if (isDockerHub) {
    const username = process.env.DOCKERHUB_USERNAME;
    const password = process.env.DOCKERHUB_TOKEN;
    if (username && password) {
      return { username, password };
    }
  }

  if (isGhcr) {
    const token = process.env.GHCR_TOKEN;
    if (token) {
      return { username: "token", password: token };
    }
  }

  return null;
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

  const authconfig = getRegistryAuth(imageName);
  return imageWithDistribution.distribution(authconfig ? { authconfig } : undefined);
}
