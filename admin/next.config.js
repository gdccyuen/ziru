// Containers set API_INTERNAL_URL=http://api:5005 (the core API service on
// the compose network); local dev keeps the NEXT_PUBLIC_API_URL / 127.0.0.1
// fallback. The core API serves both /v1/* and /api/v1/*, so either form works.
const externalApiBaseUrl =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:5005";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${externalApiBaseUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
