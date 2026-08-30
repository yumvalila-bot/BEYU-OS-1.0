import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { DocumentViewer, DocList } from "../components/DocumentViewer";
import { docsForModule, type BeyuDoc } from "../data/documents";

/* ─────────────────────────── Layer Definitions ─────────────────────────── */

type Layer = {
  num: number;
  title: string;
  subtitle: string;
  role: string;
  color: string;
  accent: string;
  icon: keyof typeof I;
  badge: string;
  sections: {
    label: string;
    icon?: keyof typeof I;
    items: { name: string; sub?: string }[];
  }[];
};

const LAYERS: Layer[] = [
  {
    num: 1,
    title: "BEYU Family Trust",
    subtitle: "Supreme Constitutional Ownership Layer",
    role: "Ultimate sovereign authority · mission preservation · asset protection",
    color: "#0B1D3A",
    accent: "#D4AF37",
    icon: "shield",
    badge: "OWNS",
    sections: [
      {
        label: "Owns",
        icon: "star",
        items: [
          { name: "BEYU Health OS — IP & Source Code", sub: "100% beneficial ownership" },
          { name: "AI Models & Hive Runtime Weights", sub: "trade-secret + IP assignment" },
          { name: "BEYU Brand & Trademarks", sub: "TZ-2025-4421, Madrid Protocol" },
          { name: "BEYU Holding Company Equity", sub: "55.0% Class A controlling stake" },
        ],
      },
      {
        label: "Systems",
        icon: "settings",
        items: [
          { name: "Trust Governance Engine", sub: "Trustee voting, succession" },
          { name: "Constitutional Controls", sub: "Veto on AI safety, PHI, ownership" },
          { name: "Beneficiary Ledger", sub: "On-chain heirs registry" },
        ],
      },
    ],
  },
  {
    num: 2,
    title: "BEYU Holding Company",
    subtitle: "Strategic Enterprise Governance Layer",
    role: "Strategic governance · capital allocation · treasury management",
    color: "#1E3A8A",
    accent: "#D4AF37",
    icon: "building",
    badge: "GOVERNS",
    sections: [
      {
        label: "Executive Council",
        icon: "users",
        items: [
          { name: "Chairman / Group CEO", sub: "Dr. John Doe" },
          { name: "Group CFO", sub: "Edith Sanga" },
          { name: "Group COO", sub: "Edward Kileo" },
          { name: "Group CTO", sub: "Daniel Kessy" },
          { name: "Group CRO (Chief Risk)", sub: "Anna Komba" },
          { name: "Group CHRO", sub: "Halima Said" },
          { name: "General Counsel", sub: "Joseph Tesha, Adv." },
        ],
      },
      {
        label: "Mandate",
        icon: "scale",
        items: [
          { name: "Capital Allocation", sub: "Across 11 operating companies" },
          { name: "Treasury & Reserves", sub: "USDC + TZS multi-currency" },
          { name: "M&A and Investments", sub: "Subject to Trust veto" },
          { name: "Board Reporting", sub: "Quarterly to Class A & B" },
        ],
      },
    ],
  },
  {
    num: 3,
    title: "BEYU Operating Companies",
    subtitle: "Execution & Business Operations",
    role: "Eleven specialized operating companies executing the BEYU mission across sectors",
    color: "#0891b2",
    accent: "#D4AF37",
    icon: "building",
    badge: "OPERATE",
    sections: [
      {
        label: "11 Operating Companies",
        icon: "building",
        items: [
          { name: "BEYU Health Corp", sub: "Hospitals, EMR/EHR, telemedicine" },
          { name: "BEYU FinTech", sub: "Patient credit, insurance rails, M-Pesa" },
          { name: "BEYU Logistics", sub: "Medical supply chain, cold chain" },
          { name: "BEYU Insurance", sub: "Health micro-insurance products" },
          { name: "BEYU Real Estate", sub: "Hospital & clinic property holdings" },
          { name: "BEYU Research", sub: "Clinical trials, R&D, publications" },
          { name: "BEYU Education", sub: "Medical training, CPD academy" },
          { name: "BEYU Mining", sub: "Strategic mineral interests (Trust)" },
          { name: "BEYU Energies", sub: "Hospital solar microgrids" },
          { name: "BEYU Agriculture", sub: "Nutrition & community health" },
          { name: "BEYU Corporate Services", sub: "Shared back-office for all OpCos" },
        ],
      },
    ],
  },
  {
    num: 4,
    title: "BEYU Health OS",
    subtitle: "Core Enterprise Technology Platform",
    role: "Enterprise healthcare OS · AI orchestration · multi-tenant cloud",
    color: "#7c3aed",
    accent: "#D4AF37",
    icon: "brain",
    badge: "PLATFORM",
    sections: [
      {
        label: "Core Subsystems",
        icon: "zap",
        items: [
          { name: "HIVE AI Runtime", sub: "12 governed agents, kill-switch" },
          { name: "Global Identity Engine (MPI)", sub: "One MRN across all tenants" },
          { name: "Enterprise RBAC", sub: "Least-privilege, biometric MFA" },
          { name: "Tenant Isolation Engine", sub: "Row-level + network-level" },
        ],
      },
      {
        label: "Deployment",
        icon: "cloud",
        items: [
          { name: "AWS EKS (managed)", sub: "Primary cloud regions" },
          { name: "On-Premise Kubernetes", sub: "For sovereign tenants" },
          { name: "Edge Nodes (offline-first)", sub: "Rural clinics, sync on reconnect" },
          { name: "Native Apps", sub: "Android, iOS, Windows, macOS, Linux" },
        ],
      },
    ],
  },
  {
    num: 5,
    title: "Enterprise Service Fabric",
    subtitle: "Microservices & Infrastructure",
    role: "The granular service mesh powering BEYU Health OS",
    color: "#0d9488",
    accent: "#D4AF37",
    icon: "database",
    badge: "SERVICES",
    sections: [
      {
        label: "Clinical Services",
        icon: "heart",
        items: [
          { name: "EMR / EHR · Vitals · Notes", sub: "FHIR R5 native" },
          { name: "LIS · RIS · PACS · Pharmacy", sub: "HL7 v2 + DICOM" },
          { name: "Telemedicine · Maternity", sub: "WebRTC + E2EE" },
          { name: "Orders · Prescriptions", sub: "CPOE with AI safety" },
        ],
      },
      {
        label: "AI Services",
        icon: "brain",
        items: [
          { name: "Clinical Co-Pilot", sub: "LLM-backed, audited" },
          { name: "Vision AI (Dental, Radiology)", sub: "ONNX + MONAI" },
          { name: "Triage AI · Coding AI", sub: "ESI + ICD-11" },
          { name: "Voice / Ambient AI", sub: "Hands-free notes" },
        ],
      },
      {
        label: "Enterprise Services",
        icon: "building",
        items: [
          { name: "Billing & Revenue Cycle", sub: "NHIF + insurance" },
          { name: "Finance · GL · Payroll", sub: "TRA / EFD compliant" },
          { name: "HR · Procurement · Inventory", sub: "ERP suite" },
          { name: "Analytics · MTUHA · DHIS2", sub: "Statutory + business intel" },
        ],
      },
      {
        label: "Identity & Security",
        icon: "lock",
        items: [
          { name: "Auth (OIDC + WebAuthn)", sub: "Biometric MFA" },
          { name: "Tenant RLS + ABAC", sub: "Per-row enforcement" },
          { name: "Audit · SIEM · IDS", sub: "Immutable, 7-year retention" },
          { name: "Smart Contract Anchor", sub: "BeyuDocSign + Consent" },
        ],
      },
    ],
  },
  {
    num: 6,
    title: "Multi-Tenant Health Network",
    subtitle: "Isolated Delivery Ecosystem",
    role: "Tenant hospitals & clinics — each in their own isolated data plane",
    color: "#be123c",
    accent: "#D4AF37",
    icon: "building",
    badge: "TENANTS",
    sections: [
      {
        label: "Tenant Isolation Model",
        icon: "shield",
        items: [
          { name: "Tenant", sub: "Hospital / Clinic / Lab / Pharmacy" },
          { name: "↓ Departments", sub: "OPD · IPD · ICU · Theatre · Pharmacy …" },
          { name: "↓ Users", sub: "Doctors · Nurses · Pharmacists · Admin" },
          { name: "↓ Patients", sub: "MRN scoped to tenant + global MPI link" },
        ],
      },
      {
        label: "Isolation Guarantees",
        icon: "lock",
        items: [
          { name: "Data Isolation", sub: "Row-level + network segmentation" },
          { name: "AI Isolation", sub: "No cross-tenant model fine-tuning" },
          { name: "Billing Isolation", sub: "Per-tenant ledger & NHIF claims" },
          { name: "Consent-Gated Sharing", sub: "Patient-controlled, on-chain" },
        ],
      },
    ],
  },
  {
    num: 7,
    title: "Adaptive Workspaces & End Users",
    subtitle: "Role-Based Interfaces",
    role: "The surface every human interacts with — adapted to role, device & jurisdiction",
    color: "#b45309",
    accent: "#D4AF37",
    icon: "users",
    badge: "USERS",
    sections: [
      {
        label: "Workspaces",
        icon: "monitor",
        items: [
          { name: "Trustee Workspace", sub: "Constitutional controls, veto" },
          { name: "Board Workspace", sub: "Governance, resolutions, voting" },
          { name: "Executive Workspace", sub: "C-suite dashboards, OKRs" },
          { name: "Clinical Workspace", sub: "Doctor, nurse, allied" },
          { name: "Patient Workspace", sub: "Mobile portal, biometric login" },
        ],
      },
      {
        label: "End Users",
        icon: "user",
        items: [
          { name: "Trustees", sub: "3 named in Trust Deed" },
          { name: "Board Members", sub: "5 directors per SHA" },
          { name: "Executives", sub: "C-suite + 9 directors" },
          { name: "Doctors · Nurses", sub: "Clinical workforce" },
          { name: "Pharmacy · Laboratory", sub: "Diagnostic staff" },
          { name: "Patients", sub: "2.4M+ across all tenants" },
        ],
      },
    ],
  },
];

/* ─────────────────────────── Helper Components ─────────────────────────── */

function LayerCard({ layer, expanded, onToggle }: { layer: Layer; expanded: boolean; onToggle: () => void }) {
  const Icon = I[layer.icon];
  return (
    <div className="card overflow-hidden relative" style={{ borderTopColor: layer.color, borderTopWidth: 4 }}>
      {/* Left rail with layer number */}
      <div className="flex">
        <div
          className="w-20 sm:w-24 shrink-0 flex flex-col items-center justify-start py-6 text-white relative"
          style={{ background: `linear-gradient(135deg, ${layer.color}, ${layer.color}dd)` }}
        >
          <div className="text-[9px] tracking-[0.3em] opacity-70">LAYER</div>
          <div className="font-display text-5xl mt-1" style={{ color: layer.accent }}>{layer.num}</div>
          <Icon size={24} stroke={layer.accent} className="mt-3" />
          <div className="absolute bottom-3 text-[9px] tracking-[0.25em] opacity-60 rotate-90 origin-bottom-left translate-y-[-100%] whitespace-nowrap hidden sm:block">
            {layer.badge}
          </div>
        </div>

        <div className="flex-1 min-w-0 p-5">
          <button onClick={onToggle} className="w-full text-left">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-[0.25em] font-semibold" style={{ color: layer.color }}>{layer.subtitle.toUpperCase()}</div>
                <h2 className="font-display text-2xl text-navy-800 mt-1">{layer.title}</h2>
                <p className="text-sm text-slate-600 mt-1">{layer.role}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded font-bold tracking-wider" style={{ background: `${layer.color}15`, color: layer.color }}>
                {layer.badge}
              </span>
            </div>
          </button>

          {/* Sections — always visible (collapsible only changes density) */}
          <div className={`mt-4 grid gap-3 ${layer.sections.length > 2 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-2"}`}>
            {layer.sections.map((sec) => {
              const SecIcon = sec.icon ? I[sec.icon] : I.check;
              return (
                <div key={sec.label} className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: `${layer.color}20` }}>
                      <SecIcon size={12} stroke={layer.color} />
                    </div>
                    <span className="text-[10px] tracking-[0.2em] font-semibold text-slate-600">{sec.label.toUpperCase()}</span>
                  </div>
                  <div className="space-y-1.5">
                    {(expanded ? sec.items : sec.items.slice(0, 4)).map((it) => (
                      <div key={it.name} className="text-xs">
                        <div className="text-navy-800 font-medium leading-tight">{it.name}</div>
                        {it.sub && <div className="text-[10px] text-slate-500">{it.sub}</div>}
                      </div>
                    ))}
                    {!expanded && sec.items.length > 4 && (
                      <button onClick={onToggle} className="text-[10px] text-gold-700 font-semibold hover:underline">
                        + {sec.items.length - 4} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Connection arrow between layers — gold arrow with label */
function Connector({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center -my-1 relative z-10">
      <div className="w-0.5 h-4 bg-gold-400" />
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500 text-navy-900 text-[10px] font-bold tracking-widest shadow-md">
        ▼ {label}
      </div>
      <div className="w-0.5 h-4 bg-gold-400" />
    </div>
  );
}

/* ─────────────────────────── Structural Command Cards ─────────────────────────── */

function CommandFlowCard({ title, subtitle, color, flow }: {
  title: string; subtitle: string; color: string;
  flow: { node: string; sub?: string; type?: "start" | "decision" | "end" | "system" }[];
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="w-2 h-8 rounded" style={{ background: color }} />
        <div>
          <div className="font-display text-lg text-navy-800">{title}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
      </div>
      <div className="mt-4 space-y-1">
        {flow.map((f, i) => (
          <div key={i}>
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              f.type === "start" ? "bg-navy-50 border-navy-200" :
              f.type === "decision" ? "bg-gold-50 border-gold-200" :
              f.type === "end" ? "bg-emerald-50 border-emerald-200" :
              "bg-white border-slate-200"
            }`}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: color }}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-navy-800">{f.node}</div>
                {f.sub && <div className="text-[10px] text-slate-500">{f.sub}</div>}
              </div>
              {f.type === "decision" && <I.scale size={14} stroke="#b45309" />}
              {f.type === "system" && <I.zap size={14} stroke={color} />}
              {f.type === "end" && <I.check size={14} stroke="#059669" />}
            </div>
            {i < flow.length - 1 && (
              <div className="flex justify-center py-0.5">
                <div className="w-0.5 h-3 bg-slate-300" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Main Screen ─────────────────────────── */

export function EnterpriseHierarchyScreen() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1, 4]));
  const [doc, setDoc] = useState<BeyuDoc | null>(null);
  const hierarchyDocs = docsForModule("hierarchy");

  const toggle = (n: number) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set([1, 2, 3, 4, 5, 6, 7]));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Enterprise Hierarchy"
        subtitle="The 7-layer sovereign architecture — from Trust to End User"
        actions={
          <>
            <button onClick={collapseAll} className="btn-outline text-sm">Collapse</button>
            <button onClick={expandAll} className="btn-primary text-sm">Expand All</button>
          </>
        }
      />

      {/* Hero banner */}
      <div className="card p-6 mb-6 bg-gradient-to-br from-navy-900 via-navy-800 to-violet-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-dot opacity-20" />
        <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-6">
          <div className="flex-1">
            <div className="text-[11px] tracking-[0.3em] text-gold-400 font-semibold">SOVEREIGN ENTERPRISE ARCHITECTURE</div>
            <h2 className="font-display text-3xl lg:text-4xl mt-2">
              7 Layers · 1 Mission · <span className="text-gold-400">Generational Trust</span>
            </h2>
            <p className="text-white/70 mt-3 max-w-2xl text-sm">
              From the BEYU Family Trust at the top to the patient on the ground — every layer is
              constitutionally bound, technically isolated, and economically aligned to bridge care
              and build trust for generations.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 shrink-0 w-full lg:w-auto">
            {[
              { l: "Layers", v: "7" },
              { l: "OpCos", v: "11" },
              { l: "Tenants", v: "120+" },
              { l: "Patients", v: "2.4M" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-center">
                <div className="font-display text-2xl text-gold-300">{s.v}</div>
                <div className="text-[10px] tracking-widest text-white/60 mt-0.5">{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The 7-layer vertical flow */}
      <div className="space-y-2">
        {LAYERS.map((layer, i) => (
          <div key={layer.num}>
            <LayerCard layer={layer} expanded={expanded.has(layer.num)} onToggle={() => toggle(layer.num)} />
            {i < LAYERS.length - 1 && (
              <Connector
                label={
                  layer.num === 1 ? "OWNS" :
                  layer.num === 2 ? "GOVERNS" :
                  layer.num === 3 ? "OPERATES" :
                  layer.num === 4 ? "POWERED BY" :
                  layer.num === 5 ? "DELIVERS TO" : "SERVES"
                }
              />
            )}
          </div>
        ))}
      </div>

      {/* Closing arrow to patients */}
      <div className="flex justify-center mt-4">
        <div className="px-6 py-3 rounded-full bg-emerald-500 text-white font-display text-lg flex items-center gap-3 shadow-lg">
          <I.heart size={18} stroke="#fff" />
          Ultimately serving every patient, securely & intelligently
        </div>
      </div>

      {/* ─── Structural Command Cards ─── */}
      <div className="mt-10">
        <div className="text-center mb-6">
          <div className="text-[11px] tracking-[0.3em] text-gold-700 font-semibold">STRUCTURAL COMMAND FLOWS</div>
          <h3 className="font-display text-2xl text-navy-800 mt-2">How the Hierarchy Actually Works</h3>
          <div className="gold-divider w-20 mx-auto mt-3" />
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <CommandFlowCard
            title="Constitutional Decision Flow"
            subtitle="How a major decision (e.g. cross-border PHI transfer) traverses the hierarchy"
            color="#0B1D3A"
            flow={[
              { node: "Initiative raised by OpCo", sub: "e.g. BEYU Health Corp expansion to Kenya", type: "start" },
              { node: "Reviewed by Executive Council", sub: "Group CEO + General Counsel" },
              { node: "Risk + Compliance assessment", sub: "Group CRO + CHRO sign-off", type: "system" },
              { node: "Holding Co. Board vote", sub: "5 directors, majority required", type: "decision" },
              { node: "Trust constitutional check", sub: "BEYU Family Trust veto window 14d", type: "decision" },
              { node: "DAO ratification (on-chain)", sub: "BIP proposal · BeyuTrustRegistry.sol", type: "system" },
              { node: "Execution authorized", sub: "Logged in audit + smart contract", type: "end" },
            ]}
          />

          <CommandFlowCard
            title="Operational Command Chain"
            subtitle="A clinical event escalating from the bedside to the boardroom"
            color="#be123c"
            flow={[
              { node: "Bedside event", sub: "Nurse records vital alert", type: "start" },
              { node: "Triage AI flags critical", sub: "Auto-routes to clinician", type: "system" },
              { node: "Doctor decision + EMR log", sub: "Final clinical authority" },
              { node: "Department head review", sub: "Daily safety huddle" },
              { node: "Hospital CMO dashboard", sub: "Tenant-level KPIs" },
              { node: "OpCo (BEYU Health Corp) review", sub: "Cross-tenant aggregation", type: "system" },
              { node: "Holding Co. Risk Committee", sub: "Quarterly clinical safety report", type: "end" },
            ]}
          />

          <CommandFlowCard
            title="Identity & Access Chain"
            subtitle="How a user gets verified access — Trust to bedside in one chain"
            color="#7c3aed"
            flow={[
              { node: "User authenticates", sub: "WebAuthn / biometric / PIN", type: "start" },
              { node: "Global Identity Engine", sub: "MPI lookup or new ID issued", type: "system" },
              { node: "Tenant context selected", sub: "Active hospital scope" },
              { node: "Enterprise RBAC check", sub: "Role + ABAC attributes", type: "decision" },
              { node: "Tenant Isolation Engine", sub: "Row-level enforcement applied", type: "system" },
              { node: "Workspace rendered", sub: "Role-adapted UI surfaces", type: "system" },
              { node: "Audit + Hive logging active", sub: "Every action signed & anchored", type: "end" },
            ]}
          />
        </div>
      </div>

      {/* Governing documents */}
      <div className="mt-10">
        <div className="text-center mb-6">
          <div className="text-[11px] tracking-[0.3em] text-gold-700 font-semibold">GOVERNING INSTRUMENTS</div>
          <h3 className="font-display text-2xl text-navy-800 mt-2">The Documents that Define this Hierarchy</h3>
          <div className="gold-divider w-20 mx-auto mt-3" />
        </div>
        <DocList
          docs={hierarchyDocs}
          onOpen={setDoc}
        />
      </div>

      <DocumentViewer doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
