import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OciClient } from "../oci";

let fetchCalls: Array<{ url: string; options: RequestInit }>;
let mockResponses: Map<string, () => Response>;

function mockResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  fetchCalls = [];
  mockResponses = new Map();

  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    fetchCalls.push({ url, options: init ?? {} });

    const handler = mockResponses.get(url);
    if (handler) return handler();

    // Pattern-match on URL for flexible test setup
    for (const [pattern, handler] of mockResponses) {
      if (url.includes(pattern)) return handler();
    }

    return new Response("Not Found", { status: 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// getDigestForTag
// ---------------------------------------------------------------------------
describe("getDigestForTag", () => {
  it("returns docker-content-digest header on success", async () => {
    mockResponses.set("/v2/library/nginx/manifests/latest", () =>
      new Response("", {
        status: 200,
        headers: { "docker-content-digest": "sha256:abc123" },
      })
    );

    const client = new OciClient("https://registry-1.docker.io");
    const digest = await client.getDigestForTag("library", "nginx", "latest");
    expect(digest).toBe("sha256:abc123");
  });

  it("returns null on non-OK response", async () => {
    mockResponses.set("/v2/library/nginx/manifests/latest", () =>
      new Response("", { status: 404 })
    );

    const client = new OciClient("https://registry-1.docker.io");
    const digest = await client.getDigestForTag("library", "nginx", "latest");
    expect(digest).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getVersionFromDigest
// ---------------------------------------------------------------------------
describe("getVersionFromDigest", () => {
  it("returns version from top-level manifest annotations", async () => {
    mockResponses.set("/v2/library/nginx/manifests/sha256:abc", () =>
      mockResponse({
        schemaVersion: 2,
        annotations: { "org.opencontainers.image.version": "1.25.3" },
      })
    );

    const client = new OciClient("https://registry-1.docker.io");
    const version = await client.getVersionFromDigest("library", "nginx", "sha256:abc");
    expect(version).toBe("1.25.3");
  });

  it("checks sub-manifest annotations for image indexes", async () => {
    mockResponses.set("/v2/org/app/manifests/sha256:index", () =>
      mockResponse({
        schemaVersion: 2,
        manifests: [
          {
            digest: "sha256:platform1",
            mediaType: "application/vnd.oci.image.manifest.v1+json",
            size: 100,
            platform: { os: "linux", architecture: "amd64" },
            annotations: { "org.opencontainers.image.version": "2.0.0" },
          },
        ],
      })
    );

    const client = new OciClient("https://ghcr.io");
    const version = await client.getVersionFromDigest("org", "app", "sha256:index");
    expect(version).toBe("2.0.0");
  });

  it("falls back to config labels when no annotations exist", async () => {
    // First call: manifest index with no annotations
    mockResponses.set("/v2/org/app/manifests/sha256:idx", () =>
      mockResponse({
        schemaVersion: 2,
        manifests: [
          {
            digest: "sha256:plat",
            mediaType: "application/vnd.oci.image.manifest.v1+json",
            size: 100,
            platform: { os: "linux", architecture: "amd64" },
          },
        ],
      })
    );

    // Second call: platform manifest
    mockResponses.set("/v2/org/app/manifests/sha256:plat", () =>
      mockResponse({
        schemaVersion: 2,
        config: { digest: "sha256:cfg", mediaType: "application/vnd.oci.image.config.v1+json", size: 50 },
      })
    );

    // Third call: config blob
    mockResponses.set("/v2/org/app/blobs/sha256:cfg", () =>
      mockResponse({
        config: {
          Labels: { "org.opencontainers.image.version": "3.1.0" },
        },
      })
    );

    const client = new OciClient("https://ghcr.io");
    const version = await client.getVersionFromDigest("org", "app", "sha256:idx");
    expect(version).toBe("3.1.0");
  });

  it("prefers org.opencontainers.image.version over org.label-schema.version", async () => {
    mockResponses.set("/v2/lib/img/manifests/sha256:m", () =>
      mockResponse({
        schemaVersion: 2,
        annotations: {
          "org.opencontainers.image.version": "1.0.0",
          "org.label-schema.version": "0.9.0",
        },
      })
    );

    const client = new OciClient("https://registry-1.docker.io");
    const version = await client.getVersionFromDigest("lib", "img", "sha256:m");
    expect(version).toBe("1.0.0");
  });

  it("returns null when manifest fetch fails", async () => {
    // No mock registered — will 404
    const client = new OciClient("https://registry-1.docker.io");
    const version = await client.getVersionFromDigest("lib", "img", "sha256:bad");
    expect(version).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchWithAuth (tested indirectly)
// ---------------------------------------------------------------------------
describe("token auth flow", () => {
  it("retries with token after 401", async () => {
    let callCount = 0;
    mockResponses.set("/v2/lib/img/manifests/sha256:digest", () => {
      callCount++;
      if (callCount === 1) {
        return new Response("", {
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer realm="https://auth.example.io/token",service="registry",scope="repository:lib/img:pull"',
          },
        });
      }
      return new Response("", {
        status: 200,
        headers: { "docker-content-digest": "sha256:result" },
      });
    });

    mockResponses.set("https://auth.example.io/token", () =>
      mockResponse({ token: "test-token-123" })
    );

    const client = new OciClient("https://example.io");
    const digest = await client.getDigestForTag("lib", "img", "sha256:digest");
    expect(digest).toBe("sha256:result");

    // Verify the retry included the Bearer token
    const retryCall = fetchCalls.find(
      (c) => c.url.includes("/manifests/") && (c.options.headers as Record<string, string>)?.["Authorization"]
    );
    expect(retryCall).toBeDefined();
  });
});
