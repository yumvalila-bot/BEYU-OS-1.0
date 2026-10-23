import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sign-in", "/forgot-password"],
        disallow: [
          "/api/",
          "/os/",
          "/launcher",
          "/health/",
          "/enroll",
        ],
      },
    ],
    sitemap: "https://www.beyu.co.tz/sitemap.xml",
  };
}
