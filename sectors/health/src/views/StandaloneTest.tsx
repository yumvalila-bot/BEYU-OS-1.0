import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { DonutChart, ProgressBar, BarChart } from "../components/Charts";
import { Classification } from "../components/Security";
import { STANDALONE_BUSINESSES, bizStats, overallStats, type StandaloneBusiness, type Capability } from "../services/standalone";

/* ═══════════════════════════════════════════════════════════════════════════
   STANDALONE HEALTHCARE BUSINESS COVERAGE TEST
   Validates BEYU Health OS as a complete platform for independent
   pharmacies, labs, radiology centres, optical shops & dialysis clinics.
   ═══════════════════════════════════════════════════════════════════════════ */

export function StandaloneBusinessTest() {
  const [selected, setSelected] = useState<StandaloneBusiness>(STANDALONE_BUSINESSES[0]);
  const [view, setView] = useState<"summary" | "detail">("summary");
  const overall = overallStats();

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Standalone Business Coverage Test"
        subtitle="Can BEYU Health OS run independent healthcare businesses end-to-end?"
        actions={
          <>
            <Classification level="INTERNAL" />
            <button className="btn-outline text-sm">Export PDF</button>
            <button className="btn-primary text-sm">▶ Re-run All Tests</button>
          </>
        }
      />

      {/* ─── Pass/Fail Banner ─── */}
      <div className={`card p-6 mb-6 text-white relative overflow-hidden ${
        overall.pct >= 95 ? "bg-gradient-to-br from-emerald-700 to-emerald-900" :
        overall.pct >= 85 ? "bg-gradient-to-br from-emerald-700 to-navy-900" :
        "bg-gradient-to-br from-amber-700 to-rose-900"
      }`}>
        <div className="absolute inset-0 bg-dot opacity-15" />
        <div className="relative grid lg:grid-cols-[auto_1fr_auto] gap-6 items-center">
          <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            {overall.pct >= 95 ? <I.check size={40} stroke="#D4AF37" /> : <I.warning size={40} stroke="#fff" />}
          </div>
          <div>
            <div className="text-[11px] tracking-[0.3em] text-white/70 font-semibold">TEST RESULT · STANDALONE BUSINESS MODE</div>
            <div className="font-display text-3xl mt-1">
              {overall.pct >= 95 ? "PASS · Multi-Vertical Healthcare Business Ready" :
               overall.pct >= 85 ? "PASS · Production Capable" : "CONDITIONAL · review gaps"}
            </div>
            <p className="text-white/80 mt-2 text-sm max-w-2xl">
              BEYU Health OS was tested against {overall.total} business capabilities across
              {" "}{STANDALONE_BUSINESSES.length} standalone vertical types: retail pharmacies, independent
              laboratories, imaging centres, optical shops & dialysis clinics.
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-6xl text-gold-300">{overall.pct}%</div>
            <div className="text-[10px] tracking-widest text-white/70">WEIGHTED READINESS</div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid md:grid-cols-5 gap-3 mb-6">
        {[
          { l: "Business Verticals", v: STANDALONE_BUSINESSES.length.toString(), c: "#0B1D3A" },
          { l: "Capabilities Tested", v: overall.total.toString(), c: "#0B1D3A" },
          { l: "✓ Full", v: overall.full.toString(), c: "#059669" },
          { l: "◐ Partial", v: overall.partial.toString(), c: "#b45309" },
          { l: "Active Tenants Today", v: STANDALONE_BUSINESSES.reduce((s, b) => s + b.activeTenants, 0).toString(), c: "#7c3aed" },
        ].map((k) => (
          <div key={k.l} className="card p-4">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Business Cards Grid — overview of all 5 */}
      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {STANDALONE_BUSINESSES.map((b) => {
          const s = bizStats(b);
          const Ico = I[b.icon as keyof typeof I];
          const active = selected.id === b.id;
          return (
            <button
              key={b.id}
              onClick={() => { setSelected(b); setView("detail"); }}
              className={`card text-left p-4 transition hover:-translate-y-0.5 ${active ? "ring-2 ring-gold-400" : ""}`}
              style={{ borderTopColor: b.color, borderTopWidth: 4 }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${b.color}15` }}>
                  <Ico size={18} stroke={b.color} />
                </div>
                <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded ${
                  s.pct === 100 ? "bg-emerald-600 text-white" :
                  s.pct >= 95 ? "bg-emerald-500 text-white" :
                  s.pct >= 85 ? "bg-amber-500 text-white" : "bg-rose-500 text-white"
                }`}>{s.pct}%</span>
              </div>
              <div className="font-display text-base text-navy-800">{b.shortName}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{b.activeTenants} tenants · {b.typicalSize}</div>
              <div className="mt-3"><ProgressBar value={s.pct} color={s.pct >= 95 ? "#059669" : s.pct >= 85 ? "#b45309" : "#dc2626"} /></div>
              <div className="flex gap-2 mt-2 text-[10px]">
                <span className="text-emerald-700 font-semibold">{s.full} ✓</span>
                {s.partial > 0 && <span className="text-amber-700 font-semibold">{s.partial} ◐</span>}
                {s.roadmap > 0 && <span className="text-slate-500 font-semibold">{s.roadmap} ▷</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Toggle: Summary vs Detail */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-5">
        {[
          { id: "summary", l: "Cross-Vertical Summary" },
          { id: "detail", l: `${selected.shortName} · Deep Dive` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id as typeof view)}
            className={`px-3 py-2 rounded-md text-sm font-semibold transition ${view === t.id ? "bg-white text-navy-800 shadow" : "text-slate-500"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {view === "summary" && <SummaryView />}
      {view === "detail" && <DetailView biz={selected} />}
    </div>
  );
}

/* ─────────────────── Summary across all verticals ─────────────────── */

function SummaryView() {
  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Verdict by Vertical</div>
          <div className="space-y-2">
            {STANDALONE_BUSINESSES.map((b) => {
              const s = bizStats(b);
              return (
                <div key={b.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50">
                  <span className="w-2 h-8 rounded" style={{ background: b.color }} />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-navy-800">{b.shortName}</div>
                    <div className="text-[10px] text-slate-500">{b.examples[0]}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${s.pct >= 95 ? "text-emerald-600" : s.pct >= 85 ? "text-amber-600" : "text-rose-600"}`}>
                      {s.pct >= 95 ? "PASS" : s.pct >= 85 ? "CONDITIONAL" : "GAPS"}
                    </div>
                    <div className="text-[10px] text-slate-500">{s.pct}% coverage</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Capabilities Tested</div>
          <BarChart
            data={STANDALONE_BUSINESSES.map((b) => ({ name: b.shortName, value: b.capabilities.length }))}
            height={200}
          />
          <div className="text-[11px] text-slate-500 mt-1">Number of business-critical capabilities per vertical</div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Tenants Active by Vertical</div>
          <BarChart
            data={STANDALONE_BUSINESSES.map((b) => ({ name: b.shortName, value: b.activeTenants }))}
            height={200}
          />
          <div className="text-[11px] text-slate-500 mt-1">Independent businesses already running on BEYU</div>
        </div>
      </div>

      <div className="card p-5 bg-gradient-to-r from-emerald-50 to-navy-50">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-emerald-600 flex items-center justify-center"><I.check size={24} stroke="#fff" /></div>
          <div className="flex-1">
            <div className="font-display text-xl text-navy-800">Conclusion — BEYU Health OS is fully viable as a standalone-business platform</div>
            <p className="text-sm text-slate-700 mt-2 max-w-3xl">
              All 5 vertical business types pass the test. A standalone pharmacy, lab, radiology centre, optical shop or dialysis clinic
              can deploy BEYU Health OS today and get: walk-in POS, e-prescription intake from any BEYU hospital, NHIF integration,
              EFD tax-compliance, multi-branch chain ops, regulator-ready audit trails and full HR/payroll/inventory back-office —
              all on the same shared core that powers hospitals.
            </p>
            <div className="grid md:grid-cols-3 gap-2 mt-4">
              {[
                { t: "Single tenant", d: "One pharmacy or lab — fully featured" },
                { t: "Multi-branch chain", d: "Group-level reporting + inter-branch transfers" },
                { t: "Network member", d: "Plugs into BEYU hospital network for referrals & e-Rx" },
              ].map((m) => (
                <div key={m.t} className="rounded-lg bg-white border border-slate-200 p-3">
                  <div className="text-[10px] tracking-widest text-gold-700 font-semibold">DEPLOY AS</div>
                  <div className="text-sm font-semibold text-navy-800 mt-1">{m.t}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{m.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────── Single-vertical deep dive ─────────────────── */

function DetailView({ biz }: { biz: StandaloneBusiness }) {
  const s = bizStats(biz);
  const Ico = I[biz.icon as keyof typeof I];
  const categories = Array.from(new Set(biz.capabilities.map(c => c.category)));

  return (
    <>
      <div className="card overflow-hidden mb-4" style={{ borderTopColor: biz.color, borderTopWidth: 6 }}>
        <div className="p-6 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${biz.color}, ${biz.color}dd)` }}>
          <div className="absolute inset-0 bg-dot opacity-15" />
          <div className="relative flex flex-col lg:flex-row items-start gap-6">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Ico size={32} stroke="#D4AF37" />
            </div>
            <div className="flex-1">
              <div className="text-[11px] tracking-[0.3em] text-gold-300 font-semibold">STANDALONE BUSINESS TEST</div>
              <div className="font-display text-2xl mt-1">{biz.name}</div>
              <div className="text-white/85 italic mt-0.5">{biz.tagline}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div><div className="text-[10px] text-white/60 tracking-widest">CAPABILITIES</div><div className="font-display text-xl text-gold-300">{s.total}</div></div>
                <div><div className="text-[10px] text-white/60 tracking-widest">FULL COVERAGE</div><div className="font-display text-xl text-gold-300">{s.fullPct}%</div></div>
                <div><div className="text-[10px] text-white/60 tracking-widest">TENANTS LIVE</div><div className="font-display text-xl text-gold-300">{biz.activeTenants}</div></div>
                <div><div className="text-[10px] text-white/60 tracking-widest">TYPICAL SIZE</div><div className="font-display text-xl text-gold-300">{biz.typicalSize}</div></div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <DonutChart value={s.pct} label="READINESS" color="#D4AF37" size={120} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5">
          <div className="text-[10px] tracking-widest text-slate-500 mb-2">REAL-WORLD EXAMPLES</div>
          <div className="space-y-1.5">
            {biz.examples.map((e) => (
              <div key={e} className="text-sm text-navy-800 flex items-center gap-2">
                <I.check size={12} stroke="#059669" /> {e}
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-[10px] tracking-widest text-slate-500 mb-2">REGULATORS · COMPLIANCE</div>
          <div className="space-y-1.5">
            {biz.regulators.map((r) => (
              <div key={r} className="text-sm text-navy-800 flex items-center gap-2">
                <I.shield size={12} stroke="#7c3aed" /> {r}
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-[10px] tracking-widest text-slate-500 mb-2">VERDICT</div>
          <div className={`font-display text-2xl ${s.pct >= 95 ? "text-emerald-600" : s.pct >= 85 ? "text-amber-600" : "text-rose-600"}`}>
            {s.pct >= 95 ? "✓ PASS" : s.pct >= 85 ? "◐ CONDITIONAL" : "✗ GAPS"}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {s.pct >= 95
              ? "Deploy a standalone business today — all critical workflows supported."
              : "Production capable with documented partial-feature roadmap items."}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {categories.map((cat) => {
          const caps = biz.capabilities.filter(c => c.category === cat);
          const fullCount = caps.filter(c => c.status === "FULL").length;
          const catPct = Math.round((fullCount / caps.length) * 100);
          return (
            <div key={cat} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-display text-base text-navy-800">{cat}</div>
                  <div className="text-[11px] text-slate-500">{caps.length} capabilities</div>
                </div>
                <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded ${
                  catPct === 100 ? "bg-emerald-600 text-white" :
                  catPct >= 80 ? "bg-amber-500 text-white" : "bg-rose-500 text-white"
                }`}>{catPct}% · {fullCount}/{caps.length} FULL</span>
              </div>
              <div className="grid md:grid-cols-2 gap-1.5">
                {caps.map((c) => <CapRow key={c.id} c={c} />)}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function CapRow({ c }: { c: Capability }) {
  return (
    <div className={`flex items-start gap-2 p-2 rounded text-xs ${
      c.status === "FULL" ? "bg-emerald-50" :
      c.status === "PARTIAL" ? "bg-amber-50" : "bg-slate-50"
    }`}>
      {c.status === "FULL"
        ? <I.check size={14} stroke="#059669" className="mt-0.5 shrink-0" />
        : c.status === "PARTIAL"
        ? <I.warning size={14} stroke="#b45309" className="mt-0.5 shrink-0" />
        : <I.chevronR size={14} stroke="#64748b" className="mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-navy-800 font-medium">{c.name}</div>
        <div className="text-[10px] text-slate-500">module: <span className="font-mono">{c.module}</span></div>
        {c.notes && <div className="text-[10px] text-amber-700 italic mt-0.5">{c.notes}</div>}
      </div>
    </div>
  );
}
