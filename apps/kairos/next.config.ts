import type { NextConfig } from 'next';
import { createRequire } from 'module';

const appBasePath = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || '';

const require = createRequire(import.meta.url);
const { version } = require('./package.json') as { version: string };
const resolvedVersion = process.env.NEXT_PUBLIC_VERSION || version;

const nextConfig: NextConfig = {
  basePath: appBasePath,
  assetPrefix: appBasePath,

  env: {
    NEXT_PUBLIC_VERSION: resolvedVersion,
    NEXT_PUBLIC_BASE_PATH: appBasePath,
  },

  transpilePackages: ['@targon/auth', '@targon/config', '@targon/logger'],

  serverExternalPackages: ['@targon/prisma-kairos'],

  turbopack: {
    resolveAlias: {
      '@targon/prisma-kairos': '../../packages/prisma-kairos/generated/index.js',
      '@targon/auth': '../../packages/auth/dist/index.js',
    },
  },
};

export default nextConfig;
