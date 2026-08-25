/** BEYU OS platform constants — single definition, consumed everywhere. */

export const SYSTEM_VERSION = "BEYU-OS/1.0.0";
export const ENGINE_VERSION_WATERFALL = "waterfall-engine/1.2.0";
export const NOELIA_IDENTITY = "NOELIA";
export const HIVE_RUNTIME = "HIVE";
export const NOELIA_PROMPT_VERSION = "noelia-prompt/1.3.0";
export const SESSION_COOKIE = "beyu_os_session";
export const SESSION_TTL_HOURS = 12;

export const CLASSIFICATION_ORDER = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "HIGHLY_RESTRICTED",
] as const;

export type Classification = (typeof CLASSIFICATION_ORDER)[number];

export function classificationRank(c: string): number {
  const idx = CLASSIFICATION_ORDER.indexOf(c as Classification);
  return idx < 0 ? CLASSIFICATION_ORDER.length : idx;
}

/** Known catalogue only. Unknown strings must never be treated as a clearance. */
export function isKnownClassification(c: string): c is Classification {
  return (CLASSIFICATION_ORDER as readonly string[]).includes(c);
}

/**
 * Canonical permission catalogue (domain:object.action).
 * A capability that is not listed here does not exist constitutionally.
 */
export const PERMISSIONS = {
  // Control plane
  "platform:dashboard.read": "View the executive control centre",
  "platform:config.manage": "Manage configuration and feature flags",
  "platform:registry.read": "Read the OS / source-of-truth registry",
  "platform:registry.manage": "Register or retire an OS",
  // Identity
  "identity:user.read": "Read identity records",
  "identity:user.manage": "Create, suspend or revoke identities",
  "identity:role.grant": "Grant or revoke role assignments",
  "identity:emergency.activate": "Activate break-glass emergency access",
  // Organization & ownership
  "organization:entity.read": "Read corporate structure",
  "organization:entity.manage": "Create or amend legal entities",
  "organization:ownership.read": "Read ownership and beneficial ownership",
  "organization:ownership.manage": "Record ownership changes",
  // Governance
  "governance:body.read": "Read governance bodies",
  "governance:resolution.read": "Read resolutions",
  "governance:resolution.propose": "Propose a resolution",
  "governance:resolution.vote": "Cast a governance vote",
  "governance:resolution.approve": "Record a resolution outcome",
  "governance:policy.read": "Read policies",
  "governance:policy.manage": "Author or amend policy",
  // Risk / compliance / legal
  "risk:register.read": "Read the enterprise risk register",
  "risk:register.manage": "Create or update risks and controls",
  "compliance:obligation.read": "Read compliance obligations",
  "compliance:assessment.manage": "Record compliance assessments",
  "legal:matter.read": "Read legal matters",
  "legal:matter.manage": "Manage legal matters",
  // Finance
  "finance:ledger.read": "Read financial records",
  "finance:ledger.post": "Post journal entries",
  "finance:treasury.read": "Read treasury positions",
  "finance:capital.read": "Read capital requests",
  "finance:capital.manage": "Create or amend capital requests",
  "finance:waterfall.read": "Read waterfall configurations and runs",
  "finance:waterfall.simulate": "Simulate a waterfall distribution",
  "finance:waterfall.commit": "Commit a waterfall run (requires resolution)",
  "finance:tax.read": "Read tax strategy intelligence",
  "finance:tax.assess": "Assess tax strategy eligibility",
  // Workforce
  "hcm:employee.read": "Read workforce records",
  "hcm:employee.manage": "Manage workforce records",
  // Family office
  "family:member.read": "Read the family registry",
  "family:member.manage": "Manage family lineage records",
  "family:beneficiary.read": "Read beneficiary entitlements",
  "family:beneficiary.manage": "Manage beneficiary entitlements",
  "family:vault.read": "Read family vault index",
  // Documents / audit / AI
  "documents:registry.read": "Read the document & attachment registry",
  "documents:registry.manage": "Register or supersede documents",
  "audit:log.read": "Read the immutable audit ledger",
  "audit:event.read": "Read the enterprise event stream",
  "ai:noelia.query": "Query Noelia AI",
  "ai:decision.review": "Review and dispose AI decisions",
  // Memory
  "knowledge:source.write": "Create, update or decommission governed enterprise memory",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

export const HIGH_RISK_PERMISSIONS: PermissionCode[] = [
  "identity:emergency.activate",
  "identity:role.grant",
  "organization:ownership.manage",
  "finance:ledger.post",
  "finance:waterfall.commit",
  "family:beneficiary.manage",
  "governance:policy.manage",
];

/** Canonical role catalogue with constitutional scope. */
export const ROLES: Record<
  string,
  { name: string; description: string; scope: string; privileged: boolean; permissions: PermissionCode[] }
> = {
  PLATFORM_ADMIN: {
    name: "Platform Administrator",
    description: "System administration of the BEYU OS control plane. No financial or governance authority.",
    scope: "ENTERPRISE",
    privileged: true,
    permissions: [
      "platform:dashboard.read",
      "platform:config.manage",
      "platform:registry.read",
      "platform:registry.manage",
      "identity:user.read",
      "identity:user.manage",
      "identity:role.grant",
      "audit:log.read",
      "audit:event.read",
      "documents:registry.read",
      "organization:entity.read",
      "knowledge:source.write",
    ],
  },
  GROUP_CEO: {
    name: "Group Chief Executive",
    description: "Enterprise executive authority across all sectors, subject to board reserved matters.",
    scope: "ENTERPRISE",
    privileged: true,
    permissions: Object.keys(PERMISSIONS).filter(
      (p) => !["platform:config.manage", "identity:emergency.activate", "finance:ledger.post"].includes(p),
    ) as PermissionCode[],
  },
  GROUP_CFO: {
    name: "Group Chief Financial Officer",
    description: "Authoritative for financial consequences, treasury, capital and tax governance.",
    scope: "ENTERPRISE",
    privileged: true,
    permissions: [
      "platform:dashboard.read",
      "organization:entity.read",
      "organization:ownership.read",
      "governance:resolution.read",
      "governance:resolution.propose",
      "governance:resolution.vote",
      "governance:policy.read",
      "risk:register.read",
      "compliance:obligation.read",
      "finance:ledger.read",
      "finance:ledger.post",
      "finance:treasury.read",
      "finance:capital.read",
      "finance:capital.manage",
      "finance:waterfall.read",
      "finance:waterfall.simulate",
      "finance:waterfall.commit",
      "finance:tax.read",
      "finance:tax.assess",
      "documents:registry.read",
      "audit:log.read",
      "ai:noelia.query",
    ],
  },
  CHIEF_GOVERNANCE_OFFICER: {
    name: "Chief Governance Officer",
    description: "Custodian of the Constitution, policy hierarchy and governance execution.",
    scope: "ENTERPRISE",
    privileged: true,
    permissions: [
      "platform:dashboard.read",
      "platform:registry.read",
      "organization:entity.read",
      "organization:ownership.read",
      "governance:body.read",
      "governance:resolution.read",
      "governance:resolution.propose",
      "governance:resolution.vote",
      "governance:resolution.approve",
      "governance:policy.read",
      "governance:policy.manage",
      "risk:register.read",
      "compliance:obligation.read",
      "compliance:assessment.manage",
      "legal:matter.read",
      "documents:registry.read",
      "documents:registry.manage",
      "audit:log.read",
      "audit:event.read",
      "ai:noelia.query",
      "ai:decision.review",
      "knowledge:source.write",
    ],
  },
  CHIEF_RISK_COMPLIANCE: {
    name: "Chief Risk & Compliance Officer",
    description: "Enterprise risk register, controls, compliance assessment and regulatory obligations.",
    scope: "ENTERPRISE",
    privileged: false,
    permissions: [
      "platform:dashboard.read",
      "organization:entity.read",
      "governance:resolution.read",
      "governance:resolution.vote",
      "governance:policy.read",
      "risk:register.read",
      "risk:register.manage",
      "compliance:obligation.read",
      "compliance:assessment.manage",
      "legal:matter.read",
      "documents:registry.read",
      "audit:log.read",
      "ai:noelia.query",
    ],
  },
  FAMILY_OFFICE_PRINCIPAL: {
    name: "Family Office Principal",
    description: "Family governance, lineage verification, beneficiary oversight and vault custody.",
    scope: "ENTERPRISE",
    privileged: true,
    permissions: [
      "platform:dashboard.read",
      "organization:entity.read",
      "organization:ownership.read",
      "governance:body.read",
      "governance:resolution.read",
      "governance:resolution.propose",
      "governance:resolution.vote",
      "family:member.read",
      "family:member.manage",
      "family:beneficiary.read",
      "family:beneficiary.manage",
      "family:vault.read",
      "documents:registry.read",
      "ai:noelia.query",
    ],
  },
  HCM_DIRECTOR: {
    name: "Group HCM Director",
    description: "Single source of truth for the workforce lifecycle.",
    scope: "ENTERPRISE",
    privileged: false,
    permissions: [
      "platform:dashboard.read",
      "organization:entity.read",
      "hcm:employee.read",
      "hcm:employee.manage",
      "governance:policy.read",
      "documents:registry.read",
      "ai:noelia.query",
    ],
  },
  SECTOR_OPERATOR: {
    name: "Sector OS Operator",
    description: "Operational execution inside a single Sector OS under BEYU OS governance.",
    scope: "SECTOR",
    privileged: false,
    permissions: [
      "platform:dashboard.read",
      "organization:entity.read",
      "hcm:employee.read",
      "finance:capital.read",
      "risk:register.read",
      "compliance:obligation.read",
      "documents:registry.read",
      "ai:noelia.query",
    ],
  },
  AUDITOR: {
    name: "Internal Auditor",
    description: "Read-only assurance access across the control plane. Cannot mutate any record.",
    scope: "ENTERPRISE",
    privileged: false,
    permissions: [
      "platform:dashboard.read",
      "platform:registry.read",
      "organization:entity.read",
      "organization:ownership.read",
      "governance:body.read",
      "governance:resolution.read",
      "governance:policy.read",
      "risk:register.read",
      "compliance:obligation.read",
      "legal:matter.read",
      "finance:ledger.read",
      "finance:treasury.read",
      "finance:capital.read",
      "finance:waterfall.read",
      "finance:tax.read",
      "hcm:employee.read",
      "documents:registry.read",
      "audit:log.read",
      "audit:event.read",
    ],
  },
};

/** Classification ceiling per role — ABAC dimension enforced at read time. */
export const ROLE_CLEARANCE: Record<string, Classification> = {
  PLATFORM_ADMIN: "RESTRICTED",
  GROUP_CEO: "HIGHLY_RESTRICTED",
  GROUP_CFO: "RESTRICTED",
  CHIEF_GOVERNANCE_OFFICER: "HIGHLY_RESTRICTED",
  CHIEF_RISK_COMPLIANCE: "RESTRICTED",
  FAMILY_OFFICE_PRINCIPAL: "HIGHLY_RESTRICTED",
  HCM_DIRECTOR: "RESTRICTED",
  SECTOR_OPERATOR: "CONFIDENTIAL",
  AUDITOR: "RESTRICTED",
};
