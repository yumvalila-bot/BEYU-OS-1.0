import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";
import { PublicInfoShell } from "@/components/public-info-shell";
import { isSafePublicImageUrl } from "@/lib/public-content";

export const dynamic = "force-dynamic";

function formatDisplayDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}

export default async function PublicNewsArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    notFound();
  }

  let row:
    | {
        kind: string;
        title: string;
        slug: string;
        summary: string;
        body: string;
        imageUrl: string | null;
        location: string | null;
        startsAt: Date | null;
        endsAt: Date | null;
        publishedAt: Date | null;
      }
    | undefined;

  try {
    const now = new Date();
    const [found] = await db
      .select({
        kind: publicContent.kind,
        title: publicContent.title,
        slug: publicContent.slug,
        summary: publicContent.summary,
        body: publicContent.body,
        imageUrl: publicContent.imageUrl,
        location: publicContent.location,
        startsAt: publicContent.startsAt,
        endsAt: publicContent.endsAt,
        publishedAt: publicContent.publishedAt,
      })
      .from(publicContent)
      .where(
        and(
          eq(publicContent.slug, slug),
          eq(publicContent.classification, "PUBLIC"),
          eq(publicContent.status, "PUBLISHED"),
          isNotNull(publicContent.publishedAt),
          lte(publicContent.publishedAt, now),
        ),
      )
      .limit(1);
    row = found;
  } catch {
    notFound();
  }

  if (!row) {
    notFound();
  }

  const publishedDate = formatDisplayDate(row.publishedAt);
  const eventDate = formatDisplayDate(row.startsAt);
  const safeImage = row.imageUrl && isSafePublicImageUrl(row.imageUrl) ? row.imageUrl : null;
  const paragraphs = row.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <PublicInfoShell
      eyebrow={row.kind === "EVENT" ? "BEYU Public Event" : "BEYU Institutional Announcement"}
      title={row.title}
      subtitle={row.summary}
    >
      <article className="beyu-article-card">
        <div className="beyu-article-meta">
          <span className="beyu-news-pill">{row.kind === "EVENT" ? "Event" : "News"}</span>
          {publishedDate ? <span>Published {publishedDate}</span> : null}
          {eventDate ? <span>Event Date: {eventDate}</span> : null}
          {row.location ? <span>Location: {row.location}</span> : null}
        </div>

        {safeImage ? (
          <div className="beyu-article-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={safeImage} alt={row.title} className="beyu-article-img" />
          </div>
        ) : null}

        <div className="beyu-article-body">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        <div className="beyu-article-footer">
          <Link href="/news" className="beyu-link-arrow">
            ← Back to News &amp; Events
          </Link>
        </div>
      </article>
    </PublicInfoShell>
  );
}
