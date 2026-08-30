import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, BarChart, DonutChart, ProgressBar } from "../components/Charts";
import { OnDutyStrip, TeamRoster, ShiftCoverage, SurgicalTeam, StaffChip } from "../components/HRWidgets";
import { byId } from "../services/hr";

/* ─────────────────────────── DENTAL + AI ─────────────────────────── */

type ToothState = "healthy" | "caries" | "filled" | "crown" | "missing" | "rct";

const TOOTH_COLORS: Record<ToothState, string> = {
  healthy: "#ffffff",
  caries: "#dc2626",
  filled: "#0B1D3A",
  crown: "#D4AF37",
  missing: "#94a3b8",
  rct: "#7c3aed",
};

function Tooth({ n, state, label }: { n: number; state: ToothState; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[9px] text-slate-400">{n}</div>
      <div
        className="w-7 h-9 rounded-t-lg rounded-b-md border-2 border-slate-300 flex items-center justify-center text-[9px] font-bold"
        style={{ background: TOOTH_COLORS[state], color: state === "healthy" || state === "crown" ? "#0B1D3A" : "#fff" }}
        title={label}
      >
        {state === "missing" ? "✕" : state === "rct" ? "R" : state === "filled" ? "F" : state === "crown" ? "C" : state === "caries" ? "!" : ""}
      </div>
    </div>
  );
}

export function DentalDashboard() {
  const dentist = byId("EMP-10013");
  // Tanzania uses adult dentition 18-tooth quadrants (FDI numbering 11-18, 21-28, 31-38, 41-48)
  const upperRight = [18, 17, 16, 15, 14, 13, 12, 11];
  const upperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
  const lowerLeft = [38, 37, 36, 35, 34, 33, 32, 31];
  const lowerRight = [41, 42, 43, 44, 45, 46, 47, 48];

  const findings: Record<number, ToothState> = {
    16: "caries", 26: "filled", 36: "rct", 37: "crown",
    46: "caries", 47: "missing", 11: "filled", 24: "caries",
  };
  const getState = (n: number): ToothState => findings[n] || "healthy";

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Dental Suite"
        subtitle="Patient: Daniel Kessy · BEYU-100487 · Chair 2"
        actions={
          <>
            <button className="btn-outline text-sm">Capture X-Ray</button>
            <button className="btn-primary text-sm">+ Treatment Plan</button>
          </>
        }
      />

      <div className="mb-4 flex flex-col lg:flex-row items-stretch gap-3">
        <div className="flex-1 card p-3 flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-slate-500">TREATING CLINICIAN:</span>
          <StaffChip e={dentist} sub="Chair 2 · Operating" />
        </div>
        <OnDutyStrip department="Dental" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-display text-lg text-navy-800">Odontogram — FDI Notation</div>
              <div className="text-xs text-slate-500">AI-assisted clinical findings · last updated 2 min ago</div>
            </div>
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-600">
              {(["healthy", "caries", "filled", "crown", "rct", "missing"] as ToothState[]).map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded border border-slate-300" style={{ background: TOOTH_COLORS[s] }} />
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-6">
            <div className="flex justify-center gap-1 mb-1">
              {upperRight.map((n) => <Tooth key={n} n={n} state={getState(n)} />)}
              <div className="w-px bg-slate-300 mx-1" />
              {upperLeft.map((n) => <Tooth key={n} n={n} state={getState(n)} />)}
            </div>
            <div className="text-center text-[10px] text-slate-400 my-2">— maxillary / mandibular —</div>
            <div className="flex justify-center gap-1">
              {lowerRight.map((n) => <Tooth key={n} n={n} state={getState(n)} />)}
              <div className="w-px bg-slate-300 mx-1" />
              {lowerLeft.map((n) => <Tooth key={n} n={n} state={getState(n)} />)}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-4 text-center">
            {[
              { l: "DMFT Score", v: "6" },
              { l: "Caries (active)", v: "3" },
              { l: "Restorations", v: "2" },
              { l: "Missing", v: "1" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-navy-50 p-3">
                <div className="font-display text-2xl text-navy-800">{s.v}</div>
                <div className="text-[10px] tracking-widest text-slate-500">{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Dental AI Findings</div>
          <div className="space-y-3">
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
              <div className="text-[10px] text-rose-700 tracking-widest">CARIES DETECTION · 16</div>
              <div className="text-sm text-rose-900 mt-1">Class II distal — moderate depth, ICDAS code 4. Conservative restoration recommended.</div>
              <div className="text-[10px] text-slate-500 mt-1">Confidence 0.93 · bitewing radiograph</div>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <div className="text-[10px] text-amber-700 tracking-widest">PERIODONTAL · 36</div>
              <div className="text-sm text-amber-900 mt-1">Pocket depth 5mm, BoP+ — early periodontitis. Recommend SRP and re-evaluation in 6 weeks.</div>
            </div>
            <div className="rounded-lg bg-violet-50 border border-violet-200 p-3">
              <div className="text-[10px] text-violet-700 tracking-widest">ENDODONTIC · 36</div>
              <div className="text-sm text-violet-900 mt-1">Periapical lesion visible. RCT in progress (visit 2 of 3 scheduled).</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Treatment Plan</div>
          <div className="space-y-2">
            {[
              { v: "V1", date: "2026-04-02", proc: "Scaling & polishing (full mouth)", tooth: "All", fee: "60,000", status: "Done" },
              { v: "V2", date: "2026-04-09", proc: "RCT prep · pulp extirpation", tooth: "36", fee: "180,000", status: "Today" },
              { v: "V3", date: "2026-04-16", proc: "RCT obturation + crown prep", tooth: "36", fee: "260,000", status: "Planned" },
              { v: "V4", date: "2026-04-23", proc: "Composite restoration Class II", tooth: "16", fee: "120,000", status: "Planned" },
              { v: "V5", date: "2026-05-07", proc: "PFM crown cementation", tooth: "36", fee: "420,000", status: "Planned" },
            ].map((r) => (
              <div key={r.v} className={`p-3 rounded-lg border flex items-center gap-3 ${
                r.status === "Done" ? "bg-emerald-50 border-emerald-200" :
                r.status === "Today" ? "bg-gold-50 border-gold-300" : "bg-white border-slate-200"
              }`}>
                <div className="w-9 h-9 rounded-lg bg-navy-800 text-white flex items-center justify-center text-xs font-bold">{r.v}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-navy-800 truncate">{r.proc}</div>
                  <div className="text-[11px] text-slate-500">Tooth {r.tooth} · {r.date}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-navy-800">TZS {r.fee}</div>
                  <div className="text-[10px] text-slate-500">{r.status}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-navy-800 text-white">
            <span className="text-sm">Total estimated cost</span>
            <span className="font-display text-xl text-gold-300">TZS 1,040,000</span>
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Imaging Library</div>
          <div className="grid grid-cols-3 gap-3">
            {["Panoramic", "Bitewing R", "Bitewing L", "PA 36", "PA 16", "Cephalometric"].map((lbl, i) => (
              <div key={lbl} className="aspect-square rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-gold-400">
                <div className="absolute inset-0 bg-dot opacity-20" />
                <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 100 100">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <rect key={j} x={15 + j * 9} y={40 + (j % 2) * 5} width="6" height="12" rx="2" fill="#fff" opacity={0.4 + (i + j) % 3 * 0.15} />
                  ))}
                </svg>
                <div className="absolute bottom-1 left-1 right-1 text-[9px] text-white/80 text-center">{lbl}</div>
              </div>
            ))}
          </div>
          <button className="btn-outline w-full mt-4 text-sm">Open DICOM Viewer</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── ONCOLOGY ─────────────────────────── */

export function OncologyDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Oncology Center"
        subtitle="Active patients · chemo schedules · tumor board · supportive care"
        actions={<button className="btn-primary text-sm">+ New Regimen</button>}
      />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { t: "Active Patients", v: "184", d: "+6 this week" },
          { t: "Chemo Today", v: "22", d: "Day-care unit" },
          { t: "Radiotherapy", v: "14", d: "LINAC bay 1 & 2" },
          { t: "Tumor Board Cases", v: "9", d: "Thursday" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2 overflow-x-auto">
          <div className="font-display text-lg text-navy-800 mb-3">Today's Chemo Schedule</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-3 py-2.5">PATIENT</th>
                <th className="text-left px-3 py-2.5">DIAGNOSIS</th>
                <th className="text-left px-3 py-2.5">REGIMEN</th>
                <th className="text-left px-3 py-2.5">CYCLE</th>
                <th className="text-left px-3 py-2.5">CHAIR</th>
                <th className="text-left px-3 py-2.5">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {[
                { p: "Hassan Mohamed", dx: "Colon CA (T3N1M0)", reg: "FOLFOX-6", c: "3/12", chair: "A1", s: "Infusing", color: "bg-amber-50 text-amber-700" },
                { p: "Mariam Juma", dx: "Breast CA HER2+", reg: "AC → T + Trastuzumab", c: "5/8", chair: "A2", s: "Premeds", color: "bg-navy-50 text-navy-700" },
                { p: "Peter Mtui", dx: "DLBCL", reg: "R-CHOP", c: "2/6", chair: "B1", s: "Bloods OK", color: "bg-emerald-50 text-emerald-700" },
                { p: "Anna Kileo", dx: "Cervix CA stage IIB", reg: "Cisplatin (weekly)", c: "4/6", chair: "B2", s: "Awaiting CBC", color: "bg-slate-100 text-slate-700" },
                { p: "Said Kibwana", dx: "NSCLC EGFR+", reg: "Osimertinib (oral)", c: "—", chair: "Clinic", s: "Review", color: "bg-violet-50 text-violet-700" },
              ].map((r) => (
                <tr key={r.p} className="border-b border-slate-100">
                  <td className="px-3 py-3 font-medium text-navy-800">{r.p}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{r.dx}</td>
                  <td className="px-3 py-3 text-sm text-navy-700">{r.reg}</td>
                  <td className="px-3 py-3 text-xs font-mono">{r.c}</td>
                  <td className="px-3 py-3"><span className="text-[11px] px-2 py-0.5 rounded bg-navy-50 text-navy-700">{r.chair}</span></td>
                  <td className="px-3 py-3"><span className={`text-[11px] px-2 py-0.5 rounded ${r.color}`}>{r.s}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Tumor Board — Thu</div>
          <div className="space-y-2">
            {[
              { p: "BEYU-100489 · Colon", q: "Adjuvant continuation vs de-escalation?" },
              { p: "BEYU-100571 · Breast", q: "Add CDK4/6 inhibitor?" },
              { p: "BEYU-100612 · Cervix", q: "Brachytherapy planning" },
              { p: "BEYU-100690 · NSCLC", q: "Re-biopsy on progression" },
            ].map((c, i) => (
              <div key={i} className="p-3 rounded-lg border border-slate-200">
                <div className="text-[11px] font-mono text-slate-500">{c.p}</div>
                <div className="text-sm text-navy-800 mt-0.5">{c.q}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Cycles Delivered (12-mo)</div>
          <LineChart
            data={[
              { m: "Apr", v: 142 }, { m: "May", v: 156 }, { m: "Jun", v: 168 }, { m: "Jul", v: 174 },
              { m: "Aug", v: 188 }, { m: "Sep", v: 195 }, { m: "Oct", v: 210 }, { m: "Nov", v: 224 },
              { m: "Dec", v: 232 }, { m: "Jan", v: 248 }, { m: "Feb", v: 261 }, { m: "Mar", v: 278 },
            ]}
            height={220}
          />
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Cancer Type Distribution</div>
          <BarChart
            data={[
              { name: "Breast", value: 42 },
              { name: "Cervix", value: 36 },
              { name: "Colon", value: 24 },
              { name: "Lung", value: 19 },
              { name: "Lymphoma", value: 16 },
              { name: "Prostate", value: 14 },
            ]}
            height={220}
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── PEDIATRICS ─────────────────────────── */

export function PediatricsDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Pediatrics & Child Health"
        subtitle="Patient: Baraka Juma · 9y M · Pneumonia (admitted Ward Peds-1)"
      />

      <div className="mb-4 grid lg:grid-cols-[1fr_320px] gap-3">
        <OnDutyStrip department="Pediatrics" />
        <div className="card p-3 flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-slate-500">ATTENDING:</span>
          <StaffChip e={byId("EMP-10011")} sub="Pediatrics" />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { t: "Admitted", v: "28", d: "Peds wards" },
          { t: "OPD Today", v: "94", d: "incl. immunization" },
          { t: "Immunizations", v: "42", d: "EPI schedule" },
          { t: "Malnutrition Cases", v: "6", d: "MAM/SAM follow-up" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-2">Growth Chart — Weight (boys 0–10y, WHO)</div>
          <div className="text-xs text-slate-500 mb-3">Baraka Juma · 9y · 26.4 kg · 50th percentile</div>
          <PercentileChart />
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">EPI Immunization Status</div>
          <div className="space-y-2 text-sm">
            {[
              { v: "BCG (birth)", done: true },
              { v: "OPV-0 / Hep B", done: true },
              { v: "OPV-1 / Penta-1 (6w)", done: true },
              { v: "OPV-2 / Penta-2 (10w)", done: true },
              { v: "OPV-3 / Penta-3 (14w)", done: true },
              { v: "Measles-1 (9m)", done: true },
              { v: "Measles-2 (18m)", done: true },
              { v: "Tetanus booster (school age)", done: false },
            ].map((x) => (
              <div key={x.v} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${x.done ? "bg-emerald-500" : "bg-slate-200"}`}>
                  {x.done && <I.check size={12} stroke="#fff" />}
                </div>
                <span className={`${x.done ? "text-navy-800" : "text-slate-400"}`}>{x.v}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            <strong>Due:</strong> Tetanus booster · schedule at next visit
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Vital Signs (last 24h)</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: "Temperature", v: "37.8 °C", d: "↓ from 39.2", c: "#dc2626" },
              { l: "Heart Rate", v: "98 bpm", d: "WNL for age", c: "#0B1D3A" },
              { l: "Resp Rate", v: "24 /min", d: "WNL", c: "#557345" },
              { l: "SpO₂", v: "96%", d: "On room air", c: "#1E3A8A" },
            ].map((v) => (
              <div key={v.l} className="rounded-lg bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">{v.l}</div>
                <div className="font-display text-xl mt-1" style={{ color: v.c }}>{v.v}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{v.d}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Care Plan</div>
          <div className="space-y-2 text-sm">
            {[
              { t: "Amoxicillin 250mg PO TDS × 7 days", c: "Started day 2" },
              { t: "Paracetamol 250mg PRN for fever", c: "PRN" },
              { t: "Nebulized salbutamol 2.5mg q6h", c: "Active" },
              { t: "Maintenance fluids @ 65 mL/hr", c: "IV" },
              { t: "Chest physiotherapy BD", c: "Scheduled" },
            ].map((r) => (
              <div key={r.t} className="flex items-start gap-2 p-2 rounded hover:bg-slate-50">
                <I.pill size={14} stroke="#0B1D3A" className="mt-0.5" />
                <div className="flex-1">
                  <div className="text-navy-800">{r.t}</div>
                  <div className="text-[11px] text-slate-500">{r.c}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PercentileChart() {
  const W = 600, H = 240, pad = 35;
  const ages = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const p50 = [3.3, 9.6, 12.2, 14.3, 16.3, 18.3, 20.5, 22.9, 25.4, 28.1, 31.2];
  const p3 = [2.4, 7.7, 9.7, 11.3, 12.7, 14.1, 15.7, 17.4, 19.3, 21.3, 23.7];
  const p97 = [4.4, 11.8, 15.3, 18.3, 21.2, 24.2, 27.5, 31.2, 35.1, 39.3, 44.0];
  const max = 50;
  const x = (a: number) => pad + (a / 10) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = (arr: number[]) => arr.map((v, i) => (i === 0 ? "M" : "L") + x(ages[i]) + "," + y(v)).join(" ");
  const patient = { age: 9, w: 26.4 };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {[0, 1, 2, 3, 4].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={pad + g * ((H - pad * 2) / 4)} y2={pad + g * ((H - pad * 2) / 4)} stroke="#eef0f5" />
      ))}
      <path d={path(p97)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={path(p50)} fill="none" stroke="#0B1D3A" strokeWidth="2.5" />
      <path d={path(p3)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
      {ages.map((a) => (
        <text key={a} x={x(a)} y={H - 12} fontSize="10" textAnchor="middle" fill="#64748b">{a}y</text>
      ))}
      <text x={x(10) + 4} y={y(p50[10])} fontSize="9" fill="#0B1D3A">50%</text>
      <text x={x(10) + 4} y={y(p97[10])} fontSize="9" fill="#94a3b8">97%</text>
      <text x={x(10) + 4} y={y(p3[10])} fontSize="9" fill="#94a3b8">3%</text>
      <circle cx={x(patient.age)} cy={y(patient.w)} r="6" fill="#D4AF37" stroke="#0B1D3A" strokeWidth="2" />
      <text x={x(patient.age)} y={y(patient.w) - 12} fontSize="10" textAnchor="middle" fill="#0B1D3A" fontWeight="bold">Baraka · 26.4kg</text>
    </svg>
  );
}

/* ─────────────────────────── ICU ─────────────────────────── */

export function ICUDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Intensive Care Unit (ICU)" subtitle="12 beds · 9 occupied · 1 awaiting transfer" />

      <div className="mb-4"><OnDutyStrip department="ICU" /></div>

      <div className="grid md:grid-cols-5 gap-4 mb-6">
        {[
          { t: "Occupancy", v: "9/12" },
          { t: "Ventilated", v: "5" },
          { t: "Vasopressors", v: "4" },
          { t: "Nurse : Patient", v: "1:2", c: "#557345" },
          { t: "Mortality (30d)", v: "12.4%" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c || "#0B1D3A" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <TeamRoster department="ICU" title="ICU Care Team" max={5} />
        <ShiftCoverage department="ICU" />
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Assigned Intensivist</div>
          <StaffChip e={byId("EMP-10012")} sub="On-call · 0700–1900" />
          <div className="text-[10px] text-slate-500 mt-3 tracking-widest">ESCALATION CHAIN</div>
          <ol className="text-xs text-slate-700 mt-1 space-y-0.5 list-decimal list-inside">
            <li>Bedside nurse</li>
            <li>Senior nurse (Grace Mushi)</li>
            <li>Intensivist on-call (Dr. R. Mhina)</li>
            <li>CMO (Dr. M. Achieng)</li>
          </ol>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {[
          { bed: "ICU-1", p: "Fatuma Ally", dx: "Septic shock", news: 9, vent: true, vaso: true, color: "rose" },
          { bed: "ICU-2", p: "Juma Mwangi", dx: "Post-op CABG", news: 4, vent: true, vaso: false, color: "amber" },
          { bed: "ICU-3", p: "Halima Said", dx: "ARDS (severe)", news: 8, vent: true, vaso: true, color: "rose" },
          { bed: "ICU-4", p: "Erick Mushi", dx: "TBI Glasgow 8", news: 6, vent: true, vaso: false, color: "amber" },
          { bed: "ICU-5", p: "Asha Ramadhani", dx: "Diabetic ketoacidosis", news: 5, vent: false, vaso: false, color: "amber" },
          { bed: "ICU-6", p: "Joseph Tesha", dx: "Acute pancreatitis", news: 3, vent: false, vaso: false, color: "emerald" },
          { bed: "ICU-7", p: "Maria Komba", dx: "Post-arrest", news: 7, vent: true, vaso: true, color: "rose" },
          { bed: "ICU-8", p: "Salim Bakari", dx: "Cardiogenic shock", news: 8, vent: false, vaso: true, color: "rose" },
          { bed: "ICU-9", p: "Neema Lyimo", dx: "Eclampsia post-partum", news: 4, vent: false, vaso: false, color: "amber" },
        ].map((b) => (
          <div key={b.bed} className={`card p-5 border-l-4 ${b.color === "rose" ? "border-l-rose-500" : b.color === "amber" ? "border-l-amber-500" : "border-l-emerald-500"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] tracking-widest text-slate-500">{b.bed}</div>
              <div className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                b.news >= 7 ? "bg-rose-100 text-rose-700" :
                b.news >= 5 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
              }`}>NEWS {b.news}</div>
            </div>
            <div className="font-semibold text-navy-800">{b.p}</div>
            <div className="text-xs text-slate-500 mt-0.5">{b.dx}</div>
            <div className="flex gap-2 mt-3">
              {b.vent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-800 text-white">VENT</span>}
              {b.vaso && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold-500 text-navy-900">VASO</span>}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">CVL</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── THEATRE / OR ─────────────────────────── */

export function TheatreDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Theatre / Operating Rooms" subtitle="4 ORs · 18 cases scheduled today" />

      <div className="mb-4"><OnDutyStrip department="Theatre" /></div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { t: "Cases Today", v: "18" },
          { t: "Completed", v: "7" },
          { t: "In Progress", v: "3" },
          { t: "Theatre Utilisation", v: "82%" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        {["OR-1", "OR-2", "OR-3", "OR-4"].map((or, i) => {
          const cases = [
            { time: "08:00", p: "Joseph Mwakyusa", proc: "CABG ×3", s: "In Progress", surg: "Dr. Mhina" },
            { time: "11:30", p: "Mariam Juma", proc: "Mastectomy (R)", s: "Pre-op", surg: "Dr. Achieng" },
            { time: "14:00", p: "Peter Mtui", proc: "Splenectomy", s: "Scheduled", surg: "Dr. Kessy" },
          ];
          const status = i === 0 ? "ACTIVE" : i === 1 ? "TURNOVER" : i === 2 ? "READY" : "CLEANING";
          const sc = i === 0 ? "bg-rose-100 text-rose-700" : i === 1 ? "bg-amber-100 text-amber-700" : i === 2 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700";
          return (
            <div key={or} className="card overflow-hidden">
              <div className="px-4 py-3 bg-navy-800 text-white flex items-center justify-between">
                <span className="font-display text-lg">{or}</span>
                <span className={`text-[10px] font-bold px-2 py-1 rounded ${sc}`}>{status}</span>
              </div>
              <div className="p-3 space-y-2">
                {cases.map((c, j) => (
                  <div key={j} className={`p-2 rounded-lg ${j === 0 ? "bg-gold-50 border border-gold-200" : "bg-slate-50"}`}>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-mono">{c.time}</span>
                      <span>{c.surg}</span>
                    </div>
                    <div className="text-sm font-medium text-navy-800 mt-1">{c.proc}</div>
                    <div className="text-[11px] text-slate-500">{c.p}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-3">WHO Surgical Safety Checklist — Current Case (OR-1)</div>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            {[
              { phase: "SIGN IN (before induction)", items: ["Patient ID confirmed", "Site marked", "Anaesthesia safety check", "Allergies reviewed", "Difficult airway risk assessed"] },
              { phase: "TIME OUT (before incision)", items: ["Team introduced", "Procedure confirmed", "Antibiotic prophylaxis given", "Imaging displayed", "Anticipated blood loss reviewed"] },
              { phase: "SIGN OUT (before leaving OR)", items: ["Procedure recorded", "Counts correct (instruments/sponges)", "Specimens labelled", "Equipment issues noted", "Recovery plan agreed"] },
            ].map((g) => (
              <div key={g.phase}>
                <div className="text-[11px] tracking-widest text-gold-700 mb-2">{g.phase}</div>
                <div className="space-y-1">
                  {g.items.map((it, k) => (
                    <div key={it} className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded flex items-center justify-center ${k < 4 || g.phase.includes("SIGN IN") ? "bg-emerald-500" : "bg-slate-200"}`}>
                        {(k < 4 || g.phase.includes("SIGN IN")) && <I.check size={10} stroke="#fff" />}
                      </div>
                      <span className="text-slate-700">{it}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <SurgicalTeam />
      </div>
    </div>
  );
}

/* ─────────────────────────── EMERGENCY / TRIAGE ─────────────────────────── */

export function EmergencyDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Emergency Department" subtitle="ESI triage · trauma · ambulance dispatch" />

      <div className="mb-4"><OnDutyStrip department="Emergency" /></div>

      <div className="grid md:grid-cols-5 gap-3 mb-6">
        {[
          { l: "ESI-1", n: 1, c: "bg-rose-600" },
          { l: "ESI-2", n: 4, c: "bg-rose-400" },
          { l: "ESI-3", n: 9, c: "bg-amber-500" },
          { l: "ESI-4", n: 12, c: "bg-emerald-500" },
          { l: "ESI-5", n: 6, c: "bg-emerald-300" },
        ].map((t) => (
          <div key={t.l} className="card p-4 text-center">
            <div className={`mx-auto w-12 h-12 rounded-full ${t.c} text-white flex items-center justify-center font-display text-xl`}>{t.n}</div>
            <div className="text-[11px] tracking-widest text-slate-500 mt-2">{t.l}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 overflow-x-auto">
          <div className="px-5 py-4 border-b border-slate-100 font-display text-lg text-navy-800">Triage Queue</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">ESI</th>
                <th className="text-left px-4 py-2.5">PATIENT</th>
                <th className="text-left px-4 py-2.5">COMPLAINT</th>
                <th className="text-left px-4 py-2.5">WAIT</th>
                <th className="text-left px-4 py-2.5">AI ACUITY</th>
              </tr>
            </thead>
            <tbody>
              {[
                { e: 1, p: "Unknown male, 40s", c: "Pedestrian RTA · GCS 7", w: "0 min", a: "Critical · Trauma activation" },
                { e: 2, p: "Asha Ramadhani", c: "Severe abdo pain · ?ectopic", w: "4 min", a: "High" },
                { e: 2, p: "Saidi Hassan", c: "Acute chest pain · diaphoretic", w: "6 min", a: "High · ACS likely" },
                { e: 3, p: "Mary Joseph", c: "Fever + headache · ?malaria", w: "18 min", a: "Moderate" },
                { e: 3, p: "Tumaini Mtui", c: "Lower limb fracture (closed)", w: "22 min", a: "Moderate" },
                { e: 4, p: "Issa Mwakyusa", c: "Ankle sprain", w: "44 min", a: "Low" },
              ].map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-bold ${
                      r.e === 1 ? "bg-rose-600" : r.e === 2 ? "bg-rose-400" : r.e === 3 ? "bg-amber-500" : "bg-emerald-500"
                    }`}>{r.e}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-navy-800">{r.p}</td>
                  <td className="px-4 py-3 text-slate-700">{r.c}</td>
                  <td className="px-4 py-3 text-xs font-mono">{r.w}</td>
                  <td className="px-4 py-3 text-xs text-gold-700">{r.a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Ambulance Status</div>
          <div className="space-y-2">
            {[
              { id: "AMB-01", s: "Returning · ETA 4 min", c: "amber" },
              { id: "AMB-02", s: "On scene · Kinondoni", c: "rose" },
              { id: "AMB-03", s: "Available · Base", c: "emerald" },
              { id: "AMB-04", s: "Maintenance", c: "slate" },
            ].map((a) => (
              <div key={a.id} className={`p-3 rounded-lg border ${
                a.c === "rose" ? "bg-rose-50 border-rose-200" :
                a.c === "amber" ? "bg-amber-50 border-amber-200" :
                a.c === "emerald" ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm text-navy-800">{a.id}</div>
                  <I.truck size={16} stroke="#0B1D3A" />
                </div>
                <div className="text-xs text-slate-600 mt-1">{a.s}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-navy-800 text-white p-3">
            <div className="text-[10px] tracking-widest text-gold-400">TRIAGE AI</div>
            <div className="text-sm mt-1">3 patients re-prioritized in the last hour based on vital trends.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── RADIOLOGY / PACS ─────────────────────────── */

export function RadiologyDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Radiology · RIS / PACS" subtitle="Worklist · DICOM viewer · AI triage" />

      <div className="mb-4 grid lg:grid-cols-[1fr_320px] gap-3">
        <OnDutyStrip department="Radiology" />
        <div className="card p-3 flex items-center gap-3">
          <span className="text-[10px] tracking-widest text-slate-500">LEAD RADIOGRAPHER:</span>
          <StaffChip e={byId("EMP-10033")} sub="Reading queue" />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { t: "Studies Today", v: "184" },
          { t: "Awaiting Read", v: "32" },
          { t: "Critical (AI)", v: "3" },
          { t: "TAT (median)", v: "47 min" },
        ].map((k) => (
          <div key={k.t} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.t}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 overflow-x-auto">
          <div className="px-5 py-4 border-b border-slate-100 font-display text-lg text-navy-800">Worklist</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">STUDY</th>
                <th className="text-left px-4 py-2.5">MODALITY</th>
                <th className="text-left px-4 py-2.5">PATIENT</th>
                <th className="text-left px-4 py-2.5">AI FINDING</th>
                <th className="text-left px-4 py-2.5">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {[
                { id: "ST-9821", m: "CT Head", p: "Unknown · trauma", ai: "Acute SDH (right) · 6mm — CRITICAL", crit: true, s: "Awaiting Read" },
                { id: "ST-9822", m: "CXR PA", p: "Baraka Juma", ai: "Right basal consolidation — likely pneumonia", crit: false, s: "Read" },
                { id: "ST-9823", m: "CT Chest", p: "Said Kibwana", ai: "RUL mass 38mm · spiculated", crit: true, s: "Awaiting Read" },
                { id: "ST-9824", m: "MRI Lumbar", p: "Joseph Tesha", ai: "L4/L5 disc protrusion", crit: false, s: "Reading" },
                { id: "ST-9825", m: "US Abdomen", p: "Asha Ramadhani", ai: "Free fluid pelvis — ?ectopic", crit: true, s: "Awaiting Read" },
                { id: "ST-9826", m: "Mammogram", p: "Mariam Juma", ai: "BI-RADS 4 right · biopsy advised", crit: false, s: "Read" },
              ].map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.id}</td>
                  <td className="px-4 py-3"><span className="text-[11px] px-2 py-0.5 rounded bg-navy-50 text-navy-700">{r.m}</span></td>
                  <td className="px-4 py-3 font-medium text-navy-800">{r.p}</td>
                  <td className={`px-4 py-3 text-xs ${r.crit ? "text-rose-700 font-semibold" : "text-slate-600"}`}>{r.ai}</td>
                  <td className="px-4 py-3"><span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">{r.s}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">DICOM Quick Viewer</div>
          <div className="aspect-square rounded-lg bg-gradient-to-br from-slate-900 to-black relative overflow-hidden">
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
              <ellipse cx="100" cy="100" rx="78" ry="92" fill="#1f2937" />
              <ellipse cx="100" cy="100" rx="65" ry="80" fill="#374151" />
              <circle cx="80" cy="85" r="14" fill="#4b5563" />
              <circle cx="120" cy="85" r="14" fill="#4b5563" />
              <ellipse cx="100" cy="120" rx="20" ry="10" fill="#4b5563" />
              <path d="M65 60 Q100 50 135 60" stroke="#fef3c7" strokeWidth="2" fill="none" />
              {/* hemorrhage hint */}
              <ellipse cx="135" cy="90" rx="12" ry="6" fill="#fff" opacity="0.7" />
              <rect x="130" y="85" width="22" height="14" stroke="#dc2626" strokeWidth="2" fill="none" rx="2" />
            </svg>
            <div className="absolute top-2 left-2 right-2 flex justify-between text-[10px] text-white/80 font-mono">
              <span>CT-HEAD · ST-9821</span><span>WW 80 / WL 40</span>
            </div>
            <div className="absolute bottom-2 left-2 right-2 flex justify-between text-[10px] text-white/80 font-mono">
              <span>Slice 24/48</span><span className="text-rose-400">AI: SDH detected</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button className="btn-outline text-xs !py-1.5">W/L</button>
            <button className="btn-outline text-xs !py-1.5">MPR</button>
            <button className="btn-primary text-xs !py-1.5">Sign-out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── TELEMEDICINE ─────────────────────────── */

export function TelemedicineDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Telemedicine" subtitle="Secure video · e-prescriptions · remote vitals" />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="aspect-video rounded-xl bg-gradient-to-br from-navy-900 to-navy-700 relative overflow-hidden">
            <div className="absolute inset-0 bg-dot opacity-20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center font-display text-5xl text-navy-900">N</div>
            </div>
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/90 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-white pulse-soft" />LIVE · 00:14:32</div>
              <div className="text-xs">End-to-end encrypted</div>
            </div>
            <div className="absolute bottom-4 left-4 text-white">
              <div className="font-display text-xl">Neema Mwangi</div>
              <div className="text-xs text-white/70">ANC Follow-up · BEYU-100484</div>
            </div>
            <div className="absolute bottom-24 right-4 w-32 h-24 rounded-lg bg-slate-700 ring-2 ring-white/30 flex items-center justify-center text-white text-xs">Dr. Mwangi</div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {["🎤", "📹", "💬", "📝", "📞"].map((e) => (
                <button key={e} className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-lg">{e}</button>
              ))}
              <button className="w-11 h-11 rounded-full bg-rose-500 text-white">✕</button>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Live Vitals (BLE)</div>
          <div className="space-y-3">
            {[
              { l: "Blood Pressure", v: "118 / 76", u: "mmHg", c: "#0B1D3A" },
              { l: "Heart Rate", v: "82", u: "bpm", c: "#dc2626" },
              { l: "SpO₂", v: "98", u: "%", c: "#1E3A8A" },
              { l: "Fetal HR", v: "142", u: "bpm", c: "#D4AF37" },
              { l: "Temperature", v: "36.7", u: "°C", c: "#557345" },
            ].map((v) => (
              <div key={v.l} className="flex items-center justify-between p-2 rounded hover:bg-slate-50">
                <div className="text-xs text-slate-500">{v.l}</div>
                <div className="text-right">
                  <span className="font-display text-xl" style={{ color: v.c }}>{v.v}</span>
                  <span className="text-[10px] text-slate-400 ml-1">{v.u}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            All vitals within normal limits. Auto-saved to EMR.
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Upcoming Tele-Consults</div>
          <div className="space-y-2">
            {[
              { t: "Today 16:00", p: "Esther Lema", r: "Follow-up · Migraine" },
              { t: "Tomorrow 09:15", p: "Salim Bakari", r: "Post-discharge review" },
              { t: "Tomorrow 11:00", p: "Maria Komba", r: "Diabetes coaching" },
              { t: "Fri 14:30", p: "Asha Ramadhani", r: "Lab result review" },
            ].map((c) => (
              <div key={c.t} className="p-3 rounded-lg border border-slate-200 flex items-center gap-3">
                <I.calendar size={16} stroke="#0B1D3A" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-navy-800">{c.p}</div>
                  <div className="text-[11px] text-slate-500">{c.r}</div>
                </div>
                <div className="text-[11px] text-gold-700 font-semibold">{c.t}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Session Quality</div>
          <div className="flex items-center gap-4">
            <DonutChart value={94} label="UPTIME" color="#557345" />
            <div className="flex-1 space-y-2 text-xs">
              <div className="flex justify-between"><span>Video latency</span><span className="font-mono text-navy-800">48 ms</span></div>
              <div className="flex justify-between"><span>Packet loss</span><span className="font-mono text-emerald-600">0.2 %</span></div>
              <div className="flex justify-between"><span>Encryption</span><span className="font-mono text-emerald-600">AES-256 GCM</span></div>
              <div className="flex justify-between"><span>Region</span><span className="font-mono text-navy-800">EAF-1 (Nairobi)</span></div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">Bandwidth (avg)</div>
            <ProgressBar value={68} />
          </div>
        </div>
      </div>
    </div>
  );
}
