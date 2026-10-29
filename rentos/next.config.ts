import path from "node:path";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // This app lives in a subdirectory alongside an unrelated app (Driver
  // Desk) at the repo root, which also has its own lockfile. Pin the root
  // explicitly so Next.js doesn't try to infer it from that sibling.
  outputFileTracingRoot: path.join(__dirname),
  // Cache Components assumes mostly-static content with opt-in dynamic
  // islands. RentOS is the opposite shape -- an authenticated dashboard
  // where nearly every page reads the signed-in user's session -- so plain
  // per-request rendering fits better than fighting the new default.
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
