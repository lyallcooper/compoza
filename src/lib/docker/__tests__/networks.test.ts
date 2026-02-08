import { describe, it, expect, afterEach } from "vitest";
import { setDockerClient, resetDockerClient } from "@/lib/docker/client";
import { listNetworks, getNetwork } from "@/lib/docker/networks";
import {
  createContainerState,
  createDockerState,
  createNetworkState,
  createMockDocker,
} from "@/test/mock-docker";

afterEach(() => {
  resetDockerClient();
});

function setup(
  networks: Parameters<typeof createNetworkState>[0][] = [],
  containers: Parameters<typeof createContainerState>[0][] = []
) {
  const networkStates = networks.map((n) => createNetworkState(n));
  const containerStates = containers.map((c) => createContainerState(c));
  const dockerState = createDockerState(containerStates, { networks: networkStates });
  setDockerClient(createMockDocker(dockerState));
  return { dockerState, networkStates, containerStates };
}

// ---------------------------------------------------------------------------
// listNetworks
// ---------------------------------------------------------------------------
describe("listNetworks", () => {
  it("counts containers per network from container NetworkSettings", async () => {
    setup(
      [{ name: "mynet" }],
      [
        { name: "web", networks: { mynet: { IPAddress: "10.0.0.2" } as never } },
        { name: "db", networks: { mynet: { IPAddress: "10.0.0.3" } as never } },
      ]
    );
    const result = await listNetworks();
    const mynet = result.find((n) => n.name === "mynet");
    expect(mynet!.containerCount).toBe(2);
  });

  it("increments both network counts for container on two networks", async () => {
    setup(
      [{ name: "frontend" }, { name: "backend" }],
      [
        { name: "proxy", networks: {
          frontend: { IPAddress: "10.0.0.2" } as never,
          backend: { IPAddress: "10.1.0.2" } as never,
        }},
      ]
    );
    const result = await listNetworks();
    const frontend = result.find((n) => n.name === "frontend");
    const backend = result.find((n) => n.name === "backend");
    expect(frontend!.containerCount).toBe(1);
    expect(backend!.containerCount).toBe(1);
  });

  it("marks builtin networks as non-deletable", async () => {
    setup([{ name: "bridge" }, { name: "host" }, { name: "none" }]);
    const result = await listNetworks();
    expect(result.every((n) => n.actions.canDelete === false)).toBe(true);
  });

  it("marks user-created networks as deletable", async () => {
    setup([{ name: "custom-net" }]);
    const result = await listNetworks();
    expect(result[0].actions.canDelete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getNetwork
// ---------------------------------------------------------------------------
describe("getNetwork", () => {
  it("extracts container list from network inspect Containers map", async () => {
    setup([{
      name: "mynet",
      containers: {
        "abc123": { Name: "web", IPv4Address: "10.0.0.2/24", MacAddress: "02:42:0a:00:00:02" },
      },
    }]);
    const result = await getNetwork("mynet");
    expect(result!.containers).toHaveLength(1);
    expect(result!.containers[0]).toEqual({
      id: "abc123",
      name: "web",
      ipv4Address: "10.0.0.2/24",
      macAddress: "02:42:0a:00:00:02",
    });
  });

  it("returns null for nonexistent network", async () => {
    setup();
    const result = await getNetwork("nonexistent");
    expect(result).toBeNull();
  });
});

