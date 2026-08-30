import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, BarChart, DonutChart, ProgressBar } from "../components/Charts";
import { Classification } from "../components/Security";
import {
  TAXES, ANTI_DT_RULES, DTAS, TAX_TRANSACTIONS, TAX_KPIS,
  statusStyle, type TaxTransaction, type DoubleTaxRule, type TaxCode,
} from "../services/tax";

/* ═══════════════════════════════════════════════════════════════════════════
   BEYU TAX ORCHESTRATION & ANTI-DOUBLE-TAXATION ENGINE
   ═══════════════════════════════════════════════════════════════════════════ */

export function TaxOrchestrationScreen() {
  const [tab, setTab] = useState<"orchestrator" | "rules" | "ledger" | "dta" | "efd" | "report">("orchestrator");

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Tax Orchestration & Anti-Double-Taxation"
        subtitle="One transaction · one tax outcome · zero duplication · TRA + DTA compliant"
        actions={
          <>
            <Classification level="CONFIDENTIAL" />
            <button className="btn-outline text-sm">Audit Pack</button>
            <button className="btn-primary text-sm">Run Reconciliation</button>
          </>
        }
      />

      {/* HERO */}
      <div className="card p-6 mb-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-emerald-900 to-violet-900" />
        <div className="absolute inset-0 bg-dot opacity-15" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <div className="text-[11px] tracking-[0.3em] text-gold-400 font-semibold flex items-center gap-2">
              <I.shield size={14} stroke="#D4AF37" /> TAX ORCHESTRATOR · ANTI-DOUBLE-TAXATION
            </div>
            <h2 className="font-display text-3xl mt-2">
              <span className="text-gold-400">TZS {(TAX_KPIS.totalSaved / 1_000_000).toFixed(2)}M</span> in duplicate tax prevented today
            </h2>
            <p className="text-white/80 mt-2 text-sm max-w-2xl">
              Every transaction across BEYU Health OS passes through the Tax Orchestrator: classified,
              checked against {ANTI_DT_RULES.length} double-taxation rules, reconciled with EFD/VFD,
              and routed for credit, exemption or refund as required.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">VAT Act 2014</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">Income Tax Act 2004</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">{DTAS.length} DTA treaties</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">EFD/VFD live</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center min-w-[280px]">
            {[
              { l: "Transactions", v: TAX_KPIS.transactions.toString(), c: "#fff" },
              { l: "Prevented", v: TAX_KPIS.prevented.toString(), c: "#fca5a5" },
              { l: "Exempted", v: TAX_KPIS.exempted.toString(), c: "#86efac" },
              { l: "Credited (DTA)", v: TAX_KPIS.credited.toString(), c: "#c4b5fd" },
            ].map(s => (
              <div key={s.l} className="rounded-xl bg-white/10 border border-white/15 px-3 py-2">
                <div className="font-display text-2xl" style={{ color: s.c }}>{s.v}</div>
                <div className="text-[9px] tracking-widest text-white/60 mt-0.5">{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-5">
        {[
          { id: "orchestrator", l: "Orchestrator Flow" },
          { id: "rules", l: "12 Anti-DT Rules" },
          { id: "ledger", l: "Transaction Ledger" },
          { id: "dta", l: "Cross-Border (DTA)" },
          { id: "efd", l: "EFD / TRA Reconciliation" },
          { id: "report", l: "Savings Report" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3 py-2 rounded-md text-xs font-semibold transition ${tab === t.id ? "bg-white text-navy-800 shadow" : "text-slate-500"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "orchestrator" && <OrchestratorTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "ledger" && <LedgerTab />}
      {tab === "dta" && <DTATab />}
      {tab === "efd" && <EFDTab />}
      {tab === "report" && <ReportTab />}
    </div>
  );
}

/* ─────────────────── Orchestrator Flow ─────────────────── */

function OrchestratorTab() {
  const steps = [
    { n: 1, t: "Classify", d: "Detect transaction type (clinical · payroll · supply · cross-border)", c: "#0B1D3A" },
    { n: 2, t: "Apply Tax Codes", d: "Determine all candidate taxes (VAT, WHT, Service Levy, etc.)", c: "#1E3A8A" },
    { n: 3, t: "Check Exemptions", d: "Healthcare exemption · NEMLIT · zero-rated", c: "#059669" },
    { n: 4, t: "Detect DT Conflicts", d: "Run 12 anti-double-taxation rules", c: "#dc2626" },
    { n: 5, t: "Resolve Conflicts", d: "Block · re-route · exempt · credit · review", c: "#b45309" },
    { n: 6, t: "Apply DTA Treaty", d: "Cross-border? Apply DTA-reduced rate", c: "#7c3aed" },
    { n: 7, t: "Issue EFD Receipt", d: "Submit to TRA via fiscal device", c: "#0d9488" },
    { n: 8, t: "Audit Stamp", d: "Hash + anchor to immutable ledger", c: "#0B1D3A" },
  ];

  return (
    <>
      <div className="card p-6 mb-4">
        <div className="font-display text-xl text-navy-800 mb-1">8-Step Orchestration Pipeline</div>
        <div className="text-xs text-slate-500 mb-5">Every transaction passes through these steps before tax is finalised</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          {steps.map(s => (
            <div key={s.n} className="card !shadow-none border p-4 relative" style={{ borderTopColor: s.c, borderTopWidth: 3 }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg text-white flex items-center justify-center font-display text-base font-bold shrink-0" style={{ background: s.c }}>{s.n}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-navy-800 text-sm">{s.t}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{s.d}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Today's Outcomes</div>
          <div className="flex justify-center mb-3">
            <DonutChart value={TAX_KPIS.transactions} max={TAX_KPIS.transactions} label="TX" color="#059669" />
          </div>
          <div className="space-y-1.5 text-xs">
            {(["CLEARED", "EXEMPTED", "PREVENTED", "REROUTED", "CREDITED"] as const).map(s => {
              const n = TAX_TRANSACTIONS.filter(t => t.status === s).length;
              const st = statusStyle(s);
              return (
                <div key={s} className="flex items-center gap-2">
                  <span className={`w-2 h-5 rounded ${st.dot}`} />
                  <span className="flex-1 text-slate-700">{st.label}</span>
                  <span className="font-mono font-bold text-navy-800">{n}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-2">Duplicate Tax Prevented per Conflict Type (TZS k)</div>
          <BarChart
            data={ANTI_DT_RULES.slice(0, 8).map(r => {
              const total = TAX_TRANSACTIONS.filter(t => t.conflictRule === r.id).reduce((s, t) => s + t.saved, 0);
              return { name: r.id, value: Math.round(total / 1000) };
            })}
            height={220}
          />
        </div>
      </div>

      <div className="card p-5 bg-gradient-to-br from-emerald-50 to-navy-50">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-emerald-600 flex items-center justify-center"><I.check size={24} stroke="#fff" /></div>
          <div className="flex-1">
            <div className="font-display text-xl text-navy-800">Zero double-taxation by design</div>
            <p className="text-sm text-slate-700 mt-1 max-w-3xl">
              The Tax Orchestrator runs as a deterministic step in every financial flow — billing, payroll,
              procurement, NHIF claims, cross-border invoices, even inter-tenant transfers. Every prevented
              duplication is logged, hashable and auditable by TRA on demand.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────── Rules Tab ─────────────────── */

function RulesTab() {
  return (
    <div className="space-y-3">
      {ANTI_DT_RULES.map(r => <RuleCard key={r.id} rule={r} />)}
    </div>
  );
}

function RuleCard({ rule }: { rule: DoubleTaxRule }) {
  const sev = rule.severity;
  const color =
    sev === "BLOCKED" ? "rose" :
    sev === "REROUTED" ? "amber" :
    sev === "CREDITED" ? "violet" : "navy";
  return (
    <div className={`card p-5 border-l-4 ${
      color === "rose" ? "border-l-rose-500" :
      color === "amber" ? "border-l-amber-500" :
      color === "violet" ? "border-l-violet-500" : "border-l-navy-500"
    }`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${
          color === "rose" ? "bg-rose-100" :
          color === "amber" ? "bg-amber-100" :
          color === "violet" ? "bg-violet-100" : "bg-navy-100"
        }`}>
          <I.shield size={18} stroke={
            color === "rose" ? "#dc2626" :
            color === "amber" ? "#b45309" :
            color === "violet" ? "#7c3aed" : "#0B1D3A"
          } />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-[10px] text-slate-500">{rule.id}</span>
            {rule.codes.map(c => <TaxCodePill key={c} code={c} />)}
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold tracking-widest ${
              color === "rose" ? "bg-rose-600 text-white" :
              color === "amber" ? "bg-amber-600 text-white" :
              color === "violet" ? "bg-violet-600 text-white" : "bg-navy-600 text-white"
            }`}>{sev}</span>
          </div>
          <div className="font-display text-base text-navy-800 leading-tight">{rule.name}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-3">
        <div className="rounded bg-rose-50 border border-rose-200 p-3">
          <div className="text-[10px] tracking-widest text-rose-700 font-semibold mb-1">⚠ WHY THIS IS DOUBLE-TAXATION</div>
          <div className="text-xs text-slate-700 leading-relaxed">{rule.reason}</div>
        </div>
        <div className="rounded bg-emerald-50 border border-emerald-200 p-3">
          <div className="text-[10px] tracking-widest text-emerald-700 font-semibold mb-1">✓ BEYU AUTO-RESOLUTION</div>
          <div className="text-xs text-slate-700 leading-relaxed">{rule.resolution}</div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-2">
        <I.scale size={12} stroke="#64748b" />
        <span className="font-semibold">Authority:</span> {rule.authority}
      </div>
    </div>
  );
}

function TaxCodePill({ code }: { code: TaxCode }) {
  const def = TAXES.find(t => t.code === code);
  if (!def) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold" style={{ background: `${def.color}20`, color: def.color }}>{code}</span>
  );
}

/* ─────────────────── Ledger Tab ─────────────────── */

function LedgerTab() {
  const [selected, setSelected] = useState<TaxTransaction | null>(TAX_TRANSACTIONS[0]);
  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-4">
      <div className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="font-display text-lg text-navy-800">Tax Transaction Ledger</div>
          <button className="btn-outline text-xs !py-1.5">Export</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-500">
            <tr>
              <th className="text-left px-3 py-2.5">ID · DATE</th>
              <th className="text-left px-3 py-2.5">DESCRIPTION</th>
              <th className="text-right px-3 py-2.5">GROSS</th>
              <th className="text-right px-3 py-2.5">TAX BEFORE</th>
              <th className="text-right px-3 py-2.5">TAX AFTER</th>
              <th className="text-right px-3 py-2.5">SAVED</th>
              <th className="text-left px-3 py-2.5">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {TAX_TRANSACTIONS.map(t => {
              const proposed = t.proposedTaxes.reduce((s, x) => s + x.amount, 0);
              const final = t.finalTaxes.reduce((s, x) => s + x.amount, 0);
              const st = statusStyle(t.status);
              const active = selected?.id === t.id;
              return (
                <tr key={t.id} onClick={() => setSelected(t)} className={`border-b border-slate-100 cursor-pointer ${active ? "bg-violet-50" : "hover:bg-slate-50"}`}>
                  <td className="px-3 py-3">
                    <div className="font-mono text-[10px] text-slate-500">{t.id}</div>
                    <div className="text-[10px] text-slate-400">{t.date}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-navy-800 font-medium">{t.description}</div>
                    <div className="text-[11px] text-slate-500">{t.party}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{t.grossAmount.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-500">{proposed.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right font-mono text-navy-800 font-bold">{final.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">
                    {t.saved > 0 ? (
                      <span className="text-emerald-700 font-bold font-mono">+{t.saved.toLocaleString()}</span>
                    ) : (
                      <span className="text-slate-400 font-mono">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded ${st.bg} ${st.text} font-bold tracking-widest`}>{st.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-200">
            <tr>
              <td colSpan={5} className="px-3 py-3 text-right text-sm font-bold text-navy-800">TOTAL DUPLICATE TAX PREVENTED</td>
              <td className="px-3 py-3 text-right text-lg font-display text-emerald-700 font-bold">+TZS {TAX_KPIS.totalSaved.toLocaleString()}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card p-5 h-fit lg:sticky lg:top-20">
        {selected ? <TaxDetail tx={selected} /> : (
          <div className="text-center py-10 text-slate-400">Select a transaction</div>
        )}
      </div>
    </div>
  );
}

function TaxDetail({ tx }: { tx: TaxTransaction }) {
  const st = statusStyle(tx.status);
  const rule = ANTI_DT_RULES.find(r => r.id === tx.conflictRule);
  const proposed = tx.proposedTaxes.reduce((s, x) => s + x.amount, 0);
  const final = tx.finalTaxes.reduce((s, x) => s + x.amount, 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded ${st.bg} ${st.text} font-bold tracking-widest`}>{st.label}</span>
        {tx.efdReceipt && <span className="text-[10px] px-2 py-0.5 rounded bg-navy-100 text-navy-700 font-mono">EFD ✓</span>}
      </div>
      <div className="font-mono text-[10px] text-slate-500">{tx.id}</div>
      <div className="font-display text-lg text-navy-800 mt-1">{tx.description}</div>
      <div className="text-xs text-slate-600 mt-1">{tx.party}</div>

      <div className="mt-4">
        <div className="text-[10px] tracking-widest text-slate-500 font-semibold mb-1">GROSS AMOUNT</div>
        <div className="font-display text-2xl text-navy-800">TZS {tx.grossAmount.toLocaleString()}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] tracking-widest text-rose-700 font-semibold mb-1">PROPOSED TAXES</div>
          <div className="space-y-1">
            {tx.proposedTaxes.map((p, i) => (
              <div key={i} className="rounded bg-rose-50 px-2 py-1.5 text-xs">
                <div className="flex justify-between"><TaxCodePill code={p.code} /><span className="font-mono">{p.amount.toLocaleString()}</span></div>
              </div>
            ))}
            <div className="rounded bg-rose-100 px-2 py-1.5 text-xs font-bold flex justify-between">
              <span>Total</span><span className="font-mono">{proposed.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-emerald-700 font-semibold mb-1">FINAL TAXES</div>
          <div className="space-y-1">
            {tx.finalTaxes.length === 0 ? (
              <div className="rounded bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700 text-center font-bold">NO TAX</div>
            ) : tx.finalTaxes.map((p, i) => (
              <div key={i} className="rounded bg-emerald-50 px-2 py-1.5 text-xs">
                <div className="flex justify-between"><TaxCodePill code={p.code} /><span className="font-mono">{p.amount.toLocaleString()}</span></div>
              </div>
            ))}
            <div className="rounded bg-emerald-100 px-2 py-1.5 text-xs font-bold flex justify-between">
              <span>Total</span><span className="font-mono">{final.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {tx.saved > 0 && (
        <div className="mt-4 rounded-lg p-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-center">
          <div className="text-[10px] tracking-widest font-semibold opacity-90">DUPLICATE TAX PREVENTED</div>
          <div className="font-display text-2xl mt-1">+TZS {tx.saved.toLocaleString()}</div>
        </div>
      )}

      {rule && (
        <div className="mt-4 rounded bg-violet-50 border border-violet-200 p-3">
          <div className="text-[10px] tracking-widest text-violet-700 font-semibold mb-1">RULE APPLIED · {rule.id}</div>
          <div className="text-sm font-semibold text-navy-800 mb-1">{rule.name}</div>
          <div className="text-[11px] text-slate-600">{rule.resolution}</div>
        </div>
      )}

      {tx.notes && (
        <div className="mt-3 text-[11px] text-slate-500 italic">📝 {tx.notes}</div>
      )}

      {tx.efdReceipt && (
        <div className="mt-3 rounded bg-slate-50 p-2 text-[11px]">
          <span className="text-slate-500">EFD Receipt:</span>{" "}
          <span className="font-mono text-navy-800">{tx.efdReceipt}</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── DTA Tab ─────────────────── */

function DTATab() {
  return (
    <>
      <div className="card p-5 mb-4 bg-gradient-to-r from-navy-800 to-violet-900 text-white">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-gold-500 flex items-center justify-center"><I.globe size={24} stroke="#0B1D3A" /></div>
          <div>
            <div className="text-[11px] tracking-widest text-gold-400">CROSS-BORDER · DOUBLE TAXATION AGREEMENTS</div>
            <div className="font-display text-2xl mt-1">{DTAS.length} active treaties prevent international double-taxation</div>
            <p className="text-white/80 text-sm mt-2 max-w-2xl">
              When BEYU pays a non-resident supplier or receives cross-border services, the orchestrator
              consults the DTA registry to apply the treaty-reduced WHT rate (typically 5–10% instead of 15%).
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="font-display text-lg text-navy-800">Tanzania Double-Taxation Agreement Registry</div>
          <div className="text-xs text-slate-500">Treaty rates take precedence over default 15% non-resident WHT</div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5">COUNTRY</th>
              <th className="text-left px-4 py-2.5">SIGNED</th>
              <th className="text-left px-4 py-2.5">STATUS</th>
              <th className="text-right px-4 py-2.5">WHT SERVICES</th>
              <th className="text-right px-4 py-2.5">WHT ROYALTIES</th>
              <th className="text-right px-4 py-2.5">WHT DIVIDENDS</th>
              <th className="text-left px-4 py-2.5">APPLIES TO</th>
            </tr>
          </thead>
          <tbody>
            {DTAS.map(d => (
              <tr key={d.country} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{d.flag}</span>
                    <span className="font-medium text-navy-800">{d.country}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-mono">{d.signed}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    d.status === "IN FORCE" ? "bg-emerald-100 text-emerald-700" :
                    d.status === "RATIFIED" ? "bg-gold-100 text-gold-700" : "bg-slate-100 text-slate-600"
                  }`}>{d.status}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{d.whtServices}</td>
                <td className="px-4 py-3 text-right font-mono">{d.whtRoyalties}</td>
                <td className="px-4 py-3 text-right font-mono">{d.whtDividends}</td>
                <td className="px-4 py-3 text-[11px] text-slate-600">{d.applicableTo}</td>
              </tr>
            ))}
            <tr className="bg-rose-50">
              <td className="px-4 py-3 font-semibold text-rose-800">⚠ DEFAULT (no DTA)</td>
              <td className="px-4 py-3 text-xs text-rose-700">—</td>
              <td className="px-4 py-3"><span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-200 text-rose-800 font-bold">FALLBACK</span></td>
              <td className="px-4 py-3 text-right font-mono font-bold text-rose-700">15%</td>
              <td className="px-4 py-3 text-right font-mono text-rose-700">15%</td>
              <td className="px-4 py-3 text-right font-mono text-rose-700">10%</td>
              <td className="px-4 py-3 text-[11px] text-rose-700">Any non-resident without treaty</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card p-5 mt-4">
        <div className="font-display text-lg text-navy-800 mb-3">Recent Cross-Border Transactions (DTA Applied)</div>
        <div className="space-y-2">
          {TAX_TRANSACTIONS.filter(t => t.status === "CREDITED").map(t => (
            <div key={t.id} className="p-3 rounded-lg border border-violet-200 bg-violet-50">
              <div className="flex items-start gap-3">
                <I.globe size={18} stroke="#7c3aed" className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-navy-800">{t.description}</div>
                  <div className="text-[11px] text-slate-600">{t.party}</div>
                  <div className="text-[11px] text-violet-700 mt-1 italic">{t.notes}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500">SAVED</div>
                  <div className="font-display text-lg text-emerald-700">+TZS {(t.saved / 1000).toFixed(0)}k</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─────────────────── EFD Tab ─────────────────── */

function EFDTab() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "EFD Receipts Today", v: TAX_KPIS.efdReceiptsToday.toString(), c: "#0B1D3A" },
          { l: "TRA Sync Status", v: "OK", c: "#059669" },
          { l: "Last Successful Push", v: "12 sec ago", c: "#0B1D3A" },
          { l: "Pending Queue", v: "0", c: "#059669" },
        ].map(k => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">EFD Receipts (last 24 h)</div>
          <LineChart
            data={[
              { m: "00", v: 4 }, { m: "03", v: 2 }, { m: "06", v: 12 }, { m: "09", v: 48 },
              { m: "12", v: 62 }, { m: "15", v: 58 }, { m: "18", v: 42 }, { m: "21", v: 28 },
            ]}
            height={180} color="#0d9488"
          />
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">EFD/VFD Connection</div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2 rounded bg-slate-50">
              <span className="text-slate-500">TRA Endpoint</span>
              <span className="font-mono text-navy-800">https://efd.tra.go.tz/api/v2</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-50">
              <span className="text-slate-500">Device ID</span>
              <span className="font-mono text-navy-800">EFD-MUH-DSM-2024-001</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-50">
              <span className="text-slate-500">Certificate</span>
              <span className="font-mono text-emerald-700">Valid · expires 2027-08-12</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-emerald-50">
              <span className="text-emerald-700">Receipt success rate</span>
              <span className="font-mono text-emerald-700 font-bold">99.97%</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-emerald-50">
              <span className="text-emerald-700">VRN registered</span>
              <span className="font-mono text-emerald-700 font-bold">10-203-4421</span>
            </div>
          </div>
          <button className="btn-primary w-full text-xs !py-2 mt-3">Force EFD Sync</button>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-3">Recent EFD Receipts</div>
        <div className="space-y-1 text-xs font-mono max-h-[320px] overflow-y-auto">
          {TAX_TRANSACTIONS.filter(t => t.efdReceipt).map(t => (
            <div key={t.id} className="grid grid-cols-[120px_80px_1fr_120px_80px] gap-2 py-2 border-b border-slate-100">
              <span className="text-violet-700">{t.efdReceipt}</span>
              <span className="text-slate-500">{t.date}</span>
              <span className="text-navy-800 truncate">{t.description}</span>
              <span className="text-right text-navy-800">TZS {t.grossAmount.toLocaleString()}</span>
              <span className={`text-right font-bold ${t.status === "EXEMPTED" ? "text-emerald-700" : t.status === "CLEARED" ? "text-navy-800" : "text-violet-700"}`}>
                {t.status === "EXEMPTED" ? "EXEMPT" : t.status === "CLEARED" ? "TAXED" : "ADJUSTED"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─────────────────── Report Tab ─────────────────── */

function ReportTab() {
  return (
    <>
      <div className="card p-6 mb-4 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white">
        <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div className="text-[11px] tracking-widest text-white/70 font-semibold">CUMULATIVE SAVINGS · DUPLICATE TAX PREVENTED</div>
            <div className="font-display text-5xl mt-2">TZS {TAX_KPIS.totalSaved.toLocaleString()}</div>
            <p className="text-white/80 text-sm mt-2 max-w-xl">
              Total duplicate tax prevented across {TAX_KPIS.transactions} transactions today.
              This is money that would otherwise have been overpaid to TRA, local councils, or foreign jurisdictions.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center min-w-[260px]">
            <div className="rounded-xl bg-white/15 px-3 py-3">
              <div className="font-display text-2xl text-gold-300">{TAX_KPIS.prevented + TAX_KPIS.exempted}</div>
              <div className="text-[9px] tracking-widest text-white/70">CONFLICTS RESOLVED</div>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-3">
              <div className="font-display text-2xl text-gold-300">{Math.round((TAX_KPIS.totalSaved / TAX_KPIS.totalGross) * 100)}%</div>
              <div className="text-[9px] tracking-widest text-white/70">OF GROSS SAVED</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Savings by Rule</div>
          <div className="space-y-2">
            {ANTI_DT_RULES.map(r => {
              const total = TAX_TRANSACTIONS.filter(t => t.conflictRule === r.id).reduce((s, t) => s + t.saved, 0);
              if (total === 0) return null;
              const pct = (total / TAX_KPIS.totalSaved) * 100;
              return (
                <div key={r.id} className="p-2 rounded border border-slate-100">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-mono text-slate-500">{r.id}</span>
                    <span className="font-mono font-bold text-emerald-700">+TZS {total.toLocaleString()}</span>
                  </div>
                  <div className="text-[11px] text-navy-800 mb-1 truncate">{r.name}</div>
                  <ProgressBar value={pct} color="#059669" />
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Tax Authority Filings (this period)</div>
          <div className="space-y-2 text-sm">
            {[
              { auth: "TRA · VAT-3 (monthly)", due: "20 May 2026", status: "Drafted · auto-filing ready", color: "emerald" },
              { auth: "TRA · WHT certificates", due: "Continuous", status: "Auto-issued · 28 this month", color: "emerald" },
              { auth: "TRA · PAYE return", due: "7th of next month", status: "On schedule", color: "emerald" },
              { auth: "NSSF · monthly", due: "Last day month", status: "On schedule", color: "emerald" },
              { auth: "DSM City Council · Service Levy", due: "Quarterly", status: "Q1 paid · Q2 due Jul", color: "emerald" },
              { auth: "TRA · CIT annual", due: "31 Dec 2026", status: "Provisional drafted", color: "amber" },
            ].map(f => (
              <div key={f.auth} className="p-3 rounded-lg border border-slate-200 flex items-center gap-3">
                <I.shield size={14} stroke={f.color === "emerald" ? "#059669" : "#b45309"} />
                <div className="flex-1">
                  <div className="font-medium text-navy-800 text-sm">{f.auth}</div>
                  <div className="text-[11px] text-slate-500">Due: {f.due}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${f.color === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {f.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-3">Tax Codes Library</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
          {TAXES.map(t => (
            <div key={t.code} className="p-3 rounded-lg border border-slate-200" style={{ borderLeftColor: t.color, borderLeftWidth: 3 }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] font-bold" style={{ color: t.color }}>{t.code}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{t.authority}</span>
              </div>
              <div className="text-sm font-semibold text-navy-800">{t.name}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Rate: <span className="font-mono">{t.rate}</span> · base: {t.base}</div>
              <div className="text-[10px] text-slate-500 mt-1 italic">{t.description}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
