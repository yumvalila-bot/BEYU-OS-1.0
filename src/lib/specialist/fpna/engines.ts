/**
 * BEYU OS — FP&A engines (Phase 7C): variance, data quality, risk signals, scenarios, reporting.
 *
 * All pure functions. No database, no principal, no authority — those are applied by the service
 * layer through the Phase 7B specialist platform. Keeping the engines pure makes them
 * deterministically testable and replayable, which is a requirement for anything that may inform
 * a governed decision.
 *
 * WHAT THESE ENGINES REFUSE TO DO:
 *   - invent a materiality threshold (that is accounting policy; variance returns REQUIRES_POLICY);
 *   - convert an ASSUMED value into an OBSERVED one;
 *   - compare across currencies (that needs the FX decision, P4);
 *   - fabricate an actual figure when none exists.
 */
import { SpecialistError } from "../platform";
import type {
  Assumption,
  DataQualityIssue,
  Driver,
  FpnaObservation,
  ManagementReport,
  ReportSection,
  RiskSignal,
  Scenario,
  ValueBasis,
  VarianceKind,
  VarianceResult,
} from "./model";

export const FPNA_VERSION = "fpna-1.0.0";

// ---------------------------------------------------------------------------
// Money helpers — integer minor units, identical convention to the posting engine.
// ---------------------------------------------------------------------------

export function toMinor(value: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) {
    throw new SpecialistError("RULE_VIOLATION", `Value '${value}' is not a valid amount.`);
  }
  const [whole, frac = ""] = value.split(".");
  const negative = whole.startsWith("-");
  const magnitude = Number(`${whole.replace("-", "")}${frac.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(magnitude)) {
    throw new SpecialistError("RULE_VIOLATION", `Value '${value}' exceeds the safe range.`);
  }
  return negative ? -magnitude : magnitude;
}

export function fromMinor(minor: number): string {
  const rounded = Math.round(minor);
  const negative = rounded < 0;
  const s = Math.abs(rounded).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}

// ---------------------------------------------------------------------------
// §6 VARIANCE ENGINE
// ---------------------------------------------------------------------------

export type VarianceInput = {
  kind: VarianceKind;
  seriesCode: string;
  periodDate: string;
  left: { label: string; value: string; currency: string; basis: ValueBasis; confidence?: number };
  right: { label: string; value: string; currency: string; basis: ValueBasis; confidence?: number };
  /**
   * Materiality threshold in minor units. OPTIONAL and unset by default: BEYU has no ratified
   * materiality policy (part of P3), so the engine reports REQUIRES_POLICY rather than inventing
   * a number. A governed caller may supply one once ratified.
   */
  materialityThresholdMinor?: number;
  /** Whether a positive variance is good. Direction is meaningless without knowing this. */
  higherIsFavourable?: boolean;
  driver?: string;
};

export function calculateVariance(input: VarianceInput): VarianceResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodDate)) {
    throw new SpecialistError("RULE_VIOLATION", "periodDate must be an ISO date (YYYY-MM-DD).");
  }
  if (input.left.currency !== input.right.currency) {
    // Cross-currency variance requires the FX decision (P4), which is unratified.
    throw new SpecialistError(
      "RULE_VIOLATION",
      "Cannot compare values in different currencies; cross-currency analysis requires the FX decision (P4).",
    );
  }

  const leftMinor = toMinor(input.left.value);
  const rightMinor = toMinor(input.right.value);
  const absolute = leftMinor - rightMinor;

  // A percentage against a zero base is undefined, not infinity or zero.
  const percentage =
    rightMinor === 0 ? null : ((absolute / Math.abs(rightMinor)) * 100).toFixed(2);

  let direction: VarianceResult["direction"];
  if (absolute === 0) {
    direction = "NEUTRAL";
  } else if (input.higherIsFavourable === undefined) {
    // Without knowing whether up is good, asserting favourable/adverse would be a guess.
    direction = "UNDETERMINED";
  } else {
    const positive = absolute > 0;
    direction = positive === input.higherIsFavourable ? "FAVOURABLE" : "ADVERSE";
  }

  let materiality: VarianceResult["materiality"] = "REQUIRES_POLICY";
  let materialityBasis =
    "No ratified materiality threshold exists (P3). Materiality cannot be determined.";
  if (input.materialityThresholdMinor !== undefined) {
    if (!Number.isSafeInteger(input.materialityThresholdMinor) || input.materialityThresholdMinor < 0) {
      throw new SpecialistError("RULE_VIOLATION", "Materiality threshold must be a non-negative integer.");
    }
    materiality =
      Math.abs(absolute) >= input.materialityThresholdMinor ? "MATERIAL" : "IMMATERIAL";
    materialityBasis = `Governed threshold of ${fromMinor(input.materialityThresholdMinor)} supplied by the caller.`;
  }

  // Confidence is the weaker of the two sides; an OBSERVED value is certain, others are not.
  const sideConfidence = (basis: ValueBasis, supplied?: number) =>
    basis === "OBSERVED" ? 1 : Math.min(1, Math.max(0, supplied ?? 0.5));
  const confidence = Number(
    Math.min(
      sideConfidence(input.left.basis, input.left.confidence),
      sideConfidence(input.right.basis, input.right.confidence),
    ).toFixed(2),
  );

  const bothObserved = input.left.basis === "OBSERVED" && input.right.basis === "OBSERVED";
  const explanation =
    `${input.left.label} (${input.left.basis}) minus ${input.right.label} (${input.right.basis}) ` +
    `= ${fromMinor(absolute)} ${input.left.currency}` +
    (percentage === null ? " (percentage undefined against a zero base)" : ` (${percentage}%)`) +
    (bothObserved ? "." : ". At least one side is not an observed fact; treat with the stated confidence.") +
    (input.driver ? ` Attributed driver: ${input.driver}.` : "");

  return {
    kind: input.kind,
    seriesCode: input.seriesCode,
    periodDate: input.periodDate,
    leftLabel: input.left.label,
    rightLabel: input.right.label,
    leftValue: input.left.value,
    rightValue: input.right.value,
    absoluteVariance: fromMinor(absolute),
    percentageVariance: percentage,
    direction,
    materiality,
    materialityBasis,
    leftBasis: input.left.basis,
    rightBasis: input.right.basis,
    confidence,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// §10 DATA QUALITY ENGINE
// ---------------------------------------------------------------------------

export function assessDataQuality(
  observations: FpnaObservation[],
  options: { expectedPeriods?: string[]; staleAfterDays?: number; asOf?: string } = {},
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);

  if (observations.length === 0) {
    return [
      {
        code: "INCOMPLETE_FORECAST_INPUT",
        severity: "HIGH",
        detail: "No observations supplied; no analysis is possible.",
        affected: [],
      },
    ];
  }

  // Invalid and future dates.
  const invalid = observations.filter((o) => !/^\d{4}-\d{2}-\d{2}$/.test(o.periodDate));
  if (invalid.length > 0) {
    issues.push({
      code: "INVALID_DATE",
      severity: "HIGH",
      detail: `${invalid.length} observation(s) carry a malformed period date.`,
      affected: invalid.map((o) => o.provenance.sourceId),
    });
  }
  const future = observations.filter(
    (o) => /^\d{4}-\d{2}-\d{2}$/.test(o.periodDate) && o.periodDate > asOf && o.basis === "OBSERVED",
  );
  if (future.length > 0) {
    issues.push({
      code: "FUTURE_OBSERVATION",
      severity: "HIGH",
      detail: `${future.length} observation(s) are dated in the future but marked OBSERVED.`,
      affected: future.map((o) => o.provenance.sourceId),
    });
  }

  // Duplicates within the same series and period.
  const seen = new Map<string, number>();
  for (const o of observations) {
    const key = `${o.seriesCode}|${o.periodDate}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1);
  if (duplicates.length > 0) {
    issues.push({
      code: "DUPLICATE_OBSERVATION",
      severity: "HIGH",
      detail: `${duplicates.length} series/period combination(s) have more than one observation.`,
      affected: duplicates.map(([k]) => k),
    });
  }

  // Currency and unit consistency within a series.
  const bySeries = new Map<string, FpnaObservation[]>();
  for (const o of observations) {
    const list = bySeries.get(o.seriesCode) ?? [];
    list.push(o);
    bySeries.set(o.seriesCode, list);
  }
  for (const [series, list] of bySeries) {
    if (new Set(list.map((o) => o.currency)).size > 1) {
      issues.push({
        code: "CURRENCY_MISMATCH",
        severity: "HIGH",
        detail: `Series ${series} mixes currencies; cross-currency analysis requires the FX decision (P4).`,
        affected: [series],
      });
    }
    const units = new Set(list.map((o) => o.unit ?? "").filter(Boolean));
    if (units.size > 1) {
      issues.push({
        code: "INCONSISTENT_UNIT",
        severity: "MEDIUM",
        detail: `Series ${series} mixes units: ${[...units].join(", ")}.`,
        affected: [series],
      });
    }
  }

  // Missing provenance.
  const unsourced = observations.filter(
    (o) => !o.provenance?.sourceType || !o.provenance?.sourceId,
  );
  if (unsourced.length > 0) {
    issues.push({
      code: "MISSING_PROVENANCE",
      severity: "HIGH",
      detail: `${unsourced.length} observation(s) lack a source reference and cannot be relied upon.`,
      affected: unsourced.map((o) => o.seriesCode),
    });
  }

  // Expected periods.
  if (options.expectedPeriods?.length) {
    const present = new Set(observations.map((o) => o.periodDate));
    const missing = options.expectedPeriods.filter((p) => !present.has(p));
    if (missing.length > 0) {
      issues.push({
        code: "MISSING_PERIOD",
        severity: "MEDIUM",
        detail: `${missing.length} expected period(s) have no observation.`,
        affected: missing,
      });
    }
  }

  // Staleness.
  if (options.staleAfterDays !== undefined) {
    const latest = observations
      .map((o) => o.periodDate)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .pop();
    if (latest) {
      const ageDays = Math.floor(
        (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86_400_000,
      );
      if (ageDays > options.staleAfterDays) {
        issues.push({
          code: "STALE_DATA",
          severity: "MEDIUM",
          detail: `Most recent observation is ${ageDays} day(s) old, exceeding the ${options.staleAfterDays}-day expectation.`,
          affected: [latest],
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// §11 RISK SIGNAL ENGINE
// ---------------------------------------------------------------------------

export function deriveRiskSignals(input: {
  variances?: VarianceResult[];
  dataQuality?: DataQualityIssue[];
  scenarios?: Scenario[];
}): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const variances = input.variances ?? [];
  const quality = input.dataQuality ?? [];

  // Adverse variances that are worsening across consecutive periods.
  const adverse = variances.filter((v) => v.direction === "ADVERSE");
  if (adverse.length >= 2) {
    const sorted = [...adverse].sort((a, b) => a.periodDate.localeCompare(b.periodDate));
    const magnitudes = sorted.map((v) => Math.abs(toMinor(v.absoluteVariance)));
    const worsening = magnitudes.every((m, i) => i === 0 || m >= magnitudes[i - 1]);
    if (worsening) {
      signals.push({
        code: "VARIANCE_ACCELERATION",
        severity: magnitudes.length >= 3 ? "HIGH" : "MEDIUM",
        detail: `Adverse variance has grown across ${magnitudes.length} consecutive period(s).`,
        evidence: sorted.map((v) => `${v.seriesCode}@${v.periodDate}`),
        advisoryOnly: true,
      });
    }
  }

  const highQuality = quality.filter((q) => q.severity === "HIGH");
  if (highQuality.length > 0) {
    signals.push({
      code: "DATA_QUALITY_DEGRADATION",
      severity: highQuality.length >= 3 ? "HIGH" : "MEDIUM",
      detail: `${highQuality.length} high-severity data-quality issue(s) undermine confidence in this analysis.`,
      evidence: highQuality.map((q) => q.code),
      advisoryOnly: true,
    });
  }

  // A scenario resting mostly on open assumptions is fragile.
  for (const scenario of input.scenarios ?? []) {
    const open = scenario.assumptions.filter((a) => a.status === "OPEN");
    if (scenario.assumptions.length > 0 && open.length / scenario.assumptions.length >= 0.5) {
      signals.push({
        code: "SCENARIO_FRAGILITY",
        severity: "MEDIUM",
        detail: `Scenario ${scenario.scenarioCode} rests on ${open.length} of ${scenario.assumptions.length} unconfirmed assumption(s).`,
        evidence: open.map((a) => a.assumptionCode),
        advisoryOnly: true,
      });
    }
  }

  // Low-confidence forecast comparisons.
  const lowConfidence = variances.filter((v) => v.confidence < 0.3);
  if (lowConfidence.length > 0) {
    signals.push({
      code: "FORECAST_DETERIORATION",
      severity: "MEDIUM",
      detail: `${lowConfidence.length} comparison(s) rest on low-confidence inputs.`,
      evidence: lowConfidence.map((v) => `${v.seriesCode}@${v.periodDate}`),
      advisoryOnly: true,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// §8 SCENARIO ENGINE
// ---------------------------------------------------------------------------

/** Publishing freezes a scenario. Any later change must be a new version. */
export function publishScenario(scenario: Scenario): Scenario {
  if (scenario.published) {
    throw new SpecialistError("RULE_VIOLATION", `Scenario ${scenario.scenarioCode} is already published and immutable.`);
  }
  return Object.freeze({ ...scenario, published: true });
}

export function assertScenarioMutable(scenario: Scenario): void {
  if (scenario.published) {
    throw new SpecialistError(
      "RULE_VIOLATION",
      `Scenario ${scenario.scenarioCode} is published and immutable; create a new version instead.`,
    );
  }
}

export type ScenarioComparison = {
  leftCode: string;
  rightCode: string;
  driverDeltas: Array<{
    driverCode: string;
    leftValue: string | null;
    rightValue: string | null;
    delta: string | null;
    note: string;
  }>;
  assumptionDelta: { onlyLeft: string[]; onlyRight: string[] };
};

export function compareScenarios(left: Scenario, right: Scenario): ScenarioComparison {
  if (left.provenance.tenantId !== right.provenance.tenantId) {
    // Comparing across tenants would leak data between them.
    throw new SpecialistError("INVALID_SCOPE", "Scenarios from different tenants cannot be compared.");
  }

  const codes = [...new Set([...left.drivers.map((d) => d.driverCode), ...right.drivers.map((d) => d.driverCode)])].sort();
  const driverDeltas = codes.map((code) => {
    const l = left.drivers.find((d) => d.driverCode === code);
    const r = right.drivers.find((d) => d.driverCode === code);
    if (!l || !r) {
      return {
        driverCode: code,
        leftValue: l?.value ?? null,
        rightValue: r?.value ?? null,
        delta: null,
        note: `Driver present in only one scenario (${l ? left.scenarioCode : right.scenarioCode}).`,
      };
    }
    if (l.unit !== r.unit) {
      return {
        driverCode: code,
        leftValue: l.value,
        rightValue: r.value,
        delta: null,
        note: `Units differ (${l.unit} vs ${r.unit}); no delta computed.`,
      };
    }
    return {
      driverCode: code,
      leftValue: l.value,
      rightValue: r.value,
      delta: fromMinor(toMinor(l.value) - toMinor(r.value)),
      note: `${l.basis} vs ${r.basis}.`,
    };
  });

  const leftCodes = new Set(left.assumptions.map((a) => a.assumptionCode));
  const rightCodes = new Set(right.assumptions.map((a) => a.assumptionCode));

  return {
    leftCode: left.scenarioCode,
    rightCode: right.scenarioCode,
    driverDeltas,
    assumptionDelta: {
      onlyLeft: [...leftCodes].filter((c) => !rightCodes.has(c)).sort(),
      onlyRight: [...rightCodes].filter((c) => !leftCodes.has(c)).sort(),
    },
  };
}

/** Selects drivers effective at a date. Reuses the platform's inclusive-boundary semantics. */
export function effectiveDrivers(drivers: Driver[], asOf: string): Driver[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new SpecialistError("RULE_VIOLATION", "asOf must be an ISO date (YYYY-MM-DD).");
  }
  return drivers.filter((d) => d.effectiveFrom <= asOf && (!d.effectiveTo || d.effectiveTo >= asOf));
}

/** Selects assumptions effective at a date, excluding retired ones. */
export function effectiveAssumptions(assumptions: Assumption[], asOf: string): Assumption[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new SpecialistError("RULE_VIOLATION", "asOf must be an ISO date (YYYY-MM-DD).");
  }
  return assumptions.filter(
    (a) => a.status !== "RETIRED" && a.effectiveFrom <= asOf && (!a.effectiveTo || a.effectiveTo >= asOf),
  );
}

// ---------------------------------------------------------------------------
// §9 MANAGEMENT REPORTING ENGINE
// ---------------------------------------------------------------------------

export function buildManagementReport(input: {
  reportCode: string;
  periodLabel: string;
  actualsState: { state: string; reason: string };
  variances: VarianceResult[];
  scenarios: Scenario[];
  comparison?: ScenarioComparison;
  dataQuality: DataQualityIssue[];
  riskSignals: RiskSignal[];
  assumptions: Assumption[];
  forecastSummary?: string[];
}): ManagementReport {
  const sections: ReportSection[] = [];

  // FACT section — only genuinely observed material may appear here.
  const factLines: string[] = [];
  if (input.actualsState.state !== "AVAILABLE") {
    factLines.push(`Actual financial data: ${input.actualsState.state} — ${input.actualsState.reason}`);
  }
  const observedVariances = input.variances.filter(
    (v) => v.leftBasis === "OBSERVED" && v.rightBasis === "OBSERVED",
  );
  factLines.push(`${observedVariances.length} comparison(s) rest entirely on observed values.`);
  sections.push({ title: "Observed position", classification: "FACT", lines: factLines });

  if (input.forecastSummary?.length) {
    sections.push({
      title: "Forecast",
      classification: "FORECAST",
      lines: input.forecastSummary,
    });
  }

  const nonObserved = input.variances.filter(
    (v) => v.leftBasis !== "OBSERVED" || v.rightBasis !== "OBSERVED",
  );
  if (nonObserved.length > 0) {
    sections.push({
      title: "Variance analysis involving projected values",
      classification: "FORECAST",
      lines: nonObserved.map(
        (v) =>
          `${v.seriesCode} ${v.periodDate}: ${v.absoluteVariance} (${v.direction}, materiality ${v.materiality}, confidence ${v.confidence})`,
      ),
    });
  }

  if (input.scenarios.length > 0) {
    sections.push({
      title: "Scenarios",
      classification: "SCENARIO",
      lines: input.scenarios.map(
        (s) => `${s.scenarioCode} (${s.kind}, ${s.published ? "published" : "draft"}, v${s.version}): ${s.drivers.length} driver(s)`,
      ),
    });
  }

  if (input.comparison) {
    sections.push({
      title: `Scenario comparison ${input.comparison.leftCode} vs ${input.comparison.rightCode}`,
      classification: "SCENARIO",
      lines: input.comparison.driverDeltas.map(
        (d) => `${d.driverCode}: ${d.leftValue ?? "—"} vs ${d.rightValue ?? "—"} => ${d.delta ?? "n/a"} (${d.note})`,
      ),
    });
  }

  const openAssumptions = input.assumptions.filter((a) => a.status === "OPEN");
  if (openAssumptions.length > 0) {
    sections.push({
      title: "Open assumptions",
      classification: "ASSUMPTION",
      lines: openAssumptions.map((a) => `${a.assumptionCode}: ${a.statement} (owner ${a.owner})`),
    });
  }

  // Recommendations always terminate at RECOMMENDATION or REQUIRES_AUTHORITY. Never EXECUTE.
  const recommendations: ManagementReport["recommendations"] = [];
  if (input.riskSignals.some((s) => s.severity === "HIGH" || s.severity === "CRITICAL")) {
    recommendations.push({
      statement: "Review the high-severity risk signals with the accountable officer.",
      status: "RECOMMENDATION",
      blockedBy: [],
    });
  }
  if (input.actualsState.state !== "AVAILABLE") {
    recommendations.push({
      statement:
        "Actual financial figures cannot be reported until the accounting substrate is ratified and populated.",
      status: "REQUIRES_AUTHORITY",
      blockedBy: ["P1", "P5", "P6", "P7"],
    });
  }
  if (input.variances.some((v) => v.materiality === "REQUIRES_POLICY")) {
    recommendations.push({
      statement: "Ratify a materiality threshold so variance significance can be determined.",
      status: "REQUIRES_AUTHORITY",
      blockedBy: ["P3"],
    });
  }

  const executiveSummary = [
    `Report ${input.reportCode} for ${input.periodLabel}.`,
    `Actual financial data is ${input.actualsState.state}.`,
    `${input.variances.length} variance(s), ${input.scenarios.length} scenario(s), ` +
      `${input.riskSignals.length} risk signal(s), ${input.dataQuality.length} data-quality issue(s).`,
    "This report is management intelligence. It authorises nothing; every recommendation terminates at RECOMMENDATION or REQUIRES_AUTHORITY.",
  ];

  return {
    reportCode: input.reportCode,
    periodLabel: input.periodLabel,
    generatedAt: new Date().toISOString(),
    executiveSummary,
    sections,
    openAssumptions,
    dataQuality: input.dataQuality,
    riskSignals: input.riskSignals,
    recommendations,
  };
}
