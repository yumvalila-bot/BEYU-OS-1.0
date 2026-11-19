import { notFound } from "next/navigation";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function PublicArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [item] = await db.select({
    kind: publicContent.kind, title: publicContent.title, summary: publicContent.summary,
    body: publicContent.body, imageUrl: publicContent.imageUrl, location: publicContent.location,
    startsAt: publicContent.startsAt, publishedAt: publicContent.publishedAt,
  }).from(publicContent).where(and(
    eq(publicContent.slug, slug), eq(publicContent.classification, "PUBLIC"),
    eq(publicContent.status, "PUBLISHED"), isNotNull(publicContent.publishedAt),
    lte(publicContent.publishedAt, new Date()),
  )).limit(1);
  if (!item) notFound();
  return <main className="mx-auto max-w-3xl space-y-5 px-5 py-12">
    <a href="/" className="text-sm font-semibold text-blue-800">← BEYU homepage</a>
    <p className="text-xs font-bold uppercase tracking-widest text-amber-700">{item.kind === "EVENT" ? "BEYU Event" : "BEYU News"}</p>
    <h1 className="text-3xl font-bold tracking-tight">{item.title}</h1>
    <p className="text-lg text-slate-600">{item.summary}</p>
    {item.imageUrl && <img src={item.imageUrl} alt="" className="max-h-[420px] w-full rounded-xl object-cover" />}
    {item.kind === "EVENT" && item.startsAt && <p className="text-sm text-slate-600">When: {item.startsAt.toLocaleString()}{item.location ? ` · ${item.location}` : ""}</p>}
    <article className="whitespace-pre-wrap leading-8 text-slate-800">{item.body}</article>
  </main>;
}
