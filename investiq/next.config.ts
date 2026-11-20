import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // gzip-compress rendered pages and static assets on the server.
  compress: true,
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.google.com" }],
  },
};

export default nextConfig;
