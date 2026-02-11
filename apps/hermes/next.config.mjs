import path from "path";

// Hermes is designed to run either standalone (local dev) or behind nginx under a base path.
// Set BASE_PATH=/hermes in your PM2 env (or rely on default).
/** @type {import("next").NextConfig} */
const basePath = process.env.BASE_PATH || "/hermes";
const authDistPath = path.resolve(process.cwd(), "../../packages/auth/dist/index.js");

const nextConfig = {
  output: "standalone",
  transpilePackages: ["@targon/auth"],
  basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@targon/auth": authDistPath,
    };
    return config;
  },
};

export default nextConfig;
