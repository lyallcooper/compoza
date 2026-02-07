export type ProjectStatus = "running" | "partial" | "stopped" | "unknown";

export interface Project {
  name: string;
  path: string;
  composeFile: string;
  status: ProjectStatus;
  services: ProjectService[];
}

/** Check if a project is running (fully or partially) */
export function isProjectRunning(project: { status: ProjectStatus } | null | undefined): boolean {
  return project?.status === "running" || project?.status === "partial";
}

export interface ProjectService {
  name: string;
  image?: string;
  /** Image ID the container was created with (sha256:...) */
  imageId?: string;
  containerId?: string;
  containerName?: string;
  status: "running" | "exited" | "paused" | "restarting" | "unknown";
  ports?: PortMapping[];
  /** Whether this service uses a Dockerfile (has build: config) */
  hasBuild?: boolean;
}

export interface PortMapping {
  container: number;
  host?: number;
  protocol: "tcp" | "udp";
}

/**
 * How a container can be updated.
 * - "compose": Managed by compose, can be updated via compose pull + up
 * - "standalone": Not compose-managed, manual update required
 */
export type ContainerUpdateStrategy = "compose" | "standalone";

/**
 * Actions available for a container based on its current state.
 */
export interface ContainerActions {
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
  canUpdate: boolean;
  canViewLogs: boolean;
  canExec: boolean;
}

export interface ContainerHealth {
  status: "healthy" | "unhealthy" | "starting" | "none";
  failingStreak?: number;
}

export interface ContainerMount {
  type: "bind" | "volume" | "tmpfs";
  /** Volume name (only for volume mounts) */
  name?: string;
  source: string;
  destination: string;
  mode: string;
  rw: boolean;
}

export interface ContainerNetwork {
  name: string;
  ipAddress: string;
  gateway: string;
  macAddress: string;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  imageId: string;
  status: string;
  state: "running" | "exited" | "paused" | "restarting" | "dead" | "created" | "removing";
  created: number;
  ports: PortMapping[];
  labels: Record<string, string>;
  /** Compose project name if compose-managed */
  projectName?: string;
  /** Compose service name if compose-managed */
  serviceName?: string;
  /** How this container can be updated */
  updateStrategy: ContainerUpdateStrategy;
  /** Available actions based on current state */
  actions: ContainerActions;
  /** Number of times the container has restarted */
  restartCount?: number;
  /** Health check status */
  health?: ContainerHealth;
  /** Exit code if container has exited */
  exitCode?: number;
  /** Environment variables */
  env: Record<string, string>;
  /** Volume mounts */
  mounts: ContainerMount[];
  /** Network configuration */
  networks: ContainerNetwork[];
}

export interface ContainerStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

export interface DockerImage {
  id: string;
  /** Primary display name: first RepoTag, or repository from RepoDigests, or short ID */
  name: string;
  tags: string[];
  size: number;
  created: number;
  digest?: string;
  updateAvailable?: boolean;
}

export interface DockerImageDetail extends DockerImage {
  architecture?: string;
  os?: string;
  author?: string;
  config?: {
    workingDir?: string;
    entrypoint?: string[];
    cmd?: string[];
    exposedPorts?: string[];
    volumes?: string[];
    env?: Record<string, string>;
    user?: string;
    healthcheck?: {
      test: string[];
    };
    labels?: Record<string, string>;
  };
  containers: { id: string; name: string }[];
}

export interface ComposeConfig {
  version?: string;
  services: Record<string, ComposeService>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
}

export interface ComposeService {
  image?: string;
  build?: string | { context: string; dockerfile?: string };
  container_name?: string;
  ports?: string[];
  volumes?: string[];
  environment?: string[] | Record<string, string>;
  depends_on?: string[] | Record<string, { condition: string }>;
  restart?: string;
  labels?: Record<string, string>;
  networks?: string[];
  command?: string | string[];
  entrypoint?: string | string[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Docker Distribution API response (not in @types/dockerode)
export interface DistributionInfo {
  Descriptor?: {
    digest?: string;
    mediaType?: string;
    size?: number;
  };
  Platforms?: Array<{
    architecture: string;
    os: string;
  }>;
}

export interface ProjectFormData {
  name: string;
  composeContent: string;
  envContent?: string;
}

// Next.js App Router page props for dynamic routes
export interface RouteParams<T extends Record<string, string>> {
  params: Promise<T>;
}

export type ContainerRouteProps = RouteParams<{ name: string }>;
export type ProjectRouteProps = RouteParams<{ name: string }>;
export type NetworkRouteProps = RouteParams<{ name: string }>;
export type VolumeRouteProps = RouteParams<{ name: string }>;
export type ImageRouteProps = RouteParams<{ id: string }>;

export interface NetworkContainer {
  id: string;
  name: string;
  ipv4Address: string;
  macAddress: string;
}

export interface VolumeContainer {
  id: string;
  name: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  scope: "local" | "global";
  labels: Record<string, string>;
  options: Record<string, string> | null;
  created: string;
  /** Size in bytes - only available from df endpoint */
  size: number | null;
  /** Number of containers using this volume */
  containerCount: number;
  /** Containers using this volume - only on detail view */
  containers: VolumeContainer[];
  actions: {
    canDelete: boolean;
  };
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: "local" | "global" | "swarm";
  internal: boolean;
  attachable: boolean;
  ipam: {
    subnet?: string;
    gateway?: string;
  } | null;
  containerCount: number;
  /** Only populated on detail view */
  containers: NetworkContainer[];
  options: Record<string, string>;
  labels: Record<string, string>;
  created: string;
  actions: {
    canDelete: boolean;
  };
}

export interface DockerSystemInfo {
  version: string;
  os: string;
  arch: string;
  kernelVersion: string;
  storageDriver: string;
  rootDir: string;
  containers: { total: number; running: number; paused: number; stopped: number };
  images: number;
  memoryLimit: number;
  cpus: number;
  warnings: string[];
  compoza: {
    version: string;
    projectsDir: string;
    hostProjectsDir: string;
    dockerHost: string;
    registries: {
      dockerHub: boolean;
      ghcr: boolean;
    };
  };
}

export interface DiskUsageCategory {
  total: number;
  size: number | null;
  reclaimable: number | null;
}

export interface DiskUsage {
  images: DiskUsageCategory;
  containers: DiskUsageCategory;
  volumes: DiskUsageCategory;
  buildCache: DiskUsageCategory;
  totalSize: number;
  totalReclaimable: number | null;
}

export interface SystemPruneOptions {
  containers?: boolean;
  networks?: boolean;
  images?: boolean;
  volumes?: boolean;
  buildCache?: boolean;
  allImages?: boolean;
}

export interface SystemPruneResult {
  containersDeleted: number;
  networksDeleted: number;
  imagesDeleted: number;
  volumesDeleted: number;
  buildCacheSpaceReclaimed: number;
  spaceReclaimed: number;
}
