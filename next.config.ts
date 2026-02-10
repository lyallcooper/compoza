import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  devIndicators: process.env.NEXT_PUBLIC_DEMO_BANNER === "false" ? false : undefined,
  env: {
    COMPOZA_VERSION: packageJson.version,
  },
};

export default nextConfig;
