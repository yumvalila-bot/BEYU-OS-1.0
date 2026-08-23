/**
 * BEYU OS — Financial Risk Intelligence domain model (Phase 7D).
 *
 * Types only. No thresholds, no limits, no risk appetite, no regulatory ratios.
 *
 * THE CENTRAL DISCIPLINE. Risk analysis is where invented numbers do the most damage, because a
 * severity label carries the appearance of professional judgement. This model therefore makes two
 * things structurally impossible:
 *
 *   1. A value cannot be recorded without saying what KIND of value it is (`RiskBasis`).
 *   2. A severity cannot be asserted without a threshold. Absent a ratified threshold, severity is
 *      `REQUIRES_POLICY` — never a guessed LOW/MEDIUM/HIGH.
 *
 * Concentration percentages, exposure ratios and counterparty shares are DERIVED arithmetic over
 * observed balances: they are facts about the data, not accounting measurements, and need no
 * ratification. What they MEAN — whether 41% at one bank is acceptable — is risk appetite, which
 * nobody has ratified, so this module never says.
 */

/** Epistemic status of any risk value. Mirrors the FP&A convention deliberately. */
export const RISK_BASIS = [
  "OBSERVED",
  "DERIVED",
  "ASSUMED",
  "FORECAST",
  "SCENARIO",
  "DATA_NOT_AVAILABLE",
  "REQUIRES_AUTHORITY",
] as const;
export type RiskBasis = (typeof RISK_BASIS)[number];

export const RISK_TYPE = [
  "LIQUIDITY",
  "CONCENTRATION",
  "COUNTERPARTY",
  "CAPITAL_EXPOSURE",
  "TREASURY_EXPOSURE",
  "CURRENCY",
  "DATA_QUALITY",
  "GOVERNANCE_AUTHORITY",
  "LIMIT_BREACH",
  "SCENARIO",
] as const;
export type RiskType = (typeof RISK_TYPE)[number];

/**
 * Severity. `REQUIRES_POLICY` is the default and the honest answer for any measure whose
 * significance depends on a risk appetite nobody has ratified.
 */
export const RISK_SEVERITY = ["REQUIRES_POLICY", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskSeverity = (typeof RISK_SEVERITY)[number];

/** A reference to a real record the analysis was derived from. */
export type RiskSource = {
  type: string;
  id: string;
  basis: Extract<RiskBasis, "OBSERVED" | "DERIVED" | "SCENARIO">;
};

/**
 * A governed threshold supplied by a caller. BEYU has no ratified risk appetite, so no threshold
 * is hard-coded anywhere; a caller may supply one and the engines will apply it, recording that it
 * came from outside.
 */
export type RiskThreshold = {
  code: string;
  /** Percentage points (0-100) or an absolute minor-unit amount, per `unit`. */
  value: number;
  unit: "PERCENT" | "MINOR_UNITS" | "RATIO";
  /**
   * Which side of the threshold is the breach.
   *
   *   MAX — a ceiling: breached when the measure is at or above it (e.g. counterparty concentration).
   *   MIN — a floor: breached when the measure is at or below it (e.g. liquidity coverage).
   *
   * Without this, a coverage floor and a concentration ceiling would be compared identically and
   * one of them would be graded backwards. Each engine states its own default.
   */
  direction?: "MAX" | "MIN";
  /** Where the threshold came from. A threshold without provenance is refused. */
  sourceReference: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

/** The canonical result shape for every risk engine. */
export type RiskResult = {
  riskType: RiskType;
  code: string;
  title: string;
  /** The epistemic status of `value`. */
  basis: RiskBasis;
  /** Null whenever the required input is absent — never zero-as-an-answer. */
  value: string | null;
  unit: "PERCENT" | "MINOR_UNITS" | "RATIO" | "COUNT" | "NONE";
  /** The denominator used for a ratio, so a percentage can be independently checked. */
  denominator: string | null;
  currency: string | null;
  severity: RiskSeverity;
  severityBasis: string;
  /** Real records this was computed from. */
  sources: RiskSource[];
  calculationMethod: string;
  assumptions: string[];
  /** Inputs that were required but absent. Non-empty implies basis DATA_NOT_AVAILABLE. */
  missingInputs: string[];
  /** Decisions that must be ratified before this can mean more than it does. */
  policyDependencies: string[];
  authorityDependencies: string[];
  /** Human-readable derivation. */
  explanation: string[];
};

export type ConcentrationBucket = {
  key: string;
  label: string;
  amountMinor: number;
  sharePercent: string;
};

export type ScenarioAdjustment = {
  /** Which observed record the scenario perturbs. */
  targetId: string;
  /** Multiplier applied to the observed amount. 0.5 halves it, 1.5 increases it by half. */
  factor: number;
  rationale: string;
};

export type AuthorityRiskItem = {
  code: string;
  detail: string;
  /** Always advisory: this module reports authority state, it never changes it. */
  advisoryOnly: true;
};
