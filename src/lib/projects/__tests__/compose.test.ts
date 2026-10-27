import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../scanner", () => ({
  getProject: async () => ({ path: "/projects/app", composeFile: "/projects/app/compose.yaml" }),
  toHostPath: (path: string) => path,
}));
vi.mock("../preprocess", () => ({ isPathMappingActive: () => false }));
import { composePull } from "../compose";
let process: EventEmitter & { stdout: PassThrough; stderr: PassThrough; killed: boolean; exitCode: null; signalCode: null; kill: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.useFakeTimers();
  process = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), killed: false, exitCode: null, signalCode: null,
    kill: vi.fn((signal: string) => {
      process.killed = true;
      if (signal === "SIGKILL") process.emit("close", null);
      return true;
    }),
  });
  mocks.spawn.mockReturnValue(process);
});
afterEach(() => vi.useRealTimers());
it("force-kills a Compose process that ignores SIGTERM after timeout", async () => {
  const operation = composePull("app");
  await vi.advanceTimersByTimeAsync(300000);
  expect(process.kill).toHaveBeenCalledWith("SIGTERM");
  await vi.advanceTimersByTimeAsync(5000);
  expect(process.kill).toHaveBeenCalledWith("SIGKILL");
  expect(await operation).toMatchObject({ success: false, error: "Command timed out after 300s" });
});
it("force-kills a cancelled process even after a signal was sent", async () => {
  const controller = new AbortController();
  const operation = composePull("app", { signal: controller.signal });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await vi.advanceTimersByTimeAsync(5000);
  expect(process.kill).toHaveBeenCalledWith("SIGKILL");
  expect(await operation).toMatchObject({ success: false, error: "Command aborted" });
});
