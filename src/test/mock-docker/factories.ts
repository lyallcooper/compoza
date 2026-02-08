import { randomUUID } from "node:crypto";
import type Dockerode from "dockerode";
import type { DockerState, MockContainerState, MockImageState, MockNetworkState, MockVolumeState, DfData } from "./state";

const DEFAULT_NETWORK: Dockerode.NetworkInfo = {
  IPAMConfig: null,
  Links: null,
  Aliases: null,
  NetworkID: "net1",
  EndpointID: "ep1",
  Gateway: "172.17.0.1",
  IPAddress: "172.17.0.2",
  IPPrefixLen: 16,
  IPv6Gateway: "",
  GlobalIPv6Address: "",
  GlobalIPv6PrefixLen: 0,
  MacAddress: "02:42:ac:11:00:02",
};

interface ContainerOverrides {
  id?: string;
  name?: string;
  image?: string;
  imageId?: string;
  state?: string;
  status?: string;
  created?: number;
  labels?: Record<string, string>;
  ports?: Array<{ IP?: string; PrivatePort: number; PublicPort?: number; Type?: string }>;
  env?: string[];
  mounts?: Dockerode.MountSettings[];
  networks?: Record<string, Dockerode.NetworkInfo>;
  portBindings?: Record<string, Array<{ HostIp: string; HostPort: string }>>;
  exposedPorts?: Record<string, Record<string, never>>;
  health?: { Status: string; FailingStreak: number };
  restartCount?: number;
  exitCode?: number;
  startedAt?: string;
  configImage?: string;
  stats?: Record<string, unknown>;
  logs?: string[];
}

export function createContainerState(overrides: ContainerOverrides = {}): MockContainerState {
  const uid = randomUUID().replace(/-/g, "");
  const id = overrides.id ?? `${uid}${uid}`;
  const name = overrides.name ?? `container-${uid.slice(0, 8)}`;
  const image = overrides.image ?? "nginx:latest";
  const imageId = overrides.imageId ?? `sha256:${uid}${uid}`;
  const state = overrides.state ?? "running";
  const status = overrides.status ?? (state === "running" ? "Up 2 hours" : "Exited (0) 1 hour ago");
  const created = overrides.created ?? 1700000000;
  const labels = overrides.labels ?? {};
  const networks = overrides.networks ?? { bridge: DEFAULT_NETWORK };

  const listInfo = {
    Id: id,
    Names: [`/${name}`],
    Image: overrides.configImage ?? image,
    ImageID: imageId,
    Command: "/bin/sh",
    Created: created,
    State: state,
    Status: status,
    Ports: overrides.ports ?? [],
    Labels: labels,
    SizeRw: 0,
    SizeRootFs: 0,
    HostConfig: { NetworkMode: "default" },
    NetworkSettings: { Networks: networks },
    Mounts: overrides.mounts ?? [],
  } as unknown as Dockerode.ContainerInfo;

  const inspectInfo = {
    Id: id,
    Created: new Date(created * 1000).toISOString(),
    Path: "/bin/sh",
    Args: [],
    State: {
      Status: state,
      Running: state === "running",
      Paused: state === "paused",
      Restarting: state === "restarting",
      OOMKilled: false,
      Dead: state === "dead",
      Pid: state === "running" ? 1234 : 0,
      ExitCode: overrides.exitCode ?? 0,
      Error: "",
      StartedAt: overrides.startedAt ?? "2024-01-01T00:00:00Z",
      FinishedAt: "0001-01-01T00:00:00Z",
      Health: overrides.health ? {
        Status: overrides.health.Status,
        FailingStreak: overrides.health.FailingStreak,
        Log: [],
      } : undefined,
    },
    Image: imageId,
    ResolvConfPath: "",
    HostnamePath: "",
    HostsPath: "",
    LogPath: "",
    Name: `/${name}`,
    RestartCount: overrides.restartCount ?? 0,
    Driver: "overlay2",
    Platform: "linux",
    MountLabel: "",
    ProcessLabel: "",
    AppArmorProfile: "",
    ExecIDs: null,
    HostConfig: {
      PortBindings: overrides.portBindings ?? {},
      NetworkMode: "default",
      RestartPolicy: { Name: "", MaximumRetryCount: 0 },
    },
    GraphDriver: { Name: "overlay2", Data: {} },
    Mounts: overrides.mounts ?? [],
    Config: {
      Hostname: id.slice(0, 12),
      Domainname: "",
      User: "",
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      ExposedPorts: overrides.exposedPorts ?? {},
      Tty: false,
      OpenStdin: false,
      StdinOnce: false,
      Env: overrides.env ?? ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
      Cmd: ["/bin/sh"],
      Image: overrides.configImage ?? image,
      Volumes: null,
      WorkingDir: "",
      Entrypoint: null,
      OnBuild: null,
      Labels: labels,
    },
    NetworkSettings: {
      Bridge: "",
      SandboxID: "",
      HairpinMode: false,
      LinkLocalIPv6Address: "",
      LinkLocalIPv6PrefixLen: 0,
      Ports: {},
      SandboxKey: "",
      SecondaryIPAddresses: null,
      SecondaryIPv6Addresses: null,
      EndpointID: "",
      Gateway: "",
      GlobalIPv6Address: "",
      GlobalIPv6PrefixLen: 0,
      IPAddress: "",
      IPPrefixLen: 0,
      IPv6Gateway: "",
      MacAddress: "",
      Networks: networks,
    },
  } as unknown as Dockerode.ContainerInspectInfo;

  const stats = createDefaultStats(overrides.stats);

  return {
    id,
    listInfo,
    inspectInfo,
    stats,
    logs: overrides.logs ?? [],
  };
}

export function createDefaultStats(overrides: Record<string, unknown> = {}): Dockerode.ContainerStats {
  return {
    read: "2024-01-01T00:00:00Z",
    preread: "2024-01-01T00:00:00Z",
    num_procs: 0,
    pids_stats: { current: 10 },
    cpu_stats: {
      cpu_usage: {
        total_usage: 500000000,
        percpu_usage: [500000000],
        usage_in_kernelmode: 100000000,
        usage_in_usermode: 400000000,
      },
      system_cpu_usage: 10000000000,
      online_cpus: 4,
      throttling_data: { periods: 0, throttled_periods: 0, throttled_time: 0 },
      ...(overrides.cpu_stats as Record<string, unknown> ?? {}),
    },
    precpu_stats: {
      cpu_usage: {
        total_usage: 400000000,
        percpu_usage: [400000000],
        usage_in_kernelmode: 80000000,
        usage_in_usermode: 320000000,
      },
      system_cpu_usage: 9000000000,
      online_cpus: 4,
      throttling_data: { periods: 0, throttled_periods: 0, throttled_time: 0 },
      ...(overrides.precpu_stats as Record<string, unknown> ?? {}),
    },
    memory_stats: {
      usage: 104857600, // 100 MiB
      max_usage: 209715200,
      limit: 1073741824, // 1 GiB
      stats: {},
      ...(overrides.memory_stats as Record<string, unknown> ?? {}),
    },
    blkio_stats: {
      io_service_bytes_recursive: [
        { major: 8, minor: 0, op: "read", value: 1048576 },
        { major: 8, minor: 0, op: "write", value: 2097152 },
      ],
      io_serviced_recursive: [],
      io_queue_recursive: [],
      io_service_time_recursive: [],
      io_wait_time_recursive: [],
      io_merged_recursive: [],
      io_time_recursive: [],
      sectors_recursive: [],
      ...(overrides.blkio_stats as Record<string, unknown> ?? {}),
    },
    networks: {
      eth0: { rx_bytes: 1000, tx_bytes: 2000, rx_packets: 10, tx_packets: 20, rx_errors: 0, tx_errors: 0, rx_dropped: 0, tx_dropped: 0 },
      ...(overrides.networks as Record<string, unknown> ?? {}),
    },
    storage_stats: {},
  } as unknown as Dockerode.ContainerStats;
}

export function createDockerState(
  containers: MockContainerState[] = [],
  options: {
    images?: MockImageState[];
    networks?: MockNetworkState[];
    volumes?: MockVolumeState[];
    dfData?: DfData;
    systemInfo?: Record<string, unknown>;
  } = {}
): DockerState {
  const containerMap = new Map<string, MockContainerState>();
  for (const c of containers) {
    containerMap.set(c.id, c);
  }

  const imageMap = new Map<string, MockImageState>();
  for (const img of options.images ?? []) {
    imageMap.set(img.id, img);
  }

  const networkMap = new Map<string, MockNetworkState>();
  for (const net of options.networks ?? []) {
    networkMap.set(net.id, net);
  }

  const volumeMap = new Map<string, MockVolumeState>();
  for (const vol of options.volumes ?? []) {
    volumeMap.set(vol.name, vol);
  }

  return {
    containers: containerMap,
    images: imageMap,
    networks: networkMap,
    volumes: volumeMap,
    dfData: options.dfData ?? {},
    systemInfo: options.systemInfo ?? {},
  };
}

// ---------------------------------------------------------------------------
// Image factories
// ---------------------------------------------------------------------------

interface ImageOverrides {
  id?: string;
  repoTags?: string[];
  repoDigests?: string[];
  size?: number;
  created?: number;
  config?: Record<string, unknown>;
  architecture?: string;
  os?: string;
  author?: string;
  healthcheck?: { Test: string[] };
}

export function createImageState(overrides: ImageOverrides = {}): MockImageState {
  const uid = randomUUID().replace(/-/g, "");
  const id = overrides.id ?? `sha256:${uid}${uid}`;
  const repoTags = overrides.repoTags ?? ["nginx:latest"];
  const repoDigests = overrides.repoDigests ?? [];
  const size = overrides.size ?? 100000000;
  const created = overrides.created ?? 1700000000;

  const listInfo = {
    Id: id,
    ParentId: "",
    RepoTags: repoTags,
    RepoDigests: repoDigests,
    Created: created,
    Size: size,
    SharedSize: 0,
    VirtualSize: size,
    Labels: {},
    Containers: 0,
  } as unknown as Dockerode.ImageInfo;

  const inspectInfo = {
    Id: id,
    RepoTags: repoTags,
    RepoDigests: repoDigests,
    Parent: "",
    Comment: "",
    Created: new Date(created * 1000).toISOString(),
    DockerVersion: "20.10.0",
    Author: overrides.author ?? "",
    Architecture: overrides.architecture ?? "amd64",
    Os: overrides.os ?? "linux",
    Size: size,
    VirtualSize: size,
    Config: {
      Hostname: "",
      Domainname: "",
      User: "",
      AttachStdin: false,
      AttachStdout: false,
      AttachStderr: false,
      ExposedPorts: {},
      Tty: false,
      OpenStdin: false,
      StdinOnce: false,
      Env: ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
      Cmd: ["/bin/sh"],
      Image: "",
      Volumes: null,
      WorkingDir: "",
      Entrypoint: null,
      OnBuild: null,
      Labels: {},
      Healthcheck: overrides.healthcheck ?? undefined,
      ...(overrides.config ?? {}),
    },
    RootFS: { Type: "layers", Layers: [] },
    GraphDriver: { Name: "overlay2", Data: {} },
    Metadata: { LastTagTime: "" },
  } as unknown as Dockerode.ImageInspectInfo;

  return { id, listInfo, inspectInfo };
}

// ---------------------------------------------------------------------------
// Network factories
// ---------------------------------------------------------------------------

interface NetworkOverrides {
  id?: string;
  name?: string;
  driver?: string;
  scope?: string;
  internal?: boolean;
  attachable?: boolean;
  ipamConfig?: Array<{ Subnet?: string; Gateway?: string }>;
  containers?: Record<string, { Name: string; IPv4Address?: string; MacAddress?: string }>;
  labels?: Record<string, string>;
  options?: Record<string, string>;
  created?: string;
}

export function createNetworkState(overrides: NetworkOverrides = {}): MockNetworkState {
  const uid = randomUUID().replace(/-/g, "");
  const id = overrides.id ?? uid;
  const name = overrides.name ?? `network-${uid.slice(0, 8)}`;

  const info = {
    Id: id,
    Name: name,
    Created: overrides.created ?? "2024-01-01T00:00:00Z",
    Scope: overrides.scope ?? "local",
    Driver: overrides.driver ?? "bridge",
    EnableIPv6: false,
    Internal: overrides.internal ?? false,
    Attachable: overrides.attachable ?? false,
    Ingress: false,
    IPAM: {
      Driver: "default",
      Config: overrides.ipamConfig ?? [],
      Options: {},
    },
    Containers: overrides.containers ?? {},
    Options: overrides.options ?? {},
    Labels: overrides.labels ?? {},
  } as unknown as Dockerode.NetworkInspectInfo;

  return { id, listInfo: info, inspectInfo: info };
}

// ---------------------------------------------------------------------------
// Volume factories
// ---------------------------------------------------------------------------

interface VolumeOverrides {
  name?: string;
  driver?: string;
  mountpoint?: string;
  scope?: string;
  labels?: Record<string, string>;
  options?: Record<string, string> | null;
  createdAt?: string;
}

export function createVolumeState(overrides: VolumeOverrides = {}): MockVolumeState {
  const uid = randomUUID().replace(/-/g, "").slice(0, 16);
  const name = overrides.name ?? `volume-${uid.slice(0, 8)}`;

  const info = {
    Name: name,
    Driver: overrides.driver ?? "local",
    Mountpoint: overrides.mountpoint ?? `/var/lib/docker/volumes/${name}/_data`,
    CreatedAt: overrides.createdAt ?? "2024-01-01T00:00:00Z",
    Status: {},
    Labels: overrides.labels ?? {},
    Scope: overrides.scope ?? "local",
    Options: overrides.options ?? null,
  } as unknown as Dockerode.VolumeInspectInfo;

  return { name, info };
}
