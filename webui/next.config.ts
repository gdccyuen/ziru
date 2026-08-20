import type { NextConfig } from "next";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5005/api";

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
