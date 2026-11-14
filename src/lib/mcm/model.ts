/**
 * BEYU OS — MULTI_COMPANY_MANAGEMENT: canonical model, policy and error types.
 *
 * ONE capability. No new authorization primitive is introduced here: every
 * function re-runs the SAME `can()` used by the rest of BEYU OS, and every query
 * runs inside the SAME transaction-local RLS context established by
 * `withTenantDatabaseContext`.
 *
 * THE THREE SEPARATIONS THIS MODULE EXISTS TO PRESERVE
 *
 *   1. TENANT ≠ LEGAL ENTITY. A tenant is an isolation boundary; a legal entity
 *      is a registered legal person. One tenant may hold several entities and one
 *      entity's records may sit in a country tenant. Nothing here collapses them.
 *
 *   2. OWNERSHIP ≠ RELATIONSHIP. `ownership_records` is the ONLY place ownership
 *      exists. `entity_relationships` carries parentage, management, governance,
 *      branch, shared-services, agency and franchise relationships and cannot
 *      record ownership at all (enforced by a database CHECK constraint).
 *
 *   3. OVERSIGHT ≠ AUTHORITY. MCM provides group-level *visibility* and governed
 *      *workflow*. It never posts to Finance OS, never appoints a director, never
 *      decides a resolution, never changes an ownership record and never widens a
 *      sector's operational authority. A parent-company user does not thereby see
 *      a subsidiary's confidential records; that requires an explicit grant that
 *      matches the target tenant AND entity AND country on ONE authority tuple.
 */
import type { Classification, PermissionCode } from "@/lib/constants";
import { can, type Principal } from "@/lib/authz";

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/**
 * A governed refusal. Carries an HTTP status and a machine-readable code so the
 * API boundary can map it without ever leaking internals. Every mutation in this
 * capability throws this type rather than a generic Error, because a refusal is
 * a decision that must be explainable to the actor and recordable in the audit
 * ledger.
 */
export class McmError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 422 | 428 = 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "McmError";
  }
}

/* ------------------------------------------------------------------ */
/* Data state — every figure names its own epistemic status            */
/* ------------------------------------------------------------------ */

export type McmDataState =
  | "ACTUAL"
  | "CONSOLIDATED"
  | "ESTIMATED"
  | "FORECAST"
  | "PENDING"
  | "RESTRICTED"
  | "UNAVAILABLE";

/**
 * Canonical labels. Rendered beside every figure so a reader can never mistake a
 * model for booked truth, and `UNAVAILABLE` is never rendered as `0`.
 */
export const MCM_DATA_STATE_LABEL: Record<McmDataState, string> = {
  ACTUAL: "Actual",
  CONSOLIDATED: "Consolidated",
  ESTIMATED: "Estimated",
  FORECAST: "Forecast",
  PENDING: "Pending",
  RESTRICTED: "Restricted",
  UNAVAILABLE: "Unavailable",
};

export const MCM_DATA_STATE_MEANING: Record<McmDataState, string> = {
  ACTUAL: "Observed in the authoritative system of record for the stated period.",
  CONSOLIDATED:
    "Derived by a consolidation run from actual per-entity balances; reviewed by a human; never a posting.",
  ESTIMATED: "A human-entered approximation. Not booked truth.",
  FORECAST: "A projection from observed history. Never a fact.",
  PENDING: "A workflow state that has not yet produced a figure.",
  RESTRICTED:
    "A figure exists but the principal's classification clearance does not reach it.",
  UNAVAILABLE: "The data does not exist or is not reachable. Never zero.",
};

/**
 * A single reported figure with its full provenance.
 *
 * The mission requires every financial figure to identify its CURRENCY, PERIOD,
 * SOURCE and CONSOLIDATION STATUS. This type makes that structurally impossible
 * to omit: a caller cannot render an amount without also holding those four
 * facts, and `UNAVAILABLE` carries a reason instead of a number.
 */
export type McmFigure = {
  amountMinor: string | null;
  currency: string | null;
  period: string | null;
  source: string;
  dataState: McmDataState;
  /** Populated only when dataState is UNAVAILABLE or RESTRICTED. */
  reason?: string;
};

export function figure(input: {
  amountMinor: string | number | null | undefined;
  currency: string | null;
  period: string | null;
  source: string;
  dataState: McmDataState;
  reason?: string;
}): McmFigure {
  if (input.amountMinor === null || input.amountMinor === undefined) {
    return {
      amountMinor: null,
      currency: input.currency,
      period: input.period,
      source: input.source,
      dataState: input.dataState === "ACTUAL" || input.dataState === "CONSOLIDATED" ? "UNAVAILABLE" : input.dataState,
      reason: input.reason ?? "No figure was returned by the source for this period.",
    };
  }
  return {
    amountMinor: String(input.amountMinor),
    currency: input.currency,
    period: input.period,
    source: input.source,
    dataState: input.dataState,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

/** A figure that is explicitly unavailable. Never renders as zero. */
export function unavailable(source: string, reason: string, extra?: Partial<McmFigure>): McmFigure {
  return {
    amountMinor: null,
    currency: null,
    period: null,
    source,
    dataState: "UNAVAILABLE",
    reason,
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* Permission + scope enforcement                                      */
/* ------------------------------------------------------------------ */

export type McmTarget = {
  tenantId?: string | null;
  entityId?: string | null;
  countryCode?: string | null;
};

/**
 * Enforce one capability against one target.
 *
 * The SAME `can()` primitive as everywhere else. `classification` is passed
 * explicitly because MCM rows are classified and an MCM read must be refused when
 * the principal's clearance does not reach the row — enforcement at the SQL layer
 * is not sufficient, since the classification is a row property discovered after
 * the read.
 *
 * `highRisk` permissions additionally require a satisfied MFA step-up; `can()`
 * reports that as `requiresMfa`, which is surfaced as a 428 so the client can
 * prompt rather than silently failing.
 */
export function requireMcmCapability(
  principal: Principal,
  permission: PermissionCode,
  target: McmTarget = {},
  classification?: Classification,
): void {
  const decision = can(principal, permission, {
    ...(target.tenantId !== undefined ? { tenantId: target.tenantId } : {}),
    ...(target.entityId !== undefined ? { entityId: target.entityId } : {}),
    ...(target.countryCode !== undefined ? { countryCode: target.countryCode } : {}),
    ...(classification ? { classification } : {}),
  });
  if (decision.allowed) return;
  if (decision.requiresMfa) {
    throw new McmError(
      "MFA_REQUIRED",
      "This MCM act is high-risk and requires a satisfied MFA step-up for this session.",
      428,
      { permission },
    );
  }
  throw new McmError("FORBIDDEN", decision.reason, 403, { permission });
}

/**
 * The set of legal-entity ids this principal may actually see.
 *
 * Deliberately returns ids rather than a boolean: every MCM aggregate filters its
 * SQL by this finite set, so a later refactor cannot "forget" the entity boundary
 * and silently widen a query. An entity is visible when it is inside the
 * principal's resolved tenant scope AND its classification is within the
 * principal's clearance AND (when the principal is entity-scoped) it appears in
 * that scope.
 *
 * This is the SAME rule the Executive Control Centre and /os/organization already
 * apply — it is reused, not re-invented.
 */
export function entityVisible(
  principal: Principal,
  entity: { id: string; tenantId: string; classification: string },
  tenantScope: readonly string[],
  allowedClassifications: readonly string[],
): boolean {
  if (!tenantScope.includes(entity.tenantId)) return false;
  if (!allowedClassifications.includes(entity.classification)) return false;
  if (principal.entityScope.length > 0 && !principal.entityScope.includes(entity.id)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Lifecycle rules                                                     */
/* ------------------------------------------------------------------ */

export type McmLifecycleState =
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "ACTIVE"
  | "SUSPENDED"
  | "DORMANT"
  | "DISSOLVED"
  | "ARCHIVED";

/**
 * All lifecycle states, in their canonical order.
 *
 * Exported as a runtime array (not only a type) so the state machine can be
 * enumerated exhaustively by validation code and by tests, rather than by a
 * hand-copied list that can silently fall out of date.
 */
export const MCM_LIFECYCLE_STATES = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "ACTIVE",
  "SUSPENDED",
  "DORMANT",
  "DISSOLVED",
  "ARCHIVED",
] as const satisfies readonly McmLifecycleState[];

/**
 * Permitted lifecycle transitions.
 *
 * A closed state machine, not a free-text field. The two irreversible end states
 * (DISSOLVED, ARCHIVED) have no outgoing edges: returning a dissolved company to
 * ACTIVE would be a NEW legal person, which is a new registration, not a
 * transition. This mirrors the resolution lifecycle's rule that terminal states
 * are terminal.
 */
export const MCM_LIFECYCLE_TRANSITIONS: Record<McmLifecycleState, readonly McmLifecycleState[]> = {
  DRAFT: ["PENDING_VERIFICATION", "ARCHIVED"],
  PENDING_VERIFICATION: ["ACTIVE", "DRAFT", "ARCHIVED"],
  ACTIVE: ["SUSPENDED", "DORMANT", "DISSOLVED"],
  SUSPENDED: ["ACTIVE", "DORMANT", "DISSOLVED"],
  DORMANT: ["ACTIVE", "SUSPENDED", "DISSOLVED"],
  DISSOLVED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function assertLifecycleTransition(from: McmLifecycleState, to: McmLifecycleState): void {
  if (from === to) {
    throw new McmError("LIFECYCLE_NO_CHANGE", `The entity is already ${to}.`, 409);
  }
  if (!MCM_LIFECYCLE_TRANSITIONS[from].includes(to)) {
    throw new McmError(
      "LIFECYCLE_TRANSITION_INVALID",
      `${from} cannot transition to ${to}. Permitted: ${MCM_LIFECYCLE_TRANSITIONS[from].join(", ") || "none — this state is terminal"}.`,
      409,
      { from, to, permitted: MCM_LIFECYCLE_TRANSITIONS[from] },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Ownership validation rules                                          */
/* ------------------------------------------------------------------ */

export type OwnershipInstrument = {
  ownershipType: "DIRECT" | "INDIRECT" | "BENEFICIAL" | "CONTROL_ONLY";
  instrument: string;
  economicPct: string;
  votingPct: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  provenance: string;
  supportingDocumentId: string | null;
  ownerEntityId: string | null;
  ownerPartyId: string | null;
  /** Sum of economicPct on OTHER live rows for the same owned entity at this date. */
  siblingEconomicTotalPct: number;
  /** Sum of votingPct on OTHER live rows for the same owned entity at this date. */
  siblingVotingTotalPct: number;
  /** True when the owner is the owned entity itself or a descendant of it. */
  createsCycle: boolean;
};

export type OwnershipRuleResult = {
  rule: string;
  passed: boolean;
  detail: string;
};

export type OwnershipVerdict = {
  state:
    | "VALID"
    | "OVER_ALLOCATED"
    | "INSTRUMENT_MISSING"
    | "PROVENANCE_MISSING"
    | "CIRCULAR"
    | "RETURNS_HUMAN_REVIEW";
  rules: OwnershipRuleResult[];
  economicTotalPct: number;
  votingTotalPct: number;
};

/**
 * Validate one ownership record against its legal instrument and the applicable
 * rules, WITHOUT writing anything.
 *
 * The rules are deliberately conservative and total-preserving:
 *
 *   R1 PERCENTAGE_RANGE      economic and voting are 0..100 inclusive.
 *   R2 VOTING_NOT_OVER_ECONOMIC_WITHOUT_CONTROL
 *                            voting may exceed economic (preference shares,
 *                            golden shares) but ONLY when the record carries
 *                            control rights — i.e. ownershipType CONTROL_ONLY or
 *                            a non-empty control instrument. Otherwise a voting
 *                            right without an economic base is unexplained.
 *   R3 INSTRUMENT_PRESENT    a DIRECT/INDIRECT/BENEFICIAL record must name the
 *                            instrument and the supporting document. CONTROL_ONLY
 *                            may rely on a control agreement reference alone.
 *   R4 PROVENANCE_PRESENT    the provenance string that justifies the figure.
 *   R5 NO_CYCLE              the owner must not be the owned entity or its
 *                            descendant.
 *   R6 ECONOMIC_TOTAL        live economic percentages for one owned entity must
 *                            not exceed 100.
 *   R7 VOTING_TOTAL          live voting percentages must not exceed 100.
 *
 * Where the input is incomplete in a way a human must resolve (an economic total
 * that is under 100 and no other owner is recorded), the verdict is
 * RETURNS_HUMAN_REVIEW rather than VALID: an inference is never recorded as a
 * fact.
 */
export function evaluateOwnership(record: OwnershipInstrument): OwnershipVerdict {
  const rules: OwnershipRuleResult[] = [];
  const economic = Number(record.economicPct);
  const voting = Number(record.votingPct);

  const rangeOk = Number.isFinite(economic) && Number.isFinite(voting) && economic >= 0 && economic <= 100 && voting >= 0 && voting <= 100;
  rules.push({
    rule: "R1_PERCENTAGE_RANGE",
    passed: rangeOk,
    detail: `economic ${record.economicPct}%, voting ${record.votingPct}% (both must be 0–100).`,
  });

  const votingExceedsEconomic = voting > economic;
  const controlBasis = record.ownershipType === "CONTROL_ONLY" || record.instrument.trim().length > 0;
  const votingOk = !votingExceedsEconomic || controlBasis;
  rules.push({
    rule: "R2_VOTING_VS_ECONOMIC",
    passed: votingOk,
    detail: votingExceedsEconomic
      ? `voting ${record.votingPct}% exceeds economic ${record.economicPct}%; justified only by an explicit control instrument (present: ${controlBasis}).`
      : "voting does not exceed economic.",
  });

  const instrumentPresent = record.instrument.trim().length > 0 && record.supportingDocumentId !== null;
  const instrumentOk =
    record.ownershipType === "CONTROL_ONLY" ? record.instrument.trim().length > 0 : instrumentPresent;
  rules.push({
    rule: "R3_INSTRUMENT_PRESENT",
    passed: instrumentOk,
    detail: record.ownershipType === "CONTROL_ONLY"
      ? `CONTROL_ONLY requires a control instrument reference (present: ${record.instrument.trim().length > 0}).`
      : `requires both an instrument and a supporting document id (instrument: ${record.instrument.trim().length > 0}, document: ${record.supportingDocumentId !== null}).`,
  });

  const provenanceOk = record.provenance.trim().length >= 8;
  rules.push({
    rule: "R4_PROVENANCE_PRESENT",
    passed: provenanceOk,
    detail: `provenance must state where the figure came from (${record.provenance.trim().length} chars).`,
  });

  rules.push({
    rule: "R5_NO_CYCLE",
    passed: !record.createsCycle,
    detail: record.createsCycle
      ? "the owner is the owned entity or one of its descendants: this would create a circular ownership chain."
      : "the owner is outside the owned entity's descendant chain.",
  });

  const economicTotal = record.siblingEconomicTotalPct + (Number.isFinite(economic) ? economic : 0);
  const economicTotalOk = economicTotal <= 100 + 1e-9;
  rules.push({
    rule: "R6_ECONOMIC_TOTAL",
    passed: economicTotalOk,
    detail: `live economic total for this entity would be ${economicTotal.toFixed(6)}% (maximum 100%).`,
  });

  const votingTotal = record.siblingVotingTotalPct + (Number.isFinite(voting) ? voting : 0);
  const votingTotalOk = votingTotal <= 100 + 1e-9;
  rules.push({
    rule: "R7_VOTING_TOTAL",
    passed: votingTotalOk,
    detail: `live voting total for this entity would be ${votingTotal.toFixed(6)}% (maximum 100%).`,
  });

  let state: OwnershipVerdict["state"];
  if (record.createsCycle) state = "CIRCULAR";
  else if (!instrumentOk) state = "INSTRUMENT_MISSING";
  else if (!provenanceOk) state = "PROVENANCE_MISSING";
  else if (!economicTotalOk || !votingTotalOk) state = "OVER_ALLOCATED";
  else if (!rangeOk || !votingOk) state = "RETURNS_HUMAN_REVIEW";
  else if (economicTotal < 100 - 1e-9) {
    // A live total below 100 means an owner is missing from the register. That is
    // a human question, not a validation success.
    state = "RETURNS_HUMAN_REVIEW";
  } else state = "VALID";

  return {
    state,
    rules,
    economicTotalPct: economicTotal,
    votingTotalPct: votingTotal,
  };
}

/* ------------------------------------------------------------------ */
/* Intercompany rules                                                  */
/* ------------------------------------------------------------------ */

/**
 * Which sides of an intercompany transaction a principal may authorise.
 *
 * BOTH sides require `mcm:intercompany.authorize` AND an authority tuple that
 * matches the side's own legal entity. A principal who holds an entity-scoped
 * grant for the receivable entity cannot authorise the payable entity's side —
 * that is the entire segregation-of-duties control, and the database enforces the
 * "two distinct humans" half of it independently.
 */
export function intercompanySideAuthority(
  principal: Principal,
  sides: { receivableEntityId: string; payableEntityId: string; tenantId: string; countryCode?: string | null },
): { receivable: boolean; payable: boolean } {
  const receivable = can(principal, "mcm:intercompany.authorize", {
    tenantId: sides.tenantId,
    entityId: sides.receivableEntityId,
    ...(sides.countryCode ? { countryCode: sides.countryCode } : {}),
  }).allowed;
  const payable = can(principal, "mcm:intercompany.authorize", {
    tenantId: sides.tenantId,
    entityId: sides.payableEntityId,
    ...(sides.countryCode ? { countryCode: sides.countryCode } : {}),
  }).allowed;
  return { receivable, payable };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * Render exact minor units for display. Never used for arithmetic.
 *
 * `minorUnits` is the currency's exponent (2 for most, 0 for JPY/TZS-style whole
 * units in BEYU's convention, 3 for KWD/BHD). The caller supplies it; there is no
 * guess.
 */
export function formatMinorUnits(amountMinor: string | null, currency: string | null, minorUnits = 2): string {
  if (amountMinor === null) return "—";
  const negative = amountMinor.startsWith("-");
  const digits = negative ? amountMinor.slice(1) : amountMinor;
  const padded = digits.padStart(minorUnits + 1, "0");
  const whole = padded.slice(0, padded.length - minorUnits);
  const frac = minorUnits > 0 ? `.${padded.slice(padded.length - minorUnits)}` : "";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${frac}${currency ? ` ${currency}` : ""}`;
}
