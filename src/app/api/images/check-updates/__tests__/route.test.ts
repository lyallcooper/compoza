import { describe, it, expect } from "vitest";
import { buildImageTrackingMap } from "../route";

describe("buildImageTrackingMap", () => {
  it("orders image IDs by oldest container and deduplicates IDs", () => {
    const result = buildImageTrackingMap([
      { image: "nginx:latest", imageId: "sha-new", created: 200 },
      { image: "nginx:latest", imageId: "sha-old", created: 100 },
      { image: "nginx:latest", imageId: "sha-old", created: 300 }, // same ID, newer container
    ]);

    expect(result.get("nginx:latest")).toEqual(["sha-old", "sha-new"]);
  });

  it("keeps image keys even when container image IDs are unavailable", () => {
    const result = buildImageTrackingMap([
      { image: "redis:7", created: 100 },
    ]);

    expect(result.has("redis:7")).toBe(true);
    expect(result.get("redis:7")).toBeUndefined();
  });

  it("tracks each image tag independently", () => {
    const result = buildImageTrackingMap([
      { image: "nginx:latest", imageId: "sha-nginx", created: 100 },
      { image: "redis:7", imageId: "sha-redis", created: 200 },
    ]);

    expect(result.get("nginx:latest")).toEqual(["sha-nginx"]);
    expect(result.get("redis:7")).toEqual(["sha-redis"]);
  });
});
