import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Dirent, Stats } from "node:fs";

// Mock fs/promises before any imports
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

// Mock docker container listing
vi.mock("@/lib/docker", () => ({
  listContainers: vi.fn().mockResolvedValue([]),
}));

import { readdir, readFile, stat } from "node:fs/promises";
import { listContainers } from "@/lib/docker";
import { isValidProjectName, toHostPath, scanProjects, getProject } from "../scanner";

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);
const mockListContainers = vi.mocked(listContainers);

beforeEach(() => {
  vi.stubEnv("PROJECTS_DIR", "/data/projects");
  vi.stubEnv("HOST_PROJECTS_DIR", "/data/projects");
  mockReaddir.mockReset();
  mockReadFile.mockReset();
  mockStat.mockReset();
  mockListContainers.mockReset();
  mockListContainers.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function createDirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: "/data/projects",
    parentPath: "/data/projects",
  } as Dirent;
}

// Helper: make stat succeed for compose.yaml only (first compose filename)
function mockComposeFileExists() {
  mockStat.mockImplementation(async (path) => {
    const p = String(path);
    if (p.endsWith("compose.yaml")) {
      return { isFile: () => true, isDirectory: () => false } as Stats;
    }
    throw new Error("ENOENT");
  });
}

// ---------------------------------------------------------------------------
// isValidProjectName
// ---------------------------------------------------------------------------
describe("isValidProjectName", () => {
  it("accepts alphanumeric with hyphens and underscores", () => {
    expect(isValidProjectName("my-project")).toBe(true);
    expect(isValidProjectName("app_v2")).toBe(true);
    expect(isValidProjectName("test123")).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    expect(isValidProjectName("../escape")).toBe(false);
    expect(isValidProjectName("./hidden")).toBe(false);
    expect(isValidProjectName("sub/dir")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidProjectName("")).toBe(false);
  });

  it("rejects strings over 255 chars", () => {
    expect(isValidProjectName("a".repeat(256))).toBe(false);
  });

  it("rejects dot-prefixed names", () => {
    expect(isValidProjectName(".env")).toBe(false);
    expect(isValidProjectName("..")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toHostPath
// ---------------------------------------------------------------------------
describe("toHostPath", () => {
  it("returns path unchanged when PROJECTS_DIR equals HOST_PROJECTS_DIR", () => {
    expect(toHostPath("/data/projects/foo")).toBe("/data/projects/foo");
  });

  it("replaces prefix when paths differ", () => {
    vi.stubEnv("PROJECTS_DIR", "/data/projects");
    vi.stubEnv("HOST_PROJECTS_DIR", "/mnt/nas/projects");

    expect(toHostPath("/data/projects/foo")).toBe("/mnt/nas/projects/foo");
  });

  it("returns path unchanged when outside PROJECTS_DIR", () => {
    vi.stubEnv("PROJECTS_DIR", "/data/projects");
    vi.stubEnv("HOST_PROJECTS_DIR", "/mnt/nas/projects");

    expect(toHostPath("/other/path/file")).toBe("/other/path/file");
  });

  it("does not rewrite sibling prefixes that only start with PROJECTS_DIR text", () => {
    vi.stubEnv("PROJECTS_DIR", "/data/projects");
    vi.stubEnv("HOST_PROJECTS_DIR", "/mnt/nas/projects");

    expect(toHostPath("/data/projects-archive/file")).toBe("/data/projects-archive/file");
  });
});

// ---------------------------------------------------------------------------
// scanProjects
// ---------------------------------------------------------------------------
describe("scanProjects", () => {
  it("determines running status when all services have running containers", async () => {
    mockReaddir.mockResolvedValue([createDirent("myapp", true)] as never);
    mockComposeFileExists();
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx:latest
  db:
    image: postgres:16
`);
    mockListContainers.mockResolvedValue([
      { projectName: "myapp", serviceName: "web", state: "running", image: "nginx:latest" },
      { projectName: "myapp", serviceName: "db", state: "running", image: "postgres:16" },
    ] as never);

    const projects = await scanProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].status).toBe("running");
  });

  it("determines partial status when some services are running", async () => {
    mockReaddir.mockResolvedValue([createDirent("myapp", true)] as never);
    mockComposeFileExists();
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
  worker:
    image: node
`);
    mockListContainers.mockResolvedValue([
      { projectName: "myapp", serviceName: "web", state: "running", image: "nginx" },
      { projectName: "myapp", serviceName: "worker", state: "exited", image: "node" },
    ] as never);

    const projects = await scanProjects();
    expect(projects[0].status).toBe("partial");
  });

  it("determines stopped status when all containers are stopped", async () => {
    mockReaddir.mockResolvedValue([createDirent("myapp", true)] as never);
    mockComposeFileExists();
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
`);
    mockListContainers.mockResolvedValue([
      { projectName: "myapp", serviceName: "web", state: "exited", image: "nginx" },
    ] as never);

    const projects = await scanProjects();
    expect(projects[0].status).toBe("stopped");
  });

  it("determines stopped status when no containers found for services", async () => {
    // When services exist but no matching containers, runningCount=0 → stopped
    mockReaddir.mockResolvedValue([createDirent("myapp", true)] as never);
    mockComposeFileExists();
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
`);
    mockListContainers.mockResolvedValue([]);

    const projects = await scanProjects();
    expect(projects[0].status).toBe("stopped");
  });

  it("skips directories starting with dot", async () => {
    mockReaddir.mockResolvedValue([
      createDirent(".hidden", true),
      createDirent("valid", true),
    ] as never);
    mockComposeFileExists();
    mockReadFile.mockResolvedValue("services:\n  web:\n    image: nginx\n");
    mockListContainers.mockResolvedValue([]);

    const projects = await scanProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("valid");
  });

  it("skips directories without a compose file", async () => {
    mockReaddir.mockResolvedValue([createDirent("no-compose", true)] as never);
    mockStat.mockRejectedValue(new Error("ENOENT")); // No compose file found

    const projects = await scanProjects();
    expect(projects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getProject
// ---------------------------------------------------------------------------
describe("getProject", () => {
  it("returns null for invalid project name without touching filesystem", async () => {
    const result = await getProject("../escape");
    // stat should not have been called (readdir is not called by getProject)
    expect(mockStat).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("returns null when directory does not exist", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT"));
    const result = await getProject("nonexistent");
    expect(result).toBeNull();
  });
});
