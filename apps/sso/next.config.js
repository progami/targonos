/** @type {import('next').NextConfig} */
const { version } = require('./package.json')
const resolvedVersion = process.env.NEXT_PUBLIC_VERSION || version

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_VERSION: resolvedVersion,
    NEXT_PUBLIC_PORTAL_AUTH_URL: process.env.NEXT_PUBLIC_PORTAL_AUTH_URL,
  },
  async redirects() {
    return [
      {
        source: '/amazon/fba-fee-discrepancies',
        destination: '/talos/amazon/fba-fee-discrepancies',
        permanent: false,
      },
    ]
  },
  // Turbopack is the default bundler in Next.js 16
  turbopack: {
    resolveAlias: {
      '@targon/auth': '../../packages/auth/dist/index.js',
    },
  },
}

module.exports = nextConfig
