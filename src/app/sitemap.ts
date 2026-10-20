import type { MetadataRoute } from "next";

/**
 * BEYU OS — sitemap for genuinely public, canonical pages only.
 *
 * Security: private application routes (/os/**), authenticated dashboards,
 * internal APIs (/api/**), tenant-scoped content, and user-specific pages
 * are intentionally EXCLUDED. The sitemap exposes only pages a visitor can
 * reach without authentication and that are safe to index.
 *
 * canonicalHost: uses metadataBase from layout (https://beyu-os-1-0.vercel.app)
 * but declares the production canonical domain for future host mapping.
 * The sitemap host is trusted config, never request-derived.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://beyu-os-1-0.vercel.app";
  const now = new Date();

  const publicRoutes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/sign-in", priority: 0.8, changeFrequency: "monthly" },
    { path: "/enroll", priority: 0.5, changeFrequency: "monthly" },
    { path: "/forgot-password", priority: 0.4, changeFrequency: "yearly" },
    { path: "/contact", priority: 0.7, changeFrequency: "monthly" },
    { path: "/offline", priority: 0.3, changeFrequency: "yearly" },
  ];

  return publicRoutes.map(({ path, priority, changeFrequency }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
