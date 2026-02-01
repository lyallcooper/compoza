import { getDocker } from "./client";
import type { Container, ContainerStats, PortMapping } from "@/types";

export async function listContainers(all = true): Promise<Container[]> {
  const docker = getDocker();
  const containers = await docker.listContainers({ all });

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
    // Sort: published ports first (by host port), then unpublished (by container port), TCP before UDP
    ports.sort((a, b) => {
      if (a.host && !b.host) return -1;
      if (!a.host && b.host) return 1;
      const portCompare = a.host && b.host
        ? a.host - b.host
        : a.container - b.container;
      if (portCompare !== 0) return portCompare;
      // TCP before UDP as tiebreaker
      if (a.protocol === "tcp" && b.protocol !== "tcp") return -1;
      if (a.protocol !== "tcp" && b.protocol === "tcp") return 1;
      return 0;
    });

    const labels = c.Labels || {};
    const projectName = labels["com.docker.compose.project"];
    const serviceName = labels["com.docker.compose.service"];

    return {
      id: c.Id,
      name: c.Names[0]?.replace(/^\//, "") || c.Id.slice(0, 12),
      image: c.Image,
      imageId: c.ImageID,
      status: c.Status,
      state: c.State as Container["state"],
      created: c.Created,
      ports,
      labels,
      projectName,
      serviceName,
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
    for (const [containerPort, hostPorts] of Object.entries(portBindings)) {
      const [port, protocol] = containerPort.split("/");
      const bindings = hostPorts as Array<{ HostIp: string; HostPort: string }> | null;
      if (bindings && bindings.length > 0) {
        ports.push({
          container: parseInt(port, 10),
          host: parseInt(bindings[0].HostPort, 10),
          protocol: (protocol as "tcp" | "udp") || "tcp",
        });
      }
    }

    const labels = info.Config.Labels || {};
    const projectName = labels["com.docker.compose.project"];
    const serviceName = labels["com.docker.compose.service"];

    return {
      id: info.Id,
      name: info.Name.replace(/^\//, ""),
      image: info.Config.Image,
      imageId: info.Image,
      status: info.State.Status,
      state: info.State.Status as Container["state"],
      created: new Date(info.Created).getTime() / 1000,
      ports,
      labels,
      projectName,
      serviceName,
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
