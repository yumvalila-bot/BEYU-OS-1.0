import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    // Health OS sector API proxy — optional, OFF by default.
    //
    // The mounted Health SPA (`/health/os`, compiled from `sectors/health` by
    // `scripts/build-health-spa.mjs`) is built with its existing, documented
    // `VITE_API_BASE_URL=/health-os` knob, so its ONLY network surface is
    // same-origin `/health-os/auth/*`. When `HEALTH_API_URL` is configured at
    // build time, those requests are proxied to the sector NestJS backend.
    // When it is NOT configured (the default — no value exists in the
    // repository), the paths 404 and the SPA's sign-in fails closed, which is
    // the truthful state of an integration awaiting its deployment.
    //
    // No BEYU route is occupied by this namespace (verified: the BEYU auth
    // API lives under `/api/v1/auth`), no backend credential reaches the
    // browser, and no second deployment architecture is created.
    const healthApiBase = (process.env.HEALTH_API_URL ?? "").replace(/\/+$/, "");
    if (!healthApiBase) return [];
    return [
      {
        source: "/health-os/auth/:path*",
        destination: `${healthApiBase}/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
