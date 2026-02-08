import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isNetworkError, waitForReconnection } from "../reconnect";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// isNetworkError
// ---------------------------------------------------------------------------
describe("isNetworkError", () => {
  it("returns true for TypeError (fetch network failure)", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("returns true for TypeError with any message", () => {
    expect(isNetworkError(new TypeError("something else"))).toBe(true);
  });

  it("returns true for Error with 'failed to fetch' message", () => {
    expect(isNetworkError(new Error("failed to fetch"))).toBe(true);
  });

  it("returns true for Error with 'ECONNREFUSED' message", () => {
    expect(isNetworkError(new Error("connect ECONNREFUSED 127.0.0.1:3000"))).toBe(true);
  });

  it("returns false for regular Error", () => {
    expect(isNetworkError(new Error("something else entirely"))).toBe(false);
  });

  it("returns false for non-Error value", () => {
    expect(isNetworkError("string error")).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// waitForReconnection
// ---------------------------------------------------------------------------
describe("waitForReconnection", () => {
  it("returns true when fetch succeeds on first try", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const promise = waitForReconnection(undefined, 5, 100);
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;
    expect(result).toBe(true);
  });

  it("retries and returns true when fetch eventually succeeds", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) throw new Error("down");
      return { ok: true };
    }));

    const promise = waitForReconnection(undefined, 5, 100);

    // Advance through retry delays
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    const result = await promise;
    expect(result).toBe(true);
    expect(attempts).toBe(3);
  });

  it("returns false after exhausting all attempts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("still down")));

    const promise = waitForReconnection(undefined, 3, 100);

    // Advance through all retries
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    const result = await promise;
    expect(result).toBe(false);
  });
});
