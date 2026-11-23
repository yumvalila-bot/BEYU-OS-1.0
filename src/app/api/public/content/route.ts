import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, isNotNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";
import { parsePublicFeedQuery, toPublicFeedItem } from "@/lib/public-content";

export const dynamic = "force-dynamic";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

/**
 * Anonymous, read-only public news & events feed.
 *
 * SECURITY
 * - PostgreSQL RLS (`public_content_anonymous_published_read`) independently
 *   restricts anonymous reads solely to explicitly PUBLIC + PUBLISHED rows
 *   whose `published_at <= now()`.
 * - Query filters re-assert the same predicates at the application layer
 *   (defence in depth).
 * - Internal identifiers (`id`, `tenantId`, `createdBy`, `approvedBy`) are
 *   never selected or returned.
 */
export async function GET(request: NextRequest) {
  const parsed = parsePublicFeedQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { items: [], error: { code: parsed.code, message: parsed.message } },
      { status: 400, headers: SECURITY_HEADERS },
    );
  }

  try {
    const now = new Date();
    const conditions = [
      eq(publicContent.classification, "PUBLIC"),
      eq(publicContent.status, "PUBLISHED"),
      isNotNull(publicContent.publishedAt),
      lte(publicContent.publishedAt, now),
    ];

    if (parsed.kind) {
      conditions.push(eq(publicContent.kind, parsed.kind));
    }
    if (parsed.q) {
      const pattern = `%${parsed.q.replace(/[%_\\]/g, "\\$&")}%`;
      const match = or(ilike(publicContent.title, pattern), ilike(publicContent.summary, pattern));
      if (match) conditions.push(match);
    }

    const rows = await db
      .select({
        kind: publicContent.kind,
        title: publicContent.title,
        slug: publicContent.slug,
        summary: publicContent.summary,
        imageUrl: publicContent.imageUrl,
        location: publicContent.location,
        startsAt: publicContent.startsAt,
        endsAt: publicContent.endsAt,
        publishedAt: publicContent.publishedAt,
        isFeatured: publicContent.isFeatured,
      })
      .from(publicContent)
      .where(and(...conditions))
      .orderBy(desc(publicContent.isFeatured), desc(publicContent.publishedAt))
      .limit(parsed.limit)
      .offset(parsed.offset);

    return NextResponse.json(
      {
        items: rows.map(toPublicFeedItem),
        pagination: { limit: parsed.limit, offset: parsed.offset, count: rows.length },
        refreshedAt: now.toISOString(),
      },
      { status: 200, headers: SECURITY_HEADERS },
    );
  } catch {
    return NextResponse.json(
      {
        items: [],
        error: {
          code: "PUBLIC_FEED_UNAVAILABLE",
          message: "Public news and events are temporarily unavailable.",
        },
      },
      { status: 503, headers: SECURITY_HEADERS },
    );
  }
}
