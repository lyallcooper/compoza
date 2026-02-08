import { describe, it, expect, afterEach } from "vitest";
import { setDockerClient, resetDockerClient } from "@/lib/docker/client";
import {
  listContainers,
  getContainer,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  getContainerStats,
  streamContainerLogs,
  pruneContainers,
} from "@/lib/docker/containers";
import {
  createContainerState,
  createDockerState,
  createMockDocker,
} from "@/test/mock-docker";

afterEach(() => {
  resetDockerClient();
});

function setup(...containers: Parameters<typeof createContainerState>[0][]) {
  const states = containers.map((c) => createContainerState(c));
  const dockerState = createDockerState(states);
  setDockerClient(createMockDocker(dockerState));
  return { dockerState, states };
}

// ---------------------------------------------------------------------------
// listContainers
// ---------------------------------------------------------------------------
describe("listContainers", () => {
  it("returns all containers with correct names stripped of leading slash", async () => {
    setup({ name: "web" }, { name: "db" });
    const result = await listContainers();
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(["web", "db"]);
  });

  it("resolves stale image to Config.Image value", async () => {
    // Simulate what Docker does: container.Image = sha256:..., but Config.Image = original tag
    const cs = createContainerState({
      name: "stale",
      image: "nginx:latest",
    });
    // Override listInfo.Image to be sha256: (simulating a stale tag)
    cs.listInfo.Image = "sha256:deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678";
    // Config.Image stays "nginx:latest" — this is what should be resolved to
    const dockerState = createDockerState([cs]);
    setDockerClient(createMockDocker(dockerState));

    const result = await listContainers();
    expect(result[0].image).toBe("nginx:latest");
  });

  it("deduplicates IPv4/IPv6 port bindings", async () => {
    setup({
      name: "web",
      ports: [
        { IP: "0.0.0.0", PrivatePort: 80, PublicPort: 8080, Type: "tcp" },
        { IP: "::", PrivatePort: 80, PublicPort: 8080, Type: "tcp" },
      ],
    });
    const result = await listContainers();
    expect(result[0].ports).toHaveLength(1);
    expect(result[0].ports[0]).toEqual({ container: 80, host: 8080, protocol: "tcp" });
  });

  it("sorts ports: published first, then by number, TCP before UDP", async () => {
    setup({
      name: "multi",
      ports: [
        { IP: "", PrivatePort: 443, Type: "tcp" },
        { IP: "0.0.0.0", PrivatePort: 80, PublicPort: 8080, Type: "tcp" },
        { IP: "0.0.0.0", PrivatePort: 53, PublicPort: 5353, Type: "udp" },
        { IP: "0.0.0.0", PrivatePort: 53, PublicPort: 5353, Type: "tcp" },
      ],
    });
    const result = await listContainers();
    const ports = result[0].ports;
    // Published first, sorted by host port: 5353 tcp, 5353 udp, 8080 tcp, then unpublished 443
    expect(ports[0]).toEqual({ container: 53, host: 5353, protocol: "tcp" });
    expect(ports[1]).toEqual({ container: 53, host: 5353, protocol: "udp" });
    expect(ports[2]).toEqual({ container: 80, host: 8080, protocol: "tcp" });
    expect(ports[3]).toEqual({ container: 443, protocol: "tcp" });
  });

  it("computes actions for running containers", async () => {
    setup({ name: "running", state: "running" });
    const result = await listContainers();
    expect(result[0].actions).toEqual({
      canStart: false,
      canStop: true,
      canRestart: true,
      canUpdate: false, // standalone
      canViewLogs: true,
      canExec: true,
    });
  });

  it("computes actions for exited containers", async () => {
    setup({ name: "stopped", state: "exited" });
    const result = await listContainers();
    expect(result[0].actions).toEqual({
      canStart: true,
      canStop: false,
      canRestart: false,
      canUpdate: false,
      canViewLogs: true,
      canExec: false,
    });
  });

  it("computes actions for dead containers", async () => {
    setup({ name: "dead", state: "dead" });
    const result = await listContainers();
    expect(result[0].actions).toEqual({
      canStart: false,
      canStop: false,
      canRestart: false,
      canUpdate: false, // dead = !canOperate, so canUpdate is false even for compose
      canViewLogs: true,
      canExec: false,
    });
  });

  it("sets compose updateStrategy and canUpdate for compose-managed containers", async () => {
    setup({
      name: "compose-svc",
      state: "running",
      labels: {
        "com.docker.compose.project": "myproject",
        "com.docker.compose.service": "web",
      },
    });
    const result = await listContainers();
    expect(result[0].updateStrategy).toBe("compose");
    expect(result[0].actions.canUpdate).toBe(true);
    expect(result[0].projectName).toBe("myproject");
    expect(result[0].serviceName).toBe("web");
  });

  it("sets standalone updateStrategy when compose labels are absent", async () => {
    setup({ name: "standalone" });
    const result = await listContainers();
    expect(result[0].updateStrategy).toBe("standalone");
    expect(result[0].actions.canUpdate).toBe(false);
  });

  it("includes health data only when includeHealth is true", async () => {
    setup({
      name: "healthy",
      health: { Status: "healthy", FailingStreak: 0 },
    });

    const withoutHealth = await listContainers({ includeHealth: false });
    expect(withoutHealth[0].health).toBeUndefined();

    const withHealth = await listContainers({ includeHealth: true });
    expect(withHealth[0].health).toEqual({ status: "healthy", failingStreak: 0 });
  });

  it("includes restartCount and startedAt when includeHealth is true", async () => {
    setup({
      name: "restarting",
      restartCount: 5,
      startedAt: "2024-06-15T10:30:00Z",
    });

    const result = await listContainers({ includeHealth: true });
    expect(result[0].restartCount).toBe(5);
    expect(result[0].startedAt).toBe(new Date("2024-06-15T10:30:00Z").getTime() / 1000);
  });

  it("normalizes docker.io/ prefixed image names", async () => {
    setup({ name: "normalized", image: "docker.io/library/nginx:latest" });
    const result = await listContainers();
    expect(result[0].image).toBe("nginx:latest");
  });
});

// ---------------------------------------------------------------------------
// getContainer
// ---------------------------------------------------------------------------
describe("getContainer", () => {
  it("parses env vars from Config.Env string array", async () => {
    const { states } = setup({
      name: "envtest",
      env: ["FOO=bar", "BAZ=qux=extra", "EMPTY="],
    });
    const result = await getContainer(states[0].id);
    expect(result).not.toBeNull();
    expect(result!.env).toEqual({
      FOO: "bar",
      BAZ: "qux=extra",
      EMPTY: "",
    });
  });

  it("merges port bindings and exposed-only ports", async () => {
    const { states } = setup({
      name: "porttest",
      portBindings: {
        "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }],
      },
      exposedPorts: {
        "80/tcp": {},
        "443/tcp": {},
      },
    });
    const result = await getContainer(states[0].id);
    expect(result).not.toBeNull();
    // 80/tcp is bound → included with host port. 443/tcp is exposed-only.
    const port80 = result!.ports.find((p) => p.container === 80);
    const port443 = result!.ports.find((p) => p.container === 443);
    expect(port80).toEqual({ container: 80, host: 8080, protocol: "tcp" });
    expect(port443).toEqual({ container: 443, protocol: "tcp" });
  });

  it("returns null on error (nonexistent container)", async () => {
    setup();
    const result = await getContainer("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns mounts from inspect response", async () => {
    const { states } = setup({
      name: "mounttest",
      mounts: [
        {
          Type: "volume",
          Name: "data-vol",
          Source: "/var/lib/docker/volumes/data-vol/_data",
          Destination: "/data",
          Driver: "local",
          Mode: "rw",
          RW: true,
          Propagation: "",
        } as unknown as import("dockerode").MountSettings,
      ],
    });
    const result = await getContainer(states[0].id);
    expect(result!.mounts).toHaveLength(1);
    expect(result!.mounts[0]).toMatchObject({
      type: "volume",
      name: "data-vol",
      destination: "/data",
      rw: true,
    });
  });

  it("returns networks from inspect response", async () => {
    const { states } = setup({
      name: "nettest",
      networks: {
        mynet: {
          IPAMConfig: null,
          Links: null,
          Aliases: null,
          NetworkID: "net123",
          EndpointID: "ep123",
          Gateway: "172.18.0.1",
          IPAddress: "172.18.0.5",
          IPPrefixLen: 16,
          IPv6Gateway: "",
          GlobalIPv6Address: "",
          GlobalIPv6PrefixLen: 0,
          MacAddress: "02:42:ac:12:00:05",
        },
      },
    });
    const result = await getContainer(states[0].id);
    expect(result!.networks).toHaveLength(1);
    expect(result!.networks[0]).toMatchObject({
      name: "mynet",
      ipAddress: "172.18.0.5",
      gateway: "172.18.0.1",
      macAddress: "02:42:ac:12:00:05",
    });
  });

  it("returns health data when present", async () => {
    const { states } = setup({
      name: "healthtest",
      health: { Status: "unhealthy", FailingStreak: 3 },
    });
    const result = await getContainer(states[0].id);
    expect(result!.health).toEqual({ status: "unhealthy", failingStreak: 3 });
  });

  it("sets compose fields from labels", async () => {
    const { states } = setup({
      name: "compose-test",
      labels: {
        "com.docker.compose.project": "proj",
        "com.docker.compose.service": "svc",
      },
    });
    const result = await getContainer(states[0].id);
    expect(result!.projectName).toBe("proj");
    expect(result!.serviceName).toBe("svc");
    expect(result!.updateStrategy).toBe("compose");
  });
});

// ---------------------------------------------------------------------------
// startContainer / stopContainer / restartContainer
// ---------------------------------------------------------------------------
describe("container lifecycle operations", () => {
  it("startContainer changes state from exited to running", async () => {
    const { states } = setup({ name: "stopped", state: "exited" });
    await startContainer(states[0].id);
    const result = await getContainer(states[0].id);
    expect(result!.state).toBe("running");
  });

  it("stopContainer changes state from running to exited", async () => {
    const { states } = setup({ name: "running", state: "running" });
    await stopContainer(states[0].id);
    const result = await getContainer(states[0].id);
    expect(result!.state).toBe("exited");
  });

  it("restartContainer sets state to running", async () => {
    const { states } = setup({ name: "running", state: "running" });
    await restartContainer(states[0].id);
    const result = await getContainer(states[0].id);
    expect(result!.state).toBe("running");
  });
});

// ---------------------------------------------------------------------------
// removeContainer
// ---------------------------------------------------------------------------
describe("removeContainer", () => {
  it("removes container from state", async () => {
    const { states } = setup({ name: "victim" });
    await removeContainer(states[0].id);
    const result = await getContainer(states[0].id);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getContainerStats
// ---------------------------------------------------------------------------
describe("getContainerStats", () => {
  it("calculates CPU percentage correctly", async () => {
    const { states } = setup({
      name: "stats",
      stats: {
        cpu_stats: {
          cpu_usage: { total_usage: 500000000, percpu_usage: [], usage_in_kernelmode: 0, usage_in_usermode: 0 },
          system_cpu_usage: 10000000000,
          online_cpus: 4,
          throttling_data: { periods: 0, throttled_periods: 0, throttled_time: 0 },
        },
        precpu_stats: {
          cpu_usage: { total_usage: 400000000, percpu_usage: [], usage_in_kernelmode: 0, usage_in_usermode: 0 },
          system_cpu_usage: 9000000000,
          online_cpus: 4,
          throttling_data: { periods: 0, throttled_periods: 0, throttled_time: 0 },
        },
      },
    });
    const result = await getContainerStats(states[0].id);
    // cpuDelta = 100000000, systemDelta = 1000000000, cpuCount = 4
    // (100000000 / 1000000000) * 4 * 100 = 40%
    expect(result.cpuPercent).toBeCloseTo(40, 5);
  });

  it("calculates memory percentage correctly", async () => {
    const { states } = setup({
      name: "memstats",
      stats: {
        memory_stats: {
          usage: 524288000, // 500 MiB
          limit: 1073741824, // 1 GiB
          max_usage: 524288000,
          stats: {},
        },
      },
    });
    const result = await getContainerStats(states[0].id);
    // 524288000 / 1073741824 * 100 ≈ 48.83%
    expect(result.memoryUsage).toBe(524288000);
    expect(result.memoryLimit).toBe(1073741824);
    expect(result.memoryPercent).toBeCloseTo(48.828, 1);
  });

  it("sums network Rx/Tx across multiple interfaces", async () => {
    const { states } = setup({
      name: "netstats",
      stats: {
        networks: {
          eth0: { rx_bytes: 1000, tx_bytes: 2000, rx_packets: 0, tx_packets: 0, rx_errors: 0, tx_errors: 0, rx_dropped: 0, tx_dropped: 0 },
          eth1: { rx_bytes: 3000, tx_bytes: 4000, rx_packets: 0, tx_packets: 0, rx_errors: 0, tx_errors: 0, rx_dropped: 0, tx_dropped: 0 },
        },
      },
    });
    const result = await getContainerStats(states[0].id);
    expect(result.networkRx).toBe(4000);
    expect(result.networkTx).toBe(6000);
  });

  it("handles case-insensitive block I/O op names", async () => {
    const { states } = setup({
      name: "blkstats",
      stats: {
        blkio_stats: {
          io_service_bytes_recursive: [
            { major: 8, minor: 0, op: "Read", value: 100 },
            { major: 8, minor: 0, op: "read", value: 200 },
            { major: 8, minor: 0, op: "Write", value: 300 },
            { major: 8, minor: 0, op: "write", value: 400 },
          ],
          io_serviced_recursive: [],
          io_queue_recursive: [],
          io_service_time_recursive: [],
          io_wait_time_recursive: [],
          io_merged_recursive: [],
          io_time_recursive: [],
          sectors_recursive: [],
        },
      },
    });
    const result = await getContainerStats(states[0].id);
    expect(result.blockRead).toBe(300);
    expect(result.blockWrite).toBe(700);
  });

  it("returns zero CPU when systemDelta is zero", async () => {
    const { states } = setup({
      name: "zerocpu",
      stats: {
        cpu_stats: {
          cpu_usage: { total_usage: 100, percpu_usage: [], usage_in_kernelmode: 0, usage_in_usermode: 0 },
          system_cpu_usage: 5000,
          online_cpus: 2,
          throttling_data: { periods: 0, throttled_periods: 0, throttled_time: 0 },
        },
        precpu_stats: {
          cpu_usage: { total_usage: 100, percpu_usage: [], usage_in_kernelmode: 0, usage_in_usermode: 0 },
          system_cpu_usage: 5000,
          online_cpus: 2,
          throttling_data: { periods: 0, throttled_periods: 0, throttled_time: 0 },
        },
      },
    });
    const result = await getContainerStats(states[0].id);
    expect(result.cpuPercent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// streamContainerLogs
// ---------------------------------------------------------------------------
describe("streamContainerLogs", () => {
  it("yields correctly demultiplexed lines from Docker binary format", async () => {
    const { states } = setup({
      name: "logtest",
      logs: ["2024-01-01T00:00:00Z line one\n", "2024-01-01T00:00:01Z line two\n"],
    });

    const lines: string[] = [];
    for await (const line of streamContainerLogs(states[0].id)) {
      lines.push(line);
    }
    expect(lines).toEqual([
      "2024-01-01T00:00:00Z line one\n",
      "2024-01-01T00:00:01Z line two\n",
    ]);
  });

  it("handles empty log output", async () => {
    const { states } = setup({ name: "emptylog", logs: [] });
    const lines: string[] = [];
    for await (const line of streamContainerLogs(states[0].id)) {
      lines.push(line);
    }
    expect(lines).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// pruneContainers
// ---------------------------------------------------------------------------
describe("pruneContainers", () => {
  it("removes exited containers and returns count", async () => {
    setup(
      { name: "running", state: "running" },
      { name: "exited1", state: "exited" },
      { name: "exited2", state: "exited" },
    );
    const result = await pruneContainers();
    expect(result.containersDeleted).toBe(2);

    const remaining = await listContainers();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("running");
  });

  it("returns zero when no containers to prune", async () => {
    setup({ name: "running", state: "running" });
    const result = await pruneContainers();
    expect(result.containersDeleted).toBe(0);
  });
});
