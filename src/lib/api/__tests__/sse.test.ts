import { describe, it, expect } from "vitest";
import { createSSEResponse } from "../sse";

describe("createSSEResponse", () => {
  it("does not abort the handler signal on disconnect by default", async () => {
    let handlerSignal: AbortSignal | null = null;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });

    const response = createSSEResponse<{ type: "done" }>(async (_send, signal) => {
      handlerSignal = signal;
      started();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    await startedPromise;
    await reader!.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handlerSignal).not.toBeNull();
    expect(handlerSignal!.aborted).toBe(false);
  });

  it("aborts the handler signal on disconnect when cancelOnDisconnect is true", async () => {
    let started!: (signal: AbortSignal) => void;
    const startedPromise = new Promise<AbortSignal>((resolve) => {
      started = resolve;
    });

    const response = createSSEResponse<{ type: "done" }>(async (_send, signal) => {
      started(signal);
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    }, { cancelOnDisconnect: true });

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const signal = await startedPromise;
    await reader!.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(signal.aborted).toBe(true);
  });
});
