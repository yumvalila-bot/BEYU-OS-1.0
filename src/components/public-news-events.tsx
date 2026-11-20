"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicFeedItem } from "@/lib/public-content";

type FeedState =
  | { status: "loading" }
  | { status: "ready"; items: PublicFeedItem[] }
  | { status: "error"; message: string };

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

/**
 * Live governed public news & announcements strip on the BEYU homepage.
 *
 * Reads strictly from `/api/public/content` which only exposes explicitly
 * PUBLIC-classified, independently approved, PUBLISHED records. Never renders
 * fabricated, placeholder, or seeded institutional announcements.
 */
export function PublicNewsEvents({ limit = 3 }: { limit?: number }) {
  const [state, setState] = useState<FeedState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetch(`/api/public/content?limit=${encodeURIComponent(String(limit))}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          items?: PublicFeedItem[];
          error?: { message?: string };
        };
        if (!active) return;
        if (!res.ok) {
          setState({
            status: "error",
            message: data?.error?.message ?? "Public news and announcements are temporarily unavailable.",
          });
          return;
        }
        setState({ status: "ready", items: Array.isArray(data.items) ? data.items : [] });
      })
      .catch(() => {
        if (!active) return;
        setState({
          status: "error",
          message: "Unable to load published institutional announcements right now.",
        });
      });

    return () => {
      active = false;
    };
  }, [limit]);

  if (state.status === "loading") {
    return (
      <div className="beyu-news-skeleton-grid" role="status" aria-live="polite" aria-label="Loading published news and announcements">
        <span className="sr-only">Loading published institutional news and announcements…</span>
        {[0, 1, 2].map((slot) => (
          <div key={slot} className="beyu-news-skeleton-card" aria-hidden="true">
            <div className="beyu-news-skeleton-line beyu-news-skeleton-line-sm" />
            <div className="beyu-news-skeleton-line beyu-news-skeleton-line-lg" />
            <div className="beyu-news-skeleton-line" />
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="beyu-news-notice" role="status" aria-live="polite">
        <p className="beyu-news-notice-title">Announcements feed temporarily unavailable</p>
        <p className="beyu-news-notice-body">
          {state.message} Visit the{" "}
          <Link href="/news" className="beyu-inline-link">
            News &amp; Events archive
          </Link>{" "}
          to try again.
        </p>
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <div className="beyu-news-empty" role="status" aria-live="polite">
        <div className="beyu-news-empty-badge">Governed Publication Feed</div>
        <h3 className="beyu-news-empty-title">No public announcements published yet</h3>
        <p className="beyu-news-empty-body">
          Official BEYU news, institutional communiqués, and public events appear here automatically once authored and
          independently approved for public release through BEYU Communications.
        </p>
        <div className="beyu-news-empty-actions">
          <Link href="/news" className="beyu-link-arrow">
            Browse News &amp; Events Archive <span aria-hidden="true">›</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="beyu-news-grid">
      {state.items.map((item) => {
        const displayDate = formatDisplayDate(item.startsAt ?? item.publishedAt);
        return (
          <article key={item.slug} className="beyu-news-card">
            <div className="beyu-news-card-media" aria-hidden="true">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className="beyu-news-card-img" loading="lazy" decoding="async" />
              ) : (
                <div className="beyu-news-card-fallback">
                  <span className="beyu-news-card-kind">{item.kind === "EVENT" ? "EVENT" : "NEWS"}</span>
                </div>
              )}
            </div>
            <div className="beyu-news-card-body">
              <div className="beyu-news-card-meta">
                <span className="beyu-news-pill">{item.kind === "EVENT" ? "Event" : "Announcement"}</span>
                {displayDate ? <time dateTime={item.startsAt ?? item.publishedAt ?? undefined}>{displayDate}</time> : null}
              </div>
              <h3 className="beyu-news-card-title">
                <Link href={`/news/${item.slug}`}>{item.title}</Link>
              </h3>
              <p className="beyu-news-card-summary">{item.summary}</p>
              <Link href={`/news/${item.slug}`} className="beyu-news-read-more">
                Read More <span aria-hidden="true">›</span>
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
