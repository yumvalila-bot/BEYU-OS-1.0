/**
 * BEYU Foundation OS — lifecycle state machines (pure, deterministic).
 *
 * Every transition is explicit. Terminal states are terminal: reaching one
 * requires its own governed record, and no transition leads out of it.
 */
import {
  ASSET_STATUSES,
  FORMATION_STATUSES,
  FOUNDATION_STATUSES,
  GRANT_STATUSES,
  PROCUREMENT_STATUSES,
  SAFEGUARDING_STATUSES,
  type AssetStatus,
  type FormationStatus,
  type FoundationStatus,
  type GrantStatus,
  type ProcurementStatus,
  type SafeguardingStatus,
} from "./types";

export type TransitionRule = {
  from: string;
  to: string;
  /** Permission that must additionally hold (checked by the caller via can()). */
  permission?: string;
  /** Human governance required even when the caller holds the permission. */
  requiresApprovalRef?: boolean;
};

function buildIndex(rules: TransitionRule[]): Map<string, TransitionRule[]> {
  const idx = new Map<string, TransitionRule[]>();
  for (const r of rules) {
    const list = idx.get(r.from) ?? [];
    list.push(r);
    idx.set(r.from, list);
  }
  return idx;
}

export type TransitionVerdict =
  | { ok: true; rule: TransitionRule }
  | { ok: false; reason: string };

export function validateTransition(
  rules: TransitionRule[],
  from: string,
  to: string,
): TransitionVerdict {
  if (from === to) return { ok: false, reason: `Already in state ${from}; no transition required` };
  const rule = rules.find((r) => r.from === from && r.to === to);
  if (!rule) {
    const allowed = rules.filter((r) => r.from === from).map((r) => r.to);
    return {
      ok: false,
      reason:
        allowed.length === 0
          ? `${from} is terminal; no outbound transition exists`
          : `Illegal transition ${from} → ${to}; allowed: ${allowed.join(", ")}`,
    };
  }
  return { ok: true, rule };
}

export function allowedTransitions(rules: TransitionRule[], from: string): TransitionRule[] {
  return buildIndex(rules).get(from) ?? [];
}

/* ---------------- Foundation lifecycle ---------------- */

export const FOUNDATION_TRANSITIONS: TransitionRule[] = [
  { from: "PROPOSED", to: "FORMATION", permission: "foundation:registry.manage" },
  { from: "PROPOSED", to: "ARCHIVED", permission: "foundation:registry.manage" },
  { from: "FORMATION", to: "REGISTRATION_PENDING", permission: "foundation:registry.manage" },
  { from: "FORMATION", to: "ARCHIVED", permission: "foundation:registry.manage" },
  { from: "REGISTRATION_PENDING", to: "REGISTERED", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "REGISTRATION_PENDING", to: "FORMATION", permission: "foundation:registry.manage" },
  { from: "REGISTERED", to: "ACTIVE", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "ACTIVE", to: "RESTRICTED", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "ACTIVE", to: "SUSPENDED", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "ACTIVE", to: "DORMANT", permission: "foundation:registry.manage" },
  { from: "ACTIVE", to: "RESTRUCTURING", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "ACTIVE", to: "DISSOLVING", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "RESTRICTED", to: "ACTIVE", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "RESTRICTED", to: "SUSPENDED", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "SUSPENDED", to: "ACTIVE", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "SUSPENDED", to: "DISSOLVING", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "DORMANT", to: "ACTIVE", permission: "foundation:registry.manage" },
  { from: "DORMANT", to: "DISSOLVING", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "RESTRUCTURING", to: "ACTIVE", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "RESTRUCTURING", to: "DISSOLVING", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "DISSOLVING", to: "DISSOLVED", permission: "foundation:registry.manage", requiresApprovalRef: true },
  { from: "DISSOLVED", to: "ARCHIVED", permission: "foundation:registry.manage" },
];

export function validateFoundationTransition(from: FoundationStatus, to: FoundationStatus): TransitionVerdict {
  if (!FOUNDATION_STATUSES.includes(from)) return { ok: false, reason: `Unknown foundation status ${from}` };
  if (!FOUNDATION_STATUSES.includes(to)) return { ok: false, reason: `Unknown foundation status ${to}` };
  return validateTransition(FOUNDATION_TRANSITIONS, from, to);
}

/* ---------------- Grant lifecycle (strictly forward, with governed returns) ---------------- */

const GRANT_FORWARD: Array<[GrantStatus, GrantStatus]> = [
  ["OPPORTUNITY", "APPLICATION"],
  ["APPLICATION", "ELIGIBILITY"],
  ["ELIGIBILITY", "DUE_DILIGENCE"],
  ["DUE_DILIGENCE", "ASSESSMENT"],
  ["ASSESSMENT", "SCORING"],
  ["SCORING", "CONFLICT_CHECK"],
  ["CONFLICT_CHECK", "APPROVAL"],
  ["APPROVAL", "AGREEMENT"],
  ["AGREEMENT", "DISBURSEMENT"],
  ["DISBURSEMENT", "MILESTONES"],
  ["MILESTONES", "MONITORING"],
  ["MONITORING", "REPORTING"],
  ["REPORTING", "CLOSEOUT"],
];

export const GRANT_TRANSITIONS: TransitionRule[] = [
  ...GRANT_FORWARD.map(([from, to]): TransitionRule => ({
    from,
    to,
    permission: to === "APPROVAL" ? "foundation:grant.approve" : "foundation:grant.manage",
    requiresApprovalRef: to === "APPROVAL" || to === "AGREEMENT" || to === "CLOSEOUT",
  })),
  // Governed returns for rework (never backwards past APPLICATION silently).
  { from: "ELIGIBILITY", to: "APPLICATION", permission: "foundation:grant.manage" },
  { from: "DUE_DILIGENCE", to: "APPLICATION", permission: "foundation:grant.manage" },
  { from: "ASSESSMENT", to: "DUE_DILIGENCE", permission: "foundation:grant.manage" },
  { from: "SCORING", to: "ASSESSMENT", permission: "foundation:grant.manage" },
  { from: "CONFLICT_CHECK", to: "DUE_DILIGENCE", permission: "foundation:grant.manage" },
  { from: "APPROVAL", to: "CONFLICT_CHECK", permission: "foundation:grant.manage" },
];

export function validateGrantTransition(from: GrantStatus, to: GrantStatus): TransitionVerdict {
  if (!GRANT_STATUSES.includes(from)) return { ok: false, reason: `Unknown grant status ${from}` };
  if (!GRANT_STATUSES.includes(to)) return { ok: false, reason: `Unknown grant status ${to}` };
  return validateTransition(GRANT_TRANSITIONS, from, to);
}

/* ---------------- Procurement lifecycle (strictly forward) ---------------- */

const PROC_FORWARD: Array<[ProcurementStatus, ProcurementStatus]> = [
  ["NEED", "BUDGET"],
  ["BUDGET", "PROCUREMENT"],
  ["PROCUREMENT", "DUE_DILIGENCE"],
  ["DUE_DILIGENCE", "QUOTES"],
  ["QUOTES", "EVALUATION"],
  ["EVALUATION", "CONFLICT_CHECK"],
  ["CONFLICT_CHECK", "APPROVAL"],
  ["APPROVAL", "CONTRACT"],
  ["CONTRACT", "DELIVERY"],
  ["DELIVERY", "INVOICE"],
  ["INVOICE", "PAYMENT"],
  ["PAYMENT", "AUDIT"],
];

export const PROCUREMENT_TRANSITIONS: TransitionRule[] = PROC_FORWARD.map(
  ([from, to]): TransitionRule => ({
    from,
    to,
    permission: "foundation:procurement.manage",
    requiresApprovalRef: to === "APPROVAL" || to === "PAYMENT",
  }),
);

export function validateProcurementTransition(from: ProcurementStatus, to: ProcurementStatus): TransitionVerdict {
  if (!PROCUREMENT_STATUSES.includes(from)) return { ok: false, reason: `Unknown procurement status ${from}` };
  if (!PROCUREMENT_STATUSES.includes(to)) return { ok: false, reason: `Unknown procurement status ${to}` };
  return validateTransition(PROCUREMENT_TRANSITIONS, from, to);
}

/* ---------------- Asset lifecycle ---------------- */

export const ASSET_TRANSITIONS: TransitionRule[] = [
  { from: "ACQUIRE", to: "REGISTER", permission: "foundation:asset.manage" },
  { from: "REGISTER", to: "REGISTERED", permission: "foundation:asset.manage" },
  { from: "REGISTERED", to: "USE", permission: "foundation:asset.manage" },
  { from: "USE", to: "MAINTAIN", permission: "foundation:asset.manage" },
  { from: "MAINTAIN", to: "USE", permission: "foundation:asset.manage" },
  { from: "USE", to: "TRANSFER", permission: "foundation:asset.manage", requiresApprovalRef: true },
  { from: "MAINTAIN", to: "TRANSFER", permission: "foundation:asset.manage", requiresApprovalRef: true },
  { from: "TRANSFER", to: "USE", permission: "foundation:asset.manage" },
  { from: "USE", to: "DISPOSE", permission: "foundation:asset.manage", requiresApprovalRef: true },
  { from: "MAINTAIN", to: "DISPOSE", permission: "foundation:asset.manage", requiresApprovalRef: true },
  { from: "DISPOSE", to: "DISPOSED", permission: "foundation:asset.manage", requiresApprovalRef: true },
];

export function validateAssetTransition(from: AssetStatus, to: AssetStatus): TransitionVerdict {
  if (!ASSET_STATUSES.includes(from)) return { ok: false, reason: `Unknown asset status ${from}` };
  if (!ASSET_STATUSES.includes(to)) return { ok: false, reason: `Unknown asset status ${to}` };
  return validateTransition(ASSET_TRANSITIONS, from, to);
}

/* ---------------- Formation & safeguarding ---------------- */

const FORMATION_FORWARD: Array<[FormationStatus, FormationStatus]> = [
  ["INTAKE", "FEASIBILITY"],
  ["FEASIBILITY", "STRUCTURE_REVIEW"],
  ["STRUCTURE_REVIEW", "JURISDICTION_REVIEW"],
  ["JURISDICTION_REVIEW", "LEGAL_REVIEW"],
  ["LEGAL_REVIEW", "TAX_REVIEW"],
  ["TAX_REVIEW", "GOVERNANCE_REVIEW"],
  ["GOVERNANCE_REVIEW", "APPROVED"],
];

export const FORMATION_TRANSITIONS: TransitionRule[] = [
  ...FORMATION_FORWARD.map(([from, to]): TransitionRule => ({
    from,
    to,
    permission: "foundation:formation.manage",
    requiresApprovalRef: to === "APPROVED",
  })),
  { from: "INTAKE", to: "WITHDRAWN", permission: "foundation:formation.manage" },
  { from: "FEASIBILITY", to: "WITHDRAWN", permission: "foundation:formation.manage" },
  { from: "FEASIBILITY", to: "REJECTED", permission: "foundation:formation.manage", requiresApprovalRef: true },
  { from: "STRUCTURE_REVIEW", to: "REJECTED", permission: "foundation:formation.manage", requiresApprovalRef: true },
  { from: "JURISDICTION_REVIEW", to: "REJECTED", permission: "foundation:formation.manage", requiresApprovalRef: true },
  { from: "LEGAL_REVIEW", to: "REJECTED", permission: "foundation:formation.manage", requiresApprovalRef: true },
  { from: "TAX_REVIEW", to: "REJECTED", permission: "foundation:formation.manage", requiresApprovalRef: true },
  { from: "GOVERNANCE_REVIEW", to: "REJECTED", permission: "foundation:formation.manage", requiresApprovalRef: true },
];

export function validateFormationTransition(from: FormationStatus, to: FormationStatus): TransitionVerdict {
  if (!FORMATION_STATUSES.includes(from)) return { ok: false, reason: `Unknown formation status ${from}` };
  if (!FORMATION_STATUSES.includes(to)) return { ok: false, reason: `Unknown formation status ${to}` };
  return validateTransition(FORMATION_TRANSITIONS, from, to);
}

export const SAFEGUARDING_TRANSITIONS: TransitionRule[] = [
  { from: "REPORTED", to: "TRIAGED", permission: "foundation:safeguarding.manage" },
  { from: "TRIAGED", to: "INVESTIGATING", permission: "foundation:safeguarding.manage" },
  { from: "INVESTIGATING", to: "ACTIONED", permission: "foundation:safeguarding.manage", requiresApprovalRef: true },
  { from: "ACTIONED", to: "CLOSED", permission: "foundation:safeguarding.manage", requiresApprovalRef: true },
];

export function validateSafeguardingTransition(from: SafeguardingStatus, to: SafeguardingStatus): TransitionVerdict {
  if (!SAFEGUARDING_STATUSES.includes(from)) return { ok: false, reason: `Unknown safeguarding status ${from}` };
  if (!SAFEGUARDING_STATUSES.includes(to)) return { ok: false, reason: `Unknown safeguarding status ${to}` };
  return validateTransition(SAFEGUARDING_TRANSITIONS, from, to);
}
