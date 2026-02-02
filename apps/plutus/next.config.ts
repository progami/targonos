import type { NextConfig } from 'next'
import { createRequire } from 'module'

const basePathFromEnv = process.env.BASE_PATH
const publicBasePathFromEnv = process.env.NEXT_PUBLIC_BASE_PATH

let appBasePath: string
if (basePathFromEnv !== undefined && basePathFromEnv !== '') {
  appBasePath = basePathFromEnv
} else if (publicBasePathFromEnv !== undefined && publicBasePathFromEnv !== '') {
  appBasePath = publicBasePathFromEnv
} else {
  appBasePath = '/plutus'
}

const require = createRequire(import.meta.url)
const { version } = require('./package.json') as { version: string }
const publicVersion = process.env.NEXT_PUBLIC_VERSION
const resolvedVersion = publicVersion !== undefined && publicVersion !== '' ? publicVersion : version

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
}

export default nextConfig
