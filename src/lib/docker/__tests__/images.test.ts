import { describe, it, expect, afterEach } from "vitest";
import { setDockerClient, resetDockerClient } from "@/lib/docker/client";
import { listImages, getImage, pruneImages } from "@/lib/docker/images";
import {
  createContainerState,
  createDockerState,
  createImageState,
  createMockDocker,
} from "@/test/mock-docker";

afterEach(() => {
  resetDockerClient();
});

function setup(
  images: Parameters<typeof createImageState>[0][] = [],
  containers: Parameters<typeof createContainerState>[0][] = []
) {
  const imageStates = images.map((i) => createImageState(i));
  const containerStates = containers.map((c) => createContainerState(c));
  const dockerState = createDockerState(containerStates, { images: imageStates });
  setDockerClient(createMockDocker(dockerState));
  return { dockerState, imageStates, containerStates };
}

// ---------------------------------------------------------------------------
// listImages
// ---------------------------------------------------------------------------
describe("listImages", () => {
  it("picks RepoTags[0] as name when tags exist", async () => {
    setup([{ repoTags: ["nginx:latest", "nginx:1.25"] }]);
    const result = await listImages();
    expect(result[0].name).toBe("nginx:latest");
  });

  it("falls back to RepoDigests name when no tags", async () => {
    setup([{ repoTags: [], repoDigests: ["nginx@sha256:abc123"] }]);
    const result = await listImages();
    expect(result[0].name).toBe("nginx");
  });

  it("falls back to short ID when no tags or digests", async () => {
    const { imageStates } = setup([{ repoTags: [], repoDigests: [] }]);
    const result = await listImages();
    // formatShortId strips sha256: prefix and takes first 12 chars
    const expectedId = imageStates[0].id.replace(/^sha256:/, "").slice(0, 12);
    expect(result[0].name).toBe(expectedId);
  });

  it("extracts digest from RepoDigests", async () => {
    setup([{ repoDigests: ["nginx@sha256:abc123def456"] }]);
    const result = await listImages();
    expect(result[0].digest).toBe("sha256:abc123def456");
  });
});

// ---------------------------------------------------------------------------
// getImage
// ---------------------------------------------------------------------------
describe("getImage", () => {
  it("parses Config.Env splitting on first = only", async () => {
    const { imageStates } = setup([{
      config: {
        Env: ["KEY=VALUE", "FOO=bar=baz", "EMPTY="],
      },
    }]);
    const result = await getImage(imageStates[0].id);
    expect(result!.config!.env).toEqual({
      KEY: "VALUE",
      FOO: "bar=baz",
      EMPTY: "",
    });
  });

  it("maps env var with no = sign to empty string", async () => {
    const { imageStates } = setup([{
      config: { Env: ["STANDALONE"] },
    }]);
    const result = await getImage(imageStates[0].id);
    expect(result!.config!.env).toEqual({ STANDALONE: "" });
  });

  it("normalizes null Entrypoint to undefined", async () => {
    const { imageStates } = setup([{
      config: { Entrypoint: null },
    }]);
    const result = await getImage(imageStates[0].id);
    expect(result!.config!.entrypoint).toBeUndefined();
  });

  it("filters healthcheck with NONE test to undefined", async () => {
    const { imageStates } = setup([{
      healthcheck: { Test: ["NONE"] },
    }]);
    const result = await getImage(imageStates[0].id);
    expect(result!.config!.healthcheck).toBeUndefined();
  });

  it("includes healthcheck when test is not NONE", async () => {
    const { imageStates } = setup([{
      healthcheck: { Test: ["CMD", "curl", "-f", "http://localhost/"] },
    }]);
    const result = await getImage(imageStates[0].id);
    expect(result!.config!.healthcheck).toEqual({
      test: ["CMD", "curl", "-f", "http://localhost/"],
    });
  });

  it("finds containers using this image by ImageID match", async () => {
    const imageId = "sha256:aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222";
    const { imageStates } = setup(
      [{ id: imageId }],
      [
        { name: "web", imageId },
        { name: "db", imageId: "sha256:different" },
      ]
    );
    const result = await getImage(imageStates[0].id);
    expect(result!.containers).toHaveLength(1);
    expect(result!.containers[0].name).toBe("web");
  });

  it("extracts exposed ports from Config", async () => {
    const { imageStates } = setup([{
      config: { ExposedPorts: { "80/tcp": {}, "443/tcp": {} } },
    }]);
    const result = await getImage(imageStates[0].id);
    expect(result!.config!.exposedPorts).toEqual(["80/tcp", "443/tcp"]);
  });

  it("returns null for nonexistent image", async () => {
    setup();
    const result = await getImage("sha256:nonexistent");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pruneImages
// ---------------------------------------------------------------------------
describe("pruneImages", () => {
  it("reports accurate image count delta after prune", async () => {
    setup([
      { repoTags: ["nginx:latest"] },
      { repoTags: ["<none>:<none>"] }, // dangling — will be pruned
    ]);
    const result = await pruneImages();
    expect(result.imagesDeleted).toBe(1);
  });

  it("reports zero when no dangling images", async () => {
    setup([{ repoTags: ["nginx:latest"] }]);
    const result = await pruneImages();
    expect(result.imagesDeleted).toBe(0);
  });
});
