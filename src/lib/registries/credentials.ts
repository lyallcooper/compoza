import { log } from "@/lib/logger";

/**
 * Registry credentials from environment variables.
 * Credentials are disabled for the session on first auth failure
 * (env vars don't change at runtime, so a bad token stays bad).
 */

export interface RegistryCredentials {
  username: string;
  token: string;
}

type RegistryKey = "dockerhub" | "ghcr";

const disabledRegistries = new Set<RegistryKey>();

/** Mark a registry's credentials as invalid for the rest of this process. */
export function disableRegistryCredentials(registry: RegistryKey): void {
  if (!disabledRegistries.has(registry)) {
    disabledRegistries.add(registry);
    const name = registry === "ghcr" ? "GHCR" : "Docker Hub";
    log.registry.warn(`${name} credentials are invalid — disabled for this session`);
  }
}

/**
 * Check if an image name refers to Docker Hub.
 * Docker Hub images either have no registry prefix or use docker.io.
 */
export function isDockerHub(imageName: string): boolean {
  // No slash = official image (e.g., "nginx")
  if (!imageName.includes("/")) return true;

  const firstPart = imageName.split("/")[0];

  // Has a dot or colon = explicit registry (e.g., "ghcr.io/user/repo")
  if (firstPart.includes(".") || firstPart.includes(":")) {
    return firstPart === "docker.io" || firstPart === "registry-1.docker.io";
  }

  // No dot/colon in first part = Docker Hub user/repo (e.g., "library/nginx")
  return true;
}

/**
 * Check if an image name refers to GitHub Container Registry.
 */
export function isGhcr(imageName: string): boolean {
  return imageName.startsWith("ghcr.io/");
}

/**
 * Get registry credentials from environment variables for an image.
 * Returns null if no credentials are configured for the image's registry.
 */
export function getRegistryCredentials(imageName: string): RegistryCredentials | null {
  if (isDockerHub(imageName) && !disabledRegistries.has("dockerhub")) {
    const username = process.env.DOCKERHUB_USERNAME;
    const token = process.env.DOCKERHUB_TOKEN;
    if (username && token) {
      return { username, token };
    }
  }

  if (isGhcr(imageName) && !disabledRegistries.has("ghcr")) {
    const token = process.env.GHCR_TOKEN;
    if (token) {
      // GHCR accepts any username with token auth
      return { username: "token", token };
    }
  }

  return null;
}

/**
 * Get registry credentials for a token endpoint URL.
 * Used by OCI client when authenticating with registry token services.
 */
export function getCredentialsForTokenEndpoint(tokenUrl: string): RegistryCredentials | null {
  if (tokenUrl.includes("docker") && !disabledRegistries.has("dockerhub")) {
    const username = process.env.DOCKERHUB_USERNAME;
    const token = process.env.DOCKERHUB_TOKEN;
    if (username && token) {
      return { username, token };
    }
  }

  if (tokenUrl.includes("ghcr.io") && !disabledRegistries.has("ghcr")) {
    const token = process.env.GHCR_TOKEN;
    if (token) {
      return { username: "token", token };
    }
  }

  return null;
}
