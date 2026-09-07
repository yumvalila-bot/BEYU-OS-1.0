/** BEYU OS platform constants — single definition, consumed everywhere. */

export const SYSTEM_VERSION = "BEYU-OS/1.0.0";
export const ENGINE_VERSION_WATERFALL = "waterfall-engine/1.2.0";
export const NOELIA_IDENTITY = "NOELIA";
export const HIVE_RUNTIME = "HIVE";
/** Governed scheduler/worker service identity — distinct from the interactive Noelia identity. */
export const NOELIA_SCHEDULER_IDENTITY = "NOELIA_SCHEDULER";
export const NOELIA_PROMPT_VERSION = "noelia-prompt/2.0.0";
export const SESSION_COOKIE = "beyu_os_session";
export const SESSION_TTL_HOURS = 12;

/**
 * Canonical strategic horizons (Noelia executive intelligence metadata).
 *
 * Horizons are INTELLIGENCE METADATA, never automatic authority levels. A
 * longer horizon implies no additional authority; every recommendation remains
 * subject to the full BEYU governance boundary regardless of horizon.
 */
export const NOELIA_HORIZONS = [
  "HORIZON_1_IMMEDIATE",
  "HORIZON_2_NEAR_TERM",
  "HORIZON_3_MEDIUM_TERM",
  "HORIZON_4_LONG_TERM",
  "HORIZON_5_GENERATIONAL",
  "HORIZON_6_INSTITUTIONAL_CONTINUITY_100Y",
] as const;
export type NoeliaHorizon = (typeof NOELIA_HORIZONS)[number];

export const HORIZON_LABELS: Record<NoeliaHorizon, string> = {
  HORIZON_1_IMMEDIATE: "Immediate (0–90 days)",
  HORIZON_2_NEAR_TERM: "Near term (90 days–1 year)",
  HORIZON_3_MEDIUM_TERM: "Medium term (1–3 years)",
  HORIZON_4_LONG_TERM: "Long term (3–10 years)",
  HORIZON_5_GENERATIONAL: "Generational (10–30 years)",
  HORIZON_6_INSTITUTIONAL_CONTINUITY_100Y: "Institutional continuity (30–100 years)",
};

/**
 * Canonical analytic epistemics for every Noelia analytical result.
 *
 * Every finding, metric and recommendation must carry one of these statuses.
 * The mapping to the legacy ai_output_class enum is lossless: these statuses
 * are the fine-grained classes, and the outputClass remains the coarse
 * envelope for the ai_decisions table.
 */
export const NOELIA_EPISTEMIC_STATUS = [
  "OBSERVED",
  "DERIVED",
  "FORECAST",
  "SCENARIO",
  "INFERENCE",
  "RECOMMENDATION",
  "PREDICTION",
  "UNCERTAINTY",
  "UNAVAILABLE",
  "UNVERIFIED",
  "STALE",
  "REQUIRES_HUMAN_REVIEW",
] as const;
export type NoeliaEpistemicStatus = (typeof NOELIA_EPISTEMIC_STATUS)[number];

export const EPISTEMIC_STATUS_LABELS: Record<NoeliaEpistemicStatus, string> = {
  OBSERVED: "Directly measured from an authoritative source.",
  DERIVED: "Computed deterministically from OBSERVED inputs.",
  FORECAST: "A projection from observed history. Never a fact.",
  SCENARIO: "A hypothetical world. Never financial truth.",
  INFERENCE: "A reasoned conclusion from evidence; not directly measured.",
  RECOMMENDATION: "A proposed course of action; requires accountable decision.",
  PREDICTION: "A statement about an unobserved future state.",
  UNCERTAINTY: "Evidence is insufficient or conflicting.",
  UNAVAILABLE: "The data does not exist or is not in scope. Never zero.",
  UNVERIFIED: "Retrieved but not verified as authoritative.",
  STALE: "Outside its governed validity window.",
  REQUIRES_HUMAN_REVIEW: "A human with authority must decide.",
};

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
  // Payments & banking integration. Deliberately split read / ingest / review /
  // authorize / configure: a single "payments" permission would let one grant
  // carry both ingestion and payout authorisation, which is the separation of
  // duties this domain exists to enforce.
  "finance:payments.read": "Read payment transactions, settlements and exceptions",
  "finance:payments.ingest": "Ingest provider events and settlement batches (no ledger effect)",
  "finance:payments.review": "Confirm or reject a proposed payment match; resolve an exception",
  "finance:payments.authorize": "Authorize a payment transaction for accounting and accept residual risk",
  "finance:payments.configure": "Propose payment configuration; the database write itself requires the admin DSN",
  "finance:settlement.manage": "Manage settlement batches and clearing reconciliation",
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
  "ai:executive.read": "Request executive intelligence briefings",
  "ai:analytics.read": "Request governed enterprise analytics",
  "ai:workflow.run": "Run governed Noelia agentic workflows",
  "ai:workflow.approve": "Approve a Noelia workflow or prepared action",
  "ai:memory.read": "Read governed enterprise memory",
  "ai:memory.write": "Write governed enterprise memory",
  "ai:knowledge.ingest": "Register a governed knowledge source",
  "ai:schedule.manage": "Manage governed Noelia schedules",
  "ai:model.registry.read": "Read the governed model registry",
  "ai:model.registry.manage": "Register, approve, suspend or retire a governed model",
  "ai:model.router.read": "Read the governed model-router selection decision",
  "ai:provider.registry.read": "Read the governed AI provider registry",
  "ai:provider.registry.manage": "Register, assess, activate or suspend an AI provider",
  "ai:identity.read": "Read canonical AI identities",
  "ai:identity.manage": "Manage canonical AI identity state (suspend/retire)",
  "ai:evaluation.read": "Read governed AI model evaluation records",
  "ai:evaluation.manage": "Record or update governed AI model evaluation evidence",
  "ai:risk.register.read": "Read the BEYU AI risk register",
  "ai:risk.register.manage": "Maintain the BEYU AI risk register",
  "ai:incident.manage": "Manage AI incident containment/resolution records",
  "ai:killswitch.manage": "Activate or deactivate a Noelia kill switch",
  "ai:compliance.read": "Read AI requirements, applicability, controls, evidence and assurance records",
  "ai:compliance.write": "Create/update AI requirements, applicability, controls, evidence and assurance records",
  "ai:compliance.audit": "Run and manage AI internal audits, findings and corrective actions",
  "ai:compliance.certification": "Transition certification/readiness state using documented evidence",
  "ai:compliance.metrics": "Read AI compliance metrics, blocking controls and assurance dashboards",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

export const HIGH_RISK_PERMISSIONS: PermissionCode[] = [
  "identity:emergency.activate",
  "identity:role.grant",
  "organization:ownership.manage",
  "finance:ledger.post",
  "finance:payments.authorize",
  "finance:settlement.manage",
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
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
      "ai:schedule.manage",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:provider.registry.read",
      "ai:identity.read",
      "ai:evaluation.read",
      "ai:risk.register.read",
      "ai:compliance.read",
      "ai:compliance.write",
      "ai:compliance.audit",
      "ai:compliance.certification",
      "ai:compliance.metrics",
    ],
  },
  GROUP_CEO: {
    name: "Group Chief Executive",
    description: "Enterprise executive authority across all sectors, subject to board reserved matters.",
    scope: "ENTERPRISE",
    privileged: true,
    // Explicit enumeration (Finding A-06-1): previously computed via
    // Object.keys(PERMISSIONS).filter(exclusions), which silently granted the
    // CEO every permission added in the future. The effective set is unchanged;
    // new permissions now require an explicit decision to grant.
    permissions: [
      "platform:dashboard.read",
      "platform:registry.read",
      "platform:registry.manage",
      "identity:user.read",
      "identity:user.manage",
      "identity:role.grant",
      "organization:entity.read",
      "organization:entity.manage",
      "organization:ownership.read",
      "organization:ownership.manage",
      "governance:body.read",
      "governance:resolution.read",
      "governance:resolution.propose",
      "governance:resolution.vote",
      "governance:resolution.approve",
      "governance:policy.read",
      "governance:policy.manage",
      "risk:register.read",
      "risk:register.manage",
      "compliance:obligation.read",
      "compliance:assessment.manage",
      "legal:matter.read",
      "legal:matter.manage",
      "finance:ledger.read",
      "finance:treasury.read",
      "finance:capital.read",
      "finance:capital.manage",
      "finance:waterfall.read",
      "finance:waterfall.simulate",
      "finance:waterfall.commit",
      "finance:tax.read",
      "finance:tax.assess",
      "hcm:employee.read",
      "hcm:employee.manage",
      "family:member.read",
      "family:member.manage",
      "family:beneficiary.read",
      "family:beneficiary.manage",
      "family:vault.read",
      "documents:registry.read",
      "documents:registry.manage",
      "audit:log.read",
      "audit:event.read",
      "ai:noelia.query",
      "ai:decision.review",
      "ai:executive.read",
      "ai:analytics.read",
      "ai:workflow.run",
      "ai:workflow.approve",
      "ai:memory.read",
      "ai:memory.write",
      "ai:knowledge.ingest",
      "ai:schedule.manage",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:provider.registry.read",
      "ai:identity.read",
      "ai:evaluation.read",
      "ai:risk.register.read",
      "ai:compliance.read",
      "ai:compliance.write",
      "ai:compliance.audit",
      "ai:compliance.certification",
      "ai:compliance.metrics",
    ] as PermissionCode[],
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
      "finance:payments.read",
      "finance:payments.ingest",
      "finance:payments.review",
      "finance:payments.authorize",
      "finance:payments.configure",
      "finance:settlement.manage",
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
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
      "ai:memory.write",
      "ai:workflow.run",
      "ai:model.registry.read",
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
      "ai:executive.read",
      "ai:analytics.read",
      "ai:workflow.approve",
      "ai:memory.read",
      "ai:memory.write",
      "ai:knowledge.ingest",
      "ai:schedule.manage",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:provider.registry.read",
      "ai:identity.read",
      "ai:evaluation.read",
      "ai:risk.register.read",
      "ai:compliance.read",
      "ai:compliance.write",
      "ai:compliance.audit",
      "ai:compliance.certification",
      "ai:compliance.metrics",
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
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
      "ai:knowledge.ingest",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:provider.registry.read",
      "ai:identity.read",
      "ai:evaluation.read",
      "ai:risk.register.read",
      "ai:risk.register.manage",
      "ai:compliance.read",
      "ai:compliance.write",
      "ai:compliance.audit",
      "ai:compliance.certification",
      "ai:compliance.metrics",
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
      "ai:executive.read",
      "ai:memory.read",
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
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
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
      "ai:executive.read",
      "ai:analytics.read",
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
      "finance:payments.read",
      "hcm:employee.read",
      "documents:registry.read",
      "audit:log.read",
      "audit:event.read",
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
      "ai:workflow.approve",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:provider.registry.read",
      "ai:identity.read",
      "ai:evaluation.read",
      "ai:risk.register.read",
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
