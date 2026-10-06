/**
 * BEYU OS — PRIVATE CAPITAL: fund and deal return metrics.
 *
 * FINANCE_OS → Capital Management → Private Capital / Private Equity → Metrics.
 *
 * =============================== WHAT THIS IS ================================
 *
 * The private-capital performance vocabulary, computed from governed ledger facts:
 *
 *   COMMITMENT      what an investor promised
 *   CALLED CAPITAL  what has actually been drawn (PIC = called ÷ commitment)
 *   UNCALLED        commitment − called
 *   INVESTED        what the fund put into portfolio companies
 *   REALIZED        cash actually returned to investors
 *   UNREALIZED      the current mark of what has not been sold
 *   TOTAL VALUE     realized + unrealized
 *
 *   IRR   the discounted rate that zeroes the investor's net cash-flow stream
 *   MOIC  total value ÷ invested capital
 *   DPI   realized ÷ paid-in      ("cash-on-cash" to the LP)
 *   TVPI  total value ÷ paid-in   ("total value to paid-in")
 *   RVPI  unrealized ÷ paid-in    ("residual value to paid-in")
 *
 * ============================ THE DISCIPLINE IT KEEPS ========================
 *
 *  * ESTIMATES ARE NEVER VERIFIED. An UNREALIZED value is a mark — an opinion with a date. IRRs and
 *    TVPI/RVPI that depend on it are therefore FORECAST/ESTIMATE at best, and this module states that
 *    in the result rather than burying it. A DPI depends only on cash actually moved, so it can be
 *    CALCULATED; a TVPI never can while any holding is unexited.
 *
 *  * IRR USES THE CANONICAL SOLVER. `irrBps` from the shared capital-arithmetic core — the same
 *    function the Family Office uses. Two IRR implementations that differed by a basis point would
 *    make two governance reports disagree about the same fund.
 *
 *  * IRR DOES NOT EXIST. A stream with no sign change (all contributions, no distributions yet) has
 *    no IRR. That is returned as `null` from the solver and surfaced as an explicit state — never as
 *    0%, which would read as "the fund is exactly break-even".
 *
 *  * A NEGATIVE NET CASH FLOW IS A CONTRIBUTION. Sign convention: contributions are NEGATIVE to the
 *    investor, distributions POSITIVE. This module builds the stream; callers do not hand-assemble it,
 *    because a sign error there produces a plausible but wrong IRR.
 *
 * Money is integer minor units; rates are basis points. No floating point touches a monetary figure.
 */
import {
  BPS_BASE,
  FinanceArithmeticError,
  assertMoney,
  assertPercent,
  irrBps,
  multiple,
  scaleDivide,
} from "../intelligence/arithmetic";
import type { MetricInput, MetricOutcome, MetricSeedBase } from "../intelligence/provenance";
import { calculated, estimated, forecasted, invalid, missing, provenance as buildProvenance, seedFor, valueOrNull } from "../intelligence/provenance";

export const PRIVATE_CAPITAL_METRICS_VERSION = "private-capital-metrics-1.0.0";

/* ------------------------------------------------------------------ */
/* Fund capital accounts                                               */
/* ------------------------------------------------------------------ */

export const CAPITAL_ACCOUNT_CLASS = [
  "LP",
  "GP",
  "CO_INVESTOR",
  "PARALLEL_VEHICLE",
  "EMPLOYEE_VEHICLE",
] as const;
export type CapitalAccountClass = (typeof CAPITAL_ACCOUNT_CLASS)[number];

/**
 * One investor's (or the GP's) position in one fund.
 *
 * All seven figures are supplied by the caller from governed ledger rows — this type does not read
 * the database, and it does not infer called capital from a commitment percentage, because a fund can
 * be over- or under-called against its schedule and the ledger is the truth.
 */
export type CapitalAccountPosition = {
  accountId: string;
  accountClass: CapitalAccountClass;
  /** Total commitment, minor units. */
  commitmentMinor: number;
  /** Capital actually called and paid (paid-in capital). */
  paidInMinor: number;
  /** Cumulative distributions actually paid to this account. */
  distributedMinor: number;
  /** Current mark of the account's remaining holdings. 0 when nothing is held. */
  unrealizedMinor: number;
  /** Management fees charged to this account to date. */
  managementFeesMinor?: number;
  /** Carried interest allocated to this account (only ever non-zero for GP-class accounts). */
  carriedInterestMinor?: number;
  currency: string;
};

export type FundCashFlow = {
  /** ISO-8601 date, used only for ordering and for the XIRR-ready record; never parsed for periodicity. */
  date: string;
  /** NEGATIVE for a contribution, POSITIVE for a distribution. */
  amountMinor: number;
  kind: "CONTRIBUTION" | "DISTRIBUTION" | "FEE" | "EXPENSE";
};

/**
 * Build the investor's net cash-flow stream from governed records.
 *
 * Sign convention is fixed HERE and stated: contributions, fees and expenses paid by the investor are
 * NEGATIVE; distributions are POSITIVE. The final entry is the current unrealized value added as a
 * terminal positive flow when `includeUnrealizedAsTerminal` is set — and the caller then knows the
 * resulting IRR is a FORECAST, not a realized one.
 */
export function buildInvestorCashFlows(params: {
  flows: readonly FundCashFlow[];
  includeUnrealizedAsTerminal?: number;
}): number[] {
  const ordered = [...params.flows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const stream: number[] = [];
  for (const flow of ordered) {
    assertMoney(flow.amountMinor, `flow ${flow.date}`);
    switch (flow.kind) {
      case "CONTRIBUTION":
        if (flow.amountMinor > 0) {
          throw new FinanceArithmeticError(
            "INVALID_MONEY",
            `A CONTRIBUTION on ${flow.date} was supplied as a positive amount. Contributions are cash OUT of the investor's pocket and must be negative.`,
            { date: flow.date },
          );
        }
        stream.push(flow.amountMinor);
        break;
      case "DISTRIBUTION":
        if (flow.amountMinor < 0) {
          throw new FinanceArithmeticError("INVALID_MONEY", `A DISTRIBUTION on ${flow.date} was supplied as a negative amount. Distributions are cash IN.`, {
            date: flow.date,
          });
        }
        stream.push(flow.amountMinor);
        break;
      case "FEE":
      case "EXPENSE":
        stream.push(-Math.abs(flow.amountMinor));
        break;
      default: {
        const never: never = flow.kind;
        throw new FinanceArithmeticError("INVALID_MONEY", `Unknown cash-flow kind ${String(never)}.`, {});
      }
    }
  }
  if (params.includeUnrealizedAsTerminal !== undefined) {
    if (params.includeUnrealizedAsTerminal < 0) {
      throw new FinanceArithmeticError("INVALID_MONEY", "An unrealized terminal value must not be negative.", {});
    }
    stream.push(params.includeUnrealizedAsTerminal);
  }
  return stream;
}

/* ------------------------------------------------------------------ */
/* Fund aggregate                                                      */
/* ------------------------------------------------------------------ */

export type FundAggregate = {
  currency: string;
  accounts: number;
  commitmentMinor: number;
  paidInMinor: number;
  uncalledMinor: number;
  distributedMinor: number;
  unrealizedMinor: number;
  totalValueMinor: number;
  managementFeesMinor: number;
  carriedInterestMinor: number;
};

/**
 * Aggregate capital accounts into one fund position.
 *
 * Every figure is a plain sum of governed rows, so the aggregate can never disagree with the ledger
 * it was derived from. Currencies must agree: a fund whose accounts are denominated differently
 * cannot be summed, and the engine refuses rather than producing a mixed-currency total (§4A).
 */
export function aggregateFund(params: { currency: string; accounts: readonly CapitalAccountPosition[] }): FundAggregate {
  const mismatched = params.accounts.filter((a) => a.currency.toUpperCase() !== params.currency.toUpperCase());
  if (mismatched.length > 0) {
    throw new FinanceArithmeticError(
      "INVALID_MONEY",
      `Capital accounts must share the fund's currency ${params.currency}; ${mismatched.length} account(s) are denominated differently. Convert with a governed FX rate first.`,
      { currency: params.currency, accounts: mismatched.map((a) => a.accountId) },
    );
  }
  let commitment = 0;
  let paidIn = 0;
  let distributed = 0;
  let unrealized = 0;
  let fees = 0;
  let carry = 0;
  for (const account of params.accounts) {
    assertMoney(account.commitmentMinor, `${account.accountId}.commitment`, { allowNegative: false });
    assertMoney(account.paidInMinor, `${account.accountId}.paidIn`, { allowNegative: false });
    assertMoney(account.distributedMinor, `${account.accountId}.distributed`, { allowNegative: false });
    assertMoney(account.unrealizedMinor, `${account.accountId}.unrealized`);
    assertMoney(account.managementFeesMinor ?? 0, `${account.accountId}.managementFees`, { allowNegative: false });
    assertMoney(account.carriedInterestMinor ?? 0, `${account.accountId}.carriedInterest`, { allowNegative: false });
    if (account.paidInMinor > account.commitmentMinor) {
      throw new FinanceArithmeticError(
        "INVALID_MONEY",
        `Account ${account.accountId} has paid in ${account.paidInMinor} against a commitment of ${account.commitmentMinor}; paid-in capital cannot exceed the commitment.`,
        { accountId: account.accountId },
      );
    }
    commitment += account.commitmentMinor;
    paidIn += account.paidInMinor;
    distributed += account.distributedMinor;
    unrealized += account.unrealizedMinor;
    fees += account.managementFeesMinor ?? 0;
    carry += account.carriedInterestMinor ?? 0;
  }
  const aggregate: FundAggregate = {
    currency: params.currency,
    accounts: params.accounts.length,
    commitmentMinor: commitment,
    paidInMinor: paidIn,
    uncalledMinor: commitment - paidIn,
    distributedMinor: distributed,
    unrealizedMinor: unrealized,
    totalValueMinor: distributed + unrealized,
    managementFeesMinor: fees,
    carriedInterestMinor: carry,
  };
  for (const [label, value] of Object.entries(aggregate)) {
    if (typeof value === "number") assertMoney(value, `fundAggregate.${label}`);
  }
  return aggregate;
}

/* ------------------------------------------------------------------ */
/* Ratios: MOIC, DPI, TVPI, RVPI, PIC                                  */
/* ------------------------------------------------------------------ */

function inputList(aggregate: FundAggregate): MetricInput[] {
  return [
    { name: "commitmentMinor", value: String(aggregate.commitmentMinor), unit: aggregate.currency, kind: "OBSERVED", source: "capital-account register", period: null, currency: aggregate.currency },
    { name: "paidInMinor", value: String(aggregate.paidInMinor), unit: aggregate.currency, kind: "OBSERVED", source: "capital-call ledger", period: null, currency: aggregate.currency },
    { name: "distributedMinor", value: String(aggregate.distributedMinor), unit: aggregate.currency, kind: "OBSERVED", source: "distribution ledger", period: null, currency: aggregate.currency },
    { name: "unrealizedMinor", value: String(aggregate.unrealizedMinor), unit: aggregate.currency, kind: "ASSUMPTION", source: "current valuation marks (opinion with a date)", period: null, currency: aggregate.currency },
    { name: "accountCount", value: String(aggregate.accounts), unit: "COUNT", kind: "OBSERVED", source: "capital-account register", period: null, currency: null },
  ];
}

export type PrivateCapitalRatio = { scaled: number };

/**
 * Paid-In Capital ratio = called ÷ committed.
 *
 * PIC is measured against cash actually moved, so it is always CALCULATED — never an estimate.
 */
export function paidInCapitalRatio(params: { seed: MetricSeedBase; aggregate: FundAggregate }): MetricOutcome<number> {
  const seed = () =>
    seedFor(params.seed, "FIN.PE.PIC", "PIC = Called (paid-in) capital ÷ Total commitment", inputList(params.aggregate), {
      period: null,
      currency: params.aggregate.currency,
      quality: "MANAGEMENT",
    });
  if (params.aggregate.commitmentMinor === 0) {
    return missing(seed(), "The fund has no commitments, so the paid-in ratio is undefined.");
  }
  const ratio = multiple(params.aggregate.paidInMinor, params.aggregate.commitmentMinor);
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  return calculated(seed(), ratio.scaled);
}

/**
 * DPI = Distributions ÷ Paid-In capital — the cash an LP has actually received per unit invested.
 *
 * DPI depends only on cash that has moved, so it is CALCULATED. It is the one return measure in the
 * private-capital vocabulary that no valuation opinion can improve or damage.
 */
export function dpi(params: { seed: MetricSeedBase; aggregate: FundAggregate }): MetricOutcome<number> {
  const seed = () =>
    seedFor(params.seed, "FIN.PE.DPI", "DPI = Cumulative distributions ÷ Paid-in capital", inputList(params.aggregate), {
      period: null,
      currency: params.aggregate.currency,
      quality: "MANAGEMENT",
    });
  if (params.aggregate.paidInMinor === 0) {
    return missing(seed(), "Nothing has been called, so DPI is undefined. DPI divides by paid-in capital, which is zero.");
  }
  const ratio = multiple(params.aggregate.distributedMinor, params.aggregate.paidInMinor);
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  return calculated(seed(), ratio.scaled);
}

/**
 * RVPI = Unrealized value ÷ Paid-In capital.
 *
 * ALWAYS an estimate: the numerator is a valuation mark. Returning it as CALCULATED, as many systems
 * do, is the single most misleading convention in private-capital reporting.
 */
export function rvpi(params: { seed: MetricSeedBase; aggregate: FundAggregate; markConfidence?: number | null }): MetricOutcome<number> {
  const seed = () =>
    seedFor(params.seed, "FIN.PE.RVPI", "RVPI = Current unrealized value ÷ Paid-in capital (a mark, not a realized figure)", inputList(params.aggregate), {
      period: null,
      currency: params.aggregate.currency,
      quality: "MANAGEMENT",
    });
  if (params.aggregate.paidInMinor === 0) {
    return missing(seed(), "Nothing has been called, so RVPI is undefined.");
  }
  const ratio = multiple(params.aggregate.unrealizedMinor, params.aggregate.paidInMinor, { allowNegativeDenominator: false });
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  return estimated(seed(), ratio.scaled, params.markConfidence ?? null);
}

/**
 * TVPI = (Distributions + Unrealized) ÷ Paid-In capital.
 *
 * ESTIMATED while anything is unrealized. The moment the fund is fully realized — unrealized is zero
 * and every position has been sold — TVPI collapses to (distributions ÷ paid-in) and is exact, so the
 * function returns it as CALCULATED in that specific case. It does not assume the state; it checks it.
 */
export function tvpi(params: { seed: MetricSeedBase; aggregate: FundAggregate; markConfidence?: number | null }): MetricOutcome<number> {
  const seed = () =>
    seedFor(
      params.seed,
      "FIN.PE.TVPI",
      "TVPI = (Cumulative distributions + Current unrealized value) ÷ Paid-in capital",
      inputList(params.aggregate),
      { period: null, currency: params.aggregate.currency, quality: "MANAGEMENT" },
    );
  if (params.aggregate.paidInMinor === 0) {
    return missing(seed(), "Nothing has been called, so TVPI is undefined.");
  }
  const ratio = multiple(params.aggregate.totalValueMinor, params.aggregate.paidInMinor);
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  if (params.aggregate.unrealizedMinor === 0) {
    return calculated(seed(), ratio.scaled);
  }
  return estimated(seed(), ratio.scaled, params.markConfidence ?? null);
}

/**
 * MOIC = Total value ÷ Invested (paid-in) capital.
 *
 * The same arithmetic as TVPI on the same fund-level inputs — they are two names for one ratio at fund
 * level and genuinely differ only at deal level (where invested capital is the equity cheque, not the
 * commitment). At deal level, pass the equity invested as `paidInMinor`.
 */
export function moic(params: { seed: MetricSeedBase; aggregate: FundAggregate; markConfidence?: number | null }): MetricOutcome<number> {
  const seed = () =>
    seedFor(params.seed, "FIN.PE.MOIC", "MOIC = Total value (realized + unrealized) ÷ Invested capital", inputList(params.aggregate), {
      period: null,
      currency: params.aggregate.currency,
      quality: "MANAGEMENT",
    });
  if (params.aggregate.paidInMinor === 0) {
    return missing(seed(), "No capital has been invested, so MOIC is undefined.");
  }
  const ratio = multiple(params.aggregate.totalValueMinor, params.aggregate.paidInMinor);
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  if (params.aggregate.unrealizedMinor === 0) return calculated(seed(), ratio.scaled);
  return estimated(seed(), ratio.scaled, params.markConfidence ?? null);
}

/* ------------------------------------------------------------------ */
/* IRR                                                                 */
/* ------------------------------------------------------------------ */

export type FundIrrResult = {
  /** IRR in basis points, or null when the stream has no IRR. */
  irrBps: number | null;
  /** Whether the IRR includes an unrealized terminal value (making it a forecast, not a realization). */
  includesUnrealized: boolean;
  netCashFlowMinor: number;
  contributionsMinor: number;
  distributionsMinor: number;
  /** Number of periods in the stream; the solver's resolution is per-period, not annualized. */
  periods: number;
};

/**
 * IRR over the investor's net cash-flow stream, using the canonical solver.
 *
 * IMPORTANT AND STATED: `irrBps` solves per PERIOD of the supplied stream. If the stream is annual,
 * the result is an annual IRR. If it is quarterly, it is a quarterly rate. This function does not
 * annualize, because annualizing requires knowing the flow dates and the day-count convention, and
 * inventing either would fabricate a number. The period basis is recorded in the provenance.
 *
 * A stream with no sign change returns an explicit state — "the IRR does not exist yet" — rather than
 * 0%, which is the difference between "break-even" and "not measurable".
 */
export function fundIrr(params: {
  seed: MetricSeedBase;
  stream: readonly number[];
  currency: string;
  periodBasis: "ANNUAL" | "QUARTERLY" | "MONTHLY" | "IRREGULAR";
  includesUnrealized: boolean;
  /** Confidence carried when an unrealized terminal value is included. */
  confidence?: number | null;
}): MetricOutcome<FundIrrResult> {
  const contributions = params.stream.filter((v) => v < 0).reduce((a, b) => a + b, 0);
  const distributions = params.stream.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const net = params.stream.reduce((a, b) => a + b, 0);
  const inputs: MetricInput[] = [
    { name: "cashFlowStream", value: params.stream.join(","), unit: params.currency, kind: "OBSERVED", source: "capital-call and distribution ledger", period: null, currency: params.currency },
    { name: "periodBasis", value: params.periodBasis, unit: "ENUM", kind: "POLICY", source: "caller-declared period basis (the solver is per-period)", period: null, currency: null },
    { name: "includesUnrealizedTerminal", value: String(params.includesUnrealized), unit: "BOOLEAN", kind: "ASSUMPTION", source: "caller-declared", period: null, currency: null },
    { name: "contributionsMinor", value: String(contributions), unit: params.currency, kind: "DERIVED", source: "private-capital-metrics", period: null, currency: params.currency },
    { name: "distributionsMinor", value: String(distributions), unit: params.currency, kind: "DERIVED", source: "private-capital-metrics", period: null, currency: params.currency },
  ];
  const seed = () =>
    seedFor(params.seed, "FIN.PE.IRR", `IRR over the investor's net cash-flow stream (per ${params.periodBasis.toLowerCase()} period)`, inputs, {
      period: null,
      currency: params.currency,
      quality: "MANAGEMENT",
    });

  for (const [i, flow] of params.stream.entries()) assertMoney(flow, `stream[${i}]`);

  if (params.stream.length < 2) {
    return missing(seed(), "An IRR requires at least two cash flows (an investment and a return).");
  }
  if (contributions === 0) {
    return missing(seed(), "The stream contains no contribution, so there is no capital at risk and no IRR.");
  }
  if (distributions === 0) {
    return notApplicableIrr(
      seed(),
      "The fund has made no distributions and holds no marked value, so no IRR exists yet. This is 'not measurable', not 'zero'.",
      contributions,
      distributions,
      net,
      params,
    );
  }

  const rate = irrBps(params.stream);
  const payload: FundIrrResult = {
    irrBps: rate,
    includesUnrealized: params.includesUnrealized,
    netCashFlowMinor: net,
    contributionsMinor: contributions,
    distributionsMinor: distributions,
    periods: params.stream.length,
  };

  if (rate === null) {
    // The solver refuses a stream with no sign change. Surface it as INVALID/not-existent rather than
    // allowing a caller to render `null` as a dash that a reader will read as zero.
    return notApplicableIrr(seed(), "The cash-flow stream has no sign change, so no internal rate of return exists for it.", contributions, distributions, net, params);
  }
  if (params.includesUnrealized) {
    return forecasted(seed(), payload, params.confidence ?? null);
  }
  return calculated(seed(), payload);
}

function notApplicableIrr(
  seedBase: ReturnType<typeof seedFor>,
  reason: string,
  contributions: number,
  distributions: number,
  net: number,
  params: { includesUnrealized: boolean; confidence?: number | null },
): MetricOutcome<FundIrrResult> {
  void params;
  void contributions;
  void distributions;
  void net;
  return { kind: "ABSENT", state: "NOT_APPLICABLE", reason, provenance: buildProvenance(seedBase, "NOT_APPLICABLE") };
}

/* ------------------------------------------------------------------ */
/* Fees & carry                                                        */
/* ------------------------------------------------------------------ */

/**
 * Management fee for one period.
 *
 * Two bases are supported and one must be declared, because they diverge materially as a fund ages:
 *   COMMITTED   fee on total commitment (common during the investment period)
 *   INVESTED    fee on invested capital or net asset value (common after it)
 * The basis is recorded on the result. A zero or negative rate is refused: a "fee" that pays the GP
 * nothing is not a fee, and silently accepting it would hide a mis-configured fund term.
 */
export function managementFee(params: {
  seed: MetricSeedBase;
  basis: "COMMITTED" | "INVESTED";
  commitmentMinor: number;
  investedMinor?: number | null;
  annualRateBps: number;
  /** Fraction of a year the fee covers, in basis points (10,000 = one full year). */
  periodFractionBps?: number;
  currency: string;
}): MetricOutcome<number> {
  const inputs: MetricInput[] = [
    { name: "basis", value: params.basis, unit: "ENUM", kind: "POLICY", source: "fund terms", period: null, currency: null },
    { name: "commitmentMinor", value: String(params.commitmentMinor), unit: params.currency, kind: "OBSERVED", source: "capital-account register", period: null, currency: params.currency },
    { name: "investedMinor", value: params.investedMinor === null || params.investedMinor === undefined ? null : String(params.investedMinor), unit: params.currency, kind: "OBSERVED", source: "investment ledger", period: null, currency: params.currency },
    { name: "annualRateBps", value: String(params.annualRateBps), unit: "BASIS_POINTS", kind: "POLICY", source: "fund terms (LPA)", period: null, currency: null },
    { name: "periodFractionBps", value: String(params.periodFractionBps ?? BPS_BASE), unit: "BASIS_POINTS", kind: "POLICY", source: "fee period definition", period: null, currency: null },
  ];
  const seed = () =>
    seedFor(params.seed, "FIN.PE.MANAGEMENT_FEE", `Management fee = ${params.basis} base × annual rate × period fraction`, inputs, {
      period: null,
      currency: params.currency,
      quality: "MANAGEMENT",
    });

  assertMoney(params.commitmentMinor, "commitmentMinor", { allowNegative: false });
  assertPercent(params.annualRateBps, "annualRateBps", { allowNegative: false });
  assertPercent(params.periodFractionBps ?? BPS_BASE, "periodFractionBps", { allowNegative: false });
  if (params.annualRateBps <= 0) return invalid(seed(), "The annual management-fee rate must be positive.");
  if (params.basis === "INVESTED" && (params.investedMinor === null || params.investedMinor === undefined)) {
    return missing(seed(), "An INVESTED-basis management fee requires the invested-capital figure for the period.");
  }
  const base = params.basis === "COMMITTED" ? params.commitmentMinor : (params.investedMinor as number);
  assertMoney(base, "feeBase", { allowNegative: false });
  const fee = Math.round((base * params.annualRateBps * (params.periodFractionBps ?? BPS_BASE)) / (BPS_BASE * BPS_BASE));
  assertMoney(fee, "managementFee", { allowNegative: false });
  return calculated(seed(), fee);
}

/**
 * GP carried interest on a fund's profit, computed against a preferred return and a hurdle.
 *
 * The carry is charged on the profit ABOVE the preferred return, applied to the LP's contributed
 * capital. This is a simplified European (whole-fund) waterfall and is stated as such: an American
 * (deal-by-deal) waterfall with a compounding preferred return produces a different number, and this
 * function does not silently implement one while being called the other. `waterfall.ts` remains the
 * canonical full distribution engine for complex structures.
 */
export function carriedInterest(params: {
  seed: MetricSeedBase;
  /** Total cash returned to LPs plus current value. */
  totalValueMinor: number;
  lpContributedMinor: number;
  preferredReturnBps: number;
  /** GP share of profit above the hurdle, in basis points (2000 = 20%). */
  carryBps: number;
  /** GP catch-up rate, in basis points of the carry-eligible profit. 0 disables catch-up. */
  catchUpBps?: number;
  currency: string;
}): MetricOutcome<number> {
  const inputs: MetricInput[] = [
    { name: "totalValueMinor", value: String(params.totalValueMinor), unit: params.currency, kind: "OBSERVED", source: "distribution and valuation ledger", period: null, currency: params.currency },
    { name: "lpContributedMinor", value: String(params.lpContributedMinor), unit: params.currency, kind: "OBSERVED", source: "capital-call ledger", period: null, currency: params.currency },
    { name: "preferredReturnBps", value: String(params.preferredReturnBps), unit: "BASIS_POINTS", kind: "POLICY", source: "fund terms (LPA)", period: null, currency: null },
    { name: "carryBps", value: String(params.carryBps), unit: "BASIS_POINTS", kind: "POLICY", source: "fund terms (LPA)", period: null, currency: null },
    { name: "catchUpBps", value: String(params.catchUpBps ?? 0), unit: "BASIS_POINTS", kind: "POLICY", source: "fund terms (LPA)", period: null, currency: null },
    { name: "waterfallForm", value: "EUROPEAN_WHOLE_FUND", unit: "ENUM", kind: "POLICY", source: "this function implements the whole-fund form only", period: null, currency: null },
  ];
  const seed = () =>
    seedFor(params.seed, "FIN.PE.CARRIED_INTEREST", "Carried interest = GP share of profit above the preferred return (European whole-fund waterfall)", inputs, {
      period: null,
      currency: params.currency,
      quality: "MANAGEMENT",
    });

  assertMoney(params.totalValueMinor, "totalValueMinor", { allowNegative: false });
  assertMoney(params.lpContributedMinor, "lpContributedMinor", { allowNegative: false });
  assertPercent(params.preferredReturnBps, "preferredReturnBps", { allowNegative: false });
  assertPercent(params.carryBps, "carryBps", { allowNegative: false });
  assertPercent(params.catchUpBps ?? 0, "catchUpBps", { allowNegative: false });
  if (params.lpContributedMinor === 0) return missing(seed(), "No LP capital was contributed, so there is no profit on which carry could accrue.");
  if (params.totalValueMinor <= params.lpContributedMinor) {
    return calculated(seed(), 0);
  }
  const profit = params.totalValueMinor - params.lpContributedMinor;
  const hurdle = Math.round((params.lpContributedMinor * params.preferredReturnBps) / BPS_BASE);
  const carryEligible = profit - hurdle;
  if (carryEligible <= 0) return calculated(seed(), 0);
  let carry = Math.round((carryEligible * params.carryBps) / BPS_BASE);
  const catchUp = params.catchUpBps ?? 0;
  if (catchUp > 0) {
    // Catch-up accelerates the GP to its carry share of the profit above the hurdle. Capped so catch-up
    // can never pay the GP MORE than its carry entitlement.
    const catchUpTarget = Math.round((profit * params.carryBps) / (BPS_BASE));
    const accelerated = Math.round((carryEligible * catchUp) / BPS_BASE);
    carry = Math.max(carry, Math.min(accelerated, catchUpTarget));
  }
  assertMoney(carry, "carriedInterest", { allowNegative: false });
  return calculated(seed(), carry);
}

/* ------------------------------------------------------------------ */
/* Waterfall summary                                                   */
/* ------------------------------------------------------------------ */

export type PrivateCapitalSummary = {
  funds: number;
  commitmentMinor: number;
  paidInMinor: number;
  uncalledMinor: number;
  distributedMinor: number;
  unrealizedMinor: number;
  totalValueMinor: number;
  /** Weighted-average PIC, DPI and TVPI scaled by 10^6. Null when the denominator is zero. */
  picScaled: number | null;
  dpiScaled: number | null;
  tvpiScaled: number | null;
  /** True when ANY included fund carries an unexited holding. */
  includesEstimates: boolean;
  currency: string;
};

/**
 * Summarise a portfolio of funds.
 *
 * The aggregate ratios are computed from the summed components, NOT by averaging per-fund ratios: a
 * $1bn fund and a $10m fund must not contribute equally to a portfolio DPI. `includesEstimates` is set
 * whenever any fund's unrealized value is non-zero, so a caller cannot present the totals as realized.
 */
export function summariseFunds(params: { currency: string; aggregates: readonly FundAggregate[] }): PrivateCapitalSummary {
  const commitment = params.aggregates.reduce((a, f) => a + f.commitmentMinor, 0);
  const paidIn = params.aggregates.reduce((a, f) => a + f.paidInMinor, 0);
  const distributed = params.aggregates.reduce((a, f) => a + f.distributedMinor, 0);
  const unrealized = params.aggregates.reduce((a, f) => a + f.unrealizedMinor, 0);
  const ratioScaled = (numerator: number, denominator: number): number | null => {
    if (denominator === 0) return null;
    const r = multiple(numerator, denominator);
    return r.kind === "MULTIPLE" ? r.scaled : null;
  };
  return {
    funds: params.aggregates.length,
    commitmentMinor: commitment,
    paidInMinor: paidIn,
    uncalledMinor: commitment - paidIn,
    distributedMinor: distributed,
    unrealizedMinor: unrealized,
    totalValueMinor: distributed + unrealized,
    picScaled: ratioScaled(paidIn, commitment),
    dpiScaled: ratioScaled(distributed, paidIn),
    tvpiScaled: ratioScaled(distributed + unrealized, paidIn),
    includesEstimates: unrealized !== 0,
    currency: params.currency,
  };
}

/** Convert a J-curve net cash position to basis points of commitment. Deterministic and pure. */
export function netCashToCommitmentBps(netCashMinor: number, commitmentMinor: number): number | null {
  assertMoney(netCashMinor, "netCashMinor");
  assertMoney(commitmentMinor, "commitmentMinor", { allowNegative: false });
  if (commitmentMinor === 0) return null;
  const scaled = scaleDivide(netCashMinor * BPS_BASE, commitmentMinor, { allowNegativeDenominator: true });
  return scaled.kind === "MULTIPLE" ? scaled.scaled : null;
}

export { valueOrNull };
