import { getDocker } from "@/lib/docker";

/**
 * Pull the latest version of an image from the registry.
 */
export async function pullLatestImage(imageName: string): Promise<void> {
  const docker = getDocker();

  return new Promise((resolve, reject) => {
    docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) {
        reject(err);
        return;
      }

      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}
