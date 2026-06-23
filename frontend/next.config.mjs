/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Samodzielny artefakt do obrazu Docker (mały runtime, server.js).
  output: 'standalone',
};

export default nextConfig;
