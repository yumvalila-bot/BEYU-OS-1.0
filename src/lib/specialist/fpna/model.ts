/**
 * BEYU OS — FP&A domain model (Phase 7C).
 *
 * Types only. No policy, no thresholds, no accounting definitions.
 *
 * THE CENTRAL DISCIPLINE OF THIS MODULE: every value that enters FP&A carries an explicit
 * epistemic status — is it something we OBSERVED, something we ASSUMED, something we FORECAST, or
 * something we imagined in a SCENARIO? The whole point of an FP&A layer is that these must never
 * be confused, because a plan presented as a fact is how organisations mislead themselves.
 *
 * Nothing here defines what a figure MEANS in accounting terms. Recognition, measurement and
 * materiality are P1-P11 and remain unratified.
 */

/** Epistemic status of any FP&A value. Never silently upgraded. */
export const VALUE_BASIS = ["OBSERVED", "ASSUMED", "FORECAST", "SCENARIO"] as const;
export type ValueBasis = (typeof VALUE_BASIS)[number];

/** Whether a figure may be relied upon, and if not, why. */
export const DATA_STATE = [
  "AVAILABLE",
  "DATA_NOT_AVAILABLE",
  "REQUIRES_AUTHORITY",
  "REQUIRES_POLICY",
] as const;
export type DataState = (typeof DATA_STATE)[number];

export type ScenarioKind = "BASELINE" | "UPSIDE" | "DOWNSIDE" | "CUSTOM";

export type VarianceKind =
  | "ACTUAL_VS_BUDGET"
  | "ACTUAL_VS_FORECAST"
  | "FORECAST_VS_PLAN"
  | "CURRENT_VS_PRIOR"
  | "SCENARIO_VS_SCENARIO";

/** Common provenance carried by every FP&A object. */
export type FpnaProvenance = {
  tenantId: string;
  legalEntityId: string | null;
  /** Where the value came from: a table, a forecast run, a human assumption. */
  sourceType: string;
  sourceId: string;
  /** Model or ruleset version, for deterministic replay. */
  version: string;
  createdBy: string;
  createdAt: string;
  /** Trace id correlating this object with its audit record. */
  auditReference: string;
};

/**
 * A single measured or asserted value for a period.
 * `basis` is mandatory: there is no way to record a number without saying what kind of number it is.
 */
export type FpnaObservation = {
  seriesCode: string;
  periodDate: string;
  /** Decimal string. Minor-unit conversion happens in the engines, never in storage. */
  value: string;
  currency: string;
  basis: ValueBasis;
  unit?: string;
  provenance: FpnaProvenance;
};

/** A named driver with an explicit basis and confidence. */
export type Driver = {
  driverCode: string;
  label: string;
  value: string;
  unit: string;
  basis: ValueBasis;
  /** 0-1. Only meaningful for ASSUMED/FORECAST/SCENARIO values. */
  confidence: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  owner: string;
  sourceType: string;
  sourceId: string;
};

export type Assumption = {
  assumptionCode: string;
  statement: string;
  basis: Extract<ValueBasis, "ASSUMED" | "SCENARIO">;
  owner: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  /** Open assumptions must surface in every report that depends on them. */
  status: "OPEN" | "CONFIRMED" | "RETIRED";
};

export type Scenario = {
  scenarioCode: string;
  kind: ScenarioKind;
  label: string;
  /** Immutable once published. */
  published: boolean;
  version: string;
  drivers: Driver[];
  assumptions: Assumption[];
  provenance: FpnaProvenance;
};

export type VarianceResult = {
  kind: VarianceKind;
  seriesCode: string;
  periodDate: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: string;
  rightValue: string;
  absoluteVariance: string;
  /** Null when the base is zero — a percentage against zero is undefined, not infinite. */
  percentageVariance: string | null;
  direction: "FAVOURABLE" | "ADVERSE" | "NEUTRAL" | "UNDETERMINED";
  /**
   * Materiality requires a ratified threshold (unresolved). Always REQUIRES_POLICY unless a
   * governed threshold is supplied by the caller.
   */
  materiality: "REQUIRES_POLICY" | "MATERIAL" | "IMMATERIAL";
  materialityBasis: string;
  /** Both sides' epistemic status, so a forecast-vs-forecast variance cannot look like fact. */
  leftBasis: ValueBasis;
  rightBasis: ValueBasis;
  confidence: number;
  explanation: string;
};

export type DataQualityIssue = {
  code:
    | "MISSING_PERIOD"
    | "DUPLICATE_OBSERVATION"
    | "STALE_DATA"
    | "INCONSISTENT_UNIT"
    | "MISSING_PROVENANCE"
    | "INVALID_DATE"
    | "FUTURE_OBSERVATION"
    | "SCOPE_MISMATCH"
    | "CURRENCY_MISMATCH"
    | "INCOMPLETE_FORECAST_INPUT";
  severity: "LOW" | "MEDIUM" | "HIGH";
  detail: string;
  affected: string[];
};

export type RiskSignal = {
  code:
    | "FORECAST_DETERIORATION"
    | "VARIANCE_ACCELERATION"
    | "LIQUIDITY_WARNING"
    | "BUDGET_EXHAUSTION"
    | "UNUSUAL_MOVEMENT"
    | "DATA_QUALITY_DEGRADATION"
    | "SCENARIO_FRAGILITY";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  detail: string;
  evidence: string[];
  /** Always true: a signal is intelligence, never an instruction. */
  advisoryOnly: true;
};

/** A management report section, tagged so a reader can never confuse fact with projection. */
export type ReportSection = {
  title: string;
  classification: "FACT" | "FORECAST" | "ASSUMPTION" | "SCENARIO" | "RECOMMENDATION";
  lines: string[];
};

export type ManagementReport = {
  reportCode: string;
  periodLabel: string;
  generatedAt: string;
  executiveSummary: string[];
  sections: ReportSection[];
  openAssumptions: Assumption[];
  dataQuality: DataQualityIssue[];
  riskSignals: RiskSignal[];
  /** Every recommendation terminates here. FP&A never executes. */
  recommendations: Array<{ statement: string; status: "RECOMMENDATION" | "REQUIRES_AUTHORITY"; blockedBy: string[] }>;
};
