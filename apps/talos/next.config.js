// Set up logging before anything else
// Temporarily disabled for debugging
// try {
//   require('./src/lib/setup-logging.js');
// } catch (error) {
//   console.error('Failed to set up logging:', error);
// }

// Get version from package.json
const { version } = require('./package.json')
const resolvedVersion = process.env.NEXT_PUBLIC_VERSION || version

const basePath = process.env.BASE_PATH || ''
const assetPrefix = basePath || ''

if (!process.env.NEXT_PUBLIC_APP_URL) {
  throw new Error('NEXT_PUBLIC_APP_URL must be defined before loading the Talos Next.js config.')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Note: This config supports both Webpack (for production builds) and Turbopack (for development).
  // The webpack configuration below is ignored when using Turbopack (--turbo flag).
  // Base path configuration - set BASE_PATH env var if needed
  basePath,
  assetPrefix,

  // Fix for Next.js 15 module resolution and HMR issues
  transpilePackages: ['lucide-react'],
  
  
  // Production optimizations
  compress: true,
  poweredByHeader: false,
  
  // Image optimization
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'targonglobal.com' },
      { protocol: 'https', hostname: 'www.targonglobal.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },
  
  // Strict mode for development
  reactStrictMode: true,
  
  // Production source maps (disable for security)
  productionBrowserSourceMaps: false,
  
  // Headers for security and caching
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
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate'
          }
        ]
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
    ]
  },

  // Support `/talos/*` URLs when BASE_PATH is not set.
  // When BASE_PATH is `/talos`, Next strips the basePath before matching rewrites.
  async rewrites() {
    if (basePath) {
      return []
    }

    return [{ source: '/talos/:path*', destination: '/:path*' }]
  },
  
  // Environment variables validation
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_BUILD_TIME: process.env.BUILD_TIME || new Date().toISOString(),
    NEXT_PUBLIC_VERSION: resolvedVersion,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH || basePath,
  },
  
  // Webpack configuration (for production builds)
  // Turbopack ignores this configuration when running with --turbo
  webpack: (config, { isServer, dev }) => {
    // Enable webpack stats for bundle analysis
    if (process.env.ANALYZE === 'true') {
      config.stats = 'verbose'
      // Log a message about how to analyze the bundle
      if (!isServer) {
        console.log('\n📊 Bundle analysis enabled!')
        console.log('After build completes, check .next/build-manifest.json')
        console.log('You can also install @next/bundle-analyzer for detailed analysis\n')
      }
    }
    
    // Fix for Next.js 15 webpack error with Link component and lucide-react
    if (!isServer && dev) {
      config.optimization = {
        ...config.optimization,
        concatenateModules: false,
        // Ensure modules are not being incorrectly tree-shaken
        usedExports: false,
        // Keep module ids stable
        moduleIds: 'named',
        chunkIds: 'named',
      }
      
      // Add rule to handle lucide-react ESM modules
      config.module.rules.push({
        test: /lucide-react/,
        sideEffects: false,
      })
    }
    
    return config
  },

  
  // Turbopack is the default bundler in Next.js 16
  turbopack: {
    resolveAlias: {
      '@targon/prisma-talos': '../../packages/prisma-talos/generated/index.js',
      '@targon/auth': '../../packages/auth/dist/index.js',
      '@targon/aws-s3': '../../packages/aws-s3/dist/index.js',
    },
  },

  // Enable experimental features for production optimization
  experimental: {
    // optimizeCss: true, // Disabled to avoid critters dependency issue
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts', '@radix-ui/react-icons', '@radix-ui/react-dialog', '@radix-ui/react-select'],
  },
  
  // Server external packages (moved from experimental in Next.js 15)
  serverExternalPackages: ['@targon/prisma-talos', 'bcryptjs', 'pdfkit'],
  
  // Additional production optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  
  // Removed standalone output - incompatible with custom server.js
  // output: 'standalone',
}

module.exports = nextConfig
