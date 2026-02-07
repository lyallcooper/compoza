import type { ImageRef } from "./types";

/**
 * Parse a Docker image reference into its components.
 *
 * Handles various formats:
 * - nginx → docker.io/library/nginx:latest
 * - nginx:1.25 → docker.io/library/nginx:1.25
 * - user/repo:tag → docker.io/user/repo:tag
 * - ghcr.io/owner/repo:tag
 * - lscr.io/linuxserver/sonarr:latest
 * - registry.example.com/repo:tag
 * - registry.example.com:5000/repo:tag
 */
export function parseImageRef(image: string): ImageRef {
  let registry = "docker.io";
  let namespace = "library";
  let repository: string;
  let tag = "latest";
  let digest: string | undefined;

  let reference = image;

  // Strip digest pin first (e.g. repo:tag@sha256:...)
  const digestIndex = reference.indexOf("@sha256:");
  if (digestIndex > 0) {
    digest = reference.slice(digestIndex + 1);
    reference = reference.slice(0, digestIndex);
  }

  // Split off tag
  const tagIndex = reference.lastIndexOf(":");
  const slashIndex = reference.lastIndexOf("/");

  // Only treat as tag if colon comes after last slash (not a port)
  if (tagIndex > slashIndex && tagIndex !== -1) {
    tag = reference.slice(tagIndex + 1);
    reference = reference.slice(0, tagIndex);
  }

  const parts = reference.split("/");

  if (parts.length === 1) {
    // Just repository name: nginx
    repository = parts[0];
  } else if (parts.length === 2) {
    // Could be user/repo or registry/repo
    if (isRegistry(parts[0])) {
      registry = parts[0];
      repository = parts[1];
    } else {
      // user/repo on Docker Hub
      namespace = parts[0];
      repository = parts[1];
    }
  } else {
    // registry/namespace/repo or registry/namespace/more/repo
    registry = parts[0];
    repository = parts[parts.length - 1];
    namespace = parts.slice(1, -1).join("/");
  }

  return { registry, namespace, repository, tag, digest };
}

/**
 * Check if a string looks like a registry hostname.
 */
function isRegistry(s: string): boolean {
  // Contains a dot (domain) or colon (port)
  if (s.includes(".") || s.includes(":")) {
    return true;
  }
  // localhost is a registry
  if (s === "localhost") {
    return true;
  }
  return false;
}

export type RegistryType = "dockerhub" | "ghcr" | "lscr" | "unknown";

/**
 * Determine the registry type from the registry hostname.
 */
export function getRegistryType(registry: string): RegistryType {
  const normalized = registry.toLowerCase();

  if (normalized === "docker.io" || normalized === "registry.hub.docker.com") {
    return "dockerhub";
  }
  if (normalized === "ghcr.io") {
    return "ghcr";
  }
  if (normalized === "lscr.io") {
    return "lscr";
  }

  return "unknown";
}

/**
 * Reconstruct the full image reference from components.
 */
export function formatImageRef(ref: ImageRef): string {
  const parts: string[] = [];

  if (ref.registry !== "docker.io") {
    parts.push(ref.registry);
  }

  if (ref.namespace !== "library" || ref.registry !== "docker.io") {
    parts.push(ref.namespace);
  }

  parts.push(ref.repository);

  return `${parts.join("/")}:${ref.tag}`;
}
