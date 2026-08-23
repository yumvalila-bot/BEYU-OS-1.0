/**
 * BEYU OS — Forecasting, Scenario & Cross-Specialist Intelligence model (Phase 7H).
 *
 * Types only. No growth rates, no seasonality factors, no confidence thresholds, no recognition
 * rules, no valuation bases.
 *
 * WHAT THE SUBSTRATE ACTUALLY CONTAINS (verified against the live database, not assumed):
 *
 *   journal_entries          0 rows  — there is NO ledger history
 *   treasury_positions       5 rows, ONE as_of date (2025-12-31)
 *   compliance_assessments   8 rows, ONE period (2025-Q4)
 *   capital_requests         4 rows, no time series
 *
 * THE DEFINING CONSEQUENCE. A forecast requires history, and BEYU has none. Not "sparse history"
 * — none. Every projection engine here is therefore built to be exercised by a caller supplying
 * governed observations, while the SERVICE layer reading canonical stores returns
 * DATA_NOT_AVAILABLE with an empty observation set. That is not a limitation to work around; it
 * is the honest answer, and a forecast conjured from a single data point would be the single most
 * dangerous artefact this system could produce.
 *
 * FOUR SEPARATIONS THE TYPES MAKE STRUCTURALLY IMPOSSIBLE TO COLLAPSE:
 *
 *   1. OBSERVED / FORECAST / ASSUMPTION / SCENARIO travel as distinct bases on every value.
 *      There is no code path that promotes one to another.
 *   2. An ASSUMPTION carries mandatory provenance (id, source, owner, dates, rationale). An
 *      assumption without an owner cannot be constructed.
 *   3. A composed cross-specialist view keeps each source's provenance separate. Sources are never
 *      flattened into one synthetic truth.
 *   4. Where two sources disagree, the result is DATA_CONFLICT. Silent selection is impossible
 *      because no field exists to hold a "winner".
 */

/** Epistemic status of every forecast value. */
export const FORECAST_BASIS = [
  "OBSERVED",
  "FORECAST",
  "ASSUMPTION",
  "SCENARIO",
  "DATA_NOT_AVAILABLE",
  "DATA_CONFLICT",
  "REQUIRES_POLICY",
  "REQUIRES_AUTHORITY",
] as const;
export type ForecastBasis = (typeof FORECAST_BASIS)[number];

/** Scenario kinds. CUSTOM exists so a caller need not misuse a named kind. */
export const SCENARIO_KIND = ["BASELINE", "UPSIDE", "DOWNSIDE", "STRESS", "CUSTOM"] as const;
export type ScenarioKind = (typeof SCENARIO_KIND)[number];

/**
 * Projection methods.
 *
 * All are arithmetic transformations of supplied observations. None embeds an accounting policy:
 * a run rate is arithmetic, whereas "annualised recurring revenue" would be a recognition
 * judgement and is deliberately absent.
 */
export const PROJECTION_METHOD = [
  "NAIVE_LAST",
  "MOVING_AVERAGE",
  "LINEAR_TREND",
  "RUN_RATE",
  "GROWTH_RATE",
] as const;
export type ProjectionMethod = (typeof PROJECTION_METHOD)[number];

/**
 * A governed observation supplied to a forecast engine.
 *
 * `basis` is constrained to OBSERVED: a forecast may only be built on observed history. Passing a
 * forecast in as history would compound estimate upon estimate while presenting the result as
 * though it rested on fact.
 */
export type ForecastObservation = {
  seriesCode: string;
  periodDate: string;
  value: string;
  currency: string;
  basis: Extract<ForecastBasis, "OBSERVED">;
  sourceType: string;
  sourceId: string;
};

/**
 * An explicit assumption. Every field except `effectiveTo` is mandatory by construction —
 * an assumption whose owner or rationale is unknown is not an assumption, it is a guess.
 */
export type ForecastAssumption = {
  assumptionId: string;
  label: string;
  /** The numeric effect, interpreted per `unit`. */
  value: string;
  unit: "PERCENT" | "MULTIPLIER" | "ABSOLUTE_MINOR_UNITS";
  source: string;
  owner: string;
  createdAt: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  rationale: string;
  tenantId: string;
  legalEntityId: string | null;
  /** Always ASSUMPTION. There is no code path that converts this to OBSERVED. */
  basis: Extract<ForecastBasis, "ASSUMPTION">;
};

export type ForecastScenario = {
  scenarioCode: string;
  kind: ScenarioKind;
  label: string;
  owner: string;
  createdAt: string;
  tenantId: string;
  legalEntityId: string | null;
  assumptions: ForecastAssumption[];
  rationale: string;
};

export type ForecastPoint = {
  step: number;
  periodDate: string | null;
  value: string;
  /** Dispersion band from historical variability. Never a probability of being correct. */
  lowerBound: string;
  upperBound: string;
  basis: Extract<ForecastBasis, "FORECAST" | "SCENARIO">;
};

/**
 * Data-quality assessment of the inputs behind a forecast.
 *
 * `confidence` is nullable and REQUIRES_POLICY by default: converting dispersion into a
 * confidence percentage implies a ratified tolerance for forecast error, and none exists.
 */
export type ForecastQuality = {
  observationCount: number;
  /** Distinct period dates. One point cannot establish a trend, however many rows exist. */
  distinctPeriods: number;
  hasSufficientHistory: boolean;
  minimumRequired: number;
  gaps: string[];
  duplicatePeriods: string[];
  currencyConsistent: boolean;
  confidence: null;
  confidenceBasis: Extract<ForecastBasis, "REQUIRES_POLICY">;
  explanation: string[];
};

/**
 * Version identity for reproducible replay (§11).
 *
 * A checksum over the exact inputs, computed with the platform's existing `checksumOf`. No new
 * persistence layer and no migration: the forecast itself is not stored, so nothing historical can
 * be overwritten. Re-running with identical inputs reproduces an identical `versionId`; changing
 * any input produces a different one.
 */
export type ForecastVersion = {
  versionId: string;
  engineVersion: string;
  method: ProjectionMethod;
  scenarioCode: string;
  horizon: number;
  /** Checksum of the observation set the forecast was built from. */
  sourceSnapshotChecksum: string;
  /** Checksum of the effective assumption set. */
  assumptionsChecksum: string;
  producedAt: string;
  actorUserId: string;
  tenantId: string;
  legalEntityId: string | null;
};

export type ForecastResult = {
  seriesCode: string;
  method: ProjectionMethod;
  scenarioCode: string;
  currency: string | null;
  horizon: number;
  /** Null when history is insufficient — never an empty array presented as a valid forecast. */
  points: ForecastPoint[] | null;
  basis: ForecastBasis;
  quality: ForecastQuality;
  version: ForecastVersion | null;
  /** Assumptions actually applied, after effective-date filtering. */
  appliedAssumptions: ForecastAssumption[];
  /** Assumptions excluded because they were not effective, with the reason. */
  excludedAssumptions: Array<{ assumptionId: string; reason: string }>;
  missingInputs: string[];
  policyDependencies: string[];
  explanation: string[];
};

export type SensitivityResult = {
  seriesCode: string;
  /** Each variation is a scenario, never a forecast of what will happen. */
  variations: Array<{
    assumptionId: string;
    label: string;
    shiftPercent: string;
    resultingFinalValue: string | null;
    deltaFromBaseline: string | null;
  }>;
  baselineFinalValue: string | null;
  basis: Extract<ForecastBasis, "SCENARIO" | "DATA_NOT_AVAILABLE">;
  explanation: string[];
};

export type ForecastComparison = {
  scenarioCodes: string[];
  perScenarioFinalValue: Array<{ scenarioCode: string; finalValue: string | null; basis: ForecastBasis }>;
  spread: string | null;
  basis: Extract<ForecastBasis, "SCENARIO" | "DATA_NOT_AVAILABLE">;
  explanation: string[];
};

// ---------------------------------------------------------------------------
// Cross-specialist composition (§8)
// ---------------------------------------------------------------------------

export const SPECIALIST_SOURCE = ["FPNA", "TREASURY", "RISK", "COMPLIANCE", "AUDIT"] as const;
export type SpecialistSource = (typeof SPECIALIST_SOURCE)[number];

/**
 * One specialist's contribution to a composed view.
 *
 * Each contribution keeps its OWN basis and provenance. This is why the composition layer cannot
 * flatten sources: there is no shared value field to flatten into.
 */
export type SourceContribution = {
  source: SpecialistSource;
  available: boolean;
  basis: ForecastBasis;
  /** Records this contribution was derived from, retained per source. */
  provenance: Array<{ type: string; id: string }>;
  /** Source-specific summary. Deliberately opaque to the composer. */
  summary: Record<string, string | number | null>;
  explanation: string[];
};

/**
 * A detected disagreement between sources. Presence of any conflict forces the composed basis to
 * DATA_CONFLICT; there is deliberately no "resolution" or "preferred source" field.
 */
export type SourceConflict = {
  code: string;
  sources: SpecialistSource[];
  detail: string;
  /** Always true: detecting a conflict never authorises resolving it. */
  requiresGovernanceReview: true;
};

export type ComposedView = {
  asOf: string;
  tenantId: string;
  legalEntityId: string | null;
  contributions: SourceContribution[];
  conflicts: SourceConflict[];
  unavailableSources: SpecialistSource[];
  basis: ForecastBasis;
  /** Records withheld from this caller by clearance, so a composed view is never silently short. */
  withheldRecordCount: number;
  explanation: string[];
};

/**
 * Accounting concepts a forecasting module would conventionally compute, each blocked because it
 * requires a ratified measurement basis (§6). Returned explicitly so a reader knows the question
 * was considered rather than overlooked.
 */
export type PolicyBlockedConcept = {
  concept:
    | "REVENUE_RECOGNITION"
    | "EXPENSE_RECOGNITION"
    | "DEPRECIATION"
    | "IMPAIRMENT"
    | "TAX_LIABILITY"
    | "FX_TRANSLATION"
    | "EBITDA"
    | "NET_INCOME"
    | "WORKING_CAPITAL"
    | "VALUATION"
    | "PROVISIONING";
  basis: Extract<ForecastBasis, "REQUIRES_AUTHORITY" | "REQUIRES_POLICY">;
  blockingDecisions: string[];
  explanation: string;
};
