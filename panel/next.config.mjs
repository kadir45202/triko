/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Panel, API isteklerini backend'e iletir — CORS ve origin derdi olmadan
    return [
      {
        source: '/api/:path*',
        destination: (process.env.BACKEND_URL || 'http://localhost:4000') + '/api/:path*',
      },
    ];
  },
};

export default nextConfig;
