import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, ProgressBar } from "../components/Charts";
import { StaffChip, TeamRoster } from "../components/HRWidgets";
import { byId } from "../services/hr";
import { Classification, PHIField, TenantIsolationNotice } from "../components/Security";

/* ─────────────────────────── Patient Chart (EMR) ─────────────────────────── */

const TABS = ["Summary", "Problems", "Medications", "Allergies", "Vitals", "Labs", "Imaging", "Notes", "Orders", "Care Plan"] as const;
type Tab = typeof TABS[number];

export function EMRPatientChart() {
  const [tab, setTab] = useState<Tab>("Summary");

  // The active "patient" — Fatuma Ally (ICU sepsis case)
  const patient = {
    name: "Fatuma Ally",
    mrn: "BEYU-100486",
    age: 71,
    sex: "F",
    bloodType: "B+",
    nhif: "CF-71223-89",
    location: "ICU-1 · Muhimbili",
    attending: "Dr. M. Achieng",
    admitted: "2026-04-28",
    los: "7 days",
  };

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="EMR · Patient Chart"
        subtitle={`${patient.name} · MRN ${patient.mrn} · ${patient.age}y ${patient.sex}`}
        actions={
          <>
            <Classification level="PHI" />
            <button className="btn-outline text-sm">Print Summary</button>
            <button className="btn-primary text-sm">+ New Encounter</button>
          </>
        }
      />

      <div className="mb-4"><TenantIsolationNotice tenant="Muhimbili National Hospital" /></div>

      {/* Patient banner */}
      <div className="card p-5 mb-4 bg-gradient-to-r from-navy-800 to-navy-900 text-white">
        <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-navy-900 flex items-center justify-center text-2xl font-display font-bold ring-2 ring-gold-300/40">
              FA
            </div>
            <div>
              <div className="font-display text-2xl">{patient.name}</div>
              <div className="text-[11px] text-white/65 flex flex-wrap gap-x-4 gap-y-0.5 mt-1 items-center">
                <span>MRN <span className="font-mono text-gold-300">{patient.mrn}</span></span>
                <span>{patient.age}y · {patient.sex}</span>
                <span>Blood: <span className="text-gold-300">{patient.bloodType}</span></span>
                <span className="text-gold-300"><PHIField label="NHIF">{patient.nhif}</PHIField></span>
              </div>
              <div className="text-[11px] text-white/65 mt-0.5">{patient.location} · Attending: {patient.attending}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 shrink-0">
            {[
              { l: "Admitted", v: patient.admitted },
              { l: "LOS", v: patient.los },
              { l: "NEWS Score", v: "9 ⚠" },
              { l: "Code Status", v: "Full Code" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-white/10 px-3 py-2">
                <div className="text-[10px] text-white/60">{s.l}</div>
                <div className="text-sm font-semibold">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Critical alerts strip */}
        <div className="mt-4 grid md:grid-cols-3 gap-2">
          <div className="rounded-lg bg-rose-500/20 border border-rose-400/40 px-3 py-2 text-xs">
            <span className="text-rose-200 font-semibold">⚠ ALLERGY:</span> Penicillin (anaphylaxis 2018)
          </div>
          <div className="rounded-lg bg-amber-500/20 border border-amber-400/40 px-3 py-2 text-xs">
            <span className="text-amber-200 font-semibold">⚠ ALERT:</span> Sepsis bundle in progress
          </div>
          <div className="rounded-lg bg-violet-500/20 border border-violet-400/40 px-3 py-2 text-xs">
            <span className="text-violet-200 font-semibold">⛓ CONSENT:</span> Records shared with 2 BEYU tenants
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 overflow-x-auto">
          <div className="flex min-w-fit">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 ${
                  tab === t ? "border-gold-500 text-navy-800" : "border-transparent text-slate-500 hover:text-navy-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5">
          {tab === "Summary" && <SummaryTab />}
          {tab === "Problems" && <ProblemsTab />}
          {tab === "Medications" && <MedicationsTab />}
          {tab === "Allergies" && <AllergiesTab />}
          {tab === "Vitals" && <VitalsTab />}
          {tab === "Labs" && <LabsTab />}
          {tab === "Imaging" && <ImagingTab />}
          {tab === "Notes" && <NotesTab />}
          {tab === "Orders" && <OrdersTab />}
          {tab === "Care Plan" && <CarePlanTab />}
        </div>
      </div>
    </div>
  );
}

function SummaryTab() {
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <div className="text-[10px] tracking-widest text-slate-500 mb-2">CHIEF COMPLAINT</div>
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            Severe fever, confusion and hypotension following 3-day febrile illness. Found collapsed at home by family.
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-slate-500 mb-2">HISTORY OF PRESENT ILLNESS</div>
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700 leading-relaxed">
            71-year-old female with background of type-2 diabetes (15 years) and chronic kidney disease (stage 3a) presented to the
            Emergency Department on 28 April 2026 with a 3-day history of high-grade fever (max 39.8 °C), rigors and progressive confusion.
            On arrival she was hypotensive (BP 78/42), tachycardic (HR 124) and tachypneic (RR 28). Lactate 4.2 mmol/L. Sepsis-6 bundle
            initiated within the hour. Source workup identified urosepsis with E. coli bacteraemia. Transferred to ICU.
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-slate-500 mb-2">ACTIVE PROBLEM LIST</div>
          <div className="space-y-1.5">
            {[
              { dx: "Septic shock secondary to urosepsis", icd: "R65.21 / A41.51", onset: "Active" },
              { dx: "Type 2 Diabetes Mellitus", icd: "E11.9", onset: "Chronic (2011)" },
              { dx: "Chronic Kidney Disease, stage 3a", icd: "N18.31", onset: "Chronic (2020)" },
              { dx: "Acute Kidney Injury on CKD", icd: "N17.9", onset: "Active" },
              { dx: "Hypertension, essential", icd: "I10", onset: "Chronic (2015)" },
            ].map((p) => (
              <div key={p.dx} className="flex items-center gap-3 p-2.5 rounded border border-slate-100">
                <div className="w-2 h-8 rounded bg-rose-500" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-navy-800">{p.dx}</div>
                  <div className="text-[11px] text-slate-500">{p.icd} · {p.onset}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card !shadow-none border p-4">
          <div className="text-[10px] tracking-widest text-slate-500 mb-2">VITAL SIGNS (LATEST)</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "BP", v: "112/68", c: "#0B1D3A" },
              { l: "HR", v: "98", c: "#dc2626" },
              { l: "SpO₂", v: "94%", c: "#1E3A8A" },
              { l: "Temp", v: "37.6 °C", c: "#b45309" },
              { l: "RR", v: "22", c: "#557345" },
              { l: "GCS", v: "14", c: "#7c3aed" },
            ].map((v) => (
              <div key={v.l} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-[10px] text-slate-500">{v.l}</div>
                <div className="text-lg font-display" style={{ color: v.c }}>{v.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card !shadow-none border p-4">
          <div className="text-[10px] tracking-widest text-slate-500 mb-2">QUICK STATS</div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Encounters</span><span className="font-semibold text-navy-800">28</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Active meds</span><span className="font-semibold text-navy-800">9</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Open orders</span><span className="font-semibold text-navy-800">4</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Labs (24h)</span><span className="font-semibold text-navy-800">12</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Imaging studies</span><span className="font-semibold text-navy-800">6</span></div>
          </div>
        </div>

        <div className="card !shadow-none border p-4 bg-violet-50 border-violet-200">
          <div className="text-[10px] tracking-widest text-violet-700 mb-1">AI CO-PILOT INSIGHT</div>
          <div className="text-xs text-violet-900">
            Sepsis bundle 5/5 compliant. Lactate clearance 38% at 2h (target ≥10%). Consider source-control imaging if no further improvement by 6h.
          </div>
        </div>
      </div>
    </div>
  );
}

function ProblemsTab() {
  return (
    <div className="space-y-2">
      {[
        { dx: "Septic shock", icd: "R65.21", st: "Active", date: "2026-04-28", sev: "Critical" },
        { dx: "Urosepsis (E. coli bacteraemia)", icd: "A41.51", st: "Active", date: "2026-04-28", sev: "Critical" },
        { dx: "Acute Kidney Injury", icd: "N17.9", st: "Active", date: "2026-04-29", sev: "High" },
        { dx: "Type 2 Diabetes Mellitus", icd: "E11.9", st: "Chronic", date: "2011-03-12", sev: "Moderate" },
        { dx: "Chronic Kidney Disease, stage 3a", icd: "N18.31", st: "Chronic", date: "2020-08-04", sev: "Moderate" },
        { dx: "Hypertension, essential", icd: "I10", st: "Chronic", date: "2015-06-22", sev: "Controlled" },
        { dx: "Osteoarthritis, knees (bilateral)", icd: "M17.0", st: "Chronic", date: "2018-11-09", sev: "Mild" },
        { dx: "Cataract, right eye (resolved)", icd: "H25.011", st: "Resolved", date: "2023-02-14", sev: "Resolved" },
      ].map((p) => (
        <div key={p.dx} className="p-3 rounded-lg border border-slate-200 flex items-center gap-3">
          <div className={`w-2 h-10 rounded ${p.sev === "Critical" ? "bg-rose-500" : p.sev === "High" ? "bg-amber-500" : p.sev === "Moderate" ? "bg-gold-500" : p.sev === "Mild" ? "bg-emerald-500" : "bg-slate-300"}`} />
          <div className="flex-1">
            <div className="font-medium text-navy-800">{p.dx}</div>
            <div className="text-[11px] text-slate-500">{p.icd} · since {p.date}</div>
          </div>
          <span className={`text-[11px] px-2 py-0.5 rounded ${
            p.st === "Active" ? "bg-rose-100 text-rose-700" :
            p.st === "Chronic" ? "bg-navy-100 text-navy-700" : "bg-emerald-100 text-emerald-700"
          }`}>{p.st}</span>
        </div>
      ))}
    </div>
  );
}

function MedicationsTab() {
  return (
    <div className="space-y-2">
      {[
        { m: "Piperacillin-Tazobactam 4.5g IV", f: "q8h × 7d", r: "Empiric sepsis cover", st: "Active", c: "rose" },
        { m: "Norepinephrine infusion", f: "0.08 mcg/kg/min", r: "Maintain MAP ≥ 65", st: "Active (ICU)", c: "rose" },
        { m: "Hydrocortisone 50mg IV", f: "q6h", r: "Vasopressor-resistant shock", st: "Active", c: "rose" },
        { m: "Insulin glargine 14u SC", f: "OD nocte", r: "T2DM", st: "Active", c: "navy" },
        { m: "Insulin aspart sliding scale", f: "QDS before meals", r: "Glucose control", st: "Active", c: "navy" },
        { m: "Paracetamol 1g IV", f: "QDS PRN", r: "Fever / pain", st: "Active PRN", c: "amber" },
        { m: "Pantoprazole 40mg IV", f: "OD", r: "Stress ulcer prophylaxis", st: "Active", c: "navy" },
        { m: "Enoxaparin 40mg SC", f: "OD", r: "VTE prophylaxis", st: "Active", c: "navy" },
        { m: "Metformin 850mg PO", f: "BD (held)", r: "T2DM — HELD for AKI", st: "Held", c: "slate" },
      ].map((m) => (
        <div key={m.m} className={`p-3 rounded-lg border flex items-center gap-3 ${
          m.c === "rose" ? "border-rose-200 bg-rose-50" :
          m.c === "amber" ? "border-amber-200 bg-amber-50" :
          m.c === "navy" ? "border-navy-200 bg-navy-50" : "border-slate-200 bg-slate-100"
        }`}>
          <I.pill size={16} stroke="#0B1D3A" />
          <div className="flex-1">
            <div className="font-medium text-navy-800">{m.m}</div>
            <div className="text-[11px] text-slate-600">{m.f} · {m.r}</div>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">{m.st}</span>
        </div>
      ))}
    </div>
  );
}

function AllergiesTab() {
  return (
    <div className="space-y-2">
      {[
        { a: "Penicillin", r: "Anaphylaxis · 2018", sev: "Severe" },
        { a: "Sulpha drugs", r: "Maculopapular rash · 2010", sev: "Moderate" },
        { a: "Iodinated contrast", r: "Urticaria · 2022", sev: "Mild" },
        { a: "Latex", r: "Contact dermatitis", sev: "Mild" },
      ].map((a) => (
        <div key={a.a} className={`p-4 rounded-lg border flex items-center gap-3 ${
          a.sev === "Severe" ? "bg-rose-50 border-rose-300" : a.sev === "Moderate" ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"
        }`}>
          <I.warning size={20} stroke={a.sev === "Severe" ? "#dc2626" : a.sev === "Moderate" ? "#b45309" : "#64748b"} />
          <div className="flex-1">
            <div className="font-semibold text-navy-800">{a.a}</div>
            <div className="text-xs text-slate-600">{a.r}</div>
          </div>
          <span className={`text-xs font-bold px-2 py-1 rounded ${
            a.sev === "Severe" ? "bg-rose-600 text-white" : a.sev === "Moderate" ? "bg-amber-500 text-white" : "bg-slate-400 text-white"
          }`}>{a.sev}</span>
        </div>
      ))}
    </div>
  );
}

function VitalsTab() {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div>
        <div className="text-[10px] tracking-widest text-slate-500 mb-2">SYSTOLIC BP (mmHg) · LAST 24H</div>
        <LineChart
          data={[
            { m: "00", v: 78 }, { m: "02", v: 84 }, { m: "04", v: 92 }, { m: "06", v: 96 },
            { m: "08", v: 102 }, { m: "10", v: 108 }, { m: "12", v: 110 }, { m: "14", v: 112 },
          ]}
          height={180} color="#dc2626"
        />
      </div>
      <div>
        <div className="text-[10px] tracking-widest text-slate-500 mb-2">HEART RATE (bpm) · LAST 24H</div>
        <LineChart
          data={[
            { m: "00", v: 124 }, { m: "02", v: 118 }, { m: "04", v: 112 }, { m: "06", v: 108 },
            { m: "08", v: 104 }, { m: "10", v: 102 }, { m: "12", v: 100 }, { m: "14", v: 98 },
          ]}
          height={180} color="#7c3aed"
        />
      </div>
      <div>
        <div className="text-[10px] tracking-widest text-slate-500 mb-2">LACTATE (mmol/L)</div>
        <LineChart
          data={[
            { m: "0h", v: 4.2 }, { m: "2h", v: 2.6 }, { m: "4h", v: 2.1 }, { m: "8h", v: 1.6 }, { m: "12h", v: 1.4 }, { m: "24h", v: 1.2 },
          ]}
          height={180} color="#b45309"
        />
      </div>
      <div>
        <div className="text-[10px] tracking-widest text-slate-500 mb-2">URINE OUTPUT (mL/h)</div>
        <LineChart
          data={[
            { m: "0h", v: 12 }, { m: "2h", v: 18 }, { m: "4h", v: 24 }, { m: "8h", v: 32 }, { m: "12h", v: 42 }, { m: "24h", v: 48 },
          ]}
          height={180} color="#1E3A8A"
        />
      </div>
    </div>
  );
}

function LabsTab() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-3 py-2.5">TEST</th>
            <th className="text-left px-3 py-2.5">RESULT</th>
            <th className="text-left px-3 py-2.5">UNIT</th>
            <th className="text-left px-3 py-2.5">REF RANGE</th>
            <th className="text-left px-3 py-2.5">FLAG</th>
            <th className="text-left px-3 py-2.5">TIME</th>
          </tr>
        </thead>
        <tbody>
          {[
            { t: "WBC", v: "18.4", u: "10⁹/L", r: "4.0–11.0", f: "H" },
            { t: "Neutrophils", v: "16.2", u: "10⁹/L", r: "2.0–7.5", f: "H" },
            { t: "Haemoglobin", v: "10.4", u: "g/dL", r: "12–16", f: "L" },
            { t: "Platelets", v: "98", u: "10⁹/L", r: "150–400", f: "L" },
            { t: "Sodium", v: "142", u: "mmol/L", r: "135–145", f: "" },
            { t: "Potassium", v: "5.4", u: "mmol/L", r: "3.5–5.0", f: "H" },
            { t: "Creatinine", v: "284", u: "μmol/L", r: "45–84", f: "H" },
            { t: "eGFR", v: "18", u: "mL/min/1.73m²", r: "≥60", f: "L" },
            { t: "Lactate", v: "1.2", u: "mmol/L", r: "0.5–2.0", f: "" },
            { t: "CRP", v: "248", u: "mg/L", r: "<10", f: "H" },
            { t: "Procalcitonin", v: "32.4", u: "ng/mL", r: "<0.5", f: "H" },
            { t: "Blood culture", v: "E. coli", u: "—", r: "No growth", f: "CRIT" },
          ].map((l) => (
            <tr key={l.t} className="border-b border-slate-100">
              <td className="px-3 py-2.5 font-medium text-navy-800">{l.t}</td>
              <td className="px-3 py-2.5 font-mono">{l.v}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{l.u}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{l.r}</td>
              <td className="px-3 py-2.5">
                {l.f && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    l.f === "CRIT" ? "bg-rose-600 text-white" : l.f === "H" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                  }`}>{l.f}</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-500 font-mono">today 06:00</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImagingTab() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { s: "CXR PA", d: "Bilateral basal opacities", date: "29 Apr" },
        { s: "CT Abdomen + Pelvis", d: "L kidney pyelonephritis", date: "29 Apr" },
        { s: "US KUB", d: "No obstruction", date: "29 Apr" },
        { s: "ECG 12-lead", d: "Sinus tachy, no ischaemia", date: "28 Apr" },
        { s: "Echo (bedside)", d: "EF 55%, no effusion", date: "30 Apr" },
        { s: "CXR PA repeat", d: "Improving infiltrates", date: "03 May" },
      ].map((i) => (
        <div key={i.s} className="card !shadow-none border overflow-hidden">
          <div className="aspect-square bg-gradient-to-br from-slate-900 to-black relative">
            <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 100 100">
              <ellipse cx="50" cy="50" rx="38" ry="44" fill="#374151" />
              <ellipse cx="50" cy="50" rx="28" ry="34" fill="#4b5563" />
              {Array.from({ length: 6 }).map((_, j) => (
                <rect key={j} x={20 + j * 10} y={70 + (j % 2) * 4} width="3" height="6" fill="#fef3c7" />
              ))}
            </svg>
            <div className="absolute top-1 left-1 text-[9px] font-mono text-white/70">{i.s}</div>
            <div className="absolute bottom-1 right-1 text-[9px] font-mono text-white/70">{i.date}</div>
          </div>
          <div className="p-2 text-[11px] text-slate-700">{i.d}</div>
        </div>
      ))}
    </div>
  );
}

function NotesTab() {
  const notes = [
    { empId: "EMP-10003", t: "Daily Progress Note — Day 7", d: "Today", body: "Improving. Off vasopressors × 24h. Lactate normalized. Urine output 60 mL/h. Plan: step down to HDU tomorrow, complete antibiotics PO." },
    { empId: "EMP-10020", t: "Nursing Shift Handover", d: "Today 14:00", body: "Patient alert, oriented × 3. Tolerating soft diet. Pressure areas intact. Foley patent. Sliding scale insulin requirement decreasing." },
    { empId: "EMP-10003", t: "Family Meeting", d: "Yesterday 16:00", body: "Met with patient and 3 family members. Explained sepsis trajectory, recovery prognosis good, anticipated discharge in 4–5 days. Family understanding and agreeable." },
    { empId: "EMP-10012", t: "ICU Admission Note", d: "2026-04-28 22:00", body: "71F septic shock from urosepsis. Sepsis-6 bundle initiated within 30 min. Norepinephrine started. CRRT not currently indicated. Will monitor renal function closely." },
  ];
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-3">
        {notes.map((n, i) => {
          const e = byId(n.empId);
          return (
            <div key={i} className="p-4 rounded-lg border border-slate-200">
              <div className="flex items-start justify-between mb-1">
                <div className="min-w-0">
                  <div className="font-semibold text-navy-800">{n.t}</div>
                  <div className="text-[11px] mt-1">{e && <StaffChip e={e} sub={e.role} />}</div>
                </div>
                <div className="text-[11px] text-slate-500 shrink-0">{n.d}</div>
              </div>
              <p className="text-sm text-slate-700 mt-2 leading-relaxed">{n.body}</p>
            </div>
          );
        })}
      </div>
      <TeamRoster department="ICU" title="ICU Care Team" max={5} />
    </div>
  );
}

function OrdersTab() {
  return (
    <div className="space-y-2">
      {[
        { o: "Continue Pip-Taz 4.5g IV q8h", t: "Active", c: "emerald" },
        { o: "Daily U&E, FBC, CRP", t: "Active (recurring)", c: "navy" },
        { o: "Hold metformin until eGFR > 30", t: "Active", c: "amber" },
        { o: "Physiotherapy 2× daily", t: "Active", c: "navy" },
        { o: "Repeat CXR in 48h", t: "Pending", c: "amber" },
        { o: "Transfer to HDU tomorrow AM", t: "Planned", c: "violet" },
      ].map((o) => (
        <div key={o.o} className="p-3 rounded border border-slate-200 flex items-center gap-3">
          <I.check size={14} stroke="#0B1D3A" />
          <div className="flex-1 text-sm text-navy-800">{o.o}</div>
          <span className={`text-[11px] px-2 py-0.5 rounded ${
            o.c === "emerald" ? "bg-emerald-100 text-emerald-700" :
            o.c === "amber" ? "bg-amber-100 text-amber-700" :
            o.c === "violet" ? "bg-violet-100 text-violet-700" : "bg-navy-100 text-navy-700"
          }`}>{o.t}</span>
        </div>
      ))}
    </div>
  );
}

function CarePlanTab() {
  return (
    <div className="space-y-3">
      {[
        { g: "Resolve septic shock", p: 92 },
        { g: "Wean off vasopressors", p: 100 },
        { g: "Restore renal function (target eGFR > 30)", p: 64 },
        { g: "Complete 7-day antibiotic course", p: 78 },
        { g: "Mobilize independently", p: 40 },
        { g: "Discharge planning — home with district nurse", p: 18 },
      ].map((g) => (
        <div key={g.g} className="p-3 rounded border border-slate-200">
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-navy-800">{g.g}</span>
            <span className="text-slate-500">{g.p}%</span>
          </div>
          <ProgressBar value={g.p} color={g.p === 100 ? "#059669" : "#0B1D3A"} />
        </div>
      ))}
    </div>
  );
}
