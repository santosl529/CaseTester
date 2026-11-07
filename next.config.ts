import type { NextConfig } from "next";

// Security headers on every response (security audit, 6 Nov). No full CSP yet: a script-src policy needs per-request
// nonces for Next's inline scripts — frame-ancestors alone stops the site being framed (clickjacking).
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The voice page uses the microphone on this origin; nothing uses the camera or location.
  { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  // The drills intro lesson is a static page read from lessons/intro/ at
  // runtime (lib/drills/lessons.ts), so the file ships with those routes.
  outputFileTracingIncludes: {
    '/drills/**': ['./lessons/intro/**'],
    '/api/drills/**': ['./lessons/intro/**'],
  },
};

export default nextConfig;
