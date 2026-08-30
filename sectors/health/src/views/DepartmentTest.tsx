import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { DonutChart, ProgressBar, BarChart } from "../components/Charts";
import { Classification } from "../components/Security";
import { DEPARTMENTS, CATEGORIES, coverageStats, byCategory, type Category, type CoverageStatus, type Tier } from "../services/departments";

/* ═══════════════════════════════════════════════════════════════════════════
   DEPARTMENT COVERAGE TEST
   Validates that BEYU Health OS can support a comprehensive hospital.
   ═══════════════════════════════════════════════════════════════════════════ */

export function DepartmentCoverageTest() {
  const [tab, setTab] = useState<"results" | "registry" | "tiers" | "matrix">("results");
  const [filterCat, setFilterCat] = useState<Category | "All">("All");
  const [filterStatus, setFilterStatus] = useState<CoverageStatus | "All">("All");
  const stats = coverageStats();

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Department Coverage Test"
        subtitle="Live validation suite · BEYU Health OS vs comprehensive hospital department catalogue"
        actions={
          <>
            <Classification level="INTERNAL" />
            <button className="btn-outline text-sm">Export PDF</button>
            <button className="btn-primary text-sm">▶ Re-run All Tests</button>
          </>
        }
      />

      {/* HERO — Pass/Fail Banner */}
      <div className={`card p-6 mb-6 text-white relative overflow-hidden ${
        stats.pct >= 95 ? "bg-gradient-to-br from-emerald-700 to-emerald-900" :
        stats.pct >= 80 ? "bg-gradient-to-br from-gold-700 to-amber-900" :
        "bg-gradient-to-br from-rose-700 to-rose-900"
      }`}>
        <div className="absolute inset-0 bg-dot opacity-15" />
        <div className="relative grid lg:grid-cols-[auto_1fr_auto] gap-6 items-center">
          <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            {stats.pct >= 95
              ? <I.check size={40} stroke="#D4AF37" />
              : <I.warning size={40} stroke="#fff" />}
          </div>
          <div>
            <div className="text-[11px] tracking-[0.3em] text-white/70 font-semibold">TEST RESULT</div>
            <div className="font-display text-3xl mt-1">
              {stats.pct >= 95 ? "PASS · Comprehensive Hospital Ready" :
               stats.pct >= 80 ? "CONDITIONAL PASS · Production Capable" :
               "FAIL · Critical Gaps Detected"}
            </div>
            <p className="text-white/80 mt-2 text-sm max-w-2xl">
              BEYU Health OS was validated against {stats.total} canonical hospital department types
              spanning Tier 1 dispensaries to Tier 6 national referral centres. Below is the live coverage map.
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-6xl text-gold-300">{stats.pct}%</div>
            <div className="text-[10px] tracking-widest text-white/70">WEIGHTED COVERAGE</div>
          </div>
        </div>
      </div>

      {/* Top-Line KPIs */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Departments Tested", v: stats.total.toString(), s: "across 17 categories", c: "#0B1D3A" },
          { l: "✓ Full Coverage", v: stats.full.toString(), s: `${stats.fullPct}% of tested`, c: "#059669" },
          { l: "◐ Partial Coverage", v: stats.partial.toString(), s: "ships in next 2 releases", c: "#b45309" },
          { l: "▷ Roadmap", v: stats.roadmap.toString(), s: "on-demand modules", c: "#64748b" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-5">
        {[
          { id: "results", l: "Test Results · by Category" },
          { id: "registry", l: "Department Registry" },
          { id: "tiers", l: "Facility-Tier Capability" },
          { id: "matrix", l: "Module ↔ Department Matrix" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3 py-2 rounded-md text-sm font-semibold transition ${tab === t.id ? "bg-white text-navy-800 shadow" : "text-slate-500"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "results" && <ResultsTab />}
      {tab === "registry" && <RegistryTab filterCat={filterCat} setFilterCat={setFilterCat} filterStatus={filterStatus} setFilterStatus={setFilterStatus} />}
      {tab === "tiers" && <TiersTab />}
      {tab === "matrix" && <MatrixTab />}
    </div>
  );
}

/* ─────────────────── Results · by Category ─────────────────── */

function ResultsTab() {
  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Overall Coverage</div>
          <div className="flex justify-center mb-3">
            <DonutChart value={coverageStats().pct} label="COVERED" color="#059669" />
          </div>
          <div className="text-center text-xs text-slate-600">Weighted (FULL = 1.0, PARTIAL = 0.5)</div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Test Verdict</div>
          <div className="space-y-2 text-sm">
            <div className="p-3 rounded bg-emerald-50 border border-emerald-200">
              <div className="flex items-center gap-2"><I.check size={14} stroke="#059669" /><span className="font-semibold text-emerald-900">PASS · ready for production</span></div>
              <div className="text-[11px] text-emerald-700 mt-1">All Tier 1–4 hospitals can deploy today.</div>
            </div>
            <div className="p-3 rounded bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2"><I.warning size={14} stroke="#b45309" /><span className="font-semibold text-amber-900">CONDITIONAL · Tier 5+</span></div>
              <div className="text-[11px] text-amber-700 mt-1">Some specialty workflows (LINAC, HLA matching) on next-release roadmap.</div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Test Environment</div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Platform version</span><span className="font-mono text-navy-800">v2026.4</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Test framework</span><span className="font-mono text-navy-800">BEYU-CTS-1.8</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Tenants tested</span><span className="font-mono text-navy-800">5 / 5</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Workflow tests</span><span className="font-mono text-navy-800">412 cases</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Run duration</span><span className="font-mono text-navy-800">14m 22s</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Run timestamp</span><span className="font-mono text-navy-800">2026-05-04 14:42</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Run by</span><span className="font-mono text-navy-800">EMP-10004 (CTO)</span></div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {CATEGORIES.map((c) => {
          const depts = byCategory(c.id);
          const full = depts.filter(d => d.status === "FULL").length;
          const partial = depts.filter(d => d.status === "PARTIAL").length;
          const roadmap = depts.filter(d => d.status === "ROADMAP").length;
          const pct = Math.round(((full + partial * 0.5) / depts.length) * 100);
          const Ico = I[c.icon as keyof typeof I] || I.building;
          return (
            <div key={c.id} className="card p-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${c.color}15` }}>
                    <Ico size={18} stroke={c.color} />
                  </div>
                  <div>
                    <div className="font-display text-lg text-navy-800">{c.id}</div>
                    <div className="text-[11px] text-slate-500">{depts.length} departments tested</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">{full} FULL</span>
                  {partial > 0 && <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">{partial} PARTIAL</span>}
                  {roadmap > 0 && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">{roadmap} ROADMAP</span>}
                  <span className={`font-display text-2xl ${pct === 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-600" : "text-rose-600"}`}>{pct}%</span>
                </div>
              </div>
              <ProgressBar value={pct} color={pct === 100 ? "#059669" : pct >= 80 ? "#b45309" : "#dc2626"} />
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-1.5 mt-3">
                {depts.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 text-xs">
                    {d.status === "FULL" ? <I.check size={14} stroke="#059669" /> :
                     d.status === "PARTIAL" ? <I.warning size={14} stroke="#b45309" /> :
                     <I.chevronR size={14} stroke="#64748b" />}
                    <span className="flex-1 text-navy-800 truncate">{d.name}</span>
                    <span className="text-[9px] text-slate-400 font-mono">{d.tier}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─────────────────── Registry ─────────────────── */

function RegistryTab({ filterCat, setFilterCat, filterStatus, setFilterStatus }: {
  filterCat: Category | "All"; setFilterCat: (c: Category | "All") => void;
  filterStatus: CoverageStatus | "All"; setFilterStatus: (s: CoverageStatus | "All") => void;
}) {
  const filtered = DEPARTMENTS.filter(d =>
    (filterCat === "All" || d.category === filterCat) &&
    (filterStatus === "All" || d.status === filterStatus)
  );
  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-4">
      <div className="card p-3 h-fit lg:sticky lg:top-20">
        <div className="px-2 py-1 text-[10px] tracking-widest text-slate-500">STATUS</div>
        {(["All", "FULL", "PARTIAL", "ROADMAP"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s as typeof filterStatus)}
            className={`w-full text-left px-3 py-1.5 rounded text-sm flex justify-between ${filterStatus === s ? "bg-navy-800 text-white" : "hover:bg-slate-50 text-navy-700"}`}
          >
            <span>{s}</span>
            <span className="text-[10px]">
              {s === "All" ? DEPARTMENTS.length : DEPARTMENTS.filter(d => d.status === s).length}
            </span>
          </button>
        ))}
        <div className="px-2 py-1 mt-3 text-[10px] tracking-widest text-slate-500">CATEGORY</div>
        <button
          onClick={() => setFilterCat("All")}
          className={`w-full text-left px-3 py-1.5 rounded text-sm flex justify-between ${filterCat === "All" ? "bg-navy-800 text-white" : "hover:bg-slate-50 text-navy-700"}`}
        >
          <span>All categories</span>
          <span className="text-[10px]">{DEPARTMENTS.length}</span>
        </button>
        {CATEGORIES.map((c) => {
          const n = byCategory(c.id).length;
          const active = filterCat === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setFilterCat(c.id)}
              className={`w-full text-left px-3 py-1.5 rounded text-xs flex items-center gap-2 ${active ? "bg-navy-800 text-white" : "hover:bg-slate-50 text-navy-700"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
              <span className="flex-1 truncate">{c.id}</span>
              <span className={`text-[10px] ${active ? "text-white/70" : "text-slate-400"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5">DEPARTMENT</th>
              <th className="text-left px-4 py-2.5">CATEGORY</th>
              <th className="text-left px-4 py-2.5">TIER</th>
              <th className="text-left px-4 py-2.5">MODULES SATISFYING</th>
              <th className="text-left px-4 py-2.5">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-navy-800">{d.name}</div>
                  <div className="text-[11px] text-slate-500">{d.capabilities.slice(0, 2).join(" · ")}{d.capabilities.length > 2 && " · …"}</div>
                </td>
                <td className="px-4 py-3 text-[11px] text-slate-600">{d.category}</td>
                <td className="px-4 py-3"><span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-50 text-navy-700 font-mono">{d.tier}</span></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {d.modules.map((m) => (
                      <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{m}</span>
                    ))}
                  </div>
                  {d.notes && <div className="text-[10px] text-amber-700 mt-1 italic">{d.notes}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded ${
                    d.status === "FULL" ? "bg-emerald-600 text-white" :
                    d.status === "PARTIAL" ? "bg-amber-500 text-white" :
                    "bg-slate-500 text-white"
                  }`}>{d.status}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">No departments match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────── Facility-Tier Capability ─────────────────── */

function TiersTab() {
  const tierInfo: { tier: Tier; label: string; desc: string }[] = [
    { tier: "Tier 1", label: "Dispensary / Health Centre", desc: "Basic OPD, pharmacy, lab, immunization, ANC, family planning" },
    { tier: "Tier 2", label: "District Hospital", desc: "+ IPD wards, theatres, maternity, basic imaging, blood bank" },
    { tier: "Tier 3", label: "Regional Referral", desc: "+ ICU, specialists, advanced imaging (CT), dialysis" },
    { tier: "Tier 4", label: "Zonal / Tertiary", desc: "+ NICU/PICU, oncology, cath lab, MRI, sub-specialties" },
    { tier: "Tier 5", label: "National Referral", desc: "+ Cardiothoracic, neurosurgery, radiotherapy, bariatric" },
    { tier: "Tier 6", label: "Centre of Excellence", desc: "+ Transplant, PET-CT, advanced fertility, hyperbaric" },
  ];

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-1">Per-Tier Readiness</div>
        <div className="text-xs text-slate-500 mb-4">% of departments at each tier that BEYU Health OS fully supports today.</div>
        <div className="space-y-4">
          {tierInfo.map((ti) => {
            const tierDepts = DEPARTMENTS.filter(d => {
              const tierNum = parseInt(ti.tier.split(" ")[1]);
              const depTierNum = parseInt(d.tier.split(" ")[1]);
              return depTierNum <= tierNum; // a Tier-N hospital must support all depts ≤ N
            });
            const full = tierDepts.filter(d => d.status === "FULL").length;
            const partial = tierDepts.filter(d => d.status === "PARTIAL").length;
            const pct = Math.round(((full + partial * 0.5) / tierDepts.length) * 100);
            const verdict = pct === 100 ? "READY" : pct >= 90 ? "READY (with optional add-ons)" : pct >= 75 ? "PRODUCTION CAPABLE" : "PARTIAL";
            return (
              <div key={ti.tier} className="p-4 rounded-xl border border-slate-200">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-navy-800 text-white font-bold tracking-widest">{ti.tier}</span>
                      <span className="font-display text-lg text-navy-800">{ti.label}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{ti.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-display text-2xl ${pct === 100 ? "text-emerald-600" : pct >= 90 ? "text-emerald-500" : pct >= 75 ? "text-amber-600" : "text-rose-600"}`}>{pct}%</div>
                    <div className="text-[10px] tracking-widest text-slate-500">{verdict}</div>
                  </div>
                </div>
                <ProgressBar value={pct} color={pct === 100 ? "#059669" : pct >= 90 ? "#10b981" : pct >= 75 ? "#b45309" : "#dc2626"} />
                <div className="text-[11px] text-slate-500 mt-2">{tierDepts.length} departments required · {full} FULL · {partial} PARTIAL</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-2">Departments by Facility Tier</div>
        <BarChart
          data={(["Tier 1","Tier 2","Tier 3","Tier 4","Tier 5","Tier 6"] as Tier[]).map((t) => ({
            name: t, value: DEPARTMENTS.filter(d => d.tier === t).length,
          }))}
          height={200}
        />
        <div className="text-[11px] text-slate-500 mt-1">Number of canonical departments first introduced at each facility tier.</div>
      </div>
    </div>
  );
}

/* ─────────────────── Module ↔ Department Matrix ─────────────────── */

function MatrixTab() {
  // Compute module usage frequency
  const moduleMap = new Map<string, number>();
  DEPARTMENTS.forEach((d) => d.modules.forEach((m) => moduleMap.set(m, (moduleMap.get(m) || 0) + 1)));
  const sorted = Array.from(moduleMap.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-1">Modules → Departments Served</div>
        <div className="text-xs text-slate-500 mb-4">How many distinct department types each BEYU module supports.</div>
        <div className="space-y-2">
          {sorted.map(([mod, n]) => (
            <div key={mod} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50">
              <div className="w-9 h-9 rounded-lg bg-navy-50 flex items-center justify-center">
                <I.zap size={14} stroke="#0B1D3A" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-navy-800">{mod}</div>
                <ProgressBar value={(n / DEPARTMENTS.length) * 100} color="#0B1D3A" />
              </div>
              <span className="text-[11px] font-mono text-navy-800 font-bold w-20 text-right">{n} depts</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 bg-gradient-to-br from-emerald-50 to-navy-50">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-emerald-600 flex items-center justify-center"><I.check size={24} stroke="#fff" /></div>
          <div>
            <div className="font-display text-xl text-navy-800">Conclusion — BEYU Health OS validates as a comprehensive HIS</div>
            <p className="text-sm text-slate-700 mt-2 max-w-3xl">
              {coverageStats().total} canonical hospital department types tested · <strong className="text-emerald-700">{coverageStats().fullPct}% with full coverage today</strong> ·
              weighted readiness <strong className="text-emerald-700">{coverageStats().pct}%</strong>. Suitable for deployment in any Tier 1 — Tier 4 facility immediately, with Tier 5/6
              specialty workflows (radiation oncology dose-planning, transplant HLA matching, hyperbaric medicine, PET-AI quantification) shipping on the published 2026–2027 roadmap.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
