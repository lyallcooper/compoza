import { afterEach, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/docker", () => ({
  getDocker: () => ({ getImage: () => ({ inspect: async () => ({}) }), createContainer: mocks.create }),
}));
vi.mock("@/lib/projects/scanner", () => ({ toHostPath: (path: string) => path, getHostProjectsDir: () => "/projects" }));
import { spawnUpdaterContainer } from "../self-update";
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("keeps the external self-updater scoped and prevents dependency pulls or rebuilds", async () => {
  vi.useFakeTimers();
  vi.stubEnv("DOCKER_HOST", "/var/run/docker.sock");
  mocks.create.mockResolvedValue({
    id: "updater", attach: async () => new PassThrough(), start: async () => {}, wait: async () => ({ StatusCode: 0 }),
  });
  expect(await spawnUpdaterContainer("app", "/projects/app/compose.yaml", ["compoza"])).toMatchObject({ success: true });
  expect(mocks.create.mock.calls[0][0].Cmd.slice(-9)).toEqual([
    "up", "-d", "--force-recreate", "--no-deps", "--no-build", "--pull", "never", "--", "compoza",
  ]);
});
