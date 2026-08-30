import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, BarChart, DonutChart, ProgressBar } from "../components/Charts";
import { StaffChip, MyHRPanel, OnDutyStrip } from "../components/HRWidgets";
import { byId, EMPLOYEES, HR_KPIS } from "../services/hr";

/* ─────────────────────────── BILLING & REVENUE CYCLE ─────────────────────────── */

export function BillingScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Billing & Revenue Cycle"
        subtitle="Invoices · payments · NHIF claims · denial management · tax-orchestrated"
        actions={<button className="btn-primary text-sm">+ Generate Invoice</button>}
      />

      <div className="mb-4 rounded-xl bg-gradient-to-r from-emerald-50 to-violet-50 border border-emerald-200 p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center"><I.shield size={16} stroke="#fff" /></div>
        <div className="flex-1 text-sm">
          <strong className="text-emerald-800">Tax Orchestrator active</strong>
          <span className="text-slate-600"> — every invoice passes through 12 anti-double-taxation rules · healthcare exemptions auto-applied · EFD/VFD live.</span>
        </div>
        <span className="text-[10px] px-2 py-1 rounded bg-emerald-600 text-white font-bold tracking-widest">ZERO DUPLICATION</span>
      </div>

      <div className="mb-4"><OnDutyStrip department="Finance" /></div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Invoices Today", v: "284", d: "TZS 18.2M" },
          { l: "Outstanding AR", v: "TZS 84.2M", d: "−4.1% MoM" },
          { l: "NHIF Pending", v: "1,284", d: "92.4% success" },
          { l: "M-Pesa Today", v: "TZS 6.4M", d: "412 transactions" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-2xl text-navy-800 mt-1">{k.v}</div>
            <div className="text-[11px] text-emerald-600 mt-1">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5 lg:col-span-2 overflow-x-auto">
          <div className="font-display text-lg text-navy-800 mb-3">Recent Invoices</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-3 py-2.5">INVOICE</th>
                <th className="text-left px-3 py-2.5">PATIENT</th>
                <th className="text-left px-3 py-2.5">SERVICE</th>
                <th className="text-left px-3 py-2.5">AMOUNT</th>
                <th className="text-left px-3 py-2.5">PAYER</th>
                <th className="text-left px-3 py-2.5">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {[
                { i: "INV-77821", p: "Amina Hassan", s: "OPD + Lab", a: "184,000", pay: "NHIF", st: "Paid" },
                { i: "INV-77822", p: "Joseph Mwakyusa", s: "Cardiology + ECG + Echo", a: "412,000", pay: "Self-pay", st: "Pending" },
                { i: "INV-77823", p: "Baraka Juma", s: "IPD 7 days + meds", a: "640,000", pay: "NHIF", st: "Submitted" },
                { i: "INV-77824", p: "Hassan Mohamed", s: "Oncology cycle 3", a: "1,840,000", pay: "NHIF", st: "Paid" },
                { i: "INV-77825", p: "Daniel Kessy", s: "Dental RCT prep", a: "320,000", pay: "Jubilee", st: "Submitted" },
                { i: "INV-77826", p: "Esther Lema", s: "OPD consult", a: "45,000", pay: "M-Pesa", st: "Paid" },
                { i: "INV-77827", p: "Fatuma Ally", s: "ICU 7 days", a: "4,820,000", pay: "AAR", st: "Pre-auth" },
              ].map((r) => (
                <tr key={r.i} className="border-b border-slate-100">
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{r.i}</td>
                  <td className="px-3 py-3 font-medium text-navy-800">{r.p}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{r.s}</td>
                  <td className="px-3 py-3 font-semibold text-navy-800">TZS {r.a}</td>
                  <td className="px-3 py-3"><span className="text-[11px] px-2 py-0.5 rounded bg-navy-50 text-navy-700">{r.pay}</span></td>
                  <td className="px-3 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${
                      r.st === "Paid" ? "bg-emerald-100 text-emerald-700" :
                      r.st === "Submitted" ? "bg-navy-100 text-navy-700" :
                      r.st === "Pre-auth" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"
                    }`}>{r.st}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Aging Buckets</div>
          {[
            { l: "0–30 days", v: 62, a: "TZS 52.1M", c: "#557345" },
            { l: "31–60 days", v: 24, a: "TZS 20.2M", c: "#D4AF37" },
            { l: "61–90 days", v: 10, a: "TZS 8.4M", c: "#b45309" },
            { l: ">90 days", v: 4, a: "TZS 3.5M", c: "#dc2626" },
          ].map((b) => (
            <div key={b.l} className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600">{b.l}</span>
                <span className="font-mono text-navy-800">{b.a}</span>
              </div>
              <ProgressBar value={b.v} color={b.c} />
            </div>
          ))}
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            DSO improved by 6 days MoM. Auto-dunning enabled for &gt; 60d.
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Payment Methods (MTD)</div>
          <BarChart
            data={[
              { name: "NHIF", value: 184 },
              { name: "M-Pesa", value: 92 },
              { name: "Self-pay", value: 56 },
              { name: "Jubilee", value: 38 },
              { name: "AAR", value: 22 },
              { name: "Bank tfr", value: 14 },
            ]}
            height={200}
          />
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
    </div>
  );
}

/* ─────────────────────────── INVENTORY & PROCUREMENT ─────────────────────────── */

export function InventoryScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Inventory & Procurement" subtitle="Stores · purchase orders · suppliers · expiry tracking" actions={<button className="btn-primary text-sm">+ New PO</button>} />

      <div className="grid md:grid-cols-5 gap-4 mb-6">
        {[
          { l: "SKUs Tracked", v: "1,284" },
          { l: "Below Reorder", v: "42", c: "#dc2626" },
          { l: "Expiring < 90d", v: "28", c: "#b45309" },
          { l: "Open POs", v: "16" },
          { l: "Suppliers (active)", v: "84" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c || "#0B1D3A" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 overflow-x-auto">
          <div className="px-5 py-3 border-b border-slate-100 font-display text-lg text-navy-800">Active Purchase Orders</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-3 py-2.5">PO #</th>
                <th className="text-left px-3 py-2.5">SUPPLIER</th>
                <th className="text-left px-3 py-2.5">ITEMS</th>
                <th className="text-left px-3 py-2.5">VALUE</th>
                <th className="text-left px-3 py-2.5">ETA</th>
                <th className="text-left px-3 py-2.5">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {[
                { po: "PO-44128", s: "Sysmex Tanzania", i: "Hematology reagents × 12", v: "8.4M", eta: "12 May", st: "In Transit" },
                { po: "PO-44129", s: "Roche Diagnostics", i: "Cobas reagent packs × 6", v: "12.2M", eta: "15 May", st: "Confirmed" },
                { po: "PO-44130", s: "Pharmaplus EA", i: "Pip-Taz 4.5g × 500", v: "6.8M", eta: "9 May", st: "Shipped" },
                { po: "PO-44131", s: "MedSurg Africa", i: "Surgical gloves XL × 50k", v: "4.2M", eta: "18 May", st: "Awaiting Approval" },
                { po: "PO-44132", s: "BD Tanzania", i: "Vacutainers × 100k", v: "3.6M", eta: "20 May", st: "Confirmed" },
                { po: "PO-44133", s: "Philips EA", i: "Patient monitors × 4", v: "84.0M", eta: "30 Jun", st: "Awaiting Approval" },
              ].map((r) => (
                <tr key={r.po} className="border-b border-slate-100">
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{r.po}</td>
                  <td className="px-3 py-3 font-medium text-navy-800">{r.s}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{r.i}</td>
                  <td className="px-3 py-3 font-semibold">TZS {r.v}</td>
                  <td className="px-3 py-3 text-xs">{r.eta}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${
                      r.st === "Shipped" ? "bg-emerald-100 text-emerald-700" :
                      r.st === "In Transit" ? "bg-navy-100 text-navy-700" :
                      r.st === "Confirmed" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"
                    }`}>{r.st}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Critical Stock Alerts</div>
          <div className="space-y-2">
            {[
              { i: "Ceftriaxone 1g vials", s: 18, r: 100, c: "rose" },
              { i: "Salbutamol Inhaler", s: 12, r: 60, c: "rose" },
              { i: "Insulin glargine 100u", s: 28, r: 50, c: "amber" },
              { i: "ECG electrodes (pack)", s: 44, r: 80, c: "amber" },
              { i: "Saline 0.9% 1L", s: 184, r: 200, c: "amber" },
            ].map((m) => (
              <div key={m.i} className={`p-3 rounded-lg border ${m.c === "rose" ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200"}`}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-navy-800">{m.i}</span>
                  <span className="font-mono">{m.s}/{m.r}</span>
                </div>
                <ProgressBar value={(m.s / m.r) * 100} color={m.c === "rose" ? "#dc2626" : "#b45309"} />
              </div>
            ))}
            <button className="btn-primary w-full text-sm mt-2">Auto-Generate Reorder POs</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── AUDIT TRAIL ─────────────────────────── */

// Map audit actor string → an Employee id we know about, for HR-linked rendering
function actorToEmployee(actor: string) {
  if (actor.includes("j.doe")) return byId("EMP-10001");
  if (actor.includes("m.achieng")) return byId("EMP-10003");
  if (actor.includes("g.mushi")) return byId("EMP-10020");
  if (actor.includes("bakari")) return byId("EMP-10030");
  if (actor.includes("lucy")) return byId("EMP-10032");
  if (actor.includes("edith")) return byId("EMP-10002");
  return undefined;
}

export function AuditScreen() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Audit Trail & SIEM"
        subtitle="Every action auto-stamped with 7-field forensic record · immutable · 7-year retention"
        actions={
          <>
            <button className="btn-outline text-sm">Export CSV</button>
            <button className="btn-primary text-sm">Open Compliance Pack →</button>
          </>
        }
      />

      <div className="mb-4 rounded-xl bg-gradient-to-r from-violet-50 via-emerald-50 to-gold-50 border border-violet-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center"><I.shield size={18} stroke="#fff" /></div>
          <div className="flex-1">
            <div className="font-display text-base text-navy-800">Auto-Stamped Transaction Model</div>
            <div className="text-xs text-slate-600 mt-1">
              Every audit record below captures the 7 mandatory data points required by the Tanzania Electronic Transactions Act
              and Evidence Act: <strong>User ID · Professional License · Facility ID · Timestamp · Location · Action · Cryptographic Hash</strong>.
              Open the Compliance Pack module for full forensic detail.
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Events (24h)", v: "48,712" },
          { l: "Policy Violations", v: "0", c: "#059669" },
          { l: "Failed Logins", v: "12", c: "#b45309" },
          { l: "Cross-Tenant Attempts", v: "0", c: "#059669" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c || "#0B1D3A" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="card p-5 mb-4">
        <div className="font-display text-lg text-navy-800 mb-3">Live Audit Stream</div>
        <div className="space-y-1 text-xs font-mono max-h-[480px] overflow-y-auto">
          {[
            { t: "14:42:18", a: "doctor.j.doe", e: "READ_EMR", r: "BEYU-100486 · ICU Vitals", s: "ok", ip: "10.42.1.18" },
            { t: "14:42:05", a: "ai.copilot.v2", e: "SUGGEST", r: "Sepsis bundle compliance · BEYU-100486", s: "ai", ip: "—" },
            { t: "14:41:50", a: "system.nhif", e: "CLAIM_SUBMIT", r: "CLM-44132 (TZS 1,840,000)", s: "ok", ip: "10.0.4.2" },
            { t: "14:41:32", a: "nurse.g.mushi", e: "VITALS_RECORD", r: "Ward A · 4 patients", s: "ok", ip: "10.42.2.7" },
            { t: "14:41:18", a: "admin.system", e: "TENANT_SWITCH", r: "MUH-DSM-01 → AGA-DSM-02", s: "warn", ip: "10.42.1.4" },
            { t: "14:41:02", a: "ai.coding.v1", e: "ICD_SUGGEST", r: "I21.9 · Acute MI (confidence 0.94)", s: "ai", ip: "—" },
            { t: "14:40:48", a: "patient.portal", e: "CONSENT_GRANT", r: "BEYU-100484 → share records to ARU-MED-03", s: "ok", ip: "Mobile" },
            { t: "14:40:30", a: "pharma.bakari", e: "DISPENSE", r: "RX-08821 · Amoxicillin × 21", s: "ok", ip: "10.42.5.12" },
            { t: "14:40:15", a: "system.mpi", e: "MERGE", r: "BEYU-099812 ⇆ BEYU-100501 sim 0.97", s: "ok", ip: "—" },
            { t: "14:40:02", a: "fail.unknown", e: "AUTH_FAIL", r: "user not found · attempt 1/3", s: "warn", ip: "203.0.113.42" },
            { t: "14:39:48", a: "doctor.m.achieng", e: "PRESCRIBE", r: "Norepinephrine titration · BEYU-100486", s: "ok", ip: "10.42.1.22" },
            { t: "14:39:32", a: "lab.lucy", e: "RESULT_RELEASE", r: "LIS-22842 · Blood culture E. coli", s: "ok", ip: "10.42.3.4" },
            { t: "14:39:18", a: "ai.radiology.v1", e: "FLAG_CRITICAL", r: "ST-9821 · Acute SDH right", s: "ai", ip: "—" },
            { t: "14:39:02", a: "system.audit", e: "EXPORT", r: "CSV export by edith.sanga (1,284 rows)", s: "ok", ip: "10.42.4.1" },
            { t: "14:38:48", a: "system.chain", e: "ANCHOR", r: "DOC-INV-003 · Term Sheet hash", s: "ok", ip: "—" },
            { t: "14:38:32", a: "ceo.j.doe", e: "VIEW", r: "Executive Dashboard · all tenants", s: "ok", ip: "10.42.1.1" },
          ].map((r, i) => {
            const emp = actorToEmployee(r.a);
            return (
              <div key={i} className="grid grid-cols-[80px_220px_140px_1fr_90px_50px] gap-2 py-1 border-b border-slate-50 hover:bg-slate-50 items-center">
                <span className="text-slate-500">{r.t}</span>
                <span className="truncate">
                  {emp ? <StaffChip e={emp} /> : <span className="text-navy-800">{r.a}</span>}
                </span>
                <span className="text-violet-700">{r.e}</span>
                <span className="text-slate-600 truncate">{r.r}</span>
                <span className="text-slate-400 truncate">{r.ip}</span>
                <span className={`text-right font-bold ${r.s === "warn" ? "text-amber-600" : r.s === "ai" ? "text-violet-700" : "text-emerald-600"}`}>{r.s.toUpperCase()}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Event Categories (24h)</div>
          <div className="space-y-2 text-sm">
            {[
              { l: "EMR Read", v: 18412, c: "#0B1D3A" },
              { l: "Clinical Write", v: 8284, c: "#557345" },
              { l: "AI Decisions", v: 8412, c: "#7c3aed" },
              { l: "Billing / Claims", v: 6128, c: "#D4AF37" },
              { l: "Admin / Auth", v: 4284, c: "#1E3A8A" },
              { l: "Chain Anchor", v: 3192, c: "#0d9488" },
            ].map((c) => (
              <div key={c.l} className="flex items-center gap-2">
                <span className="w-2 h-5 rounded" style={{ background: c.c }} />
                <span className="flex-1 text-slate-700">{c.l}</span>
                <span className="font-mono text-navy-800">{c.v.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-2">Event Volume (last 24h)</div>
          <LineChart
            data={[
              { m: "00", v: 1240 }, { m: "03", v: 820 }, { m: "06", v: 1480 }, { m: "09", v: 3120 },
              { m: "12", v: 4280 }, { m: "15", v: 4612 }, { m: "18", v: 3840 }, { m: "21", v: 2410 },
            ]}
            height={200}
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── NOTIFICATIONS CENTER ─────────────────────────── */

export function NotificationsScreen() {
  const groups = [
    {
      label: "Critical · Acknowledge required",
      items: [
        { t: "Critical lab — BEYU-100486", d: "Blood culture: E. coli bacteraemia", time: "1 min ago", color: "rose" },
        { t: "Radiology AI flag", d: "ST-9821 · Acute right SDH detected (confidence 0.96)", time: "8 min ago", color: "rose" },
      ],
    },
    {
      label: "Warnings",
      items: [
        { t: "Low stock — Ceftriaxone 1g", d: "18 vials left vs reorder 100", time: "24 min ago", color: "amber" },
        { t: "NHIF claim returned", d: "CLM-44131 · missing pre-auth", time: "1 h ago", color: "amber" },
        { t: "Credential expiry", d: "Dr. Salim Said · MCT license expires in 14 days", time: "2 h ago", color: "amber" },
      ],
    },
    {
      label: "Informational",
      items: [
        { t: "NHIF batch reconciled", d: "Batch 44-A · 412 claims · TZS 84M", time: "12 min ago", color: "emerald" },
        { t: "Theatre OR-2 ready", d: "Next case at 11:00", time: "30 min ago", color: "emerald" },
        { t: "Document signed", d: "DOC-INV-003 Term Sheet · party 2/3", time: "1 h ago", color: "violet" },
        { t: "MPI auto-merge", d: "3 duplicates merged today (similarity ≥ 0.96)", time: "3 h ago", color: "navy" },
        { t: "Backup completed", d: "Daily snapshot · 412 GB · KE region", time: "6 h ago", color: "navy" },
      ],
    },
  ];

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Notifications Center"
        subtitle="Real-time alerts across clinical · operational · governance"
        actions={
          <>
            <button className="btn-outline text-sm">Mark All Read</button>
            <button className="btn-primary text-sm">Preferences</button>
          </>
        }
      />

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Critical", v: "2", c: "#dc2626" },
          { l: "Warning", v: "3", c: "#b45309" },
          { l: "Info", v: "12", c: "#0B1D3A" },
          { l: "AI / Chain", v: "8", c: "#7c3aed" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="text-[10px] tracking-[0.25em] text-slate-500 font-semibold mb-2">{g.label.toUpperCase()}</div>
            <div className="card overflow-hidden">
              {g.items.map((n, i) => (
                <div
                  key={n.t}
                  className={`p-4 flex items-start gap-3 ${i > 0 ? "border-t border-slate-100" : ""} hover:bg-slate-50`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    n.color === "rose" ? "bg-rose-100" :
                    n.color === "amber" ? "bg-amber-100" :
                    n.color === "emerald" ? "bg-emerald-100" :
                    n.color === "violet" ? "bg-violet-100" : "bg-navy-100"
                  }`}>
                    <I.bell size={16} stroke={
                      n.color === "rose" ? "#dc2626" :
                      n.color === "amber" ? "#b45309" :
                      n.color === "emerald" ? "#059669" :
                      n.color === "violet" ? "#7c3aed" : "#0B1D3A"
                    } />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-navy-800">{n.t}</div>
                    <div className="text-xs text-slate-600">{n.d}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{n.time}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button className="text-[11px] px-2 py-1 rounded hover:bg-slate-200 text-slate-600">Snooze</button>
                    <button className="text-[11px] px-2 py-1 rounded bg-navy-800 text-white">Acknowledge</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── PROFILE ─────────────────────────── */

export function ProfileScreen({ name, role }: { name: string; role: string }) {
  // Best-effort match to an HR record
  const match = EMPLOYEES.find((e) => e.name === name) || EMPLOYEES[0];
  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="My Profile" subtitle="Identity · credentials · sessions · HR · on-chain wallet" />

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-6 lg:col-span-2 bg-gradient-to-r from-navy-800 to-navy-900 text-white">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-navy-900 flex items-center justify-center text-3xl font-display font-bold ring-2 ring-gold-300/50">
              {name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>
            <div className="flex-1">
              <div className="font-display text-2xl">{name}</div>
              <div className="text-sm text-white/70">{role}</div>
              <div className="text-[11px] text-white/50 mt-1 font-mono">EMP-10042 · joined 2024-08-12</div>
            </div>
            <button className="btn-gold text-xs !py-2">Edit Profile</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {[
              { l: "Tenants", v: "5" },
              { l: "Encounters MTD", v: "284" },
              { l: "AI Interactions", v: "1,284" },
              { l: "On-Chain Signatures", v: "42" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-white/10 px-3 py-2">
                <div className="text-[10px] text-white/60">{s.l}</div>
                <div className="font-display text-lg text-gold-300">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Active Sessions</div>
          <div className="space-y-2">
            {[
              { d: "Chrome · macOS · Dar es Salaam", t: "This device · now", c: true },
              { d: "BEYU iOS · iPhone 15", t: "2 hours ago", c: false },
              { d: "Edge · Windows · Office", t: "Yesterday", c: false },
            ].map((s) => (
              <div key={s.d} className={`p-3 rounded border ${s.c ? "border-emerald-200 bg-emerald-50" : "border-slate-200"}`}>
                <div className="text-sm font-medium text-navy-800">{s.d}</div>
                <div className="text-[11px] text-slate-500">{s.t}</div>
                {s.c && <div className="text-[10px] text-emerald-700 font-semibold mt-1">CURRENT</div>}
              </div>
            ))}
            <button className="btn-outline w-full text-xs !py-2 mt-2">Sign Out All Others</button>
          </div>
        </div>
      </div>

      <MyHRPanel id={match.id} />

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Credentials</div>
          <div className="space-y-2 text-sm">
            <div className="p-3 rounded border border-emerald-200 bg-emerald-50">
              <div className="text-[10px] tracking-widest text-emerald-700">MCT LICENSE</div>
              <div className="font-medium text-navy-800">MD-2018-12442</div>
              <div className="text-[11px] text-slate-500">Valid until 2027-08-12</div>
            </div>
            <div className="p-3 rounded border border-emerald-200 bg-emerald-50">
              <div className="text-[10px] tracking-widest text-emerald-700">SPECIALIST</div>
              <div className="font-medium text-navy-800">Internal Medicine · ECSA</div>
              <div className="text-[11px] text-slate-500">Valid until 2028-03-04</div>
            </div>
            <div className="p-3 rounded border border-emerald-200 bg-emerald-50">
              <div className="text-[10px] tracking-widest text-emerald-700">CPD</div>
              <div className="font-medium text-navy-800">42 / 40 hours (2026)</div>
              <div className="text-[11px] text-slate-500">Compliant</div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Security</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between p-2 rounded hover:bg-slate-50">
              <div className="flex items-center gap-2"><I.fingerprint size={16} stroke="#0B1D3A" /> Biometric MFA</div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">ENABLED</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded hover:bg-slate-50">
              <div className="flex items-center gap-2"><I.lock size={16} stroke="#0B1D3A" /> Hardware key (YubiKey)</div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">ENABLED</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded hover:bg-slate-50">
              <div className="flex items-center gap-2"><I.device size={16} stroke="#0B1D3A" /> SMS backup</div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-600">DISABLED</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded hover:bg-slate-50">
              <div className="flex items-center gap-2"><I.shield size={16} stroke="#0B1D3A" /> Session recording</div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">ON</span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">On-Chain Wallet</div>
          <div className="text-[11px] text-slate-500 mb-1">SIGNING ADDRESS</div>
          <div className="font-mono text-xs text-violet-700 break-all bg-violet-50 p-2 rounded">0x8f4Ab9...c712E04D</div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <div className="font-display text-xl text-navy-800">42</div>
              <div className="text-[10px] tracking-widest text-slate-500">SIGNATURES</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <div className="font-display text-xl text-navy-800">8</div>
              <div className="text-[10px] tracking-widest text-slate-500">CONSENTS</div>
            </div>
          </div>
          <button className="btn-outline w-full text-xs !py-2 mt-3">Rotate Key</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── OPERATING COMPANIES ─────────────────────────── */

const OPCOS = [
  { n: "BEYU Health Corp", desc: "Hospitals, EMR/EHR, telemedicine", revenue: "TZS 324M", growth: 15.7, staff: 612, color: "#0B1D3A", icon: "heart", flag: "Flagship" },
  { n: "BEYU FinTech", desc: "Patient credit, insurance rails, M-Pesa", revenue: "TZS 84M", growth: 28.4, staff: 38, color: "#D4AF37", icon: "cash" },
  { n: "BEYU Logistics", desc: "Medical supply chain, cold chain", revenue: "TZS 62M", growth: 18.2, staff: 86, color: "#557345", icon: "truck" },
  { n: "BEYU Insurance", desc: "Health micro-insurance products", revenue: "TZS 48M", growth: 22.1, staff: 24, color: "#7c3aed", icon: "shield" },
  { n: "BEYU Real Estate", desc: "Hospital & clinic property holdings", revenue: "TZS 38M", growth: 6.4, staff: 12, color: "#b45309", icon: "building" },
  { n: "BEYU Research", desc: "Clinical trials, R&D, publications", revenue: "TZS 24M", growth: 42.8, staff: 48, color: "#be123c", icon: "flask" },
  { n: "BEYU Education", desc: "Medical training, CPD academy", revenue: "TZS 18M", growth: 36.2, staff: 32, color: "#0891b2", icon: "bulb" },
  { n: "BEYU Mining", desc: "Strategic mineral interests (Trust)", revenue: "TZS 142M", growth: 8.1, staff: 18, color: "#475569", icon: "star" },
  { n: "BEYU Energies", desc: "Hospital solar microgrids", revenue: "TZS 12M", growth: 84.6, staff: 22, color: "#0d9488", icon: "zap" },
  { n: "BEYU Agriculture", desc: "Nutrition & community health", revenue: "TZS 14M", growth: 31.4, staff: 64, color: "#16a34a", icon: "leaf" },
  { n: "BEYU Corporate Services", desc: "Shared back-office for all OpCos", revenue: "TZS 8M", growth: 12.8, staff: 42, color: "#1E3A8A", icon: "settings" },
];

export function OpCosScreen() {
  const totalRev = OPCOS.reduce((s, o) => s + parseFloat(o.revenue.replace(/[^\d.]/g, "")), 0);
  const totalStaff = OPCOS.reduce((s, o) => s + o.staff, 0);

  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Operating Companies" subtitle="11 OpCos executing the BEYU mission across sectors" />

      <div className="grid md:grid-cols-5 gap-4 mb-6">
        {[
          { l: "Operating Companies", v: "11" },
          { l: "Combined Revenue MTD", v: `TZS ${totalRev.toFixed(0)}M` },
          { l: "Total Staff", v: totalStaff.toLocaleString() },
          { l: "HR Service Headcount", v: HR_KPIS.headcount.toString(), s: "live · platform-wide" },
          { l: "Avg Growth (YoY)", v: "+25.0%" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-2xl text-navy-800 mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {OPCOS.map((o) => {
          const Ico = I[o.icon as keyof typeof I];
          return (
            <div key={o.n} className="card p-5 relative overflow-hidden hover:-translate-y-0.5 transition cursor-pointer" style={{ borderTopColor: o.color, borderTopWidth: 4 }}>
              {o.flag && (
                <span className="absolute top-3 right-3 text-[9px] px-2 py-0.5 rounded bg-gold-500 text-navy-900 font-bold tracking-wider">{o.flag.toUpperCase()}</span>
              )}
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${o.color}15` }}>
                  <Ico size={20} stroke={o.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-lg text-navy-800">{o.n}</div>
                  <div className="text-[11px] text-slate-500">{o.desc}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="rounded bg-slate-50 p-2 text-center">
                  <div className="text-sm font-semibold text-navy-800">{o.revenue}</div>
                  <div className="text-[9px] tracking-widest text-slate-500">REVENUE</div>
                </div>
                <div className="rounded bg-slate-50 p-2 text-center">
                  <div className="text-sm font-semibold text-emerald-600">+{o.growth}%</div>
                  <div className="text-[9px] tracking-widest text-slate-500">GROWTH</div>
                </div>
                <div className="rounded bg-slate-50 p-2 text-center">
                  <div className="text-sm font-semibold text-navy-800">{o.staff}</div>
                  <div className="text-[9px] tracking-widest text-slate-500">STAFF</div>
                </div>
              </div>
              <button className="text-xs text-gold-700 font-semibold mt-3 hover:underline">Open OpCo dashboard →</button>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Revenue by OpCo (MTD · TZS M)</div>
          <BarChart data={OPCOS.map((o) => ({ name: o.n.replace("BEYU ", ""), value: parseFloat(o.revenue.replace(/[^\d.]/g, "")) }))} height={240} />
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Group Allocation by Trust</div>
          <div className="flex items-center gap-4">
            <DonutChart value={84} label="DEPLOYED" color="#7c3aed" />
            <div className="flex-1 space-y-2 text-xs">
              <div className="flex justify-between"><span>Healthcare OpCos</span><span className="font-mono">62%</span></div>
              <div className="flex justify-between"><span>Adjacent (FinTech, Insurance)</span><span className="font-mono">14%</span></div>
              <div className="flex justify-between"><span>Strategic (Mining, RE, Energy)</span><span className="font-mono">18%</span></div>
              <div className="flex justify-between"><span>Reserve (Trust)</span><span className="font-mono">6%</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
