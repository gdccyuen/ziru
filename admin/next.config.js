const externalApiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005/api";

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
