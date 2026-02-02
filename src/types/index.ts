export interface Project {
  name: string;
  path: string;
  composeFile: string;
  status: "running" | "partial" | "stopped" | "unknown";
  services: ProjectService[];
}

export interface ProjectService {
  name: string;
  image?: string;
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
  tags: string[];
  size: number;
  created: number;
  digest?: string;
  /** Repository name extracted from RepoDigests (useful for untagged images) */
  repository?: string;
  updateAvailable?: boolean;
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
