import type Dockerode from "dockerode";

export interface MockContainerState {
  id: string;
  listInfo: Dockerode.ContainerInfo;
  inspectInfo: Dockerode.ContainerInspectInfo;
  stats: Dockerode.ContainerStats;
  logs: string[];
}

export interface MockImageState {
  id: string;
  listInfo: Dockerode.ImageInfo;
  inspectInfo: Dockerode.ImageInspectInfo;
}

export interface MockNetworkState {
  id: string;
  listInfo: Dockerode.NetworkInspectInfo;
  inspectInfo: Dockerode.NetworkInspectInfo;
}

export interface MockVolumeState {
  name: string;
  info: Dockerode.VolumeInspectInfo;
}

export interface DfData {
  Images?: Array<{ Size: number; SharedSize: number; Containers: number }>;
  Containers?: Array<{ SizeRw?: number; SizeRootFs?: number }>;
  Volumes?: Array<{ Name?: string; UsageData: { Size: number; RefCount: number } }>;
  BuildCache?: Array<{ Size: number; InUse: boolean }>;
}

export interface DockerState {
  containers: Map<string, MockContainerState>;
  images: Map<string, MockImageState>;
  networks: Map<string, MockNetworkState>;
  volumes: Map<string, MockVolumeState>;
  dfData: DfData;
  systemInfo: Record<string, unknown>;
}
