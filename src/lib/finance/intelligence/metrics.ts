/**
 * BEYU OS — FINANCE INTELLIGENCE: governed market & fundamental metrics.
 *
 * FINANCE_OS → Investment & Capital Management → Financial Intelligence → Valuation & Analytics.
 *
 * =============================== WHAT THIS IS ================================
 *
 * Every metric in §4 of the enterprise-intelligence programme, implemented as a pure function that
 * returns a `MetricOutcome` — a value WITH complete provenance, or an explicit refusal. There is no
 * function here that returns a bare number, and therefore no call site that can render a fabricated
 * figure.
 *
 *   A  market capitalization          F  free-cash-flow yield
 *   B  trailing P/E, forward P/E      G  operating margin
 *   C  PEG (with an explicit growth   H  net debt, net debt/revenue, net debt/EBITDA
 *      convention)                    I  revenue growth: YoY, QoQ, CAGR
 *   D  price/sales                    J  ROIC, with stated accounting treatment
 *   E  enterprise value, EV/EBITDA
 *
 * ============================ THE RULES IT ENFORCES ==========================
 *
 *  1. MISSING IS NOT ZERO. An absent input produces `MISSING`, never 0 and never a default.
 *  2. NO FABRICATED RATIOS. A zero or negative denominator where the ratio would be meaningless
 *     produces `INVALID` (rendered NOT AVAILABLE), never Infinity, never a negative multiple.
 *  3. NO SILENT CURRENCY MIXING. A currency mismatch produces `INVALID`; the engine holds no FX
 *     rate of its own because an uninventoried rate IS an invented number.
 *  4. PERCENT CONVENTIONS ARE EXPLICIT. Growth is basis points everywhere. PEG takes the growth
 *     convention as a required, recorded parameter so 20% can never be read as 20 or as 0.20 by
 *     accident.
 *  5. ACCOUNTING TREATMENT IS STATED. ROIC and invested capital record what they included and
 *     excluded (goodwill, excess cash, operating leases) in the returned `method` and inputs.
 *
 * Money is integer minor units throughout; ratios are exact fixed-point multiples (6 dp) or basis
 * points. No floating point touches a monetary figure.
 */
import type { MetricInput, MetricOutcome, MetricSeedBase, SourceQuality } from "./provenance";
import {
  calculated,
  commonCurrency,
  currencyMismatch,
  estimated,
  forecasted,
  hasInput,
  invalid,
  isValueState,
  metricIdFactory,
  missing,
  notApplicable,
  parseDecimal,
  seedFor,
} from "./provenance";
import {
  assertMoney,
  assertPercent,
  BPS_BASE,
  cagrBps,
  FinanceArithmeticError,
  formatMultiple,
  multiple,
  scaleAdd,
  scaleDivide,
  scaleTimesInteger,
  toMinorUnits,
} from "./arithmetic";

export const FINANCE_METRICS_VERSION = "finance-metrics-1.0.0";

/* ------------------------------------------------------------------ */
/* Input primitives                                                    */
/* ------------------------------------------------------------------ */

/**
 * One monetary figure (integer minor units) together with where it came from.
 *
 * `amountMinor: null` means ABSENT. It does not mean zero, and the engine never substitutes zero.
 */
export type MoneyFigure = {
  amountMinor: number | null;
  source: string;
  period?: string | null;
  currency?: string | null;
  sourceTimestamp?: string | null;
  quality?: SourceQuality;
};

/** A share count. Integer shares; a fractional share is not a share count. */
export type ShareFigure = {
  shares: number | null;
  source: string;
  period?: string | null;
  sourceTimestamp?: string | null;
  quality?: SourceQuality;
};

/** A per-share monetary figure: integer minor units PER SHARE. */
export type PerShareFigure = {
  amountMinorPerShare: number | null;
  source: string;
  period?: string | null;
  currency?: string | null;
  sourceTimestamp?: string | null;
  quality?: SourceQuality;
};

/** A rate expressed in whole basis points (100 bps = 1.00%). */
export type RateFigure = {
  bps: number | null;
  source: string;
  period?: string | null;
  sourceTimestamp?: string | null;
  quality?: SourceQuality;
};

/**
 * The caller-declared reporting currency as an INPUT.
 *
 * Without this, a metric whose figures are quoted in another currency would be labelled with the
 * reporting currency and never compared against it — the mismatch guard would have nothing to compare.
 * Declaring it as an input makes "price in KES, reporting in USD" a detected mismatch rather than a
 * silently mislabelled number.
 */
function reportingCurrencyInput(currency: string | null | undefined, period: string | null | undefined): MetricInput[] {
  if (!currency) return [];
  return [
    {
      name: "reportingCurrency",
      value: currency,
      unit: "CURRENCY",
      kind: "POLICY" as const,
      source: "caller-declared reporting currency",
      period: period ?? null,
      currency,
    },
  ];
}

function moneyInput(name: string, figure: MoneyFigure | null | undefined): MetricInput {
  return {
    name,
    value: figure?.amountMinor === null || figure?.amountMinor === undefined ? null : String(figure.amountMinor),
    unit: figure?.currency ?? "CURRENCY_MINOR",
    kind: "OBSERVED",
    source: figure?.source ?? "not supplied",
    sourceTimestamp: figure?.sourceTimestamp ?? null,
    period: figure?.period ?? null,
    currency: figure?.currency ?? null,
  };
}

function shareInput(name: string, figure: ShareFigure | null | undefined): MetricInput {
  return {
    name,
    value: figure?.shares === null || figure?.shares === undefined ? null : String(figure.shares),
    unit: "SHARES",
    kind: "OBSERVED",
    source: figure?.source ?? "not supplied",
    sourceTimestamp: figure?.sourceTimestamp ?? null,
    period: figure?.period ?? null,
    currency: null,
  };
}

function perShareInput(name: string, figure: PerShareFigure | null | undefined): MetricInput {
  return {
    name,
    value:
      figure?.amountMinorPerShare === null || figure?.amountMinorPerShare === undefined ? null : String(figure.amountMinorPerShare),
    unit: figure?.currency ? `${figure.currency}/SHARE` : "CURRENCY_MINOR/SHARE",
    kind: "OBSERVED",
    source: figure?.source ?? "not supplied",
    sourceTimestamp: figure?.sourceTimestamp ?? null,
    period: figure?.period ?? null,
    currency: figure?.currency ?? null,
  };
}

function rateInput(name: string, figure: RateFigure | null | undefined): MetricInput {
  return {
    name,
    value: figure?.bps === null || figure?.bps === undefined ? null : String(figure.bps),
    unit: "BASIS_POINTS",
    kind: figure?.source?.toLowerCase().includes("assumption") ? "ASSUMPTION" : "OBSERVED",
    source: figure?.source ?? "not supplied",
    sourceTimestamp: figure?.sourceTimestamp ?? null,
    period: figure?.period ?? null,
    currency: null,
  };
}

/** Validate a monetary figure before it can enter arithmetic. Absent figures pass through. */
function money(figure: MoneyFigure | null | undefined, label: string): number | null {
  if (!figure || figure.amountMinor === null) return null;
  assertMoney(figure.amountMinor, label);
  return figure.amountMinor;
}

function shares(figure: ShareFigure | null | undefined, label: string): number | null {
  if (!figure || figure.shares === null) return null;
  assertMoney(figure.shares, label, { allowNegative: false });
  return figure.shares;
}

function perShare(figure: PerShareFigure | null | undefined, label: string): number | null {
  if (!figure || figure.amountMinorPerShare === null) return null;
  assertMoney(figure.amountMinorPerShare, label);
  return figure.amountMinorPerShare;
}

/* ------------------------------------------------------------------ */
/* §4A — Market capitalization                                         */
/* ------------------------------------------------------------------ */

export type MarketCapParams = {
  seed: MetricSeedBase;
  sharePrice: PerShareFigure;
  sharesOutstanding: ShareFigure;
  period?: string | null;
  currency?: string | null;
  /** Security/share class when the subject is a single class; null for total equity. */
  shareClass?: string | null;
  /** Effective date of the valuation. */
  asOf?: string | null;
};

/**
 * Market Capitalization = Share Price × Shares Outstanding.
 *
 * Exact integer arithmetic: a price in minor units per share multiplied by a share count yields a
 * market capitalization in minor units with no rounding at all.
 *
 * The price is never assumed to be current. Provenance carries the price's own period and source
 * timestamp, so a point-in-time valuation and a historical one are distinguishable downstream.
 */
export function marketCapitalization(params: MarketCapParams): MetricOutcome<number> {
  const inputs = [
    perShareInput("sharePrice", params.sharePrice),
    shareInput("sharesOutstanding", params.sharesOutstanding),
    ...reportingCurrencyInput(params.currency, params.period),
    ...(params.shareClass ? [shareClassInput(params.shareClass)] : []),
    ...(params.asOf ? [effectiveDateInput(params.asOf)] : []),
  ];
  const seed = () =>
    seedFor(params.seed, "FIN.MARKET.MARKET_CAP", "Market Capitalization = Share Price × Shares Outstanding", inputs, {
      period: params.period ?? null,
      currency: params.currency ?? params.sharePrice.currency ?? null,
      sourceTimestamp: params.sharePrice.sourceTimestamp ?? null,
      quality: params.sharePrice.quality,
    });

  const mismatch = currencyMismatch(inputs.filter((i) => i.currency));
  if (mismatch) return invalid(seed(), mismatch);

  const price = perShare(params.sharePrice, "sharePrice");
  const count = shares(params.sharesOutstanding, "sharesOutstanding");
  const absent = [
    price === null ? "sharePrice" : null,
    count === null ? "sharesOutstanding" : null,
  ].filter((v): v is string => v !== null);
  if (absent.length > 0) {
    return missing(seed(), `Market capitalization requires ${absent.join(" and ")}; the figure is absent rather than zero.`);
  }

  const value = (price as number) * (count as number);
  assertMoney(value, "marketCapitalization");
  return calculated(seed(), value);
}

/* ------------------------------------------------------------------ */
/* §4B — Price / Earnings                                             */
/* ------------------------------------------------------------------ */

export type EarningsMultipleParams = {
  seed: MetricSeedBase;
  sharePrice: PerShareFigure;
  /** Trailing twelve-month EPS, or the forward period's EPS for the forward multiple. */
  earningsPerShare: PerShareFigure;
  period?: string | null;
  currency?: string | null;
  /** Provenance of the forecast, when the EPS is forward-looking. */
  basis?: "TRAILING" | "FORWARD";
  forecastHorizon?: string | null;
  confidence?: number | null;
};

/**
 * Trailing P/E = Market Price / Trailing EPS.
 *
 * A negative or zero EPS returns `INVALID`, NOT a negative multiple. A company with negative
 * trailing earnings does not have a trailing P/E of −14; it has no trailing P/E, and reporting one
 * lets a screener rank it alongside profitable peers.
 */
export function priceEarnings(params: EarningsMultipleParams): MetricOutcome<number> {
  const basis = params.basis ?? "TRAILING";
  const code = basis === "TRAILING" ? "FIN.PE.TRAILING" : "FIN.PE.FORWARD";
  const inputs = [
    perShareInput("sharePrice", params.sharePrice),
    perShareInput(basis === "TRAILING" ? "trailingEps" : "forwardEps", params.earningsPerShare),
  ];
  const seed = () =>
    seedFor(
      params.seed,
      code,
      `${basis === "TRAILING" ? "Trailing" : "Forward"} P/E = Market Price / ${basis === "TRAILING" ? "Trailing" : "Forward"} EPS`,
      inputs,
      {
        period: params.period ?? null,
        currency: params.currency ?? params.sharePrice.currency ?? null,
        sourceTimestamp: params.sharePrice.sourceTimestamp ?? null,
        quality: params.sharePrice.quality,
      },
    );

  const mismatch = currencyMismatch(inputs.filter((i) => i.currency));
  if (mismatch) return invalid(seed(), mismatch);

  const price = perShare(params.sharePrice, "sharePrice");
  const eps = perShare(params.earningsPerShare, "earningsPerShare");
  if (price === null || eps === null) {
    const absent = price === null ? "sharePrice" : "earningsPerShare";
    return missing(seed(), `The ${basis.toLowerCase()} P/E requires ${absent}; the figure is absent rather than zero.`);
  }
  if (eps === 0) {
    return invalid(seed(), "EPS is zero, so the price/earnings ratio is undefined.");
  }
  if (eps < 0) {
    return invalid(
      seed(),
      "EPS is negative. A negative P/E is not a valuation statement and is reported as NOT AVAILABLE.",
    );
  }

  const ratio = multiple(price, eps);
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  return calculated(seed(), ratio.scaled);
}

/* ------------------------------------------------------------------ */
/* §4C — PEG                                                           */
/* ------------------------------------------------------------------ */

/** How the growth figure is interpreted. Recorded on every PEG result. */
export const GROWTH_CONVENTION = ["PERCENT_POINTS", "DECIMAL_FRACTION"] as const;
export type GrowthConvention = (typeof GROWTH_CONVENTION)[number];

export type PegParams = {
  seed: MetricSeedBase;
  sharePrice: PerShareFigure;
  earningsPerShare: PerShareFigure;
  /** Expected earnings growth. Always basis points; the convention decides how it is read. */
  growth: RateFigure;
  /** REQUIRED. The engine refuses to guess. */
  growthConvention: GrowthConvention;
  /** Growth period the assumption covers, e.g. "NEXT_5Y". */
  growthPeriod: string;
  /** Whether the P/E is trailing or forward. */
  basis?: "TRAILING" | "FORWARD";
  period?: string | null;
  currency?: string | null;
};

/**
 * PEG = P/E ÷ Earnings Growth Rate.
 *
 * The growth convention is a MANDATORY input. Under `PERCENT_POINTS` a 20% growth assumption divides
 * by 20 and yields a sensible PEG; under `DECIMAL_FRACTION` it divides by 0.20 and yields a PEG one
 * hundred times larger. Both are defensible; silently picking one is not. The convention, the growth
 * period and the P/E actually used are all recorded in the result's provenance.
 */
export function pegRatio(params: PegParams): MetricOutcome<number> {
  const basis = params.basis ?? "TRAILING";
  if (!GROWTH_CONVENTION.includes(params.growthConvention)) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", `Unknown growth convention '${String(params.growthConvention)}'.`, {});
  }
  const inputs = [
    perShareInput("sharePrice", params.sharePrice),
    perShareInput(basis === "TRAILING" ? "trailingEps" : "forwardEps", params.earningsPerShare),
    rateInput("earningsGrowthBps", params.growth),
    {
      name: "growthConvention",
      value: params.growthConvention,
      unit: "ENUM",
      kind: "POLICY" as const,
      source: "caller-declared convention (required)",
      period: params.growthPeriod,
      currency: null,
    },
    {
      name: "growthPeriod",
      value: params.growthPeriod,
      unit: "PERIOD",
      kind: "POLICY" as const,
      source: "caller-declared growth horizon",
      period: params.growthPeriod,
      currency: null,
    },
  ];
  const seed = () =>
    seedFor(
      params.seed,
      "FIN.PEG",
      `PEG = ${basis === "TRAILING" ? "Trailing" : "Forward"} P/E ÷ earnings growth under the ${params.growthConvention} convention`,
      inputs,
      {
        period: params.period ?? null,
        currency: params.currency ?? params.sharePrice.currency ?? null,
        sourceTimestamp: params.growth.sourceTimestamp ?? params.sharePrice.sourceTimestamp ?? null,
        quality: params.growth.quality ?? params.sharePrice.quality,
      },
    );

  const price = perShare(params.sharePrice, "sharePrice");
  const eps = perShare(params.earningsPerShare, "earningsPerShare");
  const growthBps = params.growth.bps;
  if (growthBps === null) {
    return missing(seed(), "The PEG ratio requires an earnings growth assumption; none was supplied, so no PEG is reported.");
  }
  assertPercent(growthBps, "earningsGrowthBps", { allowNegative: true });
  if (price === null || eps === null) {
    return missing(seed(), `The PEG ratio requires ${price === null ? "sharePrice" : "earningsPerShare"}; the figure is absent.`);
  }
  if (eps <= 0) {
    return invalid(seed(), "PEG requires positive earnings; a negative or zero EPS makes the P/E — and therefore the PEG — undefined.");
  }
  if (growthBps <= 0) {
    return invalid(
      seed(),
      "The growth assumption is zero or negative. PEG divides by growth, so a non-positive growth rate has no PEG; report NOT_AVAILABLE rather than a negative or infinite multiple.",
    );
  }

  const pe = multiple(price, eps);
  if (pe.kind === "REFUSED") return invalid(seed(), pe.detail);

  // `multiple` and `scaleDivide` both return values at MULTIPLE_SCALE (10^6). The PEG denominator is
  // the growth rate expressed in the convention's units, itself at 10^6:
  //   PERCENT_POINTS   20% → 20.000000  → 20 * 10^6  = bps * 10^4
  //   DECIMAL_FRACTION 20% →  0.200000  → 0.2 * 10^6 = bps * 10^2
  const denominatorScaled =
    params.growthConvention === "PERCENT_POINTS" ? growthBps * 10_000 : growthBps * 100;
  const peg = scaleDivide(pe.scaled, denominatorScaled, { allowNegativeDenominator: false });
  if (peg.kind === "REFUSED") return invalid(seed(), peg.detail);
  return calculated(seed(), peg.scaled);
}

/* ------------------------------------------------------------------ */
/* §4D — Price / Sales                                                 */
/* ------------------------------------------------------------------ */

export type PriceToSalesParams = {
  seed: MetricSeedBase;
  /** Either a market capitalization directly, or a price and share count. */
  marketCapitalization?: MoneyFigure;
  sharePrice?: PerShareFigure;
  sharesOutstanding?: ShareFigure;
  revenue: MoneyFigure;
  period?: string | null;
  currency?: string | null;
};

/**
 * P/S = Market Capitalization / Revenue.
 *
 * Historical periods are supported by supplying that period's revenue — and, for a historical
 * valuation, that period's price and share count, so the result is point-in-time rather than a
 * present price over a past revenue.
 */
export function priceToSales(params: PriceToSalesParams): MetricOutcome<number> {
  const inputs = [
    ...(params.marketCapitalization ? [moneyInput("marketCapitalization", params.marketCapitalization)] : []),
    ...(params.sharePrice ? [perShareInput("sharePrice", params.sharePrice)] : []),
    ...(params.sharesOutstanding ? [shareInput("sharesOutstanding", params.sharesOutstanding)] : []),
    moneyInput("revenue", params.revenue),
  ];
  const seed = () =>
    seedFor(params.seed, "FIN.PS", "Price/Sales = Market Capitalization ÷ Revenue", inputs, {
      period: params.period ?? params.revenue.period ?? null,
      currency: params.currency ?? params.revenue.currency ?? null,
      sourceTimestamp: params.revenue.sourceTimestamp ?? null,
      quality: params.revenue.quality,
    });

  const mismatch = currencyMismatch(inputs.filter((i) => i.currency));
  if (mismatch) return invalid(seed(), mismatch);

  let marketCap = money(params.marketCapitalization, "marketCapitalization");
  if (marketCap === null) {
    const price = perShare(params.sharePrice, "sharePrice");
    const count = shares(params.sharesOutstanding, "sharesOutstanding");
    if (price === null || count === null) {
      return missing(seed(), "Price/Sales requires a market capitalization, or both a share price and a share count.");
    }
    marketCap = price * count;
    assertMoney(marketCap, "marketCapitalization");
  }

  const revenue = money(params.revenue, "revenue");
  if (revenue === null) {
    return missing(seed(), "Price/Sales requires revenue; the figure is absent rather than zero.");
  }
  if (revenue === 0) {
    return invalid(seed(), "Revenue is zero, so P/S is undefined. An infinite multiple is reported as NOT AVAILABLE.");
  }
  if (revenue < 0) {
    return invalid(seed(), "Revenue is negative, which is not a meaningful P/S denominator.");
  }

  const ratio = multiple(marketCap, revenue);
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  return calculated(seed(), ratio.scaled);
}

/* ------------------------------------------------------------------ */
/* §4E — Enterprise Value & EV/EBITDA                                  */
/* ------------------------------------------------------------------ */

export type EnterpriseValueInputs = {
  marketCapitalization: MoneyFigure;
  totalDebt: MoneyFigure;
  preferredEquity?: MoneyFigure;
  minorityInterest?: MoneyFigure;
  cashAndEquivalents: MoneyFigure;
};

/**
 * EV = Market Cap + Total Debt + Preferred Equity + Minority Interest − Cash & Cash Equivalents.
 *
 * EVERY input appears in the returned provenance, so a reader can see all five components rather
 * than a single asserted number. A missing component is `MISSING` — silently treating absent debt as
 * zero is the most consequential error this function could make, because it makes a levered company
 * look cheap.
 */
export function enterpriseValue(params: { seed: MetricSeedBase; values: EnterpriseValueInputs; period?: string | null; currency?: string | null }): MetricOutcome<number> {
  const v = params.values;
  const inputs = [
    moneyInput("marketCapitalization", v.marketCapitalization),
    moneyInput("totalDebt", v.totalDebt),
    moneyInput("preferredEquity", v.preferredEquity ?? NULL_MONEY),
    moneyInput("minorityInterest", v.minorityInterest ?? NULL_MONEY),
    moneyInput("cashAndCashEquivalents", v.cashAndEquivalents),
    ...reportingCurrencyInput(params.currency, params.period),
  ];
  const seed = () =>
    seedFor(
      params.seed,
      "FIN.EV",
      "Enterprise Value = Market Cap + Total Debt + Preferred Equity + Minority Interest − Cash & Cash Equivalents",
      inputs,
      {
        period: params.period ?? null,
        currency: params.currency ?? commonCurrency(inputs),
        sourceTimestamp: v.totalDebt.sourceTimestamp ?? null,
        quality: v.totalDebt.quality,
      },
    );

  const mismatch = currencyMismatch(inputs.filter((i) => i.currency));
  if (mismatch) return invalid(seed(), mismatch);

  const marketCap = money(v.marketCapitalization, "marketCapitalization");
  const totalDebt = money(v.totalDebt, "totalDebt");
  const cash = money(v.cashAndEquivalents, "cashAndCashEquivalents");
  const preferred = money(v.preferredEquity, "preferredEquity") ?? 0;
  const minority = money(v.minorityInterest, "minorityInterest") ?? 0;

  const absent = [
    marketCap === null ? "marketCapitalization" : null,
    totalDebt === null ? "totalDebt" : null,
    cash === null ? "cashAndCashEquivalents" : null,
  ].filter((x): x is string => x !== null);
  if (absent.length > 0) {
    return missing(
      seed(),
      `Enterprise value requires ${absent.join(", ")}. An absent component is not treated as zero: omitting debt would understate enterprise value and make the subject look cheaper than it is.`,
    );
  }

  const value = (marketCap as number) + (totalDebt as number) + preferred + minority - (cash as number);
  assertMoney(value, "enterpriseValue");
  return calculated(seed(), value);
}

export type EvToEbitdaParams = {
  seed: MetricSeedBase;
  values: EnterpriseValueInputs;
  ebitda: MoneyFigure;
  period?: string | null;
  currency?: string | null;
};

/**
 * EV/EBITDA = Enterprise Value / EBITDA.
 *
 * EBITDA is NEVER derived here from operating income plus guessed D&A: it is supplied with its own
 * provenance. A negative EBITDA returns `INVALID`.
 */
export function evToEbitda(params: EvToEbitdaParams): MetricOutcome<number> {
  const ev = enterpriseValue({ seed: { ...params.seed, nextId: silentIdFactory() }, values: params.values, period: params.period, currency: params.currency });
  const inputs = [moneyInput("ebitda", params.ebitda)];
  const seed = () =>
    seedFor(params.seed, "FIN.EV_EBITDA", "EV/EBITDA = Enterprise Value ÷ EBITDA", inputs, {
      period: params.period ?? params.ebitda.period ?? null,
      currency: params.currency ?? params.ebitda.currency ?? null,
      sourceTimestamp: params.ebitda.sourceTimestamp ?? null,
      quality: params.ebitda.quality,
    });

  if (ev.kind === "ABSENT") return invalid(seed(), `Enterprise value is ${ev.state.toLowerCase()}: ${ev.reason}`);
  const ebitda = money(params.ebitda, "ebitda");
  if (ebitda === null) {
    return missing(seed(), "EV/EBITDA requires EBITDA; the figure is absent rather than zero.");
  }
  if (ebitda === 0) {
    return invalid(seed(), "EBITDA is zero, so EV/EBITDA is undefined.");
  }
  if (ebitda < 0) {
    return invalid(seed(), "EBITDA is negative, so a positive EV/EBITDA multiple does not exist. Report NOT AVAILABLE.");
  }

  const ratio = multiple(ev.value, ebitda);
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  // Fold the enterprise-value lineage into the result so no input is hidden.
  return calculated({ ...seed(), inputs: [...inputs, ...ev.provenance.inputs] }, ratio.scaled);
}

/* ------------------------------------------------------------------ */
/* §4F — Free cash flow yield                                          */
/* ------------------------------------------------------------------ */

export const FCF_BASIS = ["HISTORICAL", "FORWARD", "NORMALIZED"] as const;
export type FcfBasis = (typeof FCF_BASIS)[number];

export type FcfYieldParams = {
  seed: MetricSeedBase;
  freeCashFlow: MoneyFigure;
  marketCapitalization?: MoneyFigure;
  sharePrice?: PerShareFigure;
  sharesOutstanding?: ShareFigure;
  /** Whether the FCF is historical (actual), forward (forecast) or normalized (an adjustment). */
  basis: FcfBasis;
  period?: string | null;
  currency?: string | null;
};

/**
 * FCF Yield = Free Cash Flow / Market Capitalization.
 *
 * The basis is recorded and drives the epistemic state of the result: a FORWARD yield is reported as
 * a FORECAST and a NORMALIZED yield as an ESTIMATE, so a reader can never mistake a modelled
 * free-cash-flow number for an audited one.
 */
export function freeCashFlowYield(params: FcfYieldParams): MetricOutcome<number> {
  let marketCap = money(params.marketCapitalization, "marketCapitalization");
  const inputs = [
    moneyInput("freeCashFlow", params.freeCashFlow),
    ...(params.marketCapitalization ? [moneyInput("marketCapitalization", params.marketCapitalization)] : []),
    ...(params.sharePrice ? [perShareInput("sharePrice", params.sharePrice)] : []),
    ...(params.sharesOutstanding ? [shareInput("sharesOutstanding", params.sharesOutstanding)] : []),
    {
      name: "fcfBasis",
      value: params.basis,
      unit: "ENUM",
      kind: "POLICY" as const,
      source: "caller-declared basis",
      period: params.period ?? null,
      currency: null,
    },
  ];
  const seed = () =>
    seedFor(params.seed, "FIN.FCF_YIELD", `FCF Yield = ${params.basis} Free Cash Flow ÷ Market Capitalization, expressed in basis points`, inputs, {
      period: params.period ?? params.freeCashFlow.period ?? null,
      currency: params.currency ?? params.freeCashFlow.currency ?? null,
      sourceTimestamp: params.freeCashFlow.sourceTimestamp ?? null,
      quality: params.freeCashFlow.quality,
    });

  const mismatch = currencyMismatch(inputs.filter((i) => i.currency));
  if (mismatch) return invalid(seed(), mismatch);

  if (marketCap === null) {
    const price = perShare(params.sharePrice, "sharePrice");
    const count = shares(params.sharesOutstanding, "sharesOutstanding");
    if (price !== null && count !== null) {
      marketCap = price * count;
      assertMoney(marketCap, "marketCapitalization");
    }
  }
  const fcf = money(params.freeCashFlow, "freeCashFlow");
  if (fcf === null) {
    return missing(seed(), "Free-cash-flow yield requires free cash flow; the figure is absent rather than zero.");
  }
  if (marketCap === null) {
    return missing(seed(), "Free-cash-flow yield requires a market capitalization, or both a share price and a share count.");
  }
  if (marketCap === 0) {
    return invalid(seed(), "Market capitalization is zero, so the yield is undefined.");
  }
  if (marketCap < 0) {
    return invalid(seed(), "Market capitalization is negative, which is not a meaningful yield denominator.");
  }

  // Yield is a proportion: scale to basis points so it stays exact integer arithmetic.
  const ratio = multiple(fcf, marketCap, { allowNegativeDenominator: false });
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  const bps = scaleDivide(ratio.scaled * BPS_BASE, 1_000_000, { allowNegativeDenominator: true });
  if (bps.kind === "REFUSED") return invalid(seed(), bps.detail);

  if (params.basis === "FORWARD") {
    return forecasted(seed(), bps.scaled);
  }
  if (params.basis === "NORMALIZED") {
    return estimated(seed(), bps.scaled);
  }
  return calculated(seed(), bps.scaled);
}

/* ------------------------------------------------------------------ */
/* §4G — Operating margin                                              */
/* ------------------------------------------------------------------ */

export type OperatingMarginParams = {
  seed: MetricSeedBase;
  operatingIncome: MoneyFigure;
  revenue: MoneyFigure;
  period?: string | null;
  currency?: string | null;
};

/**
 * Operating Margin = Operating Income / Revenue, reported in basis points.
 *
 * A negative margin is legitimate and is reported as such: an operating loss IS a statement about
 * the business. This is the deliberate contrast with the multiples above, where a negative
 * denominator is a category error. A ZERO revenue makes the margin `INVALID`.
 */
export function operatingMargin(params: OperatingMarginParams): MetricOutcome<number> {
  return marginRatio({
    seed: params.seed,
    metricCode: "FIN.OPERATING_MARGIN",
    method: "Operating Margin = Operating Income ÷ Revenue",
    numerator: params.operatingIncome,
    numeratorName: "operatingIncome",
    denominator: params.revenue,
    denominatorName: "revenue",
    period: params.period,
    currency: params.currency,
  });
}

/** Net profit margin — the same arithmetic on a different numerator, so there is one implementation. */
export function netMargin(params: OperatingMarginParams & { netIncome: MoneyFigure }): MetricOutcome<number> {
  return marginRatio({
    seed: params.seed,
    metricCode: "FIN.NET_MARGIN",
    method: "Net Margin = Net Profit ÷ Revenue",
    numerator: params.netIncome,
    numeratorName: "netProfit",
    denominator: params.revenue,
    denominatorName: "revenue",
    period: params.period,
    currency: params.currency,
  });
}

/** Gross margin — the same arithmetic again, on gross profit. */
export function grossMargin(params: OperatingMarginParams & { grossProfit: MoneyFigure }): MetricOutcome<number> {
  return marginRatio({
    seed: params.seed,
    metricCode: "FIN.GROSS_MARGIN",
    method: "Gross Margin = Gross Profit ÷ Revenue",
    numerator: params.grossProfit,
    numeratorName: "grossProfit",
    denominator: params.revenue,
    denominatorName: "revenue",
    period: params.period,
    currency: params.currency,
  });
}

type MarginParams = {
  seed: MetricSeedBase;
  metricCode: string;
  method: string;
  numerator: MoneyFigure;
  numeratorName: string;
  denominator: MoneyFigure;
  denominatorName: string;
  period?: string | null;
  currency?: string | null;
};

function marginRatio(params: MarginParams): MetricOutcome<number> {
  const inputs = [moneyInput(params.numeratorName, params.numerator), moneyInput(params.denominatorName, params.denominator)];
  const seed = () =>
    seedFor(params.seed, params.metricCode, `${params.method}, expressed in basis points`, inputs, {
      period: params.period ?? null,
      currency: params.currency ?? params.denominator.currency ?? null,
      sourceTimestamp: params.denominator.sourceTimestamp ?? null,
      quality: params.denominator.quality,
    });

  const mismatch = currencyMismatch(inputs.filter((i) => i.currency));
  if (mismatch) return invalid(seed(), mismatch);

  const numerator = money(params.numerator, params.numeratorName);
  const denominator = money(params.denominator, params.denominatorName);
  if (numerator === null || denominator === null) {
    const absent = numerator === null ? params.numeratorName : params.denominatorName;
    return missing(seed(), `The margin requires ${absent}; the figure is absent rather than zero.`);
  }
  if (denominator === 0) {
    return invalid(seed(), `${params.denominatorName} is zero, so the margin is undefined.`);
  }
  if (denominator < 0) {
    return invalid(seed(), `${params.denominatorName} is negative, so the margin does not describe a proportion of revenue.`);
  }

  const ratio = multiple(numerator, denominator, { allowNegativeDenominator: true });
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  const bps = scaleDivide(ratio.scaled * BPS_BASE, 1_000_000, { allowNegativeDenominator: true });
  if (bps.kind === "REFUSED") return invalid(seed(), bps.detail);
  return calculated(seed(), bps.scaled);
}

/* ------------------------------------------------------------------ */
/* §4H — Net debt                                                      */
/* ------------------------------------------------------------------ */

export type NetDebtParams = {
  seed: MetricSeedBase;
  totalDebt: MoneyFigure;
  cashAndEquivalents: MoneyFigure;
  period?: string | null;
  currency?: string | null;
};

/**
 * Net Debt = Total Debt − Cash & Cash Equivalents.
 *
 * A NEGATIVE net debt is a real and reportable state (a company with more cash than debt). It is
 * reported as the negative figure it is, and the ratio helpers below refuse to divide by it rather
 * than producing a misleading negative leverage multiple.
 */
export function netDebt(params: NetDebtParams): MetricOutcome<number> {
  const inputs = [
    moneyInput("totalDebt", params.totalDebt),
    moneyInput("cashAndCashEquivalents", params.cashAndEquivalents),
  ];
  const seed = () =>
    seedFor(params.seed, "FIN.NET_DEBT", "Net Debt = Total Debt − Cash & Cash Equivalents", inputs, {
      period: params.period ?? null,
      currency: params.currency ?? params.totalDebt.currency ?? null,
      sourceTimestamp: params.totalDebt.sourceTimestamp ?? null,
      quality: params.totalDebt.quality,
    });

  const mismatch = currencyMismatch(inputs.filter((i) => i.currency));
  if (mismatch) return invalid(seed(), mismatch);

  const debt = money(params.totalDebt, "totalDebt");
  const cash = money(params.cashAndEquivalents, "cashAndCashEquivalents");
  if (debt === null || cash === null) {
    const absent = debt === null ? "totalDebt" : "cashAndCashEquivalents";
    return missing(seed(), `Net debt requires ${absent}. Absent cash is not treated as zero: doing so would overstate leverage.`);
  }
  return calculated(seed(), debt - cash);
}

/** Net debt / revenue — a leverage ratio in exact fixed point. Negative net debt returns INVALID. */
export function netDebtToRevenue(params: NetDebtParams & { revenue: MoneyFigure }): MetricOutcome<number> {
  return leverageRatio("FIN.NET_DEBT_REVENUE", "Net Debt / Revenue = (Total Debt − Cash) ÷ Revenue", params, netDebt({ ...params }), params.revenue, "revenue");
}

/** Net debt / EBITDA — the canonical leverage multiple. Negative net debt returns INVALID. */
export function netDebtToEbitda(params: NetDebtParams & { ebitda: MoneyFigure }): MetricOutcome<number> {
  return leverageRatio("FIN.NET_DEBT_EBITDA", "Net Debt / EBITDA = (Total Debt − Cash) ÷ EBITDA", params, netDebt({ ...params }), params.ebitda, "ebitda");
}

function leverageRatio(
  metricCode: string,
  method: string,
  params: NetDebtParams,
  net: MetricOutcome<number>,
  denominator: MoneyFigure,
  denominatorName: string,
): MetricOutcome<number> {
  const inputs = [
    moneyInput("totalDebt", params.totalDebt),
    moneyInput("cashAndCashEquivalents", params.cashAndEquivalents),
    moneyInput(denominatorName, denominator),
  ];
  const seed = () =>
    seedFor(params.seed, metricCode, method, inputs, {
      period: params.period ?? denominator.period ?? null,
      currency: params.currency ?? denominator.currency ?? null,
      sourceTimestamp: denominator.sourceTimestamp ?? null,
      quality: denominator.quality,
    });

  if (net.kind === "ABSENT") return invalid(seed(), `Net debt is ${net.state.toLowerCase()}: ${net.reason}`);
  const value = money(denominator, denominatorName);
  if (value === null) {
    return missing(seed(), `${metricCode} requires ${denominatorName}; the figure is absent rather than zero.`);
  }
  if (value <= 0) {
    return invalid(
      seed(),
      `${denominatorName} is ${value === 0 ? "zero" : "negative"}, so the leverage ratio is not a meaningful multiple.`,
    );
  }
  if (net.value < 0) {
    return notApplicable(
      seed(),
      `Net debt is negative (${net.value} minor units): the subject holds more cash than debt, so a leverage multiple does not describe it. Report net cash instead.`,
    );
  }

  const ratio = multiple(net.value, value);
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  return calculated({ ...seed(), inputs: [...inputs, ...net.provenance.inputs.filter((i) => !inputs.some((x) => x.name === i.name))] }, ratio.scaled);
}

/* ------------------------------------------------------------------ */
/* §4I — Revenue growth                                                */
/* ------------------------------------------------------------------ */

export type RevenueGrowthParams = {
  seed: MetricSeedBase;
  current: MoneyFigure;
  prior: MoneyFigure;
  /** Comparison kind; YoY and QoQ are the same arithmetic on differently chosen periods. */
  comparison: "YOY" | "QOQ" | "PERIOD_OVER_PERIOD";
  period?: string | null;
  currency?: string | null;
};

/**
 * Revenue Growth = (Current − Prior) / Prior, in basis points.
 *
 * Growth from a zero or negative prior base is REFUSED, not computed. "Revenue grew from 0 to
 * 5,000,000 (infinite %)" is an arithmetic artefact, and "grew from −100 to −50 (50% growth)" is
 * true and useless. Both are reported as INVALID with the reason, and a CAGR over a series
 * containing such a base returns null (the canonical `cagrBps` already behaves this way).
 */
export function revenueGrowth(params: RevenueGrowthParams): MetricOutcome<number> {
  const inputs = [
    moneyInput("currentRevenue", params.current),
    moneyInput("priorRevenue", params.prior),
    ...reportingCurrencyInput(params.currency, params.period ?? params.current.period),
  ];
  const label = params.comparison === "YOY" ? "Year-over-year" : params.comparison === "QOQ" ? "Quarter-over-quarter" : "Period-over-period";
  const seed = () =>
    seedFor(params.seed, `FIN.REVENUE_GROWTH.${params.comparison}`, `${label} revenue growth = (Current Revenue − Prior Revenue) ÷ Prior Revenue, in basis points`, inputs, {
      period: params.period ?? params.current.period ?? null,
      currency: params.currency ?? params.current.currency ?? null,
      sourceTimestamp: params.current.sourceTimestamp ?? null,
      quality: params.current.quality,
    });

  const mismatch = currencyMismatch(inputs.filter((i) => i.currency));
  if (mismatch) return invalid(seed(), mismatch);

  const current = money(params.current, "currentRevenue");
  const prior = money(params.prior, "priorRevenue");
  if (current === null || prior === null) {
    const absent = current === null ? "currentRevenue" : "priorRevenue";
    return missing(seed(), `${label} growth requires ${absent}; the figure is absent rather than zero.`);
  }
  if (prior <= 0) {
    return invalid(
      seed(),
      `The prior period revenue is ${prior === 0 ? "zero" : "negative"}, so a percentage growth rate is undefined. Report the absolute change instead.`,
    );
  }

  const change = current - prior;
  assertMoney(change, "revenueChange");
  const ratio = multiple(change, prior, { allowNegativeDenominator: false });
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  const bps = scaleDivide(ratio.scaled * BPS_BASE, 1_000_000, { allowNegativeDenominator: true });
  if (bps.kind === "REFUSED") return invalid(seed(), bps.detail);
  return calculated({ ...seed(), inputs: [...inputs, { name: "absoluteChangeMinor", value: String(change), unit: "CURRENCY_MINOR", kind: "DERIVED", source: "finance-intelligence", period: params.period ?? null, currency: params.currency ?? null }] }, bps.scaled);
}

export type RevenueCagrParams = {
  seed: MetricSeedBase;
  start: MoneyFigure;
  end: MoneyFigure;
  years: number;
  period?: string | null;
  currency?: string | null;
};

/**
 * Revenue CAGR over whole years, delegating to the canonical `cagrBps`.
 *
 * The canonical implementation returns `null` for a non-positive start or end, which is exactly the
 * right behaviour: a CAGR through a zero-revenue base does not exist. This function turns that null
 * into an explicit `INVALID` outcome with a reason rather than dropping it.
 */
export function revenueCagr(params: RevenueCagrParams): MetricOutcome<number> {
  const inputs = [
    moneyInput("startRevenue", params.start),
    moneyInput("endRevenue", params.end),
    {
      name: "years",
      value: String(params.years),
      unit: "YEARS",
      kind: "OBSERVED" as const,
      source: "caller-supplied holding period",
      period: params.period ?? null,
      currency: null,
    },
  ];
  const seed = () =>
    seedFor(params.seed, "FIN.REVENUE_CAGR", "Revenue CAGR = (End Revenue ÷ Start Revenue)^(1 ÷ years) − 1, in basis points", inputs, {
      period: params.period ?? null,
      currency: params.currency ?? params.end.currency ?? null,
      sourceTimestamp: params.end.sourceTimestamp ?? null,
      quality: params.end.quality,
    });

  const mismatch = currencyMismatch(inputs.filter((i) => i.currency));
  if (mismatch) return invalid(seed(), mismatch);

  const start = money(params.start, "startRevenue");
  const end = money(params.end, "endRevenue");
  if (start === null || end === null) {
    return missing(seed(), `Revenue CAGR requires ${start === null ? "startRevenue" : "endRevenue"}; the figure is absent.`);
  }
  if (!Number.isSafeInteger(params.years) || params.years <= 0) {
    return invalid(seed(), `CAGR requires a positive whole number of years; received ${params.years}.`);
  }
  const result = cagrBps(start, end, params.years);
  if (result === null) {
    return invalid(
      seed(),
      "Revenue CAGR is undefined because the start or end revenue is zero or negative. Report the absolute change instead of a growth rate.",
    );
  }
  return calculated(seed(), result);
}

/* ------------------------------------------------------------------ */
/* §4J — ROIC                                                          */
/* ------------------------------------------------------------------ */

/**
 * How invested capital was assembled. REQUIRED, because two analysts using the same data and
 * different conventions produce ROICs that differ by whole percentage points, and neither is wrong —
 * but a system that does not record which was used cannot be audited.
 */
export const ROIC_INVESTED_CAPITAL_BASIS = [
  /** Total debt + total equity − excess cash. The common practitioner convention. */
  "DEBT_PLUS_EQUITY_LESS_EXCESS_CASH",
  /** Total debt + total equity, cash included in the capital base. */
  "DEBT_PLUS_EQUITY",
  /** Total assets − non-interest-bearing current liabilities. The operating convention. */
  "OPERATING_CAPITAL",
] as const;
export type RoicInvestedCapitalBasis = (typeof ROIC_INVESTED_CAPITAL_BASIS)[number];

/** Accounting treatments the result records. Every flag is echoed into the provenance. */
export type RoicTreatment = {
  /** Effective tax rate used to derive NOPAT from EBIT. */
  effectiveTaxRateBps: number;
  /** Whether goodwill was deducted from invested capital (destroys comparability if not stated). */
  goodwillExcludedFromInvestedCapital: boolean;
  /** Whether operating leases were capitalised. */
  operatingLeasesCapitalised: boolean;
};

export type RoicParams = {
  seed: MetricSeedBase;
  /** EBIT (operating profit). */
  operatingIncome: MoneyFigure;
  /** If supplied directly, NOPAT is used as given and the tax rate is recorded as informational. */
  nopat?: MoneyFigure | null;
  totalDebt: MoneyFigure;
  totalEquity: MoneyFigure;
  cashAndEquivalents?: MoneyFigure;
  goodwill?: MoneyFigure;
  operatingLeaseLiabilities?: MoneyFigure;
  nonInterestBearingCurrentLiabilities?: MoneyFigure;
  basis: RoicInvestedCapitalBasis;
  treatment: RoicTreatment;
  period?: string | null;
  currency?: string | null;
};

/**
 * ROIC = NOPAT / Invested Capital, in basis points.
 *
 * NOPAT = EBIT × (1 − effective tax rate) unless NOPAT is supplied directly. Invested capital is
 * assembled from the declared basis, with every accounting choice recorded:
 *
 *   - taxes:        the effective rate is an explicit input, echoed into provenance
 *   - debt/equity:  both components are explicit inputs, never inferred from a balance-sheet total
 *   - excess cash:  deducted ONLY under the DEBT_PLUS_EQUITY_LESS_EXCESS_CASH basis
 *   - goodwill:     deducted only when the treatment says so, and the treatment is recorded
 *   - leases:       operating-lease liabilities added only when capitalised, recorded
 *
 * A zero or negative invested capital returns `INVALID`. A negative NOPAT is reported as a negative
 * ROIC — a value-destroying year is a fact, not an error.
 */
export function roic(params: RoicParams): MetricOutcome<number> {
  const inputs = [
    moneyInput("operatingIncome", params.operatingIncome),
    ...(params.nopat ? [moneyInput("nopatSupplied", params.nopat)] : []),
    moneyInput("totalDebt", params.totalDebt),
    moneyInput("totalEquity", params.totalEquity),
    moneyInput("cashAndCashEquivalents", params.cashAndEquivalents ?? NULL_MONEY),
    moneyInput("goodwill", params.goodwill ?? NULL_MONEY),
    moneyInput("operatingLeaseLiabilities", params.operatingLeaseLiabilities ?? NULL_MONEY),
    moneyInput("nonInterestBearingCurrentLiabilities", params.nonInterestBearingCurrentLiabilities ?? NULL_MONEY),
    {
      name: "investedCapitalBasis",
      value: params.basis,
      unit: "ENUM",
      kind: "POLICY" as const,
      source: "caller-declared accounting basis (required)",
      period: params.period ?? null,
      currency: null,
    },
    {
      name: "effectiveTaxRateBps",
      value: String(params.treatment.effectiveTaxRateBps),
      unit: "BASIS_POINTS",
      kind: "POLICY" as const,
      source: "caller-declared effective tax rate",
      period: params.period ?? null,
      currency: null,
    },
    {
      name: "goodwillExcludedFromInvestedCapital",
      value: String(params.treatment.goodwillExcludedFromInvestedCapital),
      unit: "BOOLEAN",
      kind: "POLICY" as const,
      source: "caller-declared treatment",
      period: params.period ?? null,
      currency: null,
    },
    {
      name: "operatingLeasesCapitalised",
      value: String(params.treatment.operatingLeasesCapitalised),
      unit: "BOOLEAN",
      kind: "POLICY" as const,
      source: "caller-declared treatment",
      period: params.period ?? null,
      currency: null,
    },
  ];
  const seed = () =>
    seedFor(
      params.seed,
      "FIN.ROIC",
      `ROIC = NOPAT ÷ Invested Capital (${params.basis}), in basis points. NOPAT = EBIT × (1 − effective tax rate) unless NOPAT is supplied directly.`,
      inputs,
      {
        period: params.period ?? null,
        currency: params.currency ?? params.totalDebt.currency ?? null,
        sourceTimestamp: params.totalDebt.sourceTimestamp ?? null,
        quality: params.totalDebt.quality,
      },
    );

  const mismatch = currencyMismatch(inputs.filter((i) => i.currency));
  if (mismatch) return invalid(seed(), mismatch);

  assertPercent(params.treatment.effectiveTaxRateBps, "effectiveTaxRateBps");
  if (params.treatment.effectiveTaxRateBps >= BPS_BASE) {
    return invalid(seed(), "The effective tax rate is 100% or more, so NOPAT would be zero or negative on a positive EBIT.");
  }
  if (params.treatment.effectiveTaxRateBps <= -BPS_BASE) {
    return invalid(seed(), `The effective tax rate (${params.treatment.effectiveTaxRateBps} bps) is outside the representable range.`);
  }

  const ebit = money(params.operatingIncome, "operatingIncome");
  const suppliedNopat = params.nopat ? money(params.nopat, "nopat") : null;
  if (suppliedNopat === null && ebit === null) {
    return missing(seed(), "ROIC requires either operating income and a tax rate, or NOPAT supplied directly.");
  }

  let nopat: number;
  if (suppliedNopat !== null) {
    nopat = suppliedNopat;
  } else {
    const ebitValue = ebit as number;
    // NOPAT = EBIT × (1 − t), computed in integer minor units with one stated rounding.
    const numerator = ebitValue * (BPS_BASE - params.treatment.effectiveTaxRateBps);
    nopat = Math.round(numerator / BPS_BASE);
    assertMoney(nopat, "nopat");
  }

  const debt = money(params.totalDebt, "totalDebt");
  const equity = money(params.totalEquity, "totalEquity");
  if (debt === null || equity === null) {
    const absent = debt === null ? "totalDebt" : "totalEquity";
    return missing(seed(), `Invested capital requires ${absent}; the figure is absent rather than zero.`);
  }

  const cash = money(params.cashAndEquivalents, "cashAndCashEquivalents") ?? 0;
  const goodwill = money(params.goodwill, "goodwill") ?? 0;
  const leases = money(params.operatingLeaseLiabilities, "operatingLeaseLiabilities") ?? 0;
  const nonInterestBearing = money(params.nonInterestBearingCurrentLiabilities, "nonInterestBearingCurrentLiabilities") ?? 0;

  if (params.basis === "OPERATING_CAPITAL") {
    // Operating capital is assembled from the operating side of the balance sheet. Without a total
    // assets figure this basis cannot be honoured from debt and equity alone, so it is refused
    // rather than approximated by a different formula wearing this label.
    return invalid(
      seed(),
      "The OPERATING_CAPITAL basis requires total assets and non-interest-bearing current liabilities. This engine will not approximate it from debt and equity, because that would silently compute a different ratio under this name.",
    );
  }

  // The capital base, assembled from the declared basis. Every adjustment is a labelled step so a
  // reader can reproduce the figure.
  let investedCapital: number = params.basis === "DEBT_PLUS_EQUITY_LESS_EXCESS_CASH" ? debt + equity - cash : debt + equity;
  if (params.treatment.goodwillExcludedFromInvestedCapital) investedCapital -= goodwill;
  if (params.treatment.operatingLeasesCapitalised) investedCapital += leases;
  void nonInterestBearing;

  assertMoney(investedCapital, "investedCapital");
  if (investedCapital === 0) {
    return invalid(seed(), "Invested capital is zero, so ROIC is undefined.");
  }
  if (investedCapital < 0) {
    return invalid(
      seed(),
      `Invested capital is negative (${investedCapital} minor units) under the ${params.basis} basis. A negative capital base makes ROIC uninterpretable; adjust the basis or the treatments and recalculate.`,
    );
  }

  const ratio = multiple(nopat, investedCapital, { allowNegativeDenominator: true });
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  const bps = scaleDivide(ratio.scaled * BPS_BASE, 1_000_000, { allowNegativeDenominator: true });
  if (bps.kind === "REFUSED") return invalid(seed(), bps.detail);
  return calculated(
    {
      ...seed(),
      inputs: [
        ...inputs,
        { name: "nopatMinor", value: String(nopat), unit: "CURRENCY_MINOR", kind: "DERIVED", source: "finance-intelligence", period: params.period ?? null, currency: params.currency ?? null },
        { name: "investedCapitalMinor", value: String(investedCapital), unit: "CURRENCY_MINOR", kind: "DERIVED", source: "finance-intelligence", period: params.period ?? null, currency: params.currency ?? null },
      ],
    },
    bps.scaled,
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             *
/* ------------------------------------------------------------------ */

/** A canonical "this figure was not supplied" money figure. Used to keep provenance honest. */
const NULL_MONEY: MoneyFigure = { amountMinor: null, source: "not supplied", period: null, currency: null, sourceTimestamp: null };

function shareClassInput(shareClass: string): MetricInput {
  return {
    name: "shareClass",
    value: shareClass,
    unit: "ENUM",
    kind: "OBSERVED",
    source: "security/share-class registry",
    period: null,
    currency: null,
  };
}

function effectiveDateInput(asOf: string): MetricInput {
  return {
    name: "asOf",
    value: asOf,
    unit: "DATE",
    kind: "OBSERVED",
    source: "caller-supplied valuation effective date",
    period: null,
    currency: null,
  };
}

/** A metric-id factory that discards ids. Used where an internal call's ids must not be exposed. */
function silentIdFactory(): () => string {
  return metricIdFactory("INTERNAL", 0);
}

/**
 * Read a whole-number input strictly. Exported because the valuation and analytics layers need the
 * same refusal semantics as this module.
 */
export function strictInteger(input: MetricInput | undefined | null, label: string): number | null {
  const value = parseDecimal(input);
  if (value === null) return null;
  if (!Number.isInteger(value)) {
    throw new FinanceArithmeticError("INVALID_MONEY", `${label} must be a whole number, received ${value}.`, { label, value });
  }
  return value;
}

export { hasInput, isValueState, formatMultiple, cagrBps, scaleAdd, toMinorUnits, metricIdFactory };
