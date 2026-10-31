import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Database drivers load native/WASM assets at runtime; don't bundle them.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Every screen is per-user behind login, so only validate segments that opt in with `instant`.
  experimental: {
    instantInsights: { validationLevel: "manual-warning" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
