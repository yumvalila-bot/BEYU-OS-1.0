/**
 * BEYU OS — Family Institution Phase 3A fail-closed policy gate.
 *
 * Phase 3A technical architecture specification §36 (FC-1). This module is the
 * single, uniform representation of "policy absent": a behavior whose required
 * FIRs are not ratified produces POLICY_DECISION_REQUIRED with the full FC-1
 * consequence set. It NEVER fills a default, chooses between options, or
 * infers a value (I-12).
 *
 * The ratification state is an explicit input. The production default is the
 * empty business set: no business FIR is ratified. FIR-017/018/019 are
 * ratified BOUNDARIES — they constrain every behavior permanently and are
 * enforced elsewhere (alignment.ts, the Finance boundary, canonical
 * ownership); satisfying them never "unlocks" business behavior.
 */

import { PolicyDecisionRequiredError, type FamilyErrorCode } from "./errors";

export type FirRef = `FIR-${string}`;

/** All 27 decisions of the Phase 2.5 ratification register. */
export const ALL_FIR_REFS: readonly FirRef[] = [
  "FIR-001",
  "FIR-002",
  "FIR-003",
  "FIR-004",
  "FIR-005",
  "FIR-006",
  "FIR-007",
  "FIR-008",
  "FIR-009",
  "FIR-010",
  "FIR-011",
  "FIR-012",
  "FIR-013",
  "FIR-014",
  "FIR-015",
  "FIR-016",
  "FIR-017",
  "FIR-018",
  "FIR-019",
  "FIR-020",
  "FIR-021",
  "FIR-022",
  "FIR-023",
  "FIR-024",
  "FIR-025",
  "FIR-026",
  "FIR-027",
] as const;

/**
 * FIRs ratified as BOUNDARIES (prohibitions). They are always in force and
 * must never be treated as gates whose satisfaction permits business behavior.
 */
export const RATIFIED_BOUNDARY_FIR_REFS: readonly FirRef[] = ["FIR-017", "FIR-018", "FIR-019"];

/**
 * FIRs ratified as BUSINESS AUTHORITY. Currently NONE. This list changes only
 * by canonical governance ratification recorded in the repository — never by
 * code, AI, or convenience.
 */
export const RATIFIED_FIR_REFS: readonly FirRef[] = [];

/** The uniform fail-closed consequence set (spec §36.1, FC-1). */
export const FC1_CONSEQUENCES = [
  "NO_WRITE",
  "NO_APPROVAL",
  "NO_EXECUTION",
  "NO_FINANCIAL_CONSEQUENCE",
  "NO_LEGAL_STATUS_CHANGE",
  "DENIAL_AUDITED",
] as const;
export type Fc1Consequence = (typeof FC1_CONSEQUENCES)[number];

export interface PolicyGateInput {
  /** The behavior being attempted (technical operation name). */
  operation: string;
  actorType: "HUMAN" | "SERVICE" | "AI";
  /** FIRs the behavior depends on (from the Phase 3A dependency matrix). */
  requiredFirRefs: readonly FirRef[];
  /**
   * Ratified business FIRs. Defaults to RATIFIED_FIR_REFS (empty). Production
   * callers must inject the governance-verified state; tests may inject a
   * TEST-RATIFICATION set (test scope only).
   */
  ratifiedFirRefs?: readonly FirRef[];
}

export interface PolicyGateResult {
  allowed: boolean;
  code: FamilyErrorCode | null;
  /** The unratified FIRs the behavior is missing (empty iff allowed). */
  missingFirRefs: readonly FirRef[];
  /** FC-1 consequences applied when not allowed (empty iff allowed). */
  consequences: readonly Fc1Consequence[];
}

/**
 * Pure, deterministic policy gate. `allowed` is true only when every required
 * FIR is in the ratified set. No default is ever substituted for a missing
 * value; the missing set is returned verbatim.
 */
export function evaluatePolicyGate(input: PolicyGateInput): PolicyGateResult {
  const ratified = input.ratifiedFirRefs ?? RATIFIED_FIR_REFS;
  const ratifiedSet = new Set<string>(ratified);
  const missing = [...new Set(input.requiredFirRefs)].filter((fir) => !ratifiedSet.has(fir));
  if (missing.length === 0) {
    return { allowed: true, code: null, missingFirRefs: [], consequences: [] };
  }
  return {
    allowed: false,
    code: "POLICY_DECISION_REQUIRED",
    missingFirRefs: missing,
    consequences: FC1_CONSEQUENCES,
  };
}

/**
 * Asserting form of the gate: throws PolicyDecisionRequiredError naming the
 * missing FIRs when the behavior is not ratification-complete.
 */
export function assertPolicyGate(input: PolicyGateInput): void {
  const result = evaluatePolicyGate(input);
  if (!result.allowed) {
    throw new PolicyDecisionRequiredError(
      result.missingFirRefs,
      `Operation "${input.operation}" is not ratification-complete. ` +
        `POLICY DECISION REQUIRED for: ${result.missingFirRefs.join(", ")}.`,
    );
  }
}

export function isFc1Consequence(value: string): value is Fc1Consequence {
  return (FC1_CONSEQUENCES as readonly string[]).includes(value);
}

export function isFirRef(value: string): value is FirRef {
  return /^FIR-\d{3}$/.test(value);
}

export function knownFirRef(value: string): value is FirRef {
  return (ALL_FIR_REFS as readonly string[]).includes(value);
}
