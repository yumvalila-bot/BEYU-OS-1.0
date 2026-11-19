"use client";

import { useEffect, useState } from "react";

type PublicItem = {
  id: string;
  kind: "NEWS" | "EVENT";
  title: string;
  slug: string;
  summary: string;
  imageUrl: string | null;
  location: string | null;
  startsAt: string | null;
  publishedAt: string | null;
};

export function PublicNewsEvents() {
  const [items, setItems] = useState<PublicItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/public/content?limit=6", { cache: "no-store" });
        if (!response.ok) throw new Error("Feed unavailable");
        const payload = await response.json();
        const next = Array.isArray(payload.items) ? payload.items as PublicItem[] : [];
        if (!active) return;
        setItems(next);
        setState(next.length ? "ready" : "empty");
      } catch {
        if (active) setState("error");
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return (
    <div className="beyu-v2-news-grid" aria-live="polite">
      {state === "loading" && <p className="beyu-v2-feed-state">Loading published updates…</p>}
      {state === "empty" && <p className="beyu-v2-feed-state">No public news or events have been published yet.</p>}
      {state === "error" && <p className="beyu-v2-feed-state">News and events are temporarily unavailable. Please try again shortly.</p>}
      {items.map((item, index) => (
        <a className="beyu-v2-news-card" href={`/news/${encodeURIComponent(item.slug)}`} key={item.id}>
          <span className={`beyu-v2-news-thumb news-${index + 1}`} aria-hidden="true">{item.kind === "EVENT" ? "▦" : "▤"}</span>
          <span>
            <strong>{item.title}</strong>
            <small>{item.summary}</small>
            <em>{item.kind === "EVENT" && item.startsAt ? new Date(item.startsAt).toLocaleDateString() : "Read update"} →</em>
          </span>
        </a>
      ))}
    </div>
  );
}
