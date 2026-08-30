import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, BarChart, DonutChart, Sparkline, ProgressBar } from "../components/Charts";
import {
  KPIS_CEO, REVENUE_SERIES, TOP_SERVICES, ACTIVITIES, NOTIFICATIONS,
  PATIENTS, APPOINTMENTS, TENANTS, MODULES,
} from "../data/mock";
import { OnDutyStrip, TeamRoster, StaffChip, WitnessRequired, CredentialAlertBanner } from "../components/HRWidgets";
import { byId, HR_KPIS } from "../services/hr";
import { Classification, Guard } from "../components/Security";
import { PriorityBadge } from "../components/Flow";

/* ─────────────────────────── CEO / Executive ─────────────────────────── */

export function CEODashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Executive Command Center"
        subtitle="Strategic oversight across all hospitals · BEYU Operations Company"
        actions={
          <>
            <button className="btn-outline text-sm">Export Report</button>
            <button className="btn-primary text-sm">New Initiative</button>
          </>
        }
      />

      <CredentialAlertBanner />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        {KPIS_CEO.map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-[11px] text-slate-500">{k.label}</div>
            <div className="font-display text-2xl text-navy-800 mt-1">{k.value}</div>
            <div className={`text-[11px] mt-1 flex items-center gap-1 ${k.positive ? "text-emerald-600" : "text-rose-600"}`}>
              {k.delta} <span className="text-slate-400">vs last month</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-display text-lg text-navy-800">Revenue Overview</div>
              <div className="text-xs text-slate-500">12-month rolling · TZS (millions)</div>
            </div>
            <select className="text-xs border border-slate-200 rounded-lg px-2 py-1.5">
              <option>This Year</option><option>Last Year</option>
            </select>
          </div>
          <LineChart data={REVENUE_SERIES} height={240} />
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-1">Recent Activities</div>
          <div className="text-xs text-slate-500 mb-3">Live event stream from Hive Runtime</div>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {ACTIVITIES.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-2 h-2 mt-1.5 rounded-full ${
                  a.type === "ok" ? "bg-emerald-500" :
                  a.type === "warn" ? "bg-amber-500" :
                  a.type === "ai" ? "bg-gold-500" : "bg-navy-500"
                }`} />
                <div className="flex-1">
                  <div className="text-sm text-navy-800">{a.what}</div>
                  <div className="text-[11px] text-slate-500">{a.who} · {a.when}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800">Clinic Performance</div>
          <div className="text-xs text-slate-500 mb-4">Composite quality index</div>
          <div className="flex items-center gap-4">
            <DonutChart value={85} label="OVERALL" />
            <div className="space-y-2 flex-1">
              {[
                { l: "Patient Satisfaction", v: 90, c: "#0B1D3A" },
                { l: "Operational Efficiency", v: 82, c: "#D4AF37" },
                { l: "Claim Success Rate", v: 92, c: "#557345" },
                { l: "Financial Health", v: 87, c: "#1E3A8A" },
              ].map((r) => (
                <div key={r.l}>
                  <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                    <span>{r.l}</span><span>{r.v}%</span>
                  </div>
                  <ProgressBar value={r.v} color={r.c} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-display text-lg text-navy-800">Top Services by Volume</div>
              <div className="text-xs text-slate-500">Encounters this month</div>
            </div>
          </div>
          <BarChart data={TOP_SERVICES} height={230} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { i: "building", t: "Tenants Online", v: `${TENANTS.length}/${TENANTS.length}`, s: "Strict isolation enforced" },
          { i: "users", t: "Workforce On Duty", v: `${HR_KPIS.onShiftToday}/${HR_KPIS.headcount}`, s: `${HR_KPIS.doctors} doctors · ${HR_KPIS.nurses} nurses` },
          { i: "brain", t: "AI Suggestions Today", v: "1,284", s: "812 accepted · 22 overridden" },
          { i: "shield", t: "Security Posture", v: "A+", s: "Zero-trust · No incidents (30d)" },
        ].map((c) => {
          const Ico = I[c.i as keyof typeof I];
          return (
            <div key={c.t} className="card p-5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center">
                  <Ico size={20} stroke="#0B1D3A" />
                </div>
                <Sparkline data={[5, 7, 6, 9, 8, 11, 12, 10, 13, 15]} />
              </div>
              <div className="mt-3 text-[11px] text-slate-500">{c.t}</div>
              <div className="font-display text-2xl text-navy-800">{c.v}</div>
              <div className="text-[11px] text-slate-500 mt-1">{c.s}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── Doctor (Clinician) ─────────────────────────── */

export function DoctorDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Clinical Workstation"
        subtitle="Good morning, Dr. Neema Mwangi — 6 patients scheduled today"
        actions={
          <>
            <button className="btn-outline text-sm">Start Telemed</button>
            <button className="btn-primary text-sm">+ New Note</button>
          </>
        }
      />

      <div className="mb-4 grid lg:grid-cols-[1fr_320px] gap-3">
        <OnDutyStrip department="OPD" />
        <div className="card p-3 flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-slate-500">REPORTING TO:</span>
          <StaffChip e={byId("EMP-10003")} sub="CMO" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <div className="text-[11px] text-slate-500">Today's Schedule</div>
          <div className="font-display text-3xl text-navy-800">6 <span className="text-base text-slate-400 font-sans">appointments</span></div>
          <div className="mt-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-xs text-slate-600">Next: Joseph Mwakyusa @ 09:00 — Cardio-1</span></div>
        </div>
        <div className="card p-5">
          <div className="text-[11px] text-slate-500">Open Encounters</div>
          <div className="font-display text-3xl text-navy-800">4</div>
          <div className="mt-3 text-xs text-amber-700">2 pending discharge summaries</div>
        </div>
        <div className="card p-5">
          <div className="text-[11px] text-slate-500">Inbox</div>
          <div className="font-display text-3xl text-navy-800">12 <span className="text-base text-slate-400 font-sans">results to review</span></div>
          <div className="mt-3 text-xs text-rose-700">1 critical value — BEYU-100486</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="font-display text-lg text-navy-800">Today's Appointments</div>
            <button className="text-xs text-navy-700 hover:underline">View All</button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-5 py-2.5">TIME</th>
                <th className="text-left px-5 py-2.5">PATIENT</th>
                <th className="text-left px-5 py-2.5">TYPE</th>
                <th className="text-left px-5 py-2.5">ROOM</th>
                <th className="text-left px-5 py-2.5">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {APPOINTMENTS.map((a, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-navy-800">{a.time}</td>
                  <td className="px-5 py-3">
                    <div className="font-medium text-navy-800">{a.patient}</div>
                    <div className="text-[11px] text-slate-500">{a.doctor}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{a.type}</td>
                  <td className="px-5 py-3"><span className="text-[11px] px-2 py-0.5 rounded bg-navy-50 text-navy-700">{a.room}</span></td>
                  <td className="px-5 py-3"><button className="text-xs text-gold-700 font-semibold hover:underline">Open Chart →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="font-display text-lg text-navy-800 mb-3">Clinical AI Co-Pilot</div>
            <div className="rounded-xl bg-navy-800 text-white p-4">
              <div className="text-[11px] text-gold-300 tracking-widest mb-1">SUGGESTION · BEYU-100483</div>
              <div className="text-sm leading-relaxed">
                Joseph Mwakyusa presents with chest pain + diaphoresis. Consider obtaining a 12-lead ECG and troponin-I now.
                Aspirin 300mg PO unless contraindicated.
              </div>
              <div className="flex gap-2 mt-3">
                <button className="btn-gold !py-1.5 !px-3 text-xs">Accept</button>
                <button className="btn-outline !text-white !border-white/30 hover:!bg-white hover:!text-navy-800 !py-1.5 !px-3 text-xs">Override</button>
              </div>
              <div className="mt-2 text-[10px] text-white/60">Confidence 0.91 · Logged to audit · Final decision rests with physician</div>
            </div>
          </div>

          <div className="card p-5">
            <div className="font-display text-lg text-navy-800 mb-3">Critical Alerts</div>
            <div className="space-y-2">
              {NOTIFICATIONS.map((n, i) => (
                <div key={i} className={`p-3 rounded-lg border ${
                  n.severity === "critical" ? "bg-rose-50 border-rose-200" :
                  n.severity === "warn" ? "bg-amber-50 border-amber-200" :
                  n.severity === "ok" ? "bg-emerald-50 border-emerald-200" :
                  "bg-slate-50 border-slate-200"
                }`}>
                  <div className="text-sm text-navy-800">{n.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{n.time} ago</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Nurse ─────────────────────────── */

export function NurseDashboard() {
  const tasks = [
    { t: "Vitals — Ward A · 12 patients", done: 7, total: 12, due: "10:00" },
    { t: "Medication round (BD)", done: 5, total: 8, due: "11:00" },
    { t: "Wound dressing change", done: 1, total: 3, due: "12:00" },
    { t: "Admit IPD bed 14", done: 0, total: 1, due: "ASAP" },
  ];
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Nursing Workstation" subtitle="Ward A · Day shift · Nurse Grace Mushi" />

      <div className="mb-4 grid lg:grid-cols-[1fr_320px] gap-3">
        <OnDutyStrip department="Ward A" />
        <div className="card p-3 flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-slate-500">CHARGE NURSE:</span>
          <StaffChip e={byId("EMP-10020")} sub="Day shift" />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { t: "Vitals Recorded", v: "32 / 44", c: "#0B1D3A" },
          { t: "Medications Due", v: "18", c: "#D4AF37" },
          { t: "Admissions", v: "3", c: "#557345" },
          { t: "Critical Patients", v: "1", c: "#dc2626" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-lg text-navy-800">Today's Tasks</div>
            <button className="btn-gold text-xs !py-1.5 !px-3">Sync Now</button>
          </div>
          <div className="space-y-3">
            {tasks.map((t) => (
              <div key={t.t} className="p-4 rounded-xl border border-slate-200 hover:border-navy-300">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-navy-800 text-sm">{t.t}</div>
                  <div className="text-[11px] text-slate-500">due {t.due}</div>
                </div>
                <ProgressBar value={(t.done / t.total) * 100} />
                <div className="text-[11px] text-slate-500 mt-1">{t.done} of {t.total} complete</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Ward A — Live Beds</div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 16 }).map((_, i) => {
              const s = i % 7 === 0 ? "critical" : i % 5 === 0 ? "free" : "occupied";
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] ${
                    s === "critical" ? "bg-rose-100 text-rose-700" :
                    s === "free" ? "bg-emerald-100 text-emerald-700" : "bg-navy-50 text-navy-700"
                  }`}
                >
                  <div className="font-semibold">B{i + 1}</div>
                  <div>{s === "critical" ? "ICU" : s === "free" ? "Free" : "Occ"}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-[11px] text-slate-500 flex flex-wrap gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-navy-500" /> Occupied</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" /> Free</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500" /> Critical</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Patient Portal ─────────────────────────── */

export function PatientDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="My Health"
        subtitle="Hello, Neema Mwangi · MRN BEYU-100484 · Your records across all BEYU hospitals"
      />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2 bg-gradient-to-br from-navy-800 to-navy-700 text-white">
          <div className="text-[11px] text-gold-300 tracking-widest">UNIFIED HEALTH ID</div>
          <div className="font-display text-3xl mt-1">BEYU-100484</div>
          <div className="text-sm text-white/70 mt-1">One MRN across every BEYU hospital · biometric verified</div>
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="rounded-lg bg-white/10 p-3">
              <div className="text-[10px] text-white/60">Blood Type</div>
              <div className="text-lg font-semibold">O+</div>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <div className="text-[10px] text-white/60">Allergies</div>
              <div className="text-lg font-semibold">Penicillin</div>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <div className="text-[10px] text-white/60">Insurance</div>
              <div className="text-lg font-semibold">NHIF</div>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800">Next Appointment</div>
          <div className="mt-3 p-3 rounded-lg bg-gold-50 border border-gold-200">
            <div className="text-xs text-gold-800">Tomorrow · 10:30</div>
            <div className="font-semibold text-navy-800">ANC Visit 3 with Dr. Halima Omar</div>
            <div className="text-[11px] text-slate-500 mt-1">Muhimbili · Maternity Block · Room ANC-2</div>
          </div>
          <button className="btn-outline w-full mt-3 text-sm">Reschedule</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { i: "emr", t: "Medical Records" }, { i: "lab", t: "Lab Results" },
          { i: "pill", t: "Prescriptions" }, { i: "bill", t: "Billing & NHIF" },
          { i: "phone", t: "Telemedicine" }, { i: "calendar", t: "Appointments" },
          { i: "shield", t: "Consent & Sharing" }, { i: "doc", t: "Discharge Summaries" },
        ].map((c) => {
          const Ico = I[c.i as keyof typeof I];
          return (
            <button key={c.t} className="card p-4 text-left hover:-translate-y-0.5 transition">
              <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center mb-2"><Ico size={18} stroke="#0B1D3A" /></div>
              <div className="text-sm font-semibold text-navy-800">{c.t}</div>
              <div className="text-[11px] text-slate-500 mt-1">Tap to open</div>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Recent Vitals</div>
          <LineChart
            data={[
              { m: "Jul", v: 118 }, { m: "Aug", v: 122 }, { m: "Sep", v: 119 },
              { m: "Oct", v: 124 }, { m: "Nov", v: 121 }, { m: "Dec", v: 117 },
              { m: "Jan", v: 119 }, { m: "Feb", v: 122 },
            ]}
            height={200}
          />
          <div className="text-[11px] text-slate-500 mt-2">Systolic BP (mmHg) · last 8 visits</div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">My Care Team</div>
          <div className="space-y-3">
            {[byId("EMP-10011"), byId("EMP-10023"), byId("EMP-10020"), byId("EMP-10030")].map((s) => s && (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50">
                <div className="w-10 h-10 rounded-full text-white flex items-center justify-center font-semibold text-sm" style={{ background: s.avatarColor }}>
                  {s.name.replace(/^Dr\.\s*/, "").split(" ").map(n=>n[0]).join("").slice(0,2)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-navy-800">{s.name}</div>
                  <div className="text-[11px] text-slate-500">{s.role} · {s.department}</div>
                </div>
                <button className="text-xs text-gold-700 hover:underline">Message</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Admin ─────────────────────────── */

export function AdminDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Operations Console" subtitle="Tenant administration · users · resources · audit" />

      <CredentialAlertBanner />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { t: "Active Users", v: "842", d: "+24" },
          { t: "Patients Registered", v: "12,458", d: "+312" },
          { t: "MPI Reconciliations", v: "16", d: "auto" },
          { t: "Audit Events (24h)", v: "48,712", d: "0 alerts" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-emerald-600 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-lg text-navy-800">Patient Registry</div>
            <button className="btn-primary text-xs !py-1.5 !px-3">+ Register Patient</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2.5">MRN</th>
                  <th className="text-left px-3 py-2.5">PATIENT</th>
                  <th className="text-left px-3 py-2.5">DEPT</th>
                  <th className="text-left px-3 py-2.5">INSURANCE</th>
                  <th className="text-left px-3 py-2.5">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {PATIENTS.map((p) => (
                  <tr key={p.mrn} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">{p.mrn}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-navy-800">{p.name}</div>
                      <div className="text-[11px] text-slate-500">{p.age}y · {p.sex}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{p.dept}</td>
                    <td className="px-3 py-3"><span className="text-[11px] px-2 py-0.5 rounded bg-navy-50 text-navy-700">{p.insurance}</span></td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <PriorityBadge
                          p={p.priority === "Critical" ? "EMERGENCY" : p.priority === "Urgent" ? "URGENT" : "ROUTINE"}
                          size="sm"
                        />
                        <span className="text-[10px] text-slate-500">{p.status}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <TeamRoster department="Executive" title="Leadership Online" max={8} />
      </div>
    </div>
  );
}

/* ─────────────────────────── Pharmacy ─────────────────────────── */

export function PharmacyDashboard() {
  const meds = [
    { name: "Amoxicillin 500mg", stock: 180, reorder: 200, batch: "AMX-44-22", exp: "2027-04" },
    { name: "Paracetamol 500mg", stock: 2400, reorder: 500, batch: "PAR-99-12", exp: "2027-08" },
    { name: "Metformin 850mg", stock: 640, reorder: 300, batch: "MET-19-04", exp: "2028-01" },
    { name: "Ceftriaxone 1g (vial)", stock: 96, reorder: 100, batch: "CFX-08-32", exp: "2026-12" },
    { name: "Salbutamol Inhaler", stock: 42, reorder: 60, batch: "SAL-77-19", exp: "2027-06" },
    { name: "ORS Sachets", stock: 5200, reorder: 800, batch: "ORS-12-08", exp: "2028-03" },
  ];
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Pharmacy Console" subtitle="Dispensing · stock control · interactions" actions={<Classification level="CONFIDENTIAL" />} />

      <div className="mb-4 grid lg:grid-cols-[1fr_320px] gap-3">
        <OnDutyStrip department="Pharmacy" />
        <div className="card p-3 flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-slate-500">CHIEF PHARMACIST:</span>
          <StaffChip e={byId("EMP-10030")} sub="On duty" />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { t: "Scripts Today", v: "318" }, { t: "Pending Dispense", v: "12" },
          { t: "Low-Stock Items", v: "5" }, { t: "Expiry < 90 d", v: "8" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2 overflow-x-auto">
          <div className="font-display text-lg text-navy-800 mb-3">Pharmacy Inventory</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr><th className="text-left px-3 py-2.5">MEDICATION</th><th className="text-left px-3 py-2.5">STOCK</th><th className="text-left px-3 py-2.5">BATCH</th><th className="text-left px-3 py-2.5">EXPIRY</th><th className="text-left px-3 py-2.5">STATUS</th></tr>
            </thead>
            <tbody>
              {meds.map((m) => {
                const low = m.stock < m.reorder;
                return (
                  <tr key={m.name} className="border-b border-slate-100">
                    <td className="px-3 py-3 font-medium text-navy-800">{m.name}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20"><ProgressBar value={Math.min((m.stock / (m.reorder * 3)) * 100, 100)} color={low ? "#dc2626" : "#0B1D3A"} /></div>
                        <span className="text-xs text-slate-700">{m.stock}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-slate-600">{m.batch}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{m.exp}</td>
                    <td className="px-3 py-3"><span className={`text-[11px] px-2 py-0.5 rounded ${low ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{low ? "Reorder" : "OK"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Pharmacy AI</div>
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 mb-3">
            <div className="text-[10px] text-rose-700 tracking-widest mb-1">INTERACTION ALERT</div>
            <div className="text-sm text-rose-900">Warfarin × Ceftriaxone — increased INR risk for BEYU-100483. Suggest INR monitoring within 24h.</div>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-3">
            <div className="text-[10px] text-amber-700 tracking-widest mb-1">ALLERGY MATCH</div>
            <div className="text-sm text-amber-900">Amoxicillin script for BEYU-100488 — patient has penicillin allergy on file. Consider azithromycin.</div>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <div className="text-[10px] text-emerald-700 tracking-widest mb-1">REORDER SUGGESTION</div>
            <div className="text-sm text-emerald-900 mb-2">Auto-PO drafted for Ceftriaxone × 500 vials based on 28-day consumption.</div>
            <Guard role="pharmacy" perm="po:approve" justify="Procurement officer or chief pharmacist required">
              <button className="btn-primary text-xs !py-1.5 !px-3">Approve PO</button>
            </Guard>
          </div>
        </div>
      </div>

      <div className="mt-4 grid lg:grid-cols-2 gap-4">
        <div>
          <div className="card p-5">
            <div className="font-display text-lg text-navy-800 mb-3">Active Controlled Dispense</div>
            <div className="text-sm text-slate-700 mb-2">
              <span className="font-semibold">Fentanyl 25 mcg/h patch</span> for <span className="text-navy-800">Erick Mushi (BEYU-100489)</span>
            </div>
            <div className="text-[11px] text-slate-500 mb-3">Schedule II · q72h · ICU-4</div>
            <WitnessRequired controlled />
          </div>
        </div>
        <TeamRoster department="Pharmacy" title="Pharmacy Team On Duty" max={4} />
      </div>
    </div>
  );
}

/* ─────────────────────────── Lab (LIS) ─────────────────────────── */

export function LabDashboard() {
  const orders = [
    { id: "LIS-22841", patient: "Joseph Mwakyusa", test: "Troponin-I, CK-MB", priority: "STAT", status: "Running", tech: "EMP-10032" },
    { id: "LIS-22842", patient: "Fatuma Ally", test: "ABG + Lactate", priority: "STAT", status: "Resulted", tech: "EMP-10032" },
    { id: "LIS-22843", patient: "Amina Hassan", test: "FBC, U&E, LFT", priority: "Routine", status: "Collected", tech: "EMP-10032" },
    { id: "LIS-22844", patient: "Esther Lema", test: "Malaria RDT", priority: "Routine", status: "Resulted", tech: "EMP-10032" },
    { id: "LIS-22845", patient: "Neema Mwangi", test: "HIV, Syphilis, Hep B (ANC)", priority: "Routine", status: "Pending Collection", tech: "EMP-10032" },
  ];
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Laboratory (LIS)" subtitle="Specimens · analyzer runs · QC · result sign-out" actions={<Classification level="PHI" />} />

      <div className="mb-4 grid lg:grid-cols-[1fr_320px] gap-3">
        <OnDutyStrip department="Laboratory" />
        <div className="card p-3 flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-slate-500">SIGN-OUT TECH:</span>
          <StaffChip e={byId("EMP-10032")} sub="HLB licensed" />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { t: "Orders Today", v: "284" }, { t: "Resulted", v: "211" },
          { t: "Critical Values", v: "3" }, { t: "QC Status", v: "Pass" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 p-5 overflow-x-auto">
          <div className="font-display text-lg text-navy-800 mb-3">Active Orders</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-3 py-2.5">ORDER</th><th className="text-left px-3 py-2.5">PATIENT</th>
                <th className="text-left px-3 py-2.5">TEST</th><th className="text-left px-3 py-2.5">PRIORITY</th>
                <th className="text-left px-3 py-2.5">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{o.id}</td>
                  <td className="px-3 py-3 font-medium text-navy-800">{o.patient}</td>
                  <td className="px-3 py-3 text-slate-700">{o.test}</td>
                  <td className="px-3 py-3"><span className={`text-[11px] px-2 py-0.5 rounded ${o.priority === "STAT" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{o.priority}</span></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-navy-50 text-navy-700">{o.status}</span>
                      <StaffChip e={byId(o.tech)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Analyzer Status</div>
          <div className="space-y-3">
            {[
              { n: "Sysmex XN-550 (Hematology)", v: 92, c: "#0B1D3A" },
              { n: "Roche Cobas c311 (Chem)", v: 78, c: "#D4AF37" },
              { n: "Abbott Architect i1000 (Immuno)", v: 64, c: "#557345" },
              { n: "BioMérieux VITEK 2 (Micro)", v: 41, c: "#1E3A8A" },
            ].map((a) => (
              <div key={a.n}>
                <div className="flex justify-between text-xs text-slate-600 mb-1"><span>{a.n}</span><span>{a.v}% load</span></div>
                <ProgressBar value={a.v} color={a.c} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Finance ─────────────────────────── */

export function FinanceDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Financial Intelligence" subtitle="Revenue cycle · NHIF · ledger · cash position" actions={<Classification level="CONFIDENTIAL" />} />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { t: "MTD Revenue", v: "TZS 324.6M", d: "+15.7%" },
          { t: "AR Outstanding", v: "TZS 84.2M", d: "−4.1%" },
          { t: "NHIF Claims (open)", v: "1,284", d: "92.4% success" },
          { t: "Cash Position", v: "TZS 142.0M", d: "Healthy" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-2xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-emerald-600 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-2">Revenue vs Claims</div>
          <LineChart data={REVENUE_SERIES} height={240} />
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Denial Reasons</div>
          {[
            { l: "Missing documentation", v: 38 },
            { l: "Eligibility lapse", v: 24 },
            { l: "Coding mismatch", v: 18 },
            { l: "Pre-auth missing", v: 12 },
            { l: "Duplicate claim", v: 8 },
          ].map((d) => (
            <div key={d.l} className="mb-2">
              <div className="flex justify-between text-xs text-slate-600 mb-0.5"><span>{d.l}</span><span>{d.v}%</span></div>
              <ProgressBar value={d.v} color="#0B1D3A" />
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 mt-4 overflow-x-auto">
        <div className="font-display text-lg text-navy-800 mb-3">Recent NHIF Claims</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
            <tr><th className="text-left px-3 py-2.5">CLAIM</th><th className="text-left px-3 py-2.5">PATIENT</th><th className="text-left px-3 py-2.5">SERVICE</th><th className="text-left px-3 py-2.5">AMOUNT</th><th className="text-left px-3 py-2.5">STATUS</th></tr>
          </thead>
          <tbody>
            {[
              { c: "CLM-44128", p: "Amina Hassan", s: "OPD Consultation + Lab", a: "84,000", st: "Approved" },
              { c: "CLM-44129", p: "Joseph Mwakyusa", s: "Cardiology + ECG", a: "215,000", st: "Submitted" },
              { c: "CLM-44130", p: "Baraka Juma", s: "IPD 3 days + meds", a: "640,000", st: "Approved" },
              { c: "CLM-44131", p: "Daniel Kessy", s: "Dental RCT prep", a: "320,000", st: "Pending Docs" },
              { c: "CLM-44132", p: "Hassan Mohamed", s: "Oncology Cycle 3", a: "1,840,000", st: "Approved" },
            ].map((r) => (
              <tr key={r.c} className="border-b border-slate-100">
                <td className="px-3 py-3 font-mono text-xs text-slate-600">{r.c}</td>
                <td className="px-3 py-3 font-medium text-navy-800">{r.p}</td>
                <td className="px-3 py-3 text-slate-700">{r.s}</td>
                <td className="px-3 py-3 text-navy-800 font-semibold">TZS {r.a}</td>
                <td className="px-3 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded ${
                    r.st === "Approved" ? "bg-emerald-50 text-emerald-700" :
                    r.st === "Submitted" ? "bg-navy-50 text-navy-700" : "bg-amber-50 text-amber-700"
                  }`}>{r.st}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────── Modules Catalog (used as a screen) ─────────────────────────── */

export function ModulesScreen() {
  const groups = Array.from(new Set(MODULES.map((m) => m.group)));
  const groupIcon = (g: string): keyof typeof I =>
    g === "Clinical" ? "heart" : g === "Diagnostics" ? "lab" : g === "ERP" ? "building" :
    g === "AI" ? "brain" : g === "Corporate" ? "doc" : "shield";

  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Modules Catalog" subtitle="Every domain of BEYU Health OS · click to launch" />
      <div className="space-y-8">
        {groups.map((g) => {
          const Ico = I[groupIcon(g)];
          return (
            <div key={g}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gold-50 flex items-center justify-center"><Ico size={16} stroke="#b48a24" /></div>
                <h3 className="font-display text-xl text-navy-800">{g}</h3>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[11px] text-slate-500">{MODULES.filter(m=>m.group===g).length} modules</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {MODULES.filter((m) => m.group === g).map((m) => (
                  <div key={m.id} className="card p-4 hover:-translate-y-0.5 transition cursor-pointer">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] tracking-widest text-slate-400">{m.id.toUpperCase()}</div>
                      <I.chevronR size={14} stroke="#94a3b8" />
                    </div>
                    <div className="font-semibold text-navy-800">{m.name}</div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── Governance ─────────────────────────── */

export function GovernanceScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Governance & AI Hive" subtitle="Trust hierarchy · audit · policies · emergency controls" />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-6 lg:col-span-2 bg-gradient-to-br from-navy-800 to-navy-900 text-white">
          <div className="text-[11px] tracking-widest text-gold-400">OWNERSHIP & GOVERNANCE</div>
          <h3 className="font-display text-2xl mt-2">Family Trust → Holding → Operations → Tenants</h3>
          <div className="grid grid-cols-4 gap-2 mt-5">
            {["Trust", "Holding", "Operations", "Tenants"].map((s, i) => (
              <div key={s} className="rounded-lg bg-white/10 p-3 text-center">
                <div className="text-[10px] text-white/60">LEVEL {i+1}</div>
                <div className="font-display text-lg mt-1">{s}</div>
              </div>
            ))}
          </div>
          <p className="text-white/70 text-sm mt-4">
            Every action across BEYU Health OS is signed, attributed and recorded in an immutable audit log.
            Cross-tenant access is mathematically impossible.
          </p>
        </div>

        <div className="card p-6 border-rose-200">
          <div className="text-[11px] tracking-widest text-rose-700">EMERGENCY CONTROLS</div>
          <h3 className="font-display text-xl text-navy-800 mt-2">Hive Kill-Switch</h3>
          <p className="text-xs text-slate-600 mt-2">
            Instantly disable all AI agents while preserving clinical access. Requires dual approval.
          </p>
          <button className="mt-4 w-full py-3 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 flex items-center justify-center gap-2">
            <I.power size={16} /> Initiate Shutdown
          </button>
          <div className="text-[10px] text-slate-400 mt-2 text-center">Last drill: 2026-03-14 (passed)</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {[
          { t: "Active AI Agents", v: "12", s: "All operating within policy" },
          { t: "Human Overrides (24h)", v: "22", s: "All reviewed by clinical lead" },
          { t: "Audit Events (24h)", v: "48,712", s: "0 policy violations" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-3">Audit Trail (live)</div>
        <div className="space-y-1 text-xs font-mono">
          {[
            { t: "14:22:18", a: "doctor.j.doe", e: "READ_EMR", r: "BEYU-100486 · ICU Vitals", s: "ok" },
            { t: "14:22:05", a: "ai.copilot.v2", e: "SUGGEST", r: "Sepsis bundle compliance · BEYU-100486", s: "ai" },
            { t: "14:21:50", a: "system.nhif", e: "CLAIM_SUBMIT", r: "CLM-44132 (TZS 1,840,000)", s: "ok" },
            { t: "14:21:32", a: "nurse.g.mushi", e: "VITALS_RECORD", r: "Ward A · 4 patients", s: "ok" },
            { t: "14:21:18", a: "admin.system", e: "TENANT_SWITCH", r: "MUH-DSM-01 → AGA-DSM-02", s: "warn" },
            { t: "14:21:02", a: "ai.coding.v1", e: "ICD_SUGGEST", r: "I21.9 · Acute MI (confidence 0.94)", s: "ai" },
            { t: "14:20:48", a: "patient.portal", e: "CONSENT_GRANT", r: "BEYU-100484 → share records to ARU-MED-03", s: "ok" },
          ].map((row, i) => (
            <div key={i} className="grid grid-cols-[80px_180px_140px_1fr_60px] gap-2 py-1 border-b border-slate-50">
              <span className="text-slate-500">{row.t}</span>
              <span className="text-navy-800">{row.a}</span>
              <span className="text-gold-700">{row.e}</span>
              <span className="text-slate-600 truncate">{row.r}</span>
              <span className={`text-right ${row.s === "warn" ? "text-amber-600" : row.s === "ai" ? "text-gold-700" : "text-emerald-600"}`}>{row.s.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
