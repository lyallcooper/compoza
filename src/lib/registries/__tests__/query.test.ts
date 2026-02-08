import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We need fresh module state for each test since queryRegistry depends on
// credentials module state and fetch mocks
let queryRegistry: typeof import("../query").queryRegistry;

let mockResponses: Map<string, (url: string) => Response>;

function mockResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

beforeEach(async () => {
  vi.resetModules();
  mockResponses = new Map();

  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();

    for (const [pattern, handler] of mockResponses) {
      if (url.includes(pattern)) return handler(url);
    }

    return new Response("Not Found", { status: 404 });
  });

  const mod = await import("../query");
  queryRegistry = mod.queryRegistry;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Helper: create Docker Hub tag response
function createDockerHubResponse(tags: Array<{ name: string; digest: string | null; images?: Array<{ os: string; architecture: string; digest: string }> }>) {
  return mockResponse({
    count: tags.length,
    next: null,
    results: tags.map((t) => ({
      name: t.name,
      digest: t.digest,
      images: t.images ?? [],
    })),
  });
}

// ---------------------------------------------------------------------------
// queryRegistry — Docker Hub path
// ---------------------------------------------------------------------------
describe("queryRegistry (Docker Hub)", () => {
  it("detects update available when remote digest differs from local", async () => {
    mockResponses.set("hub.docker.com/v2/repositories/library/nginx/tags", () =>
      createDockerHubResponse([
        { name: "latest", digest: "sha256:new" },
        { name: "1.26", digest: "sha256:new" },
        { name: "1.25", digest: "sha256:old" },
      ])
    );

    const result = await queryRegistry("nginx:latest", "sha256:old");
    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(true);
    expect(result!.latestDigest).toBe("sha256:new");
  });

  it("detects no update when digests match", async () => {
    mockResponses.set("hub.docker.com/v2/repositories/library/nginx/tags", () =>
      createDockerHubResponse([
        { name: "latest", digest: "sha256:same" },
        { name: "1.25", digest: "sha256:same" },
      ])
    );

    const result = await queryRegistry("nginx:latest", "sha256:same");
    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(false);
  });

  it("picks currentVersion from tags matching local digest", async () => {
    mockResponses.set("hub.docker.com/v2/repositories/library/nginx/tags", () =>
      createDockerHubResponse([
        { name: "latest", digest: "sha256:new" },
        { name: "1.25.3", digest: "sha256:old" },
        { name: "1.25", digest: "sha256:old" },
      ])
    );

    const result = await queryRegistry("nginx:latest", "sha256:old");
    // Best semver from ["1.25.3", "1.25"] is "1.25.3" (most specific)
    expect(result!.currentVersion).toBe("1.25.3");
  });

  it("picks latestVersion from tags matching remote digest", async () => {
    mockResponses.set("hub.docker.com/v2/repositories/library/nginx/tags", () =>
      createDockerHubResponse([
        { name: "latest", digest: "sha256:new" },
        { name: "1.26.0", digest: "sha256:new" },
        { name: "1.26", digest: "sha256:new" },
      ])
    );

    const result = await queryRegistry("nginx:latest", "sha256:old");
    expect(result!.latestVersion).toBe("1.26.0");
  });

  it("returns null when tracked tag not found in results", async () => {
    mockResponses.set("hub.docker.com/v2/repositories/library/nginx/tags", () =>
      createDockerHubResponse([
        { name: "alpine", digest: "sha256:abc" },
      ])
    );

    const result = await queryRegistry("nginx:latest", "sha256:abc");
    expect(result).toBeNull();
  });

  it("returns null when API returns 404", async () => {
    // No mock — default 404
    const result = await queryRegistry("nginx:latest", "sha256:abc");
    expect(result).toBeNull();
  });

  it("sorts matchedTags by specificity (most specific first)", async () => {
    mockResponses.set("hub.docker.com/v2/repositories/library/nginx/tags", () =>
      createDockerHubResponse([
        { name: "latest", digest: "sha256:d1" },
        { name: "1", digest: "sha256:d1" },
        { name: "1.26", digest: "sha256:d1" },
        { name: "1.26.0", digest: "sha256:d1" },
      ])
    );

    const result = await queryRegistry("nginx:latest", "sha256:d1");
    // Semver tags sorted: 1.26.0 (3 segments), 1.26 (2), 1 (1), then non-semver: latest
    expect(result!.matchedTags).toEqual(["1.26.0", "1.26", "1", "latest"]);
  });
});

// ---------------------------------------------------------------------------
// queryRegistry — GHCR path
// ---------------------------------------------------------------------------
describe("queryRegistry (GHCR)", () => {
  it("falls back to user endpoint when org returns 404", async () => {
    vi.stubEnv("GHCR_TOKEN", "ghp_test");

    // Org endpoint → 404
    mockResponses.set("/orgs/", () => new Response("", { status: 404 }));

    // User endpoint → success
    mockResponses.set("/users/", () =>
      mockResponse([
        {
          id: 1,
          name: "sha256:latest_digest",
          metadata: { container: { tags: ["latest"] } },
        },
      ])
    );

    const result = await queryRegistry("ghcr.io/myuser/myapp:latest", "sha256:latest_digest");
    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(false);
  });

  it("returns null when no GHCR credentials available", async () => {
    vi.stubEnv("GHCR_TOKEN", "");
    const result = await queryRegistry("ghcr.io/owner/app:latest", "sha256:abc");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// queryRegistry — unsupported registry
// ---------------------------------------------------------------------------
describe("queryRegistry (unsupported)", () => {
  it("returns null for unknown registry", async () => {
    const result = await queryRegistry("quay.io/owner/app:latest", "sha256:abc");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findPlatformDigest — tested indirectly via Docker Hub tags
// ---------------------------------------------------------------------------
describe("Docker Hub tag digest selection", () => {
  it("falls back to platform digest when tag has no top-level digest", async () => {
    mockResponses.set("hub.docker.com/v2/repositories/library/nginx/tags", () =>
      createDockerHubResponse([
        {
          name: "latest",
          digest: null,
          images: [
            { os: "linux", architecture: "amd64", digest: "sha256:amd64_digest" },
            { os: "linux", architecture: "arm64", digest: "sha256:arm64_digest" },
          ],
        },
      ])
    );

    const result = await queryRegistry("nginx:latest", "sha256:amd64_digest");
    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseLinkNext — tested indirectly via GHCR pagination
// ---------------------------------------------------------------------------
describe("GHCR pagination", () => {
  it("follows Link header for pagination", async () => {
    vi.stubEnv("GHCR_TOKEN", "ghp_test");

    let page1Called = false;

    mockResponses.set("/orgs/", (url: string) => {
      if (!page1Called) {
        page1Called = true;
        return new Response(JSON.stringify([
          { id: 1, name: "sha256:d1", metadata: { container: { tags: ["latest"] } } },
        ]), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Link": `<${url}&page=2>; rel="next"`,
          },
        });
      }
      return mockResponse([
        { id: 2, name: "sha256:d2", metadata: { container: { tags: ["1.0.0"] } } },
      ]);
    });

    const result = await queryRegistry("ghcr.io/org/app:latest", "sha256:d2");
    expect(result).not.toBeNull();
    expect(result!.currentVersion).toBe("1.0.0");
  });
});
