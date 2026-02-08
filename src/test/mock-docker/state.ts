import type Dockerode from "dockerode";

export interface MockContainerState {
  id: string;
  listInfo: Dockerode.ContainerInfo;
  inspectInfo: Dockerode.ContainerInspectInfo;
  stats: Dockerode.ContainerStats;
  logs: string[];
}

export interface DockerState {
  containers: Map<string, MockContainerState>;
}
