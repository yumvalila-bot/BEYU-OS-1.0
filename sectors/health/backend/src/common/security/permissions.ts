/**
 * BEYU Health OS — Canonical Permission & Role Model (server-side source of truth)
 *
 * Phase 1 (identity/authorization foundation). This module is the authoritative
 * RBAC catalog enforced by guards on the API/service boundary. The client-side
 * catalog in the frontend is for UI presentation only and must never be the
 * enforcement point.
 *
 * Every role maps to a set of permissions. A request is authorized if the
 * authenticated user's effective role (or explicit permission set) satisfies
 * the permission required by the route.
 */
export type Permission =
  // Patient & EMR
  | "patient:read"
  | "patient:write"
  | "patient:register"
  | "phi:read"
  | "phi:write"
  | "phi:export"
  // Clinical
  | "rx:write"
  | "rx:dispense"
  | "rx:controlled"
  | "order:lab"
  | "order:imaging"
  | "order:procedure"
  | "note:write"
  | "note:sign"
  | "discharge:approve"
  // Finance
  | "billing:read"
  | "billing:write"
  | "claim:submit"
  | "payment:receive"
  // Operations
  | "hr:read"
  | "hr:write"
  | "payroll:run"
  | "inventory:read"
  | "inventory:write"
  | "po:approve"
  // Governance
  | "tenant:switch"
  | "tenant:admin"
  | "audit:read"
  | "audit:export"
  | "ai:configure"
  | "ai:killswitch"
  | "ai:override"
  | "rbac:read"
  | "rbac:write"
  | "contract:sign"
  | "contract:anchor"
  | "board:vote"
  | "trustee:veto"
  // Public Health
  | "ph:surveillance"
  | "ph:outbreak-declare"
  // Break-glass
  | "breakglass:request"
  | "breakglass:approve";

export type RoleId =
  | "trustee"
  | "board"
  | "ceo"
  | "cmo"
  | "cno"
  | "cfo"
  | "cto"
  | "cro"
  | "general-counsel"
  | "doctor"
  | "nurse"
  | "pharmacy"
  | "pharmacy-chief"
  | "lab"
  | "radiology"
  | "admin"
  | "hr-director"
  | "finance"
  | "procurement"
  | "ai-safety-officer"
  | "auditor"
  | "patient"
  | "moh-official";

export interface RoleDefinition {
  id: RoleId;
  label: string;
  cadre:
    | "Constitutional"
    | "Governance"
    | "Executive"
    | "Clinical"
    | "Allied"
    | "Operations"
    | "External";
  permissions: Permission[];
  description: string;
}

/**
 * Canonical role → permission matrix. Aligned with the client catalog but is the
 * authoritative server copy that guards evaluate against.
 */
export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: "trustee",
    label: "Trustee · BEYU Family Trust",
    cadre: "Constitutional",
    description:
      "Supreme constitutional authority. Read-only on PHI by design; full veto on governance.",
    permissions: [
      "audit:read",
      "audit:export",
      "ai:killswitch",
      "trustee:veto",
      "contract:sign",
      "contract:anchor",
      "rbac:read",
      "breakglass:approve",
      "tenant:switch",
    ],
  },
  {
    id: "board",
    label: "Board Member · Holding Co.",
    cadre: "Governance",
    description:
      "Strategic governance. No PHI access. Board voting + approvals.",
    permissions: [
      "audit:read",
      "rbac:read",
      "contract:sign",
      "board:vote",
      "billing:read",
      "tenant:switch",
      "ai:configure",
    ],
  },
  {
    id: "ceo",
    label: "Chief Executive Officer",
    cadre: "Executive",
    description: "Operational authority. PHI access via break-glass only.",
    permissions: [
      "audit:read",
      "audit:export",
      "rbac:read",
      "rbac:write",
      "tenant:switch",
      "tenant:admin",
      "hr:read",
      "hr:write",
      "billing:read",
      "ai:configure",
      "ai:override",
      "breakglass:request",
      "breakglass:approve",
      "contract:sign",
    ],
  },
  {
    id: "cmo",
    label: "Chief Medical Officer",
    cadre: "Executive",
    description: "Clinical authority. Full PHI read; sign-off on clinical AI.",
    permissions: [
      "patient:read",
      "phi:read",
      "phi:write",
      "rx:write",
      "rx:controlled",
      "note:write",
      "note:sign",
      "order:lab",
      "order:imaging",
      "order:procedure",
      "discharge:approve",
      "ai:override",
      "ai:configure",
      "audit:read",
      "breakglass:approve",
    ],
  },
  {
    id: "doctor",
    label: "Doctor / Clinician",
    cadre: "Clinical",
    description: "Clinical practitioner. PHI scoped to active tenant.",
    permissions: [
      "patient:read",
      "patient:write",
      "phi:read",
      "phi:write",
      "rx:write",
      "order:lab",
      "order:imaging",
      "order:procedure",
      "note:write",
      "note:sign",
      "discharge:approve",
      "ai:override",
      "breakglass:request",
      "tenant:switch",
    ],
  },
  {
    id: "nurse",
    label: "Nurse / Ward Officer",
    cadre: "Clinical",
    description:
      "Bedside care + medication administration. PHI scoped to ward.",
    permissions: [
      "patient:read",
      "phi:read",
      "phi:write",
      "note:write",
      "rx:dispense",
      "breakglass:request",
    ],
  },
  {
    id: "pharmacy",
    label: "Pharmacist",
    cadre: "Allied",
    description: "Dispensing & counselling. Read Rx + write dispense events.",
    permissions: [
      "patient:read",
      "phi:read",
      "rx:dispense",
      "inventory:read",
      "inventory:write",
      "note:write",
    ],
  },
  {
    id: "pharmacy-chief",
    label: "Chief Pharmacist",
    cadre: "Allied",
    description: "Pharmacy operations + controlled-substance authority.",
    permissions: [
      "patient:read",
      "phi:read",
      "rx:dispense",
      "rx:controlled",
      "inventory:read",
      "inventory:write",
      "po:approve",
      "note:write",
      "audit:read",
    ],
  },
  {
    id: "lab",
    label: "Lab Technologist",
    cadre: "Allied",
    description: "Specimen processing + result release.",
    permissions: [
      "patient:read",
      "phi:read",
      "phi:write",
      "order:lab",
      "note:write",
      "inventory:read",
    ],
  },
  {
    id: "radiology",
    label: "Radiographer / Radiologist",
    cadre: "Allied",
    description: "Imaging acquisition + reporting.",
    permissions: [
      "patient:read",
      "phi:read",
      "phi:write",
      "order:imaging",
      "note:write",
      "note:sign",
    ],
  },
  {
    id: "admin",
    label: "Hospital Administrator",
    cadre: "Operations",
    description: "Tenant operations. No direct PHI access.",
    permissions: [
      "patient:register",
      "hr:read",
      "billing:read",
      "audit:read",
      "tenant:admin",
      "rbac:read",
      "inventory:read",
      "breakglass:request",
    ],
  },
  {
    id: "hr-director",
    label: "HR Director",
    cadre: "Operations",
    description: "Human resources authority.",
    permissions: [
      "hr:read",
      "hr:write",
      "payroll:run",
      "audit:read",
      "rbac:read",
      "contract:sign",
      "tenant:switch",
    ],
  },
  {
    id: "finance",
    label: "Accountant / Finance",
    cadre: "Operations",
    description: "Day-to-day finance operations.",
    permissions: [
      "billing:read",
      "billing:write",
      "claim:submit",
      "payment:receive",
      "inventory:read",
    ],
  },
  {
    id: "procurement",
    label: "Procurement Officer",
    cadre: "Operations",
    description: "Supplier management + purchase orders.",
    permissions: ["inventory:read", "inventory:write", "po:approve"],
  },
  {
    id: "ai-safety-officer",
    label: "AI Safety Officer",
    cadre: "Governance",
    description: "Monitors Hive Runtime + can throttle agents.",
    permissions: [
      "ai:configure",
      "ai:override",
      "ai:killswitch",
      "audit:read",
      "audit:export",
      "rbac:read",
    ],
  },
  {
    id: "auditor",
    label: "Internal / External Auditor",
    cadre: "Governance",
    description: "Read-only auditor with full audit + de-identified PHI scope.",
    permissions: [
      "audit:read",
      "audit:export",
      "rbac:read",
      "billing:read",
      "tenant:switch",
    ],
  },
  {
    id: "patient",
    label: "Patient (Citizen App)",
    cadre: "External",
    description: "Sees only own record + grants consents.",
    permissions: ["patient:read", "phi:read"],
  },
  {
    id: "moh-official",
    label: "MoH Government Official",
    cadre: "External",
    description: "Aggregate population health + de-identified data.",
    permissions: ["ph:surveillance", "ph:outbreak-declare", "audit:read"],
  },
];

/** Map from a role id to its permission set (empty for unknown roles = deny by default). */
const ROLE_PERMISSIONS: Record<string, Permission[]> = ROLE_DEFINITIONS.reduce(
  (acc, r) => {
    acc[r.id] = r.permissions;
    return acc;
  },
  {} as Record<string, Permission[]>,
);

export function permissionsForRole(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(role: string, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function roleDefinition(role: string): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find((r) => r.id === role);
}

/** Effective permission set for a user given their role(s) and any explicit grants. */
export function effectivePermissions(
  role: string,
  explicit: Permission[] = [],
): Set<Permission> {
  const set = new Set<Permission>(permissionsForRole(role));
  for (const p of explicit) set.add(p);
  return set;
}
