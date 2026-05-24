/** @type {import('next').NextConfig} */
const nextConfig = {
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
  // ✅ Next.js 16: use proxy instead of middleware.ts for auth protection
  async redirects() {
    return []
  },
}

// ✅ Auth check handled in dashboard/page.tsx via supabase.auth.getUser()
// middleware.ts is no longer needed — delete it from the project root

export default nextConfig
