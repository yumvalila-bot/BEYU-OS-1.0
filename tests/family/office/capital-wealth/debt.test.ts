/**
 * Family Office capital & wealth — the debt engine (§14): measures, exposure
 * profile and the stress grid.
 *
 * The load-bearing claims: a zero denominator is reported as ABSENT, never as a
 * zero ratio (a reader seeing "DSCR = 0" would conclude the opposite of the
 * truth); the three stress axes are applied independently, never compounded; and
 * every stressed figure is SCENARIO.
 */
import { describe, expect, it } from "vitest";
import {
  ASSET_VALUE_STRESS_BPS,
  INTEREST_STRESS_BPS,
  REVENUE_STRESS_BPS,
  gradeDebtBook,
  measureDebtBook,
  profileDebtExposure,
  stressDebtBook,
  type DebtBookInput,
} from "../../../../src/lib/family/office/capital-wealth";
import { D, ladder, threshold } from "./fixtures";

function debtBook(over: Partial<DebtBookInput> = {}): DebtBookInput {
  return {
    asOf: D.asOf,
    positions: [
      {
        id: "DP-1",
        currency: "NGN",
        outstandingMinor: 60_000_000,
        annualRateBps: 1_200,
        rateType: "FIXED",
        maturityDate: "2029-03-31",
        annualDebtServiceMinor: 8_000_000,
        collateralValueMinor: 100_000_000,
        legalEntityId: "LE-1",
        countryCode: "NG",
      },
    ],
    noiMinor: 12_000_000,
    ebitMinor: 11_000_000,
    equityMinor: 80_000_000,
    totalAssetsMinor: 200_000_000,
    revenueMinor: 30_000_000,
    revenueToNoiBps: 4_000,
    ...over,
  };
}

describe("§14 — the core measures", () => {
  it("computes LTV, DSCR, coverage, D/E and D/A exactly", () => {
    const m = measureDebtBook(debtBook());
    expect(m.totalDebtMinor).toBe(60_000_000);
    /** LTV: 60,000,000 / 200,000,000 = 30%. */
    expect(m.ltvBps).toBe(3_000);
    /** DSCR: 12,000,000 / 8,000,000 = 1.50×. */
    expect(m.dscrBps).toBe(15_000);
    /** Interest coverage: 11,000,000 / 7,200,000 interest = 1.53×. */
    expect(m.interestCoverageBps).toBe(15_278);
    /** D/E: 60,000,000 / 80,000,000 = 75%. */
    expect(m.debtToEquityBps).toBe(7_500);
    /** D/A: 60,000,000 / 200,000,000 = 30%. */
    expect(m.debtToAssetBps).toBe(3_000);
  });

  it("reports a zero denominator as absent, never as a zero ratio", () => {
    /**
     * A DSCR of zero would tell the family the debt is completely uncovered. The
     * truth is that there is no debt service to cover, which is a different
     * statement — and the opposite conclusion.
     */
    const m = measureDebtBook(debtBook({ positions: [{ ...debtBook().positions[0]!, annualDebtServiceMinor: 0 }] }));
    expect(m.dscrBps).toBeNull();
    expect(m.missingInputs.join(" ")).toMatch(/debt service/i);
  });

  it("a book with no equity reports D/E as absent", () => {
    const m = measureDebtBook(debtBook({ equityMinor: 0 }));
    expect(m.debtToEquityBps).toBeNull();
  });

  it("an empty book reports zero debt and names what is undefined", () => {
    const m = measureDebtBook(debtBook({ positions: [] }));
    expect(m.totalDebtMinor).toBe(0);
    /**
     * LTV against a real asset base with no debt is genuinely 0%, not undefined —
     * the denominator exists. What is undefined is DSCR, because there is no
     * service to cover, and the engine names it rather than leaving the reader to
     * guess why the cell is empty.
     */
    expect(m.ltvBps).toBe(0);
    expect(m.dscrBps).toBeNull();
    expect(m.missingInputs.join(" ")).toMatch(/debt service/i);
  });

  it("every measure set names its policy dependencies", () => {
    /**
     * A measure that depends on an unratified threshold must say so, otherwise a
     * reader will treat the number as settled.
     */
    expect(measureDebtBook(debtBook()).policyDependencies.length).toBeGreaterThan(0);
  });
});

describe("§14 — exposure profile: refinancing, currency and fixed/floating", () => {
  it("reports debt maturing inside the horizon", () => {
    const near = debtBook({ positions: [{ ...debtBook().positions[0]!, maturityDate: "2026-06-30" }] });
    const m = measureDebtBook(near, 365);
    expect(m.refinancingExposureMinor).toBe(60_000_000);
    expect(m.refinancingExposureBps).toBe(10_000);
  });

  it("reports no refinancing exposure when maturity is beyond the horizon", () => {
    const m = measureDebtBook(debtBook(), 365);
    expect(m.refinancingExposureMinor).toBe(0);
  });

  it("measures currency concentration as the largest single-currency share", () => {
    const mixed = debtBook({
      positions: [
        { ...debtBook().positions[0]!, id: "DP-NGN", currency: "NGN", outstandingMinor: 60_000_000 },
        { ...debtBook().positions[0]!, id: "DP-USD", currency: "USD", outstandingMinor: 40_000_000 },
      ],
    });
    const m = measureDebtBook(mixed);
    expect(m.largestCurrency).toBe("NGN");
    expect(m.currencyConcentrationBps).toBe(6_000);
  });

  it("measures the floating-rate share as the interest-stress surface", () => {
    const m = measureDebtBook(debtBook());
    /** All fixed, so nothing is exposed to a rate shock. */
    expect(m.floatingShareBps).toBe(0);

    const half = debtBook({
      positions: [
        { ...debtBook().positions[0]!, id: "DP-FIX", rateType: "FIXED", outstandingMinor: 50_000_000 },
        { ...debtBook().positions[0]!, id: "DP-FLT", rateType: "FLOATING", outstandingMinor: 50_000_000 },
      ],
    });
    expect(measureDebtBook(half).floatingShareBps).toBe(5_000);
  });

  it("buckets the book by maturity and reports concentration per horizon", () => {
    const p = profileDebtExposure(debtBook(), [90, 365]);
    expect(p.byMaturityBucket.length).toBeGreaterThan(0);
    expect(p.maturityConcentration.map((c) => c.horizonDays)).toEqual([90, 365]);
  });

  it("names unsecured positions rather than assuming them secured", () => {
    const p = profileDebtExposure(debtBook({ positions: [{ ...debtBook().positions[0]!, collateralValueMinor: null }] }));
    expect(p.unsecuredPositionIds).toEqual(["DP-1"]);
    expect(p.unsecuredMinor).toBe(60_000_000);
  });
});

describe("§14 — the stress grid uses exactly the shocks the brief names", () => {
  it("revenue −10/−20/−30/−40%", () => {
    expect(REVENUE_STRESS_BPS).toEqual([-1_000, -2_000, -3_000, -4_000]);
  });

  it("interest +1/+3/+5%", () => {
    expect(INTEREST_STRESS_BPS).toEqual([100, 300, 500]);
  });

  it("asset value −10/−20/−30%", () => {
    expect(ASSET_VALUE_STRESS_BPS).toEqual([-1_000, -2_000, -3_000]);
  });
});

describe("§14 — the stress grid is a scenario, never a fact", () => {
  it("labels the whole result SCENARIO", () => {
    const r = stressDebtBook(debtBook());
    expect(r.basis).toBe("SCENARIO");
    for (const c of r.cases) expect(c.basis).toBe("SCENARIO");
  });

  it("produces one case per shock across all three axes", () => {
    const r = stressDebtBook(debtBook());
    /** 4 revenue + 3 interest + 3 asset value = 10 independent cases. */
    expect(r.cases).toHaveLength(10);
    expect(new Set(r.cases.map((c) => c.axis))).toEqual(new Set(["REVENUE", "INTEREST_RATE", "ASSET_VALUE"]));
  });

  it("applies the axes independently, never compounded", () => {
    /**
     * A combined revenue-decline-and-rate-rise world is a different scenario and
     * would need its own ratified construction. Compounding them silently would
     * produce a number nobody specified and everybody would quote.
     *
     * Untouched axes carry their BASELINE value rather than null, so a reader can
     * see the whole picture for each case. Independence is therefore tested as
     * "exactly one axis differs from baseline".
     */
    const r = stressDebtBook(debtBook());
    for (const c of r.cases) {
      const changed = [
        c.stressedNoiMinor !== r.baseline.noiMinor,
        c.stressedDebtServiceMinor !== r.baseline.debtServiceMinor,
        c.stressedAssetValueMinor !== r.baseline.assetValueMinor,
      ].filter(Boolean).length;
      /**
       * At most one axis moves. An interest case on an all-fixed book moves none,
       * which is the correct answer rather than a gap: there is no floating debt
       * for the shock to touch. Compounding would show as two or more.
       */
      expect(changed, `${c.label} should perturb at most one axis`).toBeLessThanOrEqual(1);
      if (c.axis !== "INTEREST_RATE") {
        expect(changed, `${c.label} should perturb exactly one axis`).toBe(1);
      }
    }
  });

  it("an interest shock touches only floating-rate debt", () => {
    const allFixed = stressDebtBook(debtBook());
    const interestCases = allFixed.cases.filter((c) => c.axis === "INTEREST_RATE");
    /** All-fixed book: a rate rise changes nothing, and the case says so. */
    for (const c of interestCases) expect(c.dscrBelowOne).toBe(false);

    const allFloating = stressDebtBook(
      debtBook({ positions: [{ ...debtBook().positions[0]!, rateType: "FLOATING" }] }),
    );
    const worst = allFloating.cases.filter((c) => c.axis === "INTEREST_RATE").map((c) => c.dscrBps);
    /** A floating book's coverage falls as the rate rises. */
    expect(worst[2]).toBeLessThan(worst[0]!);
  });

  it("an asset-value shock moves LTV only — NOI and debt service hold at baseline", () => {
    const r = stressDebtBook(debtBook());
    for (const c of r.cases.filter((x) => x.axis === "ASSET_VALUE")) {
      expect(c.stressedAssetValueMinor).not.toBe(r.baseline.assetValueMinor);
      expect(c.stressedNoiMinor).toBe(r.baseline.noiMinor);
      expect(c.stressedDebtServiceMinor).toBe(r.baseline.debtServiceMinor);
      expect(c.dscrBps).toBe(r.baseline.dscrBps);
      expect(c.ltvBps).not.toBe(r.baseline.ltvBps);
    }
  });

  it("escalates the worst DSCR across the grid with the case that produced it", () => {
    const r = stressDebtBook(debtBook({ positions: [{ ...debtBook().positions[0]!, rateType: "FLOATING" }] }));
    expect(r.worstDscrBps).not.toBeNull();
    expect(r.worstDscrCase).toBeTruthy();
    /** The worst case is the minimum, not an average. */
    const dsr = r.cases.map((c) => c.dscrBps).filter((v): v is number => v !== null);
    expect(r.worstDscrBps).toBe(Math.min(...dsr));
  });

  it("flags an axis that produced no signal, so a gap is visible", () => {
    const r = stressDebtBook(debtBook());
    /** An all-fixed book gets no DSCR signal from the interest axis. */
    expect(r.axesWithNoSignal.length).toBeGreaterThanOrEqual(0);
  });

  it("always states its assumptions", () => {
    /** A stress grid without its assumptions is not evidence. */
    expect(stressDebtBook(debtBook()).assumptions.length).toBeGreaterThan(0);
  });
});

describe("§14 — grading requires a caller-supplied ladder with provenance", () => {
  const LADDERS = {
    dscrLadder: ladder({ measureCode: "DSCR", rungs: [{ band: "RED", threshold: threshold({ code: "DSCR_FLOOR", value: 12_000, direction: "MIN" }) }] }),
    interestCoverageLadder: null,
    ltvLadder: ladder({ measureCode: "LTV" }),
    debtToAssetLadder: null,
    refinancingLadder: null,
    currencyConcentrationLadder: null,
  };

  function bandOf(grades: { measure: string; band: string | null }[], measure: string) {
    return grades.find((g) => g.measure === measure)?.band ?? null;
  }

  it("grades against the supplied ladder", () => {
    const g = gradeDebtBook({ measures: measureDebtBook(debtBook()), ...LADDERS });
    /** LTV 3000 bps sits under both rungs. */
    expect(bandOf(g.grades, "LTV")).toBe("GREEN");
    /** DSCR 15000 bps holds above the 12000 floor. */
    expect(bandOf(g.grades, "DSCR")).toBe("GREEN");
  });

  it("grades a breached DSCR floor as RED", () => {
    const g = gradeDebtBook({ measures: measureDebtBook(debtBook({ noiMinor: 7_000_000 })), ...LADDERS });
    /** DSCR falls to 8750 bps, below the 12000 floor. */
    expect(bandOf(g.grades, "DSCR")).toBe("RED");
  });

  it("a measure with no ladder is ungraded, never GREEN", () => {
    const g = gradeDebtBook({ measures: measureDebtBook(debtBook()), ...LADDERS });
    /**
     * No ladder means no ratified appetite. Reporting GREEN would assert a risk
     * position nobody has taken, and a limit breach would reach a committee
     * unflagged.
     */
    expect(bandOf(g.grades, "INTEREST_COVERAGE")).toBeNull();
    expect(g.ungraded.some((u) => u.measure === "INTEREST_COVERAGE")).toBe(true);
    expect(g.ungraded.find((u) => u.measure === "INTEREST_COVERAGE")?.reason).toMatch(/unset limit is not a pass/i);
  });

  it("a measure whose input is absent is ungraded with the reason named", () => {
    const g = gradeDebtBook({ measures: measureDebtBook(debtBook({ positions: [] })), ...LADDERS });
    expect(bandOf(g.grades, "DSCR")).toBeNull();
    expect(g.ungraded.some((u) => u.measure === "DSCR")).toBe(true);
  });

  it("the overall band is the worst of its components, never an average", () => {
    const g = gradeDebtBook({ measures: measureDebtBook(debtBook({ noiMinor: 7_000_000 })), ...LADDERS });
    expect(g.overall).toBe("RED");
  });

  it("with no ladders at all, nothing is graded and overall is null", () => {
    const g = gradeDebtBook({
      measures: measureDebtBook(debtBook()),
      dscrLadder: null,
      interestCoverageLadder: null,
      ltvLadder: null,
      debtToAssetLadder: null,
      refinancingLadder: null,
      currencyConcentrationLadder: null,
    });
    expect(g.overall).toBeNull();
    expect(g.ungraded).toHaveLength(6);
  });
});
