"use client";

import { useState } from "react";

type Outcome = {
  eligibility: string;
  metCriteria: string[];
  unmetCriteria: string[];
  blocked: boolean;
  blockReason?: string;
  riskSummary: string;
  governanceRequirement: string;
  humanReviewRequired: boolean;
  estimatedBenefit: number | null;
  rationale: string[];
};

type Response = {
  strategy: {
    code: string;
    title: string;
    jurisdiction: string;
    position: string;
    statutoryReference: string;
    authorityStatus: string;
    documentationRequirements: string[];
    implementationSteps: string[];
    alternatives: string[];
    provenance: string;
  };
  entity: { code: string; legalName: string; jurisdiction: string };
  outcome: Outcome;
  policyObligations: { type: string; approverRole?: string; message: string }[];
  disclaimer: string;
};

const TONE: Record<string, string> = {
  ELIGIBLE: "border-emerald-500/40 bg-emerald-500/10",
  CONDITIONAL: "border-amber-500/40 bg-amber-500/10",
  UNDER_REVIEW: "border-amber-500/40 bg-amber-500/10",
  INELIGIBLE: "border-rose-500/40 bg-rose-500/10",
};

export function TaxWorkbench({
  canAssess,
  strategies,
  entities,
}: {
  canAssess: boolean;
  strategies: { id: string; code: string; title: string; jurisdiction: string; position: string }[];
  entities: { id: string; name: string; country: string }[];
}) {
  const [strategyId, setStrategyId] = useState(strategies[0]?.id ?? "");
  const [entityId, setEntityId] = useState(entities.find((e) => e.country === "TZ")?.id ?? entities[0]?.id ?? "");
  const [baseAmount, setBaseAmount] = useState(1_200_000);
  const [facts, setFacts] = useState<Record<string, boolean | string | number>>({
    assetClass: "PLANT_MACHINERY",
    assetInUse: true,
    invoiceEvidence: true,
    tpDocumentation: false,
    benefitTest: false,
    markup: 8,
    doneeApproved: true,
    donationPctOfIncome: 1.5,
    qualifyingRnD: true,
  });
  const [res, setRes] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = "rounded-lg border border-[color:var(--beyu-line)] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[#d4af37]";

  async function assess() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/finance/tax/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ strategyId, legalEntityId: entityId, baseAmount, facts }),
      });
      const json = await r.json();
      if (!r.ok) {
        setError(json?.error?.message ?? "Assessment rejected.");
        setRes(null);
        return;
      }
      setRes(json.data as Response);
    } catch {
      setError("Unable to reach the tax engine.");
    } finally {
      setBusy(false);
    }
  }

  if (!canAssess) {
    return (
      <div className="beyu-panel px-5 py-4 text-[12px] beyu-muted">
        finance:tax.assess is not granted to your roles — the knowledge graph below is read-only for you.
      </div>
    );
  }

  return (
    <div className="beyu-panel p-5">
      <div className="beyu-kicker text-[#b08d1c]">Eligibility workbench</div>
      <h2 className="mt-1 text-[15px] font-semibold">Assess a taxpayer against a registered position</h2>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <label className="text-[11.5px]">
          <div className="beyu-kicker beyu-muted">Strategy</div>
          <select className={`${input} mt-1 w-full`} value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>{s.code} — {s.title} ({s.jurisdiction})</option>
            ))}
          </select>
        </label>
        <label className="text-[11.5px]">
          <div className="beyu-kicker beyu-muted">Taxpayer (legal entity)</div>
          <select className={`${input} mt-1 w-full`} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.country})</option>
            ))}
          </select>
        </label>
        <label className="text-[11.5px]">
          <div className="beyu-kicker beyu-muted">Base amount</div>
          <input className={`${input} mt-1 w-full`} type="number" value={baseAmount} onChange={(e) => setBaseAmount(Number(e.target.value))} />
        </label>
        <div className="flex items-end">
          <button onClick={assess} disabled={busy} className="w-full rounded-lg bg-[#0b1d3a] px-4 py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-[#16294a] disabled:opacity-60">
            {busy ? "Assessing…" : "Assess eligibility"}
          </button>
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11.5px] font-semibold text-[#b08d1c]">Taxpayer facts</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {Object.entries(facts).map(([k, v]) => (
            <label key={k} className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11.5px]">
              <span className="beyu-muted">{k}</span>
              {typeof v === "boolean" ? (
                <input type="checkbox" checked={v} onChange={(e) => setFacts({ ...facts, [k]: e.target.checked })} />
              ) : (
                <input
                  className="w-28 rounded border border-[color:var(--beyu-line)] bg-transparent px-2 py-1 text-right"
                  value={String(v)}
                  onChange={(e) => setFacts({ ...facts, [k]: Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) })}
                />
              )}
            </label>
          ))}
        </div>
      </details>

      {error && <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">{error}</div>}

      {res && (
        <div className={`mt-4 rounded-xl border px-4 py-4 ${TONE[res.outcome.eligibility] ?? "border-[color:var(--beyu-line)]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[15px] font-semibold">{res.outcome.eligibility.replaceAll("_", " ")}</div>
              <div className="text-[11.5px] beyu-muted">
                {res.strategy.code} · {res.strategy.statutoryReference} · taxpayer {res.entity.legalName} ({res.entity.jurisdiction})
              </div>
            </div>
            <div className="text-right">
              <div className="beyu-kicker beyu-muted">Indicative benefit</div>
              <div className="text-[16px] font-semibold tabular-nums">
                {res.outcome.estimatedBenefit === null ? "—" : res.outcome.estimatedBenefit.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          {res.outcome.blocked && (
            <div className="mt-3 rounded-lg border border-rose-500/50 bg-rose-500/15 px-3 py-2 text-[12px] font-semibold text-rose-700 dark:text-rose-200">
              BLOCKED · {res.outcome.blockReason}
            </div>
          )}

          <div className="mt-3 grid gap-3 lg:grid-cols-2 text-[11.5px]">
            <div>
              <div className="beyu-kicker beyu-muted">Criteria met</div>
              <ul className="mt-1 space-y-0.5">{res.outcome.metCriteria.map((c) => <li key={c}>✓ {c}</li>)}{res.outcome.metCriteria.length === 0 && <li className="beyu-muted">—</li>}</ul>
              <div className="beyu-kicker mt-2 beyu-muted">Criteria outstanding</div>
              <ul className="mt-1 space-y-0.5">{res.outcome.unmetCriteria.map((c) => <li key={c}>✗ {c}</li>)}{res.outcome.unmetCriteria.length === 0 && <li className="beyu-muted">—</li>}</ul>
            </div>
            <div>
              <div className="beyu-kicker beyu-muted">Risk</div>
              <div className="mt-1">{res.outcome.riskSummary}</div>
              <div className="beyu-kicker mt-2 beyu-muted">Governance</div>
              <div className="mt-1">{res.outcome.governanceRequirement}</div>
              {res.policyObligations.map((o, i) => (
                <div key={i} className="mt-1">↳ {o.type}: {o.message}</div>
              ))}
              <div className="beyu-kicker mt-2 beyu-muted">Documentation required</div>
              <div className="mt-1">{res.strategy.documentationRequirements.join(" · ") || "—"}</div>
            </div>
          </div>

          <div className="mt-3">
            <div className="beyu-kicker beyu-muted">Reasoning trail</div>
            <ul className="mt-1 space-y-0.5 text-[11.5px]">{res.outcome.rationale.map((r, i) => <li key={i}>• {r}</li>)}</ul>
          </div>

          <div className="mt-3 rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-2 text-[11.5px]">
            {res.outcome.humanReviewRequired ? "HUMAN REVIEW REQUIRED. " : ""}{res.disclaimer}
          </div>
        </div>
      )}
    </div>
  );
}
