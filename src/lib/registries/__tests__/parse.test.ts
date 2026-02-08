import { describe, it, expect } from "vitest";
import { parseImageRef, formatImageRef, getRegistryType } from "../parse";

// ---------------------------------------------------------------------------
// parseImageRef
// ---------------------------------------------------------------------------
describe("parseImageRef", () => {
  it("defaults bare name to docker.io/library with latest tag", () => {
    const ref = parseImageRef("nginx");
    expect(ref).toEqual({
      registry: "docker.io",
      namespace: "library",
      repository: "nginx",
      tag: "latest",
      digest: undefined,
    });
  });

  it("extracts explicit tag", () => {
    const ref = parseImageRef("nginx:1.25");
    expect(ref.tag).toBe("1.25");
    expect(ref.repository).toBe("nginx");
  });

  it("parses user/repo as Docker Hub with user namespace", () => {
    const ref = parseImageRef("myuser/myapp");
    expect(ref.registry).toBe("docker.io");
    expect(ref.namespace).toBe("myuser");
    expect(ref.repository).toBe("myapp");
    expect(ref.tag).toBe("latest");
  });

  it("parses user/repo:tag", () => {
    const ref = parseImageRef("myuser/myapp:v2");
    expect(ref.namespace).toBe("myuser");
    expect(ref.repository).toBe("myapp");
    expect(ref.tag).toBe("v2");
  });

  it("parses registry/namespace/repo", () => {
    const ref = parseImageRef("ghcr.io/org/app");
    expect(ref.registry).toBe("ghcr.io");
    expect(ref.namespace).toBe("org");
    expect(ref.repository).toBe("app");
  });

  it("parses registry with port", () => {
    const ref = parseImageRef("registry:5000/img");
    expect(ref.registry).toBe("registry:5000");
    expect(ref.repository).toBe("img");
  });

  it("extracts digest pin", () => {
    const ref = parseImageRef("nginx@sha256:abcdef1234567890");
    expect(ref.digest).toBe("sha256:abcdef1234567890");
    expect(ref.tag).toBe("latest");
    expect(ref.repository).toBe("nginx");
  });

  it("extracts both tag and digest", () => {
    const ref = parseImageRef("nginx:1.25@sha256:abcdef1234567890");
    expect(ref.tag).toBe("1.25");
    expect(ref.digest).toBe("sha256:abcdef1234567890");
  });

  it("parses nested namespace", () => {
    const ref = parseImageRef("gcr.io/my-project/sub/image:v1");
    expect(ref.registry).toBe("gcr.io");
    expect(ref.namespace).toBe("my-project/sub");
    expect(ref.repository).toBe("image");
    expect(ref.tag).toBe("v1");
  });

  it("treats localhost as a registry", () => {
    const ref = parseImageRef("localhost/myimage:dev");
    expect(ref.registry).toBe("localhost");
    expect(ref.repository).toBe("myimage");
  });

  it("treats domain with dot as registry in two-part reference", () => {
    const ref = parseImageRef("lscr.io/linuxserver");
    expect(ref.registry).toBe("lscr.io");
    expect(ref.repository).toBe("linuxserver");
  });
});

// ---------------------------------------------------------------------------
// formatImageRef
// ---------------------------------------------------------------------------
describe("formatImageRef", () => {
  it("strips docker.io/library prefix for Docker Hub official images", () => {
    const result = formatImageRef({
      registry: "docker.io",
      namespace: "library",
      repository: "nginx",
      tag: "latest",
    });
    expect(result).toBe("nginx:latest");
  });

  it("includes namespace for Docker Hub user images", () => {
    const result = formatImageRef({
      registry: "docker.io",
      namespace: "myuser",
      repository: "myapp",
      tag: "v2",
    });
    expect(result).toBe("myuser/myapp:v2");
  });

  it("includes full registry for non-Docker Hub images", () => {
    const result = formatImageRef({
      registry: "ghcr.io",
      namespace: "org",
      repository: "app",
      tag: "latest",
    });
    expect(result).toBe("ghcr.io/org/app:latest");
  });

  it("round-trips through parse and format for bare name", () => {
    const input = "nginx";
    const result = formatImageRef(parseImageRef(input));
    expect(result).toBe("nginx:latest");
  });

  it("round-trips through parse and format for registry image", () => {
    const input = "ghcr.io/owner/repo:v1.2.3";
    const result = formatImageRef(parseImageRef(input));
    expect(result).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// getRegistryType
// ---------------------------------------------------------------------------
describe("getRegistryType", () => {
  it("identifies docker.io as dockerhub", () => {
    expect(getRegistryType("docker.io")).toBe("dockerhub");
  });

  it("identifies registry.hub.docker.com as dockerhub", () => {
    expect(getRegistryType("registry.hub.docker.com")).toBe("dockerhub");
  });

  it("identifies ghcr.io as ghcr", () => {
    expect(getRegistryType("ghcr.io")).toBe("ghcr");
  });

  it("identifies lscr.io as lscr", () => {
    expect(getRegistryType("lscr.io")).toBe("lscr");
  });

  it("classifies unknown registries", () => {
    expect(getRegistryType("quay.io")).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(getRegistryType("Docker.IO")).toBe("dockerhub");
    expect(getRegistryType("GHCR.IO")).toBe("ghcr");
  });
});
