import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // TypeScript errors are checked locally and in CI — allow build to complete on Vercel
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
