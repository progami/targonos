/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // NOTE: Some production setups (reverse proxies / missing optional deps)
    // can break the default image optimizer route (/_next/image).
    // We ship images from /public directly so they *always* load.
    unoptimized: true,
    formats: ['image/avif', 'image/webp']
  }
};

export default nextConfig;
