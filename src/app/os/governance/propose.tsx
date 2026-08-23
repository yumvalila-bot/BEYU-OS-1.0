"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Governance resolution proposal form.
 *
 * This component holds NO authoritative state. On success it calls
 * router.refresh(), which re-runs the server component and re-reads the database.
 * The newly created resolution appears because it was actually persisted — the
 * form never appends an optimistic item to a local list.
 */

type Body = { id: string; name: string; code: string; majorityRule: string; reservedMatters: string[] };

type Created = {
  id: string;
  reference: string;
  status: string;
  title: string;
  bodyName: string;
  requiredMajority: string;
  proposedBy: string;
  classification: string;
  obligations: { type: string; approverRole?: string; policyCode: string; message: string }[];
};

const CATEGORIES = ["RESERVED_MATTER", "CAPITAL", "POLICY", "APPOINTMENT", "TAX", "RISK", "OTHER"] as const;

const input =
  "w-full rounded-lg border border-[color:var(--beyu-line)] bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-[#d4af37]";

export function ProposeResolution({
  canPropose,
  bodies,
  clearance,
  classifications,
}: {
  canPropose: boolean;
  bodies: Body[];
  clearance: string;
  classifications: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [created, setCreated] = useState<Created | null>(null);

  const [form, setForm] = useState({
    bodyId: bodies[0]?.id ?? "",
    title: "",
    category: "POLICY" as (typeof CATEGORIES)[number],
    summary: "",
    rationale: "",
    dataBasis: "",
    consequences: "",
    classification: classifications.includes("RESTRICTED") ? "RESTRICTED" : (classifications[0] ?? "INTERNAL"),
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Client-side pre-validation mirrors the server contract. The server remains
  // authoritative — this only avoids obviously invalid round-trips.
  const problems: string[] = [];
  if (form.title.trim().length < 8) problems.push("Title must be at least 8 characters.");
  if (form.summary.trim().length < 20) problems.push("Summary must be at least 20 characters.");
  if (form.rationale.trim().length < 20) problems.push("Rationale must be at least 20 characters.");
  if (form.dataBasis.trim().length < 10) problems.push("Data basis must be at least 10 characters.");
  if (form.consequences.trim().length < 10) problems.push("Consequences must be at least 10 characters.");
  if (!form.bodyId) problems.push("Select a governance body.");

  async function submit() {
    setBusy(true);
    setError(null);
    setDetails([]);
    try {
      const res = await fetch("/api/v1/governance/resolutions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Only the fields the client is allowed to supply. Tenant, actor,
        // reference and lifecycle status are derived by the server.
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (!res.ok) {
        const code = json?.error?.code ?? "ERROR";
        const message = json?.error?.message ?? "The proposal was rejected.";
        setError(
          code === "UNAUTHENTICATED"
            ? "Your session has expired. Sign in again to propose a resolution."
            : code === "FORBIDDEN" || code === "CLASSIFICATION_DENIED" || code === "POLICY_DENIED"
              ? `Authorisation denied — ${message}`
              : message,
        );
        if (Array.isArray(json?.error?.details)) {
          setDetails(
            json.error.details.map(
              (d: { path?: (string | number)[]; message?: string }) =>
                `${(d.path ?? []).join(".") || "payload"}: ${d.message ?? "invalid"}`,
            ),
          );
        }
        setCreated(null);
        return;
      }

      setCreated(json.data as Created);
      setForm((f) => ({ ...f, title: "", summary: "", rationale: "", dataBasis: "", consequences: "" }));
      // Re-read the database so the persisted record is what gets displayed.
      startTransition(() => router.refresh());
    } catch {
      setError("Unable to reach the governance service. The proposal was not recorded.");
      setCreated(null);
    } finally {
      setBusy(false);
    }
  }

  if (!canPropose) {
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--beyu-line)] px-4 py-4 text-[12px] beyu-muted">
        <span className="font-mono">governance:resolution.propose</span> is not granted to your roles —
        the decision record is read-only for you.
      </div>
    );
  }

  const body = bodies.find((b) => b.id === form.bodyId);

  return (
    <div className="rounded-xl border border-[color:var(--beyu-line)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="beyu-kicker text-[#b08d1c]">Governed mutation</div>
          <div className="mt-0.5 text-[13.5px] font-semibold">Propose a resolution</div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[12px] font-semibold transition hover:border-[#d4af37]"
        >
          {open ? "Close" : "New proposal"}
        </button>
      </div>

      {created && (
        <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-[12px]">
          <div className="font-semibold">
            Resolution {created.reference} recorded as {created.status}.
          </div>
          <div className="mt-1 beyu-muted">
            {created.title} · {created.bodyName} · majority {created.requiredMajority} · proposed by{" "}
            {created.proposedBy} · {created.classification}
          </div>
          {created.obligations.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {created.obligations.map((o, i) => (
                <li key={i}>
                  ⚑ {o.type === "APPROVAL" ? "Approval required" : "Human review required"}
                  {o.approverRole ? ` — ${o.approverRole}` : ""} ({o.policyCode})
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1.5 beyu-muted">
            Written to the immutable audit ledger and published as a governance event in the same
            transaction. It carries no votes and no decision until the body votes.
          </div>
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="text-[11.5px]">
              <div className="beyu-kicker beyu-muted">Governance body</div>
              <select className={`${input} mt-1`} value={form.bodyId} onChange={(e) => set("bodyId")(e.target.value)}>
                {bodies.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.majorityRule})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px]">
              <div className="beyu-kicker beyu-muted">Category</div>
              <select
                className={`${input} mt-1`}
                value={form.category}
                onChange={(e) => set("category")(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} disabled={c === "RESERVED_MATTER" && body?.reservedMatters.length === 0}>
                    {c.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-[11.5px]">
            <div className="beyu-kicker beyu-muted">Title</div>
            <input className={`${input} mt-1`} value={form.title} onChange={(e) => set("title")(e.target.value)} />
          </label>

          <label className="block text-[11.5px]">
            <div className="beyu-kicker beyu-muted">Summary — what is being decided</div>
            <textarea className={`${input} mt-1`} rows={2} value={form.summary} onChange={(e) => set("summary")(e.target.value)} />
          </label>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="block text-[11.5px]">
              <div className="beyu-kicker beyu-muted">Rationale — why</div>
              <textarea className={`${input} mt-1`} rows={2} value={form.rationale} onChange={(e) => set("rationale")(e.target.value)} />
            </label>
            <label className="block text-[11.5px]">
              <div className="beyu-kicker beyu-muted">Data basis — on which data</div>
              <textarea className={`${input} mt-1`} rows={2} value={form.dataBasis} onChange={(e) => set("dataBasis")(e.target.value)} />
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="block text-[11.5px]">
              <div className="beyu-kicker beyu-muted">Consequences</div>
              <textarea className={`${input} mt-1`} rows={2} value={form.consequences} onChange={(e) => set("consequences")(e.target.value)} />
            </label>
            <label className="block text-[11.5px]">
              <div className="beyu-kicker beyu-muted">Classification (ceiling {clearance})</div>
              <select
                className={`${input} mt-1`}
                value={form.classification}
                onChange={(e) => set("classification")(e.target.value)}
              >
                {classifications.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {problems.length > 0 && (
            <ul className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11px] beyu-muted">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
              <div>{error}</div>
              {details.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[11px]">
                  {details.map((d) => (
                    <li key={d}>• {d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={submit}
              disabled={busy || pending || problems.length > 0}
              className="rounded-lg bg-[#0b1d3a] px-4 py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-[#16294a] disabled:opacity-60"
            >
              {busy ? "Recording…" : pending ? "Refreshing…" : "Propose resolution"}
            </button>
            <span className="text-[11px] beyu-muted">
              Enters the lifecycle as a draft proposal with zero votes. Voting and approval are separate
              governed decisions.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
