import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, BarChart, DonutChart, ProgressBar } from "../components/Charts";
import { DocumentViewer, DocList } from "../components/DocumentViewer";
import { docsForModule, BEYU_DOCS, type BeyuDoc } from "../data/documents";
import { StaffChip } from "../components/HRWidgets";
import { byId } from "../services/hr";
import { Classification } from "../components/Security";

/* ═══════════════════════════════════════════════════════════════════════════
   TRUSTEE DASHBOARD — Layer 1: BEYU Family Trust
   Supreme constitutional authority · mission preservation · kill-switch
   ═══════════════════════════════════════════════════════════════════════════ */

export function TrusteeDashboard() {
  const [doc, setDoc] = useState<BeyuDoc | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  // Documents the Trust is constitutionally responsible for
  const trustDocs = BEYU_DOCS.filter((d) =>
    ["Founders Agreement", "Incorporation", "SHA", "Exit Clause", "Trademark"].includes(d.type)
  );

  // Constitutional matters requiring trustee review
  const pendingMatters = [
    {
      id: "TM-2026-04", title: "Cross-border PHI transfer to Kenya cluster",
      origin: "BEYU Holding Co. Board", risk: "High",
      summary: "Board approved expansion to Kenya. Trust constitutional check window: 14 days. Affects PHI sovereignty.",
      window: "8d remaining",
    },
    {
      id: "TM-2026-03", title: "Amendment to Hive AI safety policy",
      origin: "CMO + CTO", risk: "Medium",
      summary: "Proposed relaxation of human-in-the-loop for low-risk dosing suggestions. Affects clinical safety.",
      window: "4d remaining",
    },
    {
      id: "TM-2026-02", title: "Series A term sheet — Acumen / Novastar",
      origin: "BEYU Holding Co. Board", risk: "Low",
      summary: "USD 5M @ USD 20M pre. Does not breach trust covenants. Trust acknowledgement requested.",
      window: "Acknowledged ✓",
    },
  ];

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Trustee Command"
        subtitle="Layer 1 · BEYU Family Trust · Supreme constitutional authority"
        actions={
          <>
            <Classification level="TRUSTEE-ONLY" />
            <button className="btn-outline text-sm">Trust Deed</button>
            <button className="btn-primary text-sm">+ Trustee Resolution</button>
          </>
        }
      />

      {/* HERO — Constitutional Power Banner */}
      <div className="card p-6 mb-6 bg-gradient-to-br from-navy-900 via-navy-800 to-violet-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-dot opacity-20" />
        <div className="relative flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1">
            <div className="text-[11px] tracking-[0.3em] text-gold-400 font-semibold flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gold-400 pulse-soft" />
              CONSTITUTIONAL AUTHORITY · BEYU FAMILY TRUST
            </div>
            <h2 className="font-display text-3xl lg:text-4xl mt-2">
              You hold the <span className="text-gold-400">Generational Mandate</span>
            </h2>
            <p className="text-white/70 mt-3 max-w-2xl text-sm">
              As Trustee of the BEYU Family Trust, you exercise veto authority on patient safety,
              AI governance, ownership and trust-deed amendments. The Trust owns 55% of the BEYU
              Holding Company, all BEYU Health OS IP, and the Hive AI runtime weights.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 shrink-0">
            {[
              { l: "Trust Stake", v: "55%" },
              { l: "Beneficiaries", v: "12" },
              { l: "Pending Matters", v: pendingMatters.filter(m => m.window !== "Acknowledged ✓").length.toString() },
              { l: "Veto Used (12mo)", v: "0" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-center">
                <div className="font-display text-2xl text-gold-300">{s.v}</div>
                <div className="text-[10px] tracking-widest text-white/60 mt-0.5">{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CONSTITUTIONAL POWERS */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => setConfirmAction("hive-shutdown")}
          className="card p-5 text-left hover:-translate-y-0.5 transition border-rose-200"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-11 h-11 rounded-lg bg-rose-100 flex items-center justify-center">
              <I.power size={20} stroke="#dc2626" />
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-600 text-white font-bold tracking-widest">CONSTITUTIONAL</span>
          </div>
          <div className="font-display text-lg text-navy-800">Hive AI Kill-Switch</div>
          <div className="text-xs text-slate-600 mt-1">
            Instantly suspend all 12 AI agents across the platform while preserving clinical access. Requires dual-trustee signature.
          </div>
          <div className="mt-3 text-[11px] text-rose-700 font-semibold">⚠ Invoke kill-switch →</div>
        </button>

        <button
          onClick={() => setConfirmAction("veto-board")}
          className="card p-5 text-left hover:-translate-y-0.5 transition border-amber-200"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-11 h-11 rounded-lg bg-amber-100 flex items-center justify-center">
              <I.scale size={20} stroke="#b45309" />
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-600 text-white font-bold tracking-widest">VETO POWER</span>
          </div>
          <div className="font-display text-lg text-navy-800">Veto Board Resolution</div>
          <div className="text-xs text-slate-600 mt-1">
            Block a Holding Co. board resolution touching patient safety, AI policy, cross-border PHI or ownership.
          </div>
          <div className="mt-3 text-[11px] text-amber-700 font-semibold">⚖ Cast trustee veto →</div>
        </button>

        <button
          onClick={() => setConfirmAction("amend")}
          className="card p-5 text-left hover:-translate-y-0.5 transition border-violet-200"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-11 h-11 rounded-lg bg-violet-100 flex items-center justify-center">
              <I.doc size={20} stroke="#7c3aed" />
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-violet-600 text-white font-bold tracking-widest">DEED AMENDMENT</span>
          </div>
          <div className="font-display text-lg text-navy-800">Amend Trust Deed</div>
          <div className="text-xs text-slate-600 mt-1">
            Propose change to trust constitution. Requires unanimous trustee vote + 30-day notice to all beneficiaries.
          </div>
          <div className="mt-3 text-[11px] text-violet-700 font-semibold">📜 Begin amendment →</div>
        </button>
      </div>

      {/* PENDING MATTERS — main focus */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-display text-xl text-navy-800">Matters Awaiting Trustee Review</div>
            <div className="text-xs text-slate-500">Constitutional check window applies · veto requires no justification</div>
          </div>
          <span className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 font-semibold">
            {pendingMatters.filter(m => m.window !== "Acknowledged ✓").length} active
          </span>
        </div>

        <div className="space-y-3">
          {pendingMatters.map((m) => (
            <div key={m.id} className="p-4 rounded-xl border border-slate-200 hover:border-gold-300 transition">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-[10px] text-violet-700">{m.id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      m.risk === "High" ? "bg-rose-100 text-rose-700" :
                      m.risk === "Medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}>{m.risk} impact</span>
                    <span className="text-[10px] text-slate-500">from {m.origin}</span>
                  </div>
                  <div className="font-semibold text-navy-800">{m.title}</div>
                  <div className="text-sm text-slate-600 mt-1">{m.summary}</div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className={`text-xs font-mono ${m.window.includes("✓") ? "text-emerald-600" : "text-amber-700"}`}>{m.window}</div>
                  {m.window !== "Acknowledged ✓" && (
                    <div className="flex gap-2">
                      <button className="btn-outline text-xs !py-1.5 !px-3">Acknowledge</button>
                      <button className="text-xs px-3 py-1.5 rounded bg-rose-600 text-white font-semibold hover:bg-rose-700">Veto</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TRUST OWNERSHIP + BENEFICIARIES */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-1">Assets Held by the Trust</div>
          <div className="text-xs text-slate-500 mb-4">Constitutional ownership · 55% of BEYU Holding Co. + intangibles</div>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { t: "BEYU Holding Co. equity", v: "5,500,000 Class A shares (55.0%)", c: "#0B1D3A", i: "building" },
              { t: "BEYU Health OS — IP & Source", v: "Full IP assignment · Hive weights", c: "#7c3aed", i: "brain" },
              { t: "Trademarks (TZ-2025-4421 + EAC)", v: "BEYU wordmark · Family Trust mark", c: "#D4AF37", i: "star" },
              { t: "BEYU Mining strategic interests", v: "Held in trust for beneficiaries", c: "#475569", i: "star" },
              { t: "Reserve fund (USDC + TZS)", v: "USD 1.42M treasury", c: "#557345", i: "cash" },
              { t: "AI model weights & datasets", v: "On-chain provenance · trade secret", c: "#0891b2", i: "database" },
            ].map((a) => {
              const Ico = I[a.i as keyof typeof I];
              return (
                <div key={a.t} className="p-3 rounded-lg border border-slate-200 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${a.c}15` }}>
                    <Ico size={16} stroke={a.c} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-navy-800">{a.t}</div>
                    <div className="text-[11px] text-slate-500">{a.v}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-1">Beneficiary Ledger</div>
          <div className="text-xs text-slate-500 mb-4">12 named beneficiaries · on-chain registry</div>
          <div className="space-y-2">
            {[
              { c: "Founders & Spouses", n: 5, pct: 60 },
              { c: "Children (current generation)", n: 4, pct: 25 },
              { c: "Children (future generation)", n: 2, pct: 10 },
              { c: "Charitable foundation", n: 1, pct: 5 },
            ].map((b) => (
              <div key={b.c} className="p-2.5 rounded border border-slate-100">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-navy-800">{b.c}</span>
                  <span className="text-xs text-slate-500">{b.n} · {b.pct}%</span>
                </div>
                <ProgressBar value={b.pct} color="#D4AF37" />
              </div>
            ))}
          </div>
          <button className="btn-outline text-xs !py-2 w-full mt-3">Manage Beneficiaries</button>
        </div>
      </div>

      {/* GENERATIONAL SUCCESSION */}
      <div className="card p-6 mb-6 bg-gradient-to-r from-slate-50 to-navy-50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-gold-700 font-semibold">GENERATIONAL SUCCESSION PLAN</div>
            <div className="font-display text-xl text-navy-800 mt-1">100-year Trust horizon</div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">DEED COMPLIANT</span>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          {[
            { era: "2024 — 2044", g: "Founding Generation", r: "Operate · build · earn trust", c: "#0B1D3A" },
            { era: "2044 — 2074", g: "Second Generation", r: "Steward · expand · innovate", c: "#1E3A8A" },
            { era: "2074 — 2099", g: "Third Generation", r: "Pivot if needed · maintain mission", c: "#7c3aed" },
            { era: "2099 +", g: "Charitable Conversion", r: "Trust converts to perpetual foundation if no heirs ready", c: "#D4AF37" },
          ].map((g) => (
            <div key={g.g} className="rounded-xl bg-white border border-slate-200 p-4 relative" style={{ borderTopColor: g.c, borderTopWidth: 4 }}>
              <div className="text-[10px] tracking-widest text-slate-500">{g.era}</div>
              <div className="font-display text-base text-navy-800 mt-1">{g.g}</div>
              <div className="text-[11px] text-slate-600 mt-1">{g.r}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TRUSTEES & GOVERNING INSTRUMENTS */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Active Trustees</div>
          <div className="space-y-2">
            {[
              { id: "EMP-10001", role: "Founding Trustee · Chair" },
              { id: "EMP-10002", role: "Founding Trustee · Treasurer" },
              { id: "EMP-10003", role: "Founding Trustee · Secretary" },
            ].map((t) => {
              const e = byId(t.id);
              return e && (
                <div key={t.id} className="p-3 rounded-lg border border-slate-200">
                  <div className="text-[10px] tracking-widest text-gold-700">{t.role.toUpperCase()}</div>
                  <div className="mt-1"><StaffChip e={e} /></div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[10px] text-slate-500">Quorum: 2 of 3 · Unanimity required for deed amendments</div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-3">Recent Trustee Actions</div>
          <div className="space-y-1.5 text-xs font-mono">
            {[
              { t: "2026-04-28", a: "Trustee resolution TR-2026-04", e: "Approved Series A term sheet acknowledgement", s: "ok" },
              { t: "2026-04-12", a: "Constitutional review", e: "Cross-border PHI → Kenya (under review)", s: "warn" },
              { t: "2026-03-18", a: "Trustee resolution TR-2026-03", e: "Confirmed Joseph Tesha as General Counsel", s: "ok" },
              { t: "2026-02-20", a: "Beneficiary update", e: "Added 1 new beneficiary (newborn) to ledger", s: "ok" },
              { t: "2026-01-31", a: "Annual filing", e: "BRELA annual return · TRA UBO updated", s: "ok" },
              { t: "2025-12-04", a: "Hive policy review", e: "Confirmed dual-approval kill-switch protocol", s: "ok" },
            ].map((r, i) => (
              <div key={i} className="grid grid-cols-[90px_180px_1fr_50px] gap-2 py-1.5 border-b border-slate-100">
                <span className="text-slate-500">{r.t}</span>
                <span className="text-navy-800">{r.a}</span>
                <span className="text-slate-600 truncate">{r.e}</span>
                <span className={`text-right font-bold ${r.s === "warn" ? "text-amber-600" : "text-emerald-600"}`}>{r.s.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-[10px] tracking-[0.3em] text-gold-700 font-semibold mb-3">CONSTITUTIONAL INSTRUMENTS</div>
        <DocList docs={trustDocs} onOpen={setDoc} />
      </div>

      <DocumentViewer doc={doc} onClose={() => setDoc(null)} />

      {confirmAction && (
        <ConstitutionalModal action={confirmAction} onClose={() => setConfirmAction(null)} />
      )}
    </div>
  );
}

function ConstitutionalModal({ action, onClose }: { action: string; onClose: () => void }) {
  const cfg = {
    "hive-shutdown": { title: "Initiate Hive AI Kill-Switch", warn: "All 12 AI agents will suspend within 30 seconds. Clinical access preserved. Requires dual-trustee signature.", color: "rose" },
    "veto-board": { title: "Cast Constitutional Veto", warn: "Vetoing a board resolution is a permanent constitutional act. The resolution cannot be re-tabled for 90 days.", color: "amber" },
    "amend": { title: "Begin Trust Deed Amendment", warn: "Trust deed amendments require unanimous trustee consent + 30 days written notice to every beneficiary.", color: "violet" },
  }[action] || { title: "Confirm action", warn: "", color: "slate" };

  return (
    <div className="fixed inset-0 z-50 bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 slidein">
        <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${
          cfg.color === "rose" ? "bg-rose-100" : cfg.color === "amber" ? "bg-amber-100" : "bg-violet-100"
        }`}>
          <I.warning size={24} stroke={cfg.color === "rose" ? "#dc2626" : cfg.color === "amber" ? "#b45309" : "#7c3aed"} />
        </div>
        <h3 className="font-display text-xl text-navy-800 text-center">{cfg.title}</h3>
        <p className="text-sm text-slate-600 text-center mt-2">{cfg.warn}</p>
        <div className="rounded-lg bg-slate-50 p-3 mt-4 text-xs text-slate-600 font-mono">
          This action will be logged to the immutable audit trail and anchored to BeyuTrustRegistry.sol.
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
          <button onClick={onClose} className={`flex-1 py-2 rounded-lg font-semibold text-white ${
            cfg.color === "rose" ? "bg-rose-600 hover:bg-rose-700" :
            cfg.color === "amber" ? "bg-amber-600 hover:bg-amber-700" : "bg-violet-600 hover:bg-violet-700"
          }`}>Sign & Proceed</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOARD MEMBER DASHBOARD — Layer 2: BEYU Holding Company
   Strategic governance · capital allocation · resolutions · risk
   ═══════════════════════════════════════════════════════════════════════════ */

export function BoardDashboard() {
  const [doc, setDoc] = useState<BeyuDoc | null>(null);
  const boardDocs = docsForModule("planning");

  const directors = [
    { id: "EMP-10001", seat: "Class A · Chair", since: "2024-06" },
    { id: "EMP-10003", seat: "Class A · Vice-Chair", since: "2024-06" },
    { id: "EMP-10042", seat: "Acumen Nominee", since: "2025-11", external: true, name: "Sarah Naidu (Acumen)" },
    { id: "EMP-10041", seat: "Novastar Nominee", since: "2025-11", external: true, name: "James Otieno (Novastar)" },
    { id: "EMP-10004", seat: "Independent", since: "2025-12", external: true, name: "Dr. Florence Adoyo (Independent)" },
  ];

  const resolutions = [
    {
      id: "BR-2026-014", title: "Approve Series A definitive documents",
      proposed: "CFO", deadline: "Mon 12 May", required: "Majority + Acumen consent",
      votes: { for: 2, against: 0, abstain: 1, pending: 2 },
      status: "Voting Open",
    },
    {
      id: "BR-2026-013", title: "Authorize Kenya sovereign cluster expansion",
      proposed: "COO", deadline: "Wed 14 May", required: "Majority + Trust check",
      votes: { for: 3, against: 0, abstain: 0, pending: 2 },
      status: "Trust Review",
    },
    {
      id: "BR-2026-012", title: "Adopt 2026 Risk Appetite Statement",
      proposed: "CRO", deadline: "Fri 9 May", required: "Majority",
      votes: { for: 4, against: 0, abstain: 1, pending: 0 },
      status: "Passed",
    },
    {
      id: "BR-2026-011", title: "Increase ESOP pool from 15% → 18%",
      proposed: "CHRO", deadline: "Mon 5 May", required: "Majority + Class B consent",
      votes: { for: 2, against: 2, abstain: 0, pending: 1 },
      status: "Deadlocked",
    },
  ];

  const opcoSummary = [
    { n: "Health Corp", rev: 324, ebitda: 64, growth: 15.7, c: "#0B1D3A", flag: "Flagship" },
    { n: "FinTech", rev: 84, ebitda: 18, growth: 28.4, c: "#D4AF37" },
    { n: "Logistics", rev: 62, ebitda: 9, growth: 18.2, c: "#557345" },
    { n: "Insurance", rev: 48, ebitda: 8, growth: 22.1, c: "#7c3aed" },
    { n: "Research", rev: 24, ebitda: -4, growth: 42.8, c: "#be123c" },
    { n: "Education", rev: 18, ebitda: 3, growth: 36.2, c: "#0891b2" },
  ];

  const risks = [
    { r: "FX exposure (TZS/USD)", l: "Medium", i: "Medium", trend: "↗", mitigation: "Hedge USD 1.2M / quarter" },
    { r: "NHIF policy change", l: "Low", i: "High", trend: "→", mitigation: "Diversify payer mix, M-Pesa expansion" },
    { r: "Talent retention — senior clinicians", l: "Medium", i: "High", trend: "→", mitigation: "ESOP top-up, retention bonuses" },
    { r: "Cyber incident (PHI breach)", l: "Low", i: "Critical", trend: "↘", mitigation: "Cyber insurance USD 2M, zero-trust" },
    { r: "Concentration risk — top 3 tenants", l: "High", i: "Medium", trend: "↘", mitigation: "8 new tenants in pipeline" },
    { r: "Regulatory — TZ DPA enforcement", l: "Medium", i: "High", trend: "↗", mitigation: "DPO appointed, audit Q3" },
  ];

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Board Room"
        subtitle="Layer 2 · BEYU Holding Company · Strategic governance"
        actions={
          <>
            <Classification level="RESTRICTED" />
            <button className="btn-outline text-sm">Board Pack PDF</button>
            <button className="btn-primary text-sm">+ Table Resolution</button>
          </>
        }
      />

      {/* HERO */}
      <div className="card p-6 mb-6 bg-gradient-to-br from-navy-800 to-navy-900 text-white">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="text-[11px] tracking-[0.3em] text-gold-400 font-semibold">BEYU HOLDING COMPANY · BOARD MEMBER VIEW</div>
            <div className="font-display text-3xl mt-2">Q2 2026 · Board Cycle</div>
            <p className="text-white/70 mt-2 text-sm max-w-xl">
              5-director board · Next meeting Wed 14 May 2026, 10:00 EAT (in-person + Zoom).
              4 resolutions on the table, 1 deadlocked, 1 under Trust constitutional review.
            </p>
            <div className="flex gap-2 mt-4 flex-wrap">
              <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">Board attendance YTD: 96%</span>
              <span className="text-[10px] px-2 py-1 rounded bg-violet-500/20 text-violet-300 border border-violet-400/40">Last meeting: Mon 28 Apr</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "Q2 Revenue", v: "TZS 1.04Bn" },
              { l: "EBITDA Margin", v: "19%" },
              { l: "Cash Runway", v: "18 mo" },
              { l: "Net Revenue Retention", v: "128%" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-white/10 px-3 py-3">
                <div className="text-[10px] text-white/60">{s.l}</div>
                <div className="font-display text-xl text-gold-300">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* OPEN RESOLUTIONS */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-display text-xl text-navy-800">Active Resolutions</div>
            <div className="text-xs text-slate-500">Your vote required on the open items below</div>
          </div>
          <span className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 font-semibold">
            {resolutions.filter(r => r.status === "Voting Open").length} open
          </span>
        </div>

        <div className="space-y-3">
          {resolutions.map((r) => {
            const total = r.votes.for + r.votes.against + r.votes.abstain + r.votes.pending;
            const forPct = (r.votes.for / total) * 100;
            const againstPct = (r.votes.against / total) * 100;
            return (
              <div key={r.id} className={`p-4 rounded-xl border ${
                r.status === "Passed" ? "border-emerald-200 bg-emerald-50/30" :
                r.status === "Deadlocked" ? "border-rose-200 bg-rose-50/30" :
                r.status === "Trust Review" ? "border-violet-200 bg-violet-50/30" :
                "border-amber-200 bg-amber-50/30"
              }`}>
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-[10px] text-violet-700">{r.id}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        r.status === "Passed" ? "bg-emerald-600 text-white" :
                        r.status === "Deadlocked" ? "bg-rose-600 text-white" :
                        r.status === "Trust Review" ? "bg-violet-600 text-white" :
                        "bg-amber-600 text-white"
                      }`}>{r.status.toUpperCase()}</span>
                    </div>
                    <div className="font-semibold text-navy-800">{r.title}</div>
                    <div className="text-[11px] text-slate-500 mt-1">Proposed by {r.proposed} · {r.required} · deadline {r.deadline}</div>
                  </div>
                  {r.status === "Voting Open" && (
                    <div className="flex gap-2 shrink-0">
                      <button className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700">✓ For</button>
                      <button className="text-xs px-3 py-1.5 rounded bg-rose-600 text-white font-semibold hover:bg-rose-700">✕ Against</button>
                      <button className="text-xs px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100">Abstain</button>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500" style={{ width: `${forPct}%` }} />
                    <div className="bg-rose-500" style={{ width: `${againstPct}%` }} />
                  </div>
                  <span className="text-[11px] font-mono text-emerald-700">{r.votes.for} for</span>
                  <span className="text-[11px] font-mono text-rose-700">{r.votes.against} against</span>
                  <span className="text-[11px] font-mono text-slate-500">{r.votes.abstain} abstain</span>
                  <span className="text-[11px] font-mono text-amber-700">{r.votes.pending} pending</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BOARD COMPOSITION + NEXT MEETING */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Board Composition</div>
          <div className="space-y-2">
            {directors.map((d) => {
              const internal = byId(d.id);
              return (
                <div key={d.id + d.seat} className="p-3 rounded-lg border border-slate-200">
                  <div className="text-[10px] tracking-widest text-gold-700">{d.seat.toUpperCase()}</div>
                  <div className="mt-1 flex items-center gap-2">
                    {d.external ? (
                      <>
                        <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center text-[10px] font-bold text-white">
                          {(d.name || "").split(" ").map(n => n[0]).slice(0, 2).join("")}
                        </div>
                        <div className="text-sm font-medium text-navy-800">{d.name}</div>
                      </>
                    ) : internal && (
                      <StaffChip e={internal} />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">on board since {d.since}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-display text-lg text-navy-800">Next Board Meeting · Wed 14 May 2026</div>
              <div className="text-xs text-slate-500">10:00 — 13:00 EAT · BEYU HQ, Mikocheni + Zoom</div>
            </div>
            <button className="btn-gold text-xs !py-1.5 !px-3">RSVP</button>
          </div>
          <div className="space-y-1.5">
            {[
              { t: "10:00", item: "Apologies, prior minutes, declarations of interest" },
              { t: "10:15", item: "CEO update (Dr. John Doe)" },
              { t: "10:35", item: "Q1 financial review (CFO)" },
              { t: "11:00", item: "Series A definitive documents (BR-2026-014)" },
              { t: "11:30", item: "Kenya sovereign cluster expansion (BR-2026-013)" },
              { t: "12:00", item: "ESOP pool review (BR-2026-011 re-vote)" },
              { t: "12:30", item: "Risk register Q2 (CRO)" },
              { t: "12:50", item: "AOB · close" },
            ].map((a) => (
              <div key={a.t} className="flex items-start gap-3 p-2 rounded hover:bg-slate-50">
                <span className="text-xs font-mono text-slate-500 w-12 shrink-0">{a.t}</span>
                <span className="text-sm text-navy-800">{a.item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* OPCO PERFORMANCE + RISKS */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2 overflow-x-auto">
          <div className="font-display text-lg text-navy-800 mb-3">Operating Companies — Q2 Snapshot</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-3 py-2.5">OPCO</th>
                <th className="text-right px-3 py-2.5">REV (TZS M)</th>
                <th className="text-right px-3 py-2.5">EBITDA</th>
                <th className="text-right px-3 py-2.5">GROWTH</th>
                <th className="text-right px-3 py-2.5">MARGIN</th>
              </tr>
            </thead>
            <tbody>
              {opcoSummary.map((o) => (
                <tr key={o.n} className="border-b border-slate-100">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-7 rounded" style={{ background: o.c }} />
                      <div>
                        <div className="font-medium text-navy-800">{o.n}</div>
                        {o.flag && <div className="text-[9px] text-gold-700 tracking-wider">{o.flag.toUpperCase()}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{o.rev.toFixed(0)}</td>
                  <td className={`px-3 py-3 text-right font-mono ${o.ebitda < 0 ? "text-rose-700" : "text-navy-800"}`}>{o.ebitda > 0 ? `+${o.ebitda}` : o.ebitda}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 font-mono">+{o.growth}%</td>
                  <td className="px-3 py-3 text-right font-mono">{((o.ebitda / o.rev) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-1">Revenue Mix (Q2)</div>
          <div className="text-xs text-slate-500 mb-3">Combined OpCo revenue</div>
          <BarChart data={opcoSummary.map(o => ({ name: o.n, value: o.rev }))} height={200} />
        </div>
      </div>

      {/* RISK REGISTER */}
      <div className="card p-5 mb-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-display text-lg text-navy-800">Material Risk Register</div>
            <div className="text-xs text-slate-500">Reviewed quarterly by the Risk Committee (CRO + 2 directors)</div>
          </div>
          <button className="btn-outline text-xs !py-1.5 !px-3">Open full register</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-3 py-2.5">RISK</th>
              <th className="text-left px-3 py-2.5">LIKELIHOOD</th>
              <th className="text-left px-3 py-2.5">IMPACT</th>
              <th className="text-left px-3 py-2.5">TREND</th>
              <th className="text-left px-3 py-2.5">MITIGATION</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => (
              <tr key={r.r} className="border-b border-slate-100">
                <td className="px-3 py-3 font-medium text-navy-800">{r.r}</td>
                <td className="px-3 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded ${
                    r.l === "High" ? "bg-rose-100 text-rose-700" :
                    r.l === "Medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}>{r.l}</span>
                </td>
                <td className="px-3 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded ${
                    r.i === "Critical" ? "bg-rose-200 text-rose-800 font-bold" :
                    r.i === "High" ? "bg-rose-100 text-rose-700" :
                    r.i === "Medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}>{r.i}</span>
                </td>
                <td className="px-3 py-3 text-xl font-bold" style={{ color: r.trend === "↗" ? "#dc2626" : r.trend === "↘" ? "#059669" : "#64748b" }}>{r.trend}</td>
                <td className="px-3 py-3 text-xs text-slate-600">{r.mitigation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FINANCIAL HEALTH */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-2">Revenue Trajectory (12-mo)</div>
          <LineChart
            data={[
              { m: "May", v: 220 }, { m: "Jun", v: 245 }, { m: "Jul", v: 268 }, { m: "Aug", v: 252 },
              { m: "Sep", v: 289 }, { m: "Oct", v: 305 }, { m: "Nov", v: 318 }, { m: "Dec", v: 324 },
              { m: "Jan", v: 312 }, { m: "Feb", v: 328 }, { m: "Mar", v: 348 }, { m: "Apr", v: 372 },
            ]}
            height={220}
          />
        </div>
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Capital Stack</div>
          <div className="flex items-center gap-4">
            <DonutChart value={1420} max={2000} label="USD k" color="#7c3aed" />
            <div className="flex-1 space-y-2 text-xs">
              <div className="flex justify-between"><span>Cash on hand</span><span className="font-mono text-navy-800">USD 1.42M</span></div>
              <div className="flex justify-between"><span>Series A target</span><span className="font-mono text-emerald-600">USD 5.00M</span></div>
              <div className="flex justify-between"><span>Annual burn</span><span className="font-mono text-amber-600">USD 0.94M</span></div>
              <div className="flex justify-between"><span>Runway</span><span className="font-mono text-navy-800 font-bold">18 months</span></div>
              <div className="flex justify-between"><span>Post-A runway</span><span className="font-mono text-emerald-600 font-bold">~ 36 months</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* GOVERNING DOCUMENTS */}
      <div>
        <div className="text-[10px] tracking-[0.3em] text-gold-700 font-semibold mb-3">BOARD DOCUMENTS</div>
        <DocList docs={boardDocs} onOpen={setDoc} />
      </div>

      <DocumentViewer doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
