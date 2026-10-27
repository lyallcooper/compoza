import { afterEach, expect, it, vi } from "vitest";
import { PassThrough, Readable } from "node:stream";
import { NextRequest } from "next/server";
import { setDockerClient, resetDockerClient } from "../client";
import { streamContainerLogs } from "../containers";
import { GET } from "@/app/api/containers/[id]/logs/route";
function mockLogs(stream: Readable, tty = true) {
  const logs = vi.fn().mockResolvedValue(stream);
  setDockerClient({ getContainer: () => ({ inspect: async () => ({ Config: { Tty: tty } }), logs }) } as never);
  return logs;
}
afterEach(resetDockerClient);
it("reads raw TTY output, including split UTF-8 characters", async () => {
  const bytes = Buffer.from("hello 日本語\n");
  mockLogs(Readable.from([bytes.subarray(0, 8), bytes.subarray(8)]));
  const lines = [];
  for await (const line of streamContainerLogs("tty")) lines.push(line);
  expect(lines.join("")).toBe("hello 日本語\n");
});
it("closes an idle Docker stream immediately when a viewer disconnects", async () => {
  const stream = new PassThrough();
  const logs = mockLogs(stream);
  const response = await GET(new NextRequest("http://localhost/api/containers/id/logs"), { params: Promise.resolve({ id: "id" }) });
  await vi.waitFor(() => expect(logs).toHaveBeenCalled());
  await response.body!.getReader().cancel();
  expect(stream.destroyed).toBe(true);
});
it("closes streams on request abort without requiring another log line", async () => {
  const stream = new PassThrough();
  const logs = mockLogs(stream);
  const controller = new AbortController();
  const response = await GET(new NextRequest("http://localhost/api/containers/id/logs", { signal: controller.signal }), { params: Promise.resolve({ id: "id" }) });
  await vi.waitFor(() => expect(logs).toHaveBeenCalled());
  controller.abort();
  expect(await response.body!.getReader().read()).toMatchObject({ done: true });
  expect(stream.destroyed).toBe(true);
});
