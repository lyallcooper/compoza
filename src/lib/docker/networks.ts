import { getDocker } from "./client";
import type { DockerNetwork, NetworkContainer } from "@/types";

const BUILTIN_NETWORKS = ["bridge", "host", "none"];

function isBuiltinNetwork(name: string): boolean {
  return BUILTIN_NETWORKS.includes(name);
}

export async function listNetworks(): Promise<DockerNetwork[]> {
  const docker = getDocker();

  // Fetch networks and containers in parallel
  const [networks, containers] = await Promise.all([
    docker.listNetworks(),
    docker.listContainers({ all: true }),
  ]);

  // Build a map of network name -> container count
  const networkContainerCounts = new Map<string, number>();
  for (const container of containers) {
    const networkNames = Object.keys(container.NetworkSettings?.Networks || {});
    for (const networkName of networkNames) {
      networkContainerCounts.set(
        networkName,
        (networkContainerCounts.get(networkName) || 0) + 1
      );
    }
  }

  return networks.map((net) => {
    const ipamConfig = net.IPAM?.Config?.[0];
    return {
      id: net.Id,
      name: net.Name,
      driver: net.Driver || "unknown",
      scope: (net.Scope as DockerNetwork["scope"]) || "local",
      internal: net.Internal || false,
      attachable: net.Attachable || false,
      ipam: ipamConfig
        ? {
            subnet: ipamConfig.Subnet,
            gateway: ipamConfig.Gateway,
          }
        : null,
      containerCount: networkContainerCounts.get(net.Name) || 0,
      containers: [], // Not populated for list view
      options: net.Options || {},
      labels: net.Labels || {},
      created: net.Created || "",
      actions: {
        canDelete: !isBuiltinNetwork(net.Name),
      },
    };
  });
}

export async function getNetwork(id: string): Promise<DockerNetwork | null> {
  const docker = getDocker();

  try {
    const network = docker.getNetwork(id);
    const info = await network.inspect();

    const ipamConfig = info.IPAM?.Config?.[0];
    const containers: NetworkContainer[] = Object.entries(
      info.Containers || {}
    ).map(([containerId, containerInfo]) => ({
      id: containerId,
      name: (containerInfo as { Name?: string }).Name || "",
      ipv4Address: (containerInfo as { IPv4Address?: string }).IPv4Address || "",
      macAddress: (containerInfo as { MacAddress?: string }).MacAddress || "",
    }));

    return {
      id: info.Id,
      name: info.Name,
      driver: info.Driver || "unknown",
      scope: (info.Scope as DockerNetwork["scope"]) || "local",
      internal: info.Internal || false,
      attachable: info.Attachable || false,
      ipam: ipamConfig
        ? {
            subnet: ipamConfig.Subnet,
            gateway: ipamConfig.Gateway,
          }
        : null,
      containerCount: containers.length,
      containers,
      options: info.Options || {},
      labels: info.Labels || {},
      created: info.Created || "",
      actions: {
        canDelete: !isBuiltinNetwork(info.Name),
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

export interface CreateNetworkOptions {
  name: string;
  driver?: string;
  subnet?: string;
  gateway?: string;
}

export async function createNetwork(options: CreateNetworkOptions): Promise<void> {
  const docker = getDocker();
  const { name, driver = "bridge", subnet, gateway } = options;

  const networkConfig: {
    Name: string;
    Driver: string;
    IPAM?: {
      Config: Array<{ Subnet?: string; Gateway?: string }>;
    };
  } = {
    Name: name,
    Driver: driver,
  };

  if (subnet || gateway) {
    networkConfig.IPAM = {
      Config: [
        {
          ...(subnet && { Subnet: subnet }),
          ...(gateway && { Gateway: gateway }),
        },
      ],
    };
  }

  await docker.createNetwork(networkConfig);
}

export async function removeNetwork(id: string): Promise<void> {
  const docker = getDocker();
  const network = docker.getNetwork(id);
  await network.remove();
}

export interface NetworkPruneResult {
  networksDeleted: string[];
}

export async function pruneNetworks(): Promise<NetworkPruneResult> {
  const docker = getDocker();
  const result = await docker.pruneNetworks();

  return {
    networksDeleted: result.NetworksDeleted || [],
  };
}
