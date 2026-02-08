import { describe, it, expect } from "vitest";
import { findBestSemver } from "../query";

// compareTagSpecificity is not exported, but we test it indirectly through
// findBestSemver (which sorts by specificity) and through sorted output.

// ---------------------------------------------------------------------------
// findBestSemver
// ---------------------------------------------------------------------------
describe("findBestSemver", () => {
  it("picks the most specific semver tag", () => {
    expect(findBestSemver(["1", "1.2", "1.2.3"])).toBe("1.2.3");
  });

  it("returns null when no semver tags exist", () => {
    expect(findBestSemver(["latest", "alpine", "bullseye"])).toBeNull();
  });

  it("returns null for empty list", () => {
    expect(findBestSemver([])).toBeNull();
  });

  it("handles v-prefix consistently", () => {
    expect(findBestSemver(["v1", "v1.2", "v1.2.3"])).toBe("v1.2.3");
  });

  it("filters out non-semver tags before picking", () => {
    expect(findBestSemver(["latest", "1.2.3", "alpine"])).toBe("1.2.3");
  });

  it("picks more segments over fewer", () => {
    // 1.2.3 has 3 segments, 1.2 has 2 — should pick 1.2.3
    expect(findBestSemver(["1.2", "1.2.3"])).toBe("1.2.3");
  });

  it("handles pre-release tags", () => {
    expect(findBestSemver(["1.2.3-rc.1"])).toBe("1.2.3-rc.1");
  });

  it("returns single semver when only one exists", () => {
    expect(findBestSemver(["latest", "v2.0"])).toBe("v2.0");
  });
});
