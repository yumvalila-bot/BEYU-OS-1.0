/**
 * BEYU OS — VALUATION ENGINE.
 *
 * FINANCE_OS → Investment & Capital Management → Valuation & Analytics → Valuation.
 *
 * =============================== WHAT THIS IS ================================
 *
 * A reusable, deterministic valuation layer supporting discounted cash flow, trading and transaction
 * multiples, revenue/EBITDA/P-E/P-S multiples, free-cash-flow yield and ROIC analysis — with scenario
 * management, sensitivity grids and versioned assumptions.
 *
 * Everything here is a pure function of its inputs. There is no clock, no randomness and no default
 * assumption anywhere: a DCF that silently supplies 8% WACC because none was given has invented the
 * most important number in the model. Absent assumptions are MISSING.
 *
 * ============================ THE THREE HARD RULES ===========================
 *
 *  1. NO AI-DRIVEN ASSUMPTION CHANGE. Assumptions arrive from a governed, versioned
 *     `ValuationAssumptionSet`. `applyAssumptionOverride` records WHO changed WHAT and REQUIRES a
 *     reason; a model whose inputs changed cannot produce a result that looks like an unchanged
 *     model. `assumptionFingerprint` gives each set a stable identity, so two runs are comparable
 *     only when their fingerprints match.
 *
 *  2. SCENARIOS ARE LABELLED. Base, upside, downside and custom scenarios carry an explicit
 *     `scenarioKind`. A downside result is never presented as the base case, and a scenario is never
 *     `VERIFIED` — it is SCENARIO/FORECAST by construction.
 *
 *  3. DISCOUNTING USES THE CANONICAL NPV. Terminal value is discounted by the same
 *     `npvMinor` used everywhere else in BEYU OS, so a DCF cannot disagree with a project NPV by a
 *     rounding convention.
 *
 * Accounting conventions, all stated on the result:
 *   - FCF = NOPAT + D&A − Capex − ΔNWC   (unlevered free cash flow; the discount rate is WACC)
 *   - NOPAT = EBIT × (1 − tax)           (tax only charged against positive EBIT)
 *   - Terminal value: Gordon growth, or an exit EV/EBITDA multiple applied to the final-year EBITDA
 */
import {
  BPS_BASE,
  FinanceArithmeticError,
  assertMoney,
  assertPercent,
  formatMultiple,
  multiple,
  npvMinor,
} from "./arithmetic";
import type { MetricInput, MetricOutcome, MetricSeedBase, SourceQuality } from "./provenance";
import { calculated, estimated, invalid, missing, notApplicable, seedFor } from "./provenance";

/**
 * Provenance stamp for this engine: every outcome records the engine's own valuation calculation version,
 * so a stored metric can always be traced back to the code and assumptions that produced it.
 */
const seedForEngine = (...args: Parameters<typeof seedFor>) =>
  seedFor(args[0], args[1], args[2], args[3], {
    ...(args[4] ?? {}),
    calculationVersion: VALUATION_ENGINE_VERSION,
  });

export const VALUATION_ENGINE_VERSION = "valuation-engine-1.0.0";

/* ------------------------------------------------------------------ */
/* Assumption sets — versioned and fingerprinted                       */
/* ------------------------------------------------------------------ */

/**
 * One versioned assumption used by a model.
 *
 * `kind` distinguishes a measured input from a chosen one. A model built on ASSUMPTION inputs cannot
 * produce a VERIFIED result, and the fingerprint covers kind and provenance as well as value, so
 * swapping a sourced figure for a guess changes the model identity.
 */
export type ValuationAssumption = {
  key: string;
  /** Exact decimal or integer value as a string. */
  value: string;
  unit: string;
  kind: "OBSERVED" | "DERIVED" | "ASSUMPTION" | "POLICY";
  source: string;
  sourceTimestamp?: string | null;
};

export type ValuationAssumptionSet = {
  /** Model this set belongs to. */
  modelId: string;
  /** Monotonically increasing version. A change MUST bump this. */
  version: number;
  /** Who authored this version. A GlobalUserID or a service principal — never a client string. */
  authoredBy: string;
  /** When the version was authored (ISO-8601). */
  authoredAt: string;
  scenarioKind: ValuationScenarioKind;
  assumptions: readonly ValuationAssumption[];
  /** Free-text rationale. Required for any non-base scenario. */
  rationale?: string | null;
};

export const VALUATION_SCENARIO_KIND = ["BASE", "UPSIDE", "DOWNSIDE", "CUSTOM"] as const;
export type ValuationScenarioKind = (typeof VALUATION_SCENARIO_KIND)[number];

export const SENSITIVITY_AXES = ["WACC", "TERMINAL_GROWTH", "EXIT_MULTIPLE", "REVENUE_GROWTH", "EBITDA_MARGIN"] as const;
export type SensitivityAxis = (typeof SENSITIVITY_AXES)[number];

/**
 * Stable fingerprint of an assumption set.
 *
 * Two runs whose fingerprints differ did not use the same model, whatever their scenario labels say.
 * The fingerprint is a deterministic fold over the canonical ordering, so it does not depend on Map
 * iteration order or on property order in source.
 */
export function assumptionFingerprint(set: ValuationAssumptionSet): string {
  const ordered = [...set.assumptions].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const payload = [
    set.modelId,
    `v${set.version}`,
    set.scenarioKind,
    ...ordered.map((a) => `${a.key}=${a.value}|${a.unit}|${a.kind}|${a.source}`),
  ].join("\n");
  // FNV-1a (64-bit emulated in 32-bit halves) keeps this dependency-free and browser-safe. It is an
  // identity check, not a cryptographic commitment; the audit ledger provides integrity.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i += 1) {
    const c = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  return `vf1_${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/**
 * Produce a NEW assumption set with one value overridden.
 *
 * The previous version is never mutated. The override must be attributed to a human or service and
 * must carry a reason: "why did WACC move from 9.0% to 11.0% between run 4 and run 5?" is the question
 * an investment committee asks, and a model that cannot answer it is not auditable.
 */
export function applyAssumptionOverride(
  set: ValuationAssumptionSet,
  params: { key: string; value: string; authoredBy: string; authoredAt: string; reason: string },
): ValuationAssumptionSet {
  if (!params.reason || params.reason.trim().length < 8) {
    throw new FinanceArithmeticError("INVALID_RATIO", "An assumption override requires a reason of at least 8 characters. Silent assumption changes are not permitted.", {
      key: params.key,
    });
  }
  if (!params.authoredBy) {
    throw new FinanceArithmeticError("INVALID_RATIO", "An assumption override must be attributed to an authenticated actor.", { key: params.key });
  }
  const existing = set.assumptions.find((a) => a.key === params.key);
  if (!existing) {
    throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", `Assumption '${params.key}' does not exist in model ${set.modelId}; overrides cannot create new assumptions implicitly.`, {
      key: params.key,
    });
  }
  const next = set.assumptions.map((a) =>
    a.key === params.key
      ? { ...a, value: params.value, kind: "ASSUMPTION" as const, source: `override by ${params.authoredBy}: ${params.reason}`, sourceTimestamp: params.authoredAt }
      : a,
  );
  return { ...set, version: set.version + 1, authoredBy: params.authoredBy, authoredAt: params.authoredAt, assumptions: next };
}

function readAssumption(set: ValuationAssumptionSet, key: string): number | null {
  const found = set.assumptions.find((a) => a.key === key);
  if (!found || found.value === null || found.value.trim() === "") return null;
  const raw = found.value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new FinanceArithmeticError("INVALID_RATIO", `Assumption '${key}' is not a decimal value.`, { key, value: found.value });
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new FinanceArithmeticError("INVALID_RATIO", `Assumption '${key}' is outside the representable range.`, { key });
  }
  return value;
}

function readBps(set: ValuationAssumptionSet, key: string, { allowNegative = true }: { allowNegative?: boolean } = {}): number | null {
  const value = readAssumption(set, key);
  if (value === null) return null;
  const bps = Math.round(value * (Number.isInteger(value) ? 1 : 1)); // values are already bps integers
  assertPercent(bps, key, { allowNegative });
  return bps;
}

function readMoney(set: ValuationAssumptionSet, key: string): number | null {
  const value = readAssumption(set, key);
  if (value === null) return null;
  if (!Number.isInteger(value)) {
    throw new FinanceArithmeticError("INVALID_MONEY", `Assumption '${key}' must be integer minor units, received ${value}.`, { key });
  }
  assertMoney(value, key);
  return value;
}

function assumptionInputs(set: ValuationAssumptionSet, keys: readonly string[]): MetricInput[] {
  return keys.map((key) => {
    const found = set.assumptions.find((a) => a.key === key);
    return {
      name: key,
      value: found?.value ?? null,
      unit: found?.unit ?? "UNKNOWN",
      kind: found?.kind ?? "ASSUMPTION",
      source: found?.source ?? "assumption absent from the set",
      sourceTimestamp: found?.sourceTimestamp ?? null,
      period: null,
      currency: null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* DCF                                                                 */
/* ------------------------------------------------------------------ */

export const TERMINAL_METHOD = ["GORDON_GROWTH", "EXIT_MULTIPLE"] as const;
export type TerminalMethod = (typeof TERMINAL_METHOD)[number];

export type DcfInputs = {
  /** Starting (last actual) revenue, integer minor units. */
  baseRevenueMinor: number;
  /** Revenue growth per forecast year, in basis points. Length = forecast years. */
  revenueGrowthBps: readonly number[];
  /** EBITDA margin per forecast year, in basis points. Length MUST equal revenue growth length. */
  ebitdaMarginBps: readonly number[];
  /** D&A as a percentage of that year's revenue. */
  depreciationAmortisationBps: number;
  /** Capex as a percentage of that year's revenue. */
  capexBps: number;
  /** Change in net working capital as a percentage of the REVENUE CHANGE (the standard convention). */
  workingCapitalBps: number;
  effectiveTaxRateBps: number;
  waccBps: number;
  terminalMethod: TerminalMethod;
  /** Required for GORDON_GROWTH. Must be strictly below WACC. */
  terminalGrowthBps?: number | null;
  /** Required for EXIT_MULTIPLE, as a fixed-point multiple scaled by 10^6. */
  exitEvEbitdaScaled?: number | null;
  /** Balance-sheet bridge to equity value. */
  netDebtMinor: number;
  sharesOutstanding: number;
  /** Preferred equity and minority interest to deduct before equity value. */
  preferredEquityMinor?: number;
  minorityInterestMinor?: number;
};

export type DcfYear = {
  year: number;
  revenueMinor: number;
  revenueGrowthBps: number;
  ebitdaMarginBps: number;
  ebitdaMinor: number;
  depreciationAmortisationMinor: number;
  ebitMinor: number;
  taxMinor: number;
  nopatMinor: number;
  capexMinor: number;
  workingCapitalChangeMinor: number;
  freeCashFlowMinor: number;
  discountFactorScaled: number;
  presentValueMinor: number;
};

export type DcfResult = {
  years: DcfYear[];
  terminalValueMinor: number;
  terminalPresentValueMinor: number;
  enterpriseValueMinor: number;
  equityValueMinor: number;
  impliedSharePriceMinorPerShare: number | null;
  netDebtUsedMinor: number;
  method: string;
  fingerprint: string;
  scenarioKind: ValuationScenarioKind;
};

export type DcfOutcome = MetricOutcome<DcfResult>;

/** Validate structural consistency before any arithmetic. Unknown/ill-formed input THROWS. */
function assertDcfInputs(inputs: DcfInputs): void {
  if (!Number.isSafeInteger(inputs.baseRevenueMinor) || inputs.baseRevenueMinor <= 0) {
    throw new FinanceArithmeticError("INVALID_MONEY", "DCF requires a positive base revenue in integer minor units.", { baseRevenueMinor: inputs.baseRevenueMinor });
  }
  if (inputs.revenueGrowthBps.length === 0) {
    throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", "A DCF requires at least one forecast year.", {});
  }
  if (inputs.revenueGrowthBps.length !== inputs.ebitdaMarginBps.length) {
    throw new FinanceArithmeticError(
      "INSUFFICIENT_INPUTS",
      `The DCF requires one EBITDA margin per forecast year: received ${inputs.revenueGrowthBps.length} growth rates and ${inputs.ebitdaMarginBps.length} margins.`,
      {},
    );
  }
  inputs.revenueGrowthBps.forEach((bps, i) => assertPercent(bps, `revenueGrowthBps[${i}]`, { allowNegative: true }));
  inputs.ebitdaMarginBps.forEach((bps, i) => assertPercent(bps, `ebitdaMarginBps[${i}]`, { allowNegative: true }));
  assertPercent(inputs.depreciationAmortisationBps, "depreciationAmortisationBps");
  assertPercent(inputs.capexBps, "capexBps");
  assertPercent(inputs.workingCapitalBps, "workingCapitalBps");
  assertPercent(inputs.effectiveTaxRateBps, "effectiveTaxRateBps");
  assertPercent(inputs.waccBps, "waccBps");
  assertMoney(inputs.netDebtMinor, "netDebtMinor");
  assertMoney(inputs.sharesOutstanding, "sharesOutstanding", { allowNegative: false });
  if (inputs.preferredEquityMinor !== undefined) assertMoney(inputs.preferredEquityMinor, "preferredEquityMinor", { allowNegative: false });
  if (inputs.minorityInterestMinor !== undefined) assertMoney(inputs.minorityInterestMinor, "minorityInterestMinor", { allowNegative: false });
  if (inputs.terminalMethod === "GORDON_GROWTH") {
    if (inputs.terminalGrowthBps === null || inputs.terminalGrowthBps === undefined) {
      throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", "Gordon-growth terminal value requires a terminal growth rate.", {});
    }
    assertPercent(inputs.terminalGrowthBps, "terminalGrowthBps");
  } else if (inputs.exitEvEbitdaScaled === null || inputs.exitEvEbitdaScaled === undefined) {
    throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", "EXIT_MULTIPLE terminal value requires an exit EV/EBITDA multiple.", {});
  } else {
    if (!Number.isSafeInteger(inputs.exitEvEbitdaScaled) || inputs.exitEvEbitdaScaled <= 0) {
      throw new FinanceArithmeticError("INVALID_MULTIPLE", "The exit multiple must be a positive fixed-point multiple.", { exitEvEbitdaScaled: inputs.exitEvEbitdaScaled });
    }
  }
}

/**
 * Discounted cash flow.
 *
 * The full model is returned, year by year, not just the enterprise value: a valuation whose
 * intermediate lines are hidden cannot be reviewed, and §6 requires every input to be exposed.
 *
 * Economically impossible models are REFUSED rather than computed:
 *   - WACC ≤ terminal growth  → the Gordon formula has no finite sum
 *   - WACC ≤ −100%            → discounting is undefined
 *   - no forecast years       → there is nothing to discount
 * A REFUSED model returns `INVALID` with the reason; it never returns a very large number.
 */
export function discountedCashFlow(params: {
  seed: MetricSeedBase;
  assumptions: ValuationAssumptionSet;
  inputs: DcfInputs;
  /** Currency of every monetary input. Required: a DCF cannot mix currencies silently. */
  currency: string;
  quality?: SourceQuality;
}): DcfOutcome {
  const { inputs } = params;
  const method =
    inputs.terminalMethod === "GORDON_GROWTH"
      ? `DCF, unlevered FCF = NOPAT + D&A − Capex − ΔNWC, discounted at WACC with a Gordon-growth terminal value; equity bridge deducts net debt, preferred equity and minority interest`
      : `DCF, unlevered FCF = NOPAT + D&A − Capex − ΔNWC, discounted at WACC with an exit EV/EBITDA terminal value; equity bridge deducts net debt, preferred equity and minority interest`;

  const inputList: MetricInput[] = [
    { name: "baseRevenueMinor", value: String(inputs.baseRevenueMinor), unit: params.currency, kind: "OBSERVED", source: "caller-supplied last actual revenue", period: null, currency: params.currency },
    { name: "revenueGrowthBps", value: inputs.revenueGrowthBps.join(","), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${params.assumptions.modelId} v${params.assumptions.version}`, period: null, currency: null },
    { name: "ebitdaMarginBps", value: inputs.ebitdaMarginBps.join(","), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${params.assumptions.modelId} v${params.assumptions.version}`, period: null, currency: null },
    { name: "depreciationAmortisationBps", value: String(inputs.depreciationAmortisationBps), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${params.assumptions.modelId} v${params.assumptions.version}`, period: null, currency: null },
    { name: "capexBps", value: String(inputs.capexBps), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${params.assumptions.modelId} v${params.assumptions.version}`, period: null, currency: null },
    { name: "workingCapitalBps", value: String(inputs.workingCapitalBps), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${params.assumptions.modelId} v${params.assumptions.version}`, period: null, currency: null },
    { name: "effectiveTaxRateBps", value: String(inputs.effectiveTaxRateBps), unit: "BASIS_POINTS", kind: "POLICY", source: `model ${params.assumptions.modelId} v${params.assumptions.version}`, period: null, currency: null },
    { name: "waccBps", value: String(inputs.waccBps), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${params.assumptions.modelId} v${params.assumptions.version}`, period: null, currency: null },
    { name: "terminalMethod", value: inputs.terminalMethod, unit: "ENUM", kind: "POLICY", source: "caller-declared terminal method", period: null, currency: null },
    { name: "terminalGrowthBps", value: inputs.terminalGrowthBps === null || inputs.terminalGrowthBps === undefined ? null : String(inputs.terminalGrowthBps), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${params.assumptions.modelId} v${params.assumptions.version}`, period: null, currency: null },
    { name: "exitEvEbitdaScaled", value: inputs.exitEvEbitdaScaled === null || inputs.exitEvEbitdaScaled === undefined ? null : String(inputs.exitEvEbitdaScaled), unit: "MULTIPLE_X1E6", kind: "ASSUMPTION", source: `model ${params.assumptions.modelId} v${params.assumptions.version}`, period: null, currency: null },
    { name: "netDebtMinor", value: String(inputs.netDebtMinor), unit: params.currency, kind: "OBSERVED", source: "caller-supplied balance-sheet bridge", period: null, currency: params.currency },
    { name: "sharesOutstanding", value: String(inputs.sharesOutstanding), unit: "SHARES", kind: "OBSERVED", source: "caller-supplied share count", period: null, currency: null },
    { name: "scenarioKind", value: params.assumptions.scenarioKind, unit: "ENUM", kind: "POLICY", source: `assumption set ${params.assumptions.modelId} v${params.assumptions.version}`, period: null, currency: null },
    { name: "assumptionFingerprint", value: assumptionFingerprint(params.assumptions), unit: "FINGERPRINT", kind: "DERIVED", source: "valuation-engine", period: null, currency: null },
  ];

  const seed = () =>
    seedForEngine(params.seed, "FIN.VALUATION.DCF", method, inputList, {
      period: `${inputs.revenueGrowthBps.length}Y forecast`,
      currency: params.currency,
      sourceTimestamp: params.assumptions.authoredAt,
      quality: params.quality ?? "MANAGEMENT",
    });

  assertDcfInputs(inputs);

  if (inputs.waccBps <= -BPS_BASE) {
    return invalid(seed(), "The discount rate is −100% or lower, so discounting is undefined.");
  }
  if (inputs.terminalMethod === "GORDON_GROWTH" && (inputs.terminalGrowthBps as number) >= inputs.waccBps) {
    return invalid(
      seed(),
      `Terminal growth (${inputs.terminalGrowthBps} bps) is not below the discount rate (${inputs.waccBps} bps). The Gordon-growth terminal value has no finite sum in that regime, so the model is refused rather than reported as a very large number.`,
    );
  }

  const years: DcfYear[] = [];
  let revenue = inputs.baseRevenueMinor;
  const flows: number[] = [0]; // t=0 placeholder: the DCF values a stream starting at year 1.

  for (let i = 0; i < inputs.revenueGrowthBps.length; i += 1) {
    const growthBps = inputs.revenueGrowthBps[i];
    const marginBps = inputs.ebitdaMarginBps[i];
    const priorRevenue = revenue;
    revenue = Math.round((priorRevenue * (BPS_BASE + growthBps)) / BPS_BASE);
    assertMoney(revenue, `revenue[year ${i + 1}]`);
    if (revenue <= 0) {
      return invalid(
        seed(),
        `The forecast implies non-positive revenue in year ${i + 1}. A DCF through a negative revenue year is not meaningful; revise the growth assumptions.`,
      );
    }

    const ebitda = Math.round((revenue * marginBps) / BPS_BASE);
    const da = Math.round((revenue * inputs.depreciationAmortisationBps) / BPS_BASE);
    const ebit = ebitda - da;
    // Tax is charged only against positive EBIT. A loss year does not generate a cash refund, because
    // assuming immediate loss relief would require a jurisdiction's carry-back rules, which this
    // engine does not hold (§4: never fabricate).
    const tax = ebit > 0 ? Math.round((ebit * inputs.effectiveTaxRateBps) / BPS_BASE) : 0;
    const nopat = ebit - tax;
    const capex = Math.round((revenue * inputs.capexBps) / BPS_BASE);
    const wcChange = Math.round(((revenue - priorRevenue) * inputs.workingCapitalBps) / BPS_BASE);
    const fcf = nopat + da - capex - wcChange;

    assertMoney(revenue, "revenue");
    assertMoney(ebitda, "ebitda");
    assertMoney(da, "depreciationAmortisation");
    assertMoney(ebit, "ebit");
    assertMoney(tax, "tax");
    assertMoney(nopat, "nopat");
    assertMoney(capex, "capex");
    assertMoney(wcChange, "workingCapitalChange");
    assertMoney(fcf, "freeCashFlow");

    years.push({
      year: i + 1,
      revenueMinor: revenue,
      revenueGrowthBps: growthBps,
      ebitdaMarginBps: marginBps,
      ebitdaMinor: ebitda,
      depreciationAmortisationMinor: da,
      ebitMinor: ebit,
      taxMinor: tax,
      nopatMinor: nopat,
      capexMinor: capex,
      workingCapitalChangeMinor: wcChange,
      freeCashFlowMinor: fcf,
      discountFactorScaled: 0,
      presentValueMinor: 0,
    });
    flows.push(fcf);
  }

  const finalYear = years[years.length - 1];
  let terminalValue: number;
  if (inputs.terminalMethod === "GORDON_GROWTH") {
    const g = inputs.terminalGrowthBps as number;
    terminalValue = Math.round((finalYear.freeCashFlowMinor * (BPS_BASE + g)) / (inputs.waccBps - g));
  } else {
    const exitScaled = inputs.exitEvEbitdaScaled as number;
    terminalValue = Math.round((finalYear.ebitdaMinor * exitScaled) / 1_000_000);
  }
  assertMoney(terminalValue, "terminalValue");

  flows[flows.length - 1] += terminalValue;
  assertMoney(flows[flows.length - 1], "finalYearFlowPlusTerminalValue");

  const enterpriseValue = npvMinor(flows, inputs.waccBps);
  assertMoney(enterpriseValue, "enterpriseValue");

  // Populate the discounting evidence per year so the model is fully reviewable.
  for (let i = 0; i < years.length; i += 1) {
    const single = npvMinor([0, years[i].freeCashFlowMinor], inputs.waccBps);
    years[i].presentValueMinor = single;
  }
  const terminalPresentValue = npvMinor([0, ...years.map(() => 0).slice(0, years.length - 1), terminalValue], inputs.waccBps);

  const preferred = inputs.preferredEquityMinor ?? 0;
  const minority = inputs.minorityInterestMinor ?? 0;
  const equityValue = enterpriseValue - inputs.netDebtMinor - preferred - minority;
  assertMoney(equityValue, "equityValue");

  const impliedPrice = inputs.sharesOutstanding > 0 ? Math.round(equityValue / inputs.sharesOutstanding) : null;

  return calculated(seed(), {
    years,
    terminalValueMinor: terminalValue,
    terminalPresentValueMinor: terminalPresentValue,
    enterpriseValueMinor: enterpriseValue,
    equityValueMinor: equityValue,
    impliedSharePriceMinorPerShare: impliedPrice,
    netDebtUsedMinor: inputs.netDebtMinor,
    method,
    fingerprint: assumptionFingerprint(params.assumptions),
    scenarioKind: params.assumptions.scenarioKind,
  }) as DcfOutcome;
}

/* ------------------------------------------------------------------ */
/* Multiples valuation                                                 */
/* ------------------------------------------------------------------ */

export type MultiplesValuationParams = {
  seed: MetricSeedBase;
  metric: "EV_EBITDA" | "EV_REVENUE" | "PE" | "PS";
  /** Peer/trading multiple, fixed-point as produced by `metrics.multiple()`. */
  multipleScaled: number;
  /** The subject's own metric value, in minor units. */
  subjectMetricMinor: number;
  /** For equity multiples: shares and net debt bridge the subject metric to a per-share price. */
  sharesOutstanding: number;
  netDebtMinor: number;
  currency: string;
  /** Whether the multiple is a traded multiple or an observed transaction multiple. */
  basis: "TRADING" | "TRANSACTION";
  peerCount: number;
  period?: string | null;
  quality?: SourceQuality;
};

export type MultiplesValuationResult = {
  impliedEnterpriseValueMinor: number | null;
  impliedEquityValueMinor: number;
  impliedSharePriceMinorPerShare: number | null;
  multipleScaled: number;
  basis: MultiplesValuationParams["basis"];
  metric: MultiplesValuationParams["metric"];
  peerCount: number;
};

/**
 * Apply a peer or transaction multiple to the subject's own metric.
 *
 * The multiple is NEVER derived inside this function. Choosing comparables is a judgement that belongs
 * to a named analyst on a recorded model version; a function that silently averaged whatever peers it
 * found would produce a valuation whose comparability nobody reviewed. The peer count is recorded
 * because a multiple from one comparable and a multiple from thirty are different evidence.
 */
export function multiplesValuation(params: MultiplesValuationParams): MetricOutcome<MultiplesValuationResult> {
  const inputs: MetricInput[] = [
    { name: "multipleScaled", value: String(params.multipleScaled), unit: "MULTIPLE_X1E6", kind: "OBSERVED", source: `${params.basis} comparable set`, period: params.period ?? null, currency: null },
    { name: "subjectMetricMinor", value: String(params.subjectMetricMinor), unit: params.currency, kind: "OBSERVED", source: "subject's reported metric", period: params.period ?? null, currency: params.currency },
    { name: "metric", value: params.metric, unit: "ENUM", kind: "POLICY", source: "caller-declared metric", period: null, currency: null },
    { name: "basis", value: params.basis, unit: "ENUM", kind: "POLICY", source: "caller-declared basis (trading vs transaction)", period: null, currency: null },
    { name: "peerCount", value: String(params.peerCount), unit: "COUNT", kind: "OBSERVED", source: "comparable set size", period: null, currency: null },
    { name: "netDebtMinor", value: String(params.netDebtMinor), unit: params.currency, kind: "OBSERVED", source: "latest balance sheet", period: null, currency: params.currency },
    { name: "sharesOutstanding", value: String(params.sharesOutstanding), unit: "SHARES", kind: "OBSERVED", source: "share register", period: null, currency: null },
  ];
  const seed = () =>
    seedForEngine(params.seed, `FIN.VALUATION.MULTIPLES.${params.metric}`, `${params.basis} ${params.metric} multiple applied to the subject's ${params.metric} metric`, inputs, {
      period: params.period ?? null,
      currency: params.currency,
      quality: params.quality,
    });

  assertMoney(params.subjectMetricMinor, "subjectMetricMinor");
  assertMoney(params.netDebtMinor, "netDebtMinor");
  assertMoney(params.sharesOutstanding, "sharesOutstanding", { allowNegative: false });

  if (!Number.isSafeInteger(params.multipleScaled) || params.multipleScaled <= 0) {
    return invalid(seed(), `The ${params.basis} multiple must be a positive fixed-point multiple.`);
  }
  if (params.peerCount <= 0) {
    return missing(seed(), "No comparables were supplied, so there is no multiple to apply. A valuation requires a comparable set.");
  }
  if (params.subjectMetricMinor <= 0 && params.metric !== "PE") {
    return invalid(seed(), `The subject's ${params.metric} is zero or negative, so applying a positive multiple does not produce a value.`);
  }

  const isEquityMultiple = params.metric === "PE" || params.metric === "PS";
  if (isEquityMultiple && params.subjectMetricMinor <= 0) {
    return invalid(seed(), `The subject's ${params.metric} is zero or negative; an equity multiple cannot be applied to it.`);
  }

  const applied = Math.round((params.subjectMetricMinor * params.multipleScaled) / 1_000_000);
  assertMoney(applied, "appliedValue");

  // PE and PS are equity multiples already (price per share ÷ EPS, or market cap ÷ revenue for a
  // whole-company PS). EV multiples produce an enterprise value and require the net-debt bridge.
  const enterpriseValue = params.metric === "EV_EBITDA" || params.metric === "EV_REVENUE" ? applied : null;
  const equityValue = enterpriseValue === null ? applied : enterpriseValue - params.netDebtMinor;
  assertMoney(equityValue, "equityValue");
  const impliedPrice = params.sharesOutstanding > 0 ? Math.round(equityValue / params.sharesOutstanding) : null;

  return calculated(seed(), {
    impliedEnterpriseValueMinor: enterpriseValue,
    impliedEquityValueMinor: equityValue,
    impliedSharePriceMinorPerShare: impliedPrice,
    multipleScaled: params.multipleScaled,
    basis: params.basis,
    metric: params.metric,
    peerCount: params.peerCount,
  });
}

/**
 * Assemble a comparable multiple set from individual peers.
 *
 * Returns the MEDIAN, not the mean: one peer trading at 40× distorts an average and hides that the
 * set is not comparable. Both the median and the spread are returned, so a reviewer can see the
 * dispersion the single number conceals. An empty set is MISSING, never 0.
 */
export function comparablesMultiple(params: {
  seed: MetricSeedBase;
  metric: string;
  peers: readonly { peerId: string; multipleScaled: number | null; source: string }[];
  basis: "TRADING" | "TRANSACTION";
  /** When there are fewer peers than this, the result is ESTIMATED rather than CALCULATED. */
  minimumForCalculated?: number;
}): MetricOutcome<{ medianScaled: number; lowerQuartileScaled: number; upperQuartileScaled: number; usedPeers: number; excludedPeers: number }> {
  const minimum = params.minimumForCalculated ?? 3;
  const usable = params.peers.filter((p) => p.multipleScaled !== null && Number.isSafeInteger(p.multipleScaled) && (p.multipleScaled as number) > 0);
  const inputs: MetricInput[] = [
    { name: "metric", value: params.metric, unit: "ENUM", kind: "POLICY", source: "caller-declared metric", period: null, currency: null },
    { name: "basis", value: params.basis, unit: "ENUM", kind: "POLICY", source: "caller-declared basis", period: null, currency: null },
    { name: "peerCount", value: String(params.peers.length), unit: "COUNT", kind: "OBSERVED", source: "supplied comparable set", period: null, currency: null },
    { name: "usablePeerCount", value: String(usable.length), unit: "COUNT", kind: "DERIVED", source: "valuation-engine", period: null, currency: null },
    { name: "peers", value: usable.map((p) => `${p.peerId}:${p.multipleScaled}`).join(";"), unit: "SET", kind: "OBSERVED", source: "supplied comparable set", period: null, currency: null },
  ];
  const seed = () =>
    seedForEngine(params.seed, `FIN.VALUATION.COMPARABLES.${params.metric}`, `${params.basis} comparable ${params.metric} multiple: median of the usable peer set`, inputs, {
      period: null,
      currency: null,
      quality: "MANAGEMENT",
    });

  if (usable.length === 0) {
    return missing(seed(), "No peer in the supplied set has a usable positive multiple, so no comparable multiple exists.");
  }
  const sorted = usable.map((p) => p.multipleScaled as number).sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const lower = quantile(sorted, 0.25);
  const upper = quantile(sorted, 0.75);
  const payload = { medianScaled: median, lowerQuartileScaled: lower, upperQuartileScaled: upper, usedPeers: usable.length, excludedPeers: params.peers.length - usable.length };
  if (usable.length < minimum) {
    // A median of one or two peers is a modelled figure, not a measured one. It is returned as an
    // ESTIMATE with a confidence that rises with peer count, and never as CALCULATED.
    return estimated(seed(), payload, Math.max(0.1, Math.min(0.6, usable.length / minimum)));
  }
  return calculated(seed(), payload);
}

/** Linear-interpolated quantile on an ascending, non-empty integer array. Deterministic. */
export function quantile(sortedAscending: readonly number[], q: number): number {
  if (sortedAscending.length === 0) {
    throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", "A quantile requires a non-empty sample.", {});
  }
  if (!(q >= 0 && q <= 1)) {
    throw new FinanceArithmeticError("INVALID_RATIO", `Quantile must be within [0,1], received ${q}.`, { q });
  }
  if (sortedAscending.length === 1) return sortedAscending[0];
  const position = (sortedAscending.length - 1) * q;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sortedAscending[lowerIndex];
  const weight = position - lowerIndex;
  return Math.round(sortedAscending[lowerIndex] * (1 - weight) + sortedAscending[upperIndex] * weight);
}

/* ------------------------------------------------------------------ */
/* Sensitivity analysis                                                */
/* ------------------------------------------------------------------ */

export type SensitivityCell = {
  row: number;
  column: number;
  enterpriseValueMinor: number | null;
  equityValueMinor: number | null;
  impliedSharePriceMinorPerShare: number | null;
  state: string;
  reason: string | null;
};

export type SensitivityTable = {
  rowAxis: SensitivityAxis;
  columnAxis: SensitivityAxis;
  rowValues: readonly number[];
  columnValues: readonly number[];
  cells: SensitivityCell[];
  fingerprint: string;
  scenarioKind: ValuationScenarioKind;
};

/**
 * Two-axis sensitivity over the DCF.
 *
 * Each cell is a complete DCF run at the perturbed assumptions. Cells the model refuses (a terminal
 * growth at or above WACC, for example) carry their REFUSAL reason rather than being dropped or
 * zero-filled: the interesting part of a sensitivity grid is often where the model stops working.
 *
 * Axis values are absolute (a WACC in basis points, a multiple scaled by 10^6), never deltas, so the
 * grid labels itself and two runs are comparable.
 */
export function sensitivityTable(params: {
  seed: MetricSeedBase;
  assumptions: ValuationAssumptionSet;
  base: DcfInputs;
  rowAxis: SensitivityAxis;
  columnAxis: SensitivityAxis;
  rowValues: readonly number[];
  columnValues: readonly number[];
  currency: string;
}): SensitivityTable {
  if (params.rowAxis === params.columnAxis) {
    throw new FinanceArithmeticError("INVALID_RATIO", "A sensitivity table needs two different axes.", { axis: params.rowAxis });
  }
  const cells: SensitivityCell[] = [];
  let id = 0;
  for (let r = 0; r < params.rowValues.length; r += 1) {
    for (let c = 0; c < params.columnValues.length; c += 1) {
      const perturbed = applyAxes(params.base, [
        { axis: params.rowAxis, value: params.rowValues[r] },
        { axis: params.columnAxis, value: params.columnValues[c] },
      ]);
      let cell: SensitivityCell;
      try {
        const outcome = discountedCashFlow({
          // A dedicated id factory keeps grid-cell metric ids out of the caller's sequence.
          seed: { ...params.seed, nextId: () => `SENS-${++id}` },
          assumptions: params.assumptions,
          inputs: perturbed,
          currency: params.currency,
        });
        cell =
          outcome.kind === "VALUE"
            ? {
                row: r,
                column: c,
                enterpriseValueMinor: outcome.value.enterpriseValueMinor,
                equityValueMinor: outcome.value.equityValueMinor,
                impliedSharePriceMinorPerShare: outcome.value.impliedSharePriceMinorPerShare,
                state: outcome.state,
                reason: null,
              }
            : { row: r, column: c, enterpriseValueMinor: null, equityValueMinor: null, impliedSharePriceMinorPerShare: null, state: outcome.state, reason: outcome.reason };
      } catch (error) {
        const reason = error instanceof FinanceArithmeticError ? error.message : "The model could not be evaluated at these axis values.";
        cell = { row: r, column: c, enterpriseValueMinor: null, equityValueMinor: null, impliedSharePriceMinorPerShare: null, state: "INVALID", reason };
      }
      cells.push(cell);
    }
  }
  return {
    rowAxis: params.rowAxis,
    columnAxis: params.columnAxis,
    rowValues: params.rowValues,
    columnValues: params.columnValues,
    cells,
    fingerprint: assumptionFingerprint(params.assumptions),
    scenarioKind: params.assumptions.scenarioKind,
  };
}

function applyAxes(base: DcfInputs, axes: readonly { axis: SensitivityAxis; value: number }[]): DcfInputs {
  const next: DcfInputs = { ...base, revenueGrowthBps: [...base.revenueGrowthBps], ebitdaMarginBps: [...base.ebitdaMarginBps] };
  for (const { axis, value } of axes) {
    switch (axis) {
      case "WACC":
        next.waccBps = value;
        break;
      case "TERMINAL_GROWTH":
        next.terminalGrowthBps = value;
        if (next.terminalMethod !== "GORDON_GROWTH") next.terminalMethod = "GORDON_GROWTH";
        break;
      case "EXIT_MULTIPLE":
        next.exitEvEbitdaScaled = value;
        next.terminalMethod = "EXIT_MULTIPLE";
        break;
      case "REVENUE_GROWTH":
        next.revenueGrowthBps = base.revenueGrowthBps.map(() => value);
        break;
      case "EBITDA_MARGIN":
        next.ebitdaMarginBps = base.ebitdaMarginBps.map(() => value);
        break;
      default: {
        const never: never = axis;
        throw new FinanceArithmeticError("INVALID_RATIO", `Unknown sensitivity axis ${String(never)}.`, {});
      }
    }
  }
  return next;
}

/** Evenly spaced integer axis values from `start` to `end` inclusive. Deterministic. */
export function axisRange(start: number, end: number, steps: number): number[] {
  if (!Number.isInteger(steps) || steps < 2) {
    throw new FinanceArithmeticError("INVALID_RATIO", "An axis needs at least two steps.", { steps });
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new FinanceArithmeticError("INVALID_RATIO", "Axis bounds must be finite.", { start, end });
  }
  const values: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    values.push(Math.round(start + ((end - start) * i) / (steps - 1)));
  }
  return values;
}

/* ------------------------------------------------------------------ */
/* Scenario management                                                 */
/* ------------------------------------------------------------------ */

export type ScenarioRun = {
  scenarioKind: ValuationScenarioKind;
  label: string;
  assumptionSet: ValuationAssumptionSet;
  fingerprint: string;
  outcome: DcfOutcome;
};

/**
 * Run the base, upside and downside scenarios as ONE comparable set.
 *
 * The scenarios must share a model, a currency and a base-year revenue, and must not repeat a
 * scenario kind: comparing an upside case against a differently-based base case is the most common way
 * a valuation pack misleads its reader. Structural violations THROW.
 */
export function runScenarioSet(params: {
  seed: MetricSeedBase;
  currency: string;
  baseInputs: DcfInputs;
  scenarios: readonly { scenarioKind: ValuationScenarioKind; label: string; assumptions: ValuationAssumptionSet; inputs: DcfInputs }[];
}): ScenarioRun[] {
  if (params.scenarios.length === 0) {
    throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", "A scenario set requires at least one scenario.", {});
  }
  const modelIds = new Set(params.scenarios.map((s) => s.assumptions.modelId));
  if (modelIds.size > 1) {
    throw new FinanceArithmeticError(
      "INVALID_RATIO",
      `All scenarios must belong to ONE model so their results are comparable; received ${[...modelIds].join(", ")}.`,
      { modelIds: [...modelIds] },
    );
  }
  const kinds = params.scenarios.map((s) => s.scenarioKind);
  if (new Set(kinds).size !== kinds.length) {
    throw new FinanceArithmeticError("INVALID_RATIO", "A scenario set must not contain the same scenario kind twice.", { kinds });
  }
  for (const scenario of params.scenarios) {
    if (scenario.inputs.baseRevenueMinor !== params.baseInputs.baseRevenueMinor) {
      throw new FinanceArithmeticError(
        "INVALID_RATIO",
        `Scenario '${scenario.label}' uses a different base revenue (${scenario.inputs.baseRevenueMinor}) from the base case (${params.baseInputs.baseRevenueMinor}). Scenarios must differ only in assumptions.`,
        { scenario: scenario.label },
      );
    }
    if (scenario.assumptions.scenarioKind !== scenario.scenarioKind) {
      throw new FinanceArithmeticError(
        "INVALID_RATIO",
        `Scenario '${scenario.label}' declares kind ${scenario.scenarioKind} but its assumption set is marked ${scenario.assumptions.scenarioKind}.`,
        { scenario: scenario.label },
      );
    }
  }
  return params.scenarios.map((scenario) => ({
    scenarioKind: scenario.scenarioKind,
    label: scenario.label,
    assumptionSet: scenario.assumptions,
    fingerprint: assumptionFingerprint(scenario.assumptions),
    outcome: discountedCashFlow({
      seed: (() => {
        // One id factory per scenario: ids read `MET-1-BASE`, `MET-2-BASE`, … so a combined report can
        // attribute every metric to the scenario that produced it.
        const shared = params.seed.nextId;
        return { ...params.seed, nextId: () => `${shared()}-${scenario.scenarioKind}` };
      })(),
      assumptions: scenario.assumptions,
      inputs: scenario.inputs,
      currency: params.currency,
    }),
  }));
}

export { formatMultiple, notApplicable, readAssumption, readBps, readMoney, assumptionInputs };
