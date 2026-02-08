import { describe, it, expect, afterEach, vi } from "vitest";
import { setDockerClient, resetDockerClient } from "@/lib/docker/client";
import { getDiskUsage, systemPrune } from "@/lib/docker/system";
import type { SystemPruneStep } from "@/lib/docker/system";
import {
  createContainerState,
  createDockerState,
  createImageState,
  createMockDocker,
  type DfData,
} from "@/test/mock-docker";

// systemPrune uses getDockerLongRunning() which creates a new client.
// We need to mock it to return our test client.
vi.mock("@/lib/docker/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/docker/client")>();
  return {
    ...original,
    getDockerLongRunning: () => original.getDocker(),
  };
});

afterEach(() => {
  resetDockerClient();
});

function setup(
  dfData: DfData = {},
  images: Parameters<typeof createImageState>[0][] = [],
  containers: Parameters<typeof createContainerState>[0][] = []
) {
  const imageStates = images.map((i) => createImageState(i));
  const containerStates = containers.map((c) => createContainerState(c));
  const dockerState = createDockerState(containerStates, { images: imageStates, dfData });
  setDockerClient(createMockDocker(dockerState));
  return { dockerState, imageStates, containerStates };
}

// ---------------------------------------------------------------------------
// getDiskUsage
// ---------------------------------------------------------------------------
describe("getDiskUsage", () => {
  it("calculates image reclaimable as size minus shared for unused images", async () => {
    setup({
      Images: [
        { Size: 100, SharedSize: 30, Containers: 0 }, // unused → 100-30=70 reclaimable
        { Size: 200, SharedSize: 50, Containers: 1 }, // in use → 0 reclaimable
      ],
      Containers: [],
      Volumes: [],
      BuildCache: [],
    });
    const result = await getDiskUsage();
    expect(result.images.reclaimable).toBe(70);
    expect(result.images.size).toBe(300);
  });

  it("clamps reclaimable to zero when SharedSize exceeds Size", async () => {
    setup({
      Images: [{ Size: 50, SharedSize: 100, Containers: 0 }],
      Containers: [],
      Volumes: [],
      BuildCache: [],
    });
    const result = await getDiskUsage();
    expect(result.images.reclaimable).toBe(0);
  });

  it("calculates volume reclaimable from unreferenced volumes", async () => {
    setup({
      Images: [],
      Containers: [],
      Volumes: [
        { Name: "used", UsageData: { Size: 500, RefCount: 2 } },
        { Name: "unused", UsageData: { Size: 300, RefCount: 0 } },
      ],
      BuildCache: [],
    });
    const result = await getDiskUsage();
    expect(result.volumes.reclaimable).toBe(300);
    expect(result.volumes.size).toBe(800);
  });

  it("calculates build cache reclaimable from non-InUse entries", async () => {
    setup({
      Images: [],
      Containers: [],
      Volumes: [],
      BuildCache: [
        { Size: 100, InUse: true },
        { Size: 200, InUse: false },
      ],
    });
    const result = await getDiskUsage();
    expect(result.buildCache.reclaimable).toBe(200);
    expect(result.buildCache.size).toBe(300);
  });

  it("sets container reclaimable equal to total container size", async () => {
    setup({
      Images: [],
      Containers: [{ SizeRw: 100 }, { SizeRw: 200 }],
      Volumes: [],
      BuildCache: [],
    });
    const result = await getDiskUsage();
    expect(result.containers.reclaimable).toBe(300);
    expect(result.containers.size).toBe(300);
  });

  it("sums total across all categories", async () => {
    setup({
      Images: [{ Size: 100, SharedSize: 0, Containers: 0 }],
      Containers: [{ SizeRw: 50 }],
      Volumes: [{ Name: "v", UsageData: { Size: 25, RefCount: 0 } }],
      BuildCache: [{ Size: 10, InUse: false }],
    });
    const result = await getDiskUsage();
    expect(result.totalSize).toBe(185);
  });

  it("falls back to list-based calculation when df throws", async () => {
    const imageStates = [createImageState({ repoTags: ["nginx:latest"], size: 100 })];
    const containerStates = [createContainerState({ state: "running" })];
    const dockerState = createDockerState(containerStates, { images: imageStates, dfData: {} });

    // Override df to throw
    const mockDocker = createMockDocker(dockerState);
    (mockDocker as unknown as Record<string, unknown>).df = (...args: unknown[]) => {
      const callback = args.find((a) => typeof a === "function") as
        | ((err: Error) => void)
        | undefined;
      if (callback) {
        callback(new Error("403 Forbidden"));
        return;
      }
      return Promise.reject(new Error("403 Forbidden"));
    };
    setDockerClient(mockDocker);

    const result = await getDiskUsage();
    // Fallback returns null for volumes and build cache
    expect(result.volumes.size).toBeNull();
    expect(result.buildCache.size).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getDiskUsageFromLists (tested via fallback path)
// ---------------------------------------------------------------------------
describe("getDiskUsageFromLists (via fallback)", () => {
  it("identifies dangling images by <none>:<none> tag", async () => {
    const imageStates = [
      createImageState({ repoTags: ["<none>:<none>"], size: 500 }),
      createImageState({ repoTags: ["nginx:latest"], size: 300 }),
    ];
    const containerStates: ReturnType<typeof createContainerState>[] = [];
    const dockerState = createDockerState(containerStates, { images: imageStates, dfData: {} });

    const mockDocker = createMockDocker(dockerState);
    (mockDocker as unknown as Record<string, unknown>).df = (...args: unknown[]) => {
      const callback = args.find((a) => typeof a === "function") as
        | ((err: Error) => void)
        | undefined;
      if (callback) {
        callback(new Error("blocked"));
        return;
      }
      return Promise.reject(new Error("blocked"));
    };
    setDockerClient(mockDocker);

    const result = await getDiskUsage();
    expect(result.images.reclaimable).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// systemPrune
// ---------------------------------------------------------------------------
describe("systemPrune", () => {
  it("only executes enabled steps", async () => {
    setup({}, [{ repoTags: ["nginx:latest"] }], [{ state: "exited" }]);

    const steps: SystemPruneStep[] = [];
    const result = await systemPrune(
      { containers: true, networks: false, images: false, volumes: false, buildCache: false },
      (step) => steps.push(step)
    );

    expect(steps).toEqual(["containers"]);
    expect(result.containersDeleted).toBe(1);
    expect(result.imagesDeleted).toBe(0);
  });

  it("calls onStep before each enabled step", async () => {
    setup({}, [], []);

    const steps: SystemPruneStep[] = [];
    await systemPrune(
      { containers: true, networks: true, images: true, volumes: true, buildCache: true },
      (step) => steps.push(step)
    );

    expect(steps).toEqual(["containers", "networks", "images", "volumes", "buildCache"]);
  });

  it("accumulates spaceReclaimed across steps", async () => {
    setup({}, [], [{ state: "exited" }]);

    const result = await systemPrune({
      containers: true,
      networks: false,
      images: false,
      volumes: false,
      buildCache: false,
    });

    // SpaceReclaimed from container prune is 0 in our mock
    expect(result.spaceReclaimed).toBe(0);
  });
});
