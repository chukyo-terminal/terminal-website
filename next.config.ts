import type { NextConfig } from 'next';


export default {
  reactStrictMode: true,
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: false,
  },

  images: {
    unoptimized: false,
  },

  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
} satisfies NextConfig;
