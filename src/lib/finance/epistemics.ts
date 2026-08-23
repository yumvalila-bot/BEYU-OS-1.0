/**
 * BEYU OS — Finance OS canonical epistemic model (Phase 7J, §5).
 *
 * THE DEFECT THIS FIXES. Six specialists each declared their own private epistemic vocabulary:
 *
 *   fpna       VALUE_BASIS       OBSERVED ASSUMED FORECAST SCENARIO
 *   risk       RISK_BASIS        OBSERVED DERIVED ASSUMED FORECAST SCENARIO ...
 *   compliance COMPLIANCE_BASIS  OBSERVED DERIVED ... REQUIRES_SPECIALIST_REVIEW
 *   treasury   TREASURY_BASIS    OBSERVED DERIVED ASSUMED SCENARIO ... GOVERNANCE_REVIEW_REQUIRED
 *   audit      AUDIT_BASIS       OBSERVED DERIVED POTENTIAL_ANOMALY REQUIRES_HUMAN_REVIEW ...
 *   forecast   FORECAST_BASIS    OBSERVED FORECAST ASSUMPTION SCENARIO ... DATA_CONFLICT
 *
 * Three concrete problems, all provable from that list:
 *   1. fpna says ASSUMED where forecast says ASSUMPTION — the same epistemic state under two
 *      names, so no cross-specialist comparison can be trusted.
 *   2. `POSTED` appears in NO specialist. Nothing in the system could express "this is booked
 *      accounting truth" as distinct from "this was observed somewhere".
 *   3. Each specialist independently decided which states it permits, so the rule
 *      "a forecast must never become a posted figure" was enforced nowhere in common — it was
 *      re-implemented, differently, six times, or not at all.
 *
 * This module is the ONE model. It does not delete the specialist vocabularies (that would be a
 * rewrite of six working modules for no behavioural gain); it defines the canonical superset, a
 * total mapping from every legacy term onto it, and the promotion rules that were previously
 * unenforceable. New Finance OS code uses this directly.
 *
 * IT CONTAINS NO ACCOUNTING POLICY. Whether a given number is OBSERVED or DERIVED is a fact about
 * where the number came from, not a judgement about what it means.
 */

/**
 * The canonical epistemic classification of any financial datum.
 *
 * Ordered from strongest to weakest claim, then the "no claim" states. The order is meaningful:
 * `isAtLeastAsStrongAs()` depends on it.
 */
export const EPISTEMIC_CLASS = [
  /** Booked accounting truth: a posted journal line. The only class that is accounting fact. */
  "POSTED",
  /** Directly measured from a real source (a bank balance, a register row). Fact, not booked. */
  "OBSERVED",
  /** Computed from POSTED or OBSERVED inputs by a deterministic rule. Traceable to its inputs. */
  "DERIVED",
  /** A projection. Never a fact about the past. */
  "FORECAST",
  /** An input someone chose. Never evidence for its own correctness. */
  "ASSUMPTION",
  /** A hypothetical world. Never financial truth. */
  "SCENARIO",
  /** Static lookup data (a currency list, a rate table). Never authority. */
  "REFERENCE_DATA",
  /** A test fixture. Must never reach production truth. */
  "SYNTHETIC",
  /** Cannot be determined without ratified authority. */
  "REQUIRES_AUTHORITY",
  /** Cannot be determined without resolved policy. */
  "REQUIRES_POLICY",
  /** Ownership or attribution is unclear; a human governance decision is needed. */
  "GOVERNANCE_REVIEW_REQUIRED",
  /** The data genuinely does not exist. Explicitly NOT zero. */
  "DATA_NOT_AVAILABLE",
  /** Sources disagree and no ratified rule picks a winner. */
  "DATA_CONFLICT",
] as const;
export type EpistemicClass = (typeof EPISTEMIC_CLASS)[number];

/** Classes that represent an actual fact about the real world. */
export const FACTUAL_CLASSES: readonly EpistemicClass[] = ["POSTED", "OBSERVED"] as const;

/** Classes that assert no value at all. A caller must never coerce these to a number. */
export const NON_VALUE_CLASSES: readonly EpistemicClass[] = [
  "REQUIRES_AUTHORITY",
  "REQUIRES_POLICY",
  "GOVERNANCE_REVIEW_REQUIRED",
  "DATA_NOT_AVAILABLE",
  "DATA_CONFLICT",
] as const;

/** Classes that must never appear in production financial truth. */
export const NON_PRODUCTION_CLASSES: readonly EpistemicClass[] = ["SYNTHETIC"] as const;

/**
 * Total mapping from every legacy specialist term onto the canonical model.
 *
 * Deliberately explicit rather than clever: an unmapped term must be a visible failure, never a
 * silent pass-through that invents a new epistemic state.
 */
const LEGACY_ALIASES: Readonly<Record<string, EpistemicClass>> = {
  // fpna VALUE_BASIS
  ASSUMED: "ASSUMPTION",
  // compliance
  REQUIRES_SPECIALIST_REVIEW: "GOVERNANCE_REVIEW_REQUIRED",
  // audit
  POTENTIAL_ANOMALY: "DERIVED",
  REQUIRES_HUMAN_REVIEW: "GOVERNANCE_REVIEW_REQUIRED",
  // treasury / shared
  ATTRIBUTION_CONFLICT: "GOVERNANCE_REVIEW_REQUIRED",
  RECONCILIATION_REQUIRED: "GOVERNANCE_REVIEW_REQUIRED",
  // fpna DATA_STATE
  AVAILABLE: "OBSERVED",
  SYNTHETIC_TEST_FIXTURE: "SYNTHETIC",
};

export class EpistemicViolation extends Error {
  constructor(
    readonly code:
      | "ILLEGAL_PROMOTION"
      | "UNKNOWN_CLASS"
      | "SYNTHETIC_IN_PRODUCTION"
      | "NON_VALUE_COERCION",
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EpistemicViolation";
  }
}

/** True when `value` is a canonical class. Whitelist, never a permissive default. */
export function isEpistemicClass(value: unknown): value is EpistemicClass {
  return typeof value === "string" && (EPISTEMIC_CLASS as readonly string[]).includes(value);
}

/**
 * Normalises any legacy specialist term to the canonical model.
 *
 * Case-sensitive on purpose. These are controlled enum values, so "observed" is not a sloppy
 * spelling of OBSERVED — it is a string that did not come from any enum, and normalising it would
 * let arbitrary input acquire the meaning of measured fact.
 */
export function normalizeEpistemicClass(raw: string): EpistemicClass {
  if (isEpistemicClass(raw)) return raw;
  const mapped = LEGACY_ALIASES[raw];
  if (mapped) return mapped;
  throw new EpistemicViolation(
    "UNKNOWN_CLASS",
    `'${raw}' is not a known epistemic class and has no canonical mapping. ` +
      "An unrecognised classification must fail rather than default to a factual one.",
    { raw },
  );
}

/**
 * THE PROMOTION RULE — the §5 prohibitions, enforced in one place.
 *
 * Returns true only when a datum of class `from` may be recorded as class `to`. Everything is
 * denied unless explicitly listed; there is no permissive fall-through.
 */
export function canPromote(from: EpistemicClass, to: EpistemicClass): boolean {
  if (from === to) return true;

  // SYNTHETIC never becomes anything real, in any direction.
  if (from === "SYNTHETIC" || to === "SYNTHETIC") return false;

  // Nothing may become POSTED except by genuine posting of an already-factual figure.
  // FORECAST / ASSUMPTION / SCENARIO -> POSTED is the central prohibition.
  if (to === "POSTED") return from === "OBSERVED";

  // REFERENCE_DATA is never authority and never becomes a measured fact.
  if (from === "REFERENCE_DATA") return false;

  // A non-value state cannot become a value. DATA_NOT_AVAILABLE -> 0 is the classic fabrication.
  if ((NON_VALUE_CLASSES as readonly string[]).includes(from)) return false;

  // Weakening is always allowed: a fact may be used as an input to a forecast or scenario.
  const rank = (c: EpistemicClass) => EPISTEMIC_CLASS.indexOf(c);
  return rank(to) > rank(from);
}

/** Throws unless the promotion is permitted. Use at every layer boundary that records a value. */
export function assertPromotion(from: EpistemicClass, to: EpistemicClass, context: string): void {
  if (!canPromote(from, to)) {
    throw new EpistemicViolation(
      "ILLEGAL_PROMOTION",
      `${context}: a ${from} value must never be recorded as ${to}.`,
      { from, to, context },
    );
  }
}

/** Throws if a synthetic fixture is about to touch production truth. */
export function assertNotSynthetic(cls: EpistemicClass, context: string): void {
  if ((NON_PRODUCTION_CLASSES as readonly string[]).includes(cls)) {
    throw new EpistemicViolation(
      "SYNTHETIC_IN_PRODUCTION",
      `${context}: synthetic data must never enter production financial truth.`,
      { cls, context },
    );
  }
}

/**
 * A value carrying its epistemic class. `amount` is null exactly when the class asserts no value —
 * the type makes "DATA_NOT_AVAILABLE with amount 0" unrepresentable by convention and by check.
 */
export type ClassifiedValue = {
  amount: string | null;
  currency: string | null;
  epistemicClass: EpistemicClass;
  /** Where this came from: a table name, an engine name, an external source. */
  sourceType: string;
  sourceId: string | null;
  /** Present only for the non-value classes, explaining what is missing. */
  reason: string | null;
};

/** Constructs a factual value, refusing the classes that assert no value. */
export function classifiedValue(input: {
  amount: string;
  currency: string;
  epistemicClass: EpistemicClass;
  sourceType: string;
  sourceId: string | null;
}): ClassifiedValue {
  if ((NON_VALUE_CLASSES as readonly string[]).includes(input.epistemicClass)) {
    throw new EpistemicViolation(
      "NON_VALUE_COERCION",
      `${input.epistemicClass} asserts no value; it cannot carry an amount. ` +
        "Use unavailable() so the absence stays visible rather than becoming a number.",
      { epistemicClass: input.epistemicClass },
    );
  }
  return { ...input, reason: null };
}

/** Constructs an explicit absence. Never zero. */
export function unavailable(
  epistemicClass: Extract<
    EpistemicClass,
    | "REQUIRES_AUTHORITY"
    | "REQUIRES_POLICY"
    | "GOVERNANCE_REVIEW_REQUIRED"
    | "DATA_NOT_AVAILABLE"
    | "DATA_CONFLICT"
  >,
  reason: string,
  sourceType = "finance-os",
): ClassifiedValue {
  return { amount: null, currency: null, epistemicClass, sourceType, sourceId: null, reason };
}

/**
 * Combines the classes of several inputs into the class of a result derived from them.
 *
 * The result is never stronger than its weakest input — the rule that stops a forecast built on
 * one observed and one assumed number from presenting itself as observed.
 */
export function combineClasses(inputs: EpistemicClass[]): EpistemicClass {
  if (inputs.length === 0) return "DATA_NOT_AVAILABLE";

  // A conflict or a missing input dominates everything: the result cannot be trusted at all.
  for (const dominant of ["DATA_CONFLICT", "DATA_NOT_AVAILABLE", "GOVERNANCE_REVIEW_REQUIRED",
    "REQUIRES_AUTHORITY", "REQUIRES_POLICY"] as const) {
    if (inputs.includes(dominant)) return dominant;
  }
  if (inputs.includes("SYNTHETIC")) return "SYNTHETIC";

  const rank = (c: EpistemicClass) => EPISTEMIC_CLASS.indexOf(c);
  const weakest = inputs.reduce((a, b) => (rank(b) > rank(a) ? b : a));

  // A combination of facts is DERIVED, not POSTED: arithmetic over booked figures does not
  // itself produce a booked figure.
  if (weakest === "POSTED" || weakest === "OBSERVED") return "DERIVED";
  return weakest;
}
