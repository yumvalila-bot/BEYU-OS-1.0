import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, BarChart, DonutChart, ProgressBar } from "../components/Charts";
import { PATIENTS, TENANTS } from "../data/mock";
import { DocumentViewer, DocList } from "../components/DocumentViewer";
import { docsForModule, type BeyuDoc } from "../data/documents";
import { OnDutyStrip, TeamRoster, StaffChip, CredentialAlertBanner } from "../components/HRWidgets";
import { byId, byCadre, expiringCredentials, HR_KPIS } from "../services/hr";
import { PriorityBadge, PriorityLegend } from "../components/Flow";

/* ────────────────────────────── PATIENT LIST ────────────────────────────── */

export function PatientListScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Patient List"
        subtitle="Unified registry across all BEYU tenants · Master Patient Index · color-coded by priority"
        actions={
          <>
            <button className="btn-outline text-sm">Import CSV</button>
            <button className="btn-primary text-sm">+ Register Patient</button>
          </>
        }
      />

      <div className="mb-4"><PriorityLegend compact /></div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Total Patients", v: "12,458", d: "All tenants" },
          { l: "Active (90d)", v: "8,742", d: "70%" },
          { l: "Insured (NHIF+)", v: "9,118", d: "73%" },
          { l: "Pediatric (<18y)", v: "2,841", d: "23%" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg">
            <I.search size={16} stroke="#64748b" />
            <input placeholder="Search by name, MRN, NHIF or phone…" className="bg-transparent flex-1 outline-none text-sm" />
          </div>
          <div className="flex gap-2 text-xs">
            {["All", "OPD", "IPD", "ICU", "Pediatric", "Oncology"].map((f, i) => (
              <button key={f} className={`px-3 py-1.5 rounded-lg ${i === 0 ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{f}</button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5">MRN</th>
              <th className="text-left px-4 py-2.5">PATIENT</th>
              <th className="text-left px-4 py-2.5">DEPT</th>
              <th className="text-left px-4 py-2.5">VISIT</th>
              <th className="text-left px-4 py-2.5">INSURANCE</th>
              <th className="text-left px-4 py-2.5">PRIORITY</th>
              <th className="text-left px-4 py-2.5">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {PATIENTS.map((p) => (
              <tr key={p.mrn} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.mrn}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-navy-700 to-navy-900 text-white flex items-center justify-center text-xs font-semibold">
                      {p.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <div className="font-medium text-navy-800">{p.name}</div>
                      <div className="text-[11px] text-slate-500">{p.age}y · {p.sex}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{p.dept}</td>
                <td className="px-4 py-3 text-slate-700 text-xs">{p.visit}</td>
                <td className="px-4 py-3"><span className="text-[11px] px-2 py-0.5 rounded bg-navy-50 text-navy-700">{p.insurance}</span></td>
                <td className="px-4 py-3">
                  <PriorityBadge p={
                    p.priority === "Critical" ? "EMERGENCY" :
                    p.priority === "Urgent" ? "URGENT" :
                    p.age >= 75 ? "ELDERLY" :
                    p.age <= 5 ? "PEDIATRIC" : "ROUTINE"
                  } size="sm" />
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────────────── NEW REGISTRATIONS ────────────────────────────── */

export function NewRegistrationsScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="New Registrations" subtitle="Patient onboarding · biometric capture · MPI reconciliation" />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-6 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-4">Register New Patient</div>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { l: "Full Name", v: "" },
              { l: "Date of Birth", v: "" },
              { l: "Sex", v: "" },
              { l: "National ID (NIDA)", v: "" },
              { l: "Phone Number", v: "" },
              { l: "Email", v: "" },
              { l: "Region", v: "Dar es Salaam" },
              { l: "District", v: "Kinondoni" },
              { l: "Next of Kin", v: "" },
              { l: "NHIF Number (optional)", v: "" },
            ].map((f) => (
              <div key={f.l}>
                <label className="text-[11px] tracking-widest text-slate-500">{f.l.toUpperCase()}</label>
                <input defaultValue={f.v} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-navy-500" placeholder={`Enter ${f.l.toLowerCase()}`} />
              </div>
            ))}
          </div>

          <div className="mt-5 grid md:grid-cols-3 gap-3">
            <button className="rounded-lg border-2 border-dashed border-slate-300 p-4 text-center hover:border-navy-500 hover:bg-navy-50 transition">
              <I.fingerprint size={28} stroke="#0B1D3A" className="mx-auto mb-1" />
              <div className="text-xs font-semibold text-navy-800">Capture Fingerprint</div>
              <div className="text-[10px] text-slate-500">10-finger ANSI/NIST</div>
            </button>
            <button className="rounded-lg border-2 border-dashed border-slate-300 p-4 text-center hover:border-navy-500 hover:bg-navy-50 transition">
              <I.scan size={28} stroke="#0B1D3A" className="mx-auto mb-1" />
              <div className="text-xs font-semibold text-navy-800">Capture Face</div>
              <div className="text-[10px] text-slate-500">Biometric MFA</div>
            </button>
            <button className="rounded-lg border-2 border-dashed border-slate-300 p-4 text-center hover:border-navy-500 hover:bg-navy-50 transition">
              <I.doc size={28} stroke="#0B1D3A" className="mx-auto mb-1" />
              <div className="text-xs font-semibold text-navy-800">Scan ID / NHIF Card</div>
              <div className="text-[10px] text-slate-500">OCR + AI extract</div>
            </button>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button className="btn-outline">Save Draft</button>
            <button className="btn-primary">Register & Issue MRN</button>
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Today's Registrations</div>
          <div className="font-display text-4xl text-gold-600 mb-1">42</div>
          <div className="text-xs text-slate-500 mb-4">across {TENANTS.length} tenants</div>
          <div className="space-y-2">
            {[
              { n: "Amina Hassan", t: "08:32 · Muhimbili" },
              { n: "Erick Mushi", t: "08:58 · Aga Khan" },
              { n: "Halima Said", t: "09:14 · Arusha LMC" },
              { n: "Tumaini Mtui", t: "09:31 · BEYU Mwanza" },
              { n: "Saidi Bakari", t: "09:47 · Moshi RRH" },
            ].map((r) => (
              <div key={r.n} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50">
                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center"><I.check size={12} stroke="#059669" /></div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-navy-800">{r.n}</div>
                  <div className="text-[11px] text-slate-500">{r.t}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 rounded-lg bg-gold-50 border border-gold-200 text-xs text-gold-800">
            <strong>MPI Engine:</strong> 3 duplicates detected and merged today (similarity ≥ 0.96).
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── APPOINTMENTS ────────────────────────────── */

export function AppointmentsScreen() {
  const days = ["Mon 04", "Tue 05", "Wed 06", "Thu 07", "Fri 08", "Sat 09"];
  const slots = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"];
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Appointments" subtitle="Calendar · resource scheduling · NHIF eligibility" actions={<button className="btn-primary text-sm">+ Book Appointment</button>} />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Today", v: "127" }, { l: "This Week", v: "812" },
          { l: "No-Shows", v: "4.2%" }, { l: "Avg Wait", v: "18 min" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="font-display text-lg text-navy-800">Week of 04 May 2026</div>
          <div className="flex gap-1">
            {["Day", "Week", "Month"].map((v, i) => (
              <button key={v} className={`px-3 py-1.5 rounded-lg text-xs ${i === 1 ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-600"}`}>{v}</button>
            ))}
          </div>
        </div>
        <div className="min-w-[800px]">
          <div className="grid grid-cols-[80px_repeat(6,1fr)] border-b border-slate-100">
            <div className="px-3 py-2 text-[10px] tracking-widest text-slate-400">TIME</div>
            {days.map((d) => <div key={d} className="px-3 py-2 text-xs font-semibold text-navy-800 border-l border-slate-100">{d}</div>)}
          </div>
          {slots.map((s, si) => (
            <div key={s} className="grid grid-cols-[80px_repeat(6,1fr)] border-b border-slate-50 min-h-[56px]">
              <div className="px-3 py-2 text-xs font-mono text-slate-500">{s}</div>
              {days.map((d, di) => {
                const has = (si + di) % 3 === 0;
                const colors = ["bg-navy-50 border-l-navy-500", "bg-emerald-50 border-l-emerald-500", "bg-gold-50 border-l-gold-500", "bg-rose-50 border-l-rose-500"];
                return (
                  <div key={d} className="border-l border-slate-100 p-1">
                    {has && (
                      <div className={`rounded p-2 border-l-2 ${colors[(si + di) % 4]}`}>
                        <div className="text-[11px] font-medium text-navy-800 truncate">{["Consult", "Follow-up", "Dental", "Lab"][(si + di) % 4]}</div>
                        <div className="text-[10px] text-slate-500 truncate">{["A. Hassan", "J. Mwakyusa", "D. Kessy", "B. Juma"][(si + di) % 4]}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── MEDICAL REPORTS AI ────────────────────────────── */

export function MedicalReportsAIScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Medical Reports AI" subtitle="AI-generated discharge summaries · referrals · medico-legal reports" actions={<button className="btn-gold text-sm">⚡ Generate Report</button>} />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {[
          { i: "doc", t: "Discharge Summaries", v: 184, sub: "auto-drafted this month" },
          { i: "doc", t: "Referral Letters", v: 92, sub: "to specialist clinics" },
          { i: "doc", t: "Medico-Legal", v: 18, sub: "RTA & forensic" },
        ].map((c) => {
          const Ico = I[c.i as keyof typeof I];
          return (
            <div key={c.t} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-gold-50 flex items-center justify-center"><Ico size={20} stroke="#b48a24" /></div>
                <div className="font-display text-3xl text-navy-800">{c.v}</div>
              </div>
              <div className="font-semibold text-navy-800">{c.t}</div>
              <div className="text-xs text-slate-500 mt-1">{c.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-lg text-navy-800">AI Draft Preview</div>
            <span className="text-[11px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">DRAFT · CONFIDENCE 0.92</span>
          </div>
          <div className="rounded-lg border border-slate-200 p-5 bg-slate-50 text-sm leading-relaxed text-slate-700 font-serif max-h-96 overflow-y-auto">
            <div className="text-center text-navy-800 font-bold mb-3">DISCHARGE SUMMARY</div>
            <div className="text-xs text-slate-500 text-center mb-4">Muhimbili National Hospital · BEYU Health OS</div>
            <p><strong>Patient:</strong> Baraka Juma · MRN BEYU-100485 · 9y · Male</p>
            <p><strong>Admission:</strong> 2026-04-28 · <strong>Discharge:</strong> 2026-05-04</p>
            <p><strong>Attending:</strong> Dr. Halima Omar (Pediatrics)</p>
            <p className="mt-3"><strong>Diagnosis:</strong> Right lower-lobe community-acquired pneumonia (J18.1).</p>
            <p className="mt-2"><strong>Clinical Course:</strong> Admitted with fever (39.2 °C), tachypnea (RR 38) and SpO₂ 91 % on room air. CXR confirmed RLL consolidation. Started on IV ceftriaxone 50 mg/kg/day plus oral amoxicillin per Tanzania STG. Responded well within 48 h; transitioned to oral antibiotics on day 4. Nebulised salbutamol PRN. Discharged in stable condition on day 7.</p>
            <p className="mt-2"><strong>Discharge Medications:</strong></p>
            <ul className="list-disc list-inside ml-2">
              <li>Amoxicillin 250 mg PO TDS × 3 more days</li>
              <li>Paracetamol 250 mg PRN for fever</li>
              <li>Salbutamol inhaler 2 puffs PRN</li>
            </ul>
            <p className="mt-2"><strong>Follow-up:</strong> Pediatrics OPD in 7 days. Return immediately if recurrence of fever, worsening cough or breathing difficulty.</p>
          </div>
          <div className="flex gap-2 mt-4">
            <button className="btn-outline text-sm">Regenerate</button>
            <button className="btn-outline text-sm">Edit</button>
            <button className="btn-primary text-sm flex-1">Approve & Sign</button>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            AI-drafted from EMR · final clinical sign-off rests with attending physician · all generations logged.
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-3">Recent Reports</div>
          <div className="space-y-2">
            {[
              { t: "Discharge — Baraka Juma", s: "AI Draft", c: "bg-violet-100 text-violet-700" },
              { t: "Referral — Hassan Mohamed → Oncology", s: "Signed", c: "bg-emerald-100 text-emerald-700" },
              { t: "Medico-Legal — RTA case #1284", s: "Pending Review", c: "bg-amber-100 text-amber-700" },
              { t: "Discharge — Erick Mushi", s: "Signed", c: "bg-emerald-100 text-emerald-700" },
              { t: "Sick Leave Note — Esther Lema", s: "Auto-issued", c: "bg-navy-100 text-navy-700" },
              { t: "Referral — Mary Joseph → Cardiology", s: "AI Draft", c: "bg-violet-100 text-violet-700" },
            ].map((r) => (
              <div key={r.t} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100">
                <I.doc size={16} stroke="#0B1D3A" className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-navy-800 truncate">{r.t}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded ${r.c}`}>{r.s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── PRESCRIPTIONS ────────────────────────────── */

export function PrescriptionsScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="e-Prescriptions" subtitle="Issued · dispensed · refills · controlled substances" actions={<button className="btn-primary text-sm">+ New Rx</button>} />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Issued Today", v: "318" }, { l: "Dispensed", v: "284" },
          { l: "Awaiting Refill", v: "47" }, { l: "Controlled (Sched II–V)", v: "9" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5">Rx #</th>
              <th className="text-left px-4 py-2.5">PATIENT</th>
              <th className="text-left px-4 py-2.5">MEDICATION</th>
              <th className="text-left px-4 py-2.5">DOSAGE</th>
              <th className="text-left px-4 py-2.5">PRESCRIBER</th>
              <th className="text-left px-4 py-2.5">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {[
              { rx: "RX-08821", p: "Amina Hassan", m: "Amoxicillin 500mg", d: "TDS × 7 days", dr: "Dr. Mwangi", s: "Dispensed", c: "emerald" },
              { rx: "RX-08822", p: "Joseph Mwakyusa", m: "Aspirin 75mg + Atorvastatin 40mg", d: "OD lifetime", dr: "Dr. Doe", s: "Dispensed", c: "emerald" },
              { rx: "RX-08823", p: "Hassan Mohamed", m: "Ondansetron 8mg", d: "BD PRN nausea", dr: "Dr. Achieng", s: "Dispensed", c: "emerald" },
              { rx: "RX-08824", p: "Fatuma Ally", m: "Norepinephrine infusion", d: "0.08 mcg/kg/min", dr: "Dr. Mhina", s: "Active (ICU)", c: "rose" },
              { rx: "RX-08825", p: "Baraka Juma", m: "Salbutamol Inhaler", d: "2 puffs PRN", dr: "Dr. Omar", s: "Pending", c: "amber" },
              { rx: "RX-08826", p: "Daniel Kessy", m: "Ibuprofen 400mg + Paracetamol 1g", d: "QDS × 5 days", dr: "Dr. Said", s: "Dispensed", c: "emerald" },
              { rx: "RX-08827", p: "Erick Mushi", m: "Fentanyl patch 25 mcg/h ⚠", d: "Q72h · controlled", dr: "Dr. Mhina", s: "Witnessed Dispense", c: "violet" },
            ].map((r) => (
              <tr key={r.rx} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.rx}</td>
                <td className="px-4 py-3 font-medium text-navy-800">{r.p}</td>
                <td className="px-4 py-3 text-slate-700">{r.m}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{r.d}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{r.dr}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded ${
                    r.c === "emerald" ? "bg-emerald-100 text-emerald-700" :
                    r.c === "amber" ? "bg-amber-100 text-amber-700" :
                    r.c === "rose" ? "bg-rose-100 text-rose-700" : "bg-violet-100 text-violet-700"
                  }`}>{r.s}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────────────── MATERNITY ────────────────────────────── */

export function MaternityScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Maternity & Reproductive Health" subtitle="ANC · Labour ward · PNC · Family planning" />

      <div className="mb-4 grid lg:grid-cols-[1fr_320px] gap-3">
        <OnDutyStrip department="Maternity" />
        <div className="card p-3 flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-slate-500">CHARGE MIDWIFE:</span>
          <StaffChip e={byId("EMP-10023")} sub="Labour Ward" />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "ANC Mothers", v: "412", d: "active book" },
          { l: "In Labour", v: "6", d: "labour ward" },
          { l: "Deliveries (MTD)", v: "184", d: "92% SVD · 7% C/S" },
          { l: "PNC Visits (week)", v: "72", d: "day 7 + day 42" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Labour Ward — Live Partograph Summary</div>
          <div className="space-y-3">
            {[
              { p: "Neema Mwangi", g: "G2P1", ga: "39+4", cx: 7, fhr: 142, st: "Active phase", color: "amber" },
              { p: "Halima Said", g: "G1P0", ga: "40+2", cx: 9, fhr: 138, st: "Transition", color: "rose" },
              { p: "Maria Joseph", g: "G3P2", ga: "38+6", cx: 5, fhr: 146, st: "Active phase", color: "amber" },
              { p: "Asha Ramadhani", g: "G2P1", ga: "41+0", cx: 3, fhr: 140, st: "Latent", color: "emerald" },
              { p: "Mariam Juma", g: "G1P0", ga: "39+0", cx: 10, fhr: 132, st: "Second stage — pushing", color: "rose" },
              { p: "Anna Kileo", g: "G4P3", ga: "37+3", cx: 4, fhr: 148, st: "Latent", color: "emerald" },
            ].map((m) => (
              <div key={m.p} className={`p-4 rounded-lg border ${
                m.color === "rose" ? "bg-rose-50 border-rose-200" :
                m.color === "amber" ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-medium text-navy-800">{m.p}</div>
                  <div className="text-xs text-slate-600">{m.g} · GA {m.ga}</div>
                </div>
                <div className="grid grid-cols-4 gap-3 mt-2 text-xs">
                  <div><span className="text-slate-500">Cervix:</span> <span className="font-semibold text-navy-800">{m.cx} cm</span></div>
                  <div><span className="text-slate-500">FHR:</span> <span className="font-semibold text-navy-800">{m.fhr}</span></div>
                  <div><span className="text-slate-500">Stage:</span> <span className="font-semibold text-navy-800">{m.st}</span></div>
                  <div><span className="text-slate-500">BP:</span> <span className="font-semibold text-navy-800">118/74</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Maternal Indicators (12-mo)</div>
          <LineChart
            data={[
              { m: "May", v: 162 }, { m: "Jun", v: 174 }, { m: "Jul", v: 168 }, { m: "Aug", v: 182 },
              { m: "Sep", v: 195 }, { m: "Oct", v: 188 }, { m: "Nov", v: 201 }, { m: "Dec", v: 215 },
              { m: "Jan", v: 209 }, { m: "Feb", v: 198 }, { m: "Mar", v: 207 }, { m: "Apr", v: 184 },
            ]}
            height={180}
          />
          <div className="text-[11px] text-slate-500 mt-1">Deliveries per month</div>

          <div className="mt-5 space-y-2">
            {[
              { l: "Skilled birth attendance", v: 98 },
              { l: "ANC4+ coverage", v: 84 },
              { l: "Postpartum hemorrhage rate", v: 2.1 },
              { l: "C-section rate", v: 7.4 },
            ].map((r) => (
              <div key={r.l}>
                <div className="flex justify-between text-xs text-slate-600 mb-0.5"><span>{r.l}</span><span>{r.v}%</span></div>
                <ProgressBar value={r.v} color="#7c3aed" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── HR ────────────────────────────── */

export function HRScreen() {
  const [doc, setDoc] = useState<BeyuDoc | null>(null);
  const hrDocs = docsForModule("hr");
  const allStaff = [...byCadre("Executive"), ...byCadre("Doctor"), ...byCadre("Nurse"), ...byCadre("Allied"), ...byCadre("Admin")];
  const expiring = expiringCredentials(90);
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Human Resources" subtitle="Staff registry · credentials · leave · payroll · rosters · integrated across BEYU" actions={<button className="btn-primary text-sm">+ Add Employee</button>} />

      <CredentialAlertBanner />

      <div className="grid md:grid-cols-5 gap-4 mb-6">
        {[
          { l: "Headcount", v: HR_KPIS.headcount.toString(), s: "across all OpCos" },
          { l: "Doctors", v: HR_KPIS.doctors.toString(), s: "incl. specialists" },
          { l: "Nurses", v: HR_KPIS.nurses.toString(), s: "TNMC licensed" },
          { l: "On Duty Now", v: HR_KPIS.onShiftToday.toString(), s: "day shift" },
          { l: "Credentials Expiring", v: HR_KPIS.credentialsExpiring.toString(), s: "next 90 days", c: HR_KPIS.credentialsExpiring > 0 ? "#b45309" : "#0B1D3A" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c || "#0B1D3A" }}>{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 overflow-x-auto">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="font-display text-lg text-navy-800">Staff Directory</div>
            <span className="text-xs text-slate-500">{allStaff.length} employees · live HR service</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">EMPLOYEE</th>
                <th className="text-left px-4 py-2.5">ROLE</th>
                <th className="text-left px-4 py-2.5">DEPT</th>
                <th className="text-left px-4 py-2.5">CREDENTIAL</th>
                <th className="text-left px-4 py-2.5">SHIFT</th>
                <th className="text-left px-4 py-2.5">LEAVE</th>
              </tr>
            </thead>
            <tbody>
              {allStaff.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full text-white flex items-center justify-center text-xs font-semibold" style={{ background: e.avatarColor }}>
                        {e.name.replace(/^Dr\.\s*/, "").split(" ").map(n => n[0]).join("").slice(0,2)}
                      </div>
                      <div>
                        <div className="font-medium text-navy-800">{e.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{e.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-sm">{e.role}</td>
                  <td className="px-4 py-3 text-slate-700 text-sm">{e.department}</td>
                  <td className="px-4 py-3 text-xs">
                    {e.credential ? (
                      <span className={`text-[11px] px-2 py-0.5 rounded ${
                        e.credential.status === "Active" ? "bg-emerald-100 text-emerald-700" :
                        e.credential.status === "Expiring" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                      }`}>{e.credential.type}</span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3"><span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: e.shift === "DAY" ? "#557345" : e.shift === "NIGHT" ? "#1E3A8A" : e.shift === "ON-CALL" ? "#b45309" : "#94a3b8" }}>{e.shift}</span></td>
                  <td className="px-4 py-3 text-xs font-mono">{e.leaveBalance}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="font-display text-lg text-navy-800 mb-3">Workforce Composition</div>
            <BarChart
              data={[
                { name: "Doctors", value: byCadre("Doctor").length },
                { name: "Nurses", value: byCadre("Nurse").length },
                { name: "Allied", value: byCadre("Allied").length },
                { name: "Exec", value: byCadre("Executive").length },
                { name: "Admin", value: byCadre("Admin").length },
              ]}
              height={180}
            />
          </div>
          <div className="card p-5">
            <div className="font-display text-base text-navy-800 mb-2">Credentials Expiring &lt; 90 days</div>
            <div className="space-y-2">
              {expiring.map((e) => (
                <div key={e.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50">
                  <StaffChip e={e} sub={`exp ${e.credential!.expires}`} />
                </div>
              ))}
              {expiring.length === 0 && <div className="text-xs text-slate-400 text-center py-3">All credentials current ✓</div>}
            </div>
          </div>
        </div>
      </div>

      {/* HR Document Library — wired to the unified Document Viewer */}
      <div className="mt-4 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DocList
            docs={hrDocs}
            title="Employment Documents Library"
            subtitle="Templates and signed agreements — click any to read full text"
            onOpen={setDoc}
          />
        </div>
        <div className="space-y-3">
          <div className="card p-5 bg-gradient-to-br from-navy-800 to-navy-900 text-white">
            <div className="text-[11px] tracking-widest text-gold-400">QUICK ACTIONS</div>
            <div className="font-display text-lg mt-1">Onboarding Pack</div>
            <p className="text-xs text-white/70 mt-2">Issue a complete pack to a new hire: Offer Letter + Employee Contract + NDA + IP Assignment + ESOP grant. All e-signed and chain-anchored.</p>
            <button className="btn-gold w-full mt-3 text-xs !py-2">Generate Pack</button>
          </div>
          <div className="card p-5">
            <div className="font-display text-base text-navy-800 mb-2">Compliance Snapshot</div>
            <ul className="text-xs space-y-1.5">
              <li className="flex items-center gap-2"><I.check size={12} stroke="#059669" /> 42 IP Assignments signed (100%)</li>
              <li className="flex items-center gap-2"><I.check size={12} stroke="#059669" /> 38 NDAs current</li>
              <li className="flex items-center gap-2"><I.check size={12} stroke="#059669" /> ESOP grants logged on-chain</li>
              <li className="flex items-center gap-2"><I.warning size={12} stroke="#b45309" /> 14 credentials expire &lt; 90d</li>
            </ul>
          </div>
        </div>
      </div>

      <DocumentViewer doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

/* ────────────────────────────── DAO GOVERNANCE ────────────────────────────── */

export function DAOGovernanceScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="DAO Governance" subtitle="Decentralized Autonomous Organization · proposals · voting · treasury" />

      <div className="mb-4 grid lg:grid-cols-2 gap-3">
        <div className="card p-3 flex items-center gap-4 flex-wrap">
          <span className="text-[10px] tracking-widest text-slate-500">VOTING DELEGATES (CLASS A):</span>
          <StaffChip e={byId("EMP-10001")} sub="55% weight" />
          <StaffChip e={byId("EMP-10002")} sub="CFO" />
          <StaffChip e={byId("EMP-10003")} sub="CMO" />
        </div>
        <div className="card p-3 flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-slate-500">GENERAL COUNSEL (LEGAL OVERSIGHT):</span>
          <StaffChip e={byId("EMP-10041")} sub="reviews every proposal" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-6 lg:col-span-2 bg-gradient-to-br from-violet-900 to-navy-900 text-white">
          <div className="text-[11px] tracking-widest text-gold-400">DAO STATE</div>
          <div className="font-display text-3xl mt-1">BEYU Governance DAO v2</div>
          <p className="text-white/70 text-sm mt-2 max-w-xl">
            On-chain voting layer for the BEYU Holding Company. Tokenized governance rights
            distributed per the Shareholders Agreement, executed transparently via
            BeyuTrustRegistry.sol.
          </p>
          <div className="grid grid-cols-4 gap-3 mt-5">
            {[
              { l: "Governance Tokens", v: "10.0M" },
              { l: "Active Voters", v: "47" },
              { l: "Quorum", v: "33%" },
              { l: "Treasury (USDC)", v: "1.42M" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-white/10 p-3">
                <div className="font-display text-xl text-gold-300">{s.v}</div>
                <div className="text-[10px] tracking-widest text-white/60">{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6 border-rose-200">
          <div className="text-[11px] tracking-widest text-rose-700">EMERGENCY VETO</div>
          <h3 className="font-display text-xl text-navy-800 mt-2">Trustee Override</h3>
          <p className="text-xs text-slate-600 mt-2">
            BEYU Family Trust retains constitutional veto on any DAO proposal touching
            clinical safety, patient consent, or core ownership.
          </p>
          <button className="mt-4 w-full py-3 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 flex items-center justify-center gap-2">
            <I.power size={16} /> Invoke Veto
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Active Proposals</div>
          {[
            { id: "BIP-0042", t: "Onboard Aga Khan Hospital as production tenant", for: 72, against: 8, status: "Voting", end: "in 2d" },
            { id: "BIP-0041", t: "Allocate 200k USDC to Series A bridge", for: 58, against: 22, status: "Voting", end: "in 6h" },
            { id: "BIP-0040", t: "Upgrade BeyuConsent.sol → v1.4", for: 88, against: 2, status: "Voting", end: "in 4d" },
            { id: "BIP-0039", t: "Establish AI Safety sub-committee", for: 94, against: 1, status: "Passed", end: "executed" },
          ].map((p) => {
            const total = p.for + p.against;
            const pct = (p.for / total) * 100;
            return (
              <div key={p.id} className="border-b border-slate-100 py-3 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[11px] text-violet-700">{p.id}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${p.status === "Passed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{p.status} · {p.end}</span>
                </div>
                <div className="text-sm text-navy-800 mb-2">{p.t}</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-rose-200 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] font-mono text-emerald-700">{p.for}</span>
                  <span className="text-[11px] text-slate-400">·</span>
                  <span className="text-[11px] font-mono text-rose-700">{p.against}</span>
                </div>
              </div>
            );
          })}
          <button className="btn-primary w-full mt-4 text-sm">+ Submit Proposal</button>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Treasury Allocation</div>
          <div className="flex items-center gap-4">
            <DonutChart value={1420} max={2000} label="USDC × 1k" color="#7c3aed" />
            <div className="flex-1 space-y-2">
              {[
                { l: "R&D Reserve", v: 38, c: "#0B1D3A" },
                { l: "Operations", v: 24, c: "#D4AF37" },
                { l: "Clinical Grants", v: 18, c: "#557345" },
                { l: "Compliance & Legal", v: 12, c: "#7c3aed" },
                { l: "Buffer", v: 8, c: "#94a3b8" },
              ].map((r) => (
                <div key={r.l}>
                  <div className="flex justify-between text-xs text-slate-600 mb-0.5"><span>{r.l}</span><span>{r.v}%</span></div>
                  <ProgressBar value={r.v} color={r.c} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── SOVEREIGN ENTERPRISE ────────────────────────────── */

export function SovereignEnterpriseScreen() {
  const [doc, setDoc] = useState<BeyuDoc | null>(null);
  const sovDocs = docsForModule("sovereign");
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Sovereign Enterprise" subtitle="Data residency · jurisdictional sovereignty · cross-border interoperability" />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-6 lg:col-span-2 bg-gradient-to-br from-navy-800 to-navy-900 text-white">
          <div className="text-[11px] tracking-widest text-gold-400">SOVEREIGNTY MODEL</div>
          <div className="font-display text-2xl mt-1">Data stays where care is delivered</div>
          <p className="text-white/70 text-sm mt-3 max-w-2xl">
            Each jurisdiction operates an independent BEYU Sovereign Cluster. PHI never crosses
            borders unless the patient explicitly consents on-chain via BeyuConsent.sol. National
            regulators receive their own air-gapped audit ledger.
          </p>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { l: "Sovereign Clusters", v: "4" },
              { l: "Jurisdictions", v: "TZ · KE · UG · RW" },
              { l: "Cross-Border Consents", v: "1,284" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-white/10 p-3">
                <div className="font-display text-xl text-gold-300">{s.v}</div>
                <div className="text-[10px] tracking-widest text-white/60">{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Cluster Health</div>
          {[
            { c: "TZ-Sovereign · Dar es Salaam", up: 99.98 },
            { c: "KE-Sovereign · Nairobi", up: 99.92 },
            { c: "UG-Sovereign · Kampala", up: 99.86 },
            { c: "RW-Sovereign · Kigali", up: 99.94 },
          ].map((r) => (
            <div key={r.c} className="py-2 border-b border-slate-100 last:border-0">
              <div className="flex justify-between text-xs">
                <span className="text-slate-700">{r.c}</span>
                <span className="font-mono text-emerald-700">{r.up}%</span>
              </div>
              <ProgressBar value={r.up} color="#557345" />
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-4">Sovereign Clusters Map</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { c: "Tanzania", flag: "🇹🇿", reg: "MoH · TCRA · DPA", patients: "1.4M", color: "#0B1D3A" },
            { c: "Kenya", flag: "🇰🇪", reg: "MoH · ODPC · NHIF", patients: "620k", color: "#557345" },
            { c: "Uganda", flag: "🇺🇬", reg: "MoH · NITA-U", patients: "240k", color: "#D4AF37" },
            { c: "Rwanda", flag: "🇷🇼", reg: "MoH · RURA", patients: "180k", color: "#7c3aed" },
          ].map((j) => (
            <div key={j.c} className="rounded-xl border-2 border-slate-200 p-5 text-center hover:border-gold-400 transition" style={{ borderTopColor: j.color, borderTopWidth: 4 }}>
              <div className="text-4xl">{j.flag}</div>
              <div className="font-display text-lg text-navy-800 mt-2">{j.c}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{j.reg}</div>
              <div className="mt-3 text-2xl font-display text-navy-800">{j.patients}</div>
              <div className="text-[10px] tracking-widest text-slate-400">PATIENTS</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <DocList
          docs={sovDocs}
          title="Sovereignty & Data Governance Documents"
          subtitle="Privacy Policy governs PHI residency and cross-border transfers across all sovereign clusters"
          onOpen={setDoc}
        />
      </div>

      <DocumentViewer doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

/* EnterpriseHierarchyScreen now lives in ./Hierarchy.tsx for the full 7-layer architecture. */

/* ────────────────────────────── HIVE AI ────────────────────────────── */

export function HiveAIScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="HIVE AI Runtime"
        subtitle="Specialized agents · deterministic orchestration · governance · kill-switch"
        actions={
          <>
            <button className="btn-outline text-sm">Policy Editor</button>
            <button className="text-sm px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700">⚠ Emergency Shutdown</button>
          </>
        }
      />

      <div className="mb-4 grid lg:grid-cols-3 gap-3">
        <div className="card p-3 flex items-center gap-3 lg:col-span-2">
          <span className="text-[10px] tracking-widest text-slate-500">AI SAFETY OFFICER (HUMAN ACCOUNTABLE):</span>
          <StaffChip e={byId("EMP-10003")} sub="Chief Medical Officer · Hive owner" />
          <span className="text-[10px] tracking-widest text-slate-500 ml-3">CTO:</span>
          <StaffChip e={byId("EMP-10004")} sub="Technical lead" />
        </div>
        <div className="card p-3 flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-slate-500">DUAL APPROVAL FOR KILL-SWITCH:</span>
          <span className="text-xs font-semibold text-emerald-700">Achieng + Doe ✓</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Active Agents", v: "12", c: "#0B1D3A" },
          { l: "Decisions / hr", v: "8,412", c: "#7c3aed" },
          { l: "Accepted", v: "94.2%", c: "#557345" },
          { l: "Overridden", v: "1.4%", c: "#b45309" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-3">Agent Fleet</div>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { n: "Clinical Co-Pilot", scope: "Differential · dosing · guidelines", up: 99.9, color: "#0B1D3A" },
              { n: "Dental Imaging AI", scope: "Caries · perio · cephalometric", up: 99.6, color: "#0891b2" },
              { n: "Radiology AI", scope: "CXR · CT · fracture detection", up: 99.4, color: "#7c3aed" },
              { n: "Triage AI", scope: "ESI acuity · queue prioritization", up: 99.8, color: "#dc2626" },
              { n: "Pharmacy AI", scope: "Interactions · allergies · PK/PD", up: 99.7, color: "#D4AF37" },
              { n: "Voice / Ambient AI", scope: "Hands-free notes · dictation", up: 99.2, color: "#557345" },
              { n: "Coding AI (ICD-11)", scope: "Auto-coding · claim optimization", up: 99.9, color: "#b45309" },
              { n: "Workflow AI", scope: "Bed flow · OR turnover · staffing", up: 99.5, color: "#475569" },
              { n: "MPI Reconciler", scope: "Duplicate detection · merging", up: 99.96, color: "#1E3A8A" },
              { n: "Compliance Monitor", scope: "Policy enforcement · audit", up: 100, color: "#0B5345" },
              { n: "NHIF Claims AI", scope: "Eligibility · denial prediction", up: 99.7, color: "#be123c" },
              { n: "Patient Co-Pilot", scope: "Patient app health Q&A", up: 99.5, color: "#7c3aed" },
            ].map((a) => (
              <div key={a.n} className="p-3 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-8 rounded" style={{ background: a.color }} />
                  <div className="flex-1">
                    <div className="font-semibold text-navy-800 text-sm">{a.n}</div>
                    <div className="text-[11px] text-slate-500">{a.scope}</div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-soft" />
                </div>
                <div className="flex items-center gap-2">
                  <ProgressBar value={a.up} color={a.color} />
                  <span className="text-[11px] font-mono text-emerald-700">{a.up}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Hive Policy Stack</div>
          <div className="space-y-2 text-xs">
            {[
              { t: "Human-in-the-loop required for prescribing", on: true },
              { t: "Block PHI in LLM training data", on: true },
              { t: "Require dual sign-off for kill-switch", on: true },
              { t: "Tenant isolation at row level (RLS)", on: true },
              { t: "Log every AI decision to immutable trail", on: true },
              { t: "Patient consent required for cross-tenant share", on: true },
              { t: "Auto-throttle if hallucination rate > 0.5%", on: true },
              { t: "Sandbox new agent versions for 14 days", on: true },
            ].map((p) => (
              <div key={p.t} className="flex items-start gap-2 p-2 rounded hover:bg-slate-50">
                <div className={`w-9 h-5 rounded-full ${p.on ? "bg-emerald-500" : "bg-slate-300"} relative shrink-0 mt-0.5`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${p.on ? "left-4.5 right-0.5" : "left-0.5"}`} style={{ left: p.on ? "18px" : "2px" }} />
                </div>
                <span className="text-slate-700">{p.t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-3">Decision Stream (last 60 s)</div>
        <div className="space-y-1 text-xs font-mono">
          {[
            { t: "14:42:12", a: "triage-ai", d: "ESCALATE", r: "BEYU-100486 → ICU · NEWS 9", s: 0.94, ok: true },
            { t: "14:42:08", a: "coding-ai", d: "SUGGEST_ICD", r: "I21.9 acute MI (BEYU-100483)", s: 0.91, ok: true },
            { t: "14:42:02", a: "pharma-ai", d: "BLOCK_RX", r: "Amoxicillin × penicillin allergy", s: 0.99, ok: true },
            { t: "14:41:55", a: "radiology-ai", d: "FLAG_CRITICAL", r: "Acute SDH right · ST-9821", s: 0.96, ok: true },
            { t: "14:41:48", a: "voice-ai", d: "TRANSCRIBE", r: "Consultation note · 412 words", s: 0.93, ok: true },
            { t: "14:41:40", a: "workflow-ai", d: "REASSIGN_BED", r: "ICU-3 → step-down", s: 0.88, ok: true },
            { t: "14:41:33", a: "clinical-ai", d: "OVERRIDDEN", r: "Sepsis bundle suggestion (Dr. Mhina)", s: 0.86, ok: false },
            { t: "14:41:21", a: "mpi-reconciler", d: "MERGE", r: "BEYU-100501 ⇆ BEYU-099812 sim 0.97", s: 0.97, ok: true },
          ].map((r, i) => (
            <div key={i} className="grid grid-cols-[80px_140px_140px_1fr_60px_50px] gap-2 py-1 border-b border-slate-50">
              <span className="text-slate-500">{r.t}</span>
              <span className="text-navy-800">{r.a}</span>
              <span className="text-violet-700">{r.d}</span>
              <span className="text-slate-600 truncate">{r.r}</span>
              <span className="text-right text-gold-700">{r.s}</span>
              <span className={`text-right ${r.ok ? "text-emerald-600" : "text-amber-600"}`}>{r.ok ? "OK" : "OVR"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── HIS / MTUHA ────────────────────────────── */

export function HISMTUHAScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="HIS / MTUHA Reports"
        subtitle="Tanzania Health Information System · monthly statutory submissions"
        actions={<button className="btn-gold text-sm">⚡ Generate Monthly Pack</button>}
      />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Forms Due", v: "12", d: "this month" },
          { l: "Submitted", v: "9", d: "75% complete" },
          { l: "Pending", v: "3", d: "before 5th" },
          { l: "DHIS2 Sync", v: "OK", d: "last 2h ago" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card overflow-x-auto">
          <div className="px-5 py-3 border-b border-slate-100 font-display text-lg text-navy-800">MTUHA Forms — April 2026</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">FORM</th>
                <th className="text-left px-4 py-2.5">TITLE</th>
                <th className="text-left px-4 py-2.5">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {[
                { id: "MTUHA-1", t: "OPD attendance register", s: "Submitted" },
                { id: "MTUHA-2", t: "IPD admission & discharge", s: "Submitted" },
                { id: "MTUHA-3", t: "Antenatal care register", s: "Submitted" },
                { id: "MTUHA-4", t: "Labour & delivery register", s: "Submitted" },
                { id: "MTUHA-5", t: "Postnatal care register", s: "Pending" },
                { id: "MTUHA-6", t: "Immunization (EPI)", s: "Submitted" },
                { id: "MTUHA-7", t: "Family planning", s: "Submitted" },
                { id: "MTUHA-8", t: "HIV / AIDS care & treatment", s: "Submitted" },
                { id: "MTUHA-9", t: "TB & Leprosy", s: "Pending" },
                { id: "MTUHA-10", t: "Malaria surveillance", s: "Submitted" },
                { id: "MTUHA-11", t: "Notifiable diseases (IDSR)", s: "Submitted" },
                { id: "MTUHA-12", t: "Death notification", s: "Pending" },
              ].map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs text-navy-800">{r.id}</td>
                  <td className="px-4 py-3 text-slate-700 text-sm">{r.t}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${r.s === "Submitted" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{r.s}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="font-display text-lg text-navy-800 mb-3">Notifiable Diseases (IDSR)</div>
            <BarChart
              data={[
                { name: "Malaria", value: 184 },
                { name: "Diarrhea", value: 92 },
                { name: "Pneumonia", value: 64 },
                { name: "TB", value: 18 },
                { name: "Measles", value: 4 },
                { name: "Cholera", value: 0 },
              ]}
              height={200}
            />
          </div>

          <div className="card p-5">
            <div className="font-display text-lg text-navy-800 mb-3">DHIS2 Integration</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">Endpoint</span><span className="font-mono text-navy-800">https://dhis2.moh.go.tz/api</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Auth</span><span className="font-mono text-emerald-600">OAuth2 active</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Last successful push</span><span className="font-mono text-navy-800">2h ago · 184 records</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Pending queue</span><span className="font-mono text-amber-600">0 records</span></div>
            </div>
            <button className="btn-primary w-full mt-3 text-xs !py-2">Force Sync Now</button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <TeamRoster department="Human Resources" title="MTUHA Reporting Officers" max={5} />
      </div>
    </div>
  );
}

/* ────────────────────────────── TENANT MIGRATION ────────────────────────────── */

export function TenantMigrationScreen() {
  const stages = [
    { n: "Discovery", desc: "Source EMR/HMIS profiled", done: 100 },
    { n: "Import", desc: "Connectors pull legacy data", done: 100 },
    { n: "OCR + AI Extract", desc: "Handwritten + scanned records", done: 84 },
    { n: "Cleaning", desc: "Dedup + normalize", done: 62 },
    { n: "FHIR Mapping", desc: "Convert → FHIR R5", done: 48 },
    { n: "Validation Queue", desc: "Human review", done: 24 },
    { n: "Dual-Run Sync", desc: "Shadow writes both EMRs", done: 12 },
    { n: "Go-Live", desc: "Cutover to BEYU Health OS", done: 0 },
  ];

  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Tenant Migration" subtitle="Onboarding hospitals · legacy EMR migration · OCR · FHIR normalization" actions={<button className="btn-primary text-sm">+ New Migration Job</button>} />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Active Migrations", v: "3", d: "tenants" },
          { l: "Records Imported", v: "1.84M", d: "patients + visits" },
          { l: "OCR Pages", v: "412k", d: "handwritten + scanned" },
          { l: "Validation Queue", v: "1,284", d: "awaiting human review" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="card p-5 mb-4">
        <div className="font-display text-lg text-navy-800 mb-1">Active Job — Aga Khan Hospital</div>
        <div className="text-xs text-slate-500 mb-5">Source: legacy OpenMRS + Excel + scanned files · Target: BEYU Health OS</div>
        <div className="grid md:grid-cols-4 lg:grid-cols-8 gap-3">
          {stages.map((s, i) => (
            <div key={s.n} className="text-center">
              <div className="relative">
                <div className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center font-bold text-white ${
                  s.done === 100 ? "bg-emerald-500" : s.done > 0 ? "bg-gold-500" : "bg-slate-300"
                }`}>{s.done === 100 ? <I.check size={20} stroke="#fff" /> : i + 1}</div>
                {i < stages.length - 1 && (
                  <div className="hidden md:block absolute top-7 left-[60%] w-full h-0.5 bg-slate-200">
                    <div className="h-full bg-emerald-400" style={{ width: s.done === 100 ? "100%" : "0" }} />
                  </div>
                )}
              </div>
              <div className="text-xs font-semibold text-navy-800 mt-2">{s.n}</div>
              <div className="text-[10px] text-slate-500">{s.desc}</div>
              <div className="text-[10px] text-gold-700 mt-1">{s.done}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Import Connectors</div>
          <div className="space-y-2">
            {[
              { t: "OpenMRS REST API", n: 412_000, c: "emerald" },
              { t: "Excel / CSV files", n: 84_000, c: "emerald" },
              { t: "Legacy SQL (MySQL 5.7)", n: 612_000, c: "emerald" },
              { t: "Scanned PDFs (OCR)", n: 384_000, c: "amber" },
              { t: "Handwritten records (AI Vision)", n: 184_000, c: "amber" },
              { t: "HL7 v2 messages", n: 142_000, c: "emerald" },
              { t: "FHIR R4 bundles", n: 28_000, c: "emerald" },
            ].map((r) => (
              <div key={r.t} className="flex items-center gap-3 p-2 rounded border border-slate-100">
                <div className={`w-2 h-2 rounded-full ${r.c === "emerald" ? "bg-emerald-500" : "bg-amber-500"}`} />
                <div className="flex-1 text-sm text-navy-800">{r.t}</div>
                <div className="text-xs font-mono text-slate-500">{r.n.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Validation Queue Sample</div>
          <div className="space-y-2">
            {[
              { t: "Possible duplicate: 'A. Hassan' × 'Amina H.' (sim 0.94)", a: "Review merge" },
              { t: "Diagnosis text 'Pn' → ?Pneumonia (J18.9)", a: "Confirm ICD" },
              { t: "Date format ambiguous: 04/05/2024 (DMY vs MDY)", a: "Pick format" },
              { t: "Missing NHIF for visit · auto-skip?", a: "Mark self-pay" },
              { t: "Drug 'Amoxyl' → Amoxicillin", a: "Approve mapping" },
            ].map((q, i) => (
              <div key={i} className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                <I.warning size={16} stroke="#b45309" className="mt-0.5 shrink-0" />
                <div className="flex-1 text-sm text-amber-900">{q.t}</div>
                <button className="text-[11px] font-semibold text-gold-700 hover:underline whitespace-nowrap">{q.a}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── PLANNING & OWNERS ────────────────────────────── */

export function PlanningOwnersScreen() {
  const [doc, setDoc] = useState<BeyuDoc | null>(null);
  const planningDocs = docsForModule("planning");
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Planning & Owners" subtitle="Strategic roadmap · OKRs · ownership ledger · investor materials" />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-3">Strategic Roadmap 2026</div>
          <div className="space-y-3">
            {[
              { q: "Q1", t: "Series A close · 3 new tenants onboarded", done: 100 },
              { q: "Q2", t: "Sovereign Cluster expansion → KE + UG", done: 62 },
              { q: "Q3", t: "Patient mobile app v2 · biometric ID rollout", done: 18 },
              { q: "Q4", t: "Dental AI v3 · Radiology AI EAC certification", done: 4 },
            ].map((r) => (
              <div key={r.q} className="p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 rounded bg-navy-800 text-white text-xs font-bold">{r.q}</span>
                    <span className="text-sm font-medium text-navy-800">{r.t}</span>
                  </div>
                  <span className="text-xs text-slate-500">{r.done}%</span>
                </div>
                <ProgressBar value={r.done} color="#D4AF37" />
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">OKR Health</div>
          <div className="flex items-center gap-4">
            <DonutChart value={78} label="ON TRACK" color="#557345" />
            <div className="flex-1 space-y-2 text-xs">
              <div className="flex justify-between"><span>Total OKRs</span><span className="font-mono text-navy-800">24</span></div>
              <div className="flex justify-between"><span>On Track</span><span className="font-mono text-emerald-600">19</span></div>
              <div className="flex justify-between"><span>At Risk</span><span className="font-mono text-amber-600">4</span></div>
              <div className="flex justify-between"><span>Blocked</span><span className="font-mono text-rose-600">1</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-slate-100 font-display text-lg text-navy-800">Ownership Ledger</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5">OWNER</th>
              <th className="text-left px-4 py-2.5">ENTITY</th>
              <th className="text-left px-4 py-2.5">STAKE</th>
              <th className="text-left px-4 py-2.5">VOTING RIGHTS</th>
              <th className="text-left px-4 py-2.5">CONTACT</th>
            </tr>
          </thead>
          <tbody>
            {[
              { o: "BEYU Family Trust (Founders)", e: "BEYU Holding Co.", s: "55.0%", v: "55.0%", c: "trustees@beyufamilytrust.org" },
              { o: "ESOP Pool", e: "BEYU Holding Co.", s: "15.0%", v: "0.0% (unvested)", c: "esop@beyu.health" },
              { o: "Acumen Fund", e: "BEYU Holding Co.", s: "12.0%", v: "12.0%", c: "ir@acumen.org" },
              { o: "Novastar Ventures", e: "BEYU Holding Co.", s: "8.0%", v: "8.0%", c: "tz@novastarventures.com" },
              { o: "Angel Syndicate (×10)", e: "BEYU Holding Co.", s: "5.0%", v: "5.0%", c: "angels@beyu.health" },
              { o: "Advisors (vested)", e: "BEYU Holding Co.", s: "3.0%", v: "3.0%", c: "advisors@beyu.health" },
            ].map((r) => (
              <tr key={r.o} className="border-b border-slate-100">
                <td className="px-4 py-3 font-medium text-navy-800">{r.o}</td>
                <td className="px-4 py-3 text-slate-700">{r.e}</td>
                <td className="px-4 py-3 font-mono text-sm text-navy-800">{r.s}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.v}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Investor + Governance documents wired to viewer */}
      <div className="mt-4 grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <DocList
            docs={planningDocs}
            title="Investor & Governance Documents"
            subtitle="Pitch deck · financial model · term sheet · SHA · cap table · co-founder exit clause"
            onOpen={setDoc}
          />
        </div>
        <div className="lg:col-span-2 space-y-3">
          <div className="card p-5 bg-gradient-to-br from-violet-900 to-navy-900 text-white">
            <div className="text-[11px] tracking-widest text-gold-400">INVESTOR DATA ROOM</div>
            <div className="font-display text-lg mt-1">Series A · USD 5M @ USD 20M pre</div>
            <p className="text-xs text-white/70 mt-2">
              Lead: Acumen Fund · Co-investor: Novastar Ventures. Term sheet signed by lead, pending counter-sign.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="rounded bg-white/10 py-2">
                <div className="font-display text-base text-gold-300">14</div>
                <div className="text-[9px] text-white/60">deck slides</div>
              </div>
              <div className="rounded bg-white/10 py-2">
                <div className="font-display text-base text-gold-300">5y</div>
                <div className="text-[9px] text-white/60">financial model</div>
              </div>
              <div className="rounded bg-white/10 py-2">
                <div className="font-display text-base text-gold-300">60d</div>
                <div className="text-[9px] text-white/60">exclusivity</div>
              </div>
            </div>
            <button className="btn-gold w-full mt-3 text-xs !py-2">Open Data Room</button>
          </div>
          <div className="card p-5">
            <div className="font-display text-base text-navy-800 mb-2">Cap-Table Integrity</div>
            <ul className="text-xs space-y-1.5">
              <li className="flex items-center gap-2"><I.check size={12} stroke="#059669" /> Cap table on-chain (BeyuCapTable.sol)</li>
              <li className="flex items-center gap-2"><I.check size={12} stroke="#059669" /> SHA v3.0 signed by all classes</li>
              <li className="flex items-center gap-2"><I.check size={12} stroke="#059669" /> Founders Agreement + Exit Clause anchored</li>
              <li className="flex items-center gap-2"><I.check size={12} stroke="#059669" /> ESOP grants tokenized</li>
            </ul>
          </div>
        </div>
      </div>

      <DocumentViewer doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

/* ────────────────────────────── PUBLIC HEALTH ────────────────────────────── */

export function PublicHealthScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Public Health" subtitle="Disease surveillance · outbreak detection · population health" />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Active Alerts", v: "2", d: "epidemiology", c: "#dc2626" },
          { l: "Cases Reported (week)", v: "1,284", d: "↑ 12%", c: "#0B1D3A" },
          { l: "Vaccination Coverage", v: "87%", d: "DPT3 < 1y", c: "#557345" },
          { l: "Sentinel Sites", v: "12", d: "live feed", c: "#7c3aed" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-3">Disease Trends (12-mo)</div>
          <LineChart
            data={[
              { m: "May", v: 412 }, { m: "Jun", v: 384 }, { m: "Jul", v: 462 }, { m: "Aug", v: 528 },
              { m: "Sep", v: 612 }, { m: "Oct", v: 584 }, { m: "Nov", v: 498 }, { m: "Dec", v: 442 },
              { m: "Jan", v: 384 }, { m: "Feb", v: 412 }, { m: "Mar", v: 542 }, { m: "Apr", v: 684 },
            ]}
            height={220}
          />
          <div className="text-xs text-slate-500 mt-1">Malaria cases · Tanzania sentinel network</div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Outbreak Alerts</div>
          <div className="space-y-2">
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
              <div className="text-[10px] tracking-widest text-rose-700">CRITICAL · 2h ago</div>
              <div className="text-sm font-semibold text-rose-900 mt-1">Suspected cholera cluster · Kigamboni</div>
              <div className="text-[11px] text-rose-700 mt-1">7 cases in 48h · stool cultures pending. IDSR notified.</div>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <div className="text-[10px] tracking-widest text-amber-700">WATCH · 1d ago</div>
              <div className="text-sm font-semibold text-amber-900 mt-1">Measles cases rising · Kilimanjaro</div>
              <div className="text-[11px] text-amber-700 mt-1">12 cases in 7d (vs baseline 2). Vaccination drive launched.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-4">Tanzania Regional Heatmap</div>
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-1.5">
          {[
            "Dar es Salaam", "Pwani", "Morogoro", "Tanga", "Kilimanjaro", "Arusha", "Manyara", "Singida",
            "Dodoma", "Iringa", "Mbeya", "Songwe", "Rukwa", "Katavi", "Tabora", "Kigoma",
            "Kagera", "Geita", "Mwanza", "Shinyanga", "Simiyu", "Mara", "Lindi", "Mtwara",
          ].map((r, i) => {
            const intensity = (i * 37) % 100;
            const c = intensity > 70 ? "bg-rose-500" : intensity > 45 ? "bg-amber-500" : intensity > 25 ? "bg-gold-400" : "bg-emerald-300";
            return (
              <div key={r} className={`${c} rounded p-2 text-[10px] text-white text-center cursor-pointer hover:scale-105 transition`} title={`${r}: ${intensity}`}>
                <div className="font-semibold truncate">{r}</div>
                <div className="opacity-80">{intensity}</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-500">
          <span>Low</span>
          <div className="flex gap-1">
            <span className="w-4 h-4 rounded bg-emerald-300" />
            <span className="w-4 h-4 rounded bg-gold-400" />
            <span className="w-4 h-4 rounded bg-amber-500" />
            <span className="w-4 h-4 rounded bg-rose-500" />
          </div>
          <span>High</span>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── RESEARCH & TRIALS ────────────────────────────── */

export function ResearchTrialsScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Research & Clinical Trials" subtitle="IRB · protocols · enrollment · de-identified data exports" actions={<button className="btn-primary text-sm">+ New Study</button>} />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Active Studies", v: "14" },
          { l: "Enrolled Participants", v: "1,284" },
          { l: "IRB-Approved", v: "12" },
          { l: "Publications (12-mo)", v: "9" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {[
          { id: "STUDY-024", t: "AI-Assisted Radiology Triage in Rural Tanzania", pi: "Dr. M. Achieng", phase: "Observational", n: 412, target: 600 },
          { id: "STUDY-025", t: "FOLFOX-6 outcomes in colon CA — East African cohort", pi: "Dr. Achieng", phase: "Phase IV", n: 184, target: 240 },
          { id: "STUDY-026", t: "Pediatric pneumonia STG adherence", pi: "Dr. H. Omar", phase: "Observational", n: 612, target: 800 },
          { id: "STUDY-027", t: "BEYU Dental Imaging AI — validation", pi: "Dr. S. Said", phase: "Validation", n: 84, target: 200 },
        ].map((s) => {
          const pct = (s.n / s.target) * 100;
          return (
            <div key={s.id} className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[11px] text-violet-700">{s.id}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-navy-100 text-navy-700">{s.phase}</span>
              </div>
              <div className="font-semibold text-navy-800">{s.t}</div>
              <div className="text-xs text-slate-500 mt-1">PI: {s.pi}</div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                  <span>Enrollment</span>
                  <span>{s.n.toLocaleString()} / {s.target.toLocaleString()}</span>
                </div>
                <ProgressBar value={pct} color="#7c3aed" />
              </div>
              <div className="flex gap-2 mt-3 text-[11px]">
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">IRB Approved</span>
                <span className="px-2 py-0.5 rounded bg-gold-100 text-gold-800">Consented (e-Consent)</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">De-identified</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
