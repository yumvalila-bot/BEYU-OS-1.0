"use client";

import { useState } from "react";

type ContentRow = { id: string; title: string; status: string; classification: string };

export function PublicContentComposer({ rows }: { rows: ContentRow[] }) {
  const [kind, setKind] = useState<"NEWS" | "EVENT">("NEWS");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [classification, setClassification] = useState<"PUBLIC" | "INTERNAL">("PUBLIC");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/v1/public-content", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ kind, title, slug, summary, body, classification }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? result?.error ?? "Unable to save draft");
      setMessage("Draft saved. Refresh the page to submit it for approval.");
      setTitle(""); setSlug(""); setSummary(""); setBody("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save draft"); }
    finally { setBusy(false); }
  }

  async function act(id: string, action: "submit" | "approve") {
    setBusy(true); setMessage("");
    try {
      const response = action === "submit"
        ? await fetch("/api/v1/public-content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
        : await fetch("/api/v1/public-content/approval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? result?.error ?? "Action failed");
      setMessage(action === "submit" ? "Submitted for independent approval." : "Approved and published.");
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Action failed"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <form onSubmit={create} className="grid gap-3 rounded-xl border p-4 md:grid-cols-2">
      <h2 className="font-semibold md:col-span-2">Create news or event</h2>
      <label className="grid gap-1 text-sm">Content type<select className="rounded border p-2" value={kind} onChange={e => setKind(e.target.value as "NEWS" | "EVENT")}><option value="NEWS">News</option><option value="EVENT">Event</option></select></label>
      <label className="grid gap-1 text-sm">Classification<select className="rounded border p-2" value={classification} onChange={e => setClassification(e.target.value as "PUBLIC" | "INTERNAL")}><option value="PUBLIC">PUBLIC — intended for website</option><option value="INTERNAL">INTERNAL — never public</option></select></label>
      <label className="grid gap-1 text-sm md:col-span-2">Title<input required minLength={4} maxLength={180} className="rounded border p-2" value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="grid gap-1 text-sm md:col-span-2">URL slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className="rounded border p-2" placeholder="institutional-announcement" value={slug} onChange={e => setSlug(e.target.value)} /></label>
      <label className="grid gap-1 text-sm md:col-span-2">Summary<textarea required minLength={10} maxLength={400} rows={2} className="rounded border p-2" value={summary} onChange={e => setSummary(e.target.value)} /></label>
      <label className="grid gap-1 text-sm md:col-span-2">Full content<textarea required minLength={20} maxLength={20000} rows={6} className="rounded border p-2" value={body} onChange={e => setBody(e.target.value)} /></label>
      <button disabled={busy} className="rounded-lg bg-[#082b68] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 md:col-span-2">{busy ? "Saving…" : "Save as draft"}</button>
    </form>
    {message && <p role="status" className="rounded border p-3 text-sm">{message}</p>}
    <div className="space-y-2">{rows.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><strong>{row.title}</strong><p className="text-xs opacity-70">{row.classification} · {row.status}</p></div><div className="flex gap-2">{row.status === "DRAFT" && <button disabled={busy} onClick={() => void act(row.id,"submit")} className="rounded border px-3 py-1.5">Submit for approval</button>}{row.status === "PENDING_APPROVAL" && <button disabled={busy} onClick={() => void act(row.id,"approve")} className="rounded bg-[#082b68] px-3 py-1.5 text-white">Approve & publish</button>}</div></div>)}</div>
  </div>;
}
