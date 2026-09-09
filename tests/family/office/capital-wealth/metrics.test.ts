/**
 * Family Office capital & wealth — the metrics engine.
 *
 * Covers the requirement that money is never floating point, that every ratio
 * states its own missing inputs instead of defaulting to zero, that no threshold
 * exists without provenance, and that the red-line ladder grades by BREACH
 * semantics.
 */
import { describe, expect, it } from "vitest";
import {
  BPS_BASE,
  FamilyMetricsError,
  applyBpsSigned,
  assertBps,
  assertMinorUnits,
  assertThresholdProvenance,
  capRateBps,
  cashOnCashBps,
  cagrBps,
  dscrBps,
  debtToAssetBps,
  debtToEquityBps,
  discountFactorScaled,
  gradeRedLine,
  interestCoverageBps,
  irrBps,
  liquidityRunwayDays,
  ltvBps,
  netOperatingIncomeMinor,
  npvMinor,
  projectCapital,
  ratioBps,
  roiBps,
  worstBand,
} from "../../../../src/lib/family/office/capital-wealth";
import { D, ladder, threshold } from "./fixtures";

describe("money is integer minor units, never floating point", () => {
  it("refuses a non-integer amount", () => {
    expect(() => assertMinorUnits(1000.5, "amount")).toThrow(FamilyMetricsError);
    expect(() => assertMinorUnits(Number.NaN, "amount")).toThrow(FamilyMetricsError);
    expect(() => assertMinorUnits(Number.POSITIVE_INFINITY, "amount")).toThrow(FamilyMetricsError);
  });

  it("accepts an integer amount including zero", () => {
    expect(() => assertMinorUnits(0, "amount")).not.toThrow();
    expect(() => assertMinorUnits(1_000_000_000, "amount")).not.toThrow();
  });

  it("refuses a negative or fractional rate", () => {
    expect(() => assertBps(-1, "rate")).toThrow(FamilyMetricsError);
    expect(() => assertBps(1.5, "rate")).toThrow(FamilyMetricsError);
    expect(() => assertBps(500, "rate")).not.toThrow();
  });

  it("the 0…10000 ceiling lives in applyBasisPoints, not in assertBps", () => {
    /**
     * assertBps is a shape check; the ceiling is a domain rule about a single
     * application of a rate. Keeping them apart is what lets a legitimate growth
     * rate of 15000 bps pass assertBps while applyBasisPoints still refuses it.
     */
    expect(() => assertBps(15_000, "rate")).not.toThrow();
  });

  it("applyBpsSigned handles the signed and unbounded cases applyBasisPoints cannot", () => {
    expect(applyBpsSigned(1_000, -500)).toBe(-50);
    /** Above 10000 bps is a real growth rate, not an invalid one. */
    expect(applyBpsSigned(1_000, 15_000)).toBe(1_500);
    expect(applyBpsSigned(1_000, 0)).toBe(0);
  });
});

describe("ratios report their own missing inputs instead of guessing", () => {
  it("returns null on a zero denominator rather than Infinity or zero", () => {
    /**
     * A ratio with no denominator is undefined. Returning 0 would read as "the
     * measure is healthy"; returning Infinity would propagate into every
     * downstream band as an alarm. Neither is the truth, which is "not computable".
     */
    expect(ratioBps(1_000, 0)).toBeNull();
    expect(ratioBps(0, 0)).toBeNull();
  });

  it("computes an exact integer ratio in basis points", () => {
    /** 740000 / 5000000 = 0.148 = 1480 bps, exactly. */
    expect(ratioBps(740_000, 5_000_000)).toBe(1_480);
    expect(ltvBps(700_000, 1_000_000)).toBe(7_000);
    expect(dscrBps(740_000, 500_000)).toBe(14_800);
    expect(interestCoverageBps(900_000, 300_000)).toBe(30_000);
    expect(debtToEquityBps(600_000, 400_000)).toBe(15_000);
    expect(debtToAssetBps(600_000, 1_000_000)).toBe(6_000);
    expect(capRateBps(740_000, 1_000_000)).toBe(7_400);
    expect(cashOnCashBps(80_000, 400_000)).toBe(2_000);
    expect(roiBps(20_000, 100_000)).toBe(2_000);
  });
});

describe("discounting and IRR are exact integer arithmetic", () => {
  it("discount factors compose without drift", () => {
    /**
     * 10000 / (10000 + 1000) at 10^12 scale. The result is a BigInt, and it is
     * compared as a BigInt: converting to Number to compare would reintroduce the
     * floating point this whole layer exists to avoid.
     */
    expect(discountFactorScaled(1, 1_000)).toBe(BigInt("909090909090"));
    /** Period zero is the undiscounted scale. */
    expect(discountFactorScaled(0, 1_000)).toBe(BigInt("1000000000000"));
  });

  it("an NPV of zero prices the flow exactly at its own IRR", () => {
    expect(npvMinor([-100_000, 110_000], 1_000)).toBe(0);
    expect(irrBps([-100_000, 110_000])).toBe(1_000);
  });

  it("recovers known IRRs to within one basis point", () => {
    /** Two equal inflows of 60000 on 100000 out: 13.07%. */
    expect(irrBps([-100_000, 60_000, 60_000])).toBe(1_307);
    /** Four inflows of 300000 on 1000000 out: 7.71%. */
    expect(irrBps([-1_000_000, 300_000, 300_000, 300_000, 300_000])).toBe(771);
  });

  it("returns null when there is no sign change, rather than a spurious rate", () => {
    /** All-positive flows have no IRR; returning one would be invention. */
    expect(irrBps([100, 200])).toBeNull();
  });

  it("throws rather than returning null when fewer than two flows are supplied", () => {
    /**
     * Null means "the inputs were sufficient and the answer is undefined". Fewer
     * than two flows means the caller asked an unanswerable question, and conflating
     * the two would hide a caller bug behind a plausible empty result.
     */
    expect(() => irrBps([])).toThrow(FamilyMetricsError);
    expect(() => irrBps([-100_000])).toThrow(FamilyMetricsError);
  });

  it("CAGR doubles over ten years at 7.18%", () => {
    /** 2^(1/10) - 1 = 7.177%. */
    expect(cagrBps(100_000, 200_000, 10)).toBe(718);
    /** A zero-year horizon is not a growth rate; it is a caller bug. */
    expect(() => cagrBps(100_000, 200_000, 0)).toThrow(FamilyMetricsError);
    /** A non-positive start or end value has no compound rate. */
    expect(cagrBps(0, 200_000, 10)).toBeNull();
  });
});

describe("NOI excludes debt service by definition", () => {
  it("computes NOI from rent net of vacancy and operating cost only", () => {
    /**
     * 1200000 gross, 500 bps vacancy → 1140000 effective; less 400000 operating
     * → 740000. Debt service, tax on income, depreciation and capex are all
     * excluded; including any of them would make the cap rate wrong.
     */
    expect(
      netOperatingIncomeMinor({
        grossPotentialRentMinor: 1_200_000,
        vacancyBps: 500,
        otherIncomeMinor: 0,
        operatingExpensesMinor: 400_000,
      }),
    ).toBe(740_000);
  });
});

describe("liquidity runway names its missing inputs", () => {
  it("computes days from a positive burn", () => {
    expect(liquidityRunwayDays(1_000_000, 5_000)).toBe(200);
  });

  it("returns null when burn is zero or negative — infinite runway is not a number", () => {
    expect(liquidityRunwayDays(1_000_000, 0)).toBeNull();
    expect(liquidityRunwayDays(1_000_000, -100)).toBeNull();
  });
});

describe("no threshold exists without provenance", () => {
  it("refuses a threshold with no source reference", () => {
    expect(() => assertThresholdProvenance(threshold({ sourceReference: "" }), "LTV")).toThrow(FamilyMetricsError);
    expect(() => assertThresholdProvenance(threshold({ sourceReference: "   " }), "LTV")).toThrow(FamilyMetricsError);
  });

  it("refuses a threshold whose value is not an integer", () => {
    expect(() => assertThresholdProvenance(threshold({ value: 1.5 }), "LTV")).toThrow(FamilyMetricsError);
  });

  it("accepts a threshold that carries both", () => {
    expect(() => assertThresholdProvenance(threshold(), "LTV")).not.toThrow();
  });

  it("the error code names the provenance problem, not a generic validation failure", () => {
    try {
      assertThresholdProvenance(threshold({ sourceReference: "" }), "LTV");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as FamilyMetricsError).code).toBe("THRESHOLD_PROVENANCE_REQUIRED");
    }
  });
});

describe("the red-line ladder grades by BREACH semantics", () => {
  it("grades GREEN when nothing is breached", () => {
    expect(gradeRedLine(1_000, ladder())).toBe("GREEN");
  });

  it("a MAX ladder breaches strictly above its rung — sitting on the line is compliant", () => {
    /**
     * A ceiling of 8000 bps is met at 8000 and breached at 8001. Grading "at or
     * above" would put a family in breach of a limit it is exactly on, which is a
     * false alarm about a rule it is satisfying.
     */
    expect(gradeRedLine(5_999, ladder())).toBe("GREEN");
    expect(gradeRedLine(6_000, ladder())).toBe("GREEN");
    expect(gradeRedLine(6_001, ladder())).toBe("YELLOW");
    expect(gradeRedLine(8_000, ladder())).toBe("YELLOW");
    expect(gradeRedLine(8_001, ladder())).toBe("RED");
  });

  it("a MIN ladder breaches at or below its rung — the same word means the opposite direction", () => {
    const floorLadder = ladder({
      rungs: [
        { band: "RED", threshold: threshold({ code: "T_RED", value: 1_000, direction: "MIN" }) },
        { band: "YELLOW", threshold: threshold({ code: "T_YEL", value: 1_500, direction: "MIN" }) },
      ],
    });
    /** A floor of 1000 bps holds at 1000 and breaches at 999. */
    expect(gradeRedLine(2_000, floorLadder)).toBe("GREEN");
    expect(gradeRedLine(1_500, floorLadder)).toBe("GREEN");
    expect(gradeRedLine(1_499, floorLadder)).toBe("YELLOW");
    expect(gradeRedLine(1_000, floorLadder)).toBe("YELLOW");
    expect(gradeRedLine(999, floorLadder)).toBe("RED");
  });

  it("mixing MIN and MAX rungs in one ladder is refused rather than silently ordered", () => {
    const mixed = ladder({
      rungs: [
        { band: "RED", threshold: threshold({ code: "T_RED", value: 8_000, direction: "MAX" }) },
        { band: "YELLOW", threshold: threshold({ code: "T_YEL", value: 1_000, direction: "MIN" }) },
      ],
    });
    /**
     * A ladder cannot be sorted sensibly when its rungs breach in opposite
     * directions. Refusing is the only honest response; picking an order would
     * grade a real measure against a rule nobody wrote.
     */
    expect(() => gradeRedLine(5_000, mixed)).toThrow(FamilyMetricsError);
  });

  it("worstBand returns the worst of a set, never an average", () => {
    /**
     * Averaging a GREEN and a RED would produce an ORANGE that describes nothing
     * that exists, and would hide the one reading that needed attention.
     */
    expect(worstBand(["GREEN", "RED", "YELLOW"])).toBe("RED");
    expect(worstBand(["GREEN", "ORANGE"])).toBe("ORANGE");
    expect(worstBand(["GREEN", "GREEN"])).toBe("GREEN");
    expect(worstBand(["BLACK", "RED"])).toBe("BLACK");
  });

  it("worstBand of an empty set returns GREEN, the reduce identity", () => {
    /**
     * Callers must guard for an empty set themselves: an empty array carries no
     * readings, and GREEN here means "nothing breached", not "everything was
     * verified healthy". The dashboard route therefore only calls this when it has
     * at least one reading.
     */
    expect(worstBand([])).toBe("GREEN");
    expect(worstBand(["RED"])).toBe("RED");
  });

  it("BPS_BASE is 10000", () => {
    expect(BPS_BASE).toBe(10_000);
  });
});

describe("the capital simulator is a scenario and never a guarantee", () => {
  const input = {
    startingCapitalMinor: 10_000_000,
    monthlyContributionMinor: 100_000,
    annualReturnBps: 800,
    annualFeeBps: 100,
    annualTaxBps: 150,
    annualInflationBps: 300,
    years: 10 as const,
    annualWithdrawalMinor: 0,
  };

  it("labels its basis SCENARIO and structurally denies a guarantee", () => {
    const p = projectCapital(input);
    expect(p.basis).toBe("SCENARIO");
    expect(p.outcomeGuaranteed).toBe(false);
  });

  it("restates the caller's assumptions on its face", () => {
    const p = projectCapital(input);
    expect(p.assumptions.length).toBeGreaterThan(0);
    expect(p.assumptions.join(" ")).toMatch(/8\.00% gross/);
    expect(p.assumptions.join(" ")).toMatch(/Inflation of 3\.00%/);
  });

  it("produces a schedule covering every year of the horizon", () => {
    const p = projectCapital(input);
    expect(p.schedule).toHaveLength(10);
    expect(p.schedule[0]?.year).toBe(1);
    expect(p.schedule[9]?.year).toBe(10);
  });

  it("a real (inflation-adjusted) value is below its nominal counterpart", () => {
    const p = projectCapital(input);
    expect(p.terminalRealMinor).toBeLessThan(p.terminalNominalMinor);
  });

  it("refuses a horizon outside 5/10/20/30/50 years", () => {
    expect(() => projectCapital({ ...input, years: 7 as never })).toThrow();
  });

  it("produces the hand-checked nominal and real terminal values", () => {
    const p = projectCapital(input);
    /** Independently derived: 8% return less 1% fee and 1.5% tax, 100k/month, 10y. */
    expect(p.terminalNominalMinor).toBe(32_531_869);
    expect(p.terminalRealMinor).toBe(24_206_765);
  });

  it("rejects a non-integer starting capital", () => {
    expect(() => projectCapital({ ...input, startingCapitalMinor: 1_000.5 })).toThrow(FamilyMetricsError);
  });
});

describe("the metric set is deterministic for the same inputs", () => {
  it("repeating a calculation returns the identical integer", () => {
    /**
     * A financial measure that returns a different integer on a second call would
     * make an audit trail unreproducible, which is the same as having no audit
     * trail at all.
     */
    for (let i = 0; i < 5; i++) {
      expect(irrBps([-1_000_000, 300_000, 300_000, 300_000, 300_000])).toBe(771);
      expect(gradeRedLine(7_000, ladder())).toBe("YELLOW");
    }
    expect(D.asOf).toBe("2026-03-31");
  });
});
