"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SEAT_ROLES } from "@/lib/governance/charter-contract";
type Appointment = { authorityBodyId?: string | null; initialCharterId?: string | null; id: string; status: string; revision: number; nomineeUserId: string; nominatedByUserId: string; seatRole: string; votingRights: boolean; appointedOn: string; retiredOn: string; documentId: string; rationale: string; memberId: string | null };
export function AppointmentPanel({ initial = false, bodyId, userId, canManage, appointments }: { initial?: boolean; bodyId: string; userId: string; canManage: boolean; appointments: Appointment[] }) {
 const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
 const retry = useRef<{ fingerprint: string; key: string } | null>(null), root = `/api/v1/governance/bodies/${bodyId}/appointments`;
 const style = "w-full rounded border border-slate-500/30 bg-transparent p-2 text-xs";
 async function post(path: string, input: unknown) {
  const payload = JSON.stringify(input), fingerprint = path + payload;
  if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
  setBusy(true); setMessage("");
  try {
   const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": retry.current.key }, body: payload });
   const data = await response.json(); setMessage(response.ok ? "Recorded; server state refreshed." : data.error?.message ?? "Request denied.");
   // A later denial cannot disprove an earlier lost successful response.
   // Preserve identity for an unchanged retry; edited intentions get a new key.
   if (response.ok) retry.current = null;
   if (response.ok) router.refresh();
  } catch { setMessage("Response unconfirmed. Retry unchanged to recover safely."); }
  finally { setBusy(false); }
 }
 return <details className="mt-4 border-t border-slate-500/20 pt-3" data-appointment-body={bodyId}>
  <summary className="cursor-pointer text-xs font-semibold">Appointments & member terms</summary>
  <p className="my-2 text-xs beyu-muted">Nominate → independent decision-backed approval → nominee consent → current-authority activation. No security role, Finance capability or legal independence is granted by a label.</p>
  {initial && <p className="my-2 text-xs">Initial appointments are approved by the recorded superior and may obtain consent only. No membership or body activation occurs here; atomic composition activation is still required.</p>}
  {message && <p role="status" className="my-2 text-xs">{message}</p>}
  {appointments.map((a) => {
   const own = a.nomineeUserId === userId;
   const approve = canManage && !own && a.nominatedByUserId !== userId && a.status === "NOMINATED";
   const activate = !initial && !a.initialCharterId && canManage && !own && a.status === "ACCEPTED";
   const consent = own && ["APPROVED", "ACCEPTED"].includes(a.status);
   return <article id={`appointment-${a.id}`} data-appointment-id={a.id} key={a.id} className="my-3 space-y-2 rounded border border-slate-500/30 p-2 text-xs">
    <h4>{a.seatRole} · {a.status} · revision {a.revision}</h4><p className="break-all">{a.id} · nominee {a.nomineeUserId}</p>
    <p>{a.appointedOn} – {a.retiredOn} · {a.votingRights ? "Voting" : "Non-voting"}</p><p>{a.rationale}</p><p>Instrument: {a.documentId}</p>
    {a.initialCharterId && <p>Initial charter: {a.initialCharterId} · superior decision body: {a.authorityBodyId}. Consent is not membership.</p>}
    {a.memberId && <p>Canonical membership: {a.memberId}. Eligibility remains date-, policy- and scope-dependent.</p>}
    {(approve || activate || consent) && <form className="space-y-2" onSubmit={(event) => {
     event.preventDefault(); const f = new FormData(event.currentTarget), button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
     const command = button.value;
     void post(`${root}/${a.id}`, { command, expectedRevision: a.revision, note: f.get("note"), ...(command === "APPROVE" ? { resolutionId: f.get("resolution") } : {}) });
    }}>
     <label className="block">Appointment review / consent note<input name="note" minLength={10} required className={style} /></label>
     {approve && <label className="block">Approved nomination-specific APPOINTMENT resolution ID<input name="resolution" required className={style} /></label>}
     {approve && <button disabled={busy} value="APPROVE" className="rounded border p-2">Record independent appointment approval</button>}
     {activate && <button disabled={busy} value="ACTIVATE" className="rounded border p-2">Activate canonical membership</button>}
     {consent && <>{a.status === "APPROVED" && <button disabled={busy} value="ACCEPT" className="rounded border p-2">Accept appointment terms</button>} <button disabled={busy} value="DECLINE" className="rounded border p-2">Decline appointment</button></>}
    </form>}
   </article>;
  })}
  {canManage && <form className="mt-3 space-y-2 text-xs" onSubmit={(e) => {
   e.preventDefault(); const f = new FormData(e.currentTarget);
   void post(root, { nomineeUserId: f.get("nominee"), documentId: f.get("document"), seatRole: f.get("role"), votingRights: f.get("voting") === "on", appointedOn: f.get("start"), retiredOn: f.get("end"), rationale: f.get("rationale") });
  }}>
   <label className="block">Nominee user ID<input name="nominee" className={style} required /></label>
   <label className="block">Appointment instrument document ID<input name="document" className={style} required /></label>
   <label className="block">Seat role<select name="role" className={style} defaultValue="MEMBER">{SEAT_ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
   <label className="block"><input type="checkbox" name="voting" defaultChecked /> Voting rights (observers must not vote)</label>
   <label className="block">Term start<input type="date" name="start" className={style} required /></label>
   <label className="block">Term end (inclusive)<input type="date" name="end" className={style} required /></label>
   <label className="block">Nomination rationale and evidence review<textarea name="rationale" minLength={20} className={style} required /></label>
   <button disabled={busy} className="rounded border border-[#b08d1c] p-2">Nominate a body member</button>
  </form>}
 </details>;
}
