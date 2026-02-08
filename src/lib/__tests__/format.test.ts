import { describe, it, expect } from "vitest";
import {
  formatBytes,
  normalizeImageName,
  isSensitiveKey,
  extractSourceUrl,
  getReleasesUrl,
} from "../format";

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------
describe("formatBytes", () => {
  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes below KiB threshold", () => {
    expect(formatBytes(512)).toBe("512.0 B");
  });

  it("formats at exact KiB boundary", () => {
    expect(formatBytes(1024)).toBe("1.0 KiB");
  });

  it("formats MiB values", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MiB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MiB");
  });

  it("formats GiB values", () => {
    expect(formatBytes(1024 ** 3)).toBe("1.0 GiB");
  });

  it("formats TiB values", () => {
    expect(formatBytes(1024 ** 4)).toBe("1.0 TiB");
  });
});

// ---------------------------------------------------------------------------
// normalizeImageName
// ---------------------------------------------------------------------------
describe("normalizeImageName", () => {
  it("strips docker.io/library/ prefix", () => {
    expect(normalizeImageName("docker.io/library/nginx")).toBe("nginx");
  });

  it("strips docker.io/ prefix for user images", () => {
    expect(normalizeImageName("docker.io/linuxserver/sonarr")).toBe("linuxserver/sonarr");
  });

  it("leaves non-Docker Hub images unchanged", () => {
    expect(normalizeImageName("ghcr.io/foo/bar")).toBe("ghcr.io/foo/bar");
  });

  it("leaves already-short names unchanged", () => {
    expect(normalizeImageName("nginx")).toBe("nginx");
  });
});

// ---------------------------------------------------------------------------
// isSensitiveKey
// ---------------------------------------------------------------------------
describe("isSensitiveKey", () => {
  it("matches PASSWORD", () => {
    expect(isSensitiveKey("DB_PASSWORD")).toBe(true);
  });

  it("matches SECRET", () => {
    expect(isSensitiveKey("JWT_SECRET")).toBe(true);
  });

  it("matches TOKEN", () => {
    expect(isSensitiveKey("AUTH_TOKEN")).toBe(true);
  });

  it("matches API_KEY", () => {
    expect(isSensitiveKey("MY_API_KEY")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("api_key")).toBe(true);
  });

  it("rejects non-sensitive keys", () => {
    expect(isSensitiveKey("PORT")).toBe(false);
    expect(isSensitiveKey("DATABASE_URL")).toBe(false);
    expect(isSensitiveKey("NODE_ENV")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractSourceUrl
// ---------------------------------------------------------------------------
describe("extractSourceUrl", () => {
  it("extracts URL from org.opencontainers.image.source label", () => {
    const labels = { "org.opencontainers.image.source": "https://github.com/linuxserver/docker-sonarr" };
    expect(extractSourceUrl(labels, "linuxserver/sonarr")).toBe("https://github.com/linuxserver/docker-sonarr");
  });

  it("falls back to org.label-schema.url", () => {
    const labels = { "org.label-schema.url": "https://github.com/linuxserver/docker-sonarr" };
    expect(extractSourceUrl(labels, "linuxserver/sonarr")).toBe("https://github.com/linuxserver/docker-sonarr");
  });

  it("strips docker- prefix when matching repo names", () => {
    const labels = { "org.opencontainers.image.source": "https://github.com/nginxinc/docker-nginx" };
    // URL repo "docker-nginx" minus "docker-" prefix = "nginx", matches image repo "nginx"
    expect(extractSourceUrl(labels, "nginx:latest")).toBe("https://github.com/nginxinc/docker-nginx");
  });

  it("returns undefined when no labels", () => {
    expect(extractSourceUrl(undefined, "nginx")).toBeUndefined();
  });

  it("returns undefined when URL doesn't match image", () => {
    const labels = { "org.opencontainers.image.source": "https://github.com/unrelated/project" };
    expect(extractSourceUrl(labels, "myuser/myapp")).toBeUndefined();
  });

  it("returns undefined when no source labels exist", () => {
    const labels = { "maintainer": "someone" };
    expect(extractSourceUrl(labels, "nginx")).toBeUndefined();
  });

  it("matches when image repo appears in URL repo", () => {
    const labels = { "org.opencontainers.image.source": "https://github.com/nginxinc/docker-nginx" };
    // "nginx" (length >= 3) appears in "docker-nginx"
    expect(extractSourceUrl(labels, "nginx")).toBe("https://github.com/nginxinc/docker-nginx");
  });
});

// ---------------------------------------------------------------------------
// getReleasesUrl
// ---------------------------------------------------------------------------
describe("getReleasesUrl", () => {
  it("appends /releases to GitHub URLs", () => {
    expect(getReleasesUrl("https://github.com/owner/repo")).toBe("https://github.com/owner/repo/releases");
  });

  it("strips trailing slash before appending /releases", () => {
    expect(getReleasesUrl("https://github.com/owner/repo/")).toBe("https://github.com/owner/repo/releases");
  });

  it("returns non-GitHub URLs as-is", () => {
    expect(getReleasesUrl("https://gitlab.com/owner/repo")).toBe("https://gitlab.com/owner/repo");
  });
});
