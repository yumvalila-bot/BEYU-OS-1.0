import type { MetadataRoute } from "next";

/**
 * BEYU OS — robots.txt
 *
 * Public pages are crawlable; private application content is disallowed.
 * robots.txt is NOT an access-control mechanism — it is a crawler hint only.
 * Real protection is server-side authorization + RLS on every route.
 *
 * Disallow:
 *   /os/         — authenticated control plane
 *   /api/        — internal APIs
 *   /launcher    — authenticated launcher
 *   /admin       — admin surfaces (if any)
 *   /health/os   — Health SPA mount (authenticated)
 *
 * The sitemap is canonical and host-derived from trusted config.
 */
export default function robots(): MetadataRoute.Robots {
  const base = "https://beyu-os-1-0.vercel.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sign-in", "/enroll", "/contact", "/offline"],
        disallow: ["/os/", "/api/", "/launcher", "/health/os"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
