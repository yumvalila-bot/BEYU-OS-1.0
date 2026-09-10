/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH ENGINE: the debt engine (§14).
 *
 * Extends the existing family debt capability. `src/lib/family/loan.ts` already
 * engineers the loan lifecycle, the seventeen documentation disciplines and a
 * deterministic repayment schedule; `src/lib/specialist/risk/*` already grades
 * exposure with `REQUIRES_POLICY` as the honest default. This module adds the
 * missing piece: **a serviceability and stress layer over the family's whole
 * debt book**, expressed in the same conventions and refusing to invent a limit
 * the same way.
 *
 * Measures: LTV, DSCR, interest coverage, debt/equity, debt/asset, maturity
 * concentration, refinancing exposure, currency exposure, fixed/floating
 * exposure.
 *
 * Stresses (§14): revenue −10/−20/−30/−40%; interest +1/+3/+5 percentage points;
 * asset value −10/−20/−30%. The stress grid is the brief's; the THRESHOLDS that
 * turn a stressed number into a band are not — they arrive with provenance or
 * the result is `REQUIRES_POLICY`.
 *
 * Nothing here posts or accrues. Finance OS owns accounting (§32).
 */

import {
  applyBpsSigned,
  assertMinorUnits,
  BPS_BASE,
  debtToAssetBps,
  debtToEquityBps,
  dscrBps,
  gradeRedLine,
  interestCoverageBps,
  ltvBps,
  maturityConcentrationBps,
  ratioBps,
  type CapitalEpistemicClass,
  type FinancialRedLineBand,
  type RedLineLadder,
} from "./metrics";

export const FAMILY_DEBT_ENGINE_VERSION = "family-debt-engine-1.0.0";

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export type DebtPositionInput = {
  id: string;
  currency: string;
  outstandingMinor: number;
  /** Annual rate, basis points. */
  annualRateBps: number;
  rateType: "FIXED" | "FLOATING";
  maturityDate: string;
  /** Annual debt service (principal + interest) in minor units. */
  annualDebtServiceMinor: number;
  /** Collateral value securing this position, minor units. Null = unsecured. */
  collateralValueMinor: number | null;
  legalEntityId: string;
  countryCode: string;
};

export type DebtBookInput = {
  asOf: string;
  positions: readonly DebtPositionInput[];
  /** Net operating income available to service debt, minor units. */
  noiMinor: number;
  /** Earnings before interest and tax, minor units. */
  ebitMinor: number;
  /** Total family equity attributable to the debt-bearing structures, minor units. */
  equityMinor: number;
  /** Total assets of the debt-bearing structures, minor units. */
  totalAssetsMinor: number;
  /** Total asset value used for LTV, minor units. Defaults to totalAssetsMinor. */
  ltvAssetValueMinor?: number;
  /** Revenue for the stress grid, minor units. */
  revenueMinor: number;
  /** The share of revenue that becomes NOI, basis points. A caller ASSUMPTION. */
  revenueToNoiBps: number;
};

/* ------------------------------------------------------------------ */
/* Exposure profile                                                    */
/* ------------------------------------------------------------------ */

export type ExposureBucket = {
  key: string;
  label: string;
  amountMinor: number;
  shareBps: number | null;
  positionIds: string[];
};

export type DebtExposureProfile = {
  engineVersion: string;
  asOf: string;
  totalDebtMinor: number;
  /** Per currency. No cross-currency total: no FX rate has been ratified. */
  byCurrency: { currency: string; amountMinor: number; shareBps: number | null; positionIds: string[] }[];
  byRateType: ExposureBucket[];
  /** Floating-rate debt, so an interest stress can be applied to the right subset. */
  floatingMinor: number;
  fixedMinor: number;
  fixedFloatingSplitBps: { fixedBps: number | null; floatingBps: number | null };
  byMaturityBucket: ExposureBucket[];
  maturityConcentration: { horizonDays: number; valueBps: number | null; unknownMaturityMinor: number }[];
  /** Concentration by legal entity and by country, for entity/country isolation review. */
  byLegalEntity: ExposureBucket[];
  byCountry: ExposureBucket[];
  /** Positions with no collateral recorded. Named, never assumed secured. */
  unsecuredPositionIds: string[];
  unsecuredMinor: number;
  explanation: string[];
};

const MATURITY_BUCKETS = [
  { key: "0-90D", label: "0–90 days", days: 90 },
  { key: "91-365D", label: "91–365 days", days: 365 },
  { key: "1-3Y", label: "1–3 years", days: 1_095 },
  { key: "3-5Y", label: "3–5 years", days: 1_825 },
  { key: "5Y+", label: "over 5 years", days: Number.MAX_SAFE_INTEGER },
] as const;

/**
 * Profile the debt book: currency, rate type, maturity, entity, country and
 * security.
 *
 * A position whose maturity is not an ISO date lands in no maturity bucket and
 * is reported in `unknownMaturityMinor`. It is never assumed to be long-dated,
 * because that assumption is exactly what turns a refinancing wall into a
 * surprise.
 */
export function profileDebtExposure(input: DebtBookInput, horizons: readonly number[] = [90, 365]): DebtExposureProfile {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)) throw new Error(`asOf must be an ISO date; received "${input.asOf}".`);
  input.positions.forEach((p, i) => assertMinorUnits(p.outstandingMinor, `positions[${i}].outstanding`));

  const total = input.positions.reduce((s, p) => s + p.outstandingMinor, 0);

  const group = (keyOf: (p: DebtPositionInput) => string, labelOf: (k: string) => string): ExposureBucket[] => {
    const map = new Map<string, { amount: number; ids: string[] }>();
    for (const p of input.positions) {
      const key = keyOf(p);
      const entry = map.get(key) ?? { amount: 0, ids: [] };
      entry.amount += p.outstandingMinor;
      entry.ids.push(p.id);
      map.set(key, entry);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([key, v]) => ({ key, label: labelOf(key), amountMinor: v.amount, shareBps: ratioBps(v.amount, total), positionIds: v.ids }));
  };

  const fixedMinor = input.positions.filter((p) => p.rateType === "FIXED").reduce((s, p) => s + p.outstandingMinor, 0);
  const floatingMinor = total - fixedMinor;

  const byMaturityBucket: ExposureBucket[] = [];
  let unknownMaturityMinor = 0;
  for (const bucket of MATURITY_BUCKETS) {
    const prev = MATURITY_BUCKETS[MATURITY_BUCKETS.indexOf(bucket) - 1];
    const lowerDays = prev ? prev.days : -1;
    const ids: string[] = [];
    let amount = 0;
    for (const p of input.positions) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.maturityDate)) continue;
      const days = maturityDays(input.asOf, p.maturityDate);
      if (days > lowerDays && days <= bucket.days) {
        ids.push(p.id);
        amount += p.outstandingMinor;
      }
    }
    byMaturityBucket.push({ key: bucket.key, label: bucket.label, amountMinor: amount, shareBps: ratioBps(amount, total), positionIds: ids });
  }
  for (const p of input.positions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.maturityDate)) unknownMaturityMinor += p.outstandingMinor;
  }

  const maturityConcentration = horizons.map((horizonDays) => {
    const result = maturityConcentrationBps(
      input.positions.map((p) => ({ maturityDate: p.maturityDate, outstandingMinor: p.outstandingMinor })),
      input.asOf,
      horizonDays,
    );
    return { horizonDays, valueBps: result.valueBps, unknownMaturityMinor: result.unknownMaturityMinor };
  });

  const unsecured = input.positions.filter((p) => p.collateralValueMinor === null);

  return {
    engineVersion: FAMILY_DEBT_ENGINE_VERSION,
    asOf: input.asOf,
    totalDebtMinor: total,
    byCurrency: group((p) => p.currency, (c) => c).map((b) => ({ currency: b.key, amountMinor: b.amountMinor, shareBps: b.shareBps, positionIds: b.positionIds })),
    byRateType: group((p) => p.rateType, (k) => (k === "FIXED" ? "Fixed rate" : "Floating rate")),
    floatingMinor,
    fixedMinor,
    fixedFloatingSplitBps: { fixedBps: ratioBps(fixedMinor, total), floatingBps: ratioBps(floatingMinor, total) },
    byMaturityBucket,
    maturityConcentration,
    byLegalEntity: group((p) => p.legalEntityId, (k) => k),
    byCountry: group((p) => p.countryCode, (k) => k),
    unsecuredPositionIds: unsecured.map((p) => p.id),
    unsecuredMinor: unsecured.reduce((s, p) => s + p.outstandingMinor, 0),
    explanation: [
      `${input.positions.length} position(s), ${total} minor units of debt across ${new Set(input.positions.map((p) => p.currency)).size} currency(ies).`,
      `Fixed/floating split: ${fixedMinor} fixed, ${floatingMinor} floating. Only the floating subset is exposed to an interest stress; applying one to fixed debt would overstate the shock.`,
      unknownMaturityMinor > 0
        ? `${unknownMaturityMinor} minor units carry no ISO maturity and are excluded from every maturity bucket. They are reported, not assumed long-dated.`
        : "Every position carries an ISO maturity.",
      unsecured.length > 0 ? `${unsecured.length} position(s) totalling ${unsecured.reduce((s, p) => s + p.outstandingMinor, 0)} minor units have no collateral recorded.` : "Every position records collateral.",
      "Totals are per currency; no cross-currency total is produced because no FX rate has been ratified.",
    ],
  };
}

function maturityDays(asOf: string, maturityDate: string): number {
  const [ay, am, ad] = asOf.split("-").map(Number);
  const [my, mm, md] = maturityDate.split("-").map(Number);
  return Math.round((Date.UTC(my, mm - 1, md) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Core measures                                                       */
/* ------------------------------------------------------------------ */

export type DebtMeasureSet = {
  engineVersion: string;
  asOf: string;
  basis: CapitalEpistemicClass;
  totalDebtMinor: number;
  /** LTV against the asset value the caller nominated. */
  ltvBps: number | null;
  dscrBps: number | null;
  interestCoverageBps: number | null;
  debtToEquityBps: number | null;
  debtToAssetBps: number | null;
  /** Annual debt service used for DSCR, minor units. */
  annualDebtServiceMinor: number;
  /** Annual interest used for coverage, minor units. */
  annualInterestMinor: number;
  /** Refinancing exposure: debt maturing inside the horizon, minor units. */
  refinancingExposureMinor: number;
  refinancingExposureBps: number | null;
  /** Currency exposure: the largest single-currency share, basis points. */
  currencyConcentrationBps: number | null;
  largestCurrency: string | null;
  /** Floating-rate share, basis points — the interest-stress surface. */
  floatingShareBps: number | null;
  missingInputs: string[];
  policyDependencies: string[];
  explanation: string[];
};

/**
 * Compute the core debt measures over the whole book.
 *
 * Every ratio returns `null` when its denominator is absent, and the missing
 * input is named in `missingInputs`. A zero denominator is reported as absent,
 * never as an infinite or zero ratio, because a caller reading "DSCR = 0" would
 * conclude the opposite of the truth.
 */
export function measureDebtBook(input: DebtBookInput, refinancingHorizonDays = 365): DebtMeasureSet {
  const exposure = profileDebtExposure(input, [refinancingHorizonDays]);
  const annualDebtService = input.positions.reduce((s, p) => s + p.annualDebtServiceMinor, 0);
  const annualInterest = input.positions.reduce((s, p) => s + interestForYear(p), 0);
  const missingInputs: string[] = [];

  if (input.noiMinor === 0) missingInputs.push("NOI is zero, so DSCR is undefined.");
  if (input.ebitMinor === 0) missingInputs.push("EBIT is zero, so interest coverage is undefined.");
  if (input.equityMinor === 0) missingInputs.push("Equity is zero, so debt/equity is undefined.");
  if (input.totalAssetsMinor === 0) missingInputs.push("Total assets are zero, so debt/asset is undefined.");
  if (annualDebtService === 0) missingInputs.push("Annual debt service is zero, so DSCR is undefined.");

  const ltvAssetValue = input.ltvAssetValueMinor ?? input.totalAssetsMinor;
  const byCurrencySorted = [...exposure.byCurrency].sort((a, b) => b.amountMinor - a.amountMinor);
  const refinancing = exposure.maturityConcentration.find((m) => m.horizonDays === refinancingHorizonDays);
  const refinancingMinor = input.positions
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.maturityDate) && maturityDays(input.asOf, p.maturityDate) >= 0 && maturityDays(input.asOf, p.maturityDate) <= refinancingHorizonDays)
    .reduce((s, p) => s + p.outstandingMinor, 0);

  return {
    engineVersion: FAMILY_DEBT_ENGINE_VERSION,
    asOf: input.asOf,
    basis: "DERIVED",
    totalDebtMinor: exposure.totalDebtMinor,
    ltvBps: ltvBps(exposure.totalDebtMinor, ltvAssetValue),
    dscrBps: dscrBps(input.noiMinor, annualDebtService),
    interestCoverageBps: interestCoverageBps(input.ebitMinor, annualInterest),
    debtToEquityBps: debtToEquityBps(exposure.totalDebtMinor, input.equityMinor),
    debtToAssetBps: debtToAssetBps(exposure.totalDebtMinor, input.totalAssetsMinor),
    annualDebtServiceMinor: annualDebtService,
    annualInterestMinor: annualInterest,
    refinancingExposureMinor: refinancingMinor,
    refinancingExposureBps: ratioBps(refinancingMinor, exposure.totalDebtMinor),
    currencyConcentrationBps: byCurrencySorted.length > 0 ? ratioBps(byCurrencySorted[0].amountMinor, exposure.totalDebtMinor) : null,
    largestCurrency: byCurrencySorted[0]?.currency ?? null,
    floatingShareBps: exposure.fixedFloatingSplitBps.floatingBps,
    missingInputs,
    policyDependencies: [
      "The DSCR, interest-coverage, LTV, debt/equity and debt/asset boundaries at which debt is properly supported (CAP-004 → capital.debt.serviceability).",
      "The maturity-concentration ceiling that constitutes refinancing exposure (CAP-006 → capital.liquidity.reserve).",
      "The currency-concentration ceiling (capital.liquidity.reserve).",
    ],
    explanation: [
      `Debt book: ${exposure.totalDebtMinor} minor units across ${input.positions.length} position(s).`,
      `Annual debt service ${annualDebtService}; annual interest ${annualInterest} (computed at each position's own rate and rate type).`,
      `Refinancing exposure inside ${refinancingHorizonDays} days: ${refinancingMinor} minor units.`,
      `Interest stress applies only to the floating subset (${exposure.floatingMinor} minor units); fixed-rate debt is unaffected by a rate shock.`,
      refinancing?.unknownMaturityMinor
        ? `${refinancing.unknownMaturityMinor} minor units have no ISO maturity and are NOT counted as maturing inside the horizon. The exposure figure is therefore a floor, not a total.`
        : "Every position carries an ISO maturity, so the exposure figure is complete.",
      missingInputs.length > 0 ? `Undefined measures: ${missingInputs.join(" ")}` : "All measures are defined.",
    ],
  };
}

/** One year's interest for a position at its own rate. */
function interestForYear(position: DebtPositionInput): number {
  return applyBpsSigned(position.outstandingMinor, position.annualRateBps);
}

/* ------------------------------------------------------------------ */
/* Stress grid (§14)                                                   */
/* ------------------------------------------------------------------ */

/** The brief's stress grid, expressed as basis-point perturbations. */
export const REVENUE_STRESS_BPS = [-1_000, -2_000, -3_000, -4_000] as const;
export const INTEREST_STRESS_BPS = [100, 300, 500] as const;
export const ASSET_VALUE_STRESS_BPS = [-1_000, -2_000, -3_000] as const;

export type StressAxis = "REVENUE" | "INTEREST_RATE" | "ASSET_VALUE";

export type StressCase = {
  axis: StressAxis;
  /** The perturbation, basis points. Negative for a decline. */
  shockBps: number;
  label: string;
  /** NOI after the shock. Null when the shock does not affect NOI. */
  stressedNoiMinor: number | null;
  /** Debt service after the shock. Null when the shock does not affect service. */
  stressedDebtServiceMinor: number | null;
  /** Asset value after the shock. Null when the shock does not affect value. */
  stressedAssetValueMinor: number | null;
  dscrBps: number | null;
  ltvBps: number | null;
  interestCoverageBps: number | null;
  /** True when the shock drives DSCR below 1.00× — the debt is not covered by NOI. */
  dscrBelowOne: boolean | null;
  /** Always SCENARIO: a stress case is a hypothetical world, never a fact. */
  basis: Extract<CapitalEpistemicClass, "SCENARIO">;
  explanation: string;
};

export type DebtStressResult = {
  engineVersion: string;
  asOf: string;
  /** The unstressed baseline the grid perturbs. */
  baseline: { noiMinor: number; debtServiceMinor: number; interestMinor: number; assetValueMinor: number; dscrBps: number | null; ltvBps: number | null; interestCoverageBps: number | null };
  cases: StressCase[];
  /** The worst DSCR across the grid, so a single number can be escalated. */
  worstDscrBps: number | null;
  worstDscrCase: string | null;
  /** Axes whose cases are all undefined, so a gap is visible. */
  axesWithNoSignal: StressAxis[];
  /** Always non-empty: a stress grid without its assumptions is not evidence. */
  assumptions: string[];
  /** Always SCENARIO. */
  basis: Extract<CapitalEpistemicClass, "SCENARIO">;
  explanation: string[];
};

/**
 * Run the §14 stress grid.
 *
 * The three axes are applied INDEPENDENTLY, one case each, never compounded:
 * a combined revenue-decline-and-rate-rise world is a different scenario and
 * would need its own ratified construction. Compounding them silently would
 * produce a number nobody had specified and everybody would quote.
 *
 * A revenue shock flows to NOI through the caller's `revenueToNoiBps`
 * assumption. An interest shock applies only to floating-rate debt. An
 * asset-value shock affects LTV only. Each case says which of the three it
 * touched, so no reader has to guess.
 */
export function stressDebtBook(input: DebtBookInput, refinancingHorizonDays = 365): DebtStressResult {
  const measures = measureDebtBook(input, refinancingHorizonDays);
  const ltvAssetValue = input.ltvAssetValueMinor ?? input.totalAssetsMinor;
  const cases: StressCase[] = [];

  const makeCase = (axis: StressAxis, shockBps: number, label: string): StressCase => {
    let stressedNoi: number | null = null;
    let stressedService: number | null = null;
    let stressedAsset: number | null = null;

    if (axis === "REVENUE") {
      const stressedRevenue = input.revenueMinor + applyBpsSigned(input.revenueMinor, shockBps);
      stressedNoi = applyBpsSigned(stressedRevenue, input.revenueToNoiBps);
      stressedService = measures.annualDebtServiceMinor;
      stressedAsset = ltvAssetValue;
    } else if (axis === "INTEREST_RATE") {
      const floating = input.positions.filter((p) => p.rateType === "FLOATING");
      const extraInterest = floating.reduce((s, p) => s + applyBpsSigned(p.outstandingMinor, shockBps), 0);
      stressedNoi = input.noiMinor;
      stressedService = measures.annualDebtServiceMinor + extraInterest;
      stressedAsset = ltvAssetValue;
    } else {
      stressedNoi = input.noiMinor;
      stressedService = measures.annualDebtServiceMinor;
      stressedAsset = ltvAssetValue + applyBpsSigned(ltvAssetValue, shockBps);
    }

    const dscr = stressedNoi !== null && stressedService !== null ? dscrBps(stressedNoi, stressedService) : null;
    const ltv = stressedAsset !== null ? ltvBps(measures.totalDebtMinor, stressedAsset) : null;
    const coverage = stressedService !== null ? interestCoverageBps(input.ebitMinor + (axis === "INTEREST_RATE" ? -(stressedService - measures.annualDebtServiceMinor) : 0), stressedService) : null;

    return {
      axis,
      shockBps,
      label,
      stressedNoiMinor: stressedNoi,
      stressedDebtServiceMinor: stressedService,
      stressedAssetValueMinor: stressedAsset,
      dscrBps: dscr,
      ltvBps: ltv,
      interestCoverageBps: coverage,
      dscrBelowOne: dscr === null ? null : dscr < BPS_BASE,
      basis: "SCENARIO",
      explanation:
        axis === "REVENUE"
          ? `Revenue ${shockBps} bps → revenue ${input.revenueMinor + applyBpsSigned(input.revenueMinor, shockBps)}, NOI restated at ${input.revenueToNoiBps} bps of revenue. Debt service and asset value unchanged.`
          : axis === "INTEREST_RATE"
            ? `Interest +${shockBps} bps applied to floating-rate debt only (${input.positions.filter((p) => p.rateType === "FLOATING").length} position(s)); debt service rises accordingly. NOI and asset value unchanged.`
            : `Asset value ${shockBps} bps → LTV restated. NOI and debt service unchanged; a valuation shock does not by itself change cash flow.`,
    };
  };

  for (const shock of REVENUE_STRESS_BPS) cases.push(makeCase("REVENUE", shock, `Revenue ${shock / 100}%`));
  for (const shock of INTEREST_STRESS_BPS) cases.push(makeCase("INTEREST_RATE", shock, `Interest +${shock / 100}pp`));
  for (const shock of ASSET_VALUE_STRESS_BPS) cases.push(makeCase("ASSET_VALUE", shock, `Asset value ${shock / 100}%`));

  const withDscr = cases.filter((c) => c.dscrBps !== null);
  const worst = withDscr.reduce<StressCase | null>((w, c) => (w === null || (c.dscrBps as number) < (w.dscrBps as number) ? c : w), null);
  const axesWithNoSignal = (["REVENUE", "INTEREST_RATE", "ASSET_VALUE"] as StressAxis[]).filter((axis) => cases.filter((c) => c.axis === axis).every((c) => c.dscrBps === null && c.ltvBps === null));

  return {
    engineVersion: FAMILY_DEBT_ENGINE_VERSION,
    asOf: input.asOf,
    baseline: {
      noiMinor: input.noiMinor,
      debtServiceMinor: measures.annualDebtServiceMinor,
      interestMinor: measures.annualInterestMinor,
      assetValueMinor: ltvAssetValue,
      dscrBps: measures.dscrBps,
      ltvBps: measures.ltvBps,
      interestCoverageBps: measures.interestCoverageBps,
    },
    cases,
    worstDscrBps: worst?.dscrBps ?? null,
    worstDscrCase: worst?.label ?? null,
    axesWithNoSignal,
    assumptions: [
      `Revenue converts to NOI at ${input.revenueToNoiBps} bps. This is a caller ASSUMPTION, not an observation; the stress is only as good as it.`,
      "Each axis is stressed independently. Cases are never compounded: a combined shock is a separate scenario requiring its own construction.",
      "Interest shocks apply to floating-rate debt only. Fixed-rate debt is unaffected by a rate rise until it refinances.",
      "An asset-value shock affects LTV only. It does not by itself change cash flow, and this engine does not assume it does.",
      "Every stressed figure is SCENARIO. None of it is financial truth and none of it may be posted (§32).",
    ],
    basis: "SCENARIO",
    explanation: [
      `${cases.length} stress cases across three axes.`,
      worst ? `Worst DSCR in the grid: ${worst.dscrBps} bps under "${worst.label}".` : "No case produced a defined DSCR, so the grid carries no serviceability signal.",
      axesWithNoSignal.length > 0 ? `Axes with no signal: ${axesWithNoSignal.join(", ")} — every case on them was undefined.` : "Every axis produced at least one defined case.",
      "A stressed number is not a decision. Whether a stressed DSCR is acceptable is a ratified risk appetite (CAP-004, CAP-005); this engine reports the number and names the dependency.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

export type DebtGradingInput = {
  measures: DebtMeasureSet;
  /** Ladder for DSCR (a floor: higher is better). */
  dscrLadder: RedLineLadder | null;
  /** Ladder for interest coverage (a floor). */
  interestCoverageLadder: RedLineLadder | null;
  /** Ladder for LTV (a ceiling: lower is better). */
  ltvLadder: RedLineLadder | null;
  /** Ladder for debt/asset (a ceiling). */
  debtToAssetLadder: RedLineLadder | null;
  /** Ladder for refinancing exposure (a ceiling). */
  refinancingLadder: RedLineLadder | null;
  /** Ladder for currency concentration (a ceiling). */
  currencyConcentrationLadder: RedLineLadder | null;
};

export type DebtGrading = {
  engineVersion: string;
  grades: {
    measure: string;
    valueBps: number | null;
    band: FinancialRedLineBand | null;
    /** Why the band is what it is, including "no ladder supplied". */
    basis: string;
  }[];
  /** The worst band across every graded measure. Null when nothing is graded. */
  overall: FinancialRedLineBand | null;
  /** Measures that could not be graded, with the reason. Never silently GREEN. */
  ungraded: { measure: string; reason: string }[];
  explanation: string[];
};

/**
 * Grade the debt book against caller-supplied ladders.
 *
 * A measure with no ladder is reported in `ungraded` with its band `null`, not
 * as GREEN. "Nobody has set a limit" and "everything is fine" are different
 * statements, and collapsing them is how a limit breach reaches a committee
 * unflagged.
 */
export function gradeDebtBook(input: DebtGradingInput): DebtGrading {
  const specs: { measure: string; valueBps: number | null; ladder: RedLineLadder | null }[] = [
    { measure: "DSCR", valueBps: input.measures.dscrBps, ladder: input.dscrLadder },
    { measure: "INTEREST_COVERAGE", valueBps: input.measures.interestCoverageBps, ladder: input.interestCoverageLadder },
    { measure: "LTV", valueBps: input.measures.ltvBps, ladder: input.ltvLadder },
    { measure: "DEBT_TO_ASSET", valueBps: input.measures.debtToAssetBps, ladder: input.debtToAssetLadder },
    { measure: "REFINANCING_EXPOSURE", valueBps: input.measures.refinancingExposureBps, ladder: input.refinancingLadder },
    { measure: "CURRENCY_CONCENTRATION", valueBps: input.measures.currencyConcentrationBps, ladder: input.currencyConcentrationLadder },
  ];

  const grades: DebtGrading["grades"] = [];
  const ungraded: DebtGrading["ungraded"] = [];

  for (const spec of specs) {
    if (spec.ladder === null) {
      ungraded.push({ measure: spec.measure, reason: "No ladder supplied. An unset limit is not a pass." });
      grades.push({ measure: spec.measure, valueBps: spec.valueBps, band: null, basis: "REQUIRES_POLICY: no threshold has been ratified for this measure." });
      continue;
    }
    if (spec.valueBps === null) {
      ungraded.push({ measure: spec.measure, reason: "The measure is undefined (its denominator is absent)." });
      grades.push({ measure: spec.measure, valueBps: null, band: null, basis: "DATA_NOT_AVAILABLE: the required input is absent." });
      continue;
    }
    const band = gradeRedLine(spec.valueBps, spec.ladder);
    grades.push({ measure: spec.measure, valueBps: spec.valueBps, band, basis: band === null ? "REQUIRES_POLICY" : `Graded against ladder ${spec.ladder.measureCode}.` });
  }

  const bands = grades.map((g) => g.band).filter((b): b is FinancialRedLineBand => b !== null);
  const overall = bands.length === 0 ? null : bands.reduce((worst, b) => (rankOf(b) < rankOf(worst) ? b : worst), bands[0]);

  return {
    engineVersion: FAMILY_DEBT_ENGINE_VERSION,
    grades,
    overall,
    ungraded,
    explanation: [
      `${grades.length} measure(s) graded; ${ungraded.length} ungraded.`,
      overall ? `Worst band across graded measures: ${overall}.` : "No measure could be graded, so no overall band is asserted.",
      ungraded.length > 0 ? `Ungraded: ${ungraded.map((u) => `${u.measure} (${u.reason})`).join("; ")}.` : "Every measure was graded.",
    ],
  };
}

const BAND_ORDER: readonly FinancialRedLineBand[] = ["BLACK", "RED", "ORANGE", "YELLOW", "GREEN"];
function rankOf(band: FinancialRedLineBand): number {
  return BAND_ORDER.indexOf(band);
}
