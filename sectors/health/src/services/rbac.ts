// ─────────────────────────────────────────────────────────────────────────────
// RBAC + Security Service
// Central source of truth for roles, permissions, classification levels and
// authorization checks. Used by guards across the platform.
// ─────────────────────────────────────────────────────────────────────────────

export type Permission =
  // Patient & EMR
  | "patient:read" | "patient:write" | "patient:register"
  | "phi:read" | "phi:write" | "phi:export"
  // Clinical
  | "rx:write" | "rx:dispense" | "rx:controlled"
  | "order:lab" | "order:imaging" | "order:procedure"
  | "note:write" | "note:sign" | "discharge:approve"
  // Finance
  | "billing:read" | "billing:write" | "claim:submit" | "payment:receive"
  // Operations
  | "hr:read" | "hr:write" | "payroll:run"
  | "inventory:read" | "inventory:write" | "po:approve"
  // Governance
  | "tenant:switch" | "tenant:admin"
  | "audit:read" | "audit:export"
  | "ai:configure" | "ai:killswitch" | "ai:override"
  | "rbac:read" | "rbac:write"
  | "contract:sign" | "contract:anchor"
  | "board:vote" | "trustee:veto"
  // Public Health
  | "ph:surveillance" | "ph:outbreak-declare"
  // Break-glass
  | "breakglass:request" | "breakglass:approve";

export type RoleId =
  | "trustee" | "board" | "ceo" | "cmo" | "cno" | "cfo" | "cto" | "cro" | "general-counsel"
  | "doctor" | "nurse" | "pharmacy" | "pharmacy-chief" | "lab" | "radiology"
  | "admin" | "hr-director" | "finance" | "procurement"
  | "ai-safety-officer" | "auditor" | "patient" | "moh-official";

export type ClassificationLevel = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "PHI" | "RESTRICTED" | "TRUSTEE-ONLY";

export interface Role {
  id: RoleId;
  label: string;
  cadre: "Constitutional" | "Governance" | "Executive" | "Clinical" | "Allied" | "Operations" | "External";
  permissions: Permission[];
  description: string;
}

/** Full role-permission matrix. */
export const ROLES_RBAC: Role[] = [
  {
    id: "trustee", label: "Trustee · BEYU Family Trust", cadre: "Constitutional",
    description: "Supreme constitutional authority. Read-only on PHI by design; full veto on governance.",
    permissions: [
      "audit:read", "audit:export", "ai:killswitch", "trustee:veto",
      "contract:sign", "contract:anchor", "rbac:read",
      "breakglass:approve", "tenant:switch",
    ],
  },
  {
    id: "board", label: "Board Member · Holding Co.", cadre: "Governance",
    description: "Strategic governance. No PHI access. Board voting + approvals.",
    permissions: [
      "audit:read", "rbac:read", "contract:sign", "board:vote",
      "billing:read", "tenant:switch", "ai:configure",
    ],
  },
  {
    id: "ceo", label: "Chief Executive Officer", cadre: "Executive",
    description: "Operational authority. PHI access via break-glass only.",
    permissions: [
      "audit:read", "audit:export", "rbac:read", "rbac:write", "tenant:switch", "tenant:admin",
      "hr:read", "hr:write", "billing:read", "ai:configure", "ai:override",
      "breakglass:request", "breakglass:approve", "contract:sign",
    ],
  },
  {
    id: "cmo", label: "Chief Medical Officer", cadre: "Executive",
    description: "Clinical authority. Full PHI read; sign-off on clinical AI.",
    permissions: [
      "patient:read", "phi:read", "phi:write", "rx:write", "rx:controlled", "note:write", "note:sign",
      "discharge:approve", "order:lab", "order:imaging", "order:procedure",
      "audit:read", "ai:override", "ai:configure", "ai:killswitch",
      "tenant:switch", "breakglass:approve",
    ],
  },
  {
    id: "cno", label: "Chief Nursing Officer", cadre: "Executive",
    description: "Nursing authority and ward operations.",
    permissions: [
      "patient:read", "phi:read", "phi:write", "note:write", "audit:read",
      "hr:read", "tenant:switch", "rx:dispense",
    ],
  },
  {
    id: "cfo", label: "Chief Financial Officer", cadre: "Executive",
    description: "Financial controller. No PHI access.",
    permissions: [
      "billing:read", "billing:write", "claim:submit", "payment:receive",
      "audit:read", "audit:export", "po:approve", "payroll:run", "tenant:switch", "contract:sign",
    ],
  },
  {
    id: "cto", label: "Chief Technology Officer", cadre: "Executive",
    description: "Platform engineering & AI infrastructure.",
    permissions: [
      "ai:configure", "ai:override", "ai:killswitch", "audit:read", "audit:export",
      "rbac:read", "rbac:write", "tenant:admin", "breakglass:approve",
    ],
  },
  {
    id: "cro", label: "Chief Risk Officer", cadre: "Executive",
    description: "Enterprise risk + compliance oversight.",
    permissions: [
      "audit:read", "audit:export", "rbac:read", "ai:configure",
      "breakglass:approve", "tenant:switch", "ph:surveillance",
    ],
  },
  {
    id: "general-counsel", label: "General Counsel", cadre: "Executive",
    description: "Legal authority. Contracts + DPO duties.",
    permissions: [
      "contract:sign", "contract:anchor", "audit:read", "audit:export",
      "rbac:read", "tenant:switch", "breakglass:approve",
    ],
  },
  {
    id: "doctor", label: "Doctor / Clinician", cadre: "Clinical",
    description: "Clinical practitioner. PHI scoped to active tenant.",
    permissions: [
      "patient:read", "patient:write", "phi:read", "phi:write",
      "rx:write", "order:lab", "order:imaging", "order:procedure",
      "note:write", "note:sign", "discharge:approve",
      "ai:override", "breakglass:request", "tenant:switch",
    ],
  },
  {
    id: "nurse", label: "Nurse / Ward Officer", cadre: "Clinical",
    description: "Bedside care + medication administration. PHI scoped to ward.",
    permissions: [
      "patient:read", "phi:read", "phi:write", "note:write",
      "rx:dispense", "breakglass:request",
    ],
  },
  {
    id: "pharmacy", label: "Pharmacist", cadre: "Allied",
    description: "Dispensing & counselling. Read Rx + write dispense events.",
    permissions: [
      "patient:read", "phi:read", "rx:dispense", "inventory:read", "inventory:write",
      "note:write",
    ],
  },
  {
    id: "pharmacy-chief", label: "Chief Pharmacist", cadre: "Allied",
    description: "Pharmacy operations + controlled-substance authority.",
    permissions: [
      "patient:read", "phi:read", "rx:dispense", "rx:controlled",
      "inventory:read", "inventory:write", "po:approve", "note:write", "audit:read",
    ],
  },
  {
    id: "lab", label: "Lab Technologist", cadre: "Allied",
    description: "Specimen processing + result release.",
    permissions: [
      "patient:read", "phi:read", "phi:write", "order:lab", "note:write",
      "inventory:read",
    ],
  },
  {
    id: "radiology", label: "Radiographer / Radiologist", cadre: "Allied",
    description: "Imaging acquisition + reporting.",
    permissions: [
      "patient:read", "phi:read", "phi:write", "order:imaging", "note:write", "note:sign",
    ],
  },
  {
    id: "admin", label: "Hospital Administrator", cadre: "Operations",
    description: "Tenant operations. No direct PHI access.",
    permissions: [
      "patient:register", "hr:read", "billing:read", "audit:read",
      "tenant:admin", "rbac:read", "inventory:read", "breakglass:request",
    ],
  },
  {
    id: "hr-director", label: "HR Director", cadre: "Operations",
    description: "Human resources authority.",
    permissions: [
      "hr:read", "hr:write", "payroll:run", "audit:read", "rbac:read",
      "contract:sign", "tenant:switch",
    ],
  },
  {
    id: "finance", label: "Accountant / Finance", cadre: "Operations",
    description: "Day-to-day finance operations.",
    permissions: [
      "billing:read", "billing:write", "claim:submit", "payment:receive",
      "inventory:read",
    ],
  },
  {
    id: "procurement", label: "Procurement Officer", cadre: "Operations",
    description: "Supplier management + purchase orders.",
    permissions: ["inventory:read", "inventory:write", "po:approve"],
  },
  {
    id: "ai-safety-officer", label: "AI Safety Officer", cadre: "Governance",
    description: "Monitors Hive Runtime + can throttle agents.",
    permissions: [
      "ai:configure", "ai:override", "ai:killswitch",
      "audit:read", "audit:export", "rbac:read",
    ],
  },
  {
    id: "auditor", label: "Internal / External Auditor", cadre: "Governance",
    description: "Read-only auditor with full audit + de-identified PHI scope.",
    permissions: ["audit:read", "audit:export", "rbac:read", "billing:read", "tenant:switch"],
  },
  {
    id: "patient", label: "Patient (Citizen App)", cadre: "External",
    description: "Sees only own record + grants consents.",
    permissions: ["patient:read", "phi:read"],
  },
  {
    id: "moh-official", label: "MoH Government Official", cadre: "External",
    description: "Aggregate population health + de-identified data.",
    permissions: ["ph:surveillance", "ph:outbreak-declare", "audit:read"],
  },
];

export const PERMISSIONS_META: Record<Permission, { label: string; group: string; sensitivity: "low" | "med" | "high" | "critical" }> = {
  "patient:read": { label: "Read patient demographics", group: "Patient & EMR", sensitivity: "med" },
  "patient:write": { label: "Update patient demographics", group: "Patient & EMR", sensitivity: "high" },
  "patient:register": { label: "Register new patient", group: "Patient & EMR", sensitivity: "med" },
  "phi:read": { label: "Read PHI (clinical record)", group: "Patient & EMR", sensitivity: "high" },
  "phi:write": { label: "Write PHI", group: "Patient & EMR", sensitivity: "high" },
  "phi:export": { label: "Export PHI", group: "Patient & EMR", sensitivity: "critical" },
  "rx:write": { label: "Prescribe medication", group: "Clinical", sensitivity: "high" },
  "rx:dispense": { label: "Dispense medication", group: "Clinical", sensitivity: "high" },
  "rx:controlled": { label: "Prescribe controlled substances", group: "Clinical", sensitivity: "critical" },
  "order:lab": { label: "Order laboratory tests", group: "Clinical", sensitivity: "med" },
  "order:imaging": { label: "Order imaging studies", group: "Clinical", sensitivity: "med" },
  "order:procedure": { label: "Order procedures", group: "Clinical", sensitivity: "high" },
  "note:write": { label: "Write clinical notes", group: "Clinical", sensitivity: "med" },
  "note:sign": { label: "Sign / attest clinical notes", group: "Clinical", sensitivity: "high" },
  "discharge:approve": { label: "Approve discharge", group: "Clinical", sensitivity: "high" },
  "billing:read": { label: "Read billing data", group: "Finance", sensitivity: "low" },
  "billing:write": { label: "Issue invoices", group: "Finance", sensitivity: "med" },
  "claim:submit": { label: "Submit insurance claims", group: "Finance", sensitivity: "med" },
  "payment:receive": { label: "Receive payments", group: "Finance", sensitivity: "high" },
  "hr:read": { label: "Read HR records", group: "Operations", sensitivity: "med" },
  "hr:write": { label: "Modify HR records", group: "Operations", sensitivity: "high" },
  "payroll:run": { label: "Run payroll", group: "Operations", sensitivity: "critical" },
  "inventory:read": { label: "Read inventory", group: "Operations", sensitivity: "low" },
  "inventory:write": { label: "Modify inventory", group: "Operations", sensitivity: "med" },
  "po:approve": { label: "Approve purchase orders", group: "Operations", sensitivity: "high" },
  "tenant:switch": { label: "Switch active tenant", group: "Governance", sensitivity: "med" },
  "tenant:admin": { label: "Administer tenant settings", group: "Governance", sensitivity: "critical" },
  "audit:read": { label: "Read audit trail", group: "Governance", sensitivity: "high" },
  "audit:export": { label: "Export audit data", group: "Governance", sensitivity: "critical" },
  "ai:configure": { label: "Configure Hive AI policies", group: "AI & Hive", sensitivity: "high" },
  "ai:killswitch": { label: "Invoke AI kill-switch", group: "AI & Hive", sensitivity: "critical" },
  "ai:override": { label: "Override AI suggestion", group: "AI & Hive", sensitivity: "med" },
  "rbac:read": { label: "View roles & permissions", group: "Governance", sensitivity: "med" },
  "rbac:write": { label: "Modify roles & permissions", group: "Governance", sensitivity: "critical" },
  "contract:sign": { label: "Sign legal documents", group: "Governance", sensitivity: "high" },
  "contract:anchor": { label: "Anchor docs on-chain", group: "Governance", sensitivity: "high" },
  "board:vote": { label: "Cast board vote", group: "Governance", sensitivity: "high" },
  "trustee:veto": { label: "Cast trustee veto", group: "Governance", sensitivity: "critical" },
  "ph:surveillance": { label: "Public-health surveillance access", group: "Public Health", sensitivity: "high" },
  "ph:outbreak-declare": { label: "Declare outbreak", group: "Public Health", sensitivity: "critical" },
  "breakglass:request": { label: "Request break-glass access", group: "Emergency", sensitivity: "critical" },
  "breakglass:approve": { label: "Approve break-glass access", group: "Emergency", sensitivity: "critical" },
};

/** Map the App.tsx role keys (different naming) → canonical RBAC role IDs. */
const APP_ROLE_MAP: Record<string, RoleId> = {
  trustee: "trustee", board: "board", ceo: "ceo",
  doctor: "doctor", nurse: "nurse",
  admin: "admin", pharmacy: "pharmacy-chief", lab: "lab",
  finance: "cfo", patient: "patient",
};

export function roleFor(appRole: string): Role {
  const id = APP_ROLE_MAP[appRole] || "patient";
  return ROLES_RBAC.find((r) => r.id === id)!;
}

export function can(appRole: string, perm: Permission): boolean {
  return roleFor(appRole).permissions.includes(perm);
}

export function classificationStyle(c: ClassificationLevel) {
  const map: Record<ClassificationLevel, { bg: string; text: string; border: string; label: string }> = {
    PUBLIC: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "PUBLIC" },
    INTERNAL: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200", label: "INTERNAL" },
    CONFIDENTIAL: { bg: "bg-navy-50", text: "text-navy-700", border: "border-navy-200", label: "CONFIDENTIAL" },
    PHI: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", label: "PHI · ENCRYPTED" },
    RESTRICTED: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "RESTRICTED" },
    "TRUSTEE-ONLY": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", label: "TRUSTEE-ONLY" },
  };
  return map[c];
}

export const SECURITY_KPIS = {
  zeroTrustScore: 96,
  mfaEnrollment: 98,
  encryptionCoverage: 100,
  failedLogins24h: 12,
  blockedCrossTenant: 0,
  breakGlassPending: 1,
  permissionDenied24h: 84,
  vulnerabilities: { critical: 0, high: 0, medium: 2, low: 8 },
};
