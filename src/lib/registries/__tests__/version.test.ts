import { describe, it, expect } from "vitest";
import { isSemverLike } from "../version";

describe("isSemverLike", () => {
  it("accepts standard semver", () => {
    expect(isSemverLike("1.2.3")).toBe(true);
  });

  it("accepts v-prefixed semver", () => {
    expect(isSemverLike("v1.2.3")).toBe(true);
  });

  it("accepts two-segment version", () => {
    expect(isSemverLike("1.2")).toBe(true);
  });

  it("accepts single-segment version", () => {
    expect(isSemverLike("1")).toBe(true);
  });

  it("accepts pre-release suffix", () => {
    expect(isSemverLike("1.2.3-rc.1")).toBe(true);
  });

  it("accepts build metadata suffix", () => {
    expect(isSemverLike("1.2.3+build")).toBe(true);
  });

  it("rejects word tags", () => {
    expect(isSemverLike("latest")).toBe(false);
    expect(isSemverLike("alpine")).toBe(false);
  });

  it("rejects hash-like tags", () => {
    expect(isSemverLike("sha-abc123")).toBe(false);
  });
});
