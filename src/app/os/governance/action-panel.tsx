"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Action = {
  id: string; title: string; description: string | null; status: string; version: number;
  dueAt: string | null; overdue: boolean; assigneeUserId: string | null; dependsOnTaskId: string | null;
  completedByUserId: string | null; verifiedByUserId: string | null; closedAt: string | null;
  evidence: { id: string; documentId: string; documentVersion: string; documentChecksum: string; note: string }[];
};
const inputStyle = "rounded border border-slate-500/40 bg-transparent px-2 py-1.5 text-xs";

/** Server data only. Buttons request transitions; none declare a local outcome. */
export function ActionPanel({ resolutionId, actions, canManage, userId }: {
  resolutionId: string; actions: Action[]; canManage: boolean; userId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const retry = useRef<{ payload: string; key: string } | null>(null);
  async function submit(path: string, payload: unknown) {
    const encoded = JSON.stringify(payload);
    const fingerprint = path + encoded;
    if (retry.current?.payload !== fingerprint) retry.current = { payload: fingerprint, key: crypto.randomUUID() };
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": retry.current.key }, body: encoded });
      const json = await response.json();
      if (!response.ok) {
        setError(json?.error?.message ?? "The action was rejected.");
        if (response.status < 500) retry.current = null;
        return;
      }
      retry.current = null;
      setNotice("Recorded. The server state has been refreshed.");
      startTransition(() => router.refresh());
    } catch { setError("The response could not be confirmed. Retry unchanged to safely recover the same request, or reload to check its state."); }
    finally { setBusy(false); }
  }
  return <section className="mt-5 space-y-3 border-t border-slate-500/20 pt-4" aria-label="Resolution implementation">
    <h3 className="text-sm font-semibold">Implementation, evidence & independent verification</h3>
    <p className="text-xs beyu-muted">{actions.filter((a) => a.status === "CLOSED").length} of {actions.length} actions closed. Approval is not execution authority; Finance posting remains separately controlled.</p>
    {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
    {notice && <p role="status" className="text-xs text-emerald-600">{notice}</p>}
    {!actions.length && <p className="text-xs beyu-muted">No implementation actions recorded. This is not evidence of completion.</p>}
    {actions.map((action) => <article key={action.id} className="space-y-2 rounded border border-slate-500/25 p-3" data-action-id={action.id}>
      <h4 className="text-sm font-medium">{action.title}</h4>
      <p className="text-xs">{action.status} · revision {action.version}{action.overdue ? " · OVERDUE" : ""} · due {action.dueAt?.slice(0, 10) ?? "not set"}</p>
      <p className="text-xs beyu-muted">{action.description}</p>
      <p className="text-xs beyu-muted">Owner: {action.assigneeUserId ?? "Unassigned"}{action.dependsOnTaskId ? ` · Requires verified action ${action.dependsOnTaskId}` : ""}</p>
      {action.completedByUserId && <p className="text-xs">Completed by {action.completedByUserId} · independently verified by {action.verifiedByUserId ?? "Pending"}{action.closedAt ? ` · closed ${action.closedAt.slice(0, 10)}` : ""}</p>}
      <details><summary className="cursor-pointer text-xs">Evidence registry snapshots ({action.evidence.length})</summary>
        <ul className="mt-2 space-y-2 text-xs">{action.evidence.map((e) => <li key={e.id} className="break-all">{e.documentId} · version {e.documentVersion}<br />SHA-256: {e.documentChecksum}<br />{e.note}</li>)}</ul>
      </details>
      {action.status !== "CLOSED" && (canManage || action.assigneeUserId === userId) && <form className="flex flex-wrap gap-2" onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const command = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
        if (!command) return;
        void submit(`/api/v1/governance/actions/${action.id}`, { command, expectedVersion: action.version, note: form.get("note"),
          ...(command === "ASSIGN" ? { assigneeUserId: form.get("assignee") } : {}),
          ...(command === "SUBMIT_EVIDENCE" ? { documentId: form.get("document") } : {}) });
      }}>
        <label className="flex flex-col gap-1 text-xs">Reason / review note<input className={inputStyle} name="note" minLength={10} maxLength={2000} required /></label>
        {canManage && action.status === "OPEN" && <label className="flex flex-col gap-1 text-xs">Accountable user ID<input name="assignee" className={inputStyle} required /></label>}
        {action.assigneeUserId === userId && action.status === "IN_PROGRESS" && <label className="flex flex-col gap-1 text-xs">Evidence document ID<input name="document" className={inputStyle} /></label>}
        <div className="flex flex-wrap items-end gap-2">
          {[
            ...(canManage && action.status === "OPEN" ? [["ASSIGN", "Assign owner"]] : []),
            ...(action.assigneeUserId === userId && action.status === "ASSIGNED" ? [["START", "Start work"]] : []),
            ...(action.assigneeUserId === userId && action.status === "IN_PROGRESS" ? [["SUBMIT_EVIDENCE", "Link evidence"], ["BLOCK", "Record blocker"], ["COMPLETE", "Submit for verification"]] : []),
            ...(action.assigneeUserId === userId && action.status === "BLOCKED" ? [["RESUME", "Resume work"]] : []),
            ...(canManage && action.status === "COMPLETED" ? [["RETURN", "Return for rework"], ...(action.assigneeUserId !== userId && action.completedByUserId !== userId ? [["VERIFY", "Verify independently"]] : [])] : []),
            ...(canManage && action.status === "VERIFIED" ? [["CLOSE", "Close action"]] : []),
          ].map(([command, label]) => <button key={command} type="submit" value={command} disabled={busy || pending} className="rounded border border-[#b08d1c]/60 px-2 py-1.5 text-xs disabled:opacity-40">{label}</button>)}
        </div>
      </form>}
    </article>)}
    {canManage ? <details><summary className="cursor-pointer text-xs text-[#b08d1c]">Record a mandated implementation action</summary>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault(); const form = new FormData(e.currentTarget);
        const dependency = form.get("dependency");
        void submit(`/api/v1/governance/resolutions/${resolutionId}/actions`, {
          title: form.get("title"), description: form.get("description"), priority: form.get("priority"),
          dueAt: new Date(String(form.get("dueAt"))).toISOString(), ...(dependency ? { dependsOnTaskId: dependency } : {}),
        });
      }}>
        <label className="flex flex-col gap-1 text-xs">Action title<input name="title" className={inputStyle} minLength={5} maxLength={200} required /></label>
        <label className="flex flex-col gap-1 text-xs">Deadline (local time)<input name="dueAt" type="datetime-local" className={inputStyle} required /></label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">Mandate / acceptance criteria<textarea name="description" className={inputStyle} minLength={10} maxLength={5000} required /></label>
        <label className="flex flex-col gap-1 text-xs">Priority<select name="priority" className={inputStyle}><option>NORMAL</option><option>HIGH</option><option>CRITICAL</option></select></label>
        <label className="flex flex-col gap-1 text-xs">Verified prerequisite<select name="dependency" className={inputStyle}><option value="">None</option>{actions.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
        <button disabled={busy || pending} className="rounded bg-[#b08d1c] px-3 py-2 text-xs text-black disabled:opacity-40">Create implementation action</button>
      </form>
    </details> : <p className="text-xs beyu-muted">New mandates and review require a current unconflicted presiding seat, MFA and governed decision provenance. The server rechecks authority for every command.</p>}
  </section>;
}
