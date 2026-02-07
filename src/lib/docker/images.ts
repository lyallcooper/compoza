import Dockerode from "dockerode";
import { getDocker } from "./client";
import type { DockerImage, DockerImageDetail } from "@/types";
import { formatShortId } from "@/lib/format";
import { log } from "@/lib/logger";

export async function listImages(): Promise<DockerImage[]> {
  const docker = getDocker();
  const images = await docker.listImages();

  return images.map((img) => {
    const tags = img.RepoTags || [];
    const repoDigest = img.RepoDigests?.[0];
    const name = tags[0] || repoDigest?.split("@")[0] || formatShortId(img.Id);
    return {
      id: img.Id,
      name,
      tags,
      size: img.Size,
      created: img.Created,
      digest: repoDigest?.split("@")[1],
    };
  });
}

export async function pullImage(name: string, onProgress?: (progress: string) => void): Promise<void> {
  const docker = getDocker();

  return new Promise((resolve, reject) => {
    docker.pull(name, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) {
        reject(err);
        return;
      }

      docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        },
        (event: { status?: string; progress?: string }) => {
          if (onProgress) {
            const msg = event.progress ? `${event.status}: ${event.progress}` : event.status || "";
            onProgress(msg);
          }
        }
      );
    });
  });
}

export async function removeImage(id: string, force = false): Promise<void> {
  const docker = getDocker();
  const image = docker.getImage(id);
  await image.remove({ force });
}

export async function inspectImage(id: string): Promise<Dockerode.ImageInspectInfo | null> {
  const docker = getDocker();
  try {
    const image = docker.getImage(id);
    return await image.inspect();
  } catch (error) {
    // 404 is expected for images not pulled locally
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode !== 404) {
      log.docker.error(`Failed to inspect image ${id}`, error);
    }
    return null;
  }
}

export async function getImage(id: string): Promise<DockerImageDetail | null> {
  const docker = getDocker();

  const info = await inspectImage(id);
  if (!info) return null;

  // Get containers using this image
  const containers = await docker.listContainers({ all: true });
  const imageContainers = containers
    .filter((c) => c.ImageID === info.Id)
    .map((c) => ({
      id: c.Id,
      name: c.Names[0]?.replace(/^\//, "") || c.Id.slice(0, 12),
    }));

  // Extract exposed ports from config
  const exposedPorts = info.Config?.ExposedPorts
    ? Object.keys(info.Config.ExposedPorts)
    : undefined;

  // Extract declared volumes
  const volumes = info.Config?.Volumes
    ? Object.keys(info.Config.Volumes)
    : undefined;

  // Parse environment variables from KEY=VALUE format
  const env = info.Config?.Env?.length
    ? Object.fromEntries(
        info.Config.Env.map((entry) => {
          const idx = entry.indexOf("=");
          return idx >= 0 ? [entry.slice(0, idx), entry.slice(idx + 1)] : [entry, ""];
        })
      )
    : undefined;

  // Extract user (if set)
  const user = info.Config?.User || undefined;

  // Extract healthcheck (if defined and not disabled via NONE)
  const healthcheckTest = info.Config?.Healthcheck?.Test;
  const healthcheck = healthcheckTest && healthcheckTest[0] !== "NONE"
    ? { test: healthcheckTest }
    : undefined;

  const tags = info.RepoTags || [];
  const repoDigest = info.RepoDigests?.[0];
  const name = tags[0] || repoDigest?.split("@")[0] || formatShortId(info.Id);

  // Normalize entrypoint and cmd to arrays (Docker can return string or string[])
  const normalizeToArray = (value: string | string[] | undefined): string[] | undefined => {
    if (!value) return undefined;
    return Array.isArray(value) ? value : [value];
  };

  return {
    id: info.Id,
    name,
    tags,
    size: info.Size,
    created: Math.floor(new Date(info.Created).getTime() / 1000),
    digest: repoDigest?.split("@")[1],
    architecture: info.Architecture,
    os: info.Os,
    author: info.Author || undefined,
    config: {
      workingDir: info.Config?.WorkingDir || undefined,
      entrypoint: normalizeToArray(info.Config?.Entrypoint),
      cmd: normalizeToArray(info.Config?.Cmd),
      exposedPorts,
      volumes,
      env,
      user,
      healthcheck,
      labels: info.Config?.Labels || undefined,
    },
    containers: imageContainers,
  };
}

export interface PruneResult {
  imagesDeleted: number;
  spaceReclaimed: number;
}

export async function pruneImages(all = false): Promise<PruneResult> {
  const docker = getDocker();

  // Count top-level images before prune to report accurate deletion count
  // Docker's ImagesDeleted includes layers, not just top-level images
  const imagesBefore = await docker.listImages();
  const countBefore = imagesBefore.length;

  // Without filter: removes dangling images only (untagged + unused)
  // With dangling: false: removes all unused images (equivalent to -a flag)
  const result = await docker.pruneImages(all ? { filters: { dangling: ["false"] } } : {});

  const imagesAfter = await docker.listImages();
  const countAfter = imagesAfter.length;

  return {
    imagesDeleted: countBefore - countAfter,
    spaceReclaimed: result.SpaceReclaimed || 0,
  };
}

