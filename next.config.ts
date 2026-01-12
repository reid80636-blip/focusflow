import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Set basePath if deploying to github.io/repo-name
  // basePath: '/studyflow',
  // assetPrefix: '/studyflow/',
};

export default nextConfig;
