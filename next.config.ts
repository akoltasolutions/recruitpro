import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* Force webpack for production build — Turbopack crashes on low RAM servers */
  turbopack: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
