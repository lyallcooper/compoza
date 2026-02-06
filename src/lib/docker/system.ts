import { getDocker, getDockerLongRunning } from "./client";
import { getProjectsDir, getHostProjectsDir } from "@/lib/projects/scanner";
import type { DockerSystemInfo, DiskUsage, SystemPruneOptions, SystemPruneResult } from "@/types";

export async function getSystemInfo(): Promise<DockerSystemInfo> {
  const docker = getDocker();
  const info = await docker.info();

  return {
    version: info.ServerVersion || "",
    os: info.OperatingSystem || "",
    arch: info.Architecture || "",
    kernelVersion: info.KernelVersion || "",
    storageDriver: info.Driver || "",
    rootDir: info.DockerRootDir || "",
    containers: {
      total: info.Containers || 0,
      running: info.ContainersRunning || 0,
      paused: info.ContainersPaused || 0,
      stopped: info.ContainersStopped || 0,
    },
    images: info.Images || 0,
    memoryLimit: info.MemTotal || 0,
    cpus: info.NCPU || 0,
    warnings: info.Warnings || [],
    compoza: {
      version: process.env.COMPOZA_VERSION || "dev",
      projectsDir: getProjectsDir(),
      hostProjectsDir: getHostProjectsDir(),
      dockerHost: process.env.DOCKER_HOST || "/var/run/docker.sock",
      registries: {
        dockerHub: !!(process.env.DOCKERHUB_USERNAME && process.env.DOCKERHUB_TOKEN),
        ghcr: !!process.env.GHCR_TOKEN,
      },
    },
  };
}

interface DfImage {
  Size: number;
  SharedSize: number;
  Containers: number;
}

interface DfContainer {
  SizeRw?: number;
  SizeRootFs?: number;
}

interface DfVolume {
  UsageData: {
    Size: number;
    RefCount: number;
  };
}

interface DfBuildCache {
  Size: number;
  InUse: boolean;
}

interface DfResponse {
  Images?: DfImage[];
  Containers?: DfContainer[];
  Volumes?: DfVolume[];
  BuildCache?: DfBuildCache[];
}

export async function getDiskUsage(): Promise<DiskUsage> {
  const docker = getDocker();

  // Try the df endpoint first
  try {
    const df = await new Promise<DfResponse>((resolve, reject) => {
      docker.df((err: Error | null, data: unknown) => {
        if (err) reject(err);
        else resolve((data || {}) as DfResponse);
      });
    });

    // Calculate from df response
    const images = Array.isArray(df.Images) ? df.Images : [];
    const imageSize = images.reduce((sum, img) => sum + (img?.Size || 0), 0);
    const imageReclaimable = images
      .filter((img) => img?.Containers === 0)
      .reduce((sum, img) => sum + (img?.Size || 0) - (img?.SharedSize || 0), 0);

    const containers = Array.isArray(df.Containers) ? df.Containers : [];
    const containerSize = containers.reduce((sum, c) => sum + (c?.SizeRw || 0), 0);
    const containerReclaimable = containerSize;

    const volumes = Array.isArray(df.Volumes) ? df.Volumes : [];
    const volumeSize = volumes.reduce((sum, v) => sum + (v?.UsageData?.Size || 0), 0);
    const volumeReclaimable = volumes
      .filter((v) => v?.UsageData?.RefCount === 0)
      .reduce((sum, v) => sum + (v?.UsageData?.Size || 0), 0);

    const buildCache = Array.isArray(df.BuildCache) ? df.BuildCache : [];
    const buildCacheSize = buildCache.reduce((sum, b) => sum + (b?.Size || 0), 0);
    const buildCacheReclaimable = buildCache
      .filter((b) => !b?.InUse)
      .reduce((sum, b) => sum + (b?.Size || 0), 0);

    const totalSize = imageSize + containerSize + volumeSize + buildCacheSize;
    const totalReclaimable = imageReclaimable + containerReclaimable + volumeReclaimable + buildCacheReclaimable;

    return {
      images: { total: images.length, size: imageSize, reclaimable: Math.max(0, imageReclaimable) },
      containers: { total: containers.length, size: containerSize, reclaimable: containerReclaimable },
      volumes: { total: volumes.length, size: volumeSize, reclaimable: volumeReclaimable },
      buildCache: { total: buildCache.length, size: buildCacheSize, reclaimable: buildCacheReclaimable },
      totalSize,
      totalReclaimable: Math.max(0, totalReclaimable),
    };
  } catch {
    // Fallback: calculate from list endpoints (less accurate but works when df is blocked)
    return getDiskUsageFromLists();
  }
}

/**
 * Fallback disk usage calculation from list endpoints.
 * Used when /system/df is not available (e.g., 403 Forbidden).
 * Returns null for data that can't be determined without df.
 */
async function getDiskUsageFromLists(): Promise<DiskUsage> {
  const docker = getDocker();

  const [imageList, containerList, volumeList] = await Promise.all([
    docker.listImages(),
    docker.listContainers({ all: true, size: true }),
    docker.listVolumes(),
  ]);

  // Images
  const imageSize = imageList.reduce((sum, img) => sum + (img.Size || 0), 0);
  const danglingImages = imageList.filter(
    (img) => !img.RepoTags || img.RepoTags.length === 0 || img.RepoTags[0] === "<none>:<none>"
  );
  const imageReclaimable = danglingImages.reduce((sum, img) => sum + (img.Size || 0), 0);

  // Containers - SizeRw is available when size: true but not in types
  type ContainerWithSize = { State: string; SizeRw?: number };
  const containers = containerList as unknown as ContainerWithSize[];
  const containerSize = containers.reduce((sum, c) => sum + (c.SizeRw || 0), 0);
  const stoppedContainers = containers.filter((c) => c.State !== "running");
  const containerReclaimable = stoppedContainers.reduce((sum, c) => sum + (c.SizeRw || 0), 0);

  // Volumes - size not available from listVolumes
  const volumes = volumeList.Volumes || [];

  const totalSize = imageSize + containerSize;

  return {
    images: { total: imageList.length, size: imageSize, reclaimable: imageReclaimable },
    containers: { total: containerList.length, size: containerSize, reclaimable: containerReclaimable },
    volumes: { total: volumes.length, size: null, reclaimable: null },
    buildCache: { total: 0, size: null, reclaimable: null },
    totalSize,
    totalReclaimable: null, // Can't accurately calculate without all data
  };
}

export type SystemPruneStep = "containers" | "networks" | "images" | "volumes" | "buildCache";

export async function systemPrune(
  options: SystemPruneOptions,
  onStep?: (step: SystemPruneStep) => void,
): Promise<SystemPruneResult> {
  const docker = getDockerLongRunning();

  let containersDeleted = 0;
  let networksDeleted = 0;
  let imagesDeleted = 0;
  let volumesDeleted = 0;
  let spaceReclaimed = 0;

  // Prune containers
  if (options.containers) {
    onStep?.("containers");
    const containerResult = await docker.pruneContainers();
    containersDeleted = containerResult.ContainersDeleted?.length || 0;
    spaceReclaimed += containerResult.SpaceReclaimed || 0;
  }

  // Prune networks
  if (options.networks) {
    onStep?.("networks");
    const networkResult = await docker.pruneNetworks();
    networksDeleted = networkResult.NetworksDeleted?.length || 0;
  }

  // Prune images
  if (options.images) {
    onStep?.("images");
    // Count images before to get accurate deletion count
    const imagesBefore = await docker.listImages();
    const countBefore = imagesBefore.length;

    // allImages: false = dangling only, true = all unused
    const imageResult = await docker.pruneImages(
      options.allImages ? { filters: { dangling: ["false"] } } : {}
    );

    const imagesAfter = await docker.listImages();
    imagesDeleted = countBefore - imagesAfter.length;
    spaceReclaimed += imageResult.SpaceReclaimed || 0;
  }

  // Prune volumes (dangerous - only if explicitly requested)
  if (options.volumes) {
    onStep?.("volumes");
    const volumeResult = await docker.pruneVolumes();
    volumesDeleted = volumeResult.VolumesDeleted?.length || 0;
    spaceReclaimed += volumeResult.SpaceReclaimed || 0;
  }

  // Prune build cache
  let buildCacheSpaceReclaimed = 0;
  if (options.buildCache) {
    onStep?.("buildCache");
    const buildResult = await docker.pruneBuilder();
    buildCacheSpaceReclaimed = buildResult.SpaceReclaimed || 0;
    spaceReclaimed += buildCacheSpaceReclaimed;
  }

  return {
    containersDeleted,
    networksDeleted,
    imagesDeleted,
    volumesDeleted,
    buildCacheSpaceReclaimed,
    spaceReclaimed,
  };
}
