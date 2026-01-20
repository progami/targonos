import type { NextConfig } from 'next'
import { createRequire } from 'module'

const appBasePath = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || '/plutus'

const require = createRequire(import.meta.url)
const { version } = require('./package.json') as { version: string }
const resolvedVersion = process.env.NEXT_PUBLIC_VERSION || version

const nextConfig: NextConfig = {
  basePath: appBasePath,
  assetPrefix: appBasePath,
  transpilePackages: ['@targon/auth', '@targon/config', '@targon/logger'],
  env: {
    NEXT_PUBLIC_VERSION: resolvedVersion,
    NEXT_PUBLIC_BASE_PATH: appBasePath,
  },
  turbopack: {
    resolveAlias: {
      '@targon/auth': '../../packages/auth/dist/index.js',
    },
  },
  // TODO: Fix React 19 types incompatibility with @radix-ui forwardRef components
  // See: https://github.com/radix-ui/primitives/issues/2881
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
