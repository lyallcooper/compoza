import Dockerode from "dockerode";
import { getDocker, getImageDistribution } from "./client";
import type { DockerImage } from "@/types";

export async function listImages(): Promise<DockerImage[]> {
  const docker = getDocker();
  const images = await docker.listImages();

  return images.map((img) => {
    const repoDigest = img.RepoDigests?.[0];
    return {
      id: img.Id,
      tags: img.RepoTags || [],
      size: img.Size,
      created: img.Created,
      digest: repoDigest?.split("@")[1],
      repository: repoDigest?.split("@")[0],
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
      console.error(`[Docker] Failed to inspect image ${id}:`, error);
    }
    return null;
  }
}

export interface PruneResult {
  imagesDeleted: number;
  spaceReclaimed: number;
}

export async function pruneImages(all = false): Promise<PruneResult> {
  const docker = getDocker();
  // Without filter: removes dangling images only (untagged + unused)
  // With dangling: false: removes all unused images (equivalent to -a flag)
  const result = await docker.pruneImages(all ? { filters: { dangling: ["false"] } } : {});

  return {
    imagesDeleted: result.ImagesDeleted?.length || 0,
    spaceReclaimed: result.SpaceReclaimed || 0,
  };
}

// Check if an image has an update available by comparing digests
export async function checkImageUpdate(imageName: string): Promise<boolean> {
  const docker = getDocker();

  // Get local image digest
  const localImages = await docker.listImages({
    filters: { reference: [imageName] },
  });

  if (localImages.length === 0) return false;

  const localDigest = localImages[0].RepoDigests?.[0]?.split("@")[1];
  if (!localDigest) return false;

  // Try to get remote digest via distribution API
  try {
    const distribution = await getImageDistribution(imageName);
    const remoteDigest = distribution.Descriptor?.digest;

    return Boolean(remoteDigest && remoteDigest !== localDigest);
  } catch {
    // If we can't check (e.g., local-only image, private registry), assume no update
    return false;
  }
}
