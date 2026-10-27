import { afterEach, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
vi.mock("../scanner", () => ({
  getProject: async () => ({ services: [{ name: "web", containerId: "web" }, { name: "worker", containerId: "worker" }] }),
}));
import { setDockerClient, resetDockerClient } from "@/lib/docker/client";
import { composeLogs } from "../compose";
afterEach(resetDockerClient);
it("merges TTY project logs and closes every idle stream when the viewer leaves", async () => {
  const streams = { web: new PassThrough(), worker: new PassThrough() };
  const logs = vi.fn((id: keyof typeof streams) => Promise.resolve(streams[id]));
  setDockerClient({ getContainer: (id: keyof typeof streams) => ({ inspect: async () => ({ Config: { Tty: true } }), logs: () => logs(id) }) } as never);
  const iterator = await composeLogs("app");
  const first = iterator.next();
  await vi.waitFor(() => expect(logs).toHaveBeenCalledTimes(2));
  streams.web.write("hello\n");
  expect(await first).toMatchObject({ value: "web  | hello" });
  await iterator.return();
  expect(streams.web.destroyed).toBe(true);
  expect(streams.worker.destroyed).toBe(true);
});
