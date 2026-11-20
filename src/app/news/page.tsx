import Link from "next/link";
import { and, desc, eq, ilike, isNotNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";
import { PublicInfoShell } from "@/components/public-info-shell";
import { toPublicFeedItem, type PublicFeedItem } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "News & Events · BEYU",
  description: "Governed institutional announcements, communiqués, and public events published by BEYU.",
};

function formatDisplayDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default async function PublicNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const params = await searchParams;
  const rawKind = params.kind?.trim().toUpperCase();
  const kindFilter = rawKind === "NEWS" || rawKind === "EVENT" ? rawKind : null;
  const qFilter = params.q?.trim().slice(0, 100) || null;

  let items: PublicFeedItem[] = [];
  let unavailable = false;

  try {
    const now = new Date();
    const conditions = [
      eq(publicContent.classification, "PUBLIC"),
      eq(publicContent.status, "PUBLISHED"),
      isNotNull(publicContent.publishedAt),
      lte(publicContent.publishedAt, now),
    ];
    if (kindFilter) {
      conditions.push(eq(publicContent.kind, kindFilter));
    }
    if (qFilter) {
      const pattern = `%${qFilter.replace(/[%_\\]/g, "\\$&")}%`;
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
      .limit(30);

    items = rows.map(toPublicFeedItem);
  } catch {
    unavailable = true;
  }

  return (
    <PublicInfoShell
      eyebrow="BEYU Institutional Communications"
      title="News & Events"
      subtitle="Verified announcements, ecosystem milestones, and public events approved for release through BEYU's maker-checker governance workflow."
    >
      <div className="beyu-news-toolbar">
        <div className="beyu-news-filters" role="navigation" aria-label="Filter announcements by category">
          <Link href={qFilter ? `/news?q=${encodeURIComponent(qFilter)}` : "/news"} className={!kindFilter ? "beyu-filter-pill is-active" : "beyu-filter-pill"}>
            All Published
          </Link>
          <Link
            href={qFilter ? `/news?kind=NEWS&q=${encodeURIComponent(qFilter)}` : "/news?kind=NEWS"}
            className={kindFilter === "NEWS" ? "beyu-filter-pill is-active" : "beyu-filter-pill"}
          >
            News &amp; Announcements
          </Link>
          <Link
            href={qFilter ? `/news?kind=EVENT&q=${encodeURIComponent(qFilter)}` : "/news?kind=EVENT"}
            className={kindFilter === "EVENT" ? "beyu-filter-pill is-active" : "beyu-filter-pill"}
          >
            Events Calendar
          </Link>
        </div>

        <form action="/news" method="get" className="beyu-news-search-form" role="search">
          {kindFilter ? <input type="hidden" name="kind" value={kindFilter} /> : null}
          <label htmlFor="news-search-input" className="sr-only">
            Search published BEYU news and events
          </label>
          <input
            id="news-search-input"
            name="q"
            type="search"
            defaultValue={qFilter ?? ""}
            maxLength={100}
            placeholder="Search published announcements..."
            className="beyu-news-search-input"
          />
          <button type="submit" className="beyu-news-search-btn">
            Search
          </button>
        </form>
      </div>

      {unavailable ? (
        <div className="beyu-news-notice" role="status">
          <p className="beyu-news-notice-title">Public announcements archive is temporarily unavailable</p>
          <p className="beyu-news-notice-body">
            The public publication store could not be reached right now. Please try again shortly or contact{" "}
            <a href="mailto:info@beyu.co.tz" className="beyu-inline-link">
              info@beyu.co.tz
            </a>
            .
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="beyu-news-empty" role="status">
          <div className="beyu-news-empty-badge">Governed Public Archive</div>
          <h2 className="beyu-news-empty-title">
            {qFilter
              ? `No published announcements matched "${qFilter}"`
              : kindFilter === "EVENT"
                ? "No public events are currently published"
                : "No public announcements have been published yet"}
          </h2>
          <p className="beyu-news-empty-body">
            BEYU only displays announcements that have been explicitly classified as PUBLIC and independently approved
            through Segregation of Duties review. No placeholder or simulated entries are shown here.
          </p>
          {qFilter || kindFilter ? (
            <div className="beyu-news-empty-actions">
              <Link href="/news" className="beyu-link-arrow">
                Clear filters <span aria-hidden="true">›</span>
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="beyu-news-grid">
          {items.map((item) => {
            const displayDate = formatDisplayDate(item.startsAt ?? item.publishedAt);
            return (
              <article key={item.slug} className="beyu-news-card">
                <div className="beyu-news-card-media" aria-hidden="true">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="beyu-news-card-img" loading="lazy" decoding="async" />
                  ) : (
                    <div className="beyu-news-card-fallback">
                      <span className="beyu-news-card-kind">{item.kind}</span>
                    </div>
                  )}
                </div>
                <div className="beyu-news-card-body">
                  <div className="beyu-news-card-meta">
                    <span className="beyu-news-pill">{item.kind === "EVENT" ? "Event" : "Announcement"}</span>
                    {displayDate ? <time dateTime={item.startsAt ?? item.publishedAt ?? undefined}>{displayDate}</time> : null}
                  </div>
                  <h2 className="beyu-news-card-title">
                    <Link href={`/news/${item.slug}`}>{item.title}</Link>
                  </h2>
                  <p className="beyu-news-card-summary">{item.summary}</p>
                  {item.location ? <p className="beyu-news-card-location">{item.location}</p> : null}
                  <Link href={`/news/${item.slug}`} className="beyu-news-read-more">
                    Read Full Announcement <span aria-hidden="true">›</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PublicInfoShell>
  );
}
