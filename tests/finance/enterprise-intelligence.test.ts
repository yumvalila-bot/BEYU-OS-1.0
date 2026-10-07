/**
 * BEYU OS — Finance Intelligence: metric engines and the DCF valuation engine.
 *
 * These tests exist to pin down the REFUSALS, not only the arithmetic. A metric engine that returns a
 * plausible number for a zero denominator, a negative EPS or a missing debt figure is more dangerous
 * than one that returns nothing, because the wrong number is consumed silently.
 *
 * Every assertion below is deterministic: no clock, no database, no randomness. Amounts are integer
 * minor units; rates are basis points; multiples are fixed-point scaled by 10^6.
 */
import { describe, expect, it } from "vitest";
import type { MetricOutcome, MetricSeedBase } from "@/lib/finance/intelligence/provenance";
import { valueOrNull } from "@/lib/finance/intelligence/provenance";
import {
  enterpriseValue,
  evToEbitda,
  marketCapitalization,
  netDebt,
  netDebtToEbitda,
  operatingMargin,
  pegRatio,
  priceEarnings,
  revenueGrowth,
  roic,
} from "@/lib/finance/intelligence/metrics";
import {
  assumptionFingerprint,
  axisRange,
  discountedCashFlow,
  type DcfInputs,
  type ValuationAssumptionSet,
} from "@/lib/finance/intelligence/valuation";

let counter = 0;
function seed(nextIdSuffix = "T"): MetricSeedBase {
  return {
    subject: { subjectType: "SECURITY", subjectId: `SEC_${nextIdSuffix}` },
    dataTimestamp: "2026-01-01T00:00:00.000Z",
    nextId: () => `MET-${nextIdSuffix}-${++counter}`,
  };
}

const money = (amountMinor: number | null, extra: Partial<{ currency: string; period: string; source: string }> = {}) => ({
  amountMinor,
  source: extra.source ?? "test-fixture",
  currency: extra.currency ?? "USD",
  period: extra.period ?? "FY2025",
});

const perShare = (amountMinorPerShare: number | null, currency = "USD") => ({
  amountMinorPerShare,
  source: "test-fixture",
  currency,
  period: "FY2025",
});

function expectAbsent(outcome: MetricOutcome<unknown>): string {
  expect(outcome.kind).toBe("ABSENT");
  if (outcome.kind !== "ABSENT") throw new Error("unreachable");
  expect(outcome.reason.length).toBeGreaterThan(8);
  // An absent metric still carries full provenance: a refusal is a result, not an error path.
  expect(outcome.provenance.calculationVersion.length).toBeGreaterThan(0);
  expect(outcome.provenance.metricCode.length).toBeGreaterThan(0);
  return outcome.reason;
}

describe("market capitalisation", () => {
  it("is exactly price × shares for integer minor units — no rounding", () => {
    const outcome = marketCapitalization({
      seed: seed("MC"),
      sharePrice: perShare(1250),
      sharesOutstanding: { shares: 4_000_000, source: "test-fixture" },
    });
    expect(outcome.kind).toBe("VALUE");
    expect(valueOrNull(outcome)).toBe(4_000_000 * 1250);
    if (outcome.kind === "VALUE") expect(outcome.state).toBe("CALCULATED");
  });

  it("reports MISSING, never zero, when the share count is absent", () => {
    const outcome = marketCapitalization({
      seed: seed("MC2"),
      sharePrice: perShare(1250),
      sharesOutstanding: { shares: null, source: "not supplied" },
    });
    expect(expectAbsent(outcome)).toMatch(/share count|shares/i);
  });

  it("refuses a currency mismatch between price and reporting currency", () => {
    const outcome = marketCapitalization({
      seed: seed("MC3"),
      sharePrice: perShare(1250, "KES"),
      sharesOutstanding: { shares: 1_000, source: "test-fixture" },
      currency: "USD",
    });
    expect(expectAbsent(outcome)).toMatch(/currency/i);
  });
});

describe("price/earnings", () => {
  it("computes a trailing multiple in fixed point", () => {
    const outcome = priceEarnings({ seed: seed("PE"), sharePrice: perShare(2500), earningsPerShare: perShare(250) });
    expect(outcome.kind).toBe("VALUE");
    expect(valueOrNull(outcome)).toBe(10_000_000); // 10.0× scaled by 10^6
  });

  it("returns NOT AVAILABLE for zero EPS rather than infinity", () => {
    const reason = expectAbsent(priceEarnings({ seed: seed("PE0"), sharePrice: perShare(2500), earningsPerShare: perShare(0) }));
    expect(reason).toMatch(/zero/i);
  });

  it("returns NOT AVAILABLE for negative EPS rather than a negative multiple", () => {
    const reason = expectAbsent(priceEarnings({ seed: seed("PEN"), sharePrice: perShare(2500), earningsPerShare: perShare(-250) }));
    expect(reason).toMatch(/negative/i);
  });

  it("does not fabricate an EPS that was never supplied", () => {
    expectAbsent(priceEarnings({ seed: seed("PEM"), sharePrice: perShare(2500), earningsPerShare: perShare(null) }));
  });
});

describe("PEG ratio", () => {
  it("requires an explicit growth convention and divides as that convention states", () => {
    const base = {
      seed: seed("PEG"),
      sharePrice: perShare(2000),
      earningsPerShare: perShare(100),
      growth: { bps: 2000, source: "analyst-consensus", period: "NEXT_5Y" },
      growthPeriod: "NEXT_5Y",
    };
    const percentPoints = pegRatio({ ...base, growthConvention: "PERCENT_POINTS" });
    const decimalFraction = pegRatio({ ...base, growthConvention: "DECIMAL_FRACTION" });
    expect(percentPoints.kind).toBe("VALUE");
    expect(decimalFraction.kind).toBe("VALUE");
    // 20% growth: /20 under PERCENT_POINTS, /0.20 under DECIMAL_FRACTION — one hundred times larger.
    const a = valueOrNull(percentPoints) as number;
    const b = valueOrNull(decimalFraction) as number;
    expect(b).toBeGreaterThan(a * 90);
    if (percentPoints.kind === "VALUE") {
      expect(percentPoints.provenance.inputs.some((i) => i.name === "growthConvention" && i.value === "PERCENT_POINTS")).toBe(true);
    }
  });

  it("refuses to guess when the growth rate is missing", () => {
    expectAbsent(
      pegRatio({
        seed: seed("PEGM"),
        sharePrice: perShare(2000),
        earningsPerShare: perShare(100),
        growth: { bps: null, source: "not supplied" },
        growthConvention: "PERCENT_POINTS",
        growthPeriod: "NEXT_5Y",
      }),
    );
  });
});

describe("enterprise value and leverage", () => {
  it("uses EV = Market Cap + Total Debt + Preferred + Minority Interest − Cash", () => {
    const outcome = enterpriseValue({
      seed: seed("EV"),
      values: {
        marketCapitalization: money(1_000_000),
        totalDebt: money(400_000),
        preferredEquity: money(50_000),
        minorityInterest: money(25_000),
        cashAndEquivalents: money(100_000),
      },
      currency: "USD",
    });
    expect(valueOrNull(outcome)).toBe(1_000_000 + 400_000 + 50_000 + 25_000 - 100_000);
  });

  it("treats a missing debt figure as MISSING, never as zero debt", () => {
    const reason = expectAbsent(
      enterpriseValue({
        seed: seed("EVM"),
        values: {
          marketCapitalization: money(1_000_000),
          totalDebt: money(null),
          cashAndEquivalents: money(100_000),
        },
        currency: "USD",
      }),
    );
    expect(reason).toMatch(/totalDebt|debt/i);
  });

  it("reports negative net debt as the negative figure it is", () => {
    const outcome = netDebt({
      seed: seed("ND"),
      totalDebt: money(100_000),
      cashAndEquivalents: money(300_000),
      currency: "USD",
    });
    expect(valueOrNull(outcome)).toBe(-200_000);
  });

  it("refuses a leverage multiple against negative net debt instead of printing a negative ratio", () => {
    const outcome = netDebtToEbitda({
      seed: seed("NDE"),
      totalDebt: money(100_000),
      cashAndEquivalents: money(300_000),
      ebitda: money(50_000),
      currency: "USD",
    });
    expect(outcome.kind).toBe("ABSENT");
    if (outcome.kind === "ABSENT") expect(outcome.state).toBe("NOT_APPLICABLE");
  });

  it("refuses EV/EBITDA on non-positive EBITDA", () => {
    const outcome = evToEbitda({
      seed: seed("EE"),
      values: { marketCapitalization: money(2_000_000), totalDebt: money(0), cashAndEquivalents: money(0) },
      ebitda: money(-50_000),
      currency: "USD",
    });
    expectAbsent(outcome);
  });
});

describe("margins and growth", () => {
  it("refuses an operating margin on zero revenue", () => {
    expectAbsent(
      operatingMargin({
        seed: seed("OM"),
        revenue: money(0),
        operatingIncome: money(10_000),
        currency: "USD",
      }),
    );
  });

  it("refuses percentage growth from a zero base and says so", () => {
    const reason = expectAbsent(
      revenueGrowth({
        seed: seed("RG"),
        current: money(5_000_000),
        prior: money(0),
        comparison: "YOY",
        currency: "USD",
      }),
    );
    expect(reason).toMatch(/zero/i);
  });

  it("computes growth in basis points on a positive base", () => {
    const outcome = revenueGrowth({
      seed: seed("RG2"),
      current: money(125_000),
      prior: money(100_000),
      comparison: "YOY",
      currency: "USD",
    });
    // Growth is returned as basis points in the engine's fixed-point convention (10^6 per bp).
    expect(valueOrNull(outcome)).toBe(2500 * 1_000_000); // 25.00%
  });
});

describe("ROIC", () => {
  const treatment = {
    effectiveTaxRateBps: 2500,
    goodwillExcludedFromInvestedCapital: false,
    operatingLeasesCapitalised: true,
  };

  it("documents the capital basis and the treatment in its provenance", () => {
    const outcome = roic({
      seed: seed("ROIC"),
      basis: "DEBT_PLUS_EQUITY",
      operatingIncome: money(100_000),
      totalDebt: money(200_000),
      totalEquity: money(300_000),
      treatment,
      currency: "USD",
    });
    expect(outcome.kind).toBe("VALUE");
    if (outcome.kind === "VALUE") {
      const names = outcome.provenance.inputs.map((i) => i.name);
      expect(names).toContain("goodwillExcludedFromInvestedCapital");
      expect(names).toContain("operatingLeasesCapitalised");
      expect(names).toContain("effectiveTaxRateBps");
    }
  });

  it("refuses to compute ROIC on non-positive invested capital", () => {
    expectAbsent(
      roic({
        seed: seed("ROIC0"),
        basis: "DEBT_PLUS_EQUITY",
        operatingIncome: money(100_000),
        totalDebt: money(100_000),
        totalEquity: money(-100_000), // invested capital of exactly zero
        treatment,
        currency: "USD",
      }),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Valuation                                                           */
/* ------------------------------------------------------------------ */

const assumptions: ValuationAssumptionSet = {
  modelId: "VAL_TEST_1",
  version: 1,
  authoredBy: "principal:test",
  authoredAt: "2026-01-01T00:00:00.000Z",
  scenarioKind: "BASE",
  assumptions: [
    { key: "wacc", value: "800", unit: "BASIS_POINTS", kind: "ASSUMPTION", source: "test-fixture" },
    { key: "terminalGrowth", value: "250", unit: "BASIS_POINTS", kind: "ASSUMPTION", source: "test-fixture" },
  ],
};

const dcfInputs: DcfInputs = {
  baseRevenueMinor: 1_000_000_000,
  revenueGrowthBps: [1000, 800, 600, 500, 400],
  ebitdaMarginBps: [2000, 2100, 2200, 2300, 2400],
  depreciationAmortisationBps: 300,
  capexBps: 400,
  workingCapitalBps: 100,
  effectiveTaxRateBps: 2500,
  waccBps: 800,
  terminalMethod: "GORDON_GROWTH",
  terminalGrowthBps: 250,
  netDebtMinor: 500_000_000,
  sharesOutstanding: 1_000_000,
};

describe("DCF valuation engine", () => {
  it("produces a discounted cash flow, a terminal value and an equity bridge", () => {
    const outcome = discountedCashFlow({ seed: seed("DCF"), assumptions, inputs: dcfInputs, currency: "USD" });
    expect(outcome.kind).toBe("VALUE");
    if (outcome.kind !== "VALUE") return;
    const result = outcome.value;
    expect(result.years).toHaveLength(5);
    expect(result.terminalValueMinor).toBeGreaterThan(0);
    expect(result.enterpriseValueMinor).toBeGreaterThan(result.netDebtUsedMinor);
    expect(result.equityValueMinor).toBe(result.enterpriseValueMinor - result.netDebtUsedMinor);
    expect(result.impliedSharePriceMinorPerShare).toBe(Math.round(
      result.equityValueMinor / dcfInputs.sharesOutstanding,
    ));
    expect(result.fingerprint).toBe(assumptionFingerprint(assumptions));
    expect(outcome.provenance.calculationVersion).toMatch(/1\.0\.0$/);
  });

  it("REFUSES a terminal growth rate at or above the discount rate", () => {
    const reason = expectAbsent(
      discountedCashFlow({
        seed: seed("DCF2"),
        assumptions,
        inputs: { ...dcfInputs, waccBps: 300, terminalGrowthBps: 500 },
        currency: "USD",
      }),
    );
    expect(reason).toMatch(/WACC|discount/i);
  });

  it("REFUSES a missing exit multiple when the terminal method needs one", () => {
    expect(() =>
      discountedCashFlow({
        seed: seed("DCF3"),
        assumptions,
        inputs: { ...dcfInputs, terminalMethod: "EXIT_MULTIPLE", terminalGrowthBps: null, exitEvEbitdaScaled: null },
        currency: "USD",
      }),
    ).toThrow(/exit EV\/EBITDA multiple/i);
  });

  it("REFUSES mismatched forecast vectors instead of silently truncating", () => {
    expect(() =>
      discountedCashFlow({
        seed: seed("DCF4"),
        assumptions,
        inputs: { ...dcfInputs, ebitdaMarginBps: [2000, 2100, 2200] },
        currency: "USD",
      }),
    ).toThrow(/one EBITDA margin per forecast year/i);
  });

  it("fingerprints the assumption set deterministically and detects a changed assumption", () => {
    const reordered: ValuationAssumptionSet = { ...assumptions, assumptions: [...assumptions.assumptions].reverse() };
    const changed: ValuationAssumptionSet = {
      ...assumptions,
      assumptions: assumptions.assumptions.map((a) => (a.key === "wacc" ? { ...a, value: "850" } : a)),
    };
    expect(assumptionFingerprint(reordered)).toBe(assumptionFingerprint(assumptions));
    expect(assumptionFingerprint(changed)).not.toBe(assumptionFingerprint(assumptions));
    expect(assumptionFingerprint(assumptions)).toMatch(/^vf1_[0-9a-f]+$/);
  });

  it("builds inclusive sensitivity axes", () => {
    expect(axisRange(600, 1000, 3)).toEqual([600, 800, 1000]);
    expect(axisRange(100, 200, 2)).toEqual([100, 200]);
    expect(() => axisRange(100, 200, 1)).toThrow(/two steps/i);
  });
});
