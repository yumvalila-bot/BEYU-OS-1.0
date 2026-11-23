import Link from "next/link";
import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function PublicNewsIndex() {
  const now = new Date();
  const items = await db.select({
    kind: publicContent.kind, title: publicContent.title, slug: publicContent.slug,
    summary: publicContent.summary, startsAt: publicContent.startsAt, publishedAt: publicContent.publishedAt,
  }).from(publicContent).where(and(
    eq(publicContent.classification, "PUBLIC"), eq(publicContent.status, "PUBLISHED"),
    isNotNull(publicContent.publishedAt), lte(publicContent.publishedAt, now),
  )).orderBy(desc(publicContent.isFeatured), desc(publicContent.publishedAt)).limit(100);
  return <main className="mx-auto max-w-5xl space-y-8 px-5 py-12">
    <Link href="/" className="text-sm font-semibold text-blue-800">← BEYU homepage</Link>
    <header><p className="text-xs font-bold uppercase tracking-widest text-amber-700">BEYU Updates</p><h1 className="mt-2 text-3xl font-bold">News & Events</h1><p className="mt-2 text-slate-600">Official announcements and upcoming events published by BEYU.</p></header>
    {items.length === 0 ? <p className="rounded-xl border bg-white p-6 text-sm text-slate-600">There are no public updates yet. Please check again soon.</p> : <div className="grid gap-4 md:grid-cols-2">{items.map(item => <article key={item.slug} className="rounded-xl border bg-white p-5"><p className="text-xs font-bold uppercase text-amber-700">{item.kind === "EVENT" ? "Event" : "News"}</p><h2 className="mt-2 text-lg font-semibold text-slate-900">{item.title}</h2><p className="mt-2 text-sm text-slate-600">{item.summary}</p>{item.kind === "EVENT" && item.startsAt && <p className="mt-2 text-xs text-slate-500">{item.startsAt.toLocaleString()}</p>}<Link className="mt-4 inline-block text-sm font-semibold text-blue-800" href={`/news/${encodeURIComponent(item.slug)}`}>Read more →</Link></article>)}</div>}
  </main>;
}
