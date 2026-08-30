import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { DonutChart, ProgressBar, BarChart } from "../components/Charts";
import { Classification } from "../components/Security";
import { COMPLIANCE_PACK, COMPLIANCE_KPIS, TRANSACTIONS, type Regulation, type TransactionStamp } from "../services/compliance";

/* ═══════════════════════════════════════════════════════════════════════════
   BEYU COMPLIANCE PACK — Tanzania
   Auto-stamped transactions + 20-section regulatory library
   ═══════════════════════════════════════════════════════════════════════════ */

export function ComplianceScreen() {
  const [tab, setTab] = useState<"overview" | "transactions" | "library" | "matrix" | "evidence">("overview");

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Mandatory Compliance Pack · Tanzania"
        subtitle="Auto-stamped transactions · 20-section regulatory library · live posture"
        actions={
          <>
            <Classification level="RESTRICTED" />
            <button className="btn-outline text-sm">Audit-Ready PDF</button>
            <button className="btn-primary text-sm">Compliance Officer Console</button>
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
              <I.shield size={14} stroke="#D4AF37" /> COMPLIANCE OVERALL POSTURE
            </div>
            <h2 className="font-display text-3xl mt-2">
              <span className="text-gold-400">{COMPLIANCE_KPIS.pct}% Compliant</span> with Tanzania Mandatory Compliance Pack
            </h2>
            <p className="text-white/80 mt-2 text-sm max-w-xl">
              {COMPLIANCE_KPIS.totalRegs} regulations · {COMPLIANCE_KPIS.sections} regulatory sections (A–T) · enforced platform-wide.
              Every transaction is auto-stamped and cryptographically signed.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">PDPC · DPO appointed</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">ISO 27001 certified</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">ISO 15189 lab-aligned</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">NHIF accredited</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center min-w-[280px]">
            <div className="rounded-xl bg-white/10 border border-white/15 p-3">
              <div className="font-display text-2xl text-emerald-300">{COMPLIANCE_KPIS.compliant}</div>
              <div className="text-[9px] tracking-widest text-white/60 mt-0.5">FULLY COMPLIANT</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 p-3">
              <div className="font-display text-2xl text-amber-300">{COMPLIANCE_KPIS.partial}</div>
              <div className="text-[9px] tracking-widest text-white/60 mt-0.5">PARTIAL</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 p-3">
              <div className="font-display text-2xl text-gold-300">{COMPLIANCE_KPIS.transactionsToday.toLocaleString()}</div>
              <div className="text-[9px] tracking-widest text-white/60 mt-0.5">TXN AUTO-STAMPED · 24h</div>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 p-3">
              <div className="font-display text-2xl text-violet-300">{COMPLIANCE_KPIS.transactionsAnchored.toLocaleString()}</div>
              <div className="text-[9px] tracking-widest text-white/60 mt-0.5">CHAIN-ANCHORED</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-5">
        {[
          { id: "overview", l: "Posture Overview" },
          { id: "transactions", l: "Auto-Stamped Transactions" },
          { id: "library", l: "Regulatory Library (A–T)" },
          { id: "matrix", l: "Compliance Matrix" },
          { id: "evidence", l: "Audit Evidence Vault" },
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
      {tab === "transactions" && <TransactionsTab />}
      {tab === "library" && <LibraryTab />}
      {tab === "matrix" && <MatrixTab />}
      {tab === "evidence" && <EvidenceTab />}
    </div>
  );
}

/* ─────────────────── Overview Tab ─────────────────── */

function OverviewTab() {
  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Regulatory Sections", v: COMPLIANCE_KPIS.sections.toString(), s: "A through T", c: "#0B1D3A" },
          { l: "Total Regulations", v: COMPLIANCE_KPIS.totalRegs.toString(), s: "live mapped", c: "#1E3A8A" },
          { l: "Compliance Score", v: `${COMPLIANCE_KPIS.pct}%`, s: "weighted", c: "#059669" },
          { l: "Audit Events (30d)", v: `${(COMPLIANCE_KPIS.auditEventsThisMonth / 1000).toFixed(0)}k`, s: "immutable", c: "#7c3aed" },
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
          <div className="font-display text-lg text-navy-800 mb-2">Overall Posture</div>
          <div className="flex justify-center mb-3">
            <DonutChart value={COMPLIANCE_KPIS.pct} label="COMPLIANT" color="#059669" />
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 rounded bg-emerald-500" />
              <span className="flex-1 text-slate-700">Compliant</span>
              <span className="font-mono font-bold text-navy-800">{COMPLIANCE_KPIS.compliant}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 rounded bg-amber-500" />
              <span className="flex-1 text-slate-700">Partial</span>
              <span className="font-mono font-bold text-navy-800">{COMPLIANCE_KPIS.partial}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 rounded bg-slate-400" />
              <span className="flex-1 text-slate-700">In Progress</span>
              <span className="font-mono font-bold text-navy-800">{COMPLIANCE_KPIS.inProgress}</span>
            </div>
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-2">Compliance by Section (A–T)</div>
          <BarChart
            data={COMPLIANCE_PACK.map(s => ({
              name: s.letter,
              value: Math.round((s.regulations.filter(r => r.status === "COMPLIANT").length / s.regulations.length) * 100),
            }))}
            height={240}
          />
          <div className="text-[11px] text-slate-500 mt-1">% of regulations fully compliant per section</div>
        </div>
      </div>

      <div className="card p-5 mb-6 bg-gradient-to-br from-emerald-50 to-violet-50">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-emerald-600 flex items-center justify-center"><I.check size={24} stroke="#fff" /></div>
          <div className="flex-1">
            <div className="font-display text-xl text-navy-800">Every Transaction is Auto-Stamped</div>
            <p className="text-sm text-slate-700 mt-1 max-w-3xl">
              Each action across BEYU Health OS automatically generates a cryptographically-signed,
              chain-anchored transaction record containing the 7 mandatory data points required
              for forensic auditability and legal admissibility under the Tanzania Electronic
              Transactions Act and Evidence Act.
            </p>
            <div className="grid md:grid-cols-4 gap-2 mt-4">
              {[
                { i: "user", l: "User ID + Name + Role" },
                { i: "doc", l: "Professional License #" },
                { i: "building", l: "Facility ID" },
                { i: "calendar", l: "Timestamp (ms precision)" },
                { i: "globe", l: "Location (Geo + IP)" },
                { i: "zap", l: "Action Performed" },
                { i: "shield", l: "Cryptographic Hash" },
                { i: "lock", l: "On-Chain Anchor" },
              ].map(m => {
                const Ico = I[m.i as keyof typeof I];
                return (
                  <div key={m.l} className="rounded bg-white border border-slate-200 px-2 py-2 flex items-center gap-2">
                    <Ico size={12} stroke="#7c3aed" />
                    <span className="text-[11px] text-navy-800">{m.l}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
        {COMPLIANCE_PACK.slice(0, 5).map(s => {
          const Ico = I[s.icon as keyof typeof I];
          const compliant = s.regulations.filter(r => r.status === "COMPLIANT").length;
          const pct = Math.round((compliant / s.regulations.length) * 100);
          return (
            <div key={s.id} className="card p-4" style={{ borderTopColor: s.color, borderTopWidth: 4 }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] tracking-widest text-slate-500 font-bold">{s.letter}</span>
                <Ico size={16} stroke={s.color} />
              </div>
              <div className="font-display text-sm text-navy-800 leading-tight">{s.title}</div>
              <div className="text-[10px] text-slate-500 mt-1">{s.regulations.length} regulations</div>
              <div className="mt-2"><ProgressBar value={pct} color={pct === 100 ? "#059669" : pct >= 80 ? "#b45309" : "#dc2626"} /></div>
              <div className="text-[10px] font-mono text-navy-800 mt-1">{pct}%</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─────────────────── Transactions Tab ─────────────────── */

function TransactionsTab() {
  const [selected, setSelected] = useState<TransactionStamp | null>(TRANSACTIONS[0]);
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Transactions Today", v: COMPLIANCE_KPIS.transactionsToday.toLocaleString(), c: "#0B1D3A" },
          { l: "Chain-Anchored", v: COMPLIANCE_KPIS.transactionsAnchored.toLocaleString(), c: "#7c3aed" },
          { l: "AI Decisions", v: "8,412", c: "#D4AF37" },
          { l: "Cross-Tenant Blocked", v: "0", c: "#059669" },
        ].map(k => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-4">
        {/* Transaction stream */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="font-display text-lg text-navy-800">Live Auto-Stamped Transaction Stream</div>
            <span className="text-[10px] px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-bold tracking-widest">LIVE</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {TRANSACTIONS.map(tx => (
              <button
                key={tx.txId}
                onClick={() => setSelected(tx)}
                className={`w-full text-left p-4 hover:bg-slate-50 transition ${selected?.txId === tx.txId ? "bg-violet-50 border-l-4 border-l-violet-500" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    tx.result === "SUCCESS" ? "bg-emerald-100" :
                    tx.result === "WARNING" ? "bg-amber-100" :
                    tx.result === "DENIED" ? "bg-rose-100" : "bg-slate-100"
                  }`}>
                    <I.shield size={16} stroke={
                      tx.result === "SUCCESS" ? "#059669" :
                      tx.result === "WARNING" ? "#b45309" :
                      tx.result === "DENIED" ? "#dc2626" : "#64748b"
                    } />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-[10px] text-violet-700">{tx.txId}</span>
                      {tx.chainHash && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold tracking-widest">⛓ ANCHORED</span>}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-widest ${
                        tx.result === "SUCCESS" ? "bg-emerald-100 text-emerald-700" :
                        tx.result === "WARNING" ? "bg-amber-100 text-amber-700" :
                        tx.result === "DENIED" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
                      }`}>{tx.result}</span>
                    </div>
                    <div className="text-sm font-semibold text-navy-800">{tx.action}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5 truncate">{tx.resource}</div>
                    <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-x-3">
                      <span>👤 {tx.userName}</span>
                      <span>🏥 {tx.facilityId}</span>
                      <span className="font-mono">{tx.localTime}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="card p-5 h-fit lg:sticky lg:top-20">
          {selected ? <TransactionDetail tx={selected} /> : (
            <div className="text-center py-10 text-slate-400">Select a transaction to view forensic detail</div>
          )}
        </div>
      </div>
    </>
  );
}

function TransactionDetail({ tx }: { tx: TransactionStamp }) {
  const fields = [
    { l: "Transaction ID", v: tx.txId, mono: true, copy: true },
    { l: "Timestamp (UTC)", v: tx.timestamp, mono: true },
    { l: "Local Time", v: tx.localTime, mono: true },
    { l: "User ID", v: tx.userId, mono: true },
    { l: "User Name", v: tx.userName },
    { l: "Role", v: tx.userRole },
    { l: "Professional License", v: tx.licenseNumber || "— (non-clinical)", mono: !!tx.licenseNumber },
    { l: "Facility ID", v: tx.facilityId, mono: true },
    { l: "Facility Name", v: tx.facilityName },
    { l: "Department", v: tx.department },
    { l: "Geolocation", v: `${tx.location.city} · ${tx.location.lat.toFixed(4)}, ${tx.location.lng.toFixed(4)}`, mono: true },
    { l: "Source IP", v: tx.location.ip, mono: true },
    { l: "Action Performed", v: tx.action, mono: true, highlight: true },
    { l: "Resource Affected", v: tx.resource },
    { l: "Result", v: tx.result, highlight: true },
    ...(tx.aiAgent ? [{ l: "AI Agent", v: tx.aiAgent, mono: true }] : []),
    ...(tx.chainHash ? [{ l: "On-Chain Hash", v: tx.chainHash, mono: true, copy: true }] : []),
    { l: "Record Hash (SHA-256)", v: tx.recordHash, mono: true, copy: true },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Classification level="CONFIDENTIAL" />
        <span className={`text-[10px] px-2 py-0.5 rounded font-bold tracking-widest ${
          tx.result === "SUCCESS" ? "bg-emerald-100 text-emerald-700" :
          tx.result === "WARNING" ? "bg-amber-100 text-amber-700" :
          "bg-rose-100 text-rose-700"
        }`}>{tx.result}</span>
        {tx.chainHash && <span className="text-[10px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-bold tracking-widest">⛓ ANCHORED</span>}
      </div>
      <div className="font-display text-lg text-navy-800 mb-1">Forensic Detail</div>
      <div className="text-xs text-slate-500 mb-4">Auto-stamped record · admissible under Evidence Act</div>

      <div className="space-y-1.5">
        {fields.map(f => (
          <div key={f.l} className={`px-3 py-2 rounded ${f.highlight ? "bg-violet-50 border border-violet-200" : "bg-slate-50"}`}>
            <div className="text-[9px] tracking-widest text-slate-500 font-semibold">{f.l.toUpperCase()}</div>
            <div className={`mt-0.5 text-xs break-all ${f.mono ? "font-mono" : ""} ${f.highlight ? "text-violet-700 font-semibold" : "text-navy-800"}`}>{f.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn-outline text-xs !py-2">Export JSON</button>
        <button className="btn-primary text-xs !py-2">Generate Affidavit</button>
      </div>

      <div className="mt-3 text-[10px] text-slate-400 text-center">
        Record cryptographically signed · tamper-evident · forensically reproducible
      </div>
    </div>
  );
}

/* ─────────────────── Library Tab (A-T) ─────────────────── */

function LibraryTab() {
  const [active, setActive] = useState(COMPLIANCE_PACK[0]);
  const Ico = I[active.icon as keyof typeof I];

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
      {/* Section nav */}
      <div className="card p-2 h-fit lg:sticky lg:top-20 max-h-[80vh] overflow-y-auto">
        <div className="px-2 py-2 text-[10px] tracking-widest text-slate-500 font-semibold">REGULATORY SECTIONS (A–T)</div>
        {COMPLIANCE_PACK.map(s => {
          const Sec = I[s.icon as keyof typeof I];
          const compliant = s.regulations.filter(r => r.status === "COMPLIANT").length;
          const pct = Math.round((compliant / s.regulations.length) * 100);
          const isActive = active.id === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActive(s)}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 ${isActive ? "bg-navy-800 text-white" : "hover:bg-slate-50"}`}
            >
              <span className="font-mono text-[10px] font-bold w-5" style={isActive ? {} : { color: s.color }}>{s.letter}.</span>
              <Sec size={13} stroke={isActive ? "#D4AF37" : s.color} />
              <span className={`flex-1 text-xs ${isActive ? "text-white" : "text-navy-800"} truncate`}>{s.title}</span>
              <span className={`text-[10px] font-mono ${isActive ? "text-gold-300" : pct === 100 ? "text-emerald-600" : "text-amber-600"}`}>{pct}%</span>
            </button>
          );
        })}
      </div>

      {/* Section content */}
      <div className="space-y-4">
        <div className="card p-6" style={{ borderTopColor: active.color, borderTopWidth: 6 }}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${active.color}15` }}>
              <Ico size={24} stroke={active.color} />
            </div>
            <div className="flex-1">
              <div className="text-[10px] tracking-[0.3em] font-bold" style={{ color: active.color }}>SECTION {active.letter}</div>
              <div className="font-display text-2xl text-navy-800 mt-1">{active.title}</div>
              <p className="text-sm text-slate-600 mt-1">{active.description}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-3xl text-emerald-600">{Math.round((active.regulations.filter(r => r.status === "COMPLIANT").length / active.regulations.length) * 100)}%</div>
              <div className="text-[10px] tracking-widest text-slate-500">COMPLIANT</div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {active.regulations.map(r => <RegulationCard key={r.id} reg={r} />)}
        </div>
      </div>
    </div>
  );
}

function RegulationCard({ reg }: { reg: Regulation }) {
  return (
    <div className={`card p-4 border-l-4 ${
      reg.status === "COMPLIANT" ? "border-l-emerald-500" :
      reg.status === "PARTIAL" ? "border-l-amber-500" : "border-l-slate-400"
    }`}>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-[10px] text-slate-500">{reg.id.toUpperCase()}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-50 text-navy-700 font-semibold">{reg.authority}</span>
          </div>
          <div className="font-semibold text-navy-800">{reg.name}</div>
        </div>
        <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded shrink-0 ${
          reg.status === "COMPLIANT" ? "bg-emerald-600 text-white" :
          reg.status === "PARTIAL" ? "bg-amber-500 text-white" : "bg-slate-500 text-white"
        }`}>{reg.status}</span>
      </div>
      <div className="rounded bg-slate-50 p-3 mt-2">
        <div className="text-[10px] tracking-widest text-gold-700 font-semibold mb-1">BEYU IMPLEMENTATION</div>
        <div className="text-xs text-slate-700 leading-relaxed">{reg.beyuImplementation}</div>
        {reg.modules && (
          <div className="flex flex-wrap gap-1 mt-2">
            {reg.modules.map(m => (
              <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">{m}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Matrix Tab ─────────────────── */

function MatrixTab() {
  return (
    <div className="card overflow-x-auto">
      <div className="px-5 py-3 border-b border-slate-100">
        <div className="font-display text-lg text-navy-800">Full Compliance Matrix</div>
        <div className="text-xs text-slate-500">All {COMPLIANCE_KPIS.totalRegs} regulations across {COMPLIANCE_KPIS.sections} sections</div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-500">
          <tr>
            <th className="text-left px-4 py-2.5">SECTION</th>
            <th className="text-left px-4 py-2.5">REGULATION</th>
            <th className="text-left px-4 py-2.5">AUTHORITY</th>
            <th className="text-left px-4 py-2.5">STATUS</th>
            <th className="text-left px-4 py-2.5">BEYU IMPLEMENTATION</th>
          </tr>
        </thead>
        <tbody>
          {COMPLIANCE_PACK.flatMap(s =>
            s.regulations.map(r => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold w-5" style={{ color: s.color }}>{s.letter}</span>
                    <span className="text-[11px] text-slate-600">{s.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-navy-800">{r.name}</td>
                <td className="px-4 py-3"><span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-50 text-navy-700 font-semibold">{r.authority}</span></td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold tracking-widest ${
                    r.status === "COMPLIANT" ? "bg-emerald-100 text-emerald-700" :
                    r.status === "PARTIAL" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                  }`}>{r.status}</span>
                </td>
                <td className="px-4 py-3 text-[11px] text-slate-600 max-w-md">{r.beyuImplementation}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────── Evidence Vault Tab ─────────────────── */

function EvidenceTab() {
  return (
    <>
      <div className="card p-5 mb-4 bg-gradient-to-r from-navy-800 to-navy-900 text-white">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-gold-500 flex items-center justify-center"><I.doc size={24} stroke="#0B1D3A" /></div>
          <div>
            <div className="text-[11px] tracking-widest text-gold-400">AUDIT EVIDENCE VAULT</div>
            <div className="font-display text-2xl mt-1">Audit-Ready · One-Click Inspector Pack</div>
            <p className="text-white/70 text-sm mt-2 max-w-2xl">
              Pre-built evidence bundles for each regulator. Click to generate a PDF + signed-JSON
              package with cryptographic proof for the inspecting authority.
            </p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { auth: "TMDA", desc: "Pharmacovigilance · GDP · GSP · drug registry sync", n: 412, last: "2026-04-22" },
          { auth: "PCT", desc: "Pharmacist licences · controlled substance log · GPP audit", n: 184, last: "2026-04-15" },
          { auth: "MCT", desc: "Practitioner licences · CPD logs · ethics declarations", n: 248, last: "2026-04-18" },
          { auth: "TNMC", desc: "Nurse / midwife licences · CPD · documentation samples", n: 362, last: "2026-04-12" },
          { auth: "PDPC", desc: "DPIA · consent register · breach log · DPO records", n: 142, last: "2026-04-28" },
          { auth: "NHIF", desc: "Accreditation · claims · denials · reconciliation", n: 1284, last: "2026-05-01" },
          { auth: "TAEC", desc: "Radiation safety · dose register · equipment QA", n: 84, last: "2026-04-08" },
          { auth: "MoH (MTUHA)", desc: "Monthly MTUHA forms · IDSR submissions · DHIS2 sync", n: 12, last: "2026-04-30" },
          { auth: "BoT", desc: "PSP integrations · transaction reports · AML logs", n: 412, last: "2026-04-30" },
          { auth: "ISO 27001 Auditor", desc: "Control evidence · risk register · BCP tests", n: 184, last: "2026-03-22" },
          { auth: "ISO 15189 Auditor", desc: "Lab QC · EQA · calibration · staff competency", n: 92, last: "2026-03-15" },
          { auth: "TCRA", desc: "Data service approval · cybercrime liaison · ETA evidence", n: 38, last: "2026-04-05" },
        ].map(b => (
          <div key={b.auth} className="card p-5 hover:-translate-y-0.5 transition cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <div className="font-display text-base text-navy-800">{b.auth}</div>
              <I.doc size={18} stroke="#D4AF37" />
            </div>
            <div className="text-xs text-slate-600 mb-3">{b.desc}</div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">{b.n} evidence items</span>
              <span className="text-[10px] text-slate-400">Last gen: {b.last}</span>
            </div>
            <button className="btn-primary w-full text-xs !py-2 mt-3">Generate Pack</button>
          </div>
        ))}
      </div>
    </>
  );
}
