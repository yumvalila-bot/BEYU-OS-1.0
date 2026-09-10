/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH ENGINE: financial metrics core.
 *
 * This module is the arithmetic foundation for every Family Office capital,
 * investment, debt, real-estate, treasury and liquidity measure. It exists so
 * that the twenty-plus domain modules share ONE convention instead of each
 * inventing its own — the exact defect `src/lib/finance/epistemics.ts` records
 * having to fix across six specialist modules.
 *
 * ============================ ARITHMETIC CONVENTION =========================
 *
 *   MONEY  — integer MINOR UNITS throughout (100 minor = 1.00 of the currency).
 *            Never floating point. Matches `src/lib/waterfall.ts`,
 *            `src/lib/waterfall-engine-v2.ts` and `src/lib/family/loan.ts`.
 *   RATES  — integer BASIS POINTS per annum (100 bps = 1.00%).
 *   RATIOS — returned as basis points where they are a proportion, so that a
 *            ratio is exact integer arithmetic too. `ratioBps` is the name of
 *            that convention everywhere in this layer.
 *   SCALE  — ES2017 target ⇒ BigInt *literals* are unavailable, but `BigInt()`
 *            calls are used (as in `waterfall-engine-v2.ts`) wherever a product
 *            could exceed `Number.MAX_SAFE_INTEGER`.
 *
 * Determinism is a requirement, not a preference: every function here is pure,
 * allocates no random or clock value, and states its rounding convention in the
 * returned `convention` string. Two different conventions produce different
 * final instalments, and a family capital figure is governance evidence.
 *
 * ============================== WHAT THIS IS NOT ============================
 *
 * No threshold, no appetite, no policy value and no default severity lives here.
 * Every measure that needs a limit takes it from the caller with provenance, and
 * absent one the caller reports `REQUIRES_POLICY` — the discipline already
 * established by `src/lib/specialist/risk/model.ts`.
 *
 * Nothing here posts, accrues, journals or reconciles. The Family Office models
 * capital; Finance OS owns accounting (§32).
 */

import { applyBasisPoints } from "@/lib/waterfall-engine-v2";

export const FAMILY_CAPITAL_METRICS_VERSION = "family-capital-metrics-1.0.0";

/** Basis-point denominator. One basis point is 1/10000. */
export const BPS_BASE = 10_000;

/**
 * Fixed-point scale for discount factors. 10^12 gives a discount factor twelve
 * decimal digits of precision while leaving headroom inside BigInt arithmetic.
 */
const DISCOUNT_SCALE = BigInt(1_000_000_000_000);

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type FamilyMetricsErrorCode =
  | "INVALID_MONEY"
  | "INVALID_RATE"
  | "INVALID_PERIOD"
  | "DIVISION_BY_ZERO"
  | "NO_SIGN_CHANGE"
  | "INSUFFICIENT_INPUTS"
  | "THRESHOLD_PROVENANCE_REQUIRED"
  /**
   * A Family Office record was used where Finance OS is the only authority
   * (FIR-018). Distinct from the arithmetic codes: this is a boundary violation,
   * not a bad input, and a caller must not be able to confuse the two.
   */
  | "FINANCE_BOUNDARY_VIOLATION";

export class FamilyMetricsError extends Error {
  constructor(
    readonly code: FamilyMetricsErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "FamilyMetricsError";
  }
}

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Assert an integer number of minor units. Floating point is refused outright:
 * a `0.1 + 0.2` drift in a family capital figure is a governance defect, not a
 * rounding artefact.
 */
export function assertMinorUnits(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new FamilyMetricsError(
      "INVALID_MONEY",
      `${label} must be an integer number of minor units; received ${value}. Floating-point money is not permitted in the Family Office capital engine.`,
      { label, value },
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new FamilyMetricsError("INVALID_MONEY", `${label} exceeds the safe integer range: ${value}.`, { label, value });
  }
}

/** Assert a non-negative integer basis-point rate. */
export function assertBps(value: number, label: string, { allowNegative = false }: { allowNegative?: boolean } = {}): void {
  if (!Number.isInteger(value)) {
    throw new FamilyMetricsError("INVALID_RATE", `${label} must be an integer number of basis points; received ${value}.`, { label, value });
  }
  if (!allowNegative && value < 0) {
    throw new FamilyMetricsError("INVALID_RATE", `${label} must not be negative; received ${value} bps.`, { label, value });
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new FamilyMetricsError("INVALID_PERIOD", `${label} must be a positive integer; received ${value}.`, { label, value });
  }
}

/**
 * Ratio expressed in basis points, rounded half away from zero.
 *
 * Returns `null` when the denominator is zero rather than throwing: a family
 * balance sheet with no assets is a legitimate state to report, and a caller
 * that must not divide by zero can branch on `null`. Callers that consider a
 * zero denominator an error use `ratioBpsOrThrow`.
 */
export function ratioBps(numeratorMinor: number, denominatorMinor: number): number | null {
  assertMinorUnits(numeratorMinor, "numerator");
  assertMinorUnits(denominatorMinor, "denominator");
  if (denominatorMinor === 0) return null;
  const product = BigInt(numeratorMinor) * BigInt(BPS_BASE);
  const denominator = BigInt(denominatorMinor);
  const two = BigInt(2);
  const half = denominator < BigInt(0) ? -(-denominator / two) : denominator / two;
  const rounded = product >= BigInt(0) ? (product + half) / denominator : -((-product + half) / denominator);
  return Number(rounded);
}

/** As `ratioBps` but throws `DIVISION_BY_ZERO` on a zero denominator. */
export function ratioBpsOrThrow(numeratorMinor: number, denominatorMinor: number, label: string): number {
  const result = ratioBps(numeratorMinor, denominatorMinor);
  if (result === null) {
    throw new FamilyMetricsError("DIVISION_BY_ZERO", `${label}: the denominator is zero, so the ratio is undefined.`, { label });
  }
  return result;
}

/** Basis points as a human percentage with two decimals. `1234` → `"12.34%"`. */
export function bpsToPercent(bps: number | null, digits = 2): string {
  if (bps === null) return "undefined";
  assertBps(bps, "bps", { allowNegative: true });
  const negative = bps < 0;
  const abs = Math.abs(bps);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0").slice(0, digits);
  return `${negative ? "-" : ""}${whole}.${frac}%`;
}

/** Format integer minor units with thousands separators, preserving the sign. */
export function formatMinor(amountMinor: number): string {
  assertMinorUnits(amountMinor, "amount");
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}`;
}

/* ------------------------------------------------------------------ */
/* Canonical measure envelope                                          */
/* ------------------------------------------------------------------ */

/**
 * Epistemic class of a computed value. Mirrors the canonical Finance OS model
 * (`src/lib/finance/epistemics.ts`) rather than inventing a Family Office
 * private vocabulary — the specific defect that module documents.
 */
export const CAPITAL_EPISTEMIC_CLASS = [
  "POSTED",
  "OBSERVED",
  "DERIVED",
  "FORECAST",
  "ASSUMPTION",
  "SCENARIO",
  "DATA_NOT_AVAILABLE",
  "REQUIRES_POLICY",
  "REQUIRES_AUTHORITY",
] as const;
export type CapitalEpistemicClass = (typeof CAPITAL_EPISTEMIC_CLASS)[number];

/**
 * A threshold with provenance. A threshold without `sourceReference` is
 * indistinguishable from an invented one, so it is refused — the same rule
 * `RiskThreshold` and `TreasuryThreshold` already apply.
 */
export type CapitalThreshold = {
  code: string;
  /** Basis points where the quantity is a ratio; minor units where it is an amount. */
  value: number;
  unit: "BPS" | "MINOR_UNITS" | "COUNT";
  /** MAX = ceiling, breached strictly ABOVE the value. MIN = floor, breached strictly BELOW it.
   *  Sitting exactly on the line is compliant: a limit of 80% LTV is met at 80%, not breached by it. */
  direction: "MAX" | "MIN";
  sourceReference: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

export function assertThresholdProvenance(threshold: CapitalThreshold, label: string): void {
  if (typeof threshold.sourceReference !== "string" || threshold.sourceReference.trim() === "") {
    throw new FamilyMetricsError(
      "THRESHOLD_PROVENANCE_REQUIRED",
      `${label}: a threshold without provenance cannot be applied. An unattributed limit is indistinguishable from an invented one.`,
      { label, code: threshold.code },
    );
  }
  if (!Number.isInteger(threshold.value)) {
    throw new FamilyMetricsError("THRESHOLD_PROVENANCE_REQUIRED", `${label}: threshold value must be an integer.`, { label });
  }
}

/** The canonical result envelope for every Family Office capital measure. */
export type CapitalMeasure = {
  engineVersion: string;
  code: string;
  title: string;
  /** The epistemic class of `valueBps` / `valueMinor`. */
  basis: CapitalEpistemicClass;
  /** Ratio measures. `null` when the required input is absent — never zero-as-an-answer. */
  valueBps: number | null;
  /** Amount measures. `null` when the required input is absent. */
  valueMinor: number | null;
  unit: "BPS" | "MINOR_UNITS" | "COUNT" | "NONE";
  /** The denominator behind a ratio, so any percentage can be independently rechecked. */
  denominatorMinor: number | null;
  currency: string | null;
  severity: FinancialRedLineBand;
  severityBasis: string;
  calculationMethod: string;
  assumptions: string[];
  missingInputs: string[];
  policyDependencies: string[];
  explanation: string[];
};

/* ------------------------------------------------------------------ */
/* Financial red line (§42)                                            */
/* ------------------------------------------------------------------ */

/**
 * The five-band financial red line.
 *
 *   GREEN  healthy
 *   YELLOW attention
 *   ORANGE management intervention required
 *   RED    capital protection
 *   BLACK  emergency governance / freeze
 *
 * Bands are ordered worst-first so that `worstBand()` reduces by taking the
 * first index. `REQUIRES_POLICY` is NOT a band: it is the absence of a ratified
 * threshold, reported through `severityBasis`, exactly as the existing risk
 * engines do.
 */
export const FINANCIAL_RED_LINE_BANDS = ["BLACK", "RED", "ORANGE", "YELLOW", "GREEN"] as const;
export type FinancialRedLineBand = (typeof FINANCIAL_RED_LINE_BANDS)[number];

/** Neutral marker used when no threshold has been ratified. */
export const REQUIRES_POLICY_BAND = "REQUIRES_POLICY" as const;

export function bandRank(band: FinancialRedLineBand): number {
  return FINANCIAL_RED_LINE_BANDS.indexOf(band);
}

/** The most severe of a set of bands. Empty input → GREEN (nothing breached). */
export function worstBand(bands: readonly FinancialRedLineBand[]): FinancialRedLineBand {
  if (bands.length === 0) return "GREEN";
  return bands.reduce((worst, band) => (bandRank(band) < bandRank(worst) ? band : worst), "GREEN" as FinancialRedLineBand);
}

/**
 * One rung of a red-line ladder: **the band you fall INTO when you breach this
 * rung's threshold.**
 *
 * Breach semantics are direction-dependent and getting them wrong grades a
 * coverage floor and a concentration ceiling identically — one of them
 * backwards. Direction is therefore explicit on every rung, never inferred:
 *
 *   MIN — the measure is a FLOOR (higher is better: DSCR, liquidity coverage,
 *         recurring cash-flow coverage). Breached when the value falls strictly
 *         BELOW the rung. At the rung exactly, the measure holds.
 *   MAX — the measure is a CEILING (lower is better: LTV, concentration,
 *         debt/asset, maturity concentration). Breached when the value rises
 *         strictly ABOVE the rung. At the rung exactly, the measure holds.
 */
export type RedLineRung = {
  band: FinancialRedLineBand;
  threshold: CapitalThreshold;
};

/**
 * A complete, configurable red-line ladder (§42).
 *
 * Every boundary is caller-supplied with provenance; the engine hard-codes none,
 * because a hard-coded "RED at 80% LTV" would be an unratified risk appetite
 * presented as a fact.
 *
 * `healthyBand` is the band when NO rung is breached — normally GREEN. It is a
 * declared governance choice rather than an accident of iteration order, which
 * is why it is required rather than defaulted.
 */
export type RedLineLadder = {
  /** The measure code this ladder grades. */
  measureCode: string;
  rungs: RedLineRung[];
  /** The band when no rung is breached. */
  healthyBand: FinancialRedLineBand;
};

/** True when the measure has breached this rung's threshold. */
function rungBreached(valueBps: number, rung: RedLineRung): boolean {
  return rung.threshold.direction === "MIN" ? valueBps < rung.threshold.value : valueBps > rung.threshold.value;
}

/**
 * Grade a basis-point measure against a ladder.
 *
 * Rungs are evaluated **most severe band first** and the first BREACHED rung
 * wins. So a ladder whose rungs overlap always resolves to the worst applicable
 * band: a measure cannot be talked out of BLACK by a lenient rung listed later,
 * and a healthy measure is never dragged down by a rung it has not breached.
 *
 * Returns `null` for a null measure or an empty ladder, which callers must
 * report as REQUIRES_POLICY — a missing threshold is not a GREEN result.
 */
export function gradeRedLine(valueBps: number | null, ladder: RedLineLadder): FinancialRedLineBand | null {
  if (valueBps === null) return null;
  if (ladder.rungs.length === 0) return null;
  const directions = new Set(ladder.rungs.map((r) => r.threshold.direction));
  if (directions.size > 1) {
    throw new FamilyMetricsError(
      "THRESHOLD_PROVENANCE_REQUIRED",
      `${ladder.measureCode}: a ladder must grade one direction only; received both MIN and MAX rungs, which would compare a floor and a ceiling against the same number.`,
      { measureCode: ladder.measureCode },
    );
  }
  for (const rung of ladder.rungs) {
    assertThresholdProvenance(rung.threshold, `${ladder.measureCode}/${rung.threshold.code}`);
  }
  // `bandRank` is worst-first, so ascending sort evaluates BLACK before GREEN.
  const ordered = [...ladder.rungs].sort((a, b) => bandRank(a.band) - bandRank(b.band));
  for (const rung of ordered) {
    if (rungBreached(valueBps, rung)) return rung.band;
  }
  return ladder.healthyBand;
}

/**
 * Convenience builder for a floor ladder (higher is better).
 *
 * Each rung declares the band reached when the measure falls below `belowBps`.
 * `healthyBand` is the band when nothing is breached.
 */
export function floorLadder(
  measureCode: string,
  rungs: readonly { band: FinancialRedLineBand; code: string; belowBps: number; sourceReference: string; effectiveFrom: string }[],
  healthyBand: FinancialRedLineBand,
): RedLineLadder {
  return {
    measureCode,
    healthyBand,
    rungs: rungs.map((r) => ({
      band: r.band,
      threshold: { code: r.code, value: r.belowBps, unit: "BPS" as const, direction: "MIN" as const, sourceReference: r.sourceReference, effectiveFrom: r.effectiveFrom },
    })),
  };
}

/**
 * Convenience builder for a ceiling ladder (lower is better).
 *
 * Each rung declares the band reached when the measure rises above `aboveBps`.
 */
export function ceilingLadder(
  measureCode: string,
  rungs: readonly { band: FinancialRedLineBand; code: string; aboveBps: number; sourceReference: string; effectiveFrom: string }[],
  healthyBand: FinancialRedLineBand,
): RedLineLadder {
  return {
    measureCode,
    healthyBand,
    rungs: rungs.map((r) => ({
      band: r.band,
      threshold: { code: r.code, value: r.aboveBps, unit: "BPS" as const, direction: "MAX" as const, sourceReference: r.sourceReference, effectiveFrom: r.effectiveFrom },
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Discounting (exact fixed-point)                                     */
/* ------------------------------------------------------------------ */

/**
 * Discount factor for period `period` at `rateBps`, as a fixed-point integer
 * scaled by 10^12. Computed by repeated integer division, never by `Math.pow`.
 *
 * A basis-point rate is `bps / 10000`, so `(1 + r) = (10000 + bps) / 10000` and
 *
 *   `df(0) = SCALE`
 *   `df(i) = df(i-1) * 10000 / (10000 + bps)`
 *
 * The `10000` (not the scale) is the basis-point denominator: conflating the two
 * would make a 10% rate look like 0.0001% and every NPV wrong by orders of
 * magnitude. This is stated because it is the single easiest way to break this
 * module silently.
 */
export function discountFactorScaled(period: number, rateBps: number): bigint {
  assertPositive(period + 1, "period");
  assertBps(rateBps, "rate", { allowNegative: true });
  const numerator = BigInt(BPS_BASE);
  const denominator = BigInt(BPS_BASE) + BigInt(rateBps);
  if (denominator <= BigInt(0)) {
    throw new FamilyMetricsError("INVALID_RATE", `A rate of ${rateBps} bps makes the discount factor undefined (1 + r <= 0).`, { rateBps });
  }
  let df = DISCOUNT_SCALE;
  for (let i = 0; i < period; i += 1) {
    df = (df * numerator) / denominator;
  }
  return df;
}

/**
 * The scaled (undivided) NPV total, in BigInt.
 *
 * Kept separate from `npvMinor` for one reason: IRR bisection only needs the
 * SIGN of the NPV, and at the bottom of the search window (−99.99%) the discount
 * factor grows by 10^4 per period, so the divided result overflows
 * `Number.MAX_SAFE_INTEGER` long before the sign is in doubt. Comparing signs in
 * BigInt is exact at any magnitude.
 */
function npvScaledTotal(flowsMinor: readonly number[], rateBps: number): bigint {
  let scaledTotal = BigInt(0);
  for (let period = 0; period < flowsMinor.length; period += 1) {
    scaledTotal += BigInt(flowsMinor[period]) * discountFactorScaled(period, rateBps);
  }
  return scaledTotal;
}

/**
 * Net present value of a cash-flow series in integer minor units.
 *
 * `flowsMinor[0]` is the t=0 flow (conventionally the negative investment
 * outlay). The result is exact integer minor units: every product is computed
 * in BigInt against the 10^12 discount scale and the accumulated scaled total
 * is divided once, at the end, rounding half away from zero.
 */
export function npvMinor(flowsMinor: readonly number[], rateBps: number): number {
  if (flowsMinor.length === 0) {
    throw new FamilyMetricsError("INSUFFICIENT_INPUTS", "NPV requires at least one cash flow.", {});
  }
  flowsMinor.forEach((f, i) => assertMinorUnits(f, `flowsMinor[${i}]`));
  assertBps(rateBps, "rate", { allowNegative: true });

  const scaledTotal = npvScaledTotal(flowsMinor, rateBps);
  const two = BigInt(2);
  const half = DISCOUNT_SCALE / two;
  const rounded = scaledTotal >= BigInt(0) ? (scaledTotal + half) / DISCOUNT_SCALE : -((-scaledTotal + half) / DISCOUNT_SCALE);
  const result = Number(rounded);
  assertMinorUnits(result, "npv result");
  return result;
}

/**
 * Internal rate of return in basis points, by bisection on the sign of NPV.
 *
 * Returns `null` when the series has no sign change inside the search window —
 * an IRR that does not exist is reported as absent, never as 0%. That is the
 * whole point: a zero IRR and a non-existent IRR are different governance
 * statements.
 *
 * Deterministic: fixed 200 bisection iterations over [-9999, 10000] bps,
 * returning the midpoint rounded to whole basis points.
 */
export function irrBps(flowsMinor: readonly number[], iterations = 200): number | null {
  if (flowsMinor.length < 2) {
    throw new FamilyMetricsError("INSUFFICIENT_INPUTS", "IRR requires at least two cash flows.", {});
  }
  flowsMinor.forEach((f, i) => assertMinorUnits(f, `flowsMinor[${i}]`));
  const hasPositive = flowsMinor.some((f) => f > 0);
  const hasNegative = flowsMinor.some((f) => f < 0);
  if (!hasPositive || !hasNegative) return null;

  const signAt = (rateBps: number): number => {
    const total = npvScaledTotal(flowsMinor, rateBps);
    return total > BigInt(0) ? 1 : total < BigInt(0) ? -1 : 0;
  };

  let lo = -9_999;
  let hi = 10_000;
  const signLo = signAt(lo);
  const signHi = signAt(hi);
  if (signLo === 0) return lo;
  if (signHi === 0) return hi;
  if (signLo === signHi) return null;

  for (let i = 0; i < iterations; i += 1) {
    const mid = Math.trunc((lo + hi) / 2);
    const signMid = signAt(mid);
    if (signMid === 0) return mid;
    if (signMid === signLo) lo = mid;
    else hi = mid;
    if (hi - lo <= 1) break;
  }
  // `lo` and `hi` are now adjacent and straddle the root. Return whichever rate
  // brings the scaled NPV closest to zero rather than the raw midpoint: at whole
  // basis-point resolution the midpoint can sit a full bp away from the true
  // root (e.g. [-100000, 110000] resolves to 999 instead of 1000 without this).
  const magnitude = (rateBps: number): bigint => {
    const total = npvScaledTotal(flowsMinor, rateBps);
    return total < BigInt(0) ? -total : total;
  };
  return magnitude(lo) <= magnitude(hi) ? lo : hi;
}

/* ------------------------------------------------------------------ */
/* Return measures                                                     */
/* ------------------------------------------------------------------ */

/**
 * Compound annual growth rate in basis points over `years` whole years.
 *
 * Integer-only: `(end/start)^(1/years) - 1` is evaluated as
 * `exp(ln(end/start)/years)` in fixed point. A non-positive start or end makes
 * CAGR undefined and returns `null` — it is not reported as zero.
 */
export function cagrBps(startMinor: number, endMinor: number, years: number): number | null {
  assertMinorUnits(startMinor, "start");
  assertMinorUnits(endMinor, "end");
  assertPositive(years, "years");
  if (startMinor <= 0 || endMinor <= 0) return null;
  // Fixed-point exponentiation via logarithms is the only place this layer
  // touches floating point, and it is a DERIVED analytical measure, never an
  // authoritative financial value (§33). The result is rounded to whole bps.
  const ratio = Number(BigInt(endMinor)) / Number(BigInt(startMinor));
  const annual = Math.exp(Math.log(ratio) / years);
  const bps = Math.round((annual - 1) * BPS_BASE);
  return Number.isSafeInteger(bps) ? bps : null;
}

/**
 * Return on investment in basis points: `(gain / cost)`.
 * `gainMinor` is signed (a loss is negative).
 */
export function roiBps(gainMinor: number, costMinor: number): number | null {
  return ratioBps(gainMinor, costMinor);
}

/**
 * Cash-on-cash return in basis points: annual pre-tax cash flow divided by the
 * cash actually invested. Distinct from ROI: the denominator is cash in, not
 * total cost, which is why a leveraged acquisition can show a high cash-on-cash
 * and a modest ROI at the same time.
 */
export function cashOnCashBps(annualCashFlowMinor: number, cashInvestedMinor: number): number | null {
  return ratioBps(annualCashFlowMinor, cashInvestedMinor);
}

/** Simple annualised yield in basis points: annual income over value. */
export function yieldBps(annualIncomeMinor: number, valueMinor: number): number | null {
  return ratioBps(annualIncomeMinor, valueMinor);
}

/** Capitalisation rate in basis points: NOI over value. */
export function capRateBps(noiMinor: number, valueMinor: number): number | null {
  return ratioBps(noiMinor, valueMinor);
}

/* ------------------------------------------------------------------ */
/* Real-estate measures (§12)                                          */
/* ------------------------------------------------------------------ */

export type RealEstateOperatingInput = {
  grossPotentialRentMinor: number;
  /** Vacancy and collection loss in basis points of gross potential rent. */
  vacancyBps: number;
  otherIncomeMinor: number;
  operatingExpensesMinor: number;
};

/**
 * Net operating income in integer minor units.
 *
 * NOI = (gross potential rent × (1 − vacancy)) + other income − operating
 * expenses. Debt service, income tax, depreciation and capital expenditure are
 * deliberately excluded — including any of them would make the result something
 * other than NOI, and cap rates computed from it would be wrong.
 */
export function netOperatingIncomeMinor(input: RealEstateOperatingInput): number {
  assertMinorUnits(input.grossPotentialRentMinor, "grossPotentialRent");
  assertMinorUnits(input.otherIncomeMinor, "otherIncome");
  assertMinorUnits(input.operatingExpensesMinor, "operatingExpenses");
  assertBps(input.vacancyBps, "vacancy");
  if (input.vacancyBps > BPS_BASE) {
    throw new FamilyMetricsError("INVALID_RATE", `Vacancy cannot exceed ${BPS_BASE} bps; received ${input.vacancyBps}.`, {});
  }
  const vacancyLoss = applyBasisPoints(input.grossPotentialRentMinor, input.vacancyBps);
  const effectiveGross = input.grossPotentialRentMinor - vacancyLoss + input.otherIncomeMinor;
  return effectiveGross - input.operatingExpensesMinor;
}

/* ------------------------------------------------------------------ */
/* Leverage measures (§14)                                             */
/* ------------------------------------------------------------------ */

/** Loan-to-value in basis points. */
export function ltvBps(debtMinor: number, valueMinor: number): number | null {
  return ratioBps(debtMinor, valueMinor);
}

/**
 * Debt service coverage ratio in basis points: NOI over annual debt service.
 *
 * Expressed in bps so the measure stays integer: 12000 bps = 1.20× DSCR.
 */
export function dscrBps(noiMinor: number, annualDebtServiceMinor: number): number | null {
  return ratioBps(noiMinor, annualDebtServiceMinor);
}

/** Interest coverage in basis points: EBIT over interest expense. */
export function interestCoverageBps(ebitMinor: number, interestExpenseMinor: number): number | null {
  return ratioBps(ebitMinor, interestExpenseMinor);
}

/** Debt-to-equity in basis points. */
export function debtToEquityBps(debtMinor: number, equityMinor: number): number | null {
  return ratioBps(debtMinor, equityMinor);
}

/** Debt-to-asset in basis points. */
export function debtToAssetBps(debtMinor: number, assetsMinor: number): number | null {
  return ratioBps(debtMinor, assetsMinor);
}

/**
 * Maturity concentration in basis points: the share of total debt maturing
 * inside `horizonDays`. Computed from explicit maturities only — a maturity that
 * is absent is never assumed to be far away, because that assumption is what
 * turns a refinancing wall into a surprise.
 */
export function maturityConcentrationBps(
  maturities: readonly { maturityDate: string; outstandingMinor: number }[],
  asOf: string,
  horizonDays: number,
): { valueBps: number | null; unknownMaturityMinor: number; knownMinor: number } {
  assertPositive(horizonDays, "horizonDays");
  let total = 0;
  let inside = 0;
  let unknown = 0;
  for (const m of maturities) {
    assertMinorUnits(m.outstandingMinor, "outstandingMinor");
    total += m.outstandingMinor;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.maturityDate)) {
      unknown += m.outstandingMinor;
      continue;
    }
    const days = daysBetween(asOf, m.maturityDate);
    if (days >= 0 && days <= horizonDays) inside += m.outstandingMinor;
  }
  return { valueBps: ratioBps(inside, total), unknownMaturityMinor: unknown, knownMinor: total - unknown };
}

/** Whole days from `from` (ISO) to `to` (ISO). Negative when `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new FamilyMetricsError("INVALID_PERIOD", `Both dates must be ISO YYYY-MM-DD; received ${from} → ${to}.`, { from, to });
  }
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Productive capital metrics (§18)                                    */
/* ------------------------------------------------------------------ */

/** Productive Capital Ratio = productive assets / total assets. */
export function productiveCapitalRatioBps(productiveAssetsMinor: number, totalAssetsMinor: number): number | null {
  return ratioBps(productiveAssetsMinor, totalAssetsMinor);
}

/** Recurring Cash Flow Coverage = recurring income / recurring obligations. */
export function recurringCashFlowCoverageBps(recurringIncomeMinor: number, recurringObligationsMinor: number): number | null {
  return ratioBps(recurringIncomeMinor, recurringObligationsMinor);
}

/** Capital Utilisation = productive capital / investable capital. */
export function capitalUtilisationBps(productiveCapitalMinor: number, investableCapitalMinor: number): number | null {
  return ratioBps(productiveCapitalMinor, investableCapitalMinor);
}

/**
 * Liquidity runway in whole days: liquid resources divided by average daily
 * net obligation. `null` when there are no obligations — an infinite runway is
 * reported as absent, never as a number, because a number implies a limit.
 */
export function liquidityRunwayDays(liquidMinor: number, dailyNetObligationMinor: number): number | null {
  assertMinorUnits(liquidMinor, "liquid");
  assertMinorUnits(dailyNetObligationMinor, "dailyNetObligation");
  if (dailyNetObligationMinor <= 0) return null;
  return Math.floor(liquidMinor / dailyNetObligationMinor);
}

/* ------------------------------------------------------------------ */
/* Capital projection (§28)                                            */
/* ------------------------------------------------------------------ */

/**
 * Apply basis points to an amount with a signed, unbounded rate.
 *
 * `applyBasisPoints` from the waterfall engine is reused for the ordinary case,
 * but it is defined only for 0…10000 bps. A capital projection may legitimately
 * assume a net return above 100% or a negative one (fees and tax exceeding the
 * gross return), so the signed cases are computed here with the same
 * integer-only, round-half-away-from-zero convention.
 */
export function applyBpsSigned(amountMinor: number, bps: number): number {
  assertMinorUnits(amountMinor, "amountMinor");
  assertBps(bps, "bps", { allowNegative: true });
  if (bps >= 0 && bps <= BPS_BASE) return applyBasisPoints(amountMinor, bps);
  const product = BigInt(amountMinor) * BigInt(bps);
  const denominator = BigInt(BPS_BASE);
  const half = denominator / BigInt(2);
  const rounded = product >= BigInt(0) ? (product + half) / denominator : -((-product + half) / denominator);
  const result = Number(rounded);
  assertMinorUnits(result, "basis point result");
  return result;
}

export type CapitalProjectionInput = {
  startingCapitalMinor: number;
  monthlyContributionMinor: number;
  /** Nominal annual return assumption, basis points. An ASSUMPTION, never a fact. */
  annualReturnBps: number;
  /** Annual fee drag, basis points, deducted from the return. */
  annualFeeBps: number;
  /** Annual tax drag on growth, basis points. */
  annualTaxBps: number;
  /** Annual inflation, basis points. Used only for the real-value column. */
  annualInflationBps: number;
  years: 5 | 10 | 20 | 30 | 50;
  /** Annual withdrawal in minor units, taken at each year end. */
  annualWithdrawalMinor?: number;
};

export type CapitalProjectionYear = {
  year: number;
  nominalMinor: number;
  realMinor: number;
  contributionsMinor: number;
  withdrawalsMinor: number;
  growthMinor: number;
};

export type CapitalProjection = {
  engineVersion: string;
  /** Always SCENARIO: a projection is a hypothetical world, never a fact. */
  basis: Extract<CapitalEpistemicClass, "SCENARIO">;
  netReturnBps: number;
  years: number;
  schedule: CapitalProjectionYear[];
  terminalNominalMinor: number;
  terminalRealMinor: number;
  totalContributionsMinor: number;
  totalWithdrawalsMinor: number;
  /** Explicit, non-empty. The projection is never presented without them. */
  assumptions: string[];
  /** Always true. A projection that claims certainty is a defect. */
  outcomeGuaranteed: false;
  convention: string;
};

/**
 * Compound a capital projection in integer minor units.
 *
 * Net return = annual return − fees − tax drag, applied once per year to the
 * opening balance; contributions are added monthly (12 × monthly) at year end;
 * withdrawals are taken at year end. Real value deflates the terminal nominal
 * balance by inflation compounded over the horizon.
 *
 * This is a SANDBOX. It is labelled SCENARIO, carries its assumptions on its
 * face, and structurally cannot claim a guaranteed outcome (`outcomeGuaranteed`
 * is typed `false`).
 */
export function projectCapital(input: CapitalProjectionInput): CapitalProjection {
  assertMinorUnits(input.startingCapitalMinor, "startingCapital");
  assertMinorUnits(input.monthlyContributionMinor, "monthlyContribution");
  assertBps(input.annualReturnBps, "annualReturn");
  assertBps(input.annualFeeBps, "annualFee");
  assertBps(input.annualTaxBps, "annualTax");
  assertBps(input.annualInflationBps, "annualInflation");
  const withdrawal = input.annualWithdrawalMinor ?? 0;
  assertMinorUnits(withdrawal, "annualWithdrawal");
  if (![5, 10, 20, 30, 50].includes(input.years)) {
    throw new FamilyMetricsError("INVALID_PERIOD", `The horizon must be 5, 10, 20, 30 or 50 years; received ${input.years}.`, {});
  }

  const netReturnBps = input.annualReturnBps - input.annualFeeBps - input.annualTaxBps;
  const annualContribution = input.monthlyContributionMinor * 12;

  let balance = input.startingCapitalMinor;
  let totalContributions = 0;
  let totalWithdrawals = 0;
  const schedule: CapitalProjectionYear[] = [];

  for (let year = 1; year <= input.years; year += 1) {
    const opening = balance;
    const growth = applyBpsSigned(balance, netReturnBps);
    balance = opening + growth + annualContribution - withdrawal;
    totalContributions += annualContribution;
    totalWithdrawals += withdrawal;
    assertMinorUnits(balance, `projected balance at year ${year}`);

    // Deflate to today's purchasing power.
    let deflator = BigInt(1);
    const infl = BigInt(input.annualInflationBps);
    for (let i = 0; i < year; i += 1) deflator *= BigInt(BPS_BASE) + infl;
    const scale = BigInt(BPS_BASE) ** BigInt(year);
    const real = Number((BigInt(balance) * scale) / deflator);

    schedule.push({ year, nominalMinor: balance, realMinor: real, contributionsMinor: annualContribution, withdrawalsMinor: withdrawal, growthMinor: growth });
  }

  const last = schedule[schedule.length - 1];
  return {
    engineVersion: FAMILY_CAPITAL_METRICS_VERSION,
    basis: "SCENARIO",
    netReturnBps,
    years: input.years,
    schedule,
    terminalNominalMinor: last.nominalMinor,
    terminalRealMinor: last.realMinor,
    totalContributionsMinor: totalContributions,
    totalWithdrawalsMinor: totalWithdrawals,
    assumptions: [
      `Net annual return of ${bpsToPercent(netReturnBps)} (${bpsToPercent(input.annualReturnBps)} gross less ${bpsToPercent(input.annualFeeBps)} fees less ${bpsToPercent(input.annualTaxBps)} tax drag). An ASSUMPTION supplied by the caller, not an observation.`,
      `Inflation of ${bpsToPercent(input.annualInflationBps)} per annum. An ASSUMPTION.`,
      `Contributions of ${formatMinor(annualContribution)} minor units per year, applied at year end.`,
      withdrawal > 0 ? `Withdrawals of ${formatMinor(withdrawal)} minor units per year, applied at year end.` : "No withdrawals modelled.",
      "Returns are applied once per year to the opening balance; intra-year sequencing is not modelled.",
      "Tax is modelled as an annual drag on growth. Final tax treatment is the authority of Finance OS and qualified professionals (§22), never of this projection.",
    ],
    outcomeGuaranteed: false,
    convention: "Annual compounding, integer minor units, basis-point rates, fees and tax deducted from the gross return before compounding, real value deflated by compounded inflation.",
  };
}

export { applyBasisPoints };
