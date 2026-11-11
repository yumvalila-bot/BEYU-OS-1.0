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
  async rewrites() {\n    const healthApiUrl = process.env.HEALTH_API_URL?.replace(/\\/+$/, "");\n    if (!healthApiUrl) return [];\n    return [{ source: "/health-os/:path*", destination: `${healthApiUrl}/:path*` }];\n  },\n  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  // Health OS: no proxy to the standalone sector backend. The Health SPA's
  // sign-in calls /health-os/auth/* and now fails closed, because the backend
  // refuses standalone credentials (audit C-2, decision D-3). Identity is BEYU's.
  // Do not add a rewrite here until the governed identity bridge is implemented
  // and verified. Whether the sector backend is deployed at all is decision D-4.
};

export default nextConfig;
