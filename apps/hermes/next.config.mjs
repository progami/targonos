// Hermes is designed to run either standalone (local dev) or behind nginx under a base path.
// Set BASE_PATH=/hermes in your PM2 env (or rely on default).
/** @type {import("next").NextConfig} */
const basePath = process.env.BASE_PATH || "/hermes";

const nextConfig = {
  output: "standalone",
  basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
