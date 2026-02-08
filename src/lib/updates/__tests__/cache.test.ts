import { describe, it, expect, beforeEach, vi } from "vitest";

// Use fresh module state per test to avoid shared globalThis cache
let getCachedUpdate: typeof import("../cache").getCachedUpdate;
let setCachedUpdate: typeof import("../cache").setCachedUpdate;
let shouldCheckImage: typeof import("../cache").shouldCheckImage;
let markCheckPending: typeof import("../cache").markCheckPending;
let markCheckComplete: typeof import("../cache").markCheckComplete;
let updateCachedVersions: typeof import("../cache").updateCachedVersions;
let clearCachedUpdates: typeof import("../cache").clearCachedUpdates;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();

  // Clear globalThis cache state
  const g = globalThis as Record<string, unknown>;
  delete g.__updateCache;
  delete g.__pendingChecks;

  const mod = await import("../cache");
  getCachedUpdate = mod.getCachedUpdate;
  setCachedUpdate = mod.setCachedUpdate;
  shouldCheckImage = mod.shouldCheckImage;
  markCheckPending = mod.markCheckPending;
  markCheckComplete = mod.markCheckComplete;
  updateCachedVersions = mod.updateCachedVersions;
  clearCachedUpdates = mod.clearCachedUpdates;
});

// ---------------------------------------------------------------------------
// getCachedUpdate
// ---------------------------------------------------------------------------
describe("getCachedUpdate", () => {
  it("returns cached entry within TTL", () => {
    setCachedUpdate("nginx:latest", {
      image: "nginx:latest",
      updateAvailable: true,
      status: "checked",
    });
    const result = getCachedUpdate("nginx:latest");
    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(true);
  });

  it("returns null after TTL expires", () => {
    setCachedUpdate("nginx:latest", {
      image: "nginx:latest",
      updateAvailable: false,
      status: "checked",
    });

    // Advance past 1 hour TTL
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    expect(getCachedUpdate("nginx:latest")).toBeNull();
  });

  it("respects custom TTL", () => {
    setCachedUpdate(
      "nginx:latest",
      { image: "nginx:latest", updateAvailable: false, status: "checked" },
      5000 // 5 second TTL
    );

    vi.advanceTimersByTime(4000);
    expect(getCachedUpdate("nginx:latest")).not.toBeNull();

    vi.advanceTimersByTime(2000);
    expect(getCachedUpdate("nginx:latest")).toBeNull();
  });

  it("returns null for uncached image", () => {
    expect(getCachedUpdate("nonexistent")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// shouldCheckImage
// ---------------------------------------------------------------------------
describe("shouldCheckImage", () => {
  it("returns true when no cache entry exists", () => {
    expect(shouldCheckImage("nginx:latest")).toBe(true);
  });

  it("returns false when check is pending", () => {
    markCheckPending("nginx:latest");
    expect(shouldCheckImage("nginx:latest")).toBe(false);
  });

  it("returns true after pending check is completed and interval passes", () => {
    setCachedUpdate("nginx:latest", {
      image: "nginx:latest",
      updateAvailable: false,
      status: "checked",
    });
    markCheckPending("nginx:latest");
    markCheckComplete("nginx:latest");

    // Within CHECK_INTERVAL (5 min) — should return false
    expect(shouldCheckImage("nginx:latest")).toBe(false);

    // Past CHECK_INTERVAL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(shouldCheckImage("nginx:latest")).toBe(true);
  });

  it("returns false when cache entry is fresh", () => {
    setCachedUpdate("nginx:latest", {
      image: "nginx:latest",
      updateAvailable: false,
      status: "checked",
    });
    expect(shouldCheckImage("nginx:latest")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateCachedVersions
// ---------------------------------------------------------------------------
describe("updateCachedVersions", () => {
  it("updates version fields on existing entry", () => {
    setCachedUpdate("nginx:latest", {
      image: "nginx:latest",
      updateAvailable: true,
      status: "checked",
      latestDigest: "sha256:abc",
    });

    updateCachedVersions("nginx:latest", "1.24", "1.25");

    const cached = getCachedUpdate("nginx:latest");
    expect(cached!.currentVersion).toBe("1.24");
    expect(cached!.latestVersion).toBe("1.25");
    expect(cached!.versionStatus).toBe("resolved");
    // Other fields untouched
    expect(cached!.latestDigest).toBe("sha256:abc");
  });

  it("is a no-op when entry does not exist", () => {
    // Should not throw
    updateCachedVersions("nonexistent", "1.0", "2.0");
    expect(getCachedUpdate("nonexistent")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearCachedUpdates
// ---------------------------------------------------------------------------
describe("clearCachedUpdates", () => {
  it("deletes only specified images", () => {
    setCachedUpdate("a", { image: "a", updateAvailable: false, status: "checked" });
    setCachedUpdate("b", { image: "b", updateAvailable: false, status: "checked" });

    clearCachedUpdates(["a"]);

    expect(getCachedUpdate("a")).toBeNull();
    expect(getCachedUpdate("b")).not.toBeNull();
  });

  it("clears everything without arguments", () => {
    setCachedUpdate("a", { image: "a", updateAvailable: false, status: "checked" });
    setCachedUpdate("b", { image: "b", updateAvailable: false, status: "checked" });

    clearCachedUpdates();

    expect(getCachedUpdate("a")).toBeNull();
    expect(getCachedUpdate("b")).toBeNull();
  });
});
