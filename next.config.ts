import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The drills intro lesson is a static page read from lessons/intro/ at
  // runtime (lib/drills/lessons.ts), so the file ships with those routes.
  outputFileTracingIncludes: {
    '/drills/**': ['./lessons/intro/**'],
    '/api/drills/**': ['./lessons/intro/**'],
  },
};

export default nextConfig;
