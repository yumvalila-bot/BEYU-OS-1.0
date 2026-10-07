/**
 * BEYU OS — Shared Pricing, Margin & Profitability engine.
 *
 * The distinction this suite exists to protect:
 *
 *     MARKUP = (price − cost) / cost          MARGIN = (price − cost) / price
 *     100 cost, 125 price  ⇒  25% markup      20% margin
 *
 * The two are branded types in the engine, so the compiler refuses to swap them; these tests pin the
 * arithmetic, the undefined-at-zero behaviour, the exactness of cost allocation and the refusal of an
 * unapproved allocation rule set.
 */
import { describe, expect, it } from "vitest";
import {
  allocateIndirect,
  asMarginRate,
  asMarkupRate,
  buildProfitabilityLadder,
  contributionAndBreakEven,
  costPlusPrice,
  discountImpact,
  marginRate,
  marginToMarkup,
  markupRate,
  markupToMargin,
  rollUpProfitability,
  targetMarginPrice,
} from "@/lib/pricing/costing";

describe("markup and margin are different numbers", () => {
  it("turns 100 cost / 125 price into 25% markup and 20% margin", () => {
    expect(markupRate(100, 25)).toBe(2500);
    expect(marginRate(125, 25)).toBe(2000);
  });

  it("converts between the two with the exact identities", () => {
    expect(markupToMargin(asMarkupRate(2500))).toBe(2000);
    expect(marginToMarkup(asMarginRate(2000))).toBe(2500);
    // Round trip is stable across a range of rates.
    for (const bps of [500, 1000, 3333, 5000, 9000]) {
      expect(markupToMargin(marginToMarkup(asMarginRate(bps)))).toBe(bps);
    }
  });

  it("returns NULL — not zero — when the denominator is zero", () => {
    expect(markupRate(0, 25)).toBeNull();
    expect(marginRate(0, 25)).toBeNull();
  });

  it("keeps negative profit honest (a loss is a negative rate, not an absent one)", () => {
    expect(markupRate(100, -20)).toBe(-2000);
    expect(marginRate(100, -20)).toBe(-2000);
  });

  it("prices cost-plus from a markup and target-margin from a margin", () => {
    expect(costPlusPrice({ costMinor: 100, markup: asMarkupRate(2500) })).toBe(125);
    expect(targetMarginPrice({ costMinor: 100, margin: asMarginRate(2000) })).toBe(125);
  });

  it("REFUSES a target margin at or above 100%", () => {
    expect(() => targetMarginPrice({ costMinor: 100, margin: asMarginRate(10_000) })).toThrow(/margin/i);
    expect(() => targetMarginPrice({ costMinor: 100, margin: asMarginRate(12_000) })).toThrow(/margin/i);
  });
});

describe("discount impact", () => {
  it("reports margin erosion and profit retention, not just a lower price", () => {
    const impact = discountImpact({
      unitCostMinor: 100,
      listPriceMinor: 125,
      discountBps: 1000, // 10% discount, one unit
      quantity: 1,
    });
    expect(impact.discountedPriceMinor).toBe(Math.round((125 * 9000) / 10000));
    expect(impact.listMarginBps).toBe(2000);
    expect(impact.discountedMarginBps).not.toBeNull();
    expect(impact.discountedMarginBps as number).toBeLessThan(2000);
    expect(impact.marginErosionBps).toBe((impact.listMarginBps as number) - (impact.discountedMarginBps as number));
    // 25 profit becomes 13: the retention is reported, not just the lower price.
    expect(impact.profitRetentionBps).toBe(Math.round((13 * 10_000) / 25));
  });

  it("shows a discount that wipes out the entire profit", () => {
    const impact = discountImpact({ unitCostMinor: 100, listPriceMinor: 125, discountBps: 2000, quantity: 1 });
    expect(impact.discountedPriceMinor).toBe(100);
    expect(impact.discountedMarginBps).toBe(0);
    expect(impact.profitRetentionBps).toBe(0);
  });
});

describe("contribution and break-even", () => {
  it("computes finite break-even units when contribution is positive", () => {
    const result = contributionAndBreakEven({
      unitPriceMinor: 125,
      unitVariableCostMinor: 100,
      fixedCostMinor: 2_500,
    });
    expect(result.contributionMinor).toBe(25);
    expect(result.finite).toBe(true);
    expect(result.breakEvenUnits).toBe(100);
  });

  it("returns no break-even and a reason when contribution is zero or negative", () => {
    const zero = contributionAndBreakEven({ unitPriceMinor: 100, unitVariableCostMinor: 100, fixedCostMinor: 1_000 });
    expect(zero.contributionMinor).toBe(0);
    expect(zero.breakEvenUnits).toBeNull();
    expect(zero.finite).toBe(false);
    expect((zero.reason ?? "").length).toBeGreaterThan(8);

    const negative = contributionAndBreakEven({ unitPriceMinor: 90, unitVariableCostMinor: 100, fixedCostMinor: 1_000 });
    expect(negative.finite).toBe(false);
    expect(negative.breakEvenUnits).toBeNull();
  });
});

describe("indirect cost allocation is exact", () => {
  const ruleSet = {
    id: "ALLOC_TEST",
    version: 1,
    name: "Revenue-weighted overhead allocation",
    method: "DRIVER_WEIGHTED" as const,
    driver: "REVENUE",
    approved: true,
    approvalRef: "APR-1",
  };

  it("distributes the whole pool with no rounding loss", () => {
    const result = allocateIndirect({
      poolMinor: 1_000,
      units: [
        { unitType: "COMPANY", unitId: "A", weight: 1 },
        { unitType: "COMPANY", unitId: "B", weight: 1 },
        { unitType: "COMPANY", unitId: "C", weight: 1 },
      ],
      ruleSet,
    });
    const total = result.lines.reduce((sum, line) => sum + line.allocatedMinor, 0);
    expect(total).toBe(1_000);
    expect(result.allocatedMinor).toBe(1_000);
    expect(result.roundingRemainderMinor).toBe(1); // 1000 − 3×333, distributed by largest remainder
    expect(result.remainderPolicy).toMatch(/largest remainder/i);
    // 1000/3 → 333.33: the two largest remainders each take one extra minor unit.
    expect(result.lines.map((l) => l.allocatedMinor)).toEqual([334, 333, 333]);
  });

  it("is deterministic when shares tie — the tie breaks by unit id", () => {
    const first = allocateIndirect({ poolMinor: 1_001, units: [
      { unitType: "COMPANY", unitId: "B", weight: 1 },
      { unitType: "COMPANY", unitId: "A", weight: 1 },
    ], ruleSet });
    const second = allocateIndirect({ poolMinor: 1_001, units: [
      { unitType: "COMPANY", unitId: "A", weight: 1 },
      { unitType: "COMPANY", unitId: "B", weight: 1 },
    ], ruleSet });
    const byId = (r: typeof first) => Object.fromEntries(r.lines.map((l) => [l.unitId, l.allocatedMinor]));
    expect(byId(first)).toEqual(byId(second));
  });

  it("REFUSES an allocation under an unapproved rule set", () => {
    expect(() =>
      allocateIndirect({
        poolMinor: 1_000,
        units: [{ unitType: "COMPANY", unitId: "A", weight: 1 }],
        ruleSet: { ...ruleSet, approved: false, approvalRef: null },
      }),
    ).toThrow(/approv/i);
  });

  it("REFUSES an allocation with a zero driver total", () => {
    expect(() =>
      allocateIndirect({
        poolMinor: 1_000,
        units: [
          { unitType: "COMPANY", unitId: "A", weight: 0 },
          { unitType: "COMPANY", unitId: "B", weight: 0 },
        ],
        ruleSet,
      }),
    ).toThrow(/driver|weight|positive/i);
  });
});

describe("the §12 profitability ladder", () => {
  it("keeps direct cost, allocated indirect cost and operating expense in separate rungs", () => {
    const ladder = buildProfitabilityLadder({
      unitType: "COMPANY",
      unitId: "AGRICULTURE_OS",
      currency: "KES",
      period: "FY2025",
      revenueMinor: 1_000_000,
      directCostMinor: 600_000,
      allocatedIndirectMinor: 150_000,
      operatingExpenseMinor: 100_000,
      netExpenseMinor: 20_000,
      allocationRuleSet: { id: "ALLOC_TEST", version: 3 },
    });
    expect(ladder.grossProfitMinor).toBe(400_000);
    expect(ladder.contributionAfterAllocationMinor).toBe(250_000);
    expect(ladder.operatingProfitMinor).toBe(150_000);
    expect(ladder.netProfitMinor).toBe(130_000);
    expect(ladder.grossMarginBps).toBe(4000);
    expect(ladder.operatingMarginBps).toBe(1500);
    expect(ladder.netMarginBps).toBe(1300);
    expect(ladder.allocationRuleSet).toEqual({ id: "ALLOC_TEST", version: 3 });
    expect(ladder.unapprovedAllocation).toBe(false);
    // Markup on the TOTAL cost base actually incurred, measured on net profit: 130,000 / 850,000.
    expect(ladder.markupOnTotalCostBps).toBe(Math.round((130_000 * 10_000) / 850_000));
  });

  it("returns null margins on zero revenue rather than zero percent", () => {
    const ladder = buildProfitabilityLadder({
      unitType: "COMPANY",
      unitId: "IDLE_UNIT",
      currency: "KES",
      period: "FY2025",
      revenueMinor: 0,
      directCostMinor: 0,
    });
    expect(ladder.grossMarginBps).toBeNull();
    expect(ladder.operatingMarginBps).toBeNull();
  });

  it("REFUSES negative revenue", () => {
    expect(() =>
      buildProfitabilityLadder({
        unitType: "COMPANY",
        unitId: "BAD",
        currency: "KES",
        period: "FY2025",
        revenueMinor: -1,
        directCostMinor: 0,
      }),
    ).toThrow(/revenue/i);
  });

  it("sums components when rolling up and flags loss-making units and concentration", () => {
    const units = [
      { unitType: "COMPANY" as const, unitId: "A", currency: "KES", period: "FY2025", revenueMinor: 900_000, directCostMinor: 500_000, operatingExpenseMinor: 100_000 },
      { unitType: "COMPANY" as const, unitId: "B", currency: "KES", period: "FY2025", revenueMinor: 100_000, directCostMinor: 90_000, operatingExpenseMinor: 50_000 },
    ].map((u) => buildProfitabilityLadder(u));
    const rollup = rollUpProfitability({ unitType: "COMPANY", currency: "KES", period: "FY2025", ladders: units });
    if (!rollup) throw new Error("expected a rollup for two units");
    expect(rollup.units).toBe(2);
    expect(rollup.revenueMinor).toBe(1_000_000);
    expect(rollup.operatingProfitMinor).toBe(units[0].operatingProfitMinor + units[1].operatingProfitMinor);
    // Never the average of the two margins.
    expect(rollup.operatingMarginBps).toBe(Math.round((rollup.operatingProfitMinor * 10_000) / rollup.revenueMinor));
    expect(rollup.lossMakingUnits.map((u) => u.unitId)).toEqual(["B"]);
    expect(rollup.largestUnitRevenueShareScaled).not.toBeNull();
  });
});
