import type { NextConfig } from "next";
import { createRequire } from "module";

function normalizeBasePath(value?: string) {
  if (!value || value === '/') return '';
  const trimmed = value.replace(/\/+$/g, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

const appBasePath = normalizeBasePath(process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH);

const require = createRequire(import.meta.url);
const { version } = require("./package.json") as { version: string };
const resolvedVersion = process.env.NEXT_PUBLIC_VERSION || version;

const nextConfig: NextConfig = {
  // Base path configuration - set BASE_PATH (or NEXT_PUBLIC_BASE_PATH) env var if needed
  basePath: appBasePath,
  assetPrefix: appBasePath,

  env: {
    NEXT_PUBLIC_VERSION: resolvedVersion,
    NEXT_PUBLIC_BASE_PATH: appBasePath,
  },

  transpilePackages: [
    "@targon/auth",
    "@targon/config",
    "@targon/logger",
  ],

  serverExternalPackages: ['@targon/prisma-x-plan'],

  turbopack: {
    resolveAlias: {
      '@targon/prisma-x-plan': '../../packages/prisma-x-plan/generated/index.js',
      '@targon/auth': '../../packages/auth/dist/index.js',
    },
  },
};

export default nextConfig;
