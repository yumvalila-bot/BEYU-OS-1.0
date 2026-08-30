import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { ProgressBar } from "../components/Charts";
import { LegalLibraryScreen } from "../components/DocumentViewer";

/* ─────────────────────────── Document Vault Types & Data ─────────────────────────── */

type DocStatus = "Active" | "Draft" | "Expiring" | "Expired" | "Signed" | "Pending Signature";
type DocCategory =
  | "Company Records" | "Compliance" | "Basic Protection"
  | "Founding Documents" | "Equity & Cap Table" | "IP & Confidentiality"
  | "Employment" | "Policies & Public" | "Investor Materials";

interface DocItem {
  id: string;
  title: string;
  category: DocCategory;
  status: DocStatus;
  updated: string;
  signedBy?: string;
  expires?: string;
  hash: string;
  parties?: string[];
  size?: string;
  onChain?: boolean;
}

const DOCS: DocItem[] = [
  // Company Records
  { id: "DOC-0001", title: "Certificate of Incorporation — BEYU Holding Co. Ltd", category: "Company Records", status: "Active", updated: "2024-08-12", hash: "0x9a4f...c12e", onChain: true, size: "2.4 MB" },
  { id: "DOC-0002", title: "Memorandum & Articles of Association", category: "Company Records", status: "Active", updated: "2024-08-12", hash: "0x8b21...f037", onChain: true, size: "1.8 MB" },
  { id: "DOC-0003", title: "BRELA Business Registration Certificate", category: "Company Records", status: "Active", updated: "2024-09-01", hash: "0x7c52...d984", onChain: true, size: "640 KB" },
  { id: "DOC-0004", title: "Company Bank Account Resolution — CRDB Plc", category: "Company Records", status: "Signed", updated: "2024-10-04", signedBy: "Board (5/5)", hash: "0x6d33...a142", onChain: true },
  { id: "DOC-0005", title: "Board Resolution — Q4 2025 Tenant Onboarding", category: "Company Records", status: "Signed", updated: "2025-12-18", signedBy: "Board (4/5)", hash: "0x5e44...b201", onChain: true },
  { id: "DOC-0006", title: "Board Meeting Minutes — March 2026", category: "Company Records", status: "Signed", updated: "2026-03-22", signedBy: "Secretary", hash: "0x4f55...c310" },
  { id: "DOC-0007", title: "Written Approval — Aga Khan integration scope", category: "Company Records", status: "Signed", updated: "2026-02-14", signedBy: "CEO + COO", hash: "0x3a66...d429" },

  // Compliance
  { id: "DOC-0010", title: "BRELA Annual Returns — 2025", category: "Compliance", status: "Active", updated: "2026-01-31", expires: "2027-01-31", hash: "0x2b77...e538" },
  { id: "DOC-0011", title: "TRA Tax Clearance Certificate", category: "Compliance", status: "Expiring", updated: "2025-07-10", expires: "2026-07-10", hash: "0x1c88...f647" },
  { id: "DOC-0012", title: "TRA VAT Registration (VRN)", category: "Compliance", status: "Active", updated: "2024-08-20", hash: "0x0d99...a756" },
  { id: "DOC-0013", title: "Ultimate Beneficial Ownership Filing", category: "Compliance", status: "Active", updated: "2026-02-05", expires: "2027-02-05", hash: "0xfeaa...b865" },
  { id: "DOC-0014", title: "Ministry of Health — Software License Approval", category: "Compliance", status: "Active", updated: "2025-11-22", expires: "2027-11-22", hash: "0xedbb...c974" },
  { id: "DOC-0015", title: "TCRA Data Service Provider Approval", category: "Compliance", status: "Active", updated: "2025-06-15", hash: "0xdccc...da83" },

  // Basic Protection
  { id: "DOC-0020", title: "Professional Indemnity Insurance — Sanlam TZ", category: "Basic Protection", status: "Active", updated: "2025-09-01", expires: "2026-09-01", hash: "0xcbdd...eb92" },
  { id: "DOC-0021", title: "Cyber Liability Insurance — Jubilee", category: "Basic Protection", status: "Active", updated: "2025-09-01", expires: "2026-09-01", hash: "0xbaee...fca1" },
  { id: "DOC-0022", title: "Workers' Compensation (WCF)", category: "Basic Protection", status: "Active", updated: "2025-12-01", hash: "0xa9ff...0db0" },
  { id: "DOC-0023", title: "Master Supplier Terms (MSA Template v3.2)", category: "Basic Protection", status: "Active", updated: "2026-01-18", hash: "0x98aa...1ebf" },
  { id: "DOC-0024", title: "Data Protection Policy (GDPR + TZ DPA 2022)", category: "Basic Protection", status: "Active", updated: "2026-02-28", hash: "0x87bb...2fce" },
  { id: "DOC-0025", title: "Data Processing Agreement Template", category: "Basic Protection", status: "Active", updated: "2026-02-28", hash: "0x76cc...30dd" },

  // Founding Documents
  { id: "DOC-0030", title: "Founders' Agreement", category: "Founding Documents", status: "Signed", updated: "2024-06-01", signedBy: "3/3 Founders", hash: "0x65dd...41ec", onChain: true },
  { id: "DOC-0031", title: "Co-Founder Exit & Vesting Clause Addendum", category: "Founding Documents", status: "Signed", updated: "2024-06-01", signedBy: "3/3 Founders", hash: "0x54ee...52fb", onChain: true },
  { id: "DOC-0032", title: "Shareholders Agreement (SHA)", category: "Founding Documents", status: "Signed", updated: "2025-03-15", signedBy: "Class A + Class B", hash: "0x43ff...630a", onChain: true },
  { id: "DOC-0033", title: "BEYU Family Trust Deed", category: "Founding Documents", status: "Active", updated: "2024-05-20", hash: "0x3200...7419", onChain: true },

  // Equity & Cap Table
  { id: "DOC-0040", title: "Capitalization Table — Q1 2026", category: "Equity & Cap Table", status: "Active", updated: "2026-03-31", hash: "0x2111...8528", onChain: true },
  { id: "DOC-0041", title: "ESOP — 2025 Equity Incentive Plan", category: "Equity & Cap Table", status: "Active", updated: "2025-09-10", hash: "0x1022...9637" },
  { id: "DOC-0042", title: "Stock Option Grant Agreement (template)", category: "Equity & Cap Table", status: "Active", updated: "2025-09-10", hash: "0x0f33...a746" },
  { id: "DOC-0043", title: "Convertible SAFE — Seed Round (10 investors)", category: "Equity & Cap Table", status: "Signed", updated: "2025-11-04", hash: "0xfe44...b855" },

  // IP & Confidentiality
  { id: "DOC-0050", title: "Mutual NDA Template (Counterparty)", category: "IP & Confidentiality", status: "Active", updated: "2026-01-22", hash: "0xed55...c964" },
  { id: "DOC-0051", title: "IP Assignment Agreement — All Engineers", category: "IP & Confidentiality", status: "Signed", updated: "2026-02-10", signedBy: "42 employees", hash: "0xdc66...da73" },
  { id: "DOC-0052", title: "Trademark Registration — “BEYU” (TZ-2025-4421)", category: "IP & Confidentiality", status: "Active", updated: "2025-05-12", expires: "2035-05-12", hash: "0xcb77...eb82" },
  { id: "DOC-0053", title: "Trademark Registration — “BEYU Health OS” (EAC)", category: "IP & Confidentiality", status: "Active", updated: "2025-08-30", hash: "0xba88...fc91" },
  { id: "DOC-0054", title: "Patent Application — Hive Runtime Architecture", category: "IP & Confidentiality", status: "Draft", updated: "2026-03-10", hash: "0xa999...0da0" },

  // Employment
  { id: "DOC-0060", title: "Employee Contract — Standard Template v4", category: "Employment", status: "Active", updated: "2026-02-01", hash: "0x98aa...1ebf" },
  { id: "DOC-0061", title: "Senior Offer Letter — Template", category: "Employment", status: "Active", updated: "2026-02-01", hash: "0x87bb...2fce" },
  { id: "DOC-0062", title: "Consultant / Independent Contractor Agreement", category: "Employment", status: "Active", updated: "2025-12-15", hash: "0x76cc...30dd" },
  { id: "DOC-0063", title: "HR Policy Handbook 2026", category: "Employment", status: "Active", updated: "2026-01-15", hash: "0x65dd...41ec" },
  { id: "DOC-0064", title: "Code of Conduct & Anti-Bribery Policy", category: "Employment", status: "Active", updated: "2026-01-15", hash: "0x54ee...52fb" },

  // Policies & Public
  { id: "DOC-0070", title: "Terms of Service — beyuhealth.org", category: "Policies & Public", status: "Active", updated: "2026-02-28", hash: "0x43ff...630a" },
  { id: "DOC-0071", title: "Privacy Policy (Patient + Tenant)", category: "Policies & Public", status: "Active", updated: "2026-02-28", hash: "0x3200...7419" },
  { id: "DOC-0072", title: "Acceptable Use Policy", category: "Policies & Public", status: "Active", updated: "2026-01-10", hash: "0x2111...8528" },
  { id: "DOC-0073", title: "Cookie Policy", category: "Policies & Public", status: "Active", updated: "2026-02-28", hash: "0x1022...9637" },

  // Investor Materials
  { id: "DOC-0080", title: "Pitch Deck — Series A (v12)", category: "Investor Materials", status: "Active", updated: "2026-03-20", hash: "0x0f33...a746" },
  { id: "DOC-0081", title: "Financial Model (5-year projection)", category: "Investor Materials", status: "Active", updated: "2026-03-20", hash: "0xfe44...b855" },
  { id: "DOC-0082", title: "Series A Term Sheet — Acumen / Novastar", category: "Investor Materials", status: "Pending Signature", updated: "2026-03-28", hash: "0xed55...c964", parties: ["Acumen", "Novastar", "BEYU Holding"] },
  { id: "DOC-0083", title: "Data Room Index (VDR)", category: "Investor Materials", status: "Active", updated: "2026-03-25", hash: "0xdc66...da73" },
];

const CATEGORIES: { id: DocCategory; icon: keyof typeof I; color: string; desc: string }[] = [
  { id: "Company Records", icon: "building", color: "#0B1D3A", desc: "Incorporation · resolutions · minutes · approvals" },
  { id: "Compliance", icon: "shield", color: "#557345", desc: "BRELA · TRA · UBO · sector approvals" },
  { id: "Basic Protection", icon: "lock", color: "#1E3A8A", desc: "Insurance · supplier terms · data protection" },
  { id: "Founding Documents", icon: "star", color: "#D4AF37", desc: "Founders · SHA · trust deed · exit clauses" },
  { id: "Equity & Cap Table", icon: "cash", color: "#7c3aed", desc: "Cap table · ESOP · SAFEs · grants" },
  { id: "IP & Confidentiality", icon: "bulb", color: "#0891b2", desc: "NDAs · IP assignment · trademarks · patents" },
  { id: "Employment", icon: "users", color: "#b45309", desc: "Contracts · offer letters · HR handbook" },
  { id: "Policies & Public", icon: "globe", color: "#475569", desc: "ToS · privacy · cookies · acceptable use" },
  { id: "Investor Materials", icon: "analytics", color: "#be123c", desc: "Deck · model · term sheet · VDR" },
];

const STATUS_STYLE: Record<DocStatus, string> = {
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Expiring: "bg-amber-50 text-amber-700 border-amber-200",
  Expired: "bg-rose-50 text-rose-700 border-rose-200",
  Signed: "bg-navy-50 text-navy-700 border-navy-200",
  "Pending Signature": "bg-gold-50 text-gold-800 border-gold-200",
};

/* ─────────────────────────── Main Screen ─────────────────────────── */

export function SmartContractsScreen() {
  const [tab, setTab] = useState<"overview" | "vault" | "library" | "cap" | "chain">("overview");
  const [category, setCategory] = useState<DocCategory | "All">("All");
  const [query, setQuery] = useState("");

  const filtered = DOCS.filter((d) => {
    const matchCat = category === "All" || d.category === category;
    const matchQ = !query || d.title.toLowerCase().includes(query.toLowerCase()) || d.id.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQ;
  });

  const expiringSoon = DOCS.filter((d) => d.status === "Expiring").length;
  const onChain = DOCS.filter((d) => d.onChain).length;
  const pendingSig = DOCS.filter((d) => d.status === "Pending Signature").length;

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Corporate Vault & Smart Contracts"
        subtitle="Single source of truth for incorporation, compliance, equity, IP and governance documents"
        actions={
          <>
            <button className="btn-outline text-sm">+ Upload</button>
            <button className="btn-primary text-sm flex items-center gap-2"><I.zap size={14} stroke="#fff" /> Mint on Chain</button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { l: "Total Documents", v: DOCS.length.toString(), c: "#0B1D3A" },
          { l: "On-Chain Hash", v: `${onChain}`, c: "#7c3aed", sub: "anchored to ledger" },
          { l: "Pending Signatures", v: `${pendingSig}`, c: "#D4AF37", sub: "awaiting parties" },
          { l: "Expiring < 90 d", v: `${expiringSoon}`, c: "#b45309", sub: "renewal required" },
          { l: "Compliance Score", v: "94%", c: "#557345", sub: "audit ready" },
        ].map((k) => (
          <div key={k.l} className="card p-4">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-2xl mt-1" style={{ color: k.c }}>{k.v}</div>
            {k.sub && <div className="text-[11px] text-slate-500 mt-0.5">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-5">
        {[
          { id: "overview", l: "Overview" },
          { id: "vault", l: "Document Vault" },
          { id: "library", l: "Legal Library" },
          { id: "cap", l: "Cap Table & ESOP" },
          { id: "chain", l: "Smart Contracts (On-Chain)" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition ${tab === t.id ? "bg-white text-navy-800 shadow" : "text-slate-500"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "vault" && (
        <VaultTab category={category} setCategory={setCategory} query={query} setQuery={setQuery} docs={filtered} />
      )}
      {tab === "library" && (
        <div>
          <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-violet-50 to-gold-50 border border-violet-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center text-white">📚</div>
              <div className="flex-1">
                <div className="font-display text-lg text-navy-800">Full Legal Library</div>
                <div className="text-sm text-slate-600">
                  Open and read every governing document — founders, incorporation, SHA, cap table, ESOP, NDAs, IP, employment,
                  HR policies, ToS, privacy, compliance, pitch deck, financial model and the Series A term sheet.
                </div>
              </div>
            </div>
          </div>
          <LegalLibraryScreen />
        </div>
      )}
      {tab === "cap" && <CapTableTab />}
      {tab === "chain" && <OnChainTab />}
    </div>
  );
}

/* ─────────────────────────── Overview Tab ─────────────────────────── */

function OverviewTab() {
  return (
    <>
      <div className="grid md:grid-cols-3 lg:grid-cols-3 gap-4 mb-6">
        {CATEGORIES.map((c) => {
          const Ico = I[c.icon];
          const count = DOCS.filter((d) => d.category === c.id).length;
          return (
            <div key={c.id} className="card p-5 hover:-translate-y-0.5 transition cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${c.color}15` }}>
                  <Ico size={20} stroke={c.color} />
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl text-navy-800">{count}</div>
                  <div className="text-[10px] text-slate-500">documents</div>
                </div>
              </div>
              <div className="font-semibold text-navy-800">{c.id}</div>
              <div className="text-xs text-slate-500 mt-1">{c.desc}</div>
              <div className="mt-3 flex items-center gap-1 text-[11px] text-gold-700 font-semibold">
                Open vault <I.chevronR size={12} stroke="#b48a24" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Compliance Calendar</div>
          <div className="space-y-2">
            {[
              { d: "2026-07-10", t: "TRA Tax Clearance renewal", s: "Expiring" },
              { d: "2026-09-01", t: "Professional Indemnity renewal", s: "Active" },
              { d: "2026-09-01", t: "Cyber Liability renewal", s: "Active" },
              { d: "2027-01-31", t: "BRELA Annual Returns filing", s: "Active" },
              { d: "2027-02-05", t: "UBO Annual Filing", s: "Active" },
              { d: "2027-11-22", t: "MoH Software License renewal", s: "Active" },
            ].map((r) => (
              <div key={r.t} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50">
                <div className="w-16 text-xs font-mono text-slate-500">{r.d}</div>
                <div className="flex-1 text-sm text-navy-800">{r.t}</div>
                <span className={`text-[10px] px-2 py-0.5 rounded border ${STATUS_STYLE[r.s as DocStatus]}`}>{r.s}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Recent Signatures (eSign + Chain Anchor)</div>
          <div className="space-y-3">
            {[
              { p: "Series A Term Sheet — Novastar", who: "CEO + Investor", when: "2 hours ago", chain: false },
              { p: "Board Resolution — Q4 onboarding", who: "Board (4/5)", when: "yesterday", chain: true },
              { p: "IP Assignment — 6 new engineers", who: "HR + Employees", when: "3 days ago", chain: true },
              { p: "Master Supplier MSA — Sysmex", who: "COO", when: "5 days ago", chain: true },
              { p: "ESOP grant — Dr. M. Achieng", who: "CEO + Grantee", when: "1 week ago", chain: true },
            ].map((s) => (
              <div key={s.p} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><I.check size={14} stroke="#059669" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-navy-800 truncate">{s.p}</div>
                  <div className="text-[11px] text-slate-500">{s.who} · {s.when}</div>
                </div>
                {s.chain && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">⛓ ANCHORED</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── Vault Tab ─────────────────────────── */

function VaultTab({ category, setCategory, query, setQuery, docs }: {
  category: DocCategory | "All";
  setCategory: (c: DocCategory | "All") => void;
  query: string;
  setQuery: (q: string) => void;
  docs: DocItem[];
}) {
  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-4">
      {/* Sidebar filters */}
      <div className="card p-3 h-fit lg:sticky lg:top-20">
        <div className="px-2 py-1 text-[10px] tracking-widest text-slate-500">CATEGORIES</div>
        <button
          onClick={() => setCategory("All")}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${category === "All" ? "bg-navy-800 text-white" : "hover:bg-slate-50 text-navy-700"}`}
        >
          <span>All documents</span>
          <span className={`text-[10px] ${category === "All" ? "text-white/70" : "text-slate-400"}`}>{DOCS.length}</span>
        </button>
        {CATEGORIES.map((c) => {
          const Ico = I[c.icon];
          const n = DOCS.filter((d) => d.category === c.id).length;
          const active = category === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${active ? "bg-navy-800 text-white" : "hover:bg-slate-50 text-navy-700"}`}
            >
              <Ico size={14} stroke={active ? "#D4AF37" : c.color} />
              <span className="flex-1 truncate">{c.id}</span>
              <span className={`text-[10px] ${active ? "text-white/70" : "text-slate-400"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Documents */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg">
            <I.search size={16} stroke="#64748b" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, ID or hash…"
              className="bg-transparent flex-1 outline-none text-sm"
            />
          </div>
          <div className="text-xs text-slate-500">{docs.length} of {DOCS.length} documents</div>
          <button className="btn-gold text-xs !py-1.5 !px-3">+ New Document</button>
        </div>

        <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
          {docs.map((d) => (
            <div key={d.id} className="px-4 py-3 hover:bg-slate-50 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <I.doc size={18} stroke="#0B1D3A" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono text-slate-500">{d.id}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                  {d.onChain && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">⛓ ANCHORED</span>}
                </div>
                <div className="text-sm font-medium text-navy-800 mt-0.5">{d.title}</div>
                <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{d.category}</span>
                  <span>Updated {d.updated}</span>
                  {d.signedBy && <span>Signed by {d.signedBy}</span>}
                  {d.expires && <span>Expires {d.expires}</span>}
                  <span className="font-mono text-violet-700">{d.hash}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="px-2 py-1 text-[11px] rounded hover:bg-slate-200 text-slate-600">View</button>
                <button className="px-2 py-1 text-[11px] rounded hover:bg-slate-200 text-slate-600">Download</button>
                <button className="px-2 py-1 text-[11px] rounded bg-navy-800 text-white">Sign</button>
              </div>
            </div>
          ))}
          {docs.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">No documents match your filters.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Cap Table & ESOP Tab ─────────────────────────── */

const CAP_TABLE = [
  { who: "BEYU Family Trust (Founders)", class: "Class A — Common", shares: 5_500_000, pct: 55.0, color: "#0B1D3A" },
  { who: "ESOP Pool (reserved)", class: "Options", shares: 1_500_000, pct: 15.0, color: "#D4AF37" },
  { who: "Acumen Fund (Seed SAFE → A)", class: "Class B — Preferred", shares: 1_200_000, pct: 12.0, color: "#7c3aed" },
  { who: "Novastar Ventures", class: "Class B — Preferred", shares: 800_000, pct: 8.0, color: "#0891b2" },
  { who: "Angel investors (×10)", class: "Class B — Preferred", shares: 500_000, pct: 5.0, color: "#557345" },
  { who: "Advisors (vested)", class: "Common", shares: 300_000, pct: 3.0, color: "#b45309" },
  { who: "Unallocated", class: "—", shares: 200_000, pct: 2.0, color: "#94a3b8" },
];

const ESOP_GRANTS = [
  { name: "Dr. M. Achieng", role: "Chief Medical Officer", grant: 120_000, vested: 60_000, cliff: "2024-09-01", exp: "2034-09-01" },
  { name: "Edith Sanga", role: "Chief Financial Officer", grant: 90_000, vested: 22_500, cliff: "2025-06-01", exp: "2035-06-01" },
  { name: "Dr. Salim Said", role: "Dental Innovation Lead", grant: 50_000, vested: 12_500, cliff: "2025-09-01", exp: "2035-09-01" },
  { name: "Grace Mushi", role: "Head of Nursing Excellence", grant: 30_000, vested: 7_500, cliff: "2025-09-01", exp: "2035-09-01" },
  { name: "Ahmed Bakari", role: "Pharmacy Operations", grant: 25_000, vested: 6_250, cliff: "2025-09-01", exp: "2035-09-01" },
];

function CapTableTab() {
  const totalShares = CAP_TABLE.reduce((s, r) => s + r.shares, 0);
  // build donut segments
  let acc = 0;
  const C = 2 * Math.PI * 60;
  const segs = CAP_TABLE.map((r) => {
    const len = (r.pct / 100) * C;
    const seg = { ...r, dash: `${len} ${C - len}`, offset: -acc };
    acc += len;
    return seg;
  });

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-6 lg:col-span-2">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="relative shrink-0">
              <svg viewBox="0 0 160 160" width={200} height={200} className="-rotate-90">
                <circle cx="80" cy="80" r="60" stroke="#f1f5f9" strokeWidth="20" fill="none" />
                {segs.map((s) => (
                  <circle
                    key={s.who}
                    cx="80" cy="80" r="60"
                    stroke={s.color} strokeWidth="20" fill="none"
                    strokeDasharray={s.dash}
                    strokeDashoffset={s.offset}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-display text-2xl text-navy-800">{(totalShares / 1_000_000).toFixed(1)}M</div>
                <div className="text-[10px] tracking-widest text-slate-500">SHARES ISSUED</div>
              </div>
            </div>
            <div className="flex-1 w-full space-y-2">
              {CAP_TABLE.map((r) => (
                <div key={r.who} className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded" style={{ background: r.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-navy-800 truncate">{r.who}</div>
                    <div className="text-[11px] text-slate-500">{r.class}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-navy-800">{r.pct.toFixed(1)}%</div>
                    <div className="text-[11px] text-slate-500">{r.shares.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Round History</div>
          <div className="space-y-3">
            {[
              { r: "Founding", d: "2024-06", a: "—", v: "Post: TZS 200M" },
              { r: "Friends & Family", d: "2024-11", a: "TZS 180M", v: "Post: TZS 500M" },
              { r: "Seed (SAFE)", d: "2025-11", a: "USD 1.2M", v: "Cap: USD 8M" },
              { r: "Series A (term sheet)", d: "2026-03", a: "USD 5.0M", v: "Pre: USD 20M" },
            ].map((r, i) => (
              <div key={r.r} className="relative pl-6">
                <div className="absolute left-0 top-1 w-3 h-3 rounded-full bg-gold-500 ring-4 ring-gold-50" />
                {i < 3 && <div className="absolute left-1.5 top-4 bottom-[-12px] w-px bg-slate-200" />}
                <div className="text-sm font-semibold text-navy-800">{r.r}</div>
                <div className="text-[11px] text-slate-500">{r.d} · {r.a}</div>
                <div className="text-[11px] text-gold-700">{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="font-display text-lg text-navy-800">ESOP Grants</div>
            <div className="text-xs text-slate-500">2025 Equity Incentive Plan · 4-year vesting · 1-year cliff</div>
          </div>
          <button className="btn-primary text-xs !py-1.5 !px-3">+ New Grant</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-5 py-2.5">GRANTEE</th>
              <th className="text-left px-5 py-2.5">GRANT</th>
              <th className="text-left px-5 py-2.5">VESTED</th>
              <th className="text-left px-5 py-2.5">CLIFF</th>
              <th className="text-left px-5 py-2.5">EXPIRY</th>
            </tr>
          </thead>
          <tbody>
            {ESOP_GRANTS.map((g) => {
              const pct = (g.vested / g.grant) * 100;
              return (
                <tr key={g.name} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-navy-800">{g.name}</div>
                    <div className="text-[11px] text-slate-500">{g.role}</div>
                  </td>
                  <td className="px-5 py-3 font-mono text-sm text-navy-800">{g.grant.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-28"><ProgressBar value={pct} color="#7c3aed" /></div>
                      <span className="text-xs text-slate-600">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">{g.vested.toLocaleString()} vested</div>
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-slate-600">{g.cliff}</td>
                  <td className="px-5 py-3 text-xs font-mono text-slate-600">{g.exp}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────── On-Chain Smart Contracts Tab ─────────────────────────── */

function OnChainTab() {
  const contracts = [
    {
      id: "0xBEy7...4A21",
      name: "BeyuTrustRegistry.sol",
      desc: "Anchors the BEYU Family Trust ownership and BEYU Holding Company on-chain identity.",
      events: 14, gas: "Gnosis · zk-rollup",
    },
    {
      id: "0xCAp9...7E33",
      name: "BeyuCapTable.sol",
      desc: "ERC-1400 security token representing share classes, vesting and transfer restrictions.",
      events: 42, gas: "EVM",
    },
    {
      id: "0xESp2...B901",
      name: "BeyuESOPVesting.sol",
      desc: "Cliff + linear vesting for ESOP grants with revocation hooks under board resolution.",
      events: 28, gas: "EVM",
    },
    {
      id: "0xSAf4...D844",
      name: "BeyuSAFE.sol",
      desc: "SAFE template (post-money) parameterized per investor with conversion automation.",
      events: 22, gas: "EVM",
    },
    {
      id: "0xSIG8...F260",
      name: "BeyuDocSign.sol",
      desc: "Multi-party eSignature with timestamped hash anchoring for any vault document.",
      events: 184, gas: "EVM",
    },
    {
      id: "0xCON1...A305",
      name: "BeyuConsent.sol",
      desc: "Patient-controlled cross-tenant medical-record sharing consents (granular, revocable).",
      events: 1_284, gas: "EVM · L2",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="card p-5 bg-gradient-to-br from-navy-800 to-navy-900 text-white">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] tracking-widest text-gold-400">SMART CONTRACT REGISTRY</div>
            <div className="font-display text-2xl mt-1">Governance, equity & consent — verifiable on-chain</div>
            <p className="text-white/70 text-sm mt-2 max-w-2xl">
              Every signed document and equity event is hashed and anchored to an EVM-compatible
              ledger (private Hyperledger Besu + public L2 mirror). Hashes prove integrity without
              exposing PHI.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { l: "Contracts", v: contracts.length },
              { l: "Anchored Docs", v: 38 },
              { l: "Events (24h)", v: "1.6k" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-white/10 px-4 py-2">
                <div className="font-display text-xl text-gold-300">{s.v}</div>
                <div className="text-[10px] text-white/60 tracking-widest">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {contracts.map((c) => (
          <div key={c.id} className="card p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-mono text-xs text-violet-700">{c.id}</div>
                <div className="font-display text-lg text-navy-800 mt-0.5">{c.name}</div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">DEPLOYED</span>
            </div>
            <div className="text-sm text-slate-600">{c.desc}</div>
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              <div className="rounded bg-slate-50 py-2">
                <div className="text-sm font-semibold text-navy-800">{c.events}</div>
                <div className="text-[10px] text-slate-500">events</div>
              </div>
              <div className="rounded bg-slate-50 py-2">
                <div className="text-sm font-semibold text-navy-800">v1.4</div>
                <div className="text-[10px] text-slate-500">version</div>
              </div>
              <div className="rounded bg-slate-50 py-2">
                <div className="text-sm font-semibold text-navy-800">{c.gas}</div>
                <div className="text-[10px] text-slate-500">network</div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="btn-outline text-xs !py-1.5 flex-1">Explorer</button>
              <button className="btn-primary text-xs !py-1.5 flex-1">Source</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-3">Recent On-Chain Events</div>
        <div className="space-y-1 text-xs font-mono">
          {[
            { t: "14:42:01", c: "BeyuDocSign", e: "DocumentSigned", a: "DOC-0082 · Series A Term Sheet · party 2/3", tx: "0xa1...e9" },
            { t: "14:38:22", c: "BeyuESOPVesting", e: "VestingTick", a: "Dr. M. Achieng · +2,500 shares vested", tx: "0xb2...f8" },
            { t: "13:50:11", c: "BeyuConsent", e: "ConsentGranted", a: "Patient BEYU-100484 → tenant ARU-MED-03 (read records)", tx: "0xc3...07" },
            { t: "12:18:44", c: "BeyuCapTable", e: "ShareTransfer", a: "5,000 Class A · Trust → ESOP Pool", tx: "0xd4...16" },
            { t: "11:02:09", c: "BeyuDocSign", e: "DocumentAnchored", a: "DOC-0007 · Written Approval — Aga Khan scope", tx: "0xe5...25" },
            { t: "09:44:30", c: "BeyuTrustRegistry", e: "BoardMemberRotated", a: "Director seat 3 transferred", tx: "0xf6...34" },
          ].map((r, i) => (
            <div key={i} className="grid grid-cols-[80px_140px_140px_1fr_80px] gap-2 py-1 border-b border-slate-50">
              <span className="text-slate-500">{r.t}</span>
              <span className="text-navy-800">{r.c}</span>
              <span className="text-violet-700">{r.e}</span>
              <span className="text-slate-600 truncate">{r.a}</span>
              <span className="text-right text-emerald-600">{r.tx}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
