import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock fs before imports
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue("/tmp/compoza-test"),
  rmdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
}));

import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { preprocessComposeFile } from "../preprocess";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

function getWrittenYaml(): Record<string, unknown> {
  const calls = mockWriteFile.mock.calls;
  const lastCall = calls[calls.length - 1];
  return parseYaml(lastCall[1] as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubEnv("PROJECTS_DIR", "/data/projects");
  vi.stubEnv("HOST_PROJECTS_DIR", "/host/projects");
  mockReadFile.mockReset();
  mockWriteFile.mockReset();
  mockWriteFile.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Volume rewriting
// ---------------------------------------------------------------------------
describe("volume rewriting", () => {
  it("rewrites short syntax relative path to absolute host path", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
    volumes:
      - ./data:/app/data
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const volumes = (yaml.services as Record<string, { volumes: string[] }>).web.volumes;
    expect(volumes[0]).toBe("/host/projects/myapp/data:/app/data");
  });

  it("preserves :ro suffix on short syntax volumes", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
    volumes:
      - ./config:/etc/config:ro
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const volumes = (yaml.services as Record<string, { volumes: string[] }>).web.volumes;
    expect(volumes[0]).toBe("/host/projects/myapp/config:/etc/config:ro");
  });

  it("leaves named volumes unchanged", async () => {
    mockReadFile.mockResolvedValue(`
services:
  db:
    image: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const volumes = (yaml.services as Record<string, { volumes: string[] }>).db.volumes;
    expect(volumes[0]).toBe("pgdata:/var/lib/postgresql/data");
  });

  it("translates absolute path within PROJECTS_DIR", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
    volumes:
      - /data/projects/myapp/data:/app/data
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const volumes = (yaml.services as Record<string, { volumes: string[] }>).web.volumes;
    expect(volumes[0]).toBe("/host/projects/myapp/data:/app/data");
  });

  it("leaves absolute path outside PROJECTS_DIR unchanged", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
    volumes:
      - /etc/ssl/certs:/certs:ro
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const volumes = (yaml.services as Record<string, { volumes: string[] }>).web.volumes;
    expect(volumes[0]).toBe("/etc/ssl/certs:/certs:ro");
  });

  it("rewrites long syntax bind mount source", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
    volumes:
      - type: bind
        source: ./data
        target: /app
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const volumes = (yaml.services as Record<string, { volumes: Array<{ type: string; source: string; target: string }> }>).web.volumes;
    expect(volumes[0].source).toBe("/host/projects/myapp/data");
    expect(volumes[0].target).toBe("/app");
  });

  it("leaves long syntax volume type unchanged", async () => {
    mockReadFile.mockResolvedValue(`
services:
  db:
    image: postgres
    volumes:
      - type: volume
        source: pgdata
        target: /var/lib/postgresql/data
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const volumes = (yaml.services as Record<string, { volumes: Array<{ type: string; source: string }> }>).db.volumes;
    expect(volumes[0].source).toBe("pgdata");
  });
});

// ---------------------------------------------------------------------------
// Build context rewriting
// ---------------------------------------------------------------------------
describe("build context rewriting", () => {
  it("rewrites string build context to absolute host path", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    build: .
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const build = (yaml.services as Record<string, { build: string }>).web.build;
    expect(build).toBe("/host/projects/myapp");
  });

  it("rewrites object build context, leaves dockerfile alone", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    build:
      context: ./app
      dockerfile: Dockerfile.prod
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const build = (yaml.services as Record<string, { build: { context: string; dockerfile: string } }>).web.build;
    expect(build.context).toBe("/host/projects/myapp/app");
    expect(build.dockerfile).toBe("Dockerfile.prod");
  });
});

// ---------------------------------------------------------------------------
// Env file rewriting
// ---------------------------------------------------------------------------
describe("env_file rewriting", () => {
  it("rewrites single string env_file to absolute local path", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
    env_file: .env
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const envFile = (yaml.services as Record<string, { env_file: string }>).web.env_file;
    expect(envFile).toBe("/data/projects/myapp/.env");
  });

  it("rewrites array of string env_files", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
    env_file:
      - .env
      - .env.local
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const envFile = (yaml.services as Record<string, { env_file: string[] }>).web.env_file;
    expect(envFile).toEqual([
      "/data/projects/myapp/.env",
      "/data/projects/myapp/.env.local",
    ]);
  });

  it("rewrites array of object env_files preserving other fields", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
    env_file:
      - path: .env
        required: false
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const envFile = (yaml.services as Record<string, { env_file: Array<{ path: string; required: boolean }> }>).web.env_file;
    expect(envFile[0].path).toBe("/data/projects/myapp/.env");
    expect(envFile[0].required).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Extends rewriting
// ---------------------------------------------------------------------------
describe("extends rewriting", () => {
  it("rewrites extends file path to host path", async () => {
    mockReadFile.mockResolvedValue(`
services:
  web:
    extends:
      file: ../base.yml
      service: web
    image: nginx
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const ext = (yaml.services as Record<string, { extends: { file: string; service: string } }>).web.extends;
    expect(ext.file).toBe("/host/projects/base.yml");
    expect(ext.service).toBe("web");
  });
});

// ---------------------------------------------------------------------------
// No-op case
// ---------------------------------------------------------------------------
describe("no path mapping", () => {
  it("still resolves relative paths to absolute when dirs are equal", async () => {
    vi.stubEnv("PROJECTS_DIR", "/data/projects");
    vi.stubEnv("HOST_PROJECTS_DIR", "/data/projects");

    mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
    volumes:
      - ./data:/app/data
`);
    await preprocessComposeFile("/data/projects/myapp/compose.yaml", "/data/projects/myapp");
    const yaml = getWrittenYaml();
    const volumes = (yaml.services as Record<string, { volumes: string[] }>).web.volumes;
    // Relative path resolved to absolute, but no prefix translation
    expect(volumes[0]).toBe("/data/projects/myapp/data:/app/data");
  });
});
