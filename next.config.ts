import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  devIndicators: process.env.NEXT_PUBLIC_DEMO_BANNER === "false" ? false : undefined,
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    COMPOZA_VERSION: packageJson.version,
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
