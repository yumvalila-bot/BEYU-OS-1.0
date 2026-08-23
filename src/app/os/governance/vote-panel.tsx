"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Voting controls for a single resolution.
 *
 * Holds no authoritative state. Eligibility, the voting window, the tally and
 * quorum are all computed on the server (`votingSnapshots`) and re-read after
 * every mutation via `router.refresh()`. The UI never decides governance state
 * and never optimistically shows a decision.
 */

export type Snapshot = {
  resolutionId: string;
  canVote: boolean;
  reason: string | null;
  currentVote: string | null;
  windowState: "NOT_OPEN" | "OPEN" | "CLOSED";
  votingClosesAt: string | null;
  quorum: { eligible: number; recused: number; required: number; participated: number; met: boolean };
  tally: { for: number; against: number; abstain: number };
};

const VOTES = [
  { value: "FOR", label: "For", tone: "bg-emerald-600 hover:bg-emerald-700" },
  { value: "AGAINST", label: "Against", tone: "bg-rose-600 hover:bg-rose-700" },
  { value: "ABSTAIN", label: "Abstain", tone: "bg-slate-600 hover:bg-slate-700" },
] as const;

export function VotePanel({
  snapshot,
  status,
  canTable,
  canDecide,
  decidedByMemberId,
  decisionDate,
}: {
  snapshot: Snapshot;
  status: string;
  canTable: boolean;
  /** Server-resolved: the principal holds a presiding seat and may close this. */
  canDecide: boolean;
  decidedByMemberId: string | null;
  decisionDate: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(path: string, payload: unknown, describe: (d: unknown) => string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "The request was rejected.");
        return;
      }
      setNotice(describe(json.data));
      // Re-read the database; the panel never fabricates the new state.
      startTransition(() => router.refresh());
    } catch {
      setError("Unable to reach the governance service. Nothing was recorded.");
    } finally {
      setBusy(false);
    }
  }

  const vote = (value: string) =>
    submit(
      `/api/v1/governance/resolutions/${snapshot.resolutionId}/votes`,
      { vote: value },
      (d: unknown) => {
        const r = d as { vote: string; changed: boolean; outcome: string; status: string };
        const base = r.changed ? `Vote changed to ${r.vote}.` : `Vote ${r.vote} recorded.`;
        return r.outcome === "PENDING" ? base : `${base} Resolution is now ${r.status}.`;
      },
    );

  const table = () =>
    submit(
      `/api/v1/governance/resolutions/${snapshot.resolutionId}/table`,
      {},
      (d: unknown) => {
        const r = d as { votingClosesAt: string };
        return `Tabled. Voting is open until ${new Date(r.votingClosesAt).toISOString().slice(0, 16).replace("T", " ")} UTC.`;
      },
    );

  const decide = () =>
    submit(
      `/api/v1/governance/resolutions/${snapshot.resolutionId}/decision`,
      {},
      (d: unknown) => {
        const r = d as { outcome: string; explanation: string };
        return `Resolution closed as ${r.outcome}. ${r.explanation}`;
      },
    );

  const q = snapshot.quorum;
  const t = snapshot.tally;
  const decided = ["APPROVED", "REJECTED", "DEADLOCKED", "DEFERRED"].includes(status);

  /**
   * The outcome the ballots currently imply. Shown for transparency ONLY: it is
   * a projection, never a decision, and the server recomputes the authoritative
   * result inside the closing transaction.
   */
  const projected = !q.met
    ? "DEFERRED — quorum not met"
    : t.for === t.against
      ? "DEADLOCKED — tied"
      : t.for > t.against
        ? "APPROVED"
        : "REJECTED";

  return (
    <div className="mt-3 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px]">
        <span className="beyu-kicker beyu-muted">Ballot</span>
        <span>
          {t.for} for · {t.against} against · {t.abstain} abstain
        </span>
        <span className={q.met ? "text-emerald-700 dark:text-emerald-400" : "beyu-muted"}>
          quorum {q.participated}/{q.required} of {q.eligible} eligible
          {q.recused > 0 ? ` (${q.recused} recused, excluded)` : ""} — {q.met ? "met" : "not met"}
        </span>
        {snapshot.votingClosesAt && !decided && (
          <span className="beyu-muted">
            closes {new Date(snapshot.votingClosesAt).toISOString().slice(0, 16).replace("T", " ")} UTC
          </span>
        )}
      </div>

      {snapshot.currentVote && (
        <div className="mt-1.5 text-[11.5px]">
          Your recorded vote: <strong>{snapshot.currentVote}</strong>
          {snapshot.canVote && snapshot.currentVote !== "RECUSED" && (
            <span className="beyu-muted"> — you may change it while voting remains open.</span>
          )}
        </div>
      )}

      {snapshot.canVote && (
        <div className="mt-2 flex flex-wrap gap-2">
          {VOTES.map((v) => (
            <button
              key={v.value}
              onClick={() => vote(v.value)}
              disabled={busy || pending}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition disabled:opacity-60 ${v.tone} ${
                snapshot.currentVote === v.value ? "ring-2 ring-[#d4af37] ring-offset-1" : ""
              }`}
            >
              {snapshot.currentVote === v.value ? `${v.label} ✓` : v.label}
            </button>
          ))}
          {(busy || pending) && <span className="self-center text-[11px] beyu-muted">Recording…</span>}
        </div>
      )}

      {!snapshot.canVote && snapshot.reason && (
        <div className="mt-1.5 text-[11px] beyu-muted">{snapshot.reason}</div>
      )}

      {decided && (
        <div className="mt-2 rounded-lg border border-[color:var(--beyu-line)] bg-black/[0.02] px-3 py-2 text-[11.5px] dark:bg-white/[0.03]">
          <span className="beyu-kicker beyu-muted">Final outcome </span>
          <strong>{status}</strong>
          {decisionDate && (
            <span className="beyu-muted">
              {" "}
              · decided {new Date(decisionDate).toISOString().slice(0, 16).replace("T", " ")} UTC
            </span>
          )}
          {decidedByMemberId && (
            <span className="beyu-muted"> · by seat {decidedByMemberId}</span>
          )}
        </div>
      )}

      {canDecide && !decided && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={decide}
            disabled={busy || pending}
            className="rounded-lg bg-[#0b1d3a] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#16294a] disabled:opacity-60"
          >
            Close and record decision
          </button>
          <span className="text-[11px] beyu-muted">
            As presiding officer you may close this resolution. The outcome is computed from the
            ballots by the server — currently <strong>{projected}</strong> — and cannot be chosen.
          </span>
        </div>
      )}

      {canTable && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={table}
            disabled={busy || pending}
            className="rounded-lg bg-[#0b1d3a] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#16294a] disabled:opacity-60"
          >
            Table for voting
          </button>
          <span className="text-[11px] beyu-muted">
            As presiding officer you may place this resolution before the body, opening the voting
            window.
          </span>
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11.5px]">
          {notice}
        </div>
      )}
    </div>
  );
}
