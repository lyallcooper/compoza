import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isDockerHub,
  getRegistryCredentials,
  getCredentialsForTokenEndpoint,
} from "../credentials";

beforeEach(() => {
  vi.unstubAllEnvs();
  // Re-import to reset module-level state (disabledRegistries Set)
});

// We need a fresh module for tests that call disableRegistryCredentials,
// since that mutates module-level state. We use dynamic imports for those.

// ---------------------------------------------------------------------------
// isDockerHub
// ---------------------------------------------------------------------------
describe("isDockerHub", () => {
  it("returns true for bare image name (official)", () => {
    expect(isDockerHub("nginx")).toBe(true);
  });

  it("returns true for user/repo on Docker Hub", () => {
    expect(isDockerHub("myuser/myapp")).toBe(true);
  });

  it("returns true for explicit docker.io prefix", () => {
    expect(isDockerHub("docker.io/user/repo")).toBe(true);
  });

  it("returns false for ghcr.io registry", () => {
    expect(isDockerHub("ghcr.io/user/repo")).toBe(false);
  });

  it("returns false for registry with port", () => {
    expect(isDockerHub("registry:5000/img")).toBe(false);
  });

  it("returns true for library/image format", () => {
    expect(isDockerHub("library/nginx")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRegistryCredentials
// ---------------------------------------------------------------------------
describe("getRegistryCredentials", () => {
  it("returns Docker Hub credentials from env vars", () => {
    vi.stubEnv("DOCKERHUB_USERNAME", "testuser");
    vi.stubEnv("DOCKERHUB_TOKEN", "testtoken");
    const creds = getRegistryCredentials("nginx");
    expect(creds).toEqual({ username: "testuser", token: "testtoken" });
  });

  it("returns GHCR credentials with username 'token'", () => {
    vi.stubEnv("GHCR_TOKEN", "ghp_test123");
    const creds = getRegistryCredentials("ghcr.io/owner/repo");
    expect(creds).toEqual({ username: "token", token: "ghp_test123" });
  });

  it("returns null when no env vars set", () => {
    vi.stubEnv("DOCKERHUB_USERNAME", "");
    vi.stubEnv("DOCKERHUB_TOKEN", "");
    vi.stubEnv("GHCR_TOKEN", "");
    const creds = getRegistryCredentials("nginx");
    expect(creds).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCredentialsForTokenEndpoint
// ---------------------------------------------------------------------------
describe("getCredentialsForTokenEndpoint", () => {
  it("returns Docker Hub credentials for URL containing 'docker'", () => {
    vi.stubEnv("DOCKERHUB_USERNAME", "user");
    vi.stubEnv("DOCKERHUB_TOKEN", "tok");
    const creds = getCredentialsForTokenEndpoint("https://auth.docker.io/token");
    expect(creds).toEqual({ username: "user", token: "tok" });
  });

  it("returns GHCR credentials for URL containing 'ghcr.io'", () => {
    vi.stubEnv("GHCR_TOKEN", "ghp_abc");
    const creds = getCredentialsForTokenEndpoint("https://ghcr.io/token");
    expect(creds).toEqual({ username: "token", token: "ghp_abc" });
  });

  it("returns null for unrelated URL", () => {
    const creds = getCredentialsForTokenEndpoint("https://quay.io/token");
    expect(creds).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// disableRegistryCredentials
// ---------------------------------------------------------------------------
describe("disableRegistryCredentials", () => {
  it("prevents credentials from being returned after disable", async () => {
    // Use dynamic import to get fresh module state
    vi.resetModules();
    const mod = await import("../credentials");

    vi.stubEnv("DOCKERHUB_USERNAME", "user");
    vi.stubEnv("DOCKERHUB_TOKEN", "tok");

    // Before disable: credentials available
    expect(mod.getRegistryCredentials("nginx")).not.toBeNull();

    // Disable
    mod.disableRegistryCredentials("dockerhub");

    // After disable: returns null
    expect(mod.getRegistryCredentials("nginx")).toBeNull();
  });
});
