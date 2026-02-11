import type { NextConfig } from 'next';
import { createRequire } from 'module';

const BASE_PATH = '/argus';

const require = createRequire(import.meta.url);
const { version } = require('./package.json') as { version: string };

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: BASE_PATH,
  assetPrefix: BASE_PATH,

  env: {
    NEXT_PUBLIC_VERSION: version,
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },

  transpilePackages: ['@targon/auth', '@targon/logger'],
  serverExternalPackages: ['@targon/prisma-argus', '@targon/prisma-talos'],

  turbopack: {
    resolveAlias: {
      '@targon/prisma-argus': '../../packages/prisma-argus/generated/index.js',
      '@targon/prisma-talos': '../../packages/prisma-talos/generated/index.js',
      '@targon/auth': '../../packages/auth/dist/index.js',
      '@targon/aws-s3': '../../packages/aws-s3/dist/index.js',
    },
  },
};

export default nextConfig;
