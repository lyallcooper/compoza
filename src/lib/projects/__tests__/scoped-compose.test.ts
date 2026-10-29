import { beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), self: vi.fn(), updater: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../scanner", () => ({
  getProject: async () => ({ path: "/projects/app", composeFile: "/projects/app/compose.yaml", services: [{ name: "web" }, { name: "db" }, { name: "_worker" }] }),
  toHostPath: (path: string) => path,
  invalidateProjectScanCache: vi.fn(),
}));
vi.mock("../preprocess", () => ({ isPathMappingActive: () => false }));
vi.mock("@/lib/docker", () => ({ getSelfProjectName: mocks.self }));
vi.mock("@/lib/updates", () => ({ spawnUpdaterContainer: mocks.updater }));
import { composePull, composeUp, composeUpService } from "../compose";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.self.mockResolvedValue(null);
  mocks.updater.mockResolvedValue({ success: true, output: "" });
  mocks.spawn.mockImplementation(() => {
    const proc = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null, kill: vi.fn(),
    });
    queueMicrotask(() => proc.emit("close", 0));
    return proc;
  });
});

it("pulls only selected services regardless of compose pull policies", async () => {
  await composePull("app", { services: ["web"] });
  expect(mocks.spawn.mock.calls[0][1].slice(-5)).toEqual(["pull", "--policy", "always", "--", "web"]);
});

it("does not pull, build, or recreate dependencies when applying selected services", async () => {
  await composeUp("app", { services: ["web"] });
  expect(mocks.spawn.mock.calls[0][1].slice(-8)).toEqual(["up", "-d", "--no-deps", "--no-build", "--pull", "never", "--", "web"]);
});

it("keeps manually updating a single service scoped to that service", async () => {
  await composeUpService("app", "web");
  expect(mocks.spawn.mock.calls[0][1]).toContain("--no-deps");
  expect(mocks.spawn.mock.calls[0][1]).not.toContain("db");
});

it.each([{ services: [] }, { services: ["missing"] }, { services: ["--all"] }])("rejects invalid selected services %j without running compose", async ({ services }) => {
  expect(await composePull("app", { services })).toMatchObject({ success: false });
  expect(await composeUp("app", { services })).toMatchObject({ success: false });
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it("passes the service selection through the self-update handoff", async () => {
  mocks.self.mockResolvedValue("app");
  await composeUp("app", { services: ["web"] });
  expect(mocks.updater).toHaveBeenCalledWith("app", "/projects/app/compose.yaml", ["web"]);
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it("preserves an explicit manual update of the whole project", async () => {
  await composePull("app");
  await composeUp("app");
  expect(mocks.spawn.mock.calls[0][1].at(-1)).toBe("pull");
  expect(mocks.spawn.mock.calls[1][1].slice(-2)).toEqual(["up", "-d"]);
});

it("accepts valid service names without treating them as command options", async () => {
  expect(await composeUp("app", { services: ["_worker"] })).toMatchObject({ success: true });
  expect(mocks.spawn.mock.calls[0][1].slice(-2)).toEqual(["--", "_worker"]);
});
