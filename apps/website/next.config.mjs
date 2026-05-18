const CAELUM_STAR_UK_URL = 'https://caelumstar.co.uk/';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/amazon/fba-fee-discrepancies',
        destination: '/talos/amazon/fba-fee-discrepancies',
        permanent: false,
      },
      {
        source: '/cs/us/packs',
        destination: '/cs/us',
        permanent: false,
      },
      {
        source: '/cs/us/packs/:slug',
        destination: '/cs/us',
        permanent: false,
      },
      {
        source: '/cs/us/where-to-buy',
        destination: '/cs/us',
        permanent: false,
      },
      {
        source: '/cs/us/support',
        destination: '/cs/us',
        permanent: false,
      },
      {
        source: '/cs/us/about',
        destination: '/cs/us',
        permanent: false,
      },
      {
        source: '/cs/us/gallery',
        destination: '/cs/us',
        permanent: false,
      },
      {
        source: '/cs/uk/packs',
        destination: CAELUM_STAR_UK_URL,
        permanent: false,
      },
      {
        source: '/cs/uk/packs/:slug',
        destination: CAELUM_STAR_UK_URL,
        permanent: false,
      },
      {
        source: '/cs/uk/where-to-buy',
        destination: CAELUM_STAR_UK_URL,
        permanent: false,
      },
      {
        source: '/cs/uk/support',
        destination: CAELUM_STAR_UK_URL,
        permanent: false,
      },
      {
        source: '/cs/uk/about',
        destination: CAELUM_STAR_UK_URL,
        permanent: false,
      },
    ]
  },
  images: {
    // NOTE: Some production setups (reverse proxies / missing optional deps)
    // can break the default image optimizer route (/_next/image).
    // We ship images from /public directly so they *always* load.
    unoptimized: true,
    formats: ['image/avif', 'image/webp']
  }
};

export default nextConfig;
