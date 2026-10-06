/**
 * BEYU OS — LBO ENGINE.
 *
 * FINANCE_OS → Private Equity → Transaction Models → LBO.
 *
 * =============================== WHAT THIS IS ================================
 *
 * A complete, deterministic leveraged-buyout model:
 *
 *   Sources & Uses      purchase price, fees, debt tranches, sponsor equity, rollover
 *   Debt schedule       per-tranche opening balance, interest, mandatory amortisation, cash sweep
 *   Operating forecast  revenue, EBITDA, D&A, EBIT, taxes, capex, working capital, free cash flow
 *   Cash flow           cash available for debt service, sweep, revolver draw if the model allows
 *   Exit                exit EV at the exit multiple, net debt at exit, sponsor proceeds
 *   Returns             MOIC and IRR on the sponsor's own equity cash flows
 *   Sensitivities       exit multiple, revenue growth, EBITDA margin, debt level, interest rate, hold
 *
 * ============================ THE DISCIPLINE IT KEEPS ========================
 *
 *  1. DETERMINISTIC. No randomness, no clock, no solver heuristics. Every arithmetic step is integer
 *     minor units or fixed-point; the IRR comes from the canonical solver. The same input always
 *     produces a byte-identical output, which is what makes a model reviewable and a re-run comparable.
 *
 *  2. REFUSED, NOT FAKED. The following are REFUSED with a reason rather than computed:
 *       · purchase price not covered exactly by sources           (S&U must balance)
 *       · debt/EBITDA above the declared covenant ceiling          (the deal cannot be financed as specified)
 *       · tramsche non-positive equity cheque                      (a buyout with no equity is a fiction)
 *       · exit multiple absent when the exit method is a multiple  (no exit, no exit value)
 *       · interest rate ≤ −100%                                    (discounting undefined)
 *     Refusal is an INVALID outcome naming the reason. It never produces a very large number.
 *
 *  3. NO SILENT ASSUMPTIONS. There is no default growth rate, no default margin, no default exit
 *     multiple and no default tax rate anywhere in this module. Every one is an explicit input whose
 *     provenance is returned on the model.
 *
 *  4. THE MODEL IS VERSIONED. Assumption changes go through `ValuationAssumptionSet` in the valuation
 *     layer, which requires an attributed author and a reason and bumps a version. An LBO run reports
 *     the fingerprint of the assumptions it used, so two runs are comparable only when they are.
 *
 *  5. CAP_POSTING IS UNTOUCHED. This module computes and returns a model. It posts nothing, moves no
 *     money and writes no ledger. A completed LBO model is a DECISION INPUT, and its exit to Finance
 *     OS accounting is a separate governed act.
 */
import { BPS_BASE, FinanceArithmeticError, assertMoney, assertPercent, irrBps, multiple } from "../intelligence/arithmetic";
import type { MetricInput, MetricOutcome, MetricSeedBase, SourceQuality } from "../intelligence/provenance";
import { calculated, invalid, missing, seedFor } from "../intelligence/provenance";
import { assumptionFingerprint, type ValuationAssumptionSet } from "../intelligence/valuation";

export const LBO_ENGINE_VERSION = "lbo-engine-1.0.0";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type LboDebtTranche = {
  /** Stable label, e.g. `TERM_LOAN_B`, `SENIOR_NOTES`, `REVOLVER`. */
  code: string;
  /** Drawn amount at close, integer minor units. */
  amountMinor: number;
  /** All-in interest rate, basis points per annum. */
  interestRateBps: number;
  /** Mandatory amortisation of the ORIGINAL face per year, basis points (500 = 5%/yr). */
  mandatoryAmortisationBps: number;
  /** Whether this tranche participates in the cash sweep. */
  cashSweepEligible: boolean;
  /** Maximum sweep participation of this tranche, basis points (10_000 = 100% of available cash). */
  cashSweepShareBps?: number;
  /**
   * True only for a tranche that is a revolving facility. A revolver is not drawn at close in this
   * model; it is available to fund a cash shortfall, and drawing it is recorded explicitly.
   */
  revolver?: boolean;
  /** Revolver commitment when `revolver` is set. */
  commitmentMinor?: number;
  /** Fixed-fee component (arrangement/commitment fee) paid at close, minor units. */
  arrangementFeeMinor?: number;
};

export type LboOperatingAssumptions = {
  /** Last actual revenue before the buyout year, minor units. */
  baseRevenueMinor: number;
  /** Year-1 revenue growth is measured off the base; each later year off the previous year. */
  revenueGrowthBps: readonly number[];
  ebitdaMarginBps: readonly number[];
  /** D&A as a percentage of that year's revenue. */
  depreciationAmortisationBps: number;
  capexBps: number;
  /** Change in net working capital as a percentage of the revenue CHANGE. */
  workingCapitalBps: number;
  effectiveTaxRateBps: number;
};

export type LboTransaction = {
  /** Purchase price (enterprise value at entry), minor units. Free of transaction fees. */
  purchasePriceMinor: number;
  /** Entry EV/EBITDA multiple, fixed-point scaled by 10^6. Cross-checked against the price. */
  entryMultipleScaled: number;
  /** Entry EBITDA the price was struck on, minor units. Cross-checked against EBITDA/price. */
  entryEbitdaMinor: number;
  /** Advisory, financing and other transaction fees paid at close, minor units. */
  transactionFeeMinor: number;
  /** Pre-existing target cash used to fund the transaction, minor units (reduces the equity cheque). */
  targetCashUsedMinor?: number;
  /** Seller rollover equity, minor units. Reduces the sponsor cheque without reducing ownership value. */
  rolloverEquityMinor?: number;
  /** Sponsor equity cheque size, minor units. The model checks it balances the sources & uses. */
  sponsorEquityMinor: number;
  /** Currency of every monetary figure in the model. */
  currency: string;
};

export type LboExit = {
  method: "MULTIPLE" | "EXPLICIT_VALUE";
  /** Exit EV/EBITDA multiple, fixed-point, when `method` is MULTIPLE. */
  exitMultipleScaled?: number | null;
  /** An explicitly stated exit enterprise value, minor units, when `method` is EXPLICIT_VALUE. */
  exitEnterpriseValueMinor?: number | null;
  /** Holding period in whole years. */
  holdingPeriodYears: number;
};

export type LboModel = {
  seed: MetricSeedBase;
  assumptions: ValuationAssumptionSet;
  transaction: LboTransaction;
  operating: LboOperatingAssumptions;
  debt: readonly LboDebtTranche[];
  exit: LboExit;
  /** Declared leverage ceiling (debt/EBITDA, fixed-point). The model refuses a breach. */
  maximumLeverageScaled?: number | null;
  /** Declared minimum interest coverage (EBITDA/interest, fixed-point). The model refuses a breach. */
  minimumInterestCoverageScaled?: number | null;
  quality?: SourceQuality;
};

/* ------------------------------------------------------------------ */
/* Structures                                                          */
/* ------------------------------------------------------------------ */

export type SourcesAndUses = {
  uses: { purchasePriceMinor: number; transactionFeesMinor: number; totalMinor: number };
  sources: {
    tranches: { code: string; amountMinor: number }[];
    newDebtMinor: number;
    targetCashUsedMinor: number;
    rolloverEquityMinor: number;
    sponsorEquityMinor: number;
    totalMinor: number;
  };
  /** Zero when the sources exactly cover the uses. Any non-zero value is a refusal condition. */
  imbalanceMinor: number;
  totalDebtMinor: number;
  entryEquityMinor: number;
  /** Total debt ÷ entry EBITDA, fixed-point. Null when EBITDA is zero. */
  entryLeverageScaled: number | null;
};

export type DebtScheduleYear = {
  year: number;
  tranches: {
    code: string;
    openingMinor: number;
    interestMinor: number;
    mandatoryAmortisationMinor: number;
    sweepMinor: number;
    closingMinor: number;
  }[];
  openingDebtMinor: number;
  interestMinor: number;
  mandatoryAmortisationMinor: number;
  sweepMinor: number;
  closingDebtMinor: number;
  /** Cash available for debt service before sweep, minor units. Negative means a shortfall. */
  cashAvailableMinor: number;
  revolverDrawnMinor: number;
  closingCashMinor: number;
  /** EBITDA ÷ interest, fixed-point. Null when interest is zero. */
  interestCoverageScaled: number | null;
  /** Closing debt ÷ that year's EBITDA, fixed-point. */
  leverageScaled: number | null;
};

export type LboProjectionYear = {
  year: number;
  revenueMinor: number;
  revenueGrowthBps: number;
  ebitdaMarginBps: number;
  ebitdaMinor: number;
  depreciationAmortisationMinor: number;
  ebitMinor: number;
  taxMinor: number;
  netIncomeMinor: number;
  capexMinor: number;
  workingCapitalChangeMinor: number;
  /** EBITDA − capex − ΔNWC − taxes − interest. Before mandatory amortisation and sweep. */
  cashAvailableForDebtServiceMinor: number;
  debt: DebtScheduleYear;
  /** Closing debt ÷ closing EBITDA, fixed-point. */
  leverageScaled: number | null;
};

export type LboResult = {
  sourcesAndUses: SourcesAndUses;
  years: LboProjectionYear[];
  exitYear: number;
  exitRevenueMinor: number;
  exitEbitdaMinor: number;
  exitEnterpriseValueMinor: number;
  exitNetDebtMinor: number;
  exitEquityValueMinor: number;
  /** Sponsor's cash flows: the negative entry cheque at year 0, the exit proceeds at the exit year. */
  sponsorCashFlowsMinor: number[];
  sponsorMoicScaled: number | null;
  sponsorIrrBps: number | null;
  totalDebtPaydownMinor: number;
  /** Sum of interest paid over the hold. */
  totalInterestMinor: number;
  /** Sum of mandatory amortisation over the hold. */
  totalAmortisationMinor: number;
  /** Sum of cash swept to debt over the hold. */
  totalSweepMinor: number;
  assumptionFingerprint: string;
  currency: string;
  method: string;
};

/* ------------------------------------------------------------------ */
/* Sources & Uses                                                      */
/* ------------------------------------------------------------------ */

/**
 * Build and balance the sources & uses table.
 *
 * The imbalance is COMPUTED and returned before the model is allowed to continue: a sources & uses
 * table that does not balance means one of the inputs is wrong, and a model that proceeds anyway is
 * reporting a deal that cannot close.
 */
export function buildSourcesAndUses(params: {
  transaction: LboTransaction;
  debt: readonly LboDebtTranche[];
  entryEbitdaMinor: number;
}): SourcesAndUses {
  const t = params.transaction;
  assertMoney(t.purchasePriceMinor, "purchasePriceMinor", { allowNegative: false });
  assertMoney(t.transactionFeeMinor, "transactionFeeMinor", { allowNegative: false });
  assertMoney(t.sponsorEquityMinor, "sponsorEquityMinor", { allowNegative: false });
  const targetCash = t.targetCashUsedMinor ?? 0;
  const rollover = t.rolloverEquityMinor ?? 0;
  assertMoney(targetCash, "targetCashUsedMinor", { allowNegative: false });
  assertMoney(rollover, "rolloverEquityMinor", { allowNegative: false });

  const drawnTranches = params.debt.filter((x) => !x.revolver);
  for (const tranche of drawnTranches) {
    assertMoney(tranche.amountMinor, `tranche ${tranche.code} amount`, { allowNegative: false });
    assertPercent(tranche.interestRateBps, `tranche ${tranche.code} interestRateBps`, { allowNegative: false });
    assertPercent(tranche.mandatoryAmortisationBps, `tranche ${tranche.code} mandatoryAmortisationBps`, { allowNegative: false });
  }

  const usesTotal = t.purchasePriceMinor + t.transactionFeeMinor;
  const newDebt = drawnTranches.reduce((a, x) => a + x.amountMinor, 0);
  const arrangementFees = params.debt.reduce((a, x) => a + (x.arrangementFeeMinor ?? 0), 0);
  const sourcesTotal = newDebt + targetCash + rollover + t.sponsorEquityMinor;
  const imbalance = sourcesTotal - (usesTotal + arrangementFees);

  const entryLeverage = multiple(newDebt, params.entryEbitdaMinor);

  return {
    uses: { purchasePriceMinor: t.purchasePriceMinor, transactionFeesMinor: t.transactionFeeMinor, totalMinor: usesTotal },
    sources: {
      tranches: drawnTranches.map((x) => ({ code: x.code, amountMinor: x.amountMinor })),
      newDebtMinor: newDebt,
      targetCashUsedMinor: targetCash,
      rolloverEquityMinor: rollover,
      sponsorEquityMinor: t.sponsorEquityMinor,
      totalMinor: sourcesTotal,
    },
    imbalanceMinor: imbalance,
    totalDebtMinor: newDebt,
    entryEquityMinor: t.sponsorEquityMinor + rollover,
    entryLeverageScaled: entryLeverage.kind === "MULTIPLE" ? entryLeverage.scaled : null,
  };
}

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

function modelInputs(model: LboModel): MetricInput[] {
  const o = model.operating;
  const t = model.transaction;
  const fingerprint = assumptionFingerprint(model.assumptions);
  return [
    { name: "purchasePriceMinor", value: String(t.purchasePriceMinor), unit: t.currency, kind: "OBSERVED", source: "signed purchase agreement / offer", period: null, currency: t.currency },
    { name: "entryMultipleScaled", value: String(t.entryMultipleScaled), unit: "MULTIPLE_X1E6", kind: "OBSERVED", source: "negotiated entry multiple", period: null, currency: null },
    { name: "entryEbitdaMinor", value: String(t.entryEbitdaMinor), unit: t.currency, kind: "OBSERVED", source: "entry-year EBITDA", period: null, currency: t.currency },
    { name: "transactionFeeMinor", value: String(t.transactionFeeMinor), unit: t.currency, kind: "OBSERVED", source: "advisory and financing fee estimates", period: null, currency: t.currency },
    { name: "sponsorEquityMinor", value: String(t.sponsorEquityMinor), unit: t.currency, kind: "OBSERVED", source: "fund commitment to this transaction", period: null, currency: t.currency },
    { name: "rolloverEquityMinor", value: String(t.rolloverEquityMinor ?? 0), unit: t.currency, kind: "OBSERVED", source: "seller rollover", period: null, currency: t.currency },
    { name: "targetCashUsedMinor", value: String(t.targetCashUsedMinor ?? 0), unit: t.currency, kind: "OBSERVED", source: "target balance sheet at close", period: null, currency: t.currency },
    { name: "baseRevenueMinor", value: String(o.baseRevenueMinor), unit: t.currency, kind: "OBSERVED", source: "last actual revenue", period: null, currency: t.currency },
    { name: "revenueGrowthBps", value: o.revenueGrowthBps.join(","), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${model.assumptions.modelId} v${model.assumptions.version}`, period: null, currency: null },
    { name: "ebitdaMarginBps", value: o.ebitdaMarginBps.join(","), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${model.assumptions.modelId} v${model.assumptions.version}`, period: null, currency: null },
    { name: "depreciationAmortisationBps", value: String(o.depreciationAmortisationBps), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${model.assumptions.modelId} v${model.assumptions.version}`, period: null, currency: null },
    { name: "capexBps", value: String(o.capexBps), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${model.assumptions.modelId} v${model.assumptions.version}`, period: null, currency: null },
    { name: "workingCapitalBps", value: String(o.workingCapitalBps), unit: "BASIS_POINTS", kind: "ASSUMPTION", source: `model ${model.assumptions.modelId} v${model.assumptions.version}`, period: null, currency: null },
    { name: "effectiveTaxRateBps", value: String(o.effectiveTaxRateBps), unit: "BASIS_POINTS", kind: "POLICY", source: `model ${model.assumptions.modelId} v${model.assumptions.version}`, period: null, currency: null },
    { name: "debtTranches", value: model.debt.map((x) => `${x.code}:${x.amountMinor}@${x.interestRateBps}bps/amort${x.mandatoryAmortisationBps}bps${x.revolver ? "/revolver" : ""}${x.cashSweepEligible ? "/sweep" : ""}`).join(";"), unit: "SET", kind: "OBSERVED", source: "committed financing structure", period: null, currency: null },
    { name: "exitMethod", value: model.exit.method, unit: "ENUM", kind: "POLICY", source: "caller-declared exit assumption", period: null, currency: null },
    { name: "exitMultipleScaled", value: model.exit.exitMultipleScaled === null || model.exit.exitMultipleScaled === undefined ? null : String(model.exit.exitMultipleScaled), unit: "MULTIPLE_X1E6", kind: "ASSUMPTION", source: `model ${model.assumptions.modelId} v${model.assumptions.version}`, period: null, currency: null },
    { name: "exitEnterpriseValueMinor", value: model.exit.exitEnterpriseValueMinor === null || model.exit.exitEnterpriseValueMinor === undefined ? null : String(model.exit.exitEnterpriseValueMinor), unit: t.currency, kind: "ASSUMPTION", source: "caller-declared exit enterprise value", period: null, currency: t.currency },
    { name: "holdingPeriodYears", value: String(model.exit.holdingPeriodYears), unit: "YEARS", kind: "POLICY", source: "caller-declared hold period", period: null, currency: null },
    { name: "assumptionFingerprint", value: fingerprint, unit: "FINGERPRINT", kind: "DERIVED", source: "valuation-engine", period: null, currency: null },
  ];
}

/**
 * Run the full LBO model.
 *
 * Structure of the computation, in order, because a later stage depends on an earlier refusal:
 *   1. structural validation          → THROWS on malformed input (a programming error, not a result)
 *   2. sources & uses balance         → REFUSES when it does not balance
 *   3. declared leverage ceiling      → REFUSES on breach
 *   4. entry multiple cross-check     → REFUSES when price and multiple contradict each other
 *   5. operating + debt forecast      → year by year, with the cash sweep
 *   6. interest-coverage covenant     → REFUSES on breach in any year
 *   7. exit and sponsor returns       → MOIC and IRR
 */
export function runLboModel(model: LboModel): MetricOutcome<LboResult> {
  const seed = () =>
    seedFor(
      model.seed,
      "FIN.LBO.MODEL",
      "LBO: sources & uses → operating forecast → debt schedule with cash sweep → exit at the declared method → sponsor MOIC and IRR",
      modelInputs(model),
      {
        period: `${model.exit.holdingPeriodYears}Y hold`,
        currency: model.transaction.currency,
        sourceTimestamp: model.assumptions.authoredAt,
        quality: model.quality ?? "MANAGEMENT",
      },
    );

  /* ---- 1. structural validation ---------------------------------- */
  const o = model.operating;
  if (o.revenueGrowthBps.length === 0) {
    throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", "An LBO model requires at least one forecast year.", {});
  }
  if (o.revenueGrowthBps.length !== o.ebitdaMarginBps.length) {
    throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", "The LBO model requires one EBITDA margin per forecast year.", {});
  }
  o.revenueGrowthBps.forEach((bps, i) => assertPercent(bps, `revenueGrowthBps[${i}]`));
  o.ebitdaMarginBps.forEach((bps, i) => assertPercent(bps, `ebitdaMarginBps[${i}]`));
  assertPercent(o.depreciationAmortisationBps, "depreciationAmortisationBps");
  assertPercent(o.capexBps, "capexBps");
  assertPercent(o.workingCapitalBps, "workingCapitalBps");
  assertPercent(o.effectiveTaxRateBps, "effectiveTaxRateBps");
  if (!Number.isSafeInteger(model.exit.holdingPeriodYears) || model.exit.holdingPeriodYears <= 0) {
    throw new FinanceArithmeticError("INVALID_RATIO", "The holding period must be a positive whole number of years.", {
      holdingPeriodYears: model.exit.holdingPeriodYears,
    });
  }
  if (model.exit.holdingPeriodYears > o.revenueGrowthBps.length) {
    throw new FinanceArithmeticError(
      "INSUFFICIENT_INPUTS",
      `The exit is at year ${model.exit.holdingPeriodYears}, but the forecast only covers ${o.revenueGrowthBps.length} year(s). Extend the forecast or shorten the hold.`,
      {},
    );
  }
  for (const tranche of model.debt) {
    if (tranche.interestRateBps <= -BPS_BASE) {
      throw new FinanceArithmeticError("INVALID_RATE" as never, `Tranche ${tranche.code} has an interest rate at or below −100%, which is undefined.`, {
        tranche: tranche.code,
      });
    }
  }

  /* ---- 2. sources & uses ----------------------------------------- */
  const sourcesAndUses = buildSourcesAndUses({ transaction: model.transaction, debt: model.debt, entryEbitdaMinor: model.transaction.entryEbitdaMinor });
  if (sourcesAndUses.imbalanceMinor !== 0) {
    return invalid(
      seed(),
      `The sources & uses table does not balance: sources exceed uses by ${sourcesAndUses.imbalanceMinor} minor units. A model whose financing does not fund its uses describes a transaction that cannot close.`,
    );
  }
  if (sourcesAndUses.entryEquityMinor <= 0) {
    return invalid(seed(), "The entry equity cheque is zero or negative. A leveraged buyout with no equity is not a financing structure.");
  }

  /* ---- 3. entry multiple cross-check ----------------------------- */
  if (model.transaction.entryMultipleScaled > 0 && model.transaction.entryEbitdaMinor > 0) {
    const impliedPrice = Math.round((model.transaction.entryEbitdaMinor * model.transaction.entryMultipleScaled) / 1_000_000);
    const deviation = Math.abs(impliedPrice - model.transaction.purchasePriceMinor);
    // A 1% tolerance accommodates the rounding inherent in stating a multiple to two decimals.
    const tolerance = Math.max(1, Math.round(model.transaction.purchasePriceMinor / 100));
    if (deviation > tolerance) {
      return invalid(
        seed(),
        `The entry multiple (${model.transaction.entryMultipleScaled / 1_000_000}×) applied to entry EBITDA implies a price of ${impliedPrice} minor units, but the purchase price is ${model.transaction.purchasePriceMinor}. The two inputs contradict each other.`,
      );
    }
  }

  /* ---- 4. declared leverage ceiling ------------------------------ */
  if (model.maximumLeverageScaled !== null && model.maximumLeverageScaled !== undefined) {
    if (sourcesAndUses.entryLeverageScaled === null) {
      return invalid(seed(), "A leverages ceiling was declared but entry EBITDA is zero, so leverage cannot be measured.");
    }
    if (sourcesAndUses.entryLeverageScaled > model.maximumLeverageScaled) {
      return invalid(
        seed(),
        `Entry leverage of ${(sourcesAndUses.entryLeverageScaled / 1_000_000).toFixed(2)}× exceeds the declared ceiling of ${(model.maximumLeverageScaled / 1_000_000).toFixed(2)}×. The deal is refused at the declared ceiling rather than modelled outside it.`,
      );
    }
  }

  /* ---- 5. operating forecast and debt schedule ------------------- */
  const balances = new Map<string, number>();
  for (const tranche of model.debt) balances.set(tranche.code, tranche.arrangementFeeMinor ? tranche.amountMinor : tranche.amountMinor);
  const years: LboProjectionYear[] = [];
  let revenue = o.baseRevenueMinor;
  let cash = 0;
  let totalInterest = 0;
  let totalAmortisation = 0;
  let totalSweep = 0;

  for (let i = 0; i < o.revenueGrowthBps.length; i += 1) {
    const growthBps = o.revenueGrowthBps[i];
    const marginBps = o.ebitdaMarginBps[i];
    const priorRevenue = revenue;
    revenue = Math.round((priorRevenue * (BPS_BASE + growthBps)) / BPS_BASE);
    if (revenue <= 0) {
      return invalid(seed(), `The forecast implies non-positive revenue in year ${i + 1}; the model is refused rather than continued.`);
    }
    const ebitda = Math.round((revenue * marginBps) / BPS_BASE);
    const da = Math.round((revenue * o.depreciationAmortisationBps) / BPS_BASE);
    const ebit = ebitda - da;
    const tax = ebit > 0 ? Math.round((ebit * o.effectiveTaxRateBps) / BPS_BASE) : 0;
    const netIncome = ebit - tax;
    const capex = Math.round((revenue * o.capexBps) / BPS_BASE);
    const wcChange = Math.round(((revenue - priorRevenue) * o.workingCapitalBps) / BPS_BASE);

    // Interest is charged on the OPENING balance of each tranche: a simplifying convention, stated,
    // that avoids assuming an intra-year repayment schedule the model does not hold.
    const openingBalances = new Map(balances);
    let interest = 0;
    for (const tranche of model.debt) {
      const opening = openingBalances.get(tranche.code) ?? 0;
      if (opening <= 0) continue;
      const charge = Math.round((opening * Math.max(tranche.interestRateBps, 0)) / BPS_BASE);
      interest += charge;
    }
    totalInterest += interest;

    const cashAvailable = ebitda - capex - wcChange - tax - interest;

    // Mandatory amortisation, capped at the outstanding balance.
    let amortisation = 0;
    const mandatory = new Map<string, number>();
    for (const tranche of model.debt) {
      if (tranche.revolver) {
        mandatory.set(tranche.code, 0);
        continue;
      }
      const opening = openingBalances.get(tranche.code) ?? 0;
      if (opening <= 0 || tranche.mandatoryAmortisationBps <= 0) {
        mandatory.set(tranche.code, 0);
        continue;
      }
      const amount = Math.min(opening, Math.round((tranche.amountMinor * tranche.mandatoryAmortisationBps) / BPS_BASE));
      mandatory.set(tranche.code, amount);
      amortisation += amount;
    }

    // A cash shortfall is funded by the revolver, if one exists, or reported as a shortfall.
    let revolverDrawn = 0;
    let available = cashAvailable - amortisation;
    if (available < 0) {
      const revolver = model.debt.find((x) => x.revolver);
      if (revolver) {
        const currentRevolver = balances.get(revolver.code) ?? 0;
        const headroom = Math.max(0, (revolver.commitmentMinor ?? 0) - currentRevolver);
        revolverDrawn = Math.min(headroom, -available);
        available += revolverDrawn;
      }
    }
    if (available < 0) {
      return invalid(
        seed(),
        `The model produces a cash shortfall of ${-available} minor units in year ${i + 1} that no revolver can fund. The structure is not financeable as specified.`,
      );
    }

    // Cash sweep: available cash above a zero minimum cash balance repays sweep-eligible tranches.
    const sweepByTranche = new Map<string, number>();
    let sweepRemaining = available;
    for (const tranche of model.debt) {
      if (!tranche.cashSweepEligible || sweepRemaining <= 0) continue;
      const opening = openingBalances.get(tranche.code) ?? 0;
      const afterMandatory = Math.max(0, opening - (mandatory.get(tranche.code) ?? 0));
      if (afterMandatory <= 0) continue;
      const share = tranche.cashSweepShareBps ?? BPS_BASE;
      const cap = Math.round((afterMandatory * share) / BPS_BASE);
      const applied = Math.min(cap, sweepRemaining);
      sweepByTranche.set(tranche.code, applied);
      sweepRemaining -= applied;
    }
    const sweep = available - sweepRemaining;
    totalAmortisation += amortisation;
    totalSweep += sweep;

    const trancheRows: DebtScheduleYear["tranches"] = [];
    let openingDebt = 0;
    let closingDebt = 0;
    for (const tranche of model.debt) {
      const opening = openingBalances.get(tranche.code) ?? 0;
      const amort = mandatory.get(tranche.code) ?? 0;
      const swept = sweepByTranche.get(tranche.code) ?? 0;
      const drawn = tranche.revolver ? revolverDrawn : 0;
      const closing = Math.max(0, opening - amort - swept + drawn);
      balances.set(tranche.code, closing);
      const charge = opening > 0 ? Math.round((opening * Math.max(tranche.interestRateBps, 0)) / BPS_BASE) : 0;
      trancheRows.push({ code: tranche.code, openingMinor: opening, interestMinor: charge, mandatoryAmortisationMinor: amort, sweepMinor: swept, closingMinor: closing });
      openingDebt += opening;
      closingDebt += closing;
    }

    cash = Math.max(0, sweepRemaining);

    const coverage = multiple(ebitda, interest);
    const leverage = multiple(closingDebt, ebitda);

    const debtYear: DebtScheduleYear = {
      year: i + 1,
      tranches: trancheRows,
      openingDebtMinor: openingDebt,
      interestMinor: interest,
      mandatoryAmortisationMinor: amortisation,
      sweepMinor: sweep,
      closingDebtMinor: closingDebt,
      cashAvailableMinor: cashAvailable,
      revolverDrawnMinor: revolverDrawn,
      closingCashMinor: cash,
      interestCoverageScaled: coverage.kind === "MULTIPLE" ? coverage.scaled : null,
      leverageScaled: leverage.kind === "MULTIPLE" ? leverage.scaled : null,
    };

    years.push({
      year: i + 1,
      revenueMinor: revenue,
      revenueGrowthBps: growthBps,
      ebitdaMarginBps: marginBps,
      ebitdaMinor: ebitda,
      depreciationAmortisationMinor: da,
      ebitMinor: ebit,
      taxMinor: tax,
      netIncomeMinor: netIncome,
      capexMinor: capex,
      workingCapitalChangeMinor: wcChange,
      cashAvailableForDebtServiceMinor: cashAvailable,
      debt: debtYear,
      leverageScaled: leverage.kind === "MULTIPLE" ? leverage.scaled : null,
    });
  }

  /* ---- 6. declared interest-coverage covenant -------------------- */
  if (model.minimumInterestCoverageScaled !== null && model.minimumInterestCoverageScaled !== undefined) {
    for (const year of years) {
      if (year.debt.interestCoverageScaled === null) continue; // no interest, no coverage test
      if (year.debt.interestCoverageScaled < model.minimumInterestCoverageScaled) {
        return invalid(
          seed(),
          `Interest coverage in year ${year.year} is ${(year.debt.interestCoverageScaled / 1_000_000).toFixed(2)}×, below the declared minimum of ${(model.minimumInterestCoverageScaled / 1_000_000).toFixed(2)}×. The model is refused at the covenant breach rather than presented as financeable.`,
        );
      }
    }
  }

  /* ---- 7. exit and sponsor returns ------------------------------- */
  const exitYear = model.exit.holdingPeriodYears;
  const exitYearRow = years[exitYear - 1];
  let exitEnterpriseValue: number;
  if (model.exit.method === "MULTIPLE") {
    if (model.exit.exitMultipleScaled === null || model.exit.exitMultipleScaled === undefined) {
      return missing(seed(), "The exit method is a multiple but no exit multiple was supplied. An LBO has no exit value without one.");
    }
    if (model.exit.exitMultipleScaled <= 0) {
      return invalid(seed(), "The exit multiple must be positive.");
    }
    exitEnterpriseValue = Math.round((exitYearRow.ebitdaMinor * model.exit.exitMultipleScaled) / 1_000_000);
  } else {
    if (model.exit.exitEnterpriseValueMinor === null || model.exit.exitEnterpriseValueMinor === undefined) {
      return missing(seed(), "The exit method is an explicit value but none was supplied.");
    }
    exitEnterpriseValue = model.exit.exitEnterpriseValueMinor;
  }
  assertMoney(exitEnterpriseValue, "exitEnterpriseValue");

  const exitNetDebt = exitYearRow.debt.closingDebtMinor - exitYearRow.debt.closingCashMinor;
  const exitEquityValue = exitEnterpriseValue - exitNetDebt;
  assertMoney(exitEquityValue, "exitEquityValue");

  // The sponsor's own cash flows: the entry equity cheque out, the exit equity proceeds in. Rollover
  // equity belongs to the seller, so it is NOT part of the sponsor's return — including it would
  // flatter the sponsor's MOIC by counting someone else's money as theirs.
  const sponsorCashFlows: number[] = [-model.transaction.sponsorEquityMinor];
  for (let year = 1; year < exitYear; year += 1) sponsorCashFlows.push(0);
  sponsorCashFlows.push(exitEquityValue);

  const moicResult = multiple(exitEquityValue, model.transaction.sponsorEquityMinor);
  const sponsorMoic = moicResult.kind === "MULTIPLE" ? moicResult.scaled : null;
  if (exitEquityValue <= 0) {
    return invalid(
      seed(),
      `The exit equity value is ${exitEquityValue} minor units: at the declared exit assumption the enterprise value does not cover exit net debt of ${exitNetDebt}. The sponsor's equity is not returned, so a MOIC and IRR in the usual sense do not exist.`,
    );
  }
  const sponsorIrr = irrBps(sponsorCashFlows);

  const result: LboResult = {
    sourcesAndUses,
    years,
    exitYear,
    exitRevenueMinor: exitYearRow.revenueMinor,
    exitEbitdaMinor: exitYearRow.ebitdaMinor,
    exitEnterpriseValueMinor: exitEnterpriseValue,
    exitNetDebtMinor: exitNetDebt,
    exitEquityValueMinor: exitEquityValue,
    sponsorCashFlowsMinor: sponsorCashFlows,
    sponsorMoicScaled: sponsorMoic,
    sponsorIrrBps: sponsorIrr,
    totalDebtPaydownMinor: sourcesAndUses.totalDebtMinor - years[years.length - 1].debt.closingDebtMinor,
    totalInterestMinor: totalInterest,
    totalAmortisationMinor: totalAmortisation,
    totalSweepMinor: totalSweep,
    assumptionFingerprint: assumptionFingerprint(model.assumptions),
    currency: model.transaction.currency,
    method: "LBO: S&U → operating forecast → debt schedule with cash sweep → exit → sponsor MOIC/IRR",
  };
  return calculated(seed(), result);
}

/* ------------------------------------------------------------------ */
/* Sensitivities                                                       */
/* ------------------------------------------------------------------ */

export const LBO_SENSITIVITY_AXES = [
  "EXIT_MULTIPLE",
  "REVENUE_GROWTH",
  "EBITDA_MARGIN",
  "TOTAL_DEBT",
  "INTEREST_RATE",
  "HOLDING_PERIOD",
  "ENTRY_MULTIPLE",
] as const;
export type LboSensitivityAxis = (typeof LBO_SENSITIVITY_AXES)[number];

export type LboSensitivityCell = {
  row: number;
  column: number;
  sponsorMoicScaled: number | null;
  sponsorIrrBps: number | null;
  exitEquityValueMinor: number | null;
  state: string;
  reason: string | null;
};

export type LboSensitivityTable = {
  rowAxis: LboSensitivityAxis;
  columnAxis: LboSensitivityAxis;
  rowValues: readonly number[];
  columnValues: readonly number[];
  cells: LboSensitivityCell[];
  fingerprint: string;
};

/**
 * Two-axis LBO sensitivity.
 *
 * Every cell is a COMPLETE model run at the perturbed assumption, not a linear interpolation. Cells the
 * model refuses carry the refusal reason: in an LBO, the boundary between "finances" and "does not
 * finance" is the most important information on the page, and a grid that dropped those cells would
 * hide it.
 */
export function lboSensitivity(params: {
  model: Omit<LboModel, "seed"> & { seed?: undefined };
  rowAxis: LboSensitivityAxis;
  columnAxis: LboSensitivityAxis;
  rowValues: readonly number[];
  columnValues: readonly number[];
}): LboSensitivityTable {
  if (params.rowAxis === params.columnAxis) {
    throw new FinanceArithmeticError("INVALID_RATIO", "An LBO sensitivity table needs two different axes.", { axis: params.rowAxis });
  }
  const cells: LboSensitivityCell[] = [];
  let counter = 0;
  for (let r = 0; r < params.rowValues.length; r += 1) {
    for (let c = 0; c < params.columnValues.length; c += 1) {
      const perturbed = applyLboAxes(params.model, [
        { axis: params.rowAxis, value: params.rowValues[r] },
        { axis: params.columnAxis, value: params.columnValues[c] },
      ]);
      let cell: LboSensitivityCell;
      try {
        const outcome = runLboModel({
          ...perturbed,
          seed: { subject: { subjectType: "DEAL", subjectId: `LBO-SENS-${++counter}` }, dataTimestamp: null, nextId: () => `SENS-${counter}` },
        });
        cell =
          outcome.kind === "VALUE"
            ? {
                row: r,
                column: c,
                sponsorMoicScaled: outcome.value.sponsorMoicScaled,
                sponsorIrrBps: outcome.value.sponsorIrrBps,
                exitEquityValueMinor: outcome.value.exitEquityValueMinor,
                state: outcome.state,
                reason: null,
              }
            : {
                row: r,
                column: c,
                sponsorMoicScaled: null,
                sponsorIrrBps: null,
                exitEquityValueMinor: null,
                state: outcome.state,
                reason: outcome.reason,
              };
      } catch (error) {
        cell = {
          row: r,
          column: c,
          sponsorMoicScaled: null,
          sponsorIrrBps: null,
          exitEquityValueMinor: null,
          state: "INVALID",
          reason: error instanceof FinanceArithmeticError ? error.message : "The model could not be evaluated at these axis values.",
        };
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
    fingerprint: assumptionFingerprint(params.model.assumptions),
  };
}

function applyLboAxes(
  model: Omit<LboModel, "seed"> & { seed?: undefined },
  axes: readonly { axis: LboSensitivityAxis; value: number }[],
): Omit<LboModel, "seed"> & { seed?: undefined } {
  const next: Omit<LboModel, "seed"> & { seed?: undefined } = {
    ...model,
    transaction: { ...model.transaction },
    operating: { ...model.operating, revenueGrowthBps: [...model.operating.revenueGrowthBps], ebitdaMarginBps: [...model.operating.ebitdaMarginBps] },
    debt: model.debt.map((t) => ({ ...t })),
    exit: { ...model.exit },
  };
  for (const { axis, value } of axes) {
    switch (axis) {
      case "EXIT_MULTIPLE":
        next.exit = { ...next.exit, method: "MULTIPLE", exitMultipleScaled: value };
        break;
      case "REVENUE_GROWTH":
        next.operating = { ...next.operating, revenueGrowthBps: model.operating.revenueGrowthBps.map(() => value) };
        break;
      case "EBITDA_MARGIN":
        next.operating = { ...next.operating, ebitdaMarginBps: model.operating.ebitdaMarginBps.map(() => value) };
        break;
      case "TOTAL_DEBT": {
        // Rescale every drawn tranche pro-rata so the structure keeps its shape, then re-balance the
        // equity cheque against the new debt total: a sensitivity on leverage that left the sources &
        // uses table unbalanced would produce a refusal in every cell.
        const originalDebt = model.debt.filter((t) => !t.revolver).reduce((a, t) => a + t.amountMinor, 0);
        if (originalDebt <= 0) break;
        const tranches = next.debt.map((t) => (t.revolver ? t : { ...t, amountMinor: Math.round((model.debt.find((d) => d.code === t.code)!.amountMinor * value) / originalDebt) }));
        const newDebt = tranches.filter((t) => !t.revolver).reduce((a, t) => a + t.amountMinor, 0);
        const usesTotal =
          model.transaction.purchasePriceMinor + model.transaction.transactionFeeMinor + tranches.reduce((a, t) => a + (t.arrangementFeeMinor ?? 0), 0);
        const otherSources = (model.transaction.targetCashUsedMinor ?? 0) + (model.transaction.rolloverEquityMinor ?? 0);
        next.debt = tranches;
        next.transaction = { ...next.transaction, sponsorEquityMinor: Math.max(0, usesTotal - newDebt - otherSources) };
        break;
      }
      case "INTEREST_RATE": {
        // Parallel shift of the whole capital structure: the marginal cost of debt moves for every
        // tranche at once, which is how a rate sensitivity is actually read.
        const delta = value - model.debt[0]?.interestRateBps;
        next.debt = next.debt.map((t) => ({ ...t, interestRateBps: Math.max(0, t.interestRateBps + delta) }));
        break;
      }
      case "HOLDING_PERIOD":
        if (value > 0) next.exit = { ...next.exit, holdingPeriodYears: value };
        break;
      case "ENTRY_MULTIPLE": {
        const newPrice = Math.round((model.transaction.entryEbitdaMinor * value) / 1_000_000);
        const usesTotal = newPrice + model.transaction.transactionFeeMinor + next.debt.reduce((a, t) => a + (t.arrangementFeeMinor ?? 0), 0);
        const newDebt = next.debt.filter((t) => !t.revolver).reduce((a, t) => a + t.amountMinor, 0);
        const otherSources = (model.transaction.targetCashUsedMinor ?? 0) + (model.transaction.rolloverEquityMinor ?? 0);
        next.transaction = {
          ...next.transaction,
          purchasePriceMinor: newPrice,
          entryMultipleScaled: value,
          sponsorEquityMinor: Math.max(0, usesTotal - newDebt - otherSources),
        };
        break;
      }
      default: {
        const never: never = axis;
        throw new FinanceArithmeticError("INVALID_RATIO", `Unknown LBO sensitivity axis ${String(never)}.`, {});
      }
    }
  }
  return next;
}
