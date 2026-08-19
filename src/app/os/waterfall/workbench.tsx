"use client";

import { useState } from "react";

type Line = {
  sequence: number;
  tierCode: string;
  tierName: string;
  beneficiaryType: string;
  basisAmount: number;
  allocatedAmount: number;
  remainingAfter: number;
  formula: string;
  legalBasis?: string | null;
};

type Result = {
  grossAmount: number;
  currency: string;
  lines: Line[];
  totalAllocated: number;
  residual: number;
  explanation: string[];
  warnings: string[];
  checksum: string;
  engineVersion: string;
  governance: { simulationOnly: boolean; commitRequires: string[]; approvedByResolutionId: string | null };
};

const fmt = (n: number, ccy: string) => `${ccy} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function WaterfallWorkbench({
  configId,
  currency,
  canSimulate,
  canCommit,
  tiers,
}: {
  configId: string;
  currency: string;
  canSimulate: boolean;
  canCommit: boolean;
  tiers: { code: string; name: string; rate: number | null }[];
}) {
  const [gross, setGross] = useState(5_250_000);
  const [scenario, setScenario] = useState<"BASE" | "UPSIDE" | "DOWNSIDE" | "STRESS">("BASE");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function simulate() {
    setBusy(true);
    setError(null);
    try {
      const numeric: Record<string, number> = {};
      for (const [k, v] of Object.entries(overrides)) {
        if (v !== "" && !Number.isNaN(Number(v))) numeric[k] = Number(v) / 100;
      }
      const res = await fetch("/api/v1/finance/waterfall/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ configId, grossAmount: gross, scenario, overrides: numeric }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Simulation rejected.");
        setResult(null);
        return;
      }
      setResult(json.data as Result);
    } catch {
      setError("Unable to reach the waterfall engine.");
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-[color:var(--beyu-line)] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[#d4af37]";

  if (!canSimulate) {
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--beyu-line)] px-4 py-4 text-[12px] beyu-muted">
        finance:waterfall.simulate is not granted to your roles — this configuration is read-only for you.
      </div>
    );
  }

  const maxAlloc = Math.max(1, ...(result?.lines.map((l) => l.allocatedAmount) ?? [1]));

  return (
    <div className="rounded-xl border border-[color:var(--beyu-line)] p-4">
      <div className="beyu-kicker text-[#b08d1c]">Scenario workbench</div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-[11.5px]">
          <div className="beyu-kicker beyu-muted">Distributable gross ({currency})</div>
          <input className={`${input} mt-1 w-52`} type="number" min={0} step={1000} value={gross} onChange={(e) => setGross(Number(e.target.value))} />
        </label>
        <label className="text-[11.5px]">
          <div className="beyu-kicker beyu-muted">Scenario</div>
          <select className={`${input} mt-1`} value={scenario} onChange={(e) => setScenario(e.target.value as typeof scenario)}>
            <option value="BASE">BASE</option>
            <option value="UPSIDE">UPSIDE</option>
            <option value="DOWNSIDE">DOWNSIDE</option>
            <option value="STRESS">STRESS</option>
          </select>
        </label>
        <button
          onClick={simulate}
          disabled={busy}
          className="rounded-lg bg-[#0b1d3a] px-4 py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-[#16294a] disabled:opacity-60"
        >
          {busy ? "Calculating…" : "Run simulation"}
        </button>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11.5px] font-semibold text-[#b08d1c]">Sensitivity overrides (rate %)</summary>
        <div className="mt-2 flex flex-wrap gap-3">
          {tiers.filter((t) => t.rate !== null).map((t) => (
            <label key={t.code} className="text-[11px]">
              <div className="beyu-muted">{t.name}</div>
              <input
                className={`${input} mt-1 w-28`}
                type="number"
                step={0.5}
                placeholder={((t.rate ?? 0) * 100).toFixed(2)}
                value={overrides[t.code] ?? ""}
                onChange={(e) => setOverrides({ ...overrides, [t.code]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </details>

      {error && <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">{error}</div>}

      {result && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3 text-[11.5px]">
            <span className="rounded-md border border-[color:var(--beyu-line)] px-2 py-1">gross {fmt(result.grossAmount, result.currency)}</span>
            <span className="rounded-md border border-[color:var(--beyu-line)] px-2 py-1">allocated {fmt(result.totalAllocated, result.currency)}</span>
            <span className="rounded-md border border-[color:var(--beyu-line)] px-2 py-1">residual {fmt(result.residual, result.currency)}</span>
            <span className="rounded-md border border-[color:var(--beyu-line)] px-2 py-1 font-mono">{result.checksum.slice(0, 16)}…</span>
            <span className="rounded-md border border-[color:var(--beyu-line)] px-2 py-1">{result.engineVersion}</span>
          </div>

          <div className="space-y-2">
            {result.lines.map((l) => (
              <div key={l.tierCode} className="grid grid-cols-[170px_1fr_140px] items-center gap-3">
                <div className="text-[12px] font-medium">{l.sequence}. {l.tierName}</div>
                <div className="h-2.5 rounded-full bg-[color:var(--beyu-line)]">
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-[#0b1d3a] to-[#d4af37]" style={{ width: `${Math.max(2, (l.allocatedAmount / maxAlloc) * 100)}%` }} />
                </div>
                <div className="text-right text-[12px] font-semibold tabular-nums">{fmt(l.allocatedAmount, result.currency)}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>#</th><th>Tier</th><th>Beneficiary</th><th>Basis</th><th>Allocated</th><th>Remaining</th><th>Formula</th></tr></thead>
              <tbody>
                {result.lines.map((l) => (
                  <tr key={`row-${l.tierCode}`}>
                    <td className="tabular-nums">{l.sequence}</td>
                    <td className="font-medium">{l.tierName}</td>
                    <td className="text-[11.5px]">{l.beneficiaryType}</td>
                    <td className="tabular-nums text-[11.5px]">{fmt(l.basisAmount, result.currency)}</td>
                    <td className="tabular-nums font-semibold">{fmt(l.allocatedAmount, result.currency)}</td>
                    <td className="tabular-nums text-[11.5px]">{fmt(l.remainingAfter, result.currency)}</td>
                    <td className="max-w-xs text-[11px] beyu-muted">{l.formula}{l.legalBasis ? ` · ${l.legalBasis}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px]">
              {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}

          <div className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
            <div className="beyu-kicker beyu-muted">Explanation</div>
            <ul className="mt-1 space-y-1 text-[11.5px]">
              {result.explanation.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>

          <div className="rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-2 text-[11.5px]">
            <strong>Simulation only.</strong> Committing a distribution requires{" "}
            {result.governance.commitRequires.length > 0 ? result.governance.commitRequires.join(", ") : "an approved board resolution"}.{" "}
            {canCommit
              ? "Your role may commit once a resolution is recorded against this configuration."
              : "Your role may not commit distributions (finance:waterfall.commit not granted)."}
          </div>
        </div>
      )}
    </div>
  );
}
