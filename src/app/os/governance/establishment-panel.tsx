"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
type Proposal = { id: string; name: string; code: string; status: string; revision: number; proposedByUserId: string; bodyId: string | null };
export function EstablishmentPanel({ parentId, userId, canManage, quorum, majority, proposals }: { parentId: string; userId: string; canManage: boolean; quorum: number; majority: string; proposals: Proposal[] }) {
 const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
 const retry = useRef<{ fingerprint: string; key: string } | null>(null), root = `/api/v1/governance/bodies/${parentId}/establishments`;
 const style = "w-full rounded border border-slate-500/30 bg-transparent p-2 text-xs";
 async function post(path: string, input: unknown) {
  const payload = JSON.stringify(input), fingerprint = path + payload;
  if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
  setBusy(true); setMessage("");
  try {
   const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": retry.current.key }, body: payload });
   const data = await response.json(); setMessage(response.ok ? "Recorded; authoritative state refreshed." : data.error?.message ?? "Request denied.");
   if (response.ok || response.status < 500) retry.current = null;
   if (response.ok) router.refresh();
  } catch { setMessage("Outcome unconfirmed. Retry unchanged to recover safely."); }
  finally { setBusy(false); }
 }
 return <details className="mt-4 border-t border-slate-500/20 pt-3" data-establishment-parent={parentId}>
  <summary className="cursor-pointer text-xs font-semibold">Superior-body committee establishment</summary>
  <p className="my-2 text-xs beyu-muted">Establishment records a DRAFT committee, not active authority. Initial membership, charter adoption and activation require a further governed bootstrap path; they are not granted here.</p>
  {message && <p role="status" className="my-2 text-xs">{message}</p>}
  {proposals.map((p) => <article key={p.id} id={`body-establishment-${p.id}`} data-establishment-id={p.id} className="my-3 space-y-2 rounded border border-slate-500/30 p-2 text-xs">
   <h4>{p.name} · {p.status} · revision {p.revision}</h4><p className="break-all">{p.code} · {p.id}</p>
   {p.bodyId && <p>Canonical DRAFT committee: {p.bodyId}. No membership or execution authority granted.</p>}
   {canManage && p.status !== "ESTABLISHED" && (p.status === "DRAFT" || p.proposedByUserId !== userId) && <form className="space-y-2" onSubmit={(e) => {
    e.preventDefault(); const f = new FormData(e.currentTarget), command = p.status === "DRAFT" ? "SUBMIT" : p.status === "IN_REVIEW" ? "APPROVE" : "ESTABLISH";
    void post(`${root}/${p.id}`, { command, expectedRevision: p.revision, note: f.get("note"), ...(command === "APPROVE" ? { resolutionId: f.get("resolution") } : {}) });
   }}>
    <label className="block">Establishment review note<input name="note" minLength={10} required className={style} /></label>
    {p.status === "IN_REVIEW" && <label className="block">Superior RESERVED_MATTER resolution ID<input name="resolution" required className={style} /></label>}
    <button disabled={busy} className="rounded border p-2">{p.status === "DRAFT" ? "Submit establishment for authority review" : p.status === "IN_REVIEW" ? "Record independent establishment approval" : "Establish inactive committee"}</button>
   </form>}
  </article>)}
  {canManage && <form className="mt-3 space-y-2 text-xs" onSubmit={(e) => {
   e.preventDefault(); const f = new FormData(e.currentTarget);
   let rules: unknown; try { rules = JSON.parse(String(f.get("rules"))); } catch { setMessage("Composition rules must be valid JSON."); return; }
   void post(root, { code: f.get("code"), name: f.get("name"), purpose: f.get("purpose"), documentId: f.get("document"), rules });
  }}>
   <label className="block">Committee registry code<input name="code" pattern="[A-Z][A-Z0-9_]{2,79}" required className={style} /></label>
   <label className="block">Committee name<input name="name" minLength={3} maxLength={200} required className={style} /></label>
   <label className="block">Establishment charter document ID<input name="document" required className={style} /></label>
   <label className="block">Committee mandate and limitations<textarea name="purpose" minLength={20} required className={style} /></label>
   <label className="block">Initial composition rules (JSON)<textarea name="rules" required className={style} defaultValue={JSON.stringify({ quorumMinimum: quorum, majorityRule: majority, minimumVotingMembers: quorum, maximumVotingMembers: Math.max(quorum, 8), requiredSeats: [{ role: "CHAIR", minimum: 1, maximum: 1 }, { role: "SECRETARY", minimum: 1, maximum: 1 }] })} /></label>
   <button disabled={busy} className="rounded border border-[#b08d1c] p-2">Propose inactive committee</button>
  </form>}
 </details>;
}
