/** @type {import('next').NextConfig} */
const { version } = require('./package.json')
const resolvedVersion = process.env.NEXT_PUBLIC_VERSION || version

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_VERSION: resolvedVersion,
  },
  // Turbopack is the default bundler in Next.js 16
  turbopack: {
    resolveAlias: {
      '@targon/auth': '../../packages/auth/dist/index.js',
    },
  },
}

module.exports = nextConfig
