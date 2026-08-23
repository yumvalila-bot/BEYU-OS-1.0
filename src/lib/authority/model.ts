/**
 * BEYU OS — Authority readiness model (Phase 7I).
 *
 * Types only. No policy content, no thresholds, no precedence rules, no ratification.
 *
 * WHAT ALREADY EXISTS (verified column by column against the live schema — this phase adds no
 * migration and no table, because the substrate already carries the authority primitives):
 *
 *   policies(id, tenant_id, code, title, level, parent_policy_id, constitution_article_id,
 *            domain, jurisdiction_code, entity_scope, role_scope, version, status,
 *            effective_from, effective_to, body, rules, owner_role,
 *            approved_by_resolution_id, classification, created_at)
 *   governance_decision_registry(decision_id, status, required_authority, approving_body,
 *            decision_maker, resolution_id, provenance, approval_date, effective_from,
 *            effective_to, scope, conditions, evidence, supersedes, audit_reference,
 *            dependencies, acceptance_criteria, implementation_status, activation_status)
 *   governance_capability_registry(capability_code, required_decisions, activation_status,
 *            execution_permission, implementation_status)
 *   resolutions(reference, status, category, decision_date, quorum_met, votes_for, ...)
 *
 * THE GENUINE GAP THIS PHASE CLOSES. `checkCapabilityActivation()` answers exactly one question —
 * "are the required decisions ACTIVATED?" — and takes no tenant, entity or principal. So the six
 * distinct questions §9 requires were collapsed into one. A ratified decision would have applied
 * everywhere, to everyone, with no scope check at the authority layer. That is the primitive built
 * here, ONCE, in the common platform.
 *
 * THE THREE SEPARATIONS §4 DEMANDS, made structurally impossible to collapse:
 *
 *   1. AUTHORITY EXISTS      — a record is present in the registry.
 *   2. AUTHORITY IS EFFECTIVE — it is ratified, in-window, not revoked or superseded.
 *   3. AUTHORITY PERMITS THIS — it covers this tenant, this entity, and this principal.
 *
 * These are three fields, never one boolean. A record can exist and be ineffective; be effective
 * and out of scope; be in scope and still not authorise the principal.
 */

/**
 * Deterministic reasons an authority evaluation can fail.
 *
 * `PERMITTED` is the ONLY value that allows execution, and it is deliberately last so that no
 * `>=` or truthiness comparison can accidentally admit a failure state.
 */
export const AUTHORITY_DECISION = [
  "CAPABILITY_UNKNOWN",
  "CAPABILITY_LOCKED",
  "AUTHORITY_MISSING",
  "AUTHORITY_NOT_EFFECTIVE",
  "AUTHORITY_EXPIRED",
  "AUTHORITY_REVOKED",
  "AUTHORITY_SUPERSEDED",
  "AUTHORITY_SCOPE_MISMATCH",
  "TENANT_SCOPE_MISMATCH",
  "ENTITY_SCOPE_MISMATCH",
  "PRINCIPAL_NOT_AUTHORIZED",
  "POLICY_CONFLICT",
  "AUTHORITY_CHAIN_INCOMPLETE",
  "PERMITTED",
] as const;
export type AuthorityDecisionCode = (typeof AUTHORITY_DECISION)[number];

/** The lifecycle states an authority record can occupy. Mirrors existing vocabulary only. */
export const AUTHORITY_STATUS = [
  "DRAFT",
  "SUBMITTED",
  "REVIEW",
  // PENDING is the status `governance_decision_registry` actually uses for every one of its 16
  // rows. It is named here because a status the system genuinely stores must be modelled
  // explicitly rather than collapsing into UNKNOWN, where a real state and a forged one would be
  // indistinguishable.
  "PENDING",
  "TABLED",
  "APPROVED",
  "RATIFIED",
  "EFFECTIVE",
  "SUPERSEDED",
  "REVOKED",
  "EXPIRED",
  "UNKNOWN",
] as const;
export type AuthorityStatus = (typeof AUTHORITY_STATUS)[number];

/**
 * Classification of an intake record. REFERENCE_DATA is explicitly NOT authority — the
 * distinction exists because conflating them is the single easiest way to manufacture
 * ratification that nobody granted.
 */
export const AUTHORITY_CLASS = [
  "GOVERNED_AUTHORITY",
  "REFERENCE_DATA",
  "TEMPLATE",
  "SYNTHETIC_FIXTURE",
  "UNVERIFIED",
] as const;
export type AuthorityClass = (typeof AUTHORITY_CLASS)[number];

/**
 * The canonical authority object (§4).
 *
 * Assembled by reading existing registries; never persisted as a second truth source.
 */
export type AuthorityRecord = {
  authorityId: string;
  authorityType: "DECISION" | "RESOLUTION" | "POLICY";
  source: string;
  issuer: string | null;
  approver: string | null;
  approvalDate: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: AuthorityStatus;
  authorityClass: AuthorityClass;
  jurisdiction: string | null;
  tenantId: string | null;
  /** Null means "not scoped to a specific entity", which is NOT the same as "all entities". */
  entityScope: string | null;
  scope: Record<string, unknown> | null;
  policyVersion: string | null;
  evidence: string | null;
  provenance: string | null;
  checksum: string;
  supersedes: string | null;
  revokes: string | null;
  rationale: string | null;
};

/**
 * The three-part evaluation §4 requires. Never collapsed into one boolean.
 */
export type AuthorityEvaluation = {
  authorityId: string;
  /** 1. Does a record exist at all? */
  exists: boolean;
  /** 2. Is it currently in force — ratified, in-window, not revoked or superseded? */
  effective: boolean;
  /** 3. Does it permit THIS operation for THIS tenant, entity and principal? */
  permits: boolean;
  decision: AuthorityDecisionCode;
  reason: string;
  /** Every individual condition, for audit and for the simulator. */
  conditions: AuthorityConditions;
  evaluatedAt: string;
};

export type AuthorityConditions = {
  recordFound: boolean;
  statusRatified: boolean;
  approvalRecorded: boolean;
  effectiveDateReached: boolean;
  notExpired: boolean;
  notRevoked: boolean;
  notSuperseded: boolean;
  tenantInScope: boolean;
  entityInScope: boolean;
  principalAuthorized: boolean;
  noPolicyConflict: boolean;
  chainComplete: boolean;
};

/** A policy version identity (§6), reproducible from canonical content. */
export type PolicyVersionIdentity = {
  policyId: string;
  code: string;
  version: string;
  /** Checksum over canonical content + scope + dates + authority. */
  checksum: string;
  contentChecksum: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  jurisdiction: string | null;
  tenantId: string | null;
  entityScope: string | null;
  approvedByResolutionId: string | null;
  /** True only when an approving resolution is recorded AND that resolution is APPROVED. */
  provenanceComplete: boolean;
  provenanceGap: string | null;
};

/** A detected policy conflict (§8). Carries no winner — precedence is unratified. */
export type PolicyConflict = {
  code: PolicyConflictCode;
  policyIds: string[];
  policyCodes: string[];
  detail: string;
  /** Always true: detection never authorises resolution. */
  requiresAuthority: true;
};

export const POLICY_CONFLICT_CODE = [
  "EFFECTIVE_DATE_OVERLAP",
  "DUPLICATE_CODE_VERSION",
  "SAME_CODE_DIFFERENT_CONTENT",
  "JURISDICTION_CONFLICT",
  "TENANT_CONFLICT",
  "ENTITY_SCOPE_CONFLICT",
  "SUPERSESSION_INCONSISTENCY",
  "MISSING_PROVENANCE",
  "CONTRADICTORY_RULE",
] as const;
export type PolicyConflictCode = (typeof POLICY_CONFLICT_CODE)[number];

/** One node in the dependency chain (§11). */
export type ChainLink = {
  layer: "AUTHORITY" | "POLICY" | "DECISION" | "CAPABILITY" | "PERMISSION" | "SERVICE" | "EXECUTION";
  id: string;
  present: boolean;
  status: string | null;
  detail: string;
};

/**
 * A full forward or reverse trace (§11). `complete` is false whenever any link is absent, and
 * the corresponding decision is AUTHORITY_CHAIN_INCOMPLETE — execution fails closed.
 */
export type AuthorityChain = {
  direction: "FORWARD" | "REVERSE";
  origin: string;
  links: ChainLink[];
  complete: boolean;
  brokenAt: string[];
  explanation: string[];
};

/** Readiness of a single P/C decision (§10). */
export type DecisionReadiness = {
  decisionId: string;
  title: string;
  status: string;
  activationStatus: string;
  requiredAuthority: string | null;
  approvingBody: string | null;
  dependencies: string[];
  unmetDependencies: string[];
  affectedCapabilities: string[];
  blockedExecutionPaths: string[];
  blockers: string[];
  /** READY only when every condition is satisfied. Nothing here changes any decision. */
  readiness: "READY" | "PARTIAL" | "BLOCKED";
  reason: string;
};

/**
 * Result of asking "what WOULD become eligible if this were ratified?" (§17).
 *
 * `classification` is fixed to SIMULATION so the output can never be read as an activation, and
 * `mutatedState` is structurally always false.
 */
export type AuthoritySimulation = {
  classification: "SIMULATION";
  hypotheticalRatifiedDecisions: string[];
  wouldBecomeEligible: string[];
  wouldRemainBlocked: Array<{ capabilityCode: string; stillBlockedBy: string[] }>;
  /** Always false. Simulation writes nothing, activates nothing and grants nothing. */
  mutatedState: false;
  explanation: string[];
};

/** Explainability payload (§12). Contains no policy body and no sensitive evidence content. */
export type AuthorityExplanation = {
  who: string;
  what: string;
  when: string;
  why: string;
  underWhichAuthority: string | null;
  underWhichPolicy: string | null;
  policyVersion: string | null;
  whichDecision: string[];
  whichCapability: string | null;
  whichPermission: string | null;
  whichTenant: string;
  whichEntity: string | null;
  effectivePeriod: string | null;
  /** Evidence REFERENCE only — never the evidence content itself. */
  evidenceReference: string | null;
  traceId: string;
  decision: AuthorityDecisionCode;
};
