"use client";
import { useState } from "react";
import type { simulateResolution } from "@/lib/governance/simulation";
type Result = Awaited<ReturnType<typeof simulateResolution>>;
export function SimulationPanel({ resolutionId }: { resolutionId: string }) {
 const [result, setResult] = useState<Result | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
 return <details data-testid={`simulation-${resolutionId}`} className="mt-4 border-t border-slate-500/20 pt-3"><summary className="cursor-pointer text-xs font-semibold">Read-only governance preflight</summary>
  <p className="my-2 text-xs beyu-muted">Hypothetical only. This cannot grant authority, cast votes, approve, execute or close work.</p>
  <form className="space-y-2" onSubmit={async (e) => {
   e.preventDefault(); const form = new FormData(e.currentTarget); setError(null); setResult(null); setBusy(true);
   try {
    let input: unknown; try { input = JSON.parse(String(form.get("scenario"))); } catch { throw Error("Scenario must be valid JSON."); }
    const r = await fetch(`/api/v1/governance/resolutions/${resolutionId}/simulation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const data = await r.json(); if (!r.ok) throw Error(data.error?.message ?? "Simulation denied."); setResult(data.data);
   } catch (e) { setError(e instanceof Error ? e.message : "Simulation unavailable."); } finally { setBusy(false); }
  }}>
   <label className="block text-xs">Hypothetical scenario (JSON)<textarea name="scenario" rows={4} className="mt-1 w-full rounded border border-slate-500/30 bg-transparent p-2 font-mono text-xs" defaultValue={'{"ballots": [], "additionalRecusals": [], "assumeVotingConcluded": false}'} /></label>
   <button disabled={busy} className="rounded border border-[#b08d1c] px-3 py-2 text-xs disabled:opacity-40">Run read-only preflight</button>
  </form>
  {error && <p role="alert" className="mt-2 text-xs text-rose-500">{error}</p>}
  {result && <div role="status" className="mt-3 space-y-2 text-xs">
   <p className="font-semibold">SIMULATION ONLY — NO AUTHORITY OR APPROVAL GRANTED</p>
   <p>Stored state remains {result.source.status}. Hypothetical outcome: {result.hypothetical.outcome}.</p>
   <p>{result.hypothetical.explanation}</p>
   <p>Absolute quorum {result.hypothetical.quorum.required}; {result.hypothetical.quorum.participated} hypothetical participants.</p>
   <details><summary className="cursor-pointer">Observed checks and limitations</summary><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(result.checks, null, 2)}</pre><ul>{result.limitations.map((s) => <li key={s}>{s}</li>)}</ul></details>
  </div>}
 </details>;
}
