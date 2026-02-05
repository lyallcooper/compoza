import { getDocker } from "./client";
import type { DockerVolume, VolumeContainer } from "@/types";

export interface CreateVolumeOptions {
  name: string;
  driver?: string;
  labels?: Record<string, string>;
}

export interface VolumePruneResult {
  volumesDeleted: string[];
}

export async function listVolumes(): Promise<DockerVolume[]> {
  const docker = getDocker();

  // Fetch volumes, containers, and disk usage in parallel
  const [volumeData, containers, dfData] = await Promise.all([
    docker.listVolumes(),
    docker.listContainers({ all: true }),
    docker.df(),
  ]);

  const volumes = volumeData.Volumes || [];

  // Build size map from df data
  const sizeMap = new Map<string, number>();
  if (dfData.Volumes) {
    for (const vol of dfData.Volumes) {
      if (vol.Name && vol.UsageData?.Size !== undefined) {
        sizeMap.set(vol.Name, vol.UsageData.Size);
      }
    }
  }

  // Build a map of volume name -> container count
  const volumeContainerCounts = new Map<string, number>();
  for (const container of containers) {
    const mounts = container.Mounts || [];
    for (const mount of mounts) {
      if (mount.Type === "volume" && mount.Name) {
        volumeContainerCounts.set(
          mount.Name,
          (volumeContainerCounts.get(mount.Name) || 0) + 1
        );
      }
    }
  }

  return volumes.map((vol) => {
    const containerCount = volumeContainerCounts.get(vol.Name) || 0;
    return {
      name: vol.Name,
      driver: vol.Driver,
      mountpoint: vol.Mountpoint,
      scope: (vol.Scope as DockerVolume["scope"]) || "local",
      labels: vol.Labels || {},
      options: vol.Options || null,
      created: (vol as unknown as { CreatedAt?: string }).CreatedAt || "",
      size: sizeMap.get(vol.Name) ?? null,
      containerCount,
      containers: [], // Not populated for list view
      actions: {
        canDelete: containerCount === 0,
      },
    };
  });
}

export async function getVolume(name: string): Promise<DockerVolume | null> {
  const docker = getDocker();

  try {
    const volume = docker.getVolume(name);

    // Fetch volume info, containers, and disk usage in parallel
    const [info, containers, dfData] = await Promise.all([
      volume.inspect(),
      docker.listContainers({ all: true }),
      docker.df().catch(() => null), // df may not be available
    ]);

    // Find containers using this volume
    const volumeContainers: VolumeContainer[] = [];
    for (const container of containers) {
      const mounts = container.Mounts || [];
      for (const mount of mounts) {
        if (mount.Type === "volume" && mount.Name === name) {
          volumeContainers.push({
            id: container.Id,
            name: (container.Names?.[0] || "").replace(/^\//, ""),
          });
          break; // Container found, move to next
        }
      }
    }

    // Get size from df if available
    let size: number | null = null;
    if (dfData?.Volumes) {
      const volDf = dfData.Volumes.find((v: { Name?: string }) => v.Name === name);
      if (volDf?.UsageData?.Size !== undefined) {
        size = volDf.UsageData.Size;
      }
    }

    return {
      name: info.Name,
      driver: info.Driver,
      mountpoint: info.Mountpoint,
      scope: (info.Scope as DockerVolume["scope"]) || "local",
      labels: info.Labels || {},
      options: info.Options || null,
      created: (info as unknown as { CreatedAt?: string }).CreatedAt || "",
      size,
      containerCount: volumeContainers.length,
      containers: volumeContainers,
      actions: {
        canDelete: volumeContainers.length === 0,
      },
    };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404) {
      return null;
    }
    throw error;
  }
}

export async function createVolume(options: CreateVolumeOptions): Promise<void> {
  const docker = getDocker();
  const { name, driver = "local", labels } = options;

  await docker.createVolume({
    Name: name,
    Driver: driver,
    Labels: labels,
  });
}

export async function removeVolume(name: string): Promise<void> {
  const docker = getDocker();
  const volume = docker.getVolume(name);
  await volume.remove();
}

export interface PruneVolumesOptions {
  /** Remove all unused volumes, not just anonymous ones */
  all?: boolean;
}

export async function pruneVolumes(options: PruneVolumesOptions = {}): Promise<VolumePruneResult> {
  const docker = getDocker();
  const filters = options.all ? { all: ["true"] } : undefined;
  const result = await docker.pruneVolumes({ filters });

  return {
    volumesDeleted: result.VolumesDeleted || [],
  };
}
