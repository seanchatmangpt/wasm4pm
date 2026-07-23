import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wasm4pm/cognition', 'wasm4pm-cognition-web'],
};

export default nextConfig;
