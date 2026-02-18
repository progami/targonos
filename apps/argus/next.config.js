// Get version from package.json
const { version } = require('./package.json')
const resolvedVersion = process.env.NEXT_PUBLIC_VERSION || version

const rawBasePath = (process.env.BASE_PATH ?? '').trim()
const rawBasePathWithoutTrailingSlash = rawBasePath.endsWith('/') ? rawBasePath.slice(0, -1) : rawBasePath
const basePathSegments = rawBasePathWithoutTrailingSlash.split('/').filter(Boolean)
const basePathHalfLen = Math.floor(basePathSegments.length / 2)
const hasDuplicatedBasePath =
  basePathSegments.length > 0 &&
  basePathSegments.length % 2 === 0 &&
  basePathSegments.slice(0, basePathHalfLen).join('/') === basePathSegments.slice(basePathHalfLen).join('/')
const basePath = hasDuplicatedBasePath
  ? `/${basePathSegments.slice(0, basePathHalfLen).join('/')}`
  : rawBasePathWithoutTrailingSlash
const assetPrefix = basePath || ''

if (!process.env.NEXT_PUBLIC_APP_URL) {
  if (process.env.NODE_ENV === 'development') {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3016/argus'
  } else {
    throw new Error('NEXT_PUBLIC_APP_URL must be defined before loading the Argus Next.js config.')
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  assetPrefix,

  transpilePackages: ['lucide-react'],

  compress: true,
  poweredByHeader: false,

  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'targonglobal.com' },
      { protocol: 'https', hostname: 'www.targonglobal.com' },
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com' },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },

  reactStrictMode: true,

  productionBrowserSourceMaps: false,

  async headers() {
    return [
      {
        source: '/config/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
      {
        source: `${basePath || ''}/config/:path*`,
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
      {
        source: `${basePath || ''}/_next/static/chunks/app/config/:path*`,
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  async rewrites() {
    if (basePath) {
      return []
    }

    return [{ source: '/argus/:path*', destination: '/:path*' }]
  },

  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_BUILD_TIME: process.env.BUILD_TIME || new Date().toISOString(),
    NEXT_PUBLIC_VERSION: resolvedVersion,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH || basePath,
  },

  webpack: (config, { isServer, dev }) => {
    if (!isServer && dev) {
      config.optimization = {
        ...config.optimization,
        concatenateModules: false,
        usedExports: false,
        moduleIds: 'named',
        chunkIds: 'named',
      }

      config.module.rules.push({
        test: /lucide-react/,
        sideEffects: false,
      })
    }

    return config
  },

  turbopack: {
    resolveAlias: {
      '@targon/auth': '../../packages/auth/dist/index.js',
    },
  },

  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-select'],
  },

  serverExternalPackages: ['bcryptjs'],

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  output: 'standalone',
}

module.exports = nextConfig
