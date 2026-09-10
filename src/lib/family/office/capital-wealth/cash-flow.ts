/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH ENGINE: consolidated family cash flow
 * (§16), the family balance sheet (§17), productive capital metrics (§18) and
 * liquidity (§15, §20).
 *
 * ============================== WHAT THIS IS ================================
 *
 * A CONSOLIDATED VIEW across the family's whole capital position: business
 * income, rent, interest, dividends, royalties, agriculture, capital gains,
 * financing inflows and contributions against operating costs, taxes, debt
 * service, capex and distributions — and from those the six measures §16 names
 * (operating, free, recurring and discretionary cash flow, debt coverage,
 * liquidity runway) plus §18's three productive capital metrics.
 *
 * ============================ WHAT THIS IS NOT ================================
 *
 * NOT an accounting consolidation. Finance OS owns the journal, the period, the
 * reconciliation and the financial statements (§32). Every input to this module
 * arrives already classified by the caller, each with an epistemic class, and
 * the module computes over them. It cannot post, accrue or close a period. Where
 * an input is a Finance OS figure the caller supplies the reference and the
 * engine records the class as `POSTED`; where it is a projection the class is
 * `FORECAST` and the result carries that caveat to the reader.
 *
 * NOT an FX engine. Totals are per currency. No FX rate has been ratified, so a
 * single-currency family total would be invention — the same position
 * `src/lib/specialist/treasury/model.ts` already takes.
 */

import {
  assertMinorUnits,
  gradeRedLine,
  liquidityRunwayDays,
  ratioBps,
  recurringCashFlowCoverageBps,
  capitalUtilisationBps,
  productiveCapitalRatioBps,
  type CapitalEpistemicClass,
  type FinancialRedLineBand,
  type RedLineLadder,
} from "./metrics";

export const FAMILY_CASHFLOW_ENGINE_VERSION = "family-cashflow-engine-1.0.0";

/* ------------------------------------------------------------------ */
/* Cash-flow classification (§16)                                      */
/* ------------------------------------------------------------------ */

/** The inflow categories §16 names. */
export const CASH_INFLOW_CATEGORIES = [
  "BUSINESS_INCOME",
  "RENTAL_INCOME",
  "INTEREST",
  "DIVIDENDS",
  "ROYALTIES",
  "AGRICULTURE",
  "CAPITAL_GAINS",
  "FINANCING_INFLOW",
  "CAPITAL_CONTRIBUTION",
] as const;
export type CashInflowCategory = (typeof CASH_INFLOW_CATEGORIES)[number];

/** The outflow categories §16 names. */
export const CASH_OUTFLOW_CATEGORIES = [
  "OPERATING_COST",
  "TAX",
  "DEBT_SERVICE",
  "CAPEX",
  "DISTRIBUTION",
] as const;
export type CashOutflowCategory = (typeof CASH_OUTFLOW_CATEGORIES)[number];

/** Which categories are OPERATING for the purpose of operating cash flow. */
export const OPERATING_INFLOW_CATEGORIES: readonly CashInflowCategory[] = [
  "BUSINESS_INCOME",
  "RENTAL_INCOME",
  "INTEREST",
  "DIVIDENDS",
  "ROYALTIES",
  "AGRICULTURE",
];
export const OPERATING_OUTFLOW_CATEGORIES: readonly CashOutflowCategory[] = ["OPERATING_COST", "TAX"];

/** Which inflows are RECURRING for the purpose of recurring cash flow coverage. */
export const RECURRING_INFLOW_CATEGORIES: readonly CashInflowCategory[] = [
  "BUSINESS_INCOME",
  "RENTAL_INCOME",
  "INTEREST",
  "DIVIDENDS",
  "ROYALTIES",
  "AGRICULTURE",
];

/** Which inflows are DISCRETIONARY (non-operating, non-recurring). */
export const DISCRETIONARY_INFLOW_CATEGORIES: readonly CashInflowCategory[] = ["CAPITAL_GAINS", "FINANCING_INFLOW", "CAPITAL_CONTRIBUTION"];

export type CashFlowItem = {
  id: string;
  tenantId: string;
  legalEntityId: string;
  countryCode: string;
  currency: string;
  /** ISO period the item belongs to, e.g. "2026-09" or "2026-Q3". */
  period: string;
  direction: "INFLOW" | "OUTFLOW";
  /** Inflow category for an inflow; outflow category for an outflow. */
  category: CashInflowCategory | CashOutflowCategory;
  amountMinor: number;
  /** Where the number came from. A Finance OS figure is POSTED; a projection is FORECAST. */
  basis: CapitalEpistemicClass;
  /** The authoritative source: a journal reference, a sector OS reference, or a model. */
  sourceRef: string;
  /** Whether the item repeats by nature. Determines the recurring measures. */
  recurring: boolean;
  /** The sector OS it originated in, for the cross-sector view (§31). */
  sectorCode: string | null;
};

/* ------------------------------------------------------------------ */
/* Cash-flow consolidation                                             */
/* ------------------------------------------------------------------ */

export type CashFlowConsolidation = {
  engineVersion: string;
  asOf: string;
  /** Per currency, because a cross-currency total would require a ratified rate. */
  byCurrency: {
    currency: string;
    inflowMinor: number;
    outflowMinor: number;
    netMinor: number;
    /** Operating cash flow: operating inflows less operating outflows. */
    operatingCashFlowMinor: number;
    /** Free cash flow: operating cash flow less capex. */
    freeCashFlowMinor: number;
    /** Recurring cash flow: recurring inflows less debt service and operating costs. */
    recurringCashFlowMinor: number;
    /** Discretionary cash flow: non-operating, non-recurring inflows. */
    discretionaryCashFlowMinor: number;
    itemCount: number;
  }[];
  byCategory: { category: string; direction: "INFLOW" | "OUTFLOW"; amountMinor: number; count: number }[];
  /** The cross-sector view (§31): what each sector OS contributed. */
  bySector: { sectorCode: string; inflowMinor: number; outflowMinor: number; netMinor: number }[];
  /** Recurring obligations: debt service plus recurring operating costs. */
  recurringObligationsMinor: number;
  /** §18: recurring income over recurring obligations, basis points. */
  recurringCashFlowCoverageBps: number | null;
  /** §16: operating cash flow over debt service, basis points. */
  debtCoverageBps: number | null;
  /** Items whose basis is a projection, so the reader can see what is not fact. */
  forecastItemCount: number;
  forecastItemIds: string[];
  /** Items excluded, with the reason. Never silently dropped. */
  excluded: { itemId: string; reason: string }[];
  explanation: string[];
};

/**
 * Consolidate cash flow into the §16 measures.
 *
 * Definitions are stated because they are choices, and two reasonable analysts
 * make different ones:
 *
 *   OPERATING   = operating inflows (business, rent, interest, dividends,
 *                 royalties, agriculture) less operating outflows (operating
 *                 cost, tax). Excludes financing, capex and distributions.
 *   FREE        = operating cash flow less capex.
 *   RECURRING   = recurring inflows less recurring obligations (debt service plus
 *                 recurring operating cost).
 *   DISCRETIONARY = non-operating, non-recurring inflows (capital gains,
 *                 financing, contributions).
 *   DEBT COVERAGE = operating cash flow over debt service.
 */
export function consolidateCashFlow(items: readonly CashFlowItem[], asOf: string): CashFlowConsolidation {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`asOf must be an ISO date; received "${asOf}".`);
  const excluded: { itemId: string; reason: string }[] = [];
  const valid: CashFlowItem[] = [];
  for (const item of items) {
    if (!Number.isInteger(item.amountMinor) || item.amountMinor < 0) {
      excluded.push({ itemId: item.id, reason: "Amount must be a non-negative integer number of minor units; the direction field carries the sign." });
      continue;
    }
    const knownInflow = (CASH_INFLOW_CATEGORIES as readonly string[]).includes(item.category);
    const knownOutflow = (CASH_OUTFLOW_CATEGORIES as readonly string[]).includes(item.category);
    if (item.direction === "INFLOW" && !knownInflow) {
      excluded.push({ itemId: item.id, reason: `"${item.category}" is not a known inflow category.` });
      continue;
    }
    if (item.direction === "OUTFLOW" && !knownOutflow) {
      excluded.push({ itemId: item.id, reason: `"${item.category}" is not a known outflow category.` });
      continue;
    }
    valid.push(item);
  }

  const sum = (predicate: (i: CashFlowItem) => boolean) => valid.filter(predicate).reduce((s, i) => s + i.amountMinor, 0);

  const byCurrency = [...new Set(valid.map((i) => i.currency))].sort().map((currency) => {
    const rows = valid.filter((i) => i.currency === currency);
    const inRows = rows.filter((i) => i.direction === "INFLOW");
    const outRows = rows.filter((i) => i.direction === "OUTFLOW");
    const operatingIn = inRows.filter((i) => (OPERATING_INFLOW_CATEGORIES as readonly string[]).includes(i.category)).reduce((s, i) => s + i.amountMinor, 0);
    const operatingOut = outRows.filter((i) => (OPERATING_OUTFLOW_CATEGORIES as readonly string[]).includes(i.category)).reduce((s, i) => s + i.amountMinor, 0);
    const capex = outRows.filter((i) => i.category === "CAPEX").reduce((s, i) => s + i.amountMinor, 0);
    const debtService = outRows.filter((i) => i.category === "DEBT_SERVICE").reduce((s, i) => s + i.amountMinor, 0);
    const recurringIn = inRows.filter((i) => i.recurring && (RECURRING_INFLOW_CATEGORIES as readonly string[]).includes(i.category)).reduce((s, i) => s + i.amountMinor, 0);
    const recurringOpCost = outRows.filter((i) => i.recurring && i.category === "OPERATING_COST").reduce((s, i) => s + i.amountMinor, 0);
    const discretionary = inRows.filter((i) => (DISCRETIONARY_INFLOW_CATEGORIES as readonly string[]).includes(i.category)).reduce((s, i) => s + i.amountMinor, 0);
    const operating = operatingIn - operatingOut;

    return {
      currency,
      inflowMinor: inRows.reduce((s, i) => s + i.amountMinor, 0),
      outflowMinor: outRows.reduce((s, i) => s + i.amountMinor, 0),
      netMinor: inRows.reduce((s, i) => s + i.amountMinor, 0) - outRows.reduce((s, i) => s + i.amountMinor, 0),
      operatingCashFlowMinor: operating,
      freeCashFlowMinor: operating - capex,
      recurringCashFlowMinor: recurringIn - recurringOpCost - debtService,
      discretionaryCashFlowMinor: discretionary,
      itemCount: rows.length,
    };
  });

  const categories = [...new Set(valid.map((i) => `${i.direction}:${i.category}`))].sort().map((key) => {
    const [direction, category] = key.split(":") as ["INFLOW" | "OUTFLOW", string];
    const rows = valid.filter((i) => i.direction === direction && i.category === category);
    return { category, direction, amountMinor: rows.reduce((s, i) => s + i.amountMinor, 0), count: rows.length };
  });

  const sectors = [...new Set(valid.map((i) => i.sectorCode ?? "FAMILY_OFFICE"))].sort().map((sectorCode) => {
    const rows = valid.filter((i) => (i.sectorCode ?? "FAMILY_OFFICE") === sectorCode);
    const inflow = rows.filter((i) => i.direction === "INFLOW").reduce((s, i) => s + i.amountMinor, 0);
    const outflow = rows.filter((i) => i.direction === "OUTFLOW").reduce((s, i) => s + i.amountMinor, 0);
    return { sectorCode, inflowMinor: inflow, outflowMinor: outflow, netMinor: inflow - outflow };
  });

  const totalRecurringObligations = valid.filter((i) => i.direction === "OUTFLOW" && (i.category === "DEBT_SERVICE" || (i.recurring && i.category === "OPERATING_COST"))).reduce((s, i) => s + i.amountMinor, 0);
  const totalRecurringIncome = valid.filter((i) => i.direction === "INFLOW" && i.recurring && (RECURRING_INFLOW_CATEGORIES as readonly string[]).includes(i.category)).reduce((s, i) => s + i.amountMinor, 0);
  const totalOperating = valid.filter((i) => i.direction === "INFLOW" && (OPERATING_INFLOW_CATEGORIES as readonly string[]).includes(i.category)).reduce((s, i) => s + i.amountMinor, 0) - valid.filter((i) => i.direction === "OUTFLOW" && (OPERATING_OUTFLOW_CATEGORIES as readonly string[]).includes(i.category)).reduce((s, i) => s + i.amountMinor, 0);
  const totalDebtService = valid.filter((i) => i.category === "DEBT_SERVICE").reduce((s, i) => s + i.amountMinor, 0);
  const forecast = valid.filter((i) => i.basis === "FORECAST" || i.basis === "SCENARIO" || i.basis === "ASSUMPTION");

  return {
    engineVersion: FAMILY_CASHFLOW_ENGINE_VERSION,
    asOf,
    byCurrency,
    byCategory: categories,
    bySector: sectors,
    recurringObligationsMinor: totalRecurringObligations,
    recurringCashFlowCoverageBps: recurringCashFlowCoverageBps(totalRecurringIncome, totalRecurringObligations),
    debtCoverageBps: ratioBps(totalOperating, totalDebtService),
    forecastItemCount: forecast.length,
    forecastItemIds: forecast.map((i) => i.id),
    excluded,
    explanation: [
      `${valid.length} item(s) consolidated across ${byCurrency.length} currency(ies); ${excluded.length} excluded and named.`,
      "OPERATING = operating inflows less operating outflows (operating cost, tax). FREE = operating less capex. RECURRING = recurring inflows less debt service and recurring operating cost. DISCRETIONARY = capital gains, financing and contributions.",
      forecast.length > 0 ? `${forecast.length} item(s) carry a projection basis (${forecast.map((i) => i.id).join(", ")}). They are included in the totals and flagged here, because a total that mixes fact and forecast without saying so is misleading.` : "Every item is an observed or posted figure.",
      "Totals are per currency. No cross-currency total is produced because no FX rate has been ratified.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* §17 — Family balance sheet                                          */
/* ------------------------------------------------------------------ */

/** A balance-sheet line, with its liquidity and productivity classification. */
export type BalanceSheetLine = {
  code: string;
  label: string;
  side: "ASSET" | "LIABILITY";
  amountMinor: number;
  currency: string;
  legalEntityId: string | null;
  countryCode: string | null;
  assetClass: string | null;
  /** ASSET lines only: how quickly it converts to cash. */
  liquidity: "LIQUID" | "NEAR_LIQUID" | "ILLIQUID" | null;
  /** ASSET lines only: whether it produces income. Drives the productive capital ratio. */
  productive: boolean | null;
  /** Epistemic class of the amount. */
  basis: CapitalEpistemicClass;
  /** The authoritative source. */
  sourceRef: string;
};

export type ContingentLiability = {
  code: string;
  label: string;
  amountMinor: number;
  currency: string;
  /** What triggers it. Required: a contingent liability with no trigger cannot be monitored. */
  trigger: string;
  /** Probability band as assessed by a human. Never inferred. */
  likelihood: "REMOTE" | "POSSIBLE" | "PROBABLE" | null;
  sourceRef: string;
};

export type FamilyBalanceSheet = {
  engineVersion: string;
  asOf: string;
  /** Per currency. Never totalled across currencies. */
  byCurrency: {
    currency: string;
    totalAssetsMinor: number;
    totalLiabilitiesMinor: number;
    netWorthMinor: number;
    liquidAssetsMinor: number;
    nearLiquidAssetsMinor: number;
    illiquidAssetsMinor: number;
    /** Investable capital: liquid plus near-liquid assets less committed amounts. */
    investableCapitalMinor: number;
    debtMinor: number;
    netDebtMinor: number;
    capitalCommitmentsMinor: number;
    contingentLiabilitiesMinor: number;
    /** §18 productive capital ratio, basis points. */
    productiveCapitalRatioBps: number | null;
    /** §18 capital utilisation, basis points. */
    capitalUtilisationBps: number | null;
  }[];
  /** The authorised breakdown views (§17). */
  byEntity: { key: string; assetsMinor: number; liabilitiesMinor: number; netWorthMinor: number }[];
  byCountry: { key: string; assetsMinor: number; liabilitiesMinor: number; netWorthMinor: number }[];
  byAssetClass: { key: string; amountMinor: number; shareBps: number | null }[];
  /** Lines excluded, with the reason. */
  excluded: { code: string; reason: string }[];
  /** Contingent liabilities are disclosed, never netted into net worth. */
  contingentDisclosure: ContingentLiability[];
  explanation: string[];
};

/**
 * Build the consolidated family balance sheet (§17).
 *
 * Two rules are load-bearing:
 *
 *   1. Contingent liabilities are DISCLOSED, never netted into net worth. A
 *      guarantee the family has given is a real exposure and a real disclosure,
 *      but subtracting a possible amount from net worth would understate it by an
 *      amount nobody has decided is the right estimate.
 *   2. Totals are per currency. Net worth across currencies would require a
 *      ratified FX rate, and none exists.
 */
export function buildFamilyBalanceSheet(params: {
  lines: readonly BalanceSheetLine[];
  contingents: readonly ContingentLiability[];
  asOf: string;
  /** Capital already committed but not yet deployed, minor units per currency. */
  capitalCommitments: readonly { currency: string; amountMinor: number }[];
}): FamilyBalanceSheet {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.asOf)) throw new Error(`asOf must be an ISO date; received "${params.asOf}".`);
  const excluded: { code: string; reason: string }[] = [];
  const valid: BalanceSheetLine[] = [];
  for (const line of params.lines) {
    if (!Number.isInteger(line.amountMinor)) {
      excluded.push({ code: line.code, reason: "Amount must be an integer number of minor units." });
      continue;
    }
    if (line.side === "ASSET" && line.liquidity === null) {
      excluded.push({ code: line.code, reason: "An asset line must classify its liquidity; without it the liquidity engine cannot bucket it." });
      continue;
    }
    if (line.side === "ASSET" && line.productive === null) {
      excluded.push({ code: line.code, reason: "An asset line must state whether it is productive; the productive capital ratio depends on it." });
      continue;
    }
    valid.push(line);
  }

  const commitmentFor = (currency: string) => params.capitalCommitments.filter((c) => c.currency === currency).reduce((s, c) => s + c.amountMinor, 0);

  const byCurrency = [...new Set(valid.map((l) => l.currency))].sort().map((currency) => {
    const rows = valid.filter((l) => l.currency === currency);
    const assets = rows.filter((l) => l.side === "ASSET");
    const liabilities = rows.filter((l) => l.side === "LIABILITY");
    const totalAssets = assets.reduce((s, l) => s + l.amountMinor, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.amountMinor, 0);
    const liquid = assets.filter((l) => l.liquidity === "LIQUID").reduce((s, l) => s + l.amountMinor, 0);
    const nearLiquid = assets.filter((l) => l.liquidity === "NEAR_LIQUID").reduce((s, l) => s + l.amountMinor, 0);
    const illiquid = assets.filter((l) => l.liquidity === "ILLIQUID").reduce((s, l) => s + l.amountMinor, 0);
    const productive = assets.filter((l) => l.productive === true).reduce((s, l) => s + l.amountMinor, 0);
    const commitments = commitmentFor(currency);

    return {
      currency,
      totalAssetsMinor: totalAssets,
      totalLiabilitiesMinor: totalLiabilities,
      netWorthMinor: totalAssets - totalLiabilities,
      liquidAssetsMinor: liquid,
      nearLiquidAssetsMinor: nearLiquid,
      illiquidAssetsMinor: illiquid,
      investableCapitalMinor: Math.max(liquid + nearLiquid - commitments, 0),
      debtMinor: liabilities.reduce((s, l) => s + l.amountMinor, 0),
      netDebtMinor: liabilities.reduce((s, l) => s + l.amountMinor, 0) - liquid,
      capitalCommitmentsMinor: commitments,
      contingentLiabilitiesMinor: params.contingents.filter((c) => c.currency === currency).reduce((s, c) => s + c.amountMinor, 0),
      productiveCapitalRatioBps: productiveCapitalRatioBps(productive, totalAssets),
      capitalUtilisationBps: capitalUtilisationBps(productive, Math.max(liquid + nearLiquid - commitments, 0)),
    };
  });

  const groupBy = (keyOf: (l: BalanceSheetLine) => string | null) => {
    const keys = [...new Set(valid.map(keyOf).filter((k): k is string => k !== null))].sort();
    return keys.map((key) => {
      const rows = valid.filter((l) => keyOf(l) === key);
      const assets = rows.filter((l) => l.side === "ASSET").reduce((s, l) => s + l.amountMinor, 0);
      const liabilities = rows.filter((l) => l.side === "LIABILITY").reduce((s, l) => s + l.amountMinor, 0);
      return { key, assetsMinor: assets, liabilitiesMinor: liabilities, netWorthMinor: assets - liabilities };
    });
  };

  const totalAssetValue = valid.filter((l) => l.side === "ASSET").reduce((s, l) => s + l.amountMinor, 0);
  const classes = [...new Set(valid.filter((l) => l.side === "ASSET").map((l) => l.assetClass).filter((c): c is string => c !== null))].sort();

  return {
    engineVersion: FAMILY_CASHFLOW_ENGINE_VERSION,
    asOf: params.asOf,
    byCurrency,
    byEntity: groupBy((l) => l.legalEntityId),
    byCountry: groupBy((l) => l.countryCode),
    byAssetClass: classes.map((key) => {
      const amount = valid.filter((l) => l.side === "ASSET" && l.assetClass === key).reduce((s, l) => s + l.amountMinor, 0);
      return { key, amountMinor: amount, shareBps: ratioBps(amount, totalAssetValue) };
    }),
    excluded,
    contingentDisclosure: [...params.contingents],
    explanation: [
      `${valid.length} line(s) across ${byCurrency.length} currency(ies); ${excluded.length} excluded and named.`,
      "Net worth = total assets − total liabilities, per currency. No cross-currency net worth is produced because no FX rate has been ratified.",
      params.contingents.length > 0
        ? `${params.contingents.length} contingent liability(ies) totalling ${params.contingents.reduce((s, c) => s + c.amountMinor, 0)} minor units are DISCLOSED and deliberately NOT netted into net worth. Subtracting a possible amount would understate net worth by an amount nobody has decided is the right estimate.`
        : "No contingent liabilities disclosed.",
      "Investable capital = liquid + near-liquid assets less capital already committed. A commitment is capital the family has promised and cannot redeploy.",
      "Net debt = total liabilities less liquid assets. It is a liquidity-adjusted reading, not an accounting measure.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* §15 / §20 — Liquidity                                               */
/* ------------------------------------------------------------------ */

export const LIQUIDITY_HORIZONS_DAYS = [30, 90, 180, 365] as const;
export type LiquidityHorizonDays = (typeof LIQUIDITY_HORIZONS_DAYS)[number];

export type ExpectedFlow = {
  id: string;
  /** ISO date the flow is expected. */
  date: string;
  direction: "INFLOW" | "OUTFLOW";
  amountMinor: number;
  currency: string;
  /** What it is. Used in the explanation, never in the arithmetic. */
  description: string;
  /** How confident the family is that the date and amount hold. */
  certainty: "CONTRACTUAL" | "EXPECTED" | "ESTIMATED";
};

export type LiquidityHorizonResult = {
  horizonDays: number;
  openingMinor: number;
  inflowMinor: number;
  outflowMinor: number;
  closingMinor: number;
  /** The lowest projected closing balance inside the horizon. */
  minimumMinor: number;
  /** The date of the trough. Null when no dated flow exists. */
  minimumDate: string | null;
  /** True when the projection goes negative inside the horizon. */
  breachesZero: boolean;
  /** Flows with no ISO date, excluded and named. */
  undatedAmountMinor: number;
  explanation: string;
};

export type LiquidityPosition = {
  engineVersion: string;
  asOf: string;
  /** Opening liquid resources, minor units, per currency. */
  liquidMinor: number;
  nearLiquidMinor: number;
  illiquidMinor: number;
  currency: string;
  /** The §15 forecast at 30/90/180/365 days. */
  horizons: LiquidityHorizonResult[];
  /** §20 liquidity coverage: liquid resources over upcoming obligations, basis points. */
  liquidityCoverageBps: number | null;
  /** §16/§20 runway in days. Null when there are no obligations. */
  liquidityRunwayDays: number | null;
  /** Average daily net obligation used for the runway. */
  averageDailyNetObligationMinor: number;
  /** The nearest dated obligation, so an alert can name it. */
  nearestObligation: { date: string; amountMinor: number; description: string } | null;
  /** Always SCENARIO: a forecast is a hypothetical world. */
  basis: Extract<CapitalEpistemicClass, "SCENARIO">;
  assumptions: string[];
  explanation: string[];
};

/**
 * Project liquidity across the four §15 horizons.
 *
 * Flows are applied in DATE ORDER so the trough is found correctly: a horizon
 * that nets inflows and outflows without sequencing them can show a comfortable
 * closing balance over a month in which the family ran out of cash on day nine.
 * That is the specific error this implementation exists to avoid.
 *
 * `certainty` is carried on each flow and surfaced in the assumptions, but it is
 * NOT used to discount amounts: deciding that an ESTIMATED outflow is 70% likely
 * to occur is a risk-appetite judgement nobody has ratified. The projection shows
 * the contractual, expected and estimated flows together and says which is which.
 */
export function projectLiquidity(params: {
  asOf: string;
  currency: string;
  liquidMinor: number;
  nearLiquidMinor: number;
  illiquidMinor: number;
  flows: readonly ExpectedFlow[];
}): LiquidityPosition {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.asOf)) throw new Error(`asOf must be an ISO date; received "${params.asOf}".`);
  assertMinorUnits(params.liquidMinor, "liquid");
  assertMinorUnits(params.nearLiquidMinor, "nearLiquid");
  assertMinorUnits(params.illiquidMinor, "illiquid");

  const dated = params.flows.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.date) && f.currency === params.currency);
  const undated = params.flows.filter((f) => !/^\d{4}-\d{2}-\d{2}$/.test(f.date) && f.currency === params.currency);
  const sorted = [...dated].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const runHorizon = (horizonDays: number): LiquidityHorizonResult => {
    let balance = params.liquidMinor;
    let inflow = 0;
    let outflow = 0;
    let minimum = balance;
    let minimumDate: string | null = null;
    for (const flow of sorted) {
      const days = dayDiff(params.asOf, flow.date);
      if (days < 0 || days > horizonDays) continue;
      if (flow.direction === "INFLOW") {
        balance += flow.amountMinor;
        inflow += flow.amountMinor;
      } else {
        balance -= flow.amountMinor;
        outflow += flow.amountMinor;
      }
      if (balance < minimum) {
        minimum = balance;
        minimumDate = flow.date;
      }
    }
    return {
      horizonDays,
      openingMinor: params.liquidMinor,
      inflowMinor: inflow,
      outflowMinor: outflow,
      closingMinor: balance,
      minimumMinor: minimum,
      minimumDate,
      breachesZero: minimum < 0,
      undatedAmountMinor: undated.reduce((s, f) => s + f.amountMinor, 0),
      explanation: `${horizonDays} days: inflows ${inflow}, outflows ${outflow}, closing ${balance}, trough ${minimum}${minimumDate ? ` on ${minimumDate}` : ""}${minimum < 0 ? " — the projection goes negative inside this horizon" : ""}.`,
    };
  };

  const horizons = LIQUIDITY_HORIZONS_DAYS.map(runHorizon);
  const next90 = horizons.find((h) => h.horizonDays === 90);
  const upcomingObligations = sorted.filter((f) => f.direction === "OUTFLOW" && dayDiff(params.asOf, f.date) >= 0 && dayDiff(params.asOf, f.date) <= 90);
  const totalObligations90 = upcomingObligations.reduce((s, f) => s + f.amountMinor, 0);
  const nearest = upcomingObligations[0] ?? null;

  return {
    engineVersion: FAMILY_CASHFLOW_ENGINE_VERSION,
    asOf: params.asOf,
    liquidMinor: params.liquidMinor,
    nearLiquidMinor: params.nearLiquidMinor,
    illiquidMinor: params.illiquidMinor,
    currency: params.currency,
    horizons,
    liquidityCoverageBps: ratioBps(params.liquidMinor, totalObligations90),
    liquidityRunwayDays: liquidityRunwayDays(params.liquidMinor, totalObligations90 > 0 ? Math.round(totalObligations90 / 90) : 0),
    averageDailyNetObligationMinor: totalObligations90 > 0 ? Math.round(totalObligations90 / 90) : 0,
    nearestObligation: nearest ? { date: nearest.date, amountMinor: nearest.amountMinor, description: nearest.description } : null,
    basis: "SCENARIO",
    assumptions: [
      "Flows are applied in date order, so the trough reflects real sequencing rather than a netted average.",
      `Certainty is carried but NOT used to discount amounts: ${[...new Set(dated.map((f) => f.certainty))].join(", ") || "no dated flows"}. Deciding that an ESTIMATED flow is partially likely is a risk-appetite judgement nobody has ratified.`,
      undated.length > 0 ? `${undated.length} flow(s) with no ISO date are excluded from every horizon and reported. They are never assumed to fall outside the window.` : "Every flow carries an ISO date.",
      "This projection is SCENARIO. It is not a cash balance and must not be posted (§32).",
    ],
    explanation: [
      `Opening liquid resources ${params.liquidMinor} ${params.currency}; near-liquid ${params.nearLiquidMinor}; illiquid ${params.illiquidMinor}.`,
      ...horizons.map((h) => h.explanation),
      nearest ? `Nearest obligation: ${nearest.description} of ${nearest.amountMinor} on ${nearest.date}.` : "No dated obligation inside 90 days.",
      horizons.some((h) => h.breachesZero)
        ? `ALERT: the projection goes negative inside ${horizons.filter((h) => h.breachesZero).map((h) => `${h.horizonDays}d`).join(", ")}.`
        : "No horizon projects a negative balance.",
    ],
  };
}

function dayDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Liquidity alerts (§20)                                              */
/* ------------------------------------------------------------------ */

export type LiquidityAlert = {
  code: string;
  /** Advisory only: an alert never freezes, transfers or approves anything. */
  advisoryOnly: true;
  horizonDays: number | null;
  band: FinancialRedLineBand | null;
  message: string;
};

/**
 * Generate liquidity alerts from a projection and a caller-supplied ladder.
 *
 * With no ladder, an alert is still raised for a projection that goes negative —
 * running out of cash is a fact about the projection, not a policy judgement.
 * Everything else requires a threshold, and absent one the alert says so rather
 * than guessing a severity.
 */
export function raiseLiquidityAlerts(position: LiquidityPosition, coverageLadder: RedLineLadder | null): LiquidityAlert[] {
  const alerts: LiquidityAlert[] = [];

  for (const horizon of position.horizons) {
    if (horizon.breachesZero) {
      alerts.push({
        code: "LIQUIDITY_PROJECTION_NEGATIVE",
        advisoryOnly: true,
        horizonDays: horizon.horizonDays,
        band: "RED",
        message: `Projected liquid resources fall to ${horizon.minimumMinor} ${position.currency} inside ${horizon.horizonDays} days${horizon.minimumDate ? ` (trough ${horizon.minimumDate})` : ""}. This is a fact about the projection, not a policy judgement: the family runs out of cash on this forecast.`,
      });
    }
  }

  if (position.liquidityCoverageBps !== null) {
    const band = coverageLadder ? gradeRedLine(position.liquidityCoverageBps, coverageLadder) : null;
    alerts.push({
      code: "LIQUIDITY_COVERAGE",
      advisoryOnly: true,
      horizonDays: 90,
      band,
      message:
        band === null
          ? `Liquidity coverage over 90-day obligations is ${position.liquidityCoverageBps} bps but no threshold has been ratified, so no band is asserted. An unset limit is not a pass.`
          : `Liquidity coverage over 90-day obligations is ${position.liquidityCoverageBps} bps: ${band}.`,
    });
  } else {
    alerts.push({
      code: "LIQUIDITY_COVERAGE_UNAVAILABLE",
      advisoryOnly: true,
      horizonDays: 90,
      band: null,
      message: "No dated obligation inside 90 days, so liquidity coverage is undefined. That is reported as absent, never as infinite coverage.",
    });
  }

  if (position.liquidityRunwayDays !== null) {
    alerts.push({
      code: "LIQUIDITY_RUNWAY",
      advisoryOnly: true,
      horizonDays: null,
      band: null,
      message: `Liquidity runway is ${position.liquidityRunwayDays} days at the average daily net obligation of ${position.averageDailyNetObligationMinor}. Whether that is sufficient is a ratified reserve level (CAP-006), not an arithmetic result.`,
    });
  }

  if (position.nearestObligation) {
    alerts.push({
      code: "NEAREST_OBLIGATION",
      advisoryOnly: true,
      horizonDays: dayDiff(position.asOf, position.nearestObligation.date),
      band: null,
      message: `Nearest obligation: ${position.nearestObligation.description} of ${position.nearestObligation.amountMinor} on ${position.nearestObligation.date}.`,
    });
  }

  return alerts;
}
