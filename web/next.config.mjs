import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server actions import the ingester from ../src, so tracing has to start at the repo
  // root rather than at web/, or those files are left out of the standalone build.
  outputFileTracingRoot: path.join(import.meta.dirname, '..'),
  serverExternalPackages: ['pg'],
};

export default nextConfig;
