/**
 * BEYU OS — Forecasting & Scenario engines (Phase 7H).
 *
 * Pure functions. No database, no principal, no authority — the service layer applies those
 * through the Phase 7B platform.
 *
 * REUSE, NOT REIMPLEMENTATION. Minor-unit money handling comes from the 7D risk engines and the
 * version checksum from the platform's existing `checksumOf`. Re-deriving either would create a
 * second arithmetic free to drift from the first.
 *
 * FIVE INVARIANTS:
 *
 *   1. INSUFFICIENT HISTORY YIELDS NO FORECAST. `points` is null, basis is DATA_NOT_AVAILABLE.
 *      A trend line through one point is a straight line through nothing.
 *   2. NO CONFIDENCE PERCENTAGE. Dispersion is reported; converting it into "83% confident"
 *      implies a ratified error tolerance that does not exist.
 *   3. ASSUMPTIONS NEVER BECOME OBSERVATIONS. Applied assumptions travel alongside the result,
 *      and the observation array is never rewritten.
 *   4. EFFECTIVE DATING IS ENFORCED. A future assumption cannot influence a forecast dated before
 *      it activates; an expired one cannot influence a current forecast.
 *   5. SCENARIOS ARE SCENARIOS. Any point produced under a non-baseline scenario carries basis
 *      SCENARIO, never FORECAST.
 */
import { checksumOf } from "@/lib/crypto";
import { SpecialistError } from "../platform";
import { fromMinor, toMinor } from "../risk/engines";
import type {
  ComposedView,
  ForecastAssumption,
  ForecastBasis,
  ForecastComparison,
  ForecastObservation,
  ForecastPoint,
  ForecastQuality,
  ForecastResult,
  ForecastScenario,
  ForecastVersion,
  PolicyBlockedConcept,
  ProjectionMethod,
  SensitivityResult,
  SourceConflict,
  SourceContribution,
  SpecialistSource,
} from "./model";

export const FORECAST_ENGINE_VERSION = "forecast-2.0.0";

export { fromMinor, toMinor };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Minimum distinct periods required before a method may produce anything.
 *
 * These are structural arithmetic requirements, not policy: a trend needs two points to have a
 * direction, a growth rate needs two to have a ratio. They are not judgements about what
 * constitutes "enough" history for a business decision — that is a governance question this
 * module does not answer.
 */
const MINIMUM_PERIODS: Record<ProjectionMethod, number> = {
  NAIVE_LAST: 1,
  MOVING_AVERAGE: 2,
  LINEAR_TREND: 2,
  RUN_RATE: 1,
  GROWTH_RATE: 2,
};

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE.test(value)) {
    throw new SpecialistError("RULE_VIOLATION", `${label} must be an ISO date (YYYY-MM-DD).`);
  }
}

// ===========================================================================
// 1. DATA QUALITY / HISTORY SUFFICIENCY
// ===========================================================================

export function assessForecastQuality(
  observations: ForecastObservation[],
  method: ProjectionMethod,
): ForecastQuality {
  const minimumRequired = MINIMUM_PERIODS[method];
  const periods = observations.map((o) => o.periodDate);
  const distinct = [...new Set(periods)];

  const duplicatePeriods = [...new Set(periods.filter((p, i) => periods.indexOf(p) !== i))].sort();
  const currencies = new Set(observations.map((o) => o.currency));

  // Gap detection over sorted distinct periods, monthly-agnostic: reports any period absent from
  // an otherwise regular sequence only when spacing is uniform, and stays silent otherwise rather
  // than guessing a frequency.
  const gaps: string[] = [];
  const sorted = [...distinct].sort();
  if (sorted.length >= 3) {
    const deltas = sorted.slice(1).map((d, i) => Date.parse(d) - Date.parse(sorted[i]));
    const first = deltas[0];
    const uniform = deltas.every((d) => Math.abs(d - first) <= 3 * 86_400_000);
    if (!uniform) {
      gaps.push(
        "Observation spacing is irregular; period gaps cannot be identified without a declared frequency.",
      );
    }
  }

  const hasSufficientHistory = distinct.length >= minimumRequired && observations.length > 0;

  return {
    observationCount: observations.length,
    distinctPeriods: distinct.length,
    hasSufficientHistory,
    minimumRequired,
    gaps,
    duplicatePeriods,
    currencyConsistent: currencies.size <= 1,
    confidence: null,
    confidenceBasis: "REQUIRES_POLICY",
    explanation: [
      `${observations.length} observation(s) across ${distinct.length} distinct period(s); ${method} requires at least ${minimumRequired}.`,
      hasSufficientHistory
        ? "Sufficient history exists for the arithmetic to be defined."
        : "Insufficient history: no forecast will be produced, and none should be inferred from this absence.",
      currencies.size > 1
        ? `Observations span ${currencies.size} currencies; aggregation would require the FX decision (P4).`
        : "All observations share a single currency.",
      "No confidence percentage is produced: that would imply a ratified tolerance for forecast error, and none exists.",
    ],
  };
}

// ===========================================================================
// 2. ASSUMPTION EFFECTIVE DATING (§10)
// ===========================================================================

/**
 * Filters assumptions to those effective at `asOf`, inclusive at both bounds.
 * A future assumption cannot affect a present forecast; an expired one cannot persist.
 */
export function selectEffectiveAssumptions(
  assumptions: ForecastAssumption[],
  asOf: string,
): { applied: ForecastAssumption[]; excluded: Array<{ assumptionId: string; reason: string }> } {
  assertIsoDate(asOf, "asOf");
  const applied: ForecastAssumption[] = [];
  const excluded: Array<{ assumptionId: string; reason: string }> = [];

  for (const a of assumptions) {
    assertIsoDate(a.effectiveFrom, `assumption ${a.assumptionId} effectiveFrom`);
    if (a.effectiveTo !== null) assertIsoDate(a.effectiveTo, `assumption ${a.assumptionId} effectiveTo`);

    if (a.effectiveFrom > asOf) {
      excluded.push({
        assumptionId: a.assumptionId,
        reason: `Not yet effective: activates ${a.effectiveFrom}, after the forecast date ${asOf}.`,
      });
      continue;
    }
    if (a.effectiveTo !== null && a.effectiveTo < asOf) {
      excluded.push({
        assumptionId: a.assumptionId,
        reason: `Expired: ceased ${a.effectiveTo}, before the forecast date ${asOf}.`,
      });
      continue;
    }
    applied.push(a);
  }

  return { applied, excluded };
}

/** Validates an assumption's mandatory provenance. Refuses anything unattributable. */
export function assertAssumptionIntegrity(a: ForecastAssumption): void {
  for (const [field, value] of [
    ["assumptionId", a.assumptionId],
    ["source", a.source],
    ["owner", a.owner],
    ["rationale", a.rationale],
  ] as const) {
    if (!value || String(value).trim() === "") {
      throw new SpecialistError(
        "RULE_VIOLATION",
        `Assumption ${a.assumptionId || "(unnamed)"} has no ${field}; an unattributable assumption is refused.`,
      );
    }
  }
  if (a.basis !== "ASSUMPTION") {
    throw new SpecialistError(
      "RULE_VIOLATION",
      `Assumption ${a.assumptionId} declares basis '${a.basis}'. An assumption may never be recorded as observed fact.`,
    );
  }
}

// ===========================================================================
// 3. PROJECTION
// ===========================================================================

function dispersion(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Applies effective assumptions multiplicatively to a projected value. */
function applyAssumptions(baseMinor: number, assumptions: ForecastAssumption[]): number {
  let value = baseMinor;
  for (const a of assumptions) {
    const n = Number(a.value);
    if (!Number.isFinite(n)) {
      throw new SpecialistError("RULE_VIOLATION", `Assumption ${a.assumptionId} has a non-numeric value.`);
    }
    if (a.unit === "PERCENT") value *= 1 + n / 100;
    else if (a.unit === "MULTIPLIER") value *= n;
    else value += toMinor(a.value);
  }
  return value;
}

/**
 * The core projection. Deterministic and replayable: identical inputs always yield identical
 * output, including the version checksum.
 */
export function project(input: {
  seriesCode: string;
  observations: ForecastObservation[];
  method: ProjectionMethod;
  horizon: number;
  asOf: string;
  scenario?: ForecastScenario;
  window?: number;
  actorUserId: string;
  tenantId: string;
  legalEntityId: string | null;
}): ForecastResult {
  const { observations, method, horizon, asOf } = input;
  assertIsoDate(asOf, "asOf");

  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 120) {
    throw new SpecialistError("RULE_VIOLATION", "Horizon must be an integer between 1 and 120.");
  }
  for (const o of observations) {
    if (o.basis !== "OBSERVED") {
      throw new SpecialistError(
        "RULE_VIOLATION",
        `Observation for ${o.periodDate} declares basis '${o.basis}'. A forecast may only be built on observed history.`,
      );
    }
    assertIsoDate(o.periodDate, "observation periodDate");
  }

  const scenarioCode = input.scenario?.scenarioCode ?? "BASELINE";
  const rawAssumptions = input.scenario?.assumptions ?? [];
  for (const a of rawAssumptions) assertAssumptionIntegrity(a);
  const { applied, excluded } = selectEffectiveAssumptions(rawAssumptions, asOf);

  const quality = assessForecastQuality(observations, method);
  const policyDependencies = quality.currencyConsistent ? [] : ["P4"];

  if (!quality.hasSufficientHistory) {
    return {
      seriesCode: input.seriesCode,
      method,
      scenarioCode,
      currency: observations[0]?.currency ?? null,
      horizon,
      points: null,
      basis: "DATA_NOT_AVAILABLE",
      quality,
      version: null,
      appliedAssumptions: applied,
      excludedAssumptions: excluded,
      missingInputs: [
        `${method} requires at least ${quality.minimumRequired} distinct period(s); ${quality.distinctPeriods} available.`,
      ],
      policyDependencies,
      explanation: [
        `No forecast produced for ${input.seriesCode}.`,
        `Insufficient history: ${quality.distinctPeriods} distinct period(s) against a minimum of ${quality.minimumRequired}.`,
        "A projection from insufficient history would be a fabrication wearing the costume of analysis.",
      ],
    };
  }

  if (!quality.currencyConsistent) {
    throw new SpecialistError(
      "RULE_VIOLATION",
      "Observations span multiple currencies. Cross-currency projection requires the FX decision (P4), which is unratified.",
    );
  }

  const ordered = [...observations].sort((a, b) => a.periodDate.localeCompare(b.periodDate));
  const values = ordered.map((o) => toMinor(o.value));
  const band = dispersion(values);
  const currency = ordered[0].currency;

  const points: ForecastPoint[] = [];
  for (let step = 1; step <= horizon; step += 1) {
    let projected: number;

    switch (method) {
      case "NAIVE_LAST":
      case "RUN_RATE": {
        // RUN_RATE differs from NAIVE_LAST only in intent; both carry the last observed level
        // forward. No annualisation is applied, because annualising embeds a period convention.
        projected = values[values.length - 1];
        break;
      }
      case "MOVING_AVERAGE": {
        const w = input.window ?? Math.min(3, values.length);
        if (!Number.isInteger(w) || w < 1 || w > values.length) {
          throw new SpecialistError("RULE_VIOLATION", "Moving-average window must be between 1 and the observation count.");
        }
        const slice = values.slice(-w);
        projected = slice.reduce((a, b) => a + b, 0) / slice.length;
        break;
      }
      case "LINEAR_TREND": {
        // Ordinary least squares over the index. Pure arithmetic; embeds no accounting judgement.
        const n = values.length;
        const meanX = (n - 1) / 2;
        const meanY = values.reduce((a, b) => a + b, 0) / n;
        let num = 0;
        let den = 0;
        for (let i = 0; i < n; i += 1) {
          num += (i - meanX) * (values[i] - meanY);
          den += (i - meanX) ** 2;
        }
        const slope = den === 0 ? 0 : num / den;
        projected = meanY + slope * (n - 1 + step - meanX);
        break;
      }
      case "GROWTH_RATE": {
        const first = values[0];
        const last = values[values.length - 1];
        if (first === 0) {
          throw new SpecialistError("RULE_VIOLATION", "Growth rate is undefined when the first observation is zero.");
        }
        const periods = values.length - 1;
        const rate = (last / first) ** (1 / periods);
        projected = last * rate ** step;
        break;
      }
      default:
        throw new SpecialistError("RULE_VIOLATION", `Unknown projection method '${method}'.`);
    }

    const withAssumptions = applyAssumptions(projected, applied);

    points.push({
      step,
      periodDate: null,
      value: fromMinor(withAssumptions),
      lowerBound: fromMinor(withAssumptions - band),
      upperBound: fromMinor(withAssumptions + band),
      // Any non-baseline scenario yields SCENARIO, never FORECAST.
      basis: scenarioCode === "BASELINE" && applied.length === 0 ? "FORECAST" : "SCENARIO",
    });
  }

  const version = buildVersion({
    method, scenarioCode, horizon, observations: ordered, assumptions: applied,
    actorUserId: input.actorUserId, tenantId: input.tenantId, legalEntityId: input.legalEntityId,
    asOf,
  });

  return {
    seriesCode: input.seriesCode,
    method,
    scenarioCode,
    currency,
    horizon,
    points,
    basis: points[0].basis,
    quality,
    version,
    appliedAssumptions: applied,
    excludedAssumptions: excluded,
    missingInputs: [],
    policyDependencies,
    explanation: [
      `${horizon}-step ${method} projection for ${input.seriesCode} from ${ordered.length} observation(s).`,
      applied.length > 0
        ? `${applied.length} assumption(s) applied; the result is a SCENARIO, not a forecast of what will happen.`
        : "No assumptions applied; the result is an arithmetic extrapolation of observed history only.",
      excluded.length > 0 ? `${excluded.length} assumption(s) excluded by effective dating.` : "No assumptions were excluded.",
      "Bounds reflect historical dispersion. They are not a probability that the outcome falls within them.",
    ],
  };
}

// ===========================================================================
// 4. VERSION IDENTITY (§11) — no new persistence
// ===========================================================================

/**
 * Deterministic version identity, computed with the platform's existing `checksumOf`.
 *
 * Nothing is stored, so no historical forecast can be overwritten — the strongest possible form of
 * historical immutability, achieved by adding no table and no migration.
 */
export function buildVersion(input: {
  method: ProjectionMethod;
  scenarioCode: string;
  horizon: number;
  observations: ForecastObservation[];
  assumptions: ForecastAssumption[];
  actorUserId: string;
  tenantId: string;
  legalEntityId: string | null;
  asOf: string;
}): ForecastVersion {
  const sourceSnapshotChecksum = checksumOf(
    input.observations.map((o) => [o.seriesCode, o.periodDate, o.value, o.currency, o.sourceType, o.sourceId]),
  );
  const assumptionsChecksum = checksumOf(
    input.assumptions.map((a) => [a.assumptionId, a.value, a.unit, a.effectiveFrom, a.effectiveTo]),
  );

  return {
    versionId: checksumOf([
      FORECAST_ENGINE_VERSION, input.method, input.scenarioCode, input.horizon,
      sourceSnapshotChecksum, assumptionsChecksum, input.tenantId, input.legalEntityId, input.asOf,
    ]),
    engineVersion: FORECAST_ENGINE_VERSION,
    method: input.method,
    scenarioCode: input.scenarioCode,
    horizon: input.horizon,
    sourceSnapshotChecksum,
    assumptionsChecksum,
    // asOf, not wall-clock: the version must be reproducible on replay.
    producedAt: input.asOf,
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
  };
}

// ===========================================================================
// 5. SENSITIVITY, COMPARISON, STRESS
// ===========================================================================

/** Shifts each assumption independently and reports the effect. Every variation is a SCENARIO. */
export function sensitivityAnalysis(
  base: Parameters<typeof project>[0],
  shiftPercent: number,
): SensitivityResult {
  if (!Number.isFinite(shiftPercent)) {
    throw new SpecialistError("RULE_VIOLATION", "shiftPercent must be a finite number.");
  }
  const baseline = project(base);
  if (!baseline.points) {
    return {
      seriesCode: base.seriesCode,
      variations: [],
      baselineFinalValue: null,
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No baseline forecast exists, so sensitivity cannot be measured."],
    };
  }

  const baselineFinal = baseline.points[baseline.points.length - 1].value;
  const assumptions = base.scenario?.assumptions ?? [];

  const variations = assumptions.map((a) => {
    const shifted: ForecastAssumption = {
      ...a,
      value: String(Number(a.value) * (1 + shiftPercent / 100)),
    };
    const result = project({
      ...base,
      scenario: {
        ...base.scenario!,
        assumptions: assumptions.map((x) => (x.assumptionId === a.assumptionId ? shifted : x)),
      },
    });
    const finalValue = result.points?.[result.points.length - 1].value ?? null;
    return {
      assumptionId: a.assumptionId,
      label: a.label,
      shiftPercent: shiftPercent.toFixed(2),
      resultingFinalValue: finalValue,
      deltaFromBaseline: finalValue ? fromMinor(toMinor(finalValue) - toMinor(baselineFinal)) : null,
    };
  });

  return {
    seriesCode: base.seriesCode,
    variations,
    baselineFinalValue: baselineFinal,
    basis: "SCENARIO",
    explanation: [
      `${variations.length} assumption(s) shifted by ${shiftPercent}% independently.`,
      assumptions.length === 0
        ? "No assumptions were supplied, so there is nothing to be sensitive to. This is not a finding of robustness."
        : "Each variation is a SCENARIO. None is a prediction.",
    ],
  };
}

/** Compares final values across scenarios. Never nominates a preferred scenario. */
export function compareScenarios(
  base: Omit<Parameters<typeof project>[0], "scenario">,
  scenarios: ForecastScenario[],
): ForecastComparison {
  if (scenarios.length === 0) {
    return {
      scenarioCodes: [],
      perScenarioFinalValue: [],
      spread: null,
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No scenarios supplied to compare."],
    };
  }

  const results = scenarios.map((s) => {
    const r = project({ ...base, scenario: s });
    return {
      scenarioCode: s.scenarioCode,
      finalValue: r.points?.[r.points.length - 1].value ?? null,
      basis: r.basis,
    };
  });

  const finals = results.map((r) => r.finalValue).filter((v): v is string => v !== null).map(toMinor);
  const spread = finals.length >= 2 ? fromMinor(Math.max(...finals) - Math.min(...finals)) : null;

  return {
    scenarioCodes: scenarios.map((s) => s.scenarioCode),
    perScenarioFinalValue: results,
    spread,
    basis: finals.length === 0 ? "DATA_NOT_AVAILABLE" : "SCENARIO",
    explanation: [
      `${results.length} scenario(s) compared.`,
      spread ? `Spread between highest and lowest final value: ${spread}.` : "Spread undefined: fewer than two scenarios produced a value.",
      "No scenario is identified as most likely. Selecting one is a management judgement, not a computation.",
    ],
  };
}

/** Stress test: applies a downside multiplier as an explicit, attributed scenario. */
export function stressTest(
  base: Omit<Parameters<typeof project>[0], "scenario">,
  stress: { code: string; multiplier: number; owner: string; rationale: string; asOf: string },
): ForecastResult {
  if (!Number.isFinite(stress.multiplier) || stress.multiplier < 0) {
    throw new SpecialistError("RULE_VIOLATION", "Stress multiplier must be a non-negative finite number.");
  }
  if (!stress.owner?.trim() || !stress.rationale?.trim()) {
    throw new SpecialistError("RULE_VIOLATION", "A stress test requires an owner and a rationale.");
  }

  const assumption: ForecastAssumption = {
    assumptionId: `STRESS_${stress.code}`,
    label: `Stress ${stress.code}`,
    value: String(stress.multiplier),
    unit: "MULTIPLIER",
    source: "CALLER_SUPPLIED_STRESS_TEST",
    owner: stress.owner,
    createdAt: stress.asOf,
    effectiveFrom: stress.asOf,
    effectiveTo: null,
    rationale: stress.rationale,
    tenantId: base.tenantId,
    legalEntityId: base.legalEntityId,
    basis: "ASSUMPTION",
  };

  return project({
    ...base,
    scenario: {
      scenarioCode: stress.code,
      kind: "STRESS",
      label: `Stress ${stress.code}`,
      owner: stress.owner,
      createdAt: stress.asOf,
      tenantId: base.tenantId,
      legalEntityId: base.legalEntityId,
      assumptions: [assumption],
      rationale: stress.rationale,
    },
  });
}

/**
 * Reconciles a forecast against later observations.
 * Reports divergence; never rewrites the forecast to match, and never rewrites the actuals.
 */
export function reconcileForecast(
  forecast: ForecastResult,
  actuals: ForecastObservation[],
): {
  comparisons: Array<{ step: number; forecastValue: string; actualValue: string; variance: string }>;
  basis: Extract<ForecastBasis, "DERIVED" | "DATA_NOT_AVAILABLE"> | "OBSERVED";
  explanation: string[];
} {
  if (!forecast.points || actuals.length === 0) {
    return {
      comparisons: [],
      basis: "DATA_NOT_AVAILABLE",
      explanation: [
        !forecast.points
          ? "No forecast points exist to reconcile."
          : "No actuals supplied to reconcile against.",
      ],
    };
  }

  const ordered = [...actuals].sort((a, b) => a.periodDate.localeCompare(b.periodDate));
  const comparisons = forecast.points.slice(0, ordered.length).map((p, i) => ({
    step: p.step,
    forecastValue: p.value,
    actualValue: ordered[i].value,
    variance: fromMinor(toMinor(ordered[i].value) - toMinor(p.value)),
  }));

  return {
    comparisons,
    basis: "OBSERVED",
    explanation: [
      `${comparisons.length} forecast step(s) reconciled against observed actuals.`,
      "Variance is reported. The forecast is not adjusted to fit, and the actuals are never adjusted at all.",
    ],
  };
}

// ===========================================================================
// 6. POLICY BOUNDARY (§6)
// ===========================================================================

/**
 * Concepts a forecasting module would conventionally compute, each blocked for want of a ratified
 * measurement basis. Returned explicitly so their absence is visibly deliberate.
 */
export function policyBlockedConcepts(): PolicyBlockedConcept[] {
  const block = (
    concept: PolicyBlockedConcept["concept"],
    blockingDecisions: string[],
    explanation: string,
  ): PolicyBlockedConcept => ({ concept, basis: "REQUIRES_AUTHORITY", blockingDecisions, explanation });

  return [
    block("REVENUE_RECOGNITION", ["P1"], "When revenue is earned is a recognition policy; no ratified basis exists."),
    block("EXPENSE_RECOGNITION", ["P1"], "Matching and accrual treatment require a ratified recognition policy."),
    block("DEPRECIATION", ["P1", "P5"], "Useful life and method are measurement policy, not arithmetic."),
    block("IMPAIRMENT", ["P1", "P5"], "Impairment requires a ratified measurement and trigger basis."),
    block("TAX_LIABILITY", ["P3"], "An authoritative tax liability requires ratified tax treatment; no rate is invented here."),
    block("FX_TRANSLATION", ["P4"], "No FX rate source is ratified, and the seeded balances imply inconsistent rates."),
    block("EBITDA", ["P1"], "EBITDA depends on which items are excluded — a definitional policy choice."),
    block("NET_INCOME", ["P1"], "Net income aggregates recognition judgements that are unratified."),
    block("WORKING_CAPITAL", ["P1"], "Classification of current vs non-current is an accounting policy."),
    block("VALUATION", ["P2"], "A valuation basis (fair value, cost, other) has not been ratified."),
    block("PROVISIONING", ["P1", "P2"], "Provisioning requires ratified recognition and measurement criteria."),
  ];
}

// ===========================================================================
// 7. CROSS-SPECIALIST COMPOSITION (§8)
// ===========================================================================

/**
 * Composes contributions from multiple specialists WITHOUT flattening them.
 *
 * Each contribution keeps its own basis and provenance. Any conflict forces the composed basis to
 * DATA_CONFLICT — there is deliberately no field in which a "winning" source could be recorded,
 * so silent resolution is structurally impossible rather than merely discouraged.
 */
export function composeSources(input: {
  asOf: string;
  tenantId: string;
  legalEntityId: string | null;
  contributions: SourceContribution[];
  withheldRecordCount?: number;
}): ComposedView {
  assertIsoDate(input.asOf, "asOf");

  const unavailableSources = input.contributions.filter((c) => !c.available).map((c) => c.source);
  const available = input.contributions.filter((c) => c.available);
  const conflicts = detectConflicts(available);

  let basis: ForecastBasis;
  if (conflicts.length > 0) basis = "DATA_CONFLICT";
  else if (available.length === 0) basis = "DATA_NOT_AVAILABLE";
  else basis = "OBSERVED";

  return {
    asOf: input.asOf,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    contributions: input.contributions,
    conflicts,
    unavailableSources,
    basis,
    withheldRecordCount: input.withheldRecordCount ?? 0,
    explanation: [
      `${available.length} of ${input.contributions.length} source(s) available.`,
      unavailableSources.length > 0
        ? `Unavailable: ${unavailableSources.join(", ")}. Their absence is reported, not treated as zero.`
        : "All requested sources contributed.",
      conflicts.length > 0
        ? `${conflicts.length} conflict(s) detected between sources. No source is preferred; resolution is a governance decision.`
        : "No conflicts detected between the contributing sources.",
      "Each source retains its own provenance. No synthetic combined truth is created.",
    ],
  };
}

/**
 * Detects disagreements between sources reporting on the same quantity.
 *
 * Only structural comparisons are made — two sources reporting a different count for the same
 * named quantity. No tolerance is applied, because "close enough" is a policy judgement.
 */
export function detectConflicts(contributions: SourceContribution[]): SourceConflict[] {
  const conflicts: SourceConflict[] = [];
  const byKey = new Map<string, Array<{ source: SpecialistSource; value: string | number | null }>>();

  for (const c of contributions) {
    for (const [key, value] of Object.entries(c.summary)) {
      byKey.set(key, [...(byKey.get(key) ?? []), { source: c.source, value }]);
    }
  }

  for (const [key, entries] of byKey) {
    const reported = entries.filter((e) => e.value !== null);
    if (reported.length < 2) continue;
    const distinct = new Set(reported.map((e) => String(e.value)));
    if (distinct.size > 1) {
      conflicts.push({
        code: `CONFLICT_${key.toUpperCase()}`,
        sources: reported.map((e) => e.source),
        detail:
          `Sources disagree on '${key}': ${reported.map((e) => `${e.source}=${String(e.value)}`).join(", ")}. ` +
          "No source is treated as authoritative; this requires governance review.",
        requiresGovernanceReview: true,
      });
    }
  }

  return conflicts.sort((a, b) => a.code.localeCompare(b.code));
}
