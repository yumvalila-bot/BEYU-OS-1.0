/**
 * Family Office capital & wealth — cash flow (§16), the balance sheet (§17) and
 * liquidity (§19/§20).
 *
 * The load-bearing claims: contingent liabilities are DISCLOSED, never netted into
 * net worth; totals are per currency; and a liquidity alert is advisory only.
 */
import { describe, expect, it } from "vitest";
import {
  LIQUIDITY_HORIZONS_DAYS,
  buildFamilyBalanceSheet,
  consolidateCashFlow,
  projectLiquidity,
  raiseLiquidityAlerts,
  type BalanceSheetLine,
  type CashFlowItem,
  type ExpectedFlow,
} from "../../../../src/lib/family/office/capital-wealth";
import { D, ladder, threshold } from "./fixtures";

let n = 0;
function item(over: Partial<CashFlowItem> = {}): CashFlowItem {
  n += 1;
  return {
    id: `CF-${n}`,
    tenantId: "T-CAP-1",
    legalEntityId: "LE-1",
    countryCode: "NG",
    currency: "NGN",
    period: "2026-03",
    direction: "INFLOW",
    category: "RENTAL_INCOME",
    amountMinor: 1_000_000,
    basis: "POSTED",
    sourceRef: "FIN-1",
    recurring: true,
    sectorCode: null,
    ...over,
  };
}

function line(over: Partial<BalanceSheetLine> = {}): BalanceSheetLine {
  return {
    code: "L-1",
    label: "Test line",
    side: "ASSET",
    amountMinor: 100_000_000,
    currency: "NGN",
    legalEntityId: "LE-1",
    countryCode: "NG",
    assetClass: "COMMERCIAL_PROPERTY",
    liquidity: "ILLIQUID",
    productive: true,
    basis: "OBSERVED",
    sourceRef: "FIN-1",
    ...over,
  };
}

function flow(over: Partial<ExpectedFlow> = {}): ExpectedFlow {
  return {
    id: `F-${Math.random().toString(36).slice(2, 8)}`,
    date: "2026-04-15",
    direction: "INFLOW",
    amountMinor: 5_000_000,
    currency: "NGN",
    description: "Test inflow",
    certainty: "CONTRACTUAL",
    ...over,
  };
}

describe("§16 — cash-flow consolidation is per currency and states its definitions", () => {
  it("consolidates operating, free, recurring and discretionary cash flow", () => {
    const c = consolidateCashFlow(
      [
        item({ category: "RENTAL_INCOME", amountMinor: 12_000_000, recurring: true }),
        item({ direction: "OUTFLOW", category: "OPERATING_COST", amountMinor: 3_000_000, recurring: true }),
        item({ direction: "OUTFLOW", category: "CAPEX", amountMinor: 2_000_000, recurring: false }),
        item({ direction: "OUTFLOW", category: "DEBT_SERVICE", amountMinor: 8_000_000, recurring: true }),
        item({ category: "CAPITAL_GAINS", amountMinor: 4_000_000, recurring: false }),
      ],
      D.asOf,
    );
    const ngn = c.byCurrency[0]!;
    /** Operating: 12,000,000 in less 3,000,000 operating cost. Capex is excluded. */
    expect(ngn.operatingCashFlowMinor).toBe(9_000_000);
    /** Free: operating less capex. */
    expect(ngn.freeCashFlowMinor).toBe(7_000_000);
    /** Debt coverage: 9,000,000 / 8,000,000 = 1.125×. */
    expect(c.debtCoverageBps).toBe(11_250);
    /** Discretionary picks up the capital gain. */
    expect(ngn.discretionaryCashFlowMinor).toBe(4_000_000);
  });

  it("separates currencies rather than adding them", () => {
    const c = consolidateCashFlow([item({ currency: "NGN" }), item({ currency: "USD" })], D.asOf);
    expect(c.byCurrency).toHaveLength(2);
    expect(c.byCurrency.map((x) => x.currency).sort()).toEqual(["NGN", "USD"]);
  });

  it("reports recurring coverage against recurring obligations", () => {
    const c = consolidateCashFlow(
      [
        item({ category: "RENTAL_INCOME", amountMinor: 12_000_000, recurring: true }),
        item({ direction: "OUTFLOW", category: "OPERATING_COST", amountMinor: 3_000_000, recurring: true }),
        item({ direction: "OUTFLOW", category: "DEBT_SERVICE", amountMinor: 8_000_000, recurring: true }),
      ],
      D.asOf,
    );
    /** Recurring obligations are debt service plus recurring operating cost. */
    expect(c.recurringObligationsMinor).toBe(11_000_000);
    expect(c.recurringCashFlowCoverageBps).not.toBeNull();
  });

  it("names items carrying a projection basis so fact and forecast are never conflated", () => {
    /**
     * A total that silently mixes posted figures with forecasts is worse than
     * either on its own, because the reader cannot tell which is which.
     */
    const c = consolidateCashFlow(
      [item({ basis: "POSTED" }), item({ basis: "FORECAST", sourceRef: "MODEL-1" })],
      D.asOf,
    );
    expect(c.forecastItemCount).toBe(1);
    expect(c.forecastItemIds).toHaveLength(1);
  });

  it("excludes an item in the wrong direction for its category, and names it", () => {
    const c = consolidateCashFlow([item({ direction: "OUTFLOW", category: "RENTAL_INCOME" })], D.asOf);
    expect(c.excluded).toHaveLength(1);
    expect(c.excluded[0]?.reason).toMatch(/not a known outflow category/);
  });

  it("reports the cross-sector breakdown", () => {
    const c = consolidateCashFlow(
      [item({ sectorCode: "AGRICULTURE" }), item({ sectorCode: "HEALTH" })],
      D.asOf,
    );
    expect(c.bySector.map((s) => s.sectorCode).sort()).toEqual(["AGRICULTURE", "HEALTH"]);
  });
});

describe("§17 — contingent liabilities are disclosed, never netted into net worth", () => {
  it("net worth ignores contingent liabilities entirely", () => {
    const withContingent = buildFamilyBalanceSheet({
      lines: [line(), line({ code: "L-2", side: "LIABILITY", amountMinor: 40_000_000 })],
      contingents: [
        { code: "G-1", label: "Guarantee given", amountMinor: 25_000_000, currency: "NGN", trigger: "Borrower default", likelihood: "POSSIBLE", sourceRef: "DOC-1" },
      ],
      asOf: D.asOf,
      capitalCommitments: [],
    });
    const without = buildFamilyBalanceSheet({
      lines: [line(), line({ code: "L-2", side: "LIABILITY", amountMinor: 40_000_000 })],
      contingents: [],
      asOf: D.asOf,
      capitalCommitments: [],
    });

    /** 100,000,000 − 40,000,000 = 60,000,000 either way. */
    expect(withContingent.byCurrency[0]!.netWorthMinor).toBe(60_000_000);
    expect(withContingent.byCurrency[0]!.netWorthMinor).toBe(without.byCurrency[0]!.netWorthMinor);
    /** But the exposure is still disclosed. */
    expect(withContingent.contingentDisclosure).toHaveLength(1);
    expect(withContingent.byCurrency[0]!.contingentLiabilitiesMinor).toBe(25_000_000);
  });

  it("splits assets by liquidity and computes investable capital", () => {
    const bs = buildFamilyBalanceSheet({
      lines: [
        line({ code: "L-LIQ", liquidity: "LIQUID", amountMinor: 20_000_000, productive: false }),
        line({ code: "L-NEAR", liquidity: "NEAR_LIQUID", amountMinor: 30_000_000, productive: false }),
        line({ code: "L-ILLIQ", liquidity: "ILLIQUID", amountMinor: 50_000_000, productive: true }),
      ],
      contingents: [],
      asOf: D.asOf,
      capitalCommitments: [{ currency: "NGN", amountMinor: 10_000_000 }],
    });
    const c = bs.byCurrency[0]!;
    expect(c.liquidAssetsMinor).toBe(20_000_000);
    expect(c.nearLiquidAssetsMinor).toBe(30_000_000);
    expect(c.illiquidAssetsMinor).toBe(50_000_000);
    /** Investable = liquid + near-liquid less commitments already made. */
    expect(c.investableCapitalMinor).toBe(40_000_000);
    expect(c.capitalCommitmentsMinor).toBe(10_000_000);
  });

  it("computes the productive capital ratio", () => {
    const bs = buildFamilyBalanceSheet({
      lines: [
        line({ code: "P", productive: true, amountMinor: 60_000_000 }),
        line({ code: "N", productive: false, amountMinor: 40_000_000 }),
      ],
      contingents: [],
      asOf: D.asOf,
      capitalCommitments: [],
    });
    /** 60,000,000 productive of 100,000,000 = 60%. */
    expect(bs.byCurrency[0]!.productiveCapitalRatioBps).toBe(6_000);
  });

  it("provides the by-entity, by-country and by-asset-class views", () => {
    const bs = buildFamilyBalanceSheet({
      lines: [
        line({ code: "A", legalEntityId: "LE-1", countryCode: "NG", assetClass: "COMMERCIAL_PROPERTY" }),
        line({ code: "B", legalEntityId: "LE-2", countryCode: "KE", assetClass: "EQUITY_PRIVATE" }),
      ],
      contingents: [],
      asOf: D.asOf,
      capitalCommitments: [],
    });
    expect(bs.byEntity).toHaveLength(2);
    expect(bs.byCountry).toHaveLength(2);
    expect(bs.byAssetClass).toHaveLength(2);
  });

  it("excludes a non-integer line and names it, rather than rounding it silently", () => {
    const bs = buildFamilyBalanceSheet({
      lines: [line({ code: "BAD", amountMinor: 1_000.5 })],
      contingents: [],
      asOf: D.asOf,
      capitalCommitments: [],
    });
    expect(bs.byCurrency).toHaveLength(0);
    expect(bs.excluded).toHaveLength(1);
    expect(bs.excluded[0]?.reason).toMatch(/integer/);
  });

  it("never totals across currencies", () => {
    const bs = buildFamilyBalanceSheet({
      lines: [line({ code: "NGN", currency: "NGN" }), line({ code: "USD", currency: "USD" })],
      contingents: [],
      asOf: D.asOf,
      capitalCommitments: [],
    });
    expect(bs.byCurrency).toHaveLength(2);
    expect(bs).not.toHaveProperty("totalNetWorthMinor");
  });
});

describe("§19/§20 — liquidity projection and its alerts", () => {
  it("projects the 30/90/180/365-day ladder", () => {
    expect(LIQUIDITY_HORIZONS_DAYS).toEqual([30, 90, 180, 365]);
    const p = projectLiquidity({
      asOf: D.asOf,
      currency: "NGN",
      liquidMinor: 50_000_000,
      nearLiquidMinor: 20_000_000,
      illiquidMinor: 100_000_000,
      flows: [flow({ direction: "OUTFLOW", amountMinor: 60_000_000, date: "2026-05-15" })],
    });
    expect(p.horizons.map((h) => h.horizonDays)).toEqual([30, 90, 180, 365]);
    /** The 60,000,000 outflow lands inside the 90-day horizon. */
    const h90 = p.horizons.find((h) => h.horizonDays === 90)!;
    expect(h90.closingMinor).toBe(-10_000_000);
    expect(h90.breachesZero).toBe(true);
  });

  it("ignores flows in another currency rather than netting them", () => {
    const p = projectLiquidity({
      asOf: D.asOf,
      currency: "NGN",
      liquidMinor: 10_000_000,
      nearLiquidMinor: 0,
      illiquidMinor: 0,
      flows: [flow({ currency: "USD", amountMinor: 99_000_000, direction: "OUTFLOW" })],
    });
    /** A USD outflow cannot drain an NGN balance. */
    expect(p.horizons.every((h) => !h.breachesZero)).toBe(true);
  });

  it("raises an alert when a horizon breaches zero even with no ladder supplied", () => {
    const p = projectLiquidity({
      asOf: D.asOf,
      currency: "NGN",
      liquidMinor: 10_000_000,
      nearLiquidMinor: 0,
      illiquidMinor: 0,
      flows: [flow({ direction: "OUTFLOW", amountMinor: 20_000_000 })],
    });
    const alerts = raiseLiquidityAlerts(p, null);
    expect(alerts.length).toBeGreaterThan(0);
    /**
     * Running out of cash is a fact about the projection, not a policy judgement,
     * so it is raised without a threshold. Everything else needs one.
     */
    expect(alerts.some((a) => a.horizonDays !== null)).toBe(true);
  });

  it("every alert is advisory only — it never freezes, transfers or approves", () => {
    const p = projectLiquidity({
      asOf: D.asOf,
      currency: "NGN",
      liquidMinor: 10_000_000,
      nearLiquidMinor: 0,
      illiquidMinor: 0,
      flows: [flow({ direction: "OUTFLOW", amountMinor: 20_000_000 })],
    });
    for (const a of raiseLiquidityAlerts(p, ladder({ measureCode: "LIQUIDITY_COVERAGE" }))) {
      expect(a.advisoryOnly).toBe(true);
    }
  });

  it("a healthy projection raises no negative-band alert, but still reports coverage as unratified", () => {
    const p = projectLiquidity({
      asOf: D.asOf,
      currency: "NGN",
      liquidMinor: 100_000_000,
      nearLiquidMinor: 0,
      illiquidMinor: 0,
      flows: [],
    });
    const alerts = raiseLiquidityAlerts(p, null);
    /** No horizon breaches zero, so nothing is RED. */
    expect(alerts.filter((a) => a.band !== null)).toHaveLength(0);
    /**
     * But the list is never empty. With no ladder the coverage alert says the limit
     * is unratified rather than asserting GREEN — silence would read as safety, and
     * an unset limit is not a pass.
     */
    expect(alerts.some((a) => a.code === "LIQUIDITY_COVERAGE_UNAVAILABLE" || a.code === "LIQUIDITY_COVERAGE")).toBe(true);
    expect(alerts.every((a) => a.advisoryOnly)).toBe(true);
  });

  it("grades coverage against a supplied ladder in both directions", () => {
    const coverageLadder = (floor: number) =>
      ladder({
        measureCode: "LIQUIDITY_COVERAGE",
        rungs: [{ band: "RED", threshold: threshold({ code: "COV_FLOOR", value: floor, direction: "MIN" }) }],
      });

    /** 10,000,000 liquid against 9,500,000 due inside 90 days = 105% coverage. */
    const tight = projectLiquidity({
      asOf: D.asOf,
      currency: "NGN",
      liquidMinor: 10_000_000,
      nearLiquidMinor: 0,
      illiquidMinor: 0,
      flows: [flow({ direction: "OUTFLOW", amountMinor: 9_500_000 })],
    });
    /** A floor of 120% is breached at 105% coverage. */
    const breached = raiseLiquidityAlerts(tight, coverageLadder(12_000));
    expect(breached.some((a) => a.band === "RED")).toBe(true);

    /** The same position against a 100% floor holds. */
    const held = raiseLiquidityAlerts(tight, coverageLadder(10_000));
    expect(held.some((a) => a.band === "RED")).toBe(false);
    expect(held.some((a) => a.code === "LIQUIDITY_COVERAGE" && a.band === "GREEN")).toBe(true);
  });
});
