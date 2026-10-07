/**
 * BEYU OS — Private capital: the return measures that are most often reported as facts.
 *
 * DPI, RVPI, TVPI and MOIC are the four numbers every fund factsheet leads with, and three of the four
 * depend on a valuation mark. The purpose of this suite is to pin the distinction the platform makes
 * between them:
 *
 *   · DPI is cash — CALCULATED, because only money that has moved is counted;
 *   · RVPI is a mark — ALWAYS ESTIMATED, never a realized result;
 *   · TVPI is ESTIMATED while anything is unrealized and only becomes CALCULATED when the fund is
 *     actually fully realized (unrealized = 0), which the engine checks rather than assumes;
 *   · an IRR that cannot be measured is NOT_APPLICABLE ("not measurable"), never 0%.
 *
 * It also pins the per-engine calculation-version stamp: every outcome records the version of the engine
 * that produced it, so a stored metric can be traced back to the code that computed it.
 *
 * Deterministic: no clock, no database, no randomness. Amounts are integer minor units; ratios are
 * fixed-point multiples scaled by 10^6.
 */
import { describe, expect, it } from "vitest";
import type { MetricOutcome, MetricSeedBase } from "@/lib/finance/intelligence/provenance";
import { valueOrNull } from "@/lib/finance/intelligence/provenance";
import {
  aggregateFund,
  dpi,
  fundIrr,
  moic,
  PRIVATE_CAPITAL_METRICS_VERSION,
  rvpi,
  tvpi,
  type CapitalAccountPosition,
  type FundAggregate,
} from "@/lib/finance/private-capital/metrics";
import {
  aggregateCapitalPortfolio,
  assertCapitalSeparation,
  ENTRUSTED_CAPITAL_VERSION,
  fiduciaryReport,
  type CapitalArrangement,
} from "@/lib/finance/private-capital/entrusted";
import {
  buildSourcesAndUses,
  LBO_ENGINE_VERSION,
  runLboModel,
  type LboModel,
} from "@/lib/finance/private-capital/lbo";
import { discountedCashFlow, VALUATION_ENGINE_VERSION, type DcfInputs, type ValuationAssumptionSet } from "@/lib/finance/intelligence/valuation";
import { FINANCE_METRICS_VERSION, marketCapitalization } from "@/lib/finance/intelligence/metrics";
import { PRICING_ENGINE_VERSION, pricedMarginOutcome } from "@/lib/pricing/costing";
import { calculateAllowance, COMPENSATION_ENGINE_VERSION } from "@/lib/compensation/entitlements";

let counter = 0;
function seed(subjectType: MetricSeedBase["subject"]["subjectType"] = "FUND"): MetricSeedBase {
  return {
    subject: { subjectType, subjectId: `SUBJECT_${++counter}` },
    dataTimestamp: "2026-01-01T00:00:00.000Z",
    nextId: () => `MET-${++counter}`,
  };
}

const account = (overrides: Partial<CapitalAccountPosition> = {}): CapitalAccountPosition => ({
  accountId: "ACC_1",
  accountClass: "LP",
  commitmentMinor: 100_000_000,
  paidInMinor: 60_000_000,
  distributedMinor: 15_000_000,
  unrealizedMinor: 55_000_000,
  managementFeesMinor: 1_000_000,
  carriedInterestMinor: 0,
  currency: "USD",
  ...overrides,
});

function fund(overrides: Partial<CapitalAccountPosition> = {}): FundAggregate {
  return aggregateFund({ currency: "USD", accounts: [account(overrides)] });
}

function expectAbsent(outcome: MetricOutcome<unknown>): string {
  expect(outcome.kind).toBe("ABSENT");
  if (outcome.kind !== "ABSENT") throw new Error("unreachable");
  expect(outcome.reason.length).toBeGreaterThan(8);
  return outcome.reason;
}

describe("DPI — paid-in capital is the denominator, and it can be zero", () => {
  it("is CALCULATED when cash has actually moved", () => {
    const outcome = dpi({ seed: seed(), aggregate: fund() });
    expect(outcome.state).toBe("CALCULATED");
    // 15,000,000 / 60,000,000 = 0.25 × 10^6
    expect(valueOrNull(outcome)).toBe(250_000);
  });

  it("reports MISSING — never 0 — when nothing has been called", () => {
    const reason = expectAbsent(dpi({ seed: seed(), aggregate: fund({ paidInMinor: 0 }) }));
    expect(reason).toMatch(/paid-in|zero/i);
  });

  it("does not become an estimate merely because the fund also holds unrealized value", () => {
    const outcome = dpi({ seed: seed(), aggregate: fund({ unrealizedMinor: 900_000_000 }) });
    // DPI counts distributions only: an inflated mark must not move it.
    expect(valueOrNull(outcome)).toBe(250_000);
    expect(outcome.state).toBe("CALCULATED");
  });
});

describe("RVPI — a valuation opinion, so it is never rendered as a fact", () => {
  it("is ALWAYS ESTIMATED, even when the mark is large and the arithmetic is exact", () => {
    const outcome = rvpi({ seed: seed(), aggregate: fund(), markConfidence: 0.6 });
    expect(outcome.state).toBe("ESTIMATED");
    expect(valueOrNull(outcome)).toBe(916_667); // 55,000,000 / 60,000,000 = 0.91666… × 10^6, rounded
    expect(outcome.provenance.confidence).toBe(0.6);
    expect(outcome.provenance.epistemic).not.toBe("OBSERVED");
  });

  it("carries no confidence when the caller supplies none, rather than inventing one", () => {
    const outcome = rvpi({ seed: seed(), aggregate: fund() });
    expect(outcome.state).toBe("ESTIMATED");
    expect(outcome.provenance.confidence).toBeNull();
  });

  it("reports MISSING when nothing has been called", () => {
    const reason = expectAbsent(rvpi({ seed: seed(), aggregate: fund({ paidInMinor: 0 }) }));
    expect(reason).toMatch(/called|undefined/i);
  });

  it("returns zero as an estimate when the mark is zero and capital has been called", () => {
    const outcome = rvpi({ seed: seed(), aggregate: fund({ unrealizedMinor: 0 }) });
    // A fund that holds nothing is genuinely worth nothing on an unrealized basis — but it is still a
    // mark, so the state stays ESTIMATED rather than collapsing into a realized zero.
    expect(outcome.state).toBe("ESTIMATED");
    expect(valueOrNull(outcome)).toBe(0);
  });
});

describe("TVPI — estimated while unrealized, calculated only when the fund is actually realized", () => {
  it("is ESTIMATED while any value is unrealized", () => {
    const outcome = tvpi({ seed: seed(), aggregate: fund(), markConfidence: 0.5 });
    expect(outcome.state).toBe("ESTIMATED");
    // (15,000,000 + 55,000,000) / 60,000,000 = 1.16666… × 10^6, rounded
    expect(valueOrNull(outcome)).toBe(1_166_667);
    expect(outcome.provenance.confidence).toBe(0.5);
  });

  it("becomes CALCULATED when the fund is fully realized (no holdings left)", () => {
    const outcome = tvpi({ seed: seed(), aggregate: fund({ unrealizedMinor: 0 }) });
    expect(outcome.state).toBe("CALCULATED");
    expect(valueOrNull(outcome)).toBe(250_000);
  });

  it("reports MISSING when nothing has been called", () => {
    const reason = expectAbsent(tvpi({ seed: seed(), aggregate: fund({ paidInMinor: 0 }) }));
    expect(reason).toMatch(/called|undefined/i);
  });
});

describe("MOIC", () => {
  it("is ESTIMATED with unrealized value and the same ratio as TVPI at fund level", () => {
    const aggregate = fund();
    const multiple = moic({ seed: seed(), aggregate });
    const total = tvpi({ seed: seed(), aggregate });
    expect(multiple.state).toBe("ESTIMATED");
    expect(valueOrNull(multiple)).toBe(valueOrNull(total));
  });

  it("reports MISSING when no capital has been invested", () => {
    const reason = expectAbsent(moic({ seed: seed(), aggregate: fund({ paidInMinor: 0 }) }));
    expect(reason).toMatch(/invested|undefined/i);
  });
});

describe("fund IRR — 'not measurable' is a different answer from zero", () => {
  it("reports NOT_APPLICABLE when no distribution has ever been made", () => {
    const outcome = fundIrr({
      seed: seed(),
      stream: [-10_000_000, -5_000_000, -2_500_000],
      currency: "USD",
      periodBasis: "ANNUAL",
      includesUnrealized: false,
    });
    const reason = expectAbsent(outcome);
    expect(outcome.state).toBe("NOT_APPLICABLE");
    expect(reason).toMatch(/not measurable|no IRR/i);
  });

  it("solves per period and states FORECAST when the terminal value is an unrealized mark", () => {
    const outcome = fundIrr({
      seed: seed(),
      stream: [-100_000_000, 0, 0, 180_000_000],
      currency: "USD",
      periodBasis: "ANNUAL",
      includesUnrealized: true,
      confidence: 0.4,
    });
    expect(outcome.kind).toBe("VALUE");
    if (outcome.kind !== "VALUE") return;
    expect(outcome.value.irrBps).not.toBeNull();
    expect(outcome.value.includesUnrealized).toBe(true);
    // An IRR whose terminal value is an unrealized mark is a FORECAST, not an estimate of a realized
    // return: nothing has been received. The engine states that in the state, not only in a footnote.
    expect(outcome.state).toBe("FORECAST");
  });

  it("reports MISSING with fewer than two flows", () => {
    const reason = expectAbsent(
      fundIrr({ seed: seed(), stream: [-1], currency: "USD", periodBasis: "ANNUAL", includesUnrealized: false }),
    );
    expect(reason).toMatch(/two cash flows/i);
  });
});

describe("fund aggregation", () => {
  it("refuses to sum capital accounts denominated in different currencies", () => {
    expect(() =>
      aggregateFund({
        currency: "USD",
        accounts: [account(), account({ accountId: "ACC_2", currency: "KES" })],
      }),
    ).toThrow(/currency/i);
  });

  it("sums governed rows exactly, so the aggregate cannot disagree with its ledger", () => {
    const aggregate = aggregateFund({
      currency: "USD",
      accounts: [
        account({ accountId: "ACC_1", paidInMinor: 40_000_000, distributedMinor: 10_000_000, unrealizedMinor: 30_000_000 }),
        account({ accountId: "ACC_2", paidInMinor: 20_000_000, distributedMinor: 5_000_000, unrealizedMinor: 25_000_000 }),
      ],
    });
    expect(aggregate.paidInMinor).toBe(60_000_000);
    expect(aggregate.distributedMinor).toBe(15_000_000);
    expect(aggregate.unrealizedMinor).toBe(55_000_000);
    expect(aggregate.totalValueMinor).toBe(70_000_000);
    expect(aggregate.accounts).toBe(2);
  });
});

describe("entrusted capital — origins are never summed into one number", () => {
  const arrangement = (overrides: Partial<CapitalArrangement> = {}): CapitalArrangement => ({
    id: "ARR_1",
    instrument: "MANAGED_CAPITAL",

    legalEntityId: "ENT_BEYU",
    providerPartyId: "PARTY_LP_1",
    beneficialOwnerPartyId: "PARTY_FAMILY_1",
    currency: "USD",
    commitmentMinor: 500_000_000,
    drawnMinor: 300_000_000,
    restrictions: ["purpose:managed-mandate"],
    purpose: "managed mandate for the provider's account",
    maturityDate: null,
    governingAgreementRef: "AGR_1",
    covenantRefs: [],
    repayable: false,
    returnRateBps: null,
    feeRateBps: 100,
    status: "ACTIVE",
    approvalRef: "APR_1",
    fiduciaryRestrictions: ["no-commingling"],
    ...overrides,
  });

  it("keeps FIDUCIARY, PROJECT and GUARANTEED capital in separate totals and never in a combined one", () => {
    const portfolio = aggregateCapitalPortfolio({
      arrangements: [
        arrangement(), // MANAGED_CAPITAL → FIDUCIARY, drawn 300,000,000
        arrangement({ id: "ARR_2", instrument: "THIRD_PARTY_DEBT", commitmentMinor: 100_000_000, drawnMinor: 100_000_000 }),
        arrangement({ id: "ARR_3", instrument: "GUARANTEE", commitmentMinor: 50_000_000, drawnMinor: 0 }),
      ],
      reportingCurrency: "USD",
    });
    expect(portfolio.fiduciaryDrawnMinor).toBe(300_000_000);
    expect(portfolio.projectDrawnMinor).toBe(100_000_000);
    expect(portfolio.guaranteedNotionalMinor).toBe(50_000_000);
    // No instrument in the governed catalogue classifies as OWN, so an arrangements-only portfolio
    // reports zero *by construction* rather than by assumption: BEYU's own capital can never be
    // smuggled in through the entrusted-capital register.
    expect(portfolio.ownDrawnMinor).toBe(0);
    // The type has no combined total at all — the absence of the field is the control.
    expect(Object.prototype.hasOwnProperty.call(portfolio, "totalDrawnMinor")).toBe(false);
  });

  it("excludes a foreign-currency arrangement with a stated reason instead of converting silently", () => {
    const portfolio = aggregateCapitalPortfolio({
      arrangements: [arrangement(), arrangement({ id: "ARR_KES", currency: "KES" })],
      reportingCurrency: "USD",
    });
    expect(portfolio.excluded).toHaveLength(1);
    expect(portfolio.excluded[0].arrangementId).toBe("ARR_KES");
    expect(portfolio.excluded[0].reason).toMatch(/governed FX/i);
  });

  it("throws when a structure tries to expose a single combined capital total", () => {
    const portfolio = aggregateCapitalPortfolio({ arrangements: [arrangement()], reportingCurrency: "USD" });
    expect(() => assertCapitalSeparation(portfolio)).not.toThrow();
    expect(() =>
      assertCapitalSeparation({ ...portfolio, totalDrawnMinor: portfolio.ownDrawnMinor + portfolio.fiduciaryDrawnMinor } as never),
    ).toThrow(/may never be summed/i);
  });
});

describe("per-engine calculation-version stamping", () => {
  it("records the private-capital engine version on a fund ratio", () => {
    const outcome = dpi({ seed: seed(), aggregate: fund() });
    expect(outcome.provenance.calculationVersion).toBe(PRIVATE_CAPITAL_METRICS_VERSION);
  });

  it("records the finance-metrics version on a market metric", () => {
    const outcome = marketCapitalization({
      seed: seed("SECURITY"),
      sharePrice: { amountMinorPerShare: 1_250, source: "test-fixture", currency: "USD", period: "FY2025" },
      sharesOutstanding: { shares: 4_000_000, source: "test-fixture" },
    });
    expect(outcome.provenance.calculationVersion).toBe(FINANCE_METRICS_VERSION);
  });

  it("records the valuation-engine version on a DCF", () => {
    const assumptions: ValuationAssumptionSet = {
      modelId: "VAL_VERSION_1",
      version: 1,
      authoredBy: "principal:test",
      authoredAt: "2026-01-01T00:00:00.000Z",
      scenarioKind: "BASE",
      assumptions: [
        { key: "wacc", value: "800", unit: "BASIS_POINTS", kind: "ASSUMPTION", source: "test-fixture" },
        { key: "terminalGrowth", value: "250", unit: "BASIS_POINTS", kind: "ASSUMPTION", source: "test-fixture" },
      ],
    };
    const inputs: DcfInputs = {
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
    const outcome = discountedCashFlow({ seed: seed("COMPANY"), assumptions, inputs, currency: "USD" });
    expect(outcome.provenance.calculationVersion).toBe(VALUATION_ENGINE_VERSION);
  });

  it("records the LBO-engine version on a levered model", () => {
    const assumptions: ValuationAssumptionSet = {
      modelId: "LBO_VERSION_1",
      version: 1,
      authoredBy: "principal:test",
      authoredAt: "2026-01-01T00:00:00.000Z",
      scenarioKind: "BASE",
      assumptions: [{ key: "entryMultiple", value: "5", unit: "MULTIPLE", kind: "ASSUMPTION", source: "test-fixture" }],
    };
    const model: LboModel = {
      seed: seed("DEAL"),
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
    };
    const sourcesAndUses = buildSourcesAndUses({
      transaction: model.transaction,
      debt: model.debt,
      entryEbitdaMinor: model.transaction.entryEbitdaMinor,
    });
    expect(sourcesAndUses.imbalanceMinor).toBe(0);
    const outcome = runLboModel(model);
    expect(outcome.kind).toBe("VALUE");
    expect(outcome.provenance.calculationVersion).toBe(LBO_ENGINE_VERSION);
  });

  it("records the entrusted-capital version on a fiduciary report", () => {
    const portfolio = aggregateCapitalPortfolio({
      arrangements: [
        {
          id: "ARR_1",
          instrument: "MANAGED_CAPITAL",
          legalEntityId: "ENT_BEYU",
          providerPartyId: "PARTY_LP_1",
          currency: "USD",
          commitmentMinor: 500_000_000,
          drawnMinor: 300_000_000,
          restrictions: [],
          purpose: "managed mandate",
          maturityDate: null,
          repayable: false,
          status: "ACTIVE",
          approvalRef: "APR_1",
          fiduciaryRestrictions: [],
        },
      ],
      reportingCurrency: "USD",
    });
    const outcome = fiduciaryReport({
      seed: seed("PORTFOLIO"),
      portfolio,
      returnsPayableMinor: 18_000_000,
      managementFeesEarnedMinor: 3_000_000,
      period: "FY2025",
    });
    expect(outcome.provenance.calculationVersion).toBe(ENTRUSTED_CAPITAL_VERSION);
  });

  it("records the pricing-engine version on a markup/margin outcome", () => {
    const outcome = pricedMarginOutcome({
      seed: seed("UNIT"),
      costMinor: 100,
      priceMinor: 125,
      currency: "USD",
      period: "FY2025",
    });
    expect(outcome.provenance.calculationVersion).toBe(PRICING_ENGINE_VERSION);
    expect(valueOrNull(outcome)?.markup).toBe(2_500); // 25% markup = 2500 bps
    expect(valueOrNull(outcome)?.margin).toBe(2_000); // 20% margin = 2000 bps
  });

  it("records the compensation-engine version on an allowance", () => {
    const outcome = calculateAllowance({
      seed: seed("CONTRACT"),
      policy: {
        id: "POL_HOUSING_1",
        version: 1,
        type: "HOUSING",
        frequency: "MONTHLY",
        standardAmountMinor: 150_000,
        monthlyCeilingMinor: 200_000,
        currency: "USD",
        approved: true,
        approvalRef: "APR_1",
        policyStatement: "Housing allowance for eligible grades.",
      },
      currency: "USD",
    });
    expect(outcome.provenance.calculationVersion).toBe(COMPENSATION_ENGINE_VERSION);
  });
});
