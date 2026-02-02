import { getDocker } from "./client";
import type { Container, ContainerStats, PortMapping, ContainerUpdateStrategy, ContainerActions, ContainerHealth } from "@/types";

/**
 * Determine the update strategy for a container based on its labels.
 */
function getUpdateStrategy(projectName?: string, serviceName?: string): ContainerUpdateStrategy {
  return projectName && serviceName ? "compose" : "standalone";
}

/**
 * Compute available actions based on container state and update strategy.
 */
function getContainerActions(
  state: Container["state"],
  updateStrategy: ContainerUpdateStrategy
): ContainerActions {
  const isRunning = state === "running";
  const isStopped = state === "exited" || state === "created";
  const canOperate = state !== "removing" && state !== "dead";

  return {
    canStart: isStopped,
    canStop: isRunning,
    canRestart: isRunning,
    canUpdate: updateStrategy === "compose" && canOperate,
    canViewLogs: true, // Can always view logs
    canExec: isRunning,
  };
}

/**
 * Sort ports: published first (by host port), then unpublished (by container port), TCP before UDP.
 */
function sortPorts(ports: PortMapping[]): PortMapping[] {
  return [...ports].sort((a, b) => {
    if (a.host && !b.host) return -1;
    if (!a.host && b.host) return 1;
    const portCompare = a.host && b.host
      ? a.host - b.host
      : a.container - b.container;
    if (portCompare !== 0) return portCompare;
    if (a.protocol === "tcp" && b.protocol !== "tcp") return -1;
    if (a.protocol !== "tcp" && b.protocol === "tcp") return 1;
    return 0;
  });
}

/**
 * Parse health status from Docker API response.
 */
function parseHealthStatus(status?: string): ContainerHealth["status"] {
  if (!status) return "none";
  const normalized = status.toLowerCase();
  if (normalized === "healthy") return "healthy";
  if (normalized === "unhealthy") return "unhealthy";
  if (normalized === "starting") return "starting";
  return "none";
}

export interface ListContainersOptions {
  all?: boolean;
  includeHealth?: boolean;
}

export async function listContainers(options: ListContainersOptions = {}): Promise<Container[]> {
  const { all = true, includeHealth = false } = options;
  const docker = getDocker();
  const containers = await docker.listContainers({ all });

  // Only fetch detailed info when health data is requested (adds N API calls)
  let detailMap = new Map<string, {
    restartCount: number;
    health?: ContainerHealth;
    exitCode?: number;
  }>();

  if (includeHealth) {
    const detailedInfo = await Promise.all(
      containers.map(async (c) => {
        try {
          const container = docker.getContainer(c.Id);
          const info = await container.inspect();
          return {
            id: c.Id,
            restartCount: info.RestartCount ?? 0,
            health: info.State.Health
              ? {
                  status: parseHealthStatus(info.State.Health.Status),
                  failingStreak: info.State.Health.FailingStreak,
                }
              : undefined,
            exitCode: info.State.ExitCode,
          };
        } catch {
          return { id: c.Id, restartCount: 0, health: undefined, exitCode: undefined };
        }
      })
    );
    detailMap = new Map(detailedInfo.map((d) => [d.id, d]));
  }

  return containers.map((c) => {
    // Deduplicate ports (Docker returns duplicates for IPv4/IPv6 bindings)
    const seenPorts = new Set<string>();
    const ports: PortMapping[] = [];
    for (const p of c.Ports || []) {
      const key = `${p.PublicPort || ""}:${p.PrivatePort}/${p.Type || "tcp"}`;
      if (!seenPorts.has(key)) {
        seenPorts.add(key);
        ports.push({
          container: p.PrivatePort,
          host: p.PublicPort,
          protocol: (p.Type as "tcp" | "udp") || "tcp",
        });
      }
    }

    const labels = c.Labels || {};
    const projectName = labels["com.docker.compose.project"];
    const serviceName = labels["com.docker.compose.service"];
    const state = c.State as Container["state"];
    const updateStrategy = getUpdateStrategy(projectName, serviceName);
    const detail = detailMap.get(c.Id);

    return {
      id: c.Id,
      name: c.Names[0]?.replace(/^\//, "") || c.Id.slice(0, 12),
      image: c.Image,
      imageId: c.ImageID,
      status: c.Status,
      state,
      created: c.Created,
      ports: sortPorts(ports),
      labels,
      projectName,
      serviceName,
      updateStrategy,
      actions: getContainerActions(state, updateStrategy),
      restartCount: detail?.restartCount,
      health: detail?.health,
      exitCode: detail?.exitCode,
    };
  });
}

export async function getContainer(id: string): Promise<Container | null> {
  const docker = getDocker();
  try {
    const container = docker.getContainer(id);
    const info = await container.inspect();

    const ports: PortMapping[] = [];
    const portBindings = info.HostConfig.PortBindings || {};
    const exposedPorts = info.Config.ExposedPorts || {};
    const boundPorts = new Set<string>();

    // First, add all host-bound ports
    for (const [containerPort, hostPorts] of Object.entries(portBindings)) {
      const [port, protocol] = containerPort.split("/");
      const bindings = hostPorts as Array<{ HostIp: string; HostPort: string }> | null;
      if (bindings && bindings.length > 0) {
        boundPorts.add(containerPort);
        ports.push({
          container: parseInt(port, 10),
          host: parseInt(bindings[0].HostPort, 10),
          protocol: (protocol as "tcp" | "udp") || "tcp",
        });
      }
    }

    // Then add exposed-only ports (not bound to host)
    for (const containerPort of Object.keys(exposedPorts)) {
      if (!boundPorts.has(containerPort)) {
        const [port, protocol] = containerPort.split("/");
        ports.push({
          container: parseInt(port, 10),
          protocol: (protocol as "tcp" | "udp") || "tcp",
        });
      }
    }

    const labels = info.Config.Labels || {};
    const projectName = labels["com.docker.compose.project"];
    const serviceName = labels["com.docker.compose.service"];
    const state = info.State.Status as Container["state"];
    const updateStrategy = getUpdateStrategy(projectName, serviceName);

    return {
      id: info.Id,
      name: info.Name.replace(/^\//, ""),
      image: info.Config.Image,
      imageId: info.Image,
      status: info.State.Status,
      state,
      created: new Date(info.Created).getTime() / 1000,
      ports: sortPorts(ports),
      labels,
      projectName,
      serviceName,
      updateStrategy,
      actions: getContainerActions(state, updateStrategy),
      restartCount: info.RestartCount ?? 0,
      health: info.State.Health
        ? {
            status: parseHealthStatus(info.State.Health.Status),
            failingStreak: info.State.Health.FailingStreak,
          }
        : undefined,
      exitCode: info.State.ExitCode,
    };
  } catch (error) {
    console.error(`[Docker] Failed to get container ${id}:`, error);
    return null;
  }
}

export async function startContainer(id: string): Promise<void> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  await container.start();
}

export async function stopContainer(id: string): Promise<void> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  await container.stop();
}

export async function restartContainer(id: string): Promise<void> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  await container.restart();
}

export async function removeContainer(id: string, force = false): Promise<void> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  await container.remove({ force });
}

export async function getContainerStats(id: string): Promise<ContainerStats> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  const stats = await container.stats({ stream: false });

  // Calculate CPU percentage
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || 1;
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

  // Memory
  const memoryUsage = stats.memory_stats.usage || 0;
  const memoryLimit = stats.memory_stats.limit || 1;
  const memoryPercent = (memoryUsage / memoryLimit) * 100;

  // Network
  let networkRx = 0;
  let networkTx = 0;
  if (stats.networks) {
    for (const net of Object.values(stats.networks)) {
      networkRx += (net as { rx_bytes: number }).rx_bytes || 0;
      networkTx += (net as { tx_bytes: number }).tx_bytes || 0;
    }
  }

  // Block I/O
  let blockRead = 0;
  let blockWrite = 0;
  if (stats.blkio_stats?.io_service_bytes_recursive) {
    for (const entry of stats.blkio_stats.io_service_bytes_recursive) {
      if (entry.op === "read" || entry.op === "Read") {
        blockRead += entry.value;
      } else if (entry.op === "write" || entry.op === "Write") {
        blockWrite += entry.value;
      }
    }
  }

  return {
    cpuPercent,
    memoryUsage,
    memoryLimit,
    memoryPercent,
    networkRx,
    networkTx,
    blockRead,
    blockWrite,
  };
}

export async function* streamContainerLogs(
  id: string,
  options: { follow?: boolean; tail?: number; since?: number } = {}
): AsyncGenerator<string, void, unknown> {
  const docker = getDocker();
  const container = docker.getContainer(id);

  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: options.tail ?? 100,
    since: options.since,
    timestamps: true,
  } as const);

  // Docker multiplexes stdout/stderr - header is 8 bytes: [stream type, 0, 0, 0, size (4 bytes)]
  let buffer = Buffer.alloc(0);

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 8) {
      const size = buffer.readUInt32BE(4);
      if (buffer.length < 8 + size) break;

      const line = buffer.subarray(8, 8 + size).toString("utf8");
      buffer = buffer.subarray(8 + size);

      yield line;
    }
  }
}
