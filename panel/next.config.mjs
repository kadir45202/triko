/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Panel, API isteklerini backend'e iletir — CORS ve origin derdi olmadan
    return [
      {
        source: '/api/:path*',
        destination: (process.env.BACKEND_URL || 'http://localhost:4000') + '/api/:path*',
      },
      // Yüklenen görseller (maskot/kombin) backend'de durur — önizlemeler
      // panel origin'inden /uploads/... ile erişebilsin
      {
        source: '/uploads/:path*',
        destination: (process.env.BACKEND_URL || 'http://localhost:4000') + '/uploads/:path*',
      },
    ];
  },
};

export default nextConfig;
