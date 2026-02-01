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
  status: "running" | "exited" | "paused" | "restarting" | "unknown";
  ports?: PortMapping[];
}

export interface PortMapping {
  container: number;
  host?: number;
  protocol: "tcp" | "udp";
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
  projectName?: string;
  serviceName?: string;
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

export type ContainerRouteProps = RouteParams<{ id: string }>;
export type ProjectRouteProps = RouteParams<{ name: string }>;
