/**
 * BEYU OS — GOVERNED CONTRACTING DETERMINISTIC ENGINES.
 *
 * Pure, synchronous, dependency-free computation — the same pattern as
 * `src/lib/equity/model.ts`. Nothing in this file touches the database, the
 * network, a session, or a principal: it computes lifecycle legality, authority
 * determinations, obligation timing, counterparty screening posture, signing
 * posture, health aggregation and content commitments. The governed service
 * (`src/lib/contracts/service.ts`) is what binds these outputs to identity,
 * RBAC/ABAC, policy, tenant scope, RLS and the audit ledger.
 *
 * Constitutional properties of this module:
 *  - DENY is final: an unlisted transition is refused; a missing mandatory
 *    authority check blocks execution; an absent evidence reference is "not
 *    proven", never "assumed ok".
 *  - No legal conclusions: every jurisdiction-sensitive outcome is emitted as
 *    `REQUIRES_LEGAL_REVIEW` metadata (§74). Enforceability is a human act.
 *  - No money movement, no ownership mutation, no capability bypass: this
 *    module never references CAP_POSTING and cannot post a journal entry (§44).
 */

import {
  assertAmount,
  assertHash32,
  assertIsoDate,
  assertRef,
  addDaysIso,
  daysBetweenIso,
  sha256Hex,
  stableStringify,
  ContractModelError,
} from "./pure";
import { isObligationOverdue, OBLIGATION_ESCALATION_LEAD_DAYS } from "./obligations";
import {
  AUTHORITY_CHECK_KINDS,
  CONTRACT_LIFECYCLE_STATES,
  CONTRACT_TYPE_FAMILIES,
  LEGAL_REVIEW_CLOSED,
  type AuthorityCheckKind,
  type ContractLifecycleState,
  type ContractReviewGate,
  type ContractTypeCode,
  type ObligationSeverity,
  type ObligationState,
  type SlaMetricOutcome,
  type DisputeState,
} from "./vocabulary";


/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export {
  ContractModelError,
  assertIsoDate,
  assertAmount,
  assertRef,
  assertHash32,
  addDaysIso,
  daysBetweenIso,
  stableStringify,
  sha256Hex,
} from "./pure";
export type { ContractModelErrorCode } from "./pure";

/* ------------------------------------------------------------------ */
/* §15 — Lifecycle state machine                                       */
/* ------------------------------------------------------------------ */

/**
 * Forward lifecycle plus governed side paths. A transition is legal only if it
 * appears here; anything else is refused (`INVALID_TRANSITION`).
 *
 * Side-path semantics:
 *  - DISPUTE / SUSPEND are available in performing and pending-execution
 *    states, so a dispute can pause downstream governed execution (§39).
 *  - RESUME only returns from SUSPENDED; DISPUTED exits through
 *    DISPUTE_RESOLVED, which additionally requires a resolved dispute reference.
 *  - ARCHIVE is terminal-preserving: superseded/terminated/completed/expired
 *    records are never deleted, only archived (§22, §70 data preservation).
 */
const TRANSITIONS: Record<ContractLifecycleState, readonly ContractLifecycleState[]> = {
  REQUESTED: ["DRAFTING", "TERMINATED", "DISPUTED"],
  DRAFTING: ["INTERNAL_REVIEW", "TERMINATED", "DISPUTED"],
  INTERNAL_REVIEW: ["DRAFTING", "COUNTERPARTY_REVIEW", "LEGAL_REVIEW", "TERMINATED", "DISPUTED"],
  COUNTERPARTY_REVIEW: ["DRAFTING", "LEGAL_REVIEW", "TERMINATED", "DISPUTED"],
  LEGAL_REVIEW: ["DRAFTING", "RISK_REVIEW", "TERMINATED", "DISPUTED"],
  RISK_REVIEW: ["DRAFTING", "COMMERCIAL_APPROVAL", "TERMINATED", "DISPUTED"],
  COMMERCIAL_APPROVAL: ["DRAFTING", "AUTHORITY_VERIFICATION", "TERMINATED", "DISPUTED"],
  AUTHORITY_VERIFICATION: ["DRAFTING", "SIGNATURE_PENDING", "TERMINATED", "DISPUTED"],
  SIGNATURE_PENDING: ["EXECUTED", "DRAFTING", "TERMINATED", "DISPUTED", "SUSPENDED"],
  EXECUTED: ["ACTIVE", "TERMINATED", "DISPUTED"],
  ACTIVE: ["PERFORMANCE_MONITORING", "AMENDED", "RENEWED", "COMPLETED", "TERMINATED", "EXPIRED", "DISPUTED", "SUSPENDED"],
  PERFORMANCE_MONITORING: ["AMENDED", "RENEWED", "COMPLETED", "TERMINATED", "EXPIRED", "DISPUTED", "SUSPENDED", "ACTIVE"],
  AMENDED: ["PERFORMANCE_MONITORING", "COMPLETED", "TERMINATED", "EXPIRED", "DISPUTED", "SUSPENDED", "RENEWED"],
  RENEWED: ["PERFORMANCE_MONITORING", "COMPLETED", "TERMINATED", "EXPIRED", "DISPUTED", "SUSPENDED", "AMENDED"],
  COMPLETED: ["ARCHIVED"],
  TERMINATED: ["ARCHIVED"],
  EXPIRED: ["ARCHIVED"],
  DISPUTED: ["PERFORMANCE_MONITORING", "ACTIVE", "TERMINATED", "EXPIRED", "ARCHIVED"],
  SUSPENDED: ["PERFORMANCE_MONITORING", "ACTIVE", "TERMINATED", "EXPIRED", "DISPUTED"],
  ARCHIVED: [],
};

/** Actions that drive transitions (the API vocabulary; one action, one edge set). */
export const CONTRACT_ACTIONS = [
  "BEGIN_DRAFTING",
  "SUBMIT_INTERNAL_REVIEW",
  "RECORD_COUNTERPARTY_REVIEW",
  "RECORD_LEGAL_REVIEW",
  "RECORD_RISK_REVIEW",
  "GRANT_COMMERCIAL_APPROVAL",
  "VERIFY_AUTHORITY",
  "OPEN_SIGNATURES",
  "EXECUTE",
  "ACTIVATE",
  "BEGIN_MONITORING",
  "RECORD_AMENDMENT",
  "RECORD_RENEWAL",
  "COMPLETE",
  "TERMINATE",
  "EXPIRE",
  "OPEN_DISPUTE",
  "RESOLVE_DISPUTE",
  "SUSPEND",
  "RESUME",
  "ARCHIVE",
] as const;
export type ContractAction = (typeof CONTRACT_ACTIONS)[number];

/** Required review-gate closures per action (all must be closed by recorded human acts). */
const ACTION_REQUIRED_REVIEWS: Partial<Record<ContractAction, readonly ContractReviewGate[]>> = {
  GRANT_COMMERCIAL_APPROVAL: ["INTERNAL_REVIEW", "LEGAL_REVIEW", "RISK_REVIEW"],
  VERIFY_AUTHORITY: ["INTERNAL_REVIEW", "COUNTERPARTY_REVIEW", "LEGAL_REVIEW", "RISK_REVIEW", "COMMERCIAL_APPROVAL"],
  OPEN_SIGNATURES: [
    "INTERNAL_REVIEW",
    "COUNTERPARTY_REVIEW",
    "LEGAL_REVIEW",
    "RISK_REVIEW",
    "COMMERCIAL_APPROVAL",
    "AUTHORITY_VERIFICATION",
  ],
  EXECUTE: [
    "INTERNAL_REVIEW",
    "COUNTERPARTY_REVIEW",
    "LEGAL_REVIEW",
    "RISK_REVIEW",
    "COMMERCIAL_APPROVAL",
    "AUTHORITY_VERIFICATION",
  ],
  RECORD_AMENDMENT: ["LEGAL_REVIEW"],
  RECORD_RENEWAL: [],
  TERMINATE: [],
};

/** Actions that additionally require an explicit evidence reference (§15, §51). */
const ACTION_REQUIRED_EVIDENCE = new Set<ContractAction>([
  "RECORD_LEGAL_REVIEW",
  "RECORD_RISK_REVIEW",
  "GRANT_COMMERCIAL_APPROVAL",
  "VERIFY_AUTHORITY",
  "EXECUTE",
  "RECORD_AMENDMENT",
  "RECORD_RENEWAL",
  "COMPLETE",
  "TERMINATE",
  "EXPIRE",
  "RESOLVE_DISPUTE",
  "ARCHIVE",
]);

/** Actions that additionally require a governance resolution reference (§12, §17). */
const ACTION_REQUIRED_RESOLUTION = new Set<ContractAction>([
  "GRANT_COMMERCIAL_APPROVAL",
  "EXECUTE",
  "TERMINATE",
  "RECORD_AMENDMENT",
]);

/** Actions that are human-only: an AI actor may never perform them (§58, §59). */
const ACTION_HUMAN_ONLY = new Set<ContractAction>([
  "GRANT_COMMERCIAL_APPROVAL",
  "VERIFY_AUTHORITY",
  "EXECUTE",
  "ACTIVATE",
  "TERMINATE",
  "RECORD_AMENDMENT",
  "RECORD_RENEWAL",
  "RESOLVE_DISPUTE",
]);

const ACTION_TO_EDGE: Record<ContractAction, { from: readonly ContractLifecycleState[]; to: ContractLifecycleState }> = {
  BEGIN_DRAFTING: { from: ["REQUESTED"], to: "DRAFTING" },
  SUBMIT_INTERNAL_REVIEW: { from: ["DRAFTING"], to: "INTERNAL_REVIEW" },
  RECORD_COUNTERPARTY_REVIEW: { from: ["INTERNAL_REVIEW"], to: "COUNTERPARTY_REVIEW" },
  RECORD_LEGAL_REVIEW: { from: ["INTERNAL_REVIEW", "COUNTERPARTY_REVIEW"], to: "LEGAL_REVIEW" },
  RECORD_RISK_REVIEW: { from: ["LEGAL_REVIEW"], to: "RISK_REVIEW" },
  GRANT_COMMERCIAL_APPROVAL: { from: ["RISK_REVIEW"], to: "COMMERCIAL_APPROVAL" },
  VERIFY_AUTHORITY: { from: ["COMMERCIAL_APPROVAL"], to: "AUTHORITY_VERIFICATION" },
  OPEN_SIGNATURES: { from: ["AUTHORITY_VERIFICATION"], to: "SIGNATURE_PENDING" },
  EXECUTE: { from: ["SIGNATURE_PENDING"], to: "EXECUTED" },
  ACTIVATE: { from: ["EXECUTED"], to: "ACTIVE" },
  BEGIN_MONITORING: { from: ["ACTIVE"], to: "PERFORMANCE_MONITORING" },
  RECORD_AMENDMENT: { from: ["ACTIVE", "PERFORMANCE_MONITORING"], to: "AMENDED" },
  RECORD_RENEWAL: { from: ["ACTIVE", "PERFORMANCE_MONITORING", "AMENDED"], to: "RENEWED" },
  COMPLETE: { from: ["ACTIVE", "PERFORMANCE_MONITORING", "AMENDED", "RENEWED"], to: "COMPLETED" },
  TERMINATE: {
    from: [
      "REQUESTED",
      "DRAFTING",
      "INTERNAL_REVIEW",
      "COUNTERPARTY_REVIEW",
      "LEGAL_REVIEW",
      "RISK_REVIEW",
      "COMMERCIAL_APPROVAL",
      "AUTHORITY_VERIFICATION",
      "SIGNATURE_PENDING",
      "EXECUTED",
      "ACTIVE",
      "PERFORMANCE_MONITORING",
      "AMENDED",
      "RENEWED",
      "SUSPENDED",
      "DISPUTED",
    ],
    to: "TERMINATED",
  },
  EXPIRE: { from: ["EXECUTED", "ACTIVE", "PERFORMANCE_MONITORING", "AMENDED", "RENEWED", "SUSPENDED"], to: "EXPIRED" },
  OPEN_DISPUTE: {
    from: [
      "REQUESTED",
      "DRAFTING",
      "INTERNAL_REVIEW",
      "COUNTERPARTY_REVIEW",
      "LEGAL_REVIEW",
      "RISK_REVIEW",
      "COMMERCIAL_APPROVAL",
      "AUTHORITY_VERIFICATION",
      "SIGNATURE_PENDING",
      "EXECUTED",
      "ACTIVE",
      "PERFORMANCE_MONITORING",
      "AMENDED",
      "RENEWED",
      "SUSPENDED",
    ],
    to: "DISPUTED",
  },
  RESOLVE_DISPUTE: { from: ["DISPUTED"], to: "PERFORMANCE_MONITORING" },
  SUSPEND: {
    from: ["SIGNATURE_PENDING", "ACTIVE", "PERFORMANCE_MONITORING", "AMENDED", "RENEWED"],
    to: "SUSPENDED",
  },
  RESUME: { from: ["SUSPENDED"], to: "PERFORMANCE_MONITORING" },
  ARCHIVE: { from: ["COMPLETED", "TERMINATED", "EXPIRED", "REQUESTED", "DRAFTING", "DISPUTED"], to: "ARCHIVED" },
};

export type TransitionInput = {
  state: ContractLifecycleState;
  action: ContractAction;
  /** Gate closure flags recorded by prior governed acts (server-derived, never client-asserted). */
  closedReviews?: readonly ContractReviewGate[];
  /** Evidence reference for this act itself (required for many actions). */
  evidenceRef?: string | null;
  /** Governance resolution reference (required for approvals/execution/termination/amendment). */
  resolutionRef?: string | null;
  /** Dispute reference required when resolving a dispute. */
  disputeRef?: string | null;
  /** True when the acting principal is an AI/service actor (L4+ actions are human-only). */
  aiInitiated?: boolean;
  /** Optional notes; must be short, free text, never authority. */
  note?: string | null;
};

export type TransitionResult = {
  from: ContractLifecycleState;
  to: ContractLifecycleState;
  action: ContractAction;
  allowed: true;
  note: string | null;
};

/**
 * Evaluate one lifecycle action. DENY-final: throws on any unlisted edge,
 * missing gate, missing evidence, missing resolution or AI attempt at a
 * human-only act. Returns the transition to record.
 */
export function evaluateContractTransition(input: TransitionInput): TransitionResult {
  const { state, action } = input;
  if (!CONTRACT_LIFECYCLE_STATES.includes(state)) {
    throw new ContractModelError("UNKNOWN_STATE", `Unknown contract lifecycle state.`, { state });
  }
  if (!(CONTRACT_ACTIONS as readonly string[]).includes(action)) {
    throw new ContractModelError("INVALID_TRANSITION", `Unknown contract lifecycle action.`, { action });
  }
  const edge = ACTION_TO_EDGE[action];
  if (!edge.from.includes(state)) {
    throw new ContractModelError(
      "INVALID_TRANSITION",
      `Action ${action} is not available from state ${state}.`,
      { state, action, allowedFrom: edge.from },
    );
  }
  // The state table above is the specification; the edge must also be a legal
  // transition in it, which keeps the two views provably consistent (asserted
  // by tests, so the machine cannot drift from its declared rules).
  if (!TRANSITIONS[state].includes(edge.to)) {
    throw new ContractModelError(
      "INVALID_TRANSITION",
      `Action ${action} (${state} → ${edge.to}) is not permitted by the lifecycle specification.`,
      { state, action, to: edge.to },
    );
  }
  const closed = new Set<ContractReviewGate>(input.closedReviews ?? []);
  for (const gate of ACTION_REQUIRED_REVIEWS[action] ?? []) {
    if (!closed.has(gate)) {
      throw new ContractModelError(
        "REVIEW_NOT_CLOSED",
        `${gate} must be closed by a recorded review before ${action}.`,
        { gate, action },
      );
    }
  }
  if (ACTION_REQUIRED_EVIDENCE.has(action)) {
    try {
      assertRef(input.evidenceRef, "evidenceRef");
    } catch (err) {
      if (err instanceof ContractModelError) {
        throw new ContractModelError(
          "EVIDENCE_REQUIRED",
          `${action} requires an evidence reference; no evidence means not proven (§21/§51).`,
          { action },
        );
      }
      throw err;
    }
  }
  if (ACTION_REQUIRED_RESOLUTION.has(action)) {
    try {
      assertRef(input.resolutionRef, "resolutionRef");
    } catch (err) {
      if (err instanceof ContractModelError) {
        throw new ContractModelError(
          "REVIEW_NOT_CLOSED",
          `${action} requires a governance resolution reference.`,
          { action },
        );
      }
      throw err;
    }
  }
  if (action === "RESOLVE_DISPUTE") {
    assertRef(input.disputeRef, "disputeRef");
  }
  if (input.aiInitiated && ACTION_HUMAN_ONLY.has(action)) {
    throw new ContractModelError(
      "AUTHORITY_BLOCKED",
      `${action} is a human-only governance act; AI actors inherit authority, they never create it (§58/§59).`,
      { action, aiInitiated: true },
    );
  }
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 2000) : null;
  return { from: state, to: edge.to, action, allowed: true, note };
}

/** Read-only listing of legal actions from a state (visibility, never authorization). */
export function availableActions(state: ContractLifecycleState): ContractAction[] {
  return CONTRACT_ACTIONS.filter((a) => ACTION_TO_EDGE[a].from.includes(state));
}

/** Every (from,to) pair the specification permits — used by tests to prove consistency. */
export function transitionTable(): Array<{ from: ContractLifecycleState; to: ContractLifecycleState }> {
  const out: Array<{ from: ContractLifecycleState; to: ContractLifecycleState }> = [];
  for (const from of CONTRACT_LIFECYCLE_STATES) {
    for (const to of TRANSITIONS[from]) out.push({ from, to });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* §17 — Authority determination (fail-closed)                         */
/* ------------------------------------------------------------------ */

export type AuthorityThresholdPolicy = {
  /** Version marker for reproducibility of determinations. */
  version: string;
  /** Amount ≥ threshold ⇒ the corresponding approval becomes mandatory (integer major units). */
  commercialApprovalMinimum: number;
  riskReviewMinimum: number;
  boardApprovalMinimum: number;
  shareholderApprovalMinimum: number;
  reservedMatterMinimum: number;
  /** Delegations older than this many days are treated as unverified until re-confirmed. */
  delegationMaxAgeDays: number;
};

/**
 * Configurable DEFAULT CANDIDATE — a governance input, not law. Jurisdictions and
 * entities override it through their own policy documents; every determination
 * records which policy version produced it, and the enforceability of the
 * outcome remains REQUIRES_LEGAL_REVIEW.
 */
export const DEFAULT_AUTHORITY_THRESHOLDS: AuthorityThresholdPolicy = {
  version: "beyu-authority-thresholds/1.0.0",
  commercialApprovalMinimum: 50_000,
  riskReviewMinimum: 250_000,
  boardApprovalMinimum: 1_000_000,
  shareholderApprovalMinimum: 5_000_000,
  reservedMatterMinimum: 25_000_000,
  delegationMaxAgeDays: 365,
};

export type AuthorityFacts = {
  contractType: ContractTypeCode;
  /** Total committed value in integer major units (annualised value is added when supplied). */
  contractValue: number;
  annualValue?: number;
  /** Governing-law jurisdiction code (e.g. "TZ"); recorded, never interpreted. */
  jurisdictionCode: string;
  /** True when a BEYU trust entity is a party or the subject matter is trust-held. */
  trustPartyInvolved?: boolean;
  /** True when the counterparty is another BEYU entity in the group. */
  relatedParty?: boolean;
  /** True when the agreement grants or amends rights over group ownership. */
  affectsOwnership?: boolean;
  /** True when personal data is processed/translated across borders by the agreement. */
  involvesPersonalData?: boolean;
  /** Blockchain execution is used for deterministic performance (§23C, §31). */
  blockchainExecution?: boolean;
  /** Reference date used for freshness math (supplied by the service; pure engines take no clock). */
  asOfDate: string;
  /** Recorded facts (each resolved by the service from canonical rows, not client claims). */
  contractingEntityIdentified: boolean;
  counterpartyIdentified: boolean;
  signatoryRoleIds: readonly string[];
  requiredSignatoryRoleIds: readonly string[];
  delegation: { active: boolean; approvedOn?: string | null; scopeOk?: boolean } | null;
  legalReviewStatus: string;
  riskReviewClosed: boolean;
  commercialApproval: { approved: boolean };
  boardResolution: { approved: boolean };
  shareholderResolution: { approved: boolean };
  trusteeResolution: { approved: boolean };
  financeApproval: { approved: boolean };
  procurementApproval: { approved: boolean };
  regulatoryRestrictionsChecked: { checked: boolean; clean: boolean };
  conflictsChecked: { checked: boolean; clean: boolean };
  complianceRestrictionsChecked: { checked: boolean; clean: boolean };
  executionMethod?: "LEGAL_ONLY" | "LEGAL_PLUS_ONCHAIN" | "ONCHAIN_DETERMINISTIC";
};

export type AuthorityCheck = {
  kind: AuthorityCheckKind;
  required: boolean;
  result: "SATISFIED" | "MISSING" | "NOT_REQUIRED" | "BLOCKED_BY_RESTRICTION";
  basis: string;
};

export type AuthorityDetermination = {
  policyVersion: string;
  contractType: ContractTypeCode;
  jurisdictionCode: string;
  totalValue: number;
  requiredChecks: AuthorityCheckKind[];
  checks: AuthorityCheck[];
  missing: AuthorityCheckKind[];
  blocked: AuthorityCheckKind[];
  canExecute: boolean;
  /** Always present: this software records authority, it never confers enforceability. */
  enforceability: "REQUIRES_LEGAL_REVIEW";
};

function totalValueOf(facts: AuthorityFacts): number {
  const annual = facts.annualValue ?? 0;
  assertAmount(facts.contractValue, "contractValue");
  assertAmount(annual, "annualValue");
  return facts.contractValue + annual;
}

/** Which checks the contract's characteristics make mandatory. */
export function requiredAuthorityChecks(
  facts: AuthorityFacts,
  thresholds: AuthorityThresholdPolicy = DEFAULT_AUTHORITY_THRESHOLDS,
): AuthorityCheckKind[] {
  const total = totalValueOf(facts);
  const family = CONTRACT_TYPE_FAMILIES[facts.contractType];
  const required = new Set<AuthorityCheckKind>([
    "CONTRACTING_ENTITY_IDENTIFIED",
    "COUNTERPARTY_IDENTIFIED",
    "SIGNATORY_AUTHORITY",
    "LEGAL_REVIEW_CLOSED",
  ]);
  if (total >= thresholds.commercialApprovalMinimum) required.add("APPROVAL_THRESHOLD_MET");
  if (total >= thresholds.riskReviewMinimum) required.add("RISK_REVIEW_CLOSED");
  if (total >= thresholds.boardApprovalMinimum) required.add("BOARD_APPROVAL");
  if (total >= thresholds.shareholderApprovalMinimum) required.add("SHAREHOLDER_APPROVAL");
  if (facts.affectsOwnership) required.add("SHAREHOLDER_APPROVAL");
  if (facts.trustPartyInvolved) required.add("TRUSTEE_APPROVAL");
  if (facts.relatedParty) required.add("CONFLICTS_CHECKED");
  if (family === "PUBLIC_AND_PARTNERSHIP" || facts.contractType === "PROCUREMENT" || facts.contractType === "PURCHASE_ORDER") {
    required.add("PROCUREMENT_APPROVAL");
  }
  if (family === "CAPITAL" || family === "WORKFORCE" || family === "DATA" || facts.involvesPersonalData) {
    required.add("COMPLIANCE_RESTRICTIONS_CHECKED");
  }
  if (family === "WORKFORCE" || facts.involvesPersonalData || facts.contractType === "DATA_PROCESSING") {
    required.add("REGULATORY_RESTRICTIONS_CHECKED");
  }
  if (facts.contractType === "FINANCING") required.add("FINANCE_APPROVAL");
  if (facts.delegation !== null) required.add("DELEGATION_VALID");
  if (total >= thresholds.reservedMatterMinimum || family === "CAPITAL") required.add("RESERVED_MATTERS_CHECKED");
  if (facts.blockchainExecution === true) required.add("COMPLIANCE_RESTRICTIONS_CHECKED");
  // The closed vocabulary is the authority: never emit a kind outside it.
  return AUTHORITY_CHECK_KINDS.filter((k) => required.has(k));
}

/**
 * Determination: for every mandatory check, is it satisfied by recorded facts?
 * `canExecute` is true only when NOTHING is missing and NOTHING is blocked.
 */
export function evaluateAuthority(
  facts: AuthorityFacts,
  thresholds: AuthorityThresholdPolicy = DEFAULT_AUTHORITY_THRESHOLDS,
): AuthorityDetermination {
  const total = totalValueOf(facts);
  const required = requiredAuthorityChecks(facts, thresholds);
  const requiredSet = new Set(required);
  const checks: AuthorityCheck[] = [];

  const push = (
    kind: AuthorityCheckKind,
    satisfied: boolean,
    basis: string,
    opts?: { restrictionBlocked?: boolean },
  ) => {
    if (!requiredSet.has(kind)) {
      checks.push({ kind, required: false, result: "NOT_REQUIRED", basis: "Not mandatory for this agreement." });
      return;
    }
    if (opts?.restrictionBlocked) {
      checks.push({ kind, required: true, result: "BLOCKED_BY_RESTRICTION", basis });
      return;
    }
    checks.push({ kind, required: true, result: satisfied ? "SATISFIED" : "MISSING", basis });
  };

  push("CONTRACTING_ENTITY_IDENTIFIED", facts.contractingEntityIdentified, "Contracting entity resolved from canonical legal_entities.");
  push("COUNTERPARTY_IDENTIFIED", facts.counterpartyIdentified, "Counterparty resolved from canonical parties + governed profile.");
  const signatoryOk = facts.requiredSignatoryRoleIds.every((role) => facts.signatoryRoleIds.includes(role));
  push(
    "SIGNATORY_AUTHORITY",
    signatoryOk,
    `Signatory must hold ${facts.requiredSignatoryRoleIds.join(" | ")} in entity_appointments.`,
  );
  const delegationActive =
    facts.delegation !== null && facts.delegation.active === true && facts.delegation.scopeOk !== false;
  const delegationFresh =
    facts.delegation === null
      ? false
      : facts.delegation.approvedOn
        ? daysBetweenIso(
            assertIsoDate(facts.delegation.approvedOn, "delegation.approvedOn"),
            assertIsoDate(facts.asOfDate, "asOfDate"),
          ) <= thresholds.delegationMaxAgeDays
        : true;
  push(
    "DELEGATION_VALID",
    delegationActive && delegationFresh,
    `Delegation must be active, in scope and approved within ${thresholds.delegationMaxAgeDays} days.`,
  );
  push(
    "APPROVAL_THRESHOLD_MET",
    total < thresholds.commercialApprovalMinimum || facts.commercialApproval.approved,
    `Total committed value ${total} vs commercial-approval threshold ${thresholds.commercialApprovalMinimum}.`,
  );
  push("BOARD_APPROVAL", facts.boardResolution.approved, "APPROVED board resolution required above the governance threshold.");
  push("TRUSTEE_APPROVAL", facts.trusteeResolution.approved, "Trustee decision required where a trust is a party.");
  push("SHAREHOLDER_APPROVAL", facts.shareholderResolution.approved, "APPROVED shareholder resolution required for ownership-affecting terms.");
  push("FINANCE_APPROVAL", facts.financeApproval.approved, "Finance approval recorded (reference only; posting remains CAP_POSTING-gated in Finance OS).");
  push("PROCUREMENT_APPROVAL", facts.procurementApproval.approved, "Procurement approval recorded for procurement-class agreements.");
  push(
    "LEGAL_REVIEW_CLOSED",
    facts.legalReviewStatus === LEGAL_REVIEW_CLOSED,
    "Legal review closure must be a recorded human act; any other state is treated as open (§74).",
  );
  push("RISK_REVIEW_CLOSED", facts.riskReviewClosed, "Risk review closed for agreements above the risk threshold.");
  push(
    "REGULATORY_RESTRICTIONS_CHECKED",
    facts.regulatoryRestrictionsChecked.checked && facts.regulatoryRestrictionsChecked.clean,
    "Regulatory restriction screening must be completed and clean.",
    { restrictionBlocked: facts.regulatoryRestrictionsChecked.checked && !facts.regulatoryRestrictionsChecked.clean },
  );
  push(
    "CONFLICTS_CHECKED",
    facts.conflictsChecked.checked && facts.conflictsChecked.clean,
    "Conflict-of-interest screening must be completed and clean.",
    { restrictionBlocked: facts.conflictsChecked.checked && !facts.conflictsChecked.clean },
  );
  push(
    "COMPLIANCE_RESTRICTIONS_CHECKED",
    facts.complianceRestrictionsChecked.checked && facts.complianceRestrictionsChecked.clean,
    "Compliance restriction screening must be completed and clean.",
    { restrictionBlocked: facts.complianceRestrictionsChecked.checked && !facts.complianceRestrictionsChecked.clean },
  );
  push(
    "RESERVED_MATTERS_CHECKED",
    total < thresholds.reservedMatterMinimum || facts.boardResolution.approved,
    `Reserved-matter review required at or above ${thresholds.reservedMatterMinimum}.`,
  );

  const missing = checks.filter((c) => c.result === "MISSING").map((c) => c.kind);
  const blocked = checks.filter((c) => c.result === "BLOCKED_BY_RESTRICTION").map((c) => c.kind);
  return {
    policyVersion: thresholds.version,
    contractType: facts.contractType,
    jurisdictionCode: facts.jurisdictionCode,
    totalValue: total,
    requiredChecks: required,
    checks,
    missing,
    blocked,
    canExecute: missing.length === 0 && blocked.length === 0,
    enforceability: "REQUIRES_LEGAL_REVIEW",
  };
}

/* ------------------------------------------------------------------ */
/* §18 — Obligation engine (re-exported; lives in obligations.ts)     */
/* ------------------------------------------------------------------ */

export {
  OBLIGATION_ESCALATION_LEAD_DAYS,
  computeObligationTiming,
  evaluateObligationTransition,
  isObligationOverdue,
  isObligationEscalationDue,
  isTerminalObligation,
  obligationDependencyOpen,
  assertObligationIntake,
  assertObligationVerificationEvidence,
  type ObligationTiming,
  type ObligationIntake,
} from "./obligations";

/* ------------------------------------------------------------------ */
/* §16 — Counterparty posture (re-exported; lives in parties.ts)       */
/* ------------------------------------------------------------------ */

export { evaluatePartyPosture, type PartyFacts, type PartyPosture, type PartyKind } from "./parties";

/* ------------------------------------------------------------------ */
/* Contract health (obligations + reviews + SLAs)                      */
/* ------------------------------------------------------------------ */

export type ContractHealthInput = {
  state: ContractLifecycleState;
  asOfDate: string;
  obligations: ReadonlyArray<{ state: ObligationState; dueDate: string; severity: ObligationSeverity }>;
  slaOutcomes?: readonly SlaMetricOutcome[];
  openDisputes?: number;
  disputeStates?: readonly DisputeState[];
  anchorVerified?: boolean;
  anchorRequired?: boolean;
  disputePausesExecution?: boolean;
};

export type ContractHealth = {
  status: "ON_TRACK" | "AT_RISK" | "OVERDUE" | "SUSPENDED" | "DISPUTED" | "PAUSED_BY_DISPUTE";
  score: number;
  overdueObligations: number;
  dueInWindow: number;
  missedSlas: number;
  findings: string[];
};

/** Deterministic health roll-up. Advisory: never an authorization input (§67). */
export function computeContractHealth(input: ContractHealthInput): ContractHealth {
  const findings: string[] = [];
  let overdue = 0;
  let dueSoon = 0;
  let unverified = 0;
  for (const o of input.obligations) {
    if (isObligationOverdue({ state: o.state, dueDate: o.dueDate, asOfDate: input.asOfDate })) {
      overdue += 1;
    } else if (["PENDING", "IN_PROGRESS", "OVERDUE"].includes(o.state)) {
      const days = daysBetweenIso(input.asOfDate, o.dueDate);
      if (days >= 0 && days <= OBLIGATION_ESCALATION_LEAD_DAYS[o.severity]) dueSoon += 1;
    }
    if (o.state === "DELIVERED") unverified += 1;
  }
  const missedSlas = (input.slaOutcomes ?? []).filter((s) => s === "MISSED").length;
  const disputesOpen = (input.disputeStates ?? []).filter(
    (d) => d !== "SETTLED" && d !== "WITHDRAWN" && d !== "CLOSED",
  ).length;
  const pausedByDispute = input.disputePausesExecution === true && disputesOpen > 0;

  let score = 100;
  if (overdue > 0) {
    score -= Math.min(45, overdue * 12);
    findings.push(`${overdue} obligation(s) overdue.`);
  }
  if (dueSoon > 0) {
    score -= Math.min(20, dueSoon * 5);
    findings.push(`${dueSoon} obligation(s) inside the escalation window.`);
  }
  if (unverified > 0) {
    score -= Math.min(15, unverified * 5);
    findings.push(`${unverified} deliverable(s) awaiting verification.`);
  }
  if (missedSlas > 0) {
    score -= Math.min(25, missedSlas * 8);
    findings.push(`${missedSlas} SLA measurement(s) missed.`);
  }
  if (disputesOpen > 0) {
    score -= Math.min(30, disputesOpen * 10);
    findings.push(`${disputesOpen} open dispute(s).`);
  }
  if (input.anchorRequired === true && input.anchorVerified === false) {
    score -= 10;
    findings.push("Blockchain anchor recorded but not verified against a registry entry.");
  }
  if (pausedByDispute) findings.push("Downstream governed execution paused by an open dispute (§39).");

  let status: ContractHealth["status"] = "ON_TRACK";
  if (input.state === "SUSPENDED") status = "SUSPENDED";
  else if (pausedByDispute) status = "PAUSED_BY_DISPUTE";
  else if (input.state === "DISPUTED") status = "DISPUTED";
  else if (overdue > 0) status = "OVERDUE";
  else if (dueSoon > 0 || missedSlas > 0 || unverified > 0 || disputesOpen > 0) status = "AT_RISK";

  return {
    status,
    score: Math.max(0, Math.min(100, score)),
    overdueObligations: overdue,
    dueInWindow: dueSoon,
    missedSlas,
    findings,
  };
}

/* ------------------------------------------------------------------ */
/* §37 — Content commitments (document → hash → anchor)              */
/* ------------------------------------------------------------------ */

export const ANCHOR_COMMITMENT_DOMAIN = {
  name: "BEYU OS Governed Contract Anchor",
  version: "1",
} as const;

/**
 * Canonical anchor commitment: SHA-256 over a stable serialisation of the
 * content commitment envelope. This is the value stored as
 * `commitment_hash` and — where the organisation elects an on-chain record —
 * the payload attested by the on-chain anchor contract.
 *
 * The hash is a commitment over metadata + content digest ONLY: never the
 * document, never personal data, never confidential terms (§24, §50).
 */
export function computeAnchorCommitment(input: {
  tenantId: string;
  documentId: string;
  contentHash: string;
  algorithm: string;
  jurisdictionCode: string;
  contractId?: string | null;
  signedAt: string;
  anchorMethod: string;
}): string {
  const contentHash = assertHash32(input.contentHash, "contentHash");
  assertIsoDate(input.signedAt.slice(0, 10), "signedAt");
  const envelope = {
    domain: ANCHOR_COMMITMENT_DOMAIN,
    tenantId: assertRef(input.tenantId, "tenantId"),
    documentId: assertRef(input.documentId, "documentId"),
    contentHash,
    algorithm: assertRef(input.algorithm, "algorithm").toUpperCase(),
    jurisdictionCode: assertRef(input.jurisdictionCode, "jurisdictionCode").toUpperCase(),
    contractId: input.contractId ?? null,
    signedAt: input.signedAt,
    anchorMethod: assertRef(input.anchorMethod, "anchorMethod").toUpperCase(),
  };
  return sha256Hex(`BEYU:ANCHOR:v1|${stableStringify(envelope)}`);
}

/* ------------------------------------------------------------------ */
/* §19/§20 — HCM / procurement integration guards                       */
/* ------------------------------------------------------------------ */

/**
 * Employment-linked contract types. `hcm_employee_ref` is required for these;
 * HCM remains the employee master and is updated only through governed HCM
 * workflows — this module never writes to HCM (§19).
 */
export const EMPLOYMENT_LINKED_TYPES: readonly ContractTypeCode[] = [
  "EMPLOYMENT",
  "OFFER_LETTER",
  "CONTRACTOR",
  "CONSULTANCY",
  "NON_COMPETE",
];

/** Procurement-linked types require a procurement reference (§20). */
export const PROCUREMENT_LINKED_TYPES: readonly ContractTypeCode[] = [
  "SUPPLIER",
  "PROCUREMENT",
  "PURCHASE_ORDER",
  "FRAMEWORK",
  "WORK_ORDER",
  "OUTSOURCING",
];

/* ------------------------------------------------------------------ */
/* §22 — Legal document lifecycle rules                                */
/* ------------------------------------------------------------------ */

const LEGAL_DOC_EDGES: Record<string, readonly string[]> = {
  DRAFT: ["UNDER_REVIEW", "WITHDRAWN"],
  UNDER_REVIEW: ["DRAFT", "APPROVED", "WITHDRAWN", "LEGAL_HOLD"],
  APPROVED: ["EXECUTED", "UNDER_REVIEW", "WITHDRAWN", "LEGAL_HOLD"],
  EXECUTED: ["SUPERSEDED", "EXPIRED", "LEGAL_HOLD", "ARCHIVED"],
  SUPERSEDED: ["ARCHIVED", "LEGAL_HOLD"],
  EXPIRED: ["ARCHIVED", "LEGAL_HOLD"],
  WITHDRAWN: ["ARCHIVED"],
  LEGAL_HOLD: ["EXECUTED", "SUPERSEDED", "EXPIRED"],
  ARCHIVED: [],
};

export function evaluateLegalDocumentTransition(from: string, to: string): true {
  const edges = LEGAL_DOC_EDGES[from];
  if (!edges) throw new ContractModelError("UNKNOWN_STATE", `Unknown legal document state ${from}.`);
  if (!edges.includes(to)) {
    throw new ContractModelError("INVALID_TRANSITION", `Legal document cannot move ${from} → ${to}.`, { from, to });
  }
  return true;
}

/** A legal hold suspends disposal; it never suspends the record's accuracy. */
export function canDisposeDocument(doc: {
  state: string;
  legalHold: boolean;
  retentionExpiresOn?: string | null;
  asOfDate: string;
}): { allowed: boolean; reason: string } {
  if (doc.legalHold) return { allowed: false, reason: "LEGAL_HOLD_ACTIVE" };
  if (doc.state !== "SUPERSEDED" && doc.state !== "EXPIRED" && doc.state !== "ARCHIVED" && doc.state !== "WITHDRAWN") {
    return { allowed: false, reason: "STATE_NOT_DISPOSABLE" };
  }
  if (doc.retentionExpiresOn) {
    const remaining = daysBetweenIso(assertIsoDate(doc.asOfDate, "asOfDate"), assertIsoDate(doc.retentionExpiresOn, "retentionExpiresOn"));
    if (remaining > 0) return { allowed: false, reason: `RETENTION_PERIOD_ACTIVE:${remaining}d` };
  }
  return { allowed: true, reason: "RETENTION_EXPIRED_NO_HOLD" };
}
