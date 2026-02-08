import { describe, it, expect, afterEach } from "vitest";
import { setDockerClient, resetDockerClient } from "@/lib/docker/client";
import { listVolumes, getVolume } from "@/lib/docker/volumes";
import {
  createContainerState,
  createDockerState,
  createVolumeState,
  createMockDocker,
  type DfData,
} from "@/test/mock-docker";
import type Dockerode from "dockerode";

afterEach(() => {
  resetDockerClient();
});

function createMount(name: string): Dockerode.MountSettings {
  return {
    Type: "volume",
    Name: name,
    Source: "",
    Destination: "/data",
    Driver: "local",
    Mode: "rw",
    RW: true,
    Propagation: "",
  } as unknown as Dockerode.MountSettings;
}

function setup(
  volumes: Parameters<typeof createVolumeState>[0][] = [],
  containers: Parameters<typeof createContainerState>[0][] = [],
  dfData: DfData = {}
) {
  const volumeStates = volumes.map((v) => createVolumeState(v));
  const containerStates = containers.map((c) => createContainerState(c));
  const dockerState = createDockerState(containerStates, { volumes: volumeStates, dfData });
  setDockerClient(createMockDocker(dockerState));
  return { dockerState, volumeStates, containerStates };
}

// ---------------------------------------------------------------------------
// listVolumes
// ---------------------------------------------------------------------------
describe("listVolumes", () => {
  it("joins size from df data by volume name", async () => {
    setup(
      [{ name: "data-vol" }],
      [],
      { Volumes: [{ Name: "data-vol", UsageData: { Size: 5000, RefCount: 1 } }] }
    );
    const result = await listVolumes();
    expect(result[0].size).toBe(5000);
  });

  it("returns null size when volume has no df entry", async () => {
    setup([{ name: "data-vol" }], [], {});
    const result = await listVolumes();
    expect(result[0].size).toBeNull();
  });

  it("still lists volumes when df is unavailable", async () => {
    const { dockerState } = setup(
      [{ name: "data-vol" }],
      [{ name: "app", mounts: [createMount("data-vol")] }],
      { Volumes: [{ Name: "data-vol", UsageData: { Size: 5000, RefCount: 1 } }] }
    );

    const docker = createMockDocker(dockerState) as unknown as Dockerode & { df: () => Promise<never> };
    docker.df = async () => {
      throw new Error("df unavailable");
    };
    setDockerClient(docker);

    const result = await listVolumes();
    expect(result[0].name).toBe("data-vol");
    expect(result[0].size).toBeNull();
    expect(result[0].containerCount).toBe(1);
  });

  it("counts containers per volume from container Mounts", async () => {
    setup(
      [{ name: "shared-vol" }],
      [
        { name: "app1", mounts: [createMount("shared-vol")] },
        { name: "app2", mounts: [createMount("shared-vol")] },
      ]
    );
    const result = await listVolumes();
    expect(result[0].containerCount).toBe(2);
  });

  it("sets canDelete only when containerCount is 0", async () => {
    setup(
      [{ name: "used-vol" }, { name: "free-vol" }],
      [{ name: "app", mounts: [createMount("used-vol")] }]
    );
    const result = await listVolumes();
    const used = result.find((v) => v.name === "used-vol");
    const free = result.find((v) => v.name === "free-vol");
    expect(used!.actions.canDelete).toBe(false);
    expect(free!.actions.canDelete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getVolume
// ---------------------------------------------------------------------------
describe("getVolume", () => {
  it("discovers containers mounting a specific volume", async () => {
    setup(
      [{ name: "my-vol" }],
      [{ name: "web", mounts: [createMount("my-vol")] }],
      { Volumes: [{ Name: "my-vol", UsageData: { Size: 1234, RefCount: 1 } }] }
    );
    const result = await getVolume("my-vol");
    expect(result!.containers).toHaveLength(1);
    expect(result!.containers[0].name).toBe("web");
    expect(result!.size).toBe(1234);
  });

  it("strips leading slash from container names", async () => {
    setup([{ name: "vol1" }], [{ name: "app", mounts: [createMount("vol1")] }]);
    const result = await getVolume("vol1");
    // Container names in mock have leading / in Names[0], getVolume strips it
    expect(result!.containers[0].name).not.toMatch(/^\//);
  });

  it("returns null for nonexistent volume", async () => {
    setup();
    const result = await getVolume("nonexistent");
    expect(result).toBeNull();
  });
});
