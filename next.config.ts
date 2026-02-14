import { execSync } from "child_process";
import type { NextConfig } from "next";
import packageJson from "./package.json";

function getVersion(): string {
  // CI passes this as a Docker build arg
  if (process.env.COMPOZA_VERSION) return process.env.COMPOZA_VERSION;

  // Local dev: derive from git
  try {
    // If HEAD is tagged with a version, use it
    const tags = execSync("git tag --points-at HEAD", { encoding: "utf8" }).trim();
    const versionTag = tags.split("\n").find((t) => /^v\d+/.test(t));
    if (versionTag) return versionTag.replace(/^v/, "");

    // Otherwise: branch-sha
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    return `${branch}-${sha}`;
  } catch {
    return packageJson.version;
  }
}

const nextConfig: NextConfig = {
  devIndicators: process.env.NEXT_PUBLIC_DEMO_BANNER === "false" ? false : undefined,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["dockerode", "ssh2"],
  env: {
    COMPOZA_VERSION: getVersion(),
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
};

export default nextConfig;
