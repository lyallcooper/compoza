import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  env: {
    COMPOZA_VERSION: packageJson.version,
  },
};

export default nextConfig;
