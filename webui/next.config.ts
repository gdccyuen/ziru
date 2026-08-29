import type { NextConfig } from "next";

// Containers set API_INTERNAL_URL=http://api:5005 (the core API service on
// the compose network); local dev keeps the NEXT_PUBLIC_API_URL / 127.0.0.1
// fallback. The core API serves both /v1/* and /api/v1/*, so either form works.
const apiBaseUrl =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:5005";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
  serverExternalPackages: [
    "pg",
    "@neondatabase/serverless",
    "postgres",
  ],
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
  ],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
