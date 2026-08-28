/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Samodzielny artefakt do obrazu Docker (mały runtime, server.js).
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/share/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
