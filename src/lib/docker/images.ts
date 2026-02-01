import Dockerode from "dockerode";
import { getDocker, getImageDistribution } from "./client";
import type { DockerImage } from "@/types";

export async function listImages(): Promise<DockerImage[]> {
  const docker = getDocker();
  const images = await docker.listImages();

  return images.map((img) => ({
    id: img.Id,
    tags: img.RepoTags || [],
    size: img.Size,
    created: img.Created,
    digest: img.RepoDigests?.[0]?.split("@")[1],
  }));
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
    console.error(`[Docker] Failed to inspect image ${id}:`, error);
    return null;
  }
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
  } catch (error) {
    // If we can't check (e.g., local-only image), assume no update
    console.debug(`[Docker] Could not check update for ${imageName}:`, error);
    return false;
  }
}
