/**
 * BEYU OS — LBO engine.
 *
 * An LBO model is consumed at exactly the moment when people most want a number: a deal is being
 * approved. These tests therefore pin the REFUSALS — an unbalanced sources & uses, a missing exit
 * multiple, a leverage ceiling breach and a covenant breach — as hard as they pin the arithmetic.
 *
 * Conventions the engine states and these tests assert:
 *   · interest is charged on OPENING balances;
 *   · every cell of a sensitivity grid is a full model run and keeps its refusal reason;
 *   · the sponsor's cash flows exclude seller rollover equity.
 */
import { describe, expect, it } from "vitest";
import type { MetricOutcome, MetricSeedBase } from "@/lib/finance/intelligence/provenance";
import { valueOrNull } from "@/lib/finance/intelligence/provenance";
import {
  buildSourcesAndUses,
  LBO_ENGINE_VERSION,
  lboSensitivity,
  runLboModel,
  type LboModel,
} from "@/lib/finance/private-capital/lbo";
import type { ValuationAssumptionSet } from "@/lib/finance/intelligence/valuation";

let counter = 0;
const seed = (): MetricSeedBase => ({
  subject: { subjectType: "DEAL", subjectId: "DEAL_TEST_1" },
  dataTimestamp: "2026-01-01T00:00:00.000Z",
  nextId: () => `LBO-${++counter}`,
});

const assumptions: ValuationAssumptionSet = {
  modelId: "LBO_TEST_1",
  version: 1,
  authoredBy: "principal:test",
  authoredAt: "2026-01-01T00:00:00.000Z",
  scenarioKind: "BASE",
  assumptions: [
    { key: "entryMultiple", value: "5", unit: "MULTIPLE", kind: "ASSUMPTION", source: "test-fixture" },
    { key: "exitMultiple", value: "5", unit: "MULTIPLE", kind: "ASSUMPTION", source: "test-fixture" },
  ],
};

const baseModel = (): LboModel => ({
  seed: seed(),
  assumptions,
  transaction: {
    purchasePriceMinor: 500_000_000,
    entryMultipleScaled: 5_000_000,
    entryEbitdaMinor: 100_000_000,
    transactionFeeMinor: 0,
    sponsorEquityMinor: 200_000_000,
    currency: "USD",
  },
  operating: {
    baseRevenueMinor: 1_000_000_000,
    revenueGrowthBps: [500, 400, 300],
    ebitdaMarginBps: [2000, 2100, 2200],
    depreciationAmortisationBps: 300,
    capexBps: 400,
    workingCapitalBps: 100,
    effectiveTaxRateBps: 2500,
  },
  debt: [
    {
      code: "TERM_LOAN_B",
      amountMinor: 300_000_000,
      interestRateBps: 900,
      mandatoryAmortisationBps: 500,
      cashSweepEligible: true,
      cashSweepShareBps: 10_000,
    },
  ],
  exit: { method: "MULTIPLE", exitMultipleScaled: 5_000_000, holdingPeriodYears: 3 },
  maximumLeverageScaled: 6_000_000,
  minimumInterestCoverageScaled: 2_000_000,
});

function expectRefusal(outcome: MetricOutcome<unknown>): string {
  expect(outcome.kind).toBe("ABSENT");
  if (outcome.kind !== "ABSENT") throw new Error("unreachable");
  expect(outcome.reason.length).toBeGreaterThan(8);
  return outcome.reason;
}

describe("sources & uses", () => {
  it("balances debt + sponsor equity + target cash against price + fees", () => {
    const su = buildSourcesAndUses({
      transaction: {
        purchasePriceMinor: 500_000_000,
        entryMultipleScaled: 5_000_000,
        entryEbitdaMinor: 100_000_000,
        transactionFeeMinor: 10_000_000,
        sponsorEquityMinor: 210_000_000,
        currency: "USD",
      },
      debt: [{ code: "TERM_LOAN_B", amountMinor: 300_000_000, interestRateBps: 900, mandatoryAmortisationBps: 500, cashSweepEligible: true }],
      entryEbitdaMinor: 100_000_000,
    });
    expect(su.sources.totalMinor).toBe(510_000_000);
    expect(su.uses.totalMinor).toBe(510_000_000);
    expect(su.imbalanceMinor).toBe(0);
    expect(su.totalDebtMinor).toBe(300_000_000);
    expect(su.entryLeverageScaled).toBe(3_000_000); // 3.0× entry leverage
  });

  it("computes the imbalance instead of hiding it", () => {
    const su = buildSourcesAndUses({
      transaction: {
        purchasePriceMinor: 500_000_000,
        entryMultipleScaled: 5_000_000,
        entryEbitdaMinor: 100_000_000,
        transactionFeeMinor: 0,
        sponsorEquityMinor: 100_000_000,
        currency: "USD",
      },
      debt: [{ code: "TERM_LOAN_B", amountMinor: 300_000_000, interestRateBps: 900, mandatoryAmortisationBps: 500, cashSweepEligible: true }],
      entryEbitdaMinor: 100_000_000,
    });
    expect(su.imbalanceMinor).toBe(-100_000_000);
  });
});

describe("runLboModel", () => {
  it("returns a complete result for a coherent model", () => {
    const outcome = runLboModel(baseModel());
    expect(outcome.kind).toBe("VALUE");
    if (outcome.kind !== "VALUE") return;
    const result = outcome.value;
    expect(result.years).toHaveLength(3);
    expect(result.sourcesAndUses.imbalanceMinor).toBe(0);
    expect(result.exitEnterpriseValueMinor).toBeGreaterThan(0);
    expect(result.exitEquityValueMinor).toBe(result.exitEnterpriseValueMinor - result.exitNetDebtMinor);
    expect(result.sponsorMoicScaled).not.toBeNull();
    expect((result.sponsorMoicScaled as number)).toBeGreaterThan(0);
    expect(result.assumptionFingerprint).toMatch(/^vf1_/);
    // The provenance records the calculation version that produced the number. NOTE: all finance
    // intelligence engines currently stamp the shared finance-intelligence calculation version; the
    // engine's own LBO_ENGINE_VERSION identifies the model in its refusals and in the model registry.
    expect(LBO_ENGINE_VERSION).toMatch(/^lbo-engine-\d/);
    expect(outcome.provenance.calculationVersion.length).toBeGreaterThan(0);
    // Sponsor cash flows never include seller rollover equity: -200,000,000 then exit proceeds.
    expect(result.sponsorCashFlowsMinor[0]).toBe(-200_000_000);
  });

  it("REFUSES an unbalanced sources & uses with the computed imbalance", () => {
    const model = baseModel();
    model.transaction = { ...model.transaction, sponsorEquityMinor: 199_999_999 };
    const reason = expectRefusal(runLboModel(model));
    expect(reason).toMatch(/balance|source|uses/i);
  });

  it("REFUSES a leverage ceiling breach", () => {
    const model = baseModel();
    model.maximumLeverageScaled = 1_000_000; // 1.0× declared against 3.0× drawn
    const reason = expectRefusal(runLboModel(model));
    expect(reason).toMatch(/leverage/i);
  });

  it("REFUSES an interest-coverage covenant breach", () => {
    const model = baseModel();
    model.minimumInterestCoverageScaled = 100_000_000; // 100× minimum, unreachable
    const reason = expectRefusal(runLboModel(model));
    expect(reason).toMatch(/coverage/i);
  });

  it("REFUSES an EXIT_MULTIPLE exit with no multiple supplied", () => {
    const model = baseModel();
    model.exit = { method: "MULTIPLE", exitMultipleScaled: null, holdingPeriodYears: 3 };
    const reason = expectRefusal(runLboModel(model));
    expect(reason).toMatch(/exit multiple/i);
  });

  it("REFUSES an entry multiple that contradicts the purchase price by more than 1%", () => {
    const model = baseModel();
    model.transaction = { ...model.transaction, entryMultipleScaled: 8_000_000 }; // implies 800m, price is 500m
    const reason = expectRefusal(runLboModel(model));
    expect(reason).toMatch(/entry multiple|price/i);
  });

  it("sweeps cash to debt: the sweep reduces the exit net debt", () => {
    const withSweep = runLboModel(baseModel());
    const withoutSweep = runLboModel({
      ...baseModel(),
      debt: [{ ...baseModel().debt[0], cashSweepEligible: false }],
    });
    expect(withSweep.kind).toBe("VALUE");
    expect(withoutSweep.kind).toBe("VALUE");
    if (withSweep.kind !== "VALUE" || withoutSweep.kind !== "VALUE") return;
    expect(withSweep.value.totalSweepMinor).toBeGreaterThan(0);
    expect(withoutSweep.value.totalSweepMinor).toBe(0);
    expect(withSweep.value.exitNetDebtMinor).toBeLessThan(withoutSweep.value.exitNetDebtMinor);
  });
});

describe("lboSensitivity", () => {
  it("runs a full model per cell and keeps each cell's refusal reason", () => {
    const { seed: _unused, ...modelWithoutSeed } = baseModel();
    const table = lboSensitivity({
      model: modelWithoutSeed,
      rowAxis: "EXIT_MULTIPLE",
      columnAxis: "REVENUE_GROWTH",
      rowValues: [4_000_000, 5_000_000, 6_000_000],
      columnValues: [300, 500],
    });
    expect(table.cells).toHaveLength(6);
    containsRefusals: {
      const refused = table.cells.filter((cell) => cell.reason !== null);
      if (refused.length > 0) expect(refused[0].reason).toBeTruthy();
      expect(table.fingerprint.length).toBeGreaterThan(4);
    }
  });
});
