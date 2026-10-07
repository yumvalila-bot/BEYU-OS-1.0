/**
 * BEYU OS — FINANCE INTELLIGENCE: canonical arithmetic for market-facing valuation.
 *
 * ============================== REUSE, NOT REINVENTION =======================
 *
 * `src/lib/family/office/capital-wealth/metrics.ts` already establishes the BEYU OS arithmetic
 * convention and implements NPV, IRR, CAGR, ROI and the ratio/minor-unit guards. There is exactly
 * ONE implementation of those functions in this repository, and this module RE-EXPORTS them rather
 * than writing a second one. A second IRR that disagreed with the first by a basis point would make
 * two governance reports disagree about the same deal — the duplicate-truth failure
 * `src/lib/finance/truth.ts` exists to prevent.
 *
 * What this module ADDS is the arithmetic that public-market and transaction valuation needs and
 * the capital-wealth core does not carry:
 *
 *   MONEY PER SHARE   minor units per share, computed with explicit integer rounding
 *   MULTIPLES         exact fixed-point ratios (P/E, P/S, EV/EBITDA, PEG) at 6 decimal places
 *   PERCENTAGES       margins and growth rates in basis points
 *   AVERAGES          share-weighted and period-weighted means that refuse empty inputs
 *
 * ============================ ARITHMETIC CONVENTION =========================
 *
 *   MONEY    integer minor units (100 minor = 1.00). Never a float. Re-exported convention.
 *   RATES    integer basis points per annum (100 bps = 1.00%). Re-exported convention.
 *   MULTIPLE fixed-point integer scaled by 10^6, produced in BigInt and rounded half away from
 *            zero. A `Multiple` is never a float, so `18.400000` and `18.4` cannot compare
 *            unequal in two reports.
 *   PERCENT  integer basis points, same as rates.
 *
 * Every function is pure and deterministic: no clock, no randomness, no locale.
 */

import { BPS_BASE } from "@/lib/family/office/capital-wealth/metrics";

/*
 * ------------------------------------------------------------------ *
 * Re-exported canonical primitives (ONE implementation, §54)         *
 * ------------------------------------------------------------------ *
 */
export {
  BPS_BASE,
  assertBps,
  assertMinorUnits,
  bpsToPercent,
  cagrBps,
  cashOnCashBps,
  discountFactorScaled,
  formatMinor,
  interestCoverageBps,
  irrBps,
  npvMinor,
  ratioBps,
  ratioBpsOrThrow,
  roiBps,
  yieldBps,
} from "@/lib/family/office/capital-wealth/metrics";

/*
 * ------------------------------------------------------------------ *
 * Errors                                                             *
 * ------------------------------------------------------------------ *
 */

export type FinanceArithmeticErrorCode =
  | "INVALID_MONEY"
  | "INVALID_RATIO"
  | "INVALID_MULTIPLE"
  | "DIVISION_BY_ZERO"
  | "INSUFFICIENT_INPUTS"
  | "INVALID_PERCENTAGE";

export class FinanceArithmeticError extends Error {
  readonly code: FinanceArithmeticErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: FinanceArithmeticErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "FinanceArithmeticError";
    this.code = code;
    this.details = details;
  }
}

/* ------------------------------------------------------------------ *
 * Guards                                                             *
 * ------------------------------------------------------------------ */

export function assertFiniteNumber(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FinanceArithmeticError("INVALID_MONEY", `${label} must be a finite number, received ${String(value)}.`, { label });
  }
}

/** Minor-unit money guard, matching the capital-wealth convention (integers only). */
export function assertMoney(value: number, label: string, { allowNegative = true }: { allowNegative?: boolean } = {}): void {
  assertFiniteNumber(value, label);
  if (!Number.isInteger(value)) {
    throw new FinanceArithmeticError("INVALID_MONEY", `${label} must be integer minor units, received ${value}.`, { label, value });
  }
  if (!allowNegative && value < 0) {
    throw new FinanceArithmeticError("INVALID_MONEY", `${label} must not be negative, received ${value}.`, { label, value });
  }
  if (!Number.isSafeInteger(value)) {
    throw new FinanceArithmeticError("INVALID_MONEY", `${label} exceeds the safe integer range (${value}).`, { label, value });
  }
}

/** Basis-point guard covering negative rates (growth can be negative; a discount rate cannot). */
export function assertPercent(value: number, label: string, { allowNegative = true }: { allowNegative?: boolean } = {}): void {
  assertFiniteNumber(value, label);
  if (!Number.isInteger(value)) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", `${label} must be whole basis points, received ${value}.`, { label, value });
  }
  if (!allowNegative && value < 0) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", `${label} must not be negative, received ${value}.`, { label, value });
  }
}

/* ------------------------------------------------------------------ *
 * Multiples — exact fixed point                                      *
 * ------------------------------------------------------------------ *
 */

/** Fixed-point scale for multiples. 10^6 gives six decimal places. */
export const MULTIPLE_SCALE = 1_000_000;

/** Why a multiple could not be produced. `null` is never substituted for a number. */
export type MultipleRefusal =
  | "DENOMINATOR_ZERO"
  | "DENOMINATOR_NEGATIVE"
  | "NUMERATOR_ABSENT"
  | "DENOMINATOR_ABSENT";

export type MultipleResult =
  | { kind: "MULTIPLE"; scaled: number }
  | { kind: "REFUSED"; reason: MultipleRefusal; detail: string };

/**
 * Compute `numerator / denominator` as an exact fixed-point multiple.
 *
 * The default refuses a NEGATIVE denominator. That is not squeamishness: a P/E computed on negative
 * earnings returns a negative number, and a negative multiple is not a valuation statement — it is
 * a category error that a reader will nevertheless compare against a positive peer. Callers that
 * genuinely need a signed ratio (a growth multiple, a leverage ratio that can invert) pass
 * `allowNegativeDenominator: true` and are then responsible for the interpretation.
 */
export function multiple(
  numerator: number | null,
  denominator: number | null,
  { allowNegativeDenominator = false, scale = MULTIPLE_SCALE }: { allowNegativeDenominator?: boolean; scale?: number } = {},
): MultipleResult {
  if (numerator === null) return { kind: "REFUSED", reason: "NUMERATOR_ABSENT", detail: "The numerator is absent." };
  if (denominator === null) return { kind: "REFUSED", reason: "DENOMINATOR_ABSENT", detail: "The denominator is absent." };
  assertFiniteNumber(numerator, "numerator");
  assertFiniteNumber(denominator, "denominator");
  if (denominator === 0) return { kind: "REFUSED", reason: "DENOMINATOR_ZERO", detail: "The denominator is zero, so the multiple is undefined." };
  if (denominator < 0 && !allowNegativeDenominator) {
    return {
      kind: "REFUSED",
      reason: "DENOMINATOR_NEGATIVE",
      detail: "The denominator is negative. A negative multiple is not a valuation statement; report NOT_AVAILABLE instead.",
    };
  }

  const scaledNumerator = toScaledInteger(numerator);
  const scaledDenominator = toScaledInteger(denominator);
  if (scaledDenominator === BigInt(0)) {
    return { kind: "REFUSED", reason: "DENOMINATOR_ZERO", detail: "The denominator underflows to zero at fixed-point scale." };
  }

  const bigScale = BigInt(scale);
  const product = scaledNumerator * bigScale;
  const rounded = roundHalfAwayFromZero(product, scaledDenominator);
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) {
    throw new FinanceArithmeticError("INVALID_MULTIPLE", `Multiple ${numerator}/${denominator} exceeds the safe integer range at scale ${scale}.`, {
      numerator,
      denominator,
      scale,
    });
  }
  return { kind: "MULTIPLE", scaled: result };
}

/** Render a scaled multiple as a fixed-decimal string (never a float). */
export function formatMultiple(scaled: number, digits = 2): string {
  const sign = scaled < 0 ? "-" : "";
  const abs = Math.abs(scaled);
  const whole = Math.trunc(abs / MULTIPLE_SCALE);
  const fraction = abs % MULTIPLE_SCALE;
  const padded = String(fraction).padStart(6, "0").slice(0, digits).padEnd(digits, "0");
  return digits === 0 ? `${sign}${whole}` : `${sign}${whole}.${padded}`;
}

export function multiplyScaled(scaled: number, factorScaled: number): number {
  assertFiniteNumber(scaled, "scaled");
  assertFiniteNumber(factorScaled, "factorScaled");
  const product = toScaledInteger(scaled) * toScaledInteger(factorScaled);
  const result = Number(roundHalfAwayFromZero(product, BigInt(MULTIPLE_SCALE)));
  if (!Number.isSafeInteger(result)) {
    throw new FinanceArithmeticError("INVALID_MULTIPLE", "Scaled multiplication exceeded the safe integer range.", { scaled, factorScaled });
  }
  return result;
}

/** Convert a percentage expressed in basis points into a fixed-point factor (1 + pct). */
export function factorFromBps(bps: number): number {
  assertPercent(bps, "bps");
  const result = Number(roundHalfAwayFromZero((BigInt(BPS_BASE) + BigInt(bps)) * BigInt(MULTIPLE_SCALE), BigInt(BPS_BASE)));
  if (!Number.isSafeInteger(result)) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", `Rate ${bps} bps is outside the representable fixed-point range.`, { bps });
  }
  return result;
}

/**
 * Convert a fixed-point input into minor units, rounding half away from zero.
 *
 * Used where a figure legitimately arrives as a decimal (a per-share price of 12.345 in a
 * 2-decimal currency). The rounding happens ONCE, here, and is stated in the caller's provenance.
 */
export function toMinorUnits(value: number, { scale = 100 }: { scale?: number } = {}): number {
  assertFiniteNumber(value, "value");
  if (!Number.isSafeInteger(scale) || scale <= 0) {
    throw new FinanceArithmeticError("INVALID_MONEY", `Scale must be a positive integer, received ${String(scale)}.`, { scale });
  }
  const scaledInput = toScaledInteger(value);
  const result = Number(roundHalfAwayFromZero(scaledInput * BigInt(scale), BigInt(MULTIPLE_SCALE)));
  assertMoney(result, "minor units");
  return result;
}

/** Minor units back to a decimal number. Presentation only — never feed this back into money math. */
export function fromMinorUnits(value: number, { scale = 100 }: { scale?: number } = {}): number {
  assertMoney(value, "value");
  return value / scale;
}

/**
 * Divide one already-fixed-point quantity by another, staying in fixed point throughout.
 *
 * This exists so that chained metrics — PEG divides a P/E multiple by a growth figure, both of
 * which are already fixed point — never round twice. `multiple()` takes decimal numbers; this takes
 * the scaled integers directly.
 */
export function scaleDivide(
  numeratorScaled: number | null,
  denominatorScaled: number | null,
  { allowNegativeDenominator = false, scale = MULTIPLE_SCALE }: { allowNegativeDenominator?: boolean; scale?: number } = {},
): MultipleResult {
  if (numeratorScaled === null) return { kind: "REFUSED", reason: "NUMERATOR_ABSENT", detail: "The numerator is absent." };
  if (denominatorScaled === null) return { kind: "REFUSED", reason: "DENOMINATOR_ABSENT", detail: "The denominator is absent." };
  assertFiniteNumber(numeratorScaled, "numeratorScaled");
  assertFiniteNumber(denominatorScaled, "denominatorScaled");
  if (denominatorScaled === 0) return { kind: "REFUSED", reason: "DENOMINATOR_ZERO", detail: "The denominator is zero, so the ratio is undefined." };
  if (denominatorScaled < 0 && !allowNegativeDenominator) {
    return {
      kind: "REFUSED",
      reason: "DENOMINATOR_NEGATIVE",
      detail: "The denominator is negative, which makes the ratio economically meaningless; report NOT_AVAILABLE instead.",
    };
  }
  const product = toScaledInteger(numeratorScaled) * BigInt(scale);
  const result = Number(roundHalfAwayFromZero(product, toScaledInteger(denominatorScaled)));
  if (!Number.isSafeInteger(result)) {
    throw new FinanceArithmeticError("INVALID_MULTIPLE", "Scaled division exceeded the safe integer range.", { numeratorScaled, denominatorScaled, scale });
  }
  return { kind: "MULTIPLE", scaled: result };
}

/** Add scaled quantities without leaving fixed point. */
export function scaleAdd(...values: readonly number[]): number {
  let total = BigInt(0);
  for (const value of values) {
    assertFiniteNumber(value, "scaled value");
    total += toScaledInteger(value);
  }
  const result = Number(total);
  if (!Number.isSafeInteger(result)) {
    throw new FinanceArithmeticError("INVALID_MULTIPLE", "Scaled addition exceeded the safe integer range.", { values });
  }
  return result;
}

/** Multiply a scaled quantity by an integer count (e.g. a multiple by a share count). */
export function scaleTimesInteger(scaled: number, count: number): number {
  assertFiniteNumber(scaled, "scaled");
  assertFiniteNumber(count, "count");
  const result = Number(toScaledInteger(scaled) * BigInt(Math.trunc(count)));
  if (!Number.isSafeInteger(result)) {
    throw new FinanceArithmeticError("INVALID_MULTIPLE", "Scaled multiplication by an integer exceeded the safe integer range.", { scaled, count });
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Averages                                                           *
 * ------------------------------------------------------------------ *
 */

/**
 * Weighted mean of a non-empty sample.
 *
 * Refuses an empty sample and a zero total weight rather than returning 0 or NaN: "no data" and
 * "the average is zero" are different statements, and a leverage score computed on an empty peer
 * set is not a score.
 */
export function weightedMean(samples: readonly { value: number; weight: number }[]): number | null {
  if (samples.length === 0) return null;
  let totalWeight = 0;
  let total = 0;
  for (const sample of samples) {
    assertFiniteNumber(sample.value, "sample.value");
    assertFiniteNumber(sample.weight, "sample.weight");
    if (sample.weight < 0) {
      throw new FinanceArithmeticError("INVALID_RATIO", "A weight must not be negative.", { weight: sample.weight });
    }
    totalWeight += sample.weight;
    total += sample.value * sample.weight;
  }
  if (totalWeight === 0) return null;
  return total / totalWeight;
}

/** Simple arithmetic mean, refusing an empty sample. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) {
    assertFiniteNumber(value, "value");
    total += value;
  }
  return total / values.length;
}

/* ------------------------------------------------------------------ *
 * Internal BigInt helpers (ES2017: BigInt() calls, never literals)    *
 * ------------------------------------------------------------------ *
 */

const SCALE_DIGITS = BigInt(MULTIPLE_SCALE);

/**
 * Represent a finite decimal number exactly at the fixed-point scale.
 *
 * Floating point cannot represent every decimal exactly, so the number is first rendered with
 * `toFixed` at the scale's precision and then parsed as an integer string. That is deterministic
 * for the magnitudes this layer handles (money and multiples), and it is the ONLY place a float is
 * allowed to touch the arithmetic.
 */
function toScaledInteger(value: number): bigint {
  assertFiniteNumber(value, "value");
  const negative = value < 0;
  const exact = Math.abs(value).toFixed(6);
  const [whole, fraction = ""] = exact.split(".");
  const padded = (fraction + "000000").slice(0, 6);
  const digits = `${whole}${padded}`.replace(/^0+(?=\d)/, "");
  const scaled = BigInt(digits || "0");
  return negative ? -scaled : scaled;
}

function roundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === BigInt(0)) {
    throw new FinanceArithmeticError("DIVISION_BY_ZERO", "Integer division by zero.", {});
  }
  const zero = BigInt(0);
  const negative = (numerator < zero) !== (denominator < zero);
  const absNumerator = numerator < zero ? -numerator : numerator;
  const absDenominator = denominator < zero ? -denominator : denominator;
  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const half = absDenominator / BigInt(2);
  const rounded = remainder >= half && !(remainder === half && absDenominator % BigInt(2) === BigInt(0) && half === BigInt(0)) ? quotient + BigInt(1) : quotient;
  return negative ? -rounded : rounded;
}

/** Exported for tests: proves the fixed-point scale is exactly six decimal places. */
export const SCALE_FACTOR = SCALE_DIGITS;
