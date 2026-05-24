/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',   // <-- add this line
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  async redirects() {
    return []
  },
}

export default nextConfig