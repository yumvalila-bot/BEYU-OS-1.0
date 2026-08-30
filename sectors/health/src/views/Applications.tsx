import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, BarChart, DonutChart, ProgressBar } from "../components/Charts";
import { Logo } from "../components/Logo";

/* ═══════════════════════════════════════════════════════════════════════════
   BEYU 5-Application Suite
   ═══════════════════════════════════════════════════════════════════════════ */

type AppId = "citizen" | "clinical" | "diagnostics" | "operations" | "government";

interface AppDef {
  id: AppId;
  num: number;
  name: string;
  tagline: string;
  desc: string;
  color: string;
  accent: string;
  icon: keyof typeof I;
  platforms: string[];
  audience: string;
  users: string;
  features: { name: string; desc: string; icon: keyof typeof I }[];
}

export const APPS: AppDef[] = [
  {
    id: "citizen",
    num: 1,
    name: "BEYU Citizen",
    tagline: "Your health. Your hands.",
    desc: "Patient-facing app for every Tanzanian to own their health journey, from registration to telemedicine.",
    color: "#1E3A8A",
    accent: "#D4AF37",
    icon: "heart",
    platforms: ["Android", "iOS", "Web Portal", "USSD"],
    audience: "Patients & Caregivers",
    users: "2.4M",
    features: [
      { name: "Patient Registration & National Health ID", desc: "Biometric onboarding · NIDA verification · MPI-issued MRN", icon: "user" },
      { name: "Appointments & Queue Management", desc: "Live queues · SMS reminders · reschedule on the fly", icon: "calendar" },
      { name: "Telemedicine", desc: "End-to-end encrypted video · vitals BLE pairing", icon: "phone" },
      { name: "Personal Health Records", desc: "Longitudinal record across every BEYU hospital", icon: "emr" },
      { name: "Laboratory & Imaging Results", desc: "Push notifications · plain-language summaries", icon: "lab" },
      { name: "Prescriptions & Medication Reminders", desc: "e-Rx pickup, refills, adherence nudges", icon: "pill" },
      { name: "Maternal, Child & Vaccination", desc: "ANC tracker · EPI schedule · growth charts", icon: "users" },
      { name: "Mental Health & Wellness", desc: "Self-screening · talk therapy bookings · journaling", icon: "bulb" },
      { name: "Health Wallet & Payments", desc: "M-Pesa · Tigo Pesa · NHIF top-ups", icon: "cash" },
      { name: "Insurance Verification", desc: "Live NHIF eligibility · private cover lookup", icon: "shield" },
      { name: "AI Health Assistant", desc: "Conversational triage · 24/7 in Swahili + English", icon: "brain" },
    ],
  },
  {
    id: "clinical",
    num: 2,
    name: "BEYU Clinical",
    tagline: "The clinician's command line.",
    desc: "Modern clinical workstation for doctors, nurses and specialists across all tenants.",
    color: "#0B1D3A",
    accent: "#D4AF37",
    icon: "emr",
    platforms: ["Web", "Windows", "macOS", "Linux", "iPad", "Android Tablet"],
    audience: "Doctors · Nurses · Specialists",
    users: "8,412",
    features: [
      { name: "Electronic Medical Records (EMR)", desc: "FHIR R5 native · longitudinal patient view", icon: "emr" },
      { name: "Doctor & Nurse Workspaces", desc: "Role-tailored UI · shift handover · task lists", icon: "users" },
      { name: "Clinical Documentation", desc: "Templates · voice-AI ambient notes · attestation", icon: "doc" },
      { name: "Orders & Prescriptions (CPOE)", desc: "Labs · imaging · meds · diet · activity", icon: "pill" },
      { name: "Clinical Decision Support", desc: "Hive Co-Pilot · guidelines · dosing · interactions", icon: "brain" },
      { name: "Referrals & Care Coordination", desc: "Cross-tenant referral · consent-gated transfer", icon: "arrow" },
      { name: "Teleconsultations", desc: "Embedded video · auto note transcription", icon: "phone" },
      { name: "Emergency & Triage Management", desc: "ESI triage · trauma activation · trauma scoring", icon: "zap" },
      { name: "Inpatient & Outpatient Care", desc: "OPD · IPD · ICU · day-care unified workflow", icon: "building" },
      { name: "Specialist Workflows", desc: "Cardio · Oncology · Dental · Peds · OB/GYN", icon: "heart" },
    ],
  },
  {
    id: "diagnostics",
    num: 3,
    name: "BEYU Diagnostics & Pharmacy",
    tagline: "Every test. Every script. One platform.",
    desc: "Unified LIS, RIS/PACS, pharmacy and optical workflows with AI assistance.",
    color: "#7c3aed",
    accent: "#D4AF37",
    icon: "lab",
    platforms: ["Web", "Windows", "macOS", "Android Tablet", "Analyzer interfaces"],
    audience: "Lab Techs · Radiographers · Pharmacists · Optometrists",
    users: "1,284",
    features: [
      { name: "Laboratory Services", desc: "Order entry · barcoded specimens · analyzer interfaces · QC", icon: "lab" },
      { name: "Radiology & Imaging", desc: "RIS worklist · DICOM viewer · AI triage · structured reports", icon: "monitor" },
      { name: "Pharmacy Services", desc: "Dispensing · counselling · interactions · controlled-substance log", icon: "pill" },
      { name: "Optometry & Optical Services", desc: "Refraction · contact lens fitting · eye-exam history", icon: "scan" },
      { name: "Optometric Investigations", desc: "OCT · Visual Fields · Tonometry · Fundus imaging", icon: "monitor" },
      { name: "Optical Shop & Dispensing", desc: "Frames · lenses · prescription glazing · POS", icon: "bill" },
      { name: "Diagnostic Inventory", desc: "Reagent levels · expiry · cold-chain monitoring", icon: "database" },
      { name: "Quality Control", desc: "Westgard rules · Levey-Jennings charts · audit-ready", icon: "shield" },
      { name: "Diagnostic Analytics", desc: "TAT · positivity · panel utilization · revenue", icon: "analytics" },
    ],
  },
  {
    id: "operations",
    num: 4,
    name: "BEYU Operations & Payer",
    tagline: "Hospitals run on this.",
    desc: "Back-office for hospital admin, HR, payroll, billing, claims, procurement and analytics.",
    color: "#0d9488",
    accent: "#D4AF37",
    icon: "settings",
    platforms: ["Web", "Windows", "macOS", "Linux", "Android (ESS app)", "iOS (ESS app)"],
    audience: "Admin · HR · Finance · Procurement",
    users: "4,212",
    features: [
      { name: "Hospital Administration", desc: "Multi-site ops · facility config · roles & permissions", icon: "building" },
      { name: "Human Resources", desc: "Registry · credentialing · onboarding · separations", icon: "users" },
      { name: "Employee Self-Service (ESS)", desc: "Profile · payslips · leave · benefits · directory", icon: "user" },
      { name: "Biometric Attendance & Clock-In", desc: "Fingerprint · face · geo-fenced mobile clock-in", icon: "fingerprint" },
      { name: "Payroll & E-Payslips", desc: "NSSF · PSSSF · PAYE · SDL · WCF · monthly remittance", icon: "cash" },
      { name: "Leave & Shift Management", desc: "Roster builder · swap requests · approval chain", icon: "calendar" },
      { name: "Training & CPD", desc: "Course catalogue · CPD points tracker · certificates", icon: "bulb" },
      { name: "Team Directory & Comms", desc: "Org chart · in-app messaging · announcements", icon: "message" },
      { name: "Billing & Revenue Cycle", desc: "Charge capture · invoicing · cashier · receipts", icon: "bill" },
      { name: "Insurance & Claims", desc: "NHIF · Jubilee · AAR · denial mgmt · auto-resubmit", icon: "shield" },
      { name: "Procurement & Supply Chain", desc: "Suppliers · RFQ · PO · GRN · 3-way match", icon: "truck" },
      { name: "Asset & Equipment", desc: "Registry · maintenance · depreciation · QR tagging", icon: "database" },
      { name: "Operational Analytics", desc: "KPI dashboards · benchmarks · forecast", icon: "analytics" },
    ],
  },
  {
    id: "government",
    num: 5,
    name: "BEYU Government",
    tagline: "Healthcare for the Republic.",
    desc: "Ministry-grade health intelligence: surveillance, registries, licensing, workforce planning and policy.",
    color: "#be123c",
    accent: "#D4AF37",
    icon: "globe",
    platforms: ["Web", "Windows", "Mobile (read-only)", "Air-gapped instance available"],
    audience: "MoH · TCRA · NHIF · IDSR · Regional Health Officers",
    users: "284",
    features: [
      { name: "Ministry of Health Dashboard", desc: "National KPIs · facility tiers · indicator drilldowns", icon: "dashboard" },
      { name: "Public Health Surveillance", desc: "Notifiable diseases · cluster detection · alerting", icon: "shield" },
      { name: "Disease & Outbreak Monitoring", desc: "Cholera · TB · malaria · measles real-time tracking", icon: "warning" },
      { name: "National Health Registry", desc: "Unique citizen MRN · longitudinal record · MPI", icon: "database" },
      { name: "Facility & Provider Licensing", desc: "Accreditation · inspections · facility tier renewals", icon: "building" },
      { name: "Population Health Analytics", desc: "Region heatmaps · demographics · disease burden", icon: "analytics" },
      { name: "Workforce Planning", desc: "Density per 10k · gap analysis · deployment planning", icon: "users" },
      { name: "Resource Planning", desc: "Beds · ventilators · cold chain · O₂ · ambulance fleet", icon: "truck" },
      { name: "Emergency Operations Centre", desc: "EOC activation · ICS dashboard · resource dispatch", icon: "zap" },
      { name: "Research & Innovation", desc: "Trials registry · grants · de-identified datasets", icon: "flask" },
      { name: "National AI Health Intelligence", desc: "Forecasting · anomaly detection · scenario modelling", icon: "brain" },
      { name: "Policy & Strategic Planning", desc: "Drafting · stakeholder consultation · KPI alignment", icon: "doc" },
    ],
  },
];

/* ─────────────────────────── Apps Hub Screen ─────────────────────────── */

export function AppsHubScreen({ onOpen }: { onOpen: (id: AppId) => void }) {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="BEYU Application Suite"
        subtitle="5 specialized applications · one unified platform · every role, every device"
        actions={
          <>
            <button className="btn-outline text-sm">Distribution</button>
            <button className="btn-primary text-sm">Download SDK</button>
          </>
        }
      />

      {/* HERO */}
      <div className="card p-6 mb-6 bg-gradient-to-br from-navy-900 via-navy-800 to-violet-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-dot opacity-20" />
        <div className="relative grid lg:grid-cols-3 gap-6 items-center">
          <div className="lg:col-span-2">
            <div className="text-[11px] tracking-[0.3em] text-gold-400 font-semibold">BEYU APPLICATIONS · v2026.4</div>
            <h2 className="font-display text-3xl lg:text-4xl mt-2">
              From the citizen on the street <br />to the <span className="text-gold-400">Ministry of Health</span>
            </h2>
            <p className="text-white/70 mt-3 max-w-xl text-sm">
              Five applications built on the same BEYU Health OS core. One identity, one MRN, one consent
              ledger — federated across patients, clinicians, diagnostics, operations and government.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              {["Android", "iOS", "Web", "Windows", "macOS", "Linux", "Offline-first", "Swahili + English"].map((p) => (
                <span key={p} className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">{p}</span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "Apps", v: "5" },
              { l: "Active Users", v: "2.4M+" },
              { l: "Platforms", v: "6" },
              { l: "Languages", v: "EN · SW · FR" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-white/10 border border-white/15 px-3 py-3 text-center">
                <div className="font-display text-xl text-gold-300">{s.v}</div>
                <div className="text-[10px] tracking-widest text-white/60 mt-0.5">{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* App Grid */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {APPS.map((app) => {
          const Ico = I[app.icon];
          return (
            <button
              key={app.id}
              onClick={() => onOpen(app.id)}
              className="card text-left overflow-hidden hover:-translate-y-1 transition group"
              style={{ borderTopColor: app.color, borderTopWidth: 4 }}
            >
              <div className="p-6 relative">
                <div className="absolute top-4 right-4">
                  <span className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-bold tracking-widest">APP {app.num}</span>
                </div>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: `linear-gradient(135deg, ${app.color}, ${app.color}dd)` }}>
                    <Ico size={26} stroke={app.accent} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-xl text-navy-800">{app.name}</div>
                    <div className="text-xs text-gold-700 italic mt-0.5">{app.tagline}</div>
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">{app.desc}</p>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className="rounded bg-slate-50 p-2 text-center">
                    <div className="font-display text-base text-navy-800">{app.users}</div>
                    <div className="text-[9px] tracking-widest text-slate-500">USERS</div>
                  </div>
                  <div className="rounded bg-slate-50 p-2 text-center">
                    <div className="font-display text-base text-navy-800">{app.features.length}</div>
                    <div className="text-[9px] tracking-widest text-slate-500">FEATURES</div>
                  </div>
                  <div className="rounded bg-slate-50 p-2 text-center">
                    <div className="font-display text-base text-navy-800">{app.platforms.length}</div>
                    <div className="text-[9px] tracking-widest text-slate-500">PLATFORMS</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {app.platforms.slice(0, 4).map((p) => (
                    <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-navy-50 text-navy-700">{p}</span>
                  ))}
                  {app.platforms.length > 4 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">+{app.platforms.length - 4}</span>}
                </div>

                <div className="mt-4 text-xs text-gold-700 font-semibold group-hover:underline">Open app dashboard →</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Shared Foundation */}
      <div className="card p-6 bg-gradient-to-r from-slate-50 to-navy-50">
        <div className="text-center mb-4">
          <div className="text-[10px] tracking-[0.3em] text-gold-700 font-semibold">SHARED FOUNDATION</div>
          <div className="font-display text-xl text-navy-800 mt-1">All 5 apps speak the same language</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { l: "Master Patient Index", i: "users" },
            { l: "Unified RBAC", i: "lock" },
            { l: "HIVE AI Runtime", i: "brain" },
            { l: "FHIR R5 / HL7 v2", i: "globe" },
            { l: "Consent Ledger", i: "shield" },
            { l: "Audit Trail", i: "doc" },
            { l: "Smart Contracts", i: "zap" },
            { l: "Multi-Tenant DB", i: "database" },
            { l: "Sovereign Cluster", i: "cloud" },
            { l: "Tanzania-Native Stack", i: "star" },
            { l: "Offline-First Sync", i: "device" },
            { l: "Bilingual UI", i: "message" },
          ].map((f) => {
            const Ico = I[f.i as keyof typeof I];
            return (
              <div key={f.l} className="rounded-lg bg-white border border-slate-200 p-3 text-center">
                <Ico size={18} stroke="#D4AF37" className="mx-auto mb-1" />
                <div className="text-[11px] font-medium text-navy-800">{f.l}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Generic App Detail Screen ─────────────────────────── */

export function AppDetailScreen({ id, onBack }: { id: AppId; onBack: () => void }) {
  const app = APPS.find((a) => a.id === id) || APPS[0];
  const Ico = I[app.icon];

  return (
    <div className="p-6 lg:p-8">
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-navy-700 mb-4 flex items-center gap-1">
        ← Back to Applications
      </button>

      {/* App Hero */}
      <div className="card overflow-hidden mb-6" style={{ borderTopColor: app.color, borderTopWidth: 6 }}>
        <div className="p-6 lg:p-8 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${app.color}, ${app.color}dd)` }}>
          <div className="absolute inset-0 bg-dot opacity-15" />
          <div className="relative flex flex-col lg:flex-row gap-6 items-start">
            <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Ico size={40} stroke={app.accent} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] tracking-[0.3em] text-gold-300 font-semibold">APP {app.num} · BEYU APPLICATION SUITE</div>
              <h1 className="font-display text-3xl lg:text-4xl mt-2">{app.name}</h1>
              <div className="text-lg text-white/85 italic mt-1">{app.tagline}</div>
              <p className="text-white/70 mt-3 max-w-2xl text-sm">{app.desc}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                <span className="text-xs px-2 py-1 rounded bg-white/15 border border-white/20">{app.audience}</span>
                <span className="text-xs px-2 py-1 rounded bg-white/15 border border-white/20">{app.users} active users</span>
              </div>
            </div>
            <div className="text-right">
              <Logo variant="mark" size={56} />
            </div>
          </div>
        </div>
      </div>

      {/* App-specific dashboard */}
      {id === "citizen" && <CitizenAppDashboard />}
      {id === "clinical" && <ClinicalAppDashboard />}
      {id === "diagnostics" && <DiagnosticsAppDashboard />}
      {id === "operations" && <OperationsAppDashboard />}
      {id === "government" && <GovernmentAppDashboard />}

      {/* Feature List */}
      <div className="card p-6 mt-6">
        <div className="font-display text-xl text-navy-800 mb-1">Full Feature Catalogue</div>
        <div className="text-xs text-slate-500 mb-5">{app.features.length} features · all powered by the shared BEYU Health OS core</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {app.features.map((f) => {
            const FIco = I[f.icon];
            return (
              <div key={f.name} className="p-4 rounded-xl border border-slate-200 hover:border-gold-300 transition">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${app.color}15` }}>
                    <FIco size={16} stroke={app.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-navy-800">{f.name}</div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{f.desc}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Platforms strip */}
      <div className="card p-5 mt-4">
        <div className="text-[10px] tracking-[0.3em] text-gold-700 font-semibold mb-3">AVAILABLE ON</div>
        <div className="flex flex-wrap gap-2">
          {app.platforms.map((p) => (
            <div key={p} className="px-4 py-2 rounded-lg bg-navy-800 text-white text-sm flex items-center gap-2">
              <I.device size={14} stroke="#D4AF37" /> {p}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   APP-SPECIFIC DASHBOARDS
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── 1. Citizen App Dashboard ─── */
function CitizenAppDashboard() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Registered Citizens", v: "2.41M", d: "+18k this week" },
          { l: "Active (30d)", v: "1.62M", d: "67% MAU" },
          { l: "Telemed Sessions", v: "84k", d: "MTD" },
          { l: "Adherence Score", v: "78%", d: "med reminders" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-2xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-emerald-600 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-3">Citizen App — Mobile Mock</div>
          <div className="grid md:grid-cols-3 gap-3">
            <MobileMock title="Home" accent="#1E3A8A">
              <div className="text-xs text-white/80 mb-2">Habari, Neema</div>
              <div className="rounded-lg bg-white/15 p-3 mb-2">
                <div className="text-[10px] text-gold-300">UNIFIED HEALTH ID</div>
                <div className="font-mono text-sm">BEYU-100484</div>
              </div>
              <div className="space-y-1">
                {["My Records", "Appointments", "Telemedicine", "Pharmacy", "AI Assistant"].map((m) => (
                  <div key={m} className="rounded bg-white/10 px-2 py-1.5 text-xs flex items-center justify-between">
                    {m} <span>›</span>
                  </div>
                ))}
              </div>
            </MobileMock>
            <MobileMock title="AI Assistant" accent="#7c3aed">
              <div className="rounded-lg bg-white/10 p-2 text-[10px] mb-2">"Niko na maumivu ya kichwa..."</div>
              <div className="rounded-lg bg-gold-500 text-navy-900 p-2 text-[10px] mb-2 font-semibold">Pole sana. Kichwa kinakuuma kwa muda gani?</div>
              <div className="rounded-lg bg-white/10 p-2 text-[10px] mb-2">"Siku 2 sasa"</div>
              <div className="rounded-lg bg-gold-500 text-navy-900 p-2 text-[10px] font-semibold">Tunaweza panga miadi na daktari sasa hivi.</div>
            </MobileMock>
            <MobileMock title="My Vitals" accent="#dc2626">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { l: "BP", v: "118/76" },
                  { l: "HR", v: "82" },
                  { l: "SpO₂", v: "98%" },
                  { l: "Temp", v: "36.7" },
                ].map((v) => (
                  <div key={v.l} className="rounded bg-white/10 p-2 text-center">
                    <div className="text-[9px] text-white/60">{v.l}</div>
                    <div className="text-sm font-semibold">{v.v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 rounded bg-emerald-500/30 p-2 text-[10px] text-center">All normal ✓</div>
            </MobileMock>
          </div>
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Top Citizen Actions (24h)</div>
          <BarChart
            data={[
              { name: "Book Appt", value: 2840 },
              { name: "View Results", value: 1842 },
              { name: "Refill Rx", value: 1240 },
              { name: "AI Triage", value: 920 },
              { name: "Telemed", value: 412 },
              { name: "Pay Bill", value: 318 },
            ]}
            height={220}
          />
        </div>
      </div>
    </>
  );
}

/* ─── 2. Clinical App Dashboard ─── */
function ClinicalAppDashboard() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Active Clinicians", v: "8,412", d: "across 5 tenants" },
          { l: "Encounters Today", v: "12,840" },
          { l: "AI Suggestions", v: "1,284", d: "94% accepted" },
          { l: "Avg Note Time", v: "−42%", d: "vs paper baseline" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-2xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-emerald-600 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-3">Clinical Workflows Live</div>
          <div className="space-y-2">
            {[
              { w: "OPD Consultation", n: 412, pct: 92 },
              { w: "IPD Round", n: 184, pct: 78 },
              { w: "Emergency Triage", n: 42, pct: 86 },
              { w: "Theatre Case", n: 18, pct: 95 },
              { w: "ICU Bedside", n: 24, pct: 88 },
              { w: "Teleconsultation", n: 96, pct: 82 },
            ].map((r) => (
              <div key={r.w} className="p-3 rounded border border-slate-200">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-navy-800">{r.w}</span>
                  <span className="text-slate-500">{r.n} active · {r.pct}% AI-assisted</span>
                </div>
                <ProgressBar value={r.pct} color="#0B1D3A" />
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Clinical Quality Score</div>
          <div className="flex justify-center">
            <DonutChart value={94} label="QUALITY" />
          </div>
          <div className="mt-3 space-y-1.5 text-xs">
            {[
              { l: "Note completion (24h)", v: 96 },
              { l: "Hand-hygiene compliance", v: 92 },
              { l: "SOP adherence", v: 94 },
              { l: "Patient satisfaction", v: 91 },
            ].map((r) => (
              <div key={r.l} className="flex justify-between">
                <span className="text-slate-600">{r.l}</span>
                <span className="font-mono text-navy-800">{r.v}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── 3. Diagnostics & Pharmacy Dashboard ─── */
function DiagnosticsAppDashboard() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Lab Orders Today", v: "1,842" },
          { l: "Imaging Studies", v: "412" },
          { l: "Rx Dispensed", v: "2,184" },
          { l: "Optical Exams", v: "62" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-2xl text-navy-800 mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Laboratory · TAT</div>
          <LineChart
            data={[
              { m: "Mon", v: 62 }, { m: "Tue", v: 58 }, { m: "Wed", v: 54 },
              { m: "Thu", v: 49 }, { m: "Fri", v: 47 }, { m: "Sat", v: 52 }, { m: "Sun", v: 48 },
            ]}
            height={160} color="#7c3aed"
          />
          <div className="text-[11px] text-slate-500 mt-1">Median turnaround in minutes</div>
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Radiology AI Triage</div>
          <BarChart
            data={[
              { name: "CXR", value: 184 },
              { name: "CT Head", value: 62 },
              { name: "MRI", value: 24 },
              { name: "US", value: 96 },
              { name: "Mammo", value: 18 },
              { name: "Dental", value: 28 },
            ]}
            height={160}
          />
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Optometry Suite</div>
          <div className="space-y-1.5 text-xs">
            {[
              { l: "Refraction", v: 38 },
              { l: "OCT scans", v: 18 },
              { l: "Visual fields", v: 12 },
              { l: "Tonometry", v: 42 },
              { l: "Fundus imaging", v: 24 },
              { l: "Optical shop sales", v: 18 },
            ].map((r) => (
              <div key={r.l} className="flex justify-between p-1.5 rounded hover:bg-slate-50">
                <span className="text-slate-600">{r.l}</span>
                <span className="font-mono text-navy-800">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-3">Pharmacy · Top Dispensed Today</div>
        <BarChart
          data={[
            { name: "Paracetamol", value: 412 },
            { name: "Amoxicillin", value: 184 },
            { name: "Metformin", value: 142 },
            { name: "ORS Sachets", value: 96 },
            { name: "Salbutamol", value: 62 },
            { name: "Insulin", value: 48 },
            { name: "Atorvastatin", value: 42 },
            { name: "Ceftriaxone", value: 38 },
          ]}
          height={200}
        />
      </div>
    </>
  );
}

/* ─── 4. Operations & Payer Dashboard ─── */
function OperationsAppDashboard() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Active Employees", v: "4,212" },
          { l: "Clocked In Today", v: "3,184", d: "biometric verified" },
          { l: "Payroll (MTD)", v: "TZS 842M" },
          { l: "Claims Submitted", v: "1,842", d: "92.4% success" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-2xl text-navy-800 mt-1">{k.v}</div>
            {k.d && <div className="text-[11px] text-emerald-600 mt-1">{k.d}</div>}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Employee Self-Service · Today</div>
          <div className="space-y-2">
            {[
              { l: "Payslips downloaded", v: 642, c: "#0B1D3A" },
              { l: "Leave requests submitted", v: 28, c: "#7c3aed" },
              { l: "Shift swap approvals", v: 14, c: "#D4AF37" },
              { l: "CPD courses started", v: 84, c: "#557345" },
              { l: "Directory lookups", v: 1284, c: "#0891b2" },
            ].map((r) => (
              <div key={r.l} className="flex items-center gap-3">
                <span className="w-2 h-7 rounded" style={{ background: r.c }} />
                <span className="flex-1 text-sm text-slate-700">{r.l}</span>
                <span className="font-mono text-navy-800 font-semibold">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Claims Pipeline</div>
          <div className="space-y-2">
            {[
              { stage: "Drafted", n: 248, c: "bg-slate-300" },
              { stage: "Submitted", n: 412, c: "bg-navy-500" },
              { stage: "Under Review", n: 184, c: "bg-gold-500" },
              { stage: "Approved", n: 842, c: "bg-emerald-500" },
              { stage: "Paid", n: 612, c: "bg-emerald-600" },
              { stage: "Denied (resubmit)", n: 42, c: "bg-rose-500" },
            ].map((s) => (
              <div key={s.stage} className="flex items-center gap-3 p-2 rounded border border-slate-100">
                <span className={`w-2 h-6 rounded ${s.c}`} />
                <span className="flex-1 text-sm text-navy-800">{s.stage}</span>
                <span className="font-mono text-sm">{s.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-2">Operational Analytics</div>
        <LineChart
          data={[
            { m: "Nov", v: 642 }, { m: "Dec", v: 712 }, { m: "Jan", v: 684 },
            { m: "Feb", v: 752 }, { m: "Mar", v: 812 }, { m: "Apr", v: 842 },
          ]}
          height={200} color="#0d9488"
        />
        <div className="text-[11px] text-slate-500 mt-1">Monthly invoice volume (×1k)</div>
      </div>
    </>
  );
}

/* ─── 5. Government Dashboard ─── */
function GovernmentAppDashboard() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Citizens in Registry", v: "2.41M" },
          { l: "Licensed Facilities", v: "8,412" },
          { l: "Health Workers", v: "84.2k" },
          { l: "Active Outbreaks", v: "2", c: "#dc2626" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-2xl mt-1" style={{ color: k.c || "#0B1D3A" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-2">National Disease Surveillance (12-mo)</div>
          <LineChart
            data={[
              { m: "May", v: 412 }, { m: "Jun", v: 384 }, { m: "Jul", v: 462 }, { m: "Aug", v: 528 },
              { m: "Sep", v: 612 }, { m: "Oct", v: 584 }, { m: "Nov", v: 498 }, { m: "Dec", v: 442 },
              { m: "Jan", v: 384 }, { m: "Feb", v: 412 }, { m: "Mar", v: 542 }, { m: "Apr", v: 684 },
            ]}
            height={220} color="#be123c"
          />
          <div className="text-[11px] text-slate-500 mt-1">Notifiable disease case count · sentinel network</div>
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Active Emergency Operations</div>
          <div className="space-y-2">
            <div className="rounded-lg bg-rose-50 border border-rose-300 p-3">
              <div className="text-[10px] tracking-widest text-rose-700">EOC ACTIVATED</div>
              <div className="font-semibold text-rose-900 mt-1">Cholera response · Kigamboni</div>
              <div className="text-[11px] text-rose-700 mt-1">7 cases · 2 deaths · WASH team dispatched</div>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-300 p-3">
              <div className="text-[10px] tracking-widest text-amber-700">WATCH</div>
              <div className="font-semibold text-amber-900 mt-1">Measles · Kilimanjaro</div>
              <div className="text-[11px] text-amber-700 mt-1">12 cases · vaccination campaign launched</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-4">Tanzania Health Workforce Density (per 10,000)</div>
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-1.5">
          {[
            "Dar es Salaam", "Pwani", "Morogoro", "Tanga", "Kilimanjaro", "Arusha", "Manyara", "Singida",
            "Dodoma", "Iringa", "Mbeya", "Songwe", "Rukwa", "Katavi", "Tabora", "Kigoma",
            "Kagera", "Geita", "Mwanza", "Shinyanga", "Simiyu", "Mara", "Lindi", "Mtwara",
          ].map((r, i) => {
            const density = 5 + ((i * 17) % 35);
            const c = density > 30 ? "bg-emerald-500" : density > 20 ? "bg-gold-400" : density > 12 ? "bg-amber-500" : "bg-rose-500";
            return (
              <div key={r} className={`${c} rounded p-2 text-[10px] text-white text-center cursor-pointer hover:scale-105 transition`}>
                <div className="font-semibold truncate">{r}</div>
                <div className="opacity-90">{density}</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
          <span>WHO threshold: ≥ 22.8 per 10k</span>
          <div className="flex gap-1 items-center">
            <span>Under-served</span>
            <span className="w-4 h-4 rounded bg-rose-500" />
            <span className="w-4 h-4 rounded bg-amber-500" />
            <span className="w-4 h-4 rounded bg-gold-400" />
            <span className="w-4 h-4 rounded bg-emerald-500" />
            <span>Well-served</span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── Mobile Mock Component ─────────────────────────── */

function MobileMock({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="relative mx-auto" style={{ maxWidth: 200 }}>
      <div className="rounded-[24px] overflow-hidden text-white shadow-lg" style={{ background: `linear-gradient(180deg, ${accent}, ${accent}cc)` }}>
        <div className="px-3 py-2 flex items-center justify-between text-[9px] font-mono">
          <span>9:41</span>
          <span>● BEYU</span>
        </div>
        <div className="px-3 pb-3">
          <div className="text-[10px] tracking-widest text-gold-300 mb-1">{title.toUpperCase()}</div>
          {children}
        </div>
        <div className="h-1 mx-auto w-12 rounded-full bg-white/40 mb-1.5" />
      </div>
    </div>
  );
}

/* ─────────────────────────── Wrapper Screen with State ─────────────────────────── */

export function ApplicationsScreen() {
  const [active, setActive] = useState<AppId | null>(null);
  if (active) return <AppDetailScreen id={active} onBack={() => setActive(null)} />;
  return <AppsHubScreen onOpen={setActive} />;
}
