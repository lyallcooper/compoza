import { afterEach, expect, it, vi } from "vitest";
import { consumeOutputStream } from "../use-background-operation";

const options = () => ({ signal: new AbortController().signal, appendOutput: vi.fn() });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("rejects streams without an explicit completion event", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('data: {"type":"output","data":"Pulling"}\n\n')));
  await expect(consumeOutputStream("/up", options())).rejects.toThrow("without confirming completion");
});

it("accepts completion split across chunks and propagates errors", async () => {
  const encoder = new TextEncoder();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"do'));
      controller.enqueue(encoder.encode('ne"}\n\n'));
      controller.close();
    },
  }))));
  await expect(consumeOutputStream("/up", options())).resolves.toBeUndefined();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('data: {"type":"error","message":"recreation failed"}\n\n')));
  await expect(consumeOutputStream("/up", options())).rejects.toThrow("recreation failed");
});

it("retries rate-limited operations after Retry-After", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "2" } }))
    .mockResolvedValueOnce(new Response('data: {"type":"done"}\n\n'));
  vi.stubGlobal("fetch", fetch);
  const operation = consumeOutputStream("/up", options());
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await operation;
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("cancels a rate-limit wait without retrying", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const operation = consumeOutputStream("/up", { ...options(), signal: controller.signal });
  const rejected = expect(operation).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await rejected;
  expect(fetch).toHaveBeenCalledTimes(1);
});
