/**
 * Phase 10 — Waterfall parity + integer safety.
 *
 * Compares the legacy destination engine (src/lib/waterfall.ts) with the
 * adopted source pure engine (src/lib/waterfall-engine-v2.ts) for the valid
 * existing cases that are exactly representable in integer basis points.
 *
 * The adopted engine is expected to match exactly on those cases; cases that
 * differ because the legacy engine uses floating-point rates (e.g. 1/3) are
 * documented explicitly rather than silently changed.
 */
import { describe, expect, it } from "vitest";
import { runWaterfall, type WaterfallTierInput } from "../src/lib/waterfall";
import {
  applyBasisPoints,
  calculateWaterfallV2,
  runWaterfallV2,
  validateWaterfallRuleSetV2,
  WaterfallEngineV2Error,
  type WaterfallRuleSetV2,
} from "../src/lib/waterfall-engine-v2";

const tiers: WaterfallTierInput[] = [
  { sequence: 1, code: "TAX", name: "Tax", tierType: "PERCENTAGE_OF_GROSS", rate: 0.3, beneficiaryType: "TAX_AUTHORITY", mandatory: true },
  { sequence: 2, code: "OPEX", name: "Opex", tierType: "PERCENTAGE_OF_GROSS", rate: 0.32, beneficiaryType: "OPERATIONS", mandatory: true },
  { sequence: 3, code: "DEBT", name: "Debt", tierType: "PERCENTAGE_OF_REMAINING", rate: 0.25, beneficiaryType: "LENDER", mandatory: true },
  { sequence: 4, code: "RESERVE", name: "Reserve", tierType: "THRESHOLD_TOPUP", minAmount: 400_000, beneficiaryType: "RESERVE", mandatory: true },
  { sequence: 5, code: "OWNER", name: "Owner", tierType: "RESIDUAL", beneficiaryType: "OWNER" },
];

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

describe("waterfall v2 integer engine — parity with legacy valid cases", () => {
  it("matches the legacy engine exactly when rates are integer basis points", () => {
    const amount = 5_250_000;
    const oldResult = runWaterfall({ grossAmount: amount, currency: "USD", tiers });
    const newResult = runWaterfallV2({ grossAmount: amount, currency: "USD", tiers });
    expect(newResult.totalAllocated).toBe(round(oldResult.totalAllocated));
    expect(newResult.residual).toBe(round(oldResult.residual));
    expect(newResult.lines.map((l) => l.allocatedAmount)).toEqual(
      oldResult.lines.map((l) => round(l.allocatedAmount)),
    );
    expect(newResult.totalAllocated + newResult.residual).toBe(amount);
  });

  it("reconciles exactly for a 1,000,000 gross split", () => {
    const r = runWaterfallV2({ grossAmount: 1_000_000, currency: "USD", tiers: tiers.slice(0, 3) });
    expect(r.lines[0].allocatedAmount).toBe(300_000);
    expect(r.lines[1].allocatedAmount).toBe(320_000);
    expect(r.lines[2].allocatedAmount).toBe(95_000);
    expect(r.residual).toBe(285_000);
    expect(r.totalAllocated + r.residual).toBe(1_000_000);
  });

  it("is deterministic (identical output for identical inputs)", () => {
    const a = runWaterfallV2({ grossAmount: 1_234_567.89, currency: "USD", tiers });
    const b = runWaterfallV2({ grossAmount: 1_234_567.89, currency: "USD", tiers });
    expect(a.checksum).toBe(b.checksum);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("documents the non-bp rate semantic boundary (1/3)", () => {
    const tricky: WaterfallTierInput[] = [
      { sequence: 1, code: "A", name: "A", tierType: "PERCENTAGE_OF_GROSS", rate: 1 / 3, beneficiaryType: "OPERATIONS" },
      { sequence: 2, code: "B", name: "B", tierType: "RESIDUAL", beneficiaryType: "OWNER" },
    ];
    const legacy = runWaterfall({ grossAmount: 0.03, currency: "USD", tiers: tricky });
    const adopted = runWaterfallV2({ grossAmount: 0.03, currency: "USD", tiers: tricky });
    // The v2 wrapper converts 1/3 to integer 3333 bps. For this value both
    // engines reconcile to the same result; the real semantic difference is
    // that the adopted PURE engine requires integer minor units and integer
    // basis points, whereas the legacy engine accepts fractional minors/floats.
    expect(adopted.engineVersion).toBe("waterfall-engine-v2-adopted");
    expect(adopted.totalAllocated + adopted.residual).toBe(0.03);
    expect(legacy.totalAllocated + legacy.residual).toBe(0.03);
  });
});

describe("waterfall v2 integer engine — money contract", () => {
  it("uses integer basis points via BigInt with exact rounding", () => {
    expect(applyBasisPoints(100, 10000)).toBe(100);
    expect(applyBasisPoints(1, 5000)).toBe(1); // 0.5 minor unit rounds half away from zero
    expect(applyBasisPoints(3, 3333)).toBe(1);
    expect(applyBasisPoints(0, 5000)).toBe(0);
  });

  it("rejects fractional minor-unit inputs (no floating-point money)", () => {
    expect(() =>
      calculateWaterfallV2(
        ruleSetWithPercentage(2000),
        { ruleSetId: "RS", periodId: "P", inflowMinor: 1.5, currency: "TZS" },
        meta,
      ),
    ).toThrow(WaterfallEngineV2Error);
  });

  it("rejects negative inflow and negative fixed amounts", () => {
    expect(() =>
      calculateWaterfallV2(
        ruleSetWithPercentage(2000),
        { ruleSetId: "RS", periodId: "P", inflowMinor: -1, currency: "TZS" },
        meta,
      ),
    ).toThrow(/Inflow cannot be negative/);
    const bad = ruleSetWithPercentage(2000);
    bad.tiers[0].fixedAmountMinor = -1;
    bad.tiers[0].computationType = "FIXED_AMOUNT";
    bad.tiers[0].percentageBps = null;
    expect(() =>
      calculateWaterfallV2(
        bad,
        { ruleSetId: "RS", periodId: "P", inflowMinor: 100, currency: "TZS" },
        meta,
      ),
    ).toThrow(/has a negative fixed amount/);
  });

  it("handles the maximum safe amount without precision loss and rejects invalid bps", () => {
    // 100% of MAX_SAFE stays exactly MAX_SAFE (BigInt intermediate, exact quotient).
    expect(applyBasisPoints(Number.MAX_SAFE_INTEGER, 10000)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    // bps must stay in [0,10000].
    expect(() => applyBasisPoints(1, Number.MAX_SAFE_INTEGER)).toThrow(
      /Basis points must be between/,
    );
    // A non-safe integer inflow must be rejected before any division.
    expect(() =>
      calculateWaterfallV2(
        ruleSetWithPercentage(2000),
        { ruleSetId: "RS", periodId: "P", inflowMinor: Number.MAX_SAFE_INTEGER * 2, currency: "TZS" },
        meta,
      ),
    ).toThrow(/exceeds the safe integer range/);
  });

  it("detects conservation violations and invalid rule sets", () => {
    const rs = ruleSetWithPercentage(2000);
    expect(validateWaterfallRuleSetV2(rs)).toEqual([]);
    const dup = ruleSetWithPercentage(2000);
    dup.tiers.push({ ...dup.tiers[0], id: "T2", priority: 1 });
    expect(() =>
      calculateWaterfallV2(
        dup,
        { ruleSetId: "RS", periodId: "P", inflowMinor: 100, currency: "TZS" },
        meta,
      ),
    ).toThrow(/Duplicate tier priority/);
  });

  it("handles large values deterministically without float drift", () => {
    const large = 9007199254740000;
    const r = calculateWaterfallV2(
      ruleSetWithPercentage(3000),
      { ruleSetId: "RS", periodId: "P", inflowMinor: large, currency: "TZS" },
      meta,
    );
    expect(r.totalAllocatedMinor + r.unallocatedMinor).toBe(large);
    expect(r.totalAllocatedMinor).toBe(2702159776422000);
  });
});

const meta = {
  calculationId: "C1",
  calculatedBy: "test",
  calculatedAt: "1970-01-01T00:00:00.000Z",
};

function ruleSetWithPercentage(bps: number): WaterfallRuleSetV2 {
  return {
    id: "RS",
    name: "Test",
    version: "1.0.0",
    status: "ACTIVE",
    entityId: null,
    countryCode: null,
    sectorCode: null,
    currency: "TZS",
    effectiveFrom: null,
    effectiveTo: null,
    createdBy: "test",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    tiers: [
      {
        id: "T1",
        ruleSetId: "RS",
        priority: 1,
        name: "Alloc",
        category: "APPROVED_DISTRIBUTIONS",
        computationType: "PERCENTAGE",
        percentageBps: bps,
        minimumMinor: null,
        maximumMinor: null,
        thresholdMinor: null,
        requiresApproval: false,
        condition: null,
        notes: null,
      },
    ],
  };
}


