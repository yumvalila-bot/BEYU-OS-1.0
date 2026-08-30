import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { DonutChart, BarChart, ProgressBar, LineChart } from "../components/Charts";
import { Classification } from "../components/Security";
import {
  NABH_HOSPITAL, NABH_SPECIALTY, NABH_KPIS,
  type NabhChapter, type ObjectiveElement, type NabhStatus,
} from "../services/nabh";

/* ═══════════════════════════════════════════════════════════════════════════
   NABH COMPLIANCE DASHBOARD
   ═══════════════════════════════════════════════════════════════════════════ */

export function NABHScreen() {
  const [tab, setTab] = useState<"overview" | "hospital" | "indicators" | "specialty" | "assessment">("overview");

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="NABH Compliance"
        subtitle="National Accreditation Board for Hospitals & Healthcare Providers · 5th Edition · all standards mapped"
        actions={
          <>
            <Classification level="CONFIDENTIAL" />
            <button className="btn-outline text-sm">Self-Assessment Report</button>
            <button className="btn-primary text-sm">Schedule Pre-Assessment</button>
          </>
        }
      />

      {/* HERO */}
      <div className="card p-6 mb-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-800 via-navy-900 to-violet-900" />
        <div className="absolute inset-0 bg-dot opacity-15" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <div className="text-[11px] tracking-[0.3em] text-gold-400 font-semibold flex items-center gap-2">
              <I.star size={14} stroke="#D4AF37" /> NABH HOSPITAL STANDARDS · 5TH EDITION
            </div>
            <h2 className="font-display text-3xl mt-2">
              <span className="text-gold-400">{NABH_KPIS.overallPct}% Met</span> · {NABH_KPIS.corePct}% Core Elements Met
            </h2>
            <p className="text-white/80 mt-2 text-sm max-w-2xl">
              {NABH_KPIS.chapters} chapters · {NABH_KPIS.standards} standards · {NABH_KPIS.objectiveElements} objective elements
              mapped to BEYU modules. {NABH_KPIS.specialtyMet} of {NABH_KPIS.specialtyCount} specialty standards also met.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">Hospital · 5th Ed</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">SHCO ready</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">Lab · ISO 15189</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">Imaging · Blood Bank · Dental · Dialysis</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center min-w-[280px]">
            <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-3">
              <div className="font-display text-2xl text-emerald-300">{NABH_KPIS.met}</div>
              <div className="text-[9px] tracking-widest text-white/70 mt-0.5">OE MET</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-3">
              <div className="font-display text-2xl text-amber-300">{NABH_KPIS.partial}</div>
              <div className="text-[9px] tracking-widest text-white/70 mt-0.5">PARTIAL</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-3">
              <div className="font-display text-2xl text-rose-300">{NABH_KPIS.notMet}</div>
              <div className="text-[9px] tracking-widest text-white/70 mt-0.5">NOT MET</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-3">
              <div className="font-display text-2xl text-violet-300">{NABH_KPIS.coreMet}/{NABH_KPIS.coreElements}</div>
              <div className="text-[9px] tracking-widest text-white/70 mt-0.5">CORE OE</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-5">
        {[
          { id: "overview", l: "Posture Overview" },
          { id: "hospital", l: "10 Hospital Chapters" },
          { id: "indicators", l: "Quality Indicators" },
          { id: "specialty", l: "Specialty Standards" },
          { id: "assessment", l: "Self-Assessment Wizard" },
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

      {tab === "overview" && <OverviewTab />}
      {tab === "hospital" && <HospitalTab />}
      {tab === "indicators" && <IndicatorsTab />}
      {tab === "specialty" && <SpecialtyTab />}
      {tab === "assessment" && <AssessmentTab />}
    </div>
  );
}

/* ─────────────────── Overview ─────────────────── */

function OverviewTab() {
  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { l: "NABH Chapters", v: NABH_KPIS.chapters.toString(), s: "Hospital 5th Ed", c: "#0B1D3A" },
          { l: "Standards", v: NABH_KPIS.standards.toString(), s: "across all chapters", c: "#1E3A8A" },
          { l: "Objective Elements", v: NABH_KPIS.objectiveElements.toString(), s: "mapped to BEYU", c: "#7c3aed" },
          { l: "Overall Compliance", v: `${NABH_KPIS.overallPct}%`, s: "weighted", c: "#059669" },
        ].map(k => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Overall Compliance</div>
          <div className="flex justify-center mb-3">
            <DonutChart value={NABH_KPIS.overallPct} label="MET" color="#059669" />
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 rounded bg-emerald-500" />
              <span className="flex-1 text-slate-700">MET</span>
              <span className="font-mono font-bold text-navy-800">{NABH_KPIS.met}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 rounded bg-amber-500" />
              <span className="flex-1 text-slate-700">PARTIALLY MET</span>
              <span className="font-mono font-bold text-navy-800">{NABH_KPIS.partial}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 rounded bg-rose-500" />
              <span className="flex-1 text-slate-700">NOT MET</span>
              <span className="font-mono font-bold text-navy-800">{NABH_KPIS.notMet}</span>
            </div>
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-2">Compliance by Chapter</div>
          <BarChart
            data={NABH_HOSPITAL.map(c => {
              const all = c.standards.flatMap(s => s.elements);
              const met = all.filter(e => e.status === "MET").length;
              return { name: c.code, value: Math.round((met / all.length) * 100) };
            })}
            height={240}
          />
        </div>
      </div>

      <div className="card p-5 mb-6 bg-gradient-to-r from-emerald-50 to-violet-50">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-emerald-600 flex items-center justify-center"><I.check size={24} stroke="#fff" /></div>
          <div className="flex-1">
            <div className="font-display text-xl text-navy-800">Accreditation Pathway</div>
            <p className="text-sm text-slate-700 mt-1">
              BEYU Health OS satisfies NABH 5th Edition standards out-of-the-box. The recommended pathway to formal accreditation:
            </p>
            <div className="grid md:grid-cols-4 gap-2 mt-4">
              {[
                { n: "1", t: "Self-Assessment", d: "Use built-in NABH wizard", done: true },
                { n: "2", t: "Gap Analysis", d: "Address partial OEs (CAPA)", done: true },
                { n: "3", t: "Pre-Assessment", d: "External NABH consultant", done: false },
                { n: "4", t: "Final Assessment", d: "NABH on-site audit", done: false },
              ].map(s => (
                <div key={s.n} className={`rounded-lg border p-3 ${s.done ? "bg-emerald-50 border-emerald-300" : "bg-white border-slate-200"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${s.done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                      {s.done ? "✓" : s.n}
                    </div>
                    <div className="font-semibold text-navy-800 text-sm">{s.t}</div>
                  </div>
                  <div className="text-[11px] text-slate-500">{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
        {NABH_HOSPITAL.map(c => {
          const all = c.standards.flatMap(s => s.elements);
          const met = all.filter(e => e.status === "MET").length;
          const pct = Math.round((met / all.length) * 100);
          const Ico = I[c.icon as keyof typeof I];
          return (
            <div key={c.code} className="card p-4" style={{ borderTopColor: c.color, borderTopWidth: 4 }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] tracking-widest font-bold text-slate-500">{c.code}</span>
                <Ico size={16} stroke={c.color} />
              </div>
              <div className="font-display text-sm text-navy-800 leading-tight">{c.fullTitle}</div>
              <div className="text-[10px] text-slate-500 mt-1">{c.standards.length} standards · {all.length} OEs</div>
              <div className="mt-2"><ProgressBar value={pct} color={pct === 100 ? "#059669" : pct >= 80 ? "#b45309" : "#dc2626"} /></div>
              <div className="text-[10px] font-mono text-navy-800 mt-1">{pct}% met</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─────────────────── Hospital Chapters Tab ─────────────────── */

function HospitalTab() {
  const [active, setActive] = useState<NabhChapter>(NABH_HOSPITAL[0]);
  const Ico = I[active.icon as keyof typeof I];
  const allOE = active.standards.flatMap(s => s.elements);
  const met = allOE.filter(e => e.status === "MET").length;
  const pct = Math.round((met / allOE.length) * 100);

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-4">
      <div className="card p-2 h-fit lg:sticky lg:top-20">
        <div className="px-2 py-2 text-[10px] tracking-widest text-slate-500 font-semibold">10 NABH CHAPTERS</div>
        {NABH_HOSPITAL.map(c => {
          const all = c.standards.flatMap(s => s.elements);
          const m = all.filter(e => e.status === "MET").length;
          const p = Math.round((m / all.length) * 100);
          const isActive = active.code === c.code;
          const ChIco = I[c.icon as keyof typeof I];
          return (
            <button
              key={c.code}
              onClick={() => setActive(c)}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 ${isActive ? "bg-navy-800 text-white" : "hover:bg-slate-50"}`}
            >
              <span className="font-mono text-[10px] font-bold w-10" style={isActive ? {} : { color: c.color }}>{c.code}</span>
              <ChIco size={13} stroke={isActive ? "#D4AF37" : c.color} />
              <span className={`flex-1 text-xs ${isActive ? "text-white" : "text-navy-800"} truncate`}>{c.title}</span>
              <span className={`text-[10px] font-mono ${isActive ? "text-gold-300" : p === 100 ? "text-emerald-600" : "text-amber-600"}`}>{p}%</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        <div className="card p-6" style={{ borderTopColor: active.color, borderTopWidth: 6 }}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${active.color}15` }}>
              <Ico size={24} stroke={active.color} />
            </div>
            <div className="flex-1">
              <div className="text-[10px] tracking-[0.3em] font-bold" style={{ color: active.color }}>CHAPTER · {active.code}</div>
              <div className="font-display text-2xl text-navy-800 mt-1">{active.fullTitle}</div>
              <p className="text-sm text-slate-600 mt-1">{active.description}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-3xl" style={{ color: pct === 100 ? "#059669" : "#b45309" }}>{pct}%</div>
              <div className="text-[10px] tracking-widest text-slate-500">MET</div>
              <div className="text-[10px] text-slate-500 mt-1">{active.standards.length} standards · {allOE.length} OE</div>
            </div>
          </div>
        </div>

        {active.standards.map(std => (
          <div key={std.code} className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3" style={{ background: `${active.color}08` }}>
              <span className="font-mono text-xs font-bold" style={{ color: active.color }}>{std.code}</span>
              <div className="font-display text-base text-navy-800 flex-1">{std.title}</div>
              <span className="text-[10px] text-slate-500">{std.elements.length} OEs</span>
            </div>
            <div className="divide-y divide-slate-100">
              {std.elements.map(oe => <OERow key={oe.code} oe={oe} accent={active.color} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OERow({ oe, accent }: { oe: ObjectiveElement; accent: string }) {
  const statusStyle = (s: NabhStatus) =>
    s === "MET" ? { bg: "bg-emerald-100", text: "text-emerald-700", label: "MET" } :
    s === "PARTIALLY MET" ? { bg: "bg-amber-100", text: "text-amber-700", label: "PARTIAL" } :
    s === "NOT MET" ? { bg: "bg-rose-100", text: "text-rose-700", label: "NOT MET" } :
    { bg: "bg-slate-100", text: "text-slate-600", label: "N/A" };
  const typeStyle = (t: string) =>
    t === "Core" ? { bg: "bg-rose-600", text: "text-white" } :
    t === "Commitment" ? { bg: "bg-amber-500", text: "text-white" } :
    t === "Achievement" ? { bg: "bg-emerald-500", text: "text-white" } :
    { bg: "bg-violet-600", text: "text-white" };

  const st = statusStyle(oe.status);
  const tp = typeStyle(oe.type);

  return (
    <div className="p-4 hover:bg-slate-50">
      <div className="flex items-start gap-3">
        <div className="font-mono text-[10px] text-slate-500 w-16 shrink-0 mt-0.5">{oe.code}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-widest ${tp.bg} ${tp.text}`}>{oe.type.toUpperCase()}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-widest ${st.bg} ${st.text}`}>{st.label}</span>
          </div>
          <div className="text-sm font-medium text-navy-800">{oe.text}</div>
          <div className="rounded bg-slate-50 p-2 mt-2 text-xs">
            <div className="text-[10px] tracking-widest text-gold-700 font-semibold mb-0.5">BEYU IMPLEMENTATION</div>
            <div className="text-slate-700 leading-relaxed">{oe.beyuImplementation}</div>
            {oe.modules && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {oe.modules.map(m => (
                  <span key={m} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${accent}15`, color: accent }}>{m}</span>
                ))}
              </div>
            )}
            {oe.evidence && (
              <div className="mt-1.5 text-[10px] text-slate-500">📎 Evidence: <span className="font-mono">{oe.evidence}</span></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Quality Indicators Tab ─────────────────── */

function IndicatorsTab() {
  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Hand Hygiene", v: `${NABH_KPIS.handHygieneCompliance}%`, target: "≥ 80%", ok: true },
          { l: "Surgical Safety Checklist", v: `${NABH_KPIS.surgicalSafetyChecklist}%`, target: "100%", ok: true },
          { l: "Med Reconciliation", v: `${NABH_KPIS.medReconciliation}%`, target: "≥ 95%", ok: true },
          { l: "Patient Satisfaction", v: `${NABH_KPIS.patientSatisfaction}%`, target: "≥ 85%", ok: true },
        ].map(k => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.ok ? "#059669" : "#dc2626" }}>{k.v}</div>
            <div className="text-[10px] text-slate-500 mt-1">Target {k.target}</div>
          </div>
        ))}
      </div>

      <div className="card p-5 mb-4">
        <div className="font-display text-lg text-navy-800 mb-1">NABH Quality Indicators — Live Dashboard</div>
        <div className="text-xs text-slate-500 mb-4">Structure · process · outcome indicators tracked monthly</div>
        <div className="grid lg:grid-cols-3 gap-4">
          {[
            { c: "Clinical Outcome", l: "Mortality rate (gross)", v: "1.84%", t: "< 3%", ok: true },
            { c: "Clinical Outcome", l: "Re-admission within 30d", v: "4.2%", t: "< 8%", ok: true },
            { c: "Clinical Outcome", l: "Return to OR (unplanned)", v: "0.6%", t: "< 1%", ok: true },
            { c: "Patient Safety", l: "Sentinel events", v: NABH_KPIS.sentinelEventsMonth.toString(), t: "0", ok: true },
            { c: "Patient Safety", l: "Falls / 1,000 pt-days", v: NABH_KPIS.fallsPer1000PatientDays.toString(), t: "< 3", ok: true },
            { c: "Patient Safety", l: "Pressure ulcer rate", v: `${NABH_KPIS.pressureUlcerRate}%`, t: "< 2%", ok: true },
            { c: "Patient Safety", l: "Medication errors / month", v: NABH_KPIS.medicationErrorsMonth.toString(), t: "< 10", ok: true },
            { c: "Infection Control", l: "CLABSI / 1,000 line-days", v: "0.8", t: "< 2", ok: true },
            { c: "Infection Control", l: "CAUTI / 1,000 cath-days", v: "1.2", t: "< 3", ok: true },
            { c: "Infection Control", l: "VAP / 1,000 vent-days", v: NABH_KPIS.cssiPer1000VentDays.toString(), t: "< 5", ok: true },
            { c: "Infection Control", l: "SSI rate", v: "1.4%", t: "< 3%", ok: true },
            { c: "Process", l: "Time to thrombolysis", v: "38 min", t: "< 60 min", ok: true },
            { c: "Process", l: "Door-to-needle (stroke)", v: "42 min", t: "< 60 min", ok: true },
            { c: "Process", l: "Time to first dose antibiotic (sepsis)", v: "48 min", t: "< 60 min", ok: true },
            { c: "Patient Experience", l: "Avg wait OPD", v: "18 min", t: "< 30 min", ok: true },
          ].map((i, idx) => (
            <div key={idx} className="p-3 rounded border border-slate-200">
              <div className="text-[9px] tracking-widest text-gold-700 font-semibold">{i.c.toUpperCase()}</div>
              <div className="text-sm font-medium text-navy-800 mt-0.5">{i.l}</div>
              <div className="flex items-end gap-2 mt-1">
                <div className="font-display text-xl" style={{ color: i.ok ? "#059669" : "#dc2626" }}>{i.v}</div>
                <div className="text-[10px] text-slate-500 pb-1">target {i.t}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Hand Hygiene Compliance (12-mo)</div>
          <LineChart
            data={[
              { m: "Jun", v: 78 }, { m: "Jul", v: 82 }, { m: "Aug", v: 84 }, { m: "Sep", v: 86 },
              { m: "Oct", v: 88 }, { m: "Nov", v: 89 }, { m: "Dec", v: 90 }, { m: "Jan", v: 88 },
              { m: "Feb", v: 90 }, { m: "Mar", v: 91 }, { m: "Apr", v: 92 }, { m: "May", v: 92 },
            ]}
            height={200} color="#059669"
          />
          <div className="text-[10px] text-slate-500 mt-1">WHO 5 Moments · trending up</div>
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">HAI Rates (per 1,000 device-days)</div>
          <BarChart
            data={[
              { name: "CLABSI", value: 8 },
              { name: "CAUTI", value: 12 },
              { name: "VAP", value: 18 },
              { name: "SSI", value: 14 },
            ]}
            height={200}
          />
          <div className="text-[10px] text-slate-500 mt-1">All below NABH benchmark thresholds</div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────── Specialty Tab ─────────────────── */

function SpecialtyTab() {
  return (
    <>
      <div className="card p-5 mb-4 bg-gradient-to-br from-navy-800 to-emerald-900 text-white">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-gold-500 flex items-center justify-center"><I.star size={24} stroke="#0B1D3A" /></div>
          <div>
            <div className="text-[11px] tracking-widest text-gold-400">NABH SPECIALTY ACCREDITATIONS</div>
            <div className="font-display text-2xl mt-1">{NABH_SPECIALTY.length} specialty standards supported</div>
            <p className="text-white/80 text-sm mt-2 max-w-2xl">
              Beyond the core Hospital 5th Edition, BEYU Health OS supports NABH specialty accreditations
              for SHCO, Medical Imaging, Labs, Blood Banks, Dental, Dialysis, AYUSH, Ethics Committees,
              Primary Care Centres and Wellness Centres.
            </p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {NABH_SPECIALTY.map(s => {
          const Ico = I[s.icon as keyof typeof I];
          return (
            <div key={s.code} className="card overflow-hidden" style={{ borderTopColor: s.color, borderTopWidth: 4 }}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15` }}>
                      <Ico size={16} stroke={s.color} />
                    </div>
                    <div>
                      <div className="text-[10px] tracking-widest text-slate-500 font-bold">{s.code}</div>
                      <div className="font-display text-base text-navy-800 leading-tight">{s.title}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold tracking-widest ${
                    s.status === "MET" ? "bg-emerald-100 text-emerald-700" :
                    s.status === "PARTIALLY MET" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                  }`}>{s.status === "PARTIALLY MET" ? "PARTIAL" : s.status}</span>
                </div>
                <div className="text-xs text-slate-600 mb-2">{s.fullTitle}</div>
                <div className="text-[11px] text-slate-500 italic mb-3">{s.applicableTo}</div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="rounded bg-slate-50 px-2 py-1.5 text-center">
                    <div className="font-display text-base text-navy-800">{s.standardsCount}</div>
                    <div className="text-[9px] tracking-widest text-slate-500">STANDARDS</div>
                  </div>
                  <div className="rounded bg-slate-50 px-2 py-1.5 text-center">
                    <div className="font-display text-base text-navy-800">{s.beyuModules.length}</div>
                    <div className="text-[9px] tracking-widest text-slate-500">BEYU MODULES</div>
                  </div>
                </div>

                <div className="text-[10px] tracking-widest text-gold-700 font-semibold mb-1">HIGHLIGHTS</div>
                <div className="space-y-0.5">
                  {s.highlights.map(h => (
                    <div key={h} className="text-[11px] text-slate-700 flex items-start gap-1.5">
                      <I.check size={10} stroke={s.color} className="mt-0.5 shrink-0" />{h}
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {s.beyuModules.map(m => (
                    <span key={m} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">{m}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─────────────────── Self-Assessment Wizard Tab ─────────────────── */

function AssessmentTab() {
  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5 lg:col-span-2 bg-gradient-to-br from-violet-50 to-emerald-50">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-lg bg-violet-600 flex items-center justify-center"><I.check size={24} stroke="#fff" /></div>
            <div>
              <div className="font-display text-xl text-navy-800">NABH Self-Assessment Wizard</div>
              <p className="text-sm text-slate-700 mt-1">
                A 6-step guided journey to formal NABH accreditation. The system pulls evidence
                automatically from the relevant BEYU modules.
              </p>
            </div>
          </div>
        </div>
        <div className="card p-5 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white">
          <div className="text-[11px] tracking-widest text-white/70">CURRENT READINESS</div>
          <div className="font-display text-5xl mt-1">{NABH_KPIS.overallPct}%</div>
          <div className="text-sm text-white/80 mt-1">Ready for pre-assessment</div>
        </div>
      </div>

      <div className="card p-6 mb-4">
        <div className="font-display text-lg text-navy-800 mb-4">6-Step Accreditation Journey</div>
        <div className="space-y-3">
          {[
            { n: 1, t: "Application & Documentation", d: "Complete NABH application form · pay fees · submit organizational charter", done: true, owner: "Quality Director", date: "2026-02-15" },
            { n: 2, t: "Self-Assessment", d: `Score all ${NABH_KPIS.objectiveElements} OEs against your evidence`, done: true, owner: "Quality Team", date: "2026-03-30" },
            { n: 3, t: "Gap Analysis & CAPA", d: "Identify gaps · develop corrective action plan · track CAPA closure", done: true, owner: "Quality Team", date: "2026-04-22" },
            { n: 4, t: "Pre-Assessment (NABH consultant)", d: "External consultant 2-day mock audit · report with findings", done: false, owner: "External consultant", date: "Scheduled 2026-06-10" },
            { n: 5, t: "Final Assessment", d: "NABH 3-day on-site audit by NABH assessors · objective verification", done: false, owner: "NABH assessors", date: "Target 2026-09-15" },
            { n: 6, t: "Accreditation Decision", d: "Accreditation Committee decision · certificate issued (3 years)", done: false, owner: "NABH Committee", date: "Target 2026-11-30" },
          ].map(s => (
            <div key={s.n} className={`p-4 rounded-xl border ${s.done ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200"}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-bold ${s.done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                  {s.done ? <I.check size={18} stroke="#fff" /> : s.n}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-navy-800">{s.t}</div>
                    {s.done && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white font-bold tracking-widest">COMPLETE</span>}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">{s.d}</div>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                    <span>👤 {s.owner}</span>
                    <span>📅 {s.date}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-3">Open CAPA Items</div>
        <div className="space-y-2">
          {[
            { id: "CAPA-001", oe: "AAC.3.b", t: "Pain reassessment frequency in OPD inconsistent", action: "Add reminder in OPD note template", due: "2026-05-20", status: "In Progress", owner: "Dr. Mwangi" },
            { id: "CAPA-002", oe: "HRM.3.a", t: "5 nurses below CPD threshold", action: "Schedule CPD courses; auto-enrolment", due: "2026-06-15", status: "In Progress", owner: "Halima Said (HR)" },
            { id: "CAPA-003", oe: "FMS.2.a", t: "Fire drill overdue at Aga Khan tenant", action: "Schedule drill for 2026-05-25", due: "2026-05-25", status: "Planned", owner: "Facilities" },
            { id: "CAPA-004", oe: "ROM.4.a", t: "2 supplier MSAs need renewal", action: "Renew + e-sign via Smart Contracts vault", due: "2026-05-30", status: "Planned", owner: "Procurement" },
          ].map(c => (
            <div key={c.id} className="p-3 rounded border border-slate-200 flex items-start gap-3">
              <div className="font-mono text-[10px] text-violet-700 shrink-0 mt-1">{c.id}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-mono">{c.oe}</span>
                  <span className="font-medium text-sm text-navy-800">{c.t}</span>
                </div>
                <div className="text-[11px] text-slate-600 mt-1">→ {c.action}</div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                  <span>Owner: {c.owner}</span>
                  <span>Due: {c.due}</span>
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${c.status === "In Progress" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{c.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
