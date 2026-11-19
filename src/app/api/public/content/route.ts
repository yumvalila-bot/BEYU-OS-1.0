import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Anonymous, read-only feed. RLS independently permits only explicitly published PUBLIC records. */
export async function GET(request: NextRequest) {
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 6);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 12) : 6;
  try {
    const now = new Date();
    const rows = await db.select({
      id: publicContent.id,
      kind: publicContent.kind,
      title: publicContent.title,
      slug: publicContent.slug,
      summary: publicContent.summary,
      imageUrl: publicContent.imageUrl,
      location: publicContent.location,
      startsAt: publicContent.startsAt,
      publishedAt: publicContent.publishedAt,
    }).from(publicContent).where(and(
      eq(publicContent.classification, "PUBLIC"),
      eq(publicContent.status, "PUBLISHED"),
      isNotNull(publicContent.publishedAt),
      lte(publicContent.publishedAt, now),
    )).orderBy(desc(publicContent.isFeatured), desc(publicContent.publishedAt)).limit(limit);
    return NextResponse.json({ items: rows, refreshedAt: now.toISOString() }, {
      headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ items: [], error: "PUBLIC_FEED_UNAVAILABLE" }, {
      status: 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
