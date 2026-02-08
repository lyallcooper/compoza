import { describe, it, expect, beforeEach, vi } from "vitest";

// Use fresh module state per test since rate limiter has module-level store
let checkRateLimit: typeof import("../rate-limit").checkRateLimit;
let getRateLimitKey: typeof import("../rate-limit").getRateLimitKey;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();

  const mod = await import("../rate-limit");
  checkRateLimit = mod.checkRateLimit;
  getRateLimitKey = mod.getRateLimitKey;
});

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------
describe("checkRateLimit", () => {
  it("allows first request with remaining = limit - 1", () => {
    const result = checkRateLimit("client1", { limit: 5, windowMs: 60000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("decrements remaining on subsequent requests", () => {
    const config = { limit: 3, windowMs: 60000 };
    checkRateLimit("c", config);
    const result = checkRateLimit("c", config);
    expect(result.remaining).toBe(1);
  });

  it("blocks request when limit exceeded", () => {
    const config = { limit: 2, windowMs: 60000 };
    checkRateLimit("c", config);
    checkRateLimit("c", config);
    const result = checkRateLimit("c", config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const config = { limit: 1, windowMs: 5000 };
    checkRateLimit("c", config);

    // Blocked within window
    expect(checkRateLimit("c", config).allowed).toBe(false);

    // Advance past window
    vi.advanceTimersByTime(5001);

    const result = checkRateLimit("c", config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("tracks different keys independently", () => {
    const config = { limit: 1, windowMs: 60000 };
    checkRateLimit("a", config);
    const result = checkRateLimit("b", config);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRateLimitKey
// ---------------------------------------------------------------------------
describe("getRateLimitKey", () => {
  it("extracts first IP from X-Forwarded-For header", () => {
    const request = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "1.2.3.4, 5.6.7.8" },
    });
    expect(getRateLimitKey(request)).toBe("1.2.3.4");
  });

  it("returns 'local' when no forwarded header", () => {
    const request = new Request("http://localhost/api/test");
    expect(getRateLimitKey(request)).toBe("local");
  });

  it("handles single IP in X-Forwarded-For", () => {
    const request = new Request("http://localhost/api/test", {
      headers: { "X-Forwarded-For": "10.0.0.1" },
    });
    expect(getRateLimitKey(request)).toBe("10.0.0.1");
  });
});
