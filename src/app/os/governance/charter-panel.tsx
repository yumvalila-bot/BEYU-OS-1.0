"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CharterRules } from "@/lib/governance/charter-contract";
type Charter = { id: string; version: number; revision: number; status: string; createdByUserId: string; resolutionId: string | null; terms: { purpose: string; documentId: string; documentVersion: string; documentChecksum: string; rules: CharterRules } | null };
export function CharterPanel({ bodyId, canManage, userId, charters, quorum, majority, composition }: {
  bodyId: string; canManage: boolean; userId: string; charters: Charter[]; quorum: number; majority: string; composition: string;
}) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const style = "w-full rounded border border-slate-500/30 bg-transparent p-2 text-xs";
  const root = `/api/v1/governance/bodies/${bodyId}/charters`;
  async function post(path: string, input: unknown) {
    const payload = JSON.stringify(input), fingerprint = path + payload;
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true); setMessage("");
    try {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": retry.current.key }, body: payload });
      const data = await r.json();
      setMessage(r.ok ? "Recorded; server state refreshed." : data.error?.message ?? "Request denied.");
      if (r.ok || r.status < 500) retry.current = null;
      if (r.ok) router.refresh();
    } catch { setMessage("Response unconfirmed. Retry unchanged to recover the same request safely."); }
    finally { setBusy(false); }
  }
  return <details className="mt-4 border-t border-slate-500/20 pt-3" data-charter-body={bodyId}>
    <summary className="cursor-pointer text-xs font-semibold">Charters & composition</summary>
    <p className="my-2 text-xs beyu-muted">{composition}. Adoption records a voted charter; it cannot grant a seat or change canonical voting rules.</p>
    {message && <p role="status" className="my-2 text-xs">{message}</p>}
    {charters.map((c) => <article key={c.id} data-charter-id={c.id} className="my-3 space-y-2 rounded border border-slate-500/30 p-2 text-xs">
      <h4>Version {c.version} · {c.status} · revision {c.revision}</h4><p className="break-all">{c.id}</p>
      {c.terms ? <><p>{c.terms.purpose}</p><p className="break-all">{c.terms.documentId} v{c.terms.documentVersion} · SHA-256 {c.terms.documentChecksum}</p>
        <p>Voting membership: {c.terms.rules.minimumVotingMembers}–{c.terms.rules.maximumVotingMembers}</p>
        <ul>{c.terms.rules.requiredSeats.map((s) => <li key={s.role}>{s.role}: {s.minimum}–{s.maximum}</li>)}</ul></> : <p>Classified terms withheld. This does not mean no charter exists.</p>}
      {c.resolutionId && <p className="break-all">Adopting decision: {c.resolutionId}</p>}
      {canManage && c.terms && (c.status === "DRAFT" || (c.status === "IN_REVIEW" && c.createdByUserId !== userId)) && <form className="space-y-2" onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget);
        void post(`${root}/${c.id}`, { command: c.status === "DRAFT" ? "SUBMIT" : "ADOPT", expectedRevision: c.revision, note: f.get("note"), ...(c.status === "IN_REVIEW" ? { resolutionId: f.get("resolution") } : {}) });
      }}>
        <label className="block">Review note<input className={style} name="note" minLength={10} required /></label>
        {c.status === "IN_REVIEW" && <label className="block">Approved charter-specific POLICY resolution ID<input className={style} name="resolution" required /></label>}
        <button disabled={busy} className="rounded border border-[#b08d1c] p-2 disabled:opacity-40">{c.status === "DRAFT" ? "Submit charter for review" : "Record independent charter adoption"}</button>
      </form>}
    </article>)}
    {canManage && <form className="mt-3 space-y-2" onSubmit={(e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      let rules: unknown; try { rules = JSON.parse(String(f.get("rules"))); } catch { setMessage("Composition rules must be valid JSON."); return; }
      void post(root, { documentId: f.get("document"), purpose: f.get("purpose"), rules });
    }}>
      <label className="block text-xs">Charter document ID<input name="document" className={style} required /></label>
      <label className="block text-xs">Charter purpose / terms of reference<textarea name="purpose" className={style} minLength={20} required /></label>
      <label className="block text-xs">Composition rules (JSON)<textarea name="rules" className={style} rows={8} defaultValue={JSON.stringify({ quorumMinimum: quorum, majorityRule: majority, minimumVotingMembers: quorum, maximumVotingMembers: 20, requiredSeats: [{ role: "CHAIR", minimum: 1, maximum: 1 }, { role: "SECRETARY", minimum: 1, maximum: 1 }] }, null, 2)} required /></label>
      <button disabled={busy} className="rounded border border-[#b08d1c] p-2 text-xs disabled:opacity-40">Create charter version</button>
    </form>}
  </details>;
}
