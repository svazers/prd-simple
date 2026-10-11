import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ponytail: export only when asked (local/tunnel build via server.py). Vercel
  // builds the normal Next app so api/ functions are served as functions.
  output: process.env.STATIC_EXPORT ? "export" : undefined,
  // .api.ts files are routes on Vercel but excluded from the static export,
  // which cannot contain route handlers.
  pageExtensions: process.env.STATIC_EXPORT ? ["tsx", "ts"] : ["tsx", "ts", "api.ts"],
  // ponytail: this container caps processes at 512 (cgroup pids.max); type-check and
  // parallel prerender workers abort with SIGABRT. Types are checked by the IDE.
  // Re-enable checks and remove the concurrency caps when building on normal hardware/CI.
  typescript: { ignoreBuildErrors: true },
  experimental: { cpus: 1 },
};

export default nextConfig;
