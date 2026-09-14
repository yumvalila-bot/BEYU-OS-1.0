/**
 * FOUNDER EQUITY ENGINE — pure deterministic model tests (X10THINK §8–§14).
 *
 * No database, no mocks: these assertions pin the ENGINE behaviour that the
 * governed service persists. Properties under test:
 *   - determinism (same inputs → byte-identical outputs);
 *   - the default 48/12/monthly founder schedule as a configurable default;
 *   - cliff + frequency milestone arithmetic that reconciles exactly at the end;
 *   - double-trigger-by-default change-of-control acceleration;
 *   - narrow good/bad leaver vocabularies with refusal of mismatches and of
 *     arbitrary forfeiture conditions (§10);
 *   - exact-decimal repurchase totals (money is never float);
 *   - cap-table aggregation incl. voting vs economic split, pool/treasury/
 *     cancelled handling and fully-diluted shares (§13);
 *   - dilution pre → transaction → post analysis that never executes (§14).
 */

import { describe, expect, it } from "vitest";
import {
  ACCELERATION_POLICIES,
  BAD_LEAVER_CONDITIONS,
  DEFAULT_ACCELERATION_POLICY,
  DEFAULT_BAD_LEAVER_POLICY,
  DEFAULT_FOUNDER_VESTING,
  DEFAULT_GOOD_LEAVER_POLICY,
  GOOD_LEAVER_CONDITIONS,
  EquityModelError,
  addMonthsUtc,
  assertIsoDate,
  computeAcceleration,
  computeCapTable,
  computeDilution,
  computeLeaverOutcome,
  computeVesting,
  monthsBetweenUtc,
  vestingMilestones,
  type VestingTerms,
} from "../../src/lib/equity/model";

function terms(overrides: Partial<VestingTerms> = {}): VestingTerms {
  return {
    totalShares: 1_000_000,
    vestingMonths: 48,
    cliffMonths: 12,
    frequency: "MONTHLY",
    startDate: "2024-01-01",
    ...overrides,
  };
}

describe("UTC date primitives are calendar-exact and deterministic", () => {
  it("adds whole months in UTC (month-end safe)", () => {
    expect(addMonthsUtc("2024-01-31", 1)).toBe("2024-02-29"); // leap year clamp
    expect(addMonthsUtc("2024-01-01", 12)).toBe("2025-01-01");
    expect(addMonthsUtc("2024-01-01", 48)).toBe("2028-01-01");
  });

  it("counts whole months between dates", () => {
    expect(monthsBetweenUtc("2024-01-01", "2025-01-01")).toBe(12);
    expect(monthsBetweenUtc("2024-01-01", "2024-12-31")).toBe(11);
    expect(monthsBetweenUtc("2025-01-01", "2024-01-01")).toBe(-12);
  });

  it("refuses non-ISO dates", () => {
    expect(() => assertIsoDate("01/02/2024", "d")).toThrow(EquityModelError);
    expect(() => assertIsoDate("2024-13-01", "d")).toThrow(EquityModelError);
  });
});

describe("§9 — vesting: default 48/12/monthly is a CONFIGURABLE default candidate", () => {
  it("exposes the default terms candidate (not hard-coded law)", () => {
    expect(DEFAULT_FOUNDER_VESTING).toEqual({ vestingMonths: 48, cliffMonths: 12, frequency: "MONTHLY" });
  });

  it("vests nothing before the cliff", () => {
    const state = computeVesting(terms(), "2024-11-30");
    expect(state.vestedShares).toBe(0);
    expect(state.vestedMonths).toBe(0);
    expect(state.completed).toBe(false);
    expect(state.nextMilestoneDate).toBe("2025-01-01"); // cliff date
  });

  it("vests the cumulative cliff accrual exactly at the cliff", () => {
    const state = computeVesting(terms(), "2025-01-01");
    expect(state.vestedMonths).toBe(12);
    expect(state.vestedShares).toBe(250_000); // 12/48 of 1,000,000
    expect(state.unvestedShares).toBe(750_000);
  });

  it("accrues monthly after the cliff and completes exactly at 48 months", () => {
    const at25 = computeVesting(terms(), "2026-02-01"); // 25 months elapsed
    expect(at25.vestedMonths).toBe(25);
    expect(at25.vestedShares).toBe(Math.floor((1_000_000 * 25) / 48));

    const done = computeVesting(terms(), "2028-01-01");
    expect(done.completed).toBe(true);
    expect(done.vestedShares).toBe(1_000_000); // no rounding residue at completion
    expect(done.unvestedShares).toBe(0);
    expect(done.nextMilestoneDate).toBeNull();
  });

  it("honours QUARTERLY and ANNUAL frequencies after the cliff", () => {
    const q = computeVesting(terms({ frequency: "QUARTERLY" }), "2025-03-01"); // 14 months: 12 + floor(2/3)*3 = 12
    expect(q.vestedMonths).toBe(12);
    const q2 = computeVesting(terms({ frequency: "QUARTERLY" }), "2025-04-01"); // 15 months → 12+3
    expect(q2.vestedMonths).toBe(15);

    const a = computeVesting(terms({ frequency: "ANNUAL" }), "2026-01-01"); // 24 months → 12 + 12
    expect(a.vestedMonths).toBe(24);
    const a2 = computeVesting(terms({ frequency: "ANNUAL" }), "2026-06-01"); // 29 months → still 24
    expect(a2.vestedMonths).toBe(24);
  });

  it("supports lawfully different terms (no cliff, short schedule) — configurable, not fixed", () => {
    const noCliff = computeVesting(terms({ cliffMonths: 0, vestingMonths: 24 }), "2024-07-01");
    expect(noCliff.vestedMonths).toBe(6);
    expect(noCliff.vestedShares).toBe(250_000);
  });

  it("rejects invalid terms fail-closed", () => {
    expect(() => computeVesting(terms({ cliffMonths: 60 }), "2025-01-01")).toThrow(EquityModelError); // cliff > vesting
    expect(() => computeVesting(terms({ vestingMonths: 0 }), "2025-01-01")).toThrow(EquityModelError);
    expect(() => computeVesting(terms({ totalShares: -1 }), "2025-01-01")).toThrow(EquityModelError);
    expect(() => computeVesting(terms({ totalShares: 10.5 }), "2025-01-01")).toThrow(EquityModelError);
  });

  it("is deterministic: identical inputs produce identical states", () => {
    const a = computeVesting(terms(), "2026-05-15");
    const b = computeVesting(terms(), "2026-05-15");
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("milestones reconcile exactly: Σ deltas = totalShares", () => {
    const t = terms();
    const ms = vestingMilestones(t, "2024-01-01", "2028-01-01");
    expect(ms.length).toBeGreaterThan(0);
    const sum = ms.reduce((s, m) => s + m.vestedShares, 0);
    expect(sum).toBe(t.totalShares);
    expect(ms[ms.length - 1].cumulativeVestedShares).toBe(t.totalShares);
    // first milestone is the cliff with the full cliff accrual
    expect(ms[0].date).toBe("2025-01-01");
    expect(ms[0].vestedShares).toBe(250_000);
  });

  it("milestones are idempotent: re-running to the same date yields nothing new", () => {
    const t = terms();
    const first = vestingMilestones(t, "2024-01-01", "2026-01-01");
    const again = vestingMilestones(t, "2026-01-01", "2026-01-01");
    expect(first.length).toBeGreaterThan(0);
    expect(again).toEqual([]);
  });
});

describe("§12 — change-of-control acceleration defaults to DOUBLE TRIGGER", () => {
  it("declares the default policy and the closed policy vocabulary", () => {
    expect(DEFAULT_ACCELERATION_POLICY).toBe("DOUBLE_TRIGGER");
    expect([...ACCELERATION_POLICIES]).toEqual(["NONE", "SINGLE_TRIGGER", "DOUBLE_TRIGGER", "PARTIAL_DOUBLE_TRIGGER"]);
  });

  it("DOUBLE_TRIGGER: CoC alone accelerates NOTHING", () => {
    const out = computeAcceleration({ policy: "DOUBLE_TRIGGER", unvestedShares: 500_000, changeOfControlDeclared: true, qualifyingTermination: false });
    expect(out.acceleratedShares).toBe(0);
    expect(out.remainingUnvestedShares).toBe(500_000);
    expect(out.triggersSatisfied).toBe(false);
  });

  it("DOUBLE_TRIGGER: qualifying termination alone accelerates NOTHING", () => {
    const out = computeAcceleration({ policy: "DOUBLE_TRIGGER", unvestedShares: 500_000, changeOfControlDeclared: false, qualifyingTermination: true });
    expect(out.acceleratedShares).toBe(0);
    expect(out.triggersSatisfied).toBe(false);
  });

  it("DOUBLE_TRIGGER: BOTH triggers accelerate 100% of unvested", () => {
    const out = computeAcceleration({ policy: "DOUBLE_TRIGGER", unvestedShares: 500_000, changeOfControlDeclared: true, qualifyingTermination: true });
    expect(out.acceleratedShares).toBe(500_000);
    expect(out.remainingUnvestedShares).toBe(0);
    expect(out.triggersSatisfied).toBe(true);
  });

  it("SINGLE_TRIGGER: CoC alone is sufficient", () => {
    const out = computeAcceleration({ policy: "SINGLE_TRIGGER", unvestedShares: 400_000, changeOfControlDeclared: true, qualifyingTermination: false });
    expect(out.acceleratedShares).toBe(400_000);
  });

  it("NONE never accelerates, even with both triggers", () => {
    const out = computeAcceleration({ policy: "NONE", unvestedShares: 400_000, changeOfControlDeclared: true, qualifyingTermination: true });
    expect(out.acceleratedShares).toBe(0);
    expect(out.triggersSatisfied).toBe(false);
  });

  it("PARTIAL_DOUBLE_TRIGGER applies the recorded percentage in millionths, floor-exact", () => {
    const out = computeAcceleration({
      policy: "PARTIAL_DOUBLE_TRIGGER",
      pctMillionths: 500_000, // 50%
      unvestedShares: 333_333,
      changeOfControlDeclared: true,
      qualifyingTermination: true,
    });
    expect(out.acceleratedShares).toBe(166_666); // floor(333333 * 0.5)
    expect(out.remainingUnvestedShares).toBe(166_667);
  });

  it("PARTIAL requires a valid percentage and refuses out-of-range values", () => {
    expect(() =>
      computeAcceleration({ policy: "PARTIAL_DOUBLE_TRIGGER", pctMillionths: null, unvestedShares: 10, changeOfControlDeclared: true, qualifyingTermination: true }),
    ).toThrow(EquityModelError);
    expect(() =>
      computeAcceleration({ policy: "PARTIAL_DOUBLE_TRIGGER", pctMillionths: 1_000_001, unvestedShares: 10, changeOfControlDeclared: true, qualifyingTermination: true }),
    ).toThrow(EquityModelError);
  });

  it("refuses unknown policies", () => {
    expect(() =>
      computeAcceleration({ policy: "TRIPLE_TRIGGER" as never, unvestedShares: 10, changeOfControlDeclared: true, qualifyingTermination: true }),
    ).toThrow(EquityModelError);
  });
});

describe("§10 — leaver outcomes: narrow vocabularies, refusal of arbitrary forfeiture, exact decimals", () => {
  it("good/bad condition vocabularies are closed and disjoint", () => {
    expect(GOOD_LEAVER_CONDITIONS).toContain("DEATH");
    expect(GOOD_LEAVER_CONDITIONS).toContain("DISABILITY");
    expect(BAD_LEAVER_CONDITIONS).toContain("FRAUD");
    const overlap = (GOOD_LEAVER_CONDITIONS as readonly string[]).filter((c) => (BAD_LEAVER_CONDITIONS as readonly string[]).includes(c));
    expect(overlap).toEqual([]);
  });

  it("REFUSES an arbitrary/unknown condition code (no software-discretion forfeiture)", () => {
    expect(() =>
      computeLeaverOutcome({ caseType: "BAD_LEAVER", conditionCode: "CEO_DISLIKED_THEM", vestedShares: 100, unvestedShares: 100 }),
    ).toThrow(/not in the governed candidate vocabulary/);
  });

  it("REFUSES a good-leaver condition on a BAD_LEAVER case and vice versa", () => {
    expect(() =>
      computeLeaverOutcome({ caseType: "BAD_LEAVER", conditionCode: "RETIREMENT", vestedShares: 100, unvestedShares: 0 }),
    ).toThrow(/CONDITION_CASE_MISMATCH|GOOD_LEAVER candidate/);
    expect(() =>
      computeLeaverOutcome({ caseType: "GOOD_LEAVER", conditionCode: "FRAUD", vestedShares: 100, unvestedShares: 0 }),
    ).toThrow(/BAD_LEAVER candidate/);
  });

  it("default GOOD_LEAVER treatment: vested RETAINED, unvested forfeited", () => {
    const out = computeLeaverOutcome({ caseType: "GOOD_LEAVER", conditionCode: "DEATH", vestedShares: 600_000, unvestedShares: 400_000 });
    expect(out.policy).toEqual(DEFAULT_GOOD_LEAVER_POLICY);
    expect(out.retainedShares).toBe(600_000);
    expect(out.forfeitedShares).toBe(400_000);
    expect(out.repurchaseShares).toBe(0);
    expect(out.repurchaseTotal).toBeNull();
    expect(out.requiresLegalReview).toBe(true);
  });

  it("default BAD_LEAVER treatment repurchases vested at the LOWER of cost and FMV — exactly", () => {
    const out = computeLeaverOutcome({
      caseType: "BAD_LEAVER",
      conditionCode: "FRAUD",
      vestedShares: 250_000,
      unvestedShares: 750_000,
      costPricePerShare: "0.0001",
      fmvPricePerShare: "12.345678",
    });
    expect(out.policy).toEqual(DEFAULT_BAD_LEAVER_POLICY);
    expect(out.repurchaseShares).toBe(250_000);
    expect(out.repurchasePricePerShare).toBe("0.0001");
    // exact fixed-point decimal: 250000 × 0.0001 = 25 — never 24.999999…
    expect(out.repurchaseTotal).toBe("25");
    expect(out.forfeitedShares).toBe(750_000);
  });

  it("FMV is chosen when FMV < cost under LOWER_OF treatment", () => {
    const out = computeLeaverOutcome({
      caseType: "BAD_LEAVER",
      conditionCode: "SERIOUS_MISCONDUCT",
      vestedShares: 1_000,
      unvestedShares: 0,
      costPricePerShare: "10.5",
      fmvPricePerShare: "3.25",
    });
    expect(out.repurchasePricePerShare).toBe("3.25");
    expect(out.repurchaseTotal).toBe("3250");
  });

  it("repurchase totals are exact decimals (no float dust) for awkward prices", () => {
    const out = computeLeaverOutcome({
      caseType: "GOOD_LEAVER",
      conditionCode: "MUTUAL_AGREEMENT",
      vestedShares: 333_333,
      unvestedShares: 0,
      policy: { vested: "REPURCHASE_AT_FMV", unvested: "FORFEIT" },
      fmvPricePerShare: "0.07",
    });
    // 333333 × 0.07 = 23333.31 exactly (float would give 23333.309999…)
    expect(out.repurchaseTotal).toBe("23333.31");
  });

  it("leaves the total NULL when the required price evidence is missing — never guesses a valuation", () => {
    const out = computeLeaverOutcome({
      caseType: "GOOD_LEAVER",
      conditionCode: "RETIREMENT",
      vestedShares: 100,
      unvestedShares: 0,
      policy: { vested: "REPURCHASE_AT_FMV", unvested: "FORFEIT" },
      fmvPricePerShare: null,
    });
    expect(out.repurchaseTotal).toBeNull();
    expect(out.repurchasePricePerShare).toBeNull();
    expect(out.notes.join(" ")).toMatch(/until valuation evidence is recorded/);
  });

  it("VEST_ACCELERATED and RETAIN_UNVESTED unvested treatments keep shares with the holder", () => {
    const accel = computeLeaverOutcome({
      caseType: "GOOD_LEAVER",
      conditionCode: "DISABILITY",
      vestedShares: 100,
      unvestedShares: 50,
      policy: { vested: "RETAIN", unvested: "VEST_ACCELERATED" },
    });
    expect(accel.retainedShares).toBe(150);
    expect(accel.forfeitedShares).toBe(0);

    const retain = computeLeaverOutcome({
      caseType: "GOOD_LEAVER",
      conditionCode: "DISABILITY",
      vestedShares: 100,
      unvestedShares: 50,
      policy: { vested: "RETAIN", unvested: "RETAIN_UNVESTED" },
    });
    expect(retain.retainedShares).toBe(150);
    expect(retain.forfeitedShares).toBe(0);
  });

  it("every outcome carries requiresLegalReview = true — the engine never declares legal certainty (§48)", () => {
    for (const caseType of ["GOOD_LEAVER", "BAD_LEAVER"] as const) {
      const code = caseType === "GOOD_LEAVER" ? "DEATH" : "FRAUD";
      const out = computeLeaverOutcome({ caseType, conditionCode: code, vestedShares: 10, unvestedShares: 10 });
      expect(out.requiresLegalReview).toBe(true);
    }
  });

  it("refuses invalid share counts fail-closed", () => {
    expect(() => computeLeaverOutcome({ caseType: "GOOD_LEAVER", conditionCode: "DEATH", vestedShares: -1, unvestedShares: 0 })).toThrow(EquityModelError);
    expect(() => computeLeaverOutcome({ caseType: "GOOD_LEAVER", conditionCode: "DEATH", vestedShares: 1.5, unvestedShares: 0 })).toThrow(EquityModelError);
  });
});

describe("§13 — cap-table computation is financing-grade and reconstructable", () => {
  const shareClasses = [
    { shareClassId: "SC1", code: "ORD", authorizedShares: 10_000_000, issuedShares: 9_000_000, votesPerShare: "1" },
    { shareClassId: "SC2", code: "PREF-A", authorizedShares: 2_000_000, issuedShares: 1_000_000, votesPerShare: "0" },
  ];

  function pos(id: string, holderType: string, shareClassId: string, code: string, totalShares: number, vestedShares: number, status = "ACTIVE", votesPerShare = "1") {
    return {
      positionId: id,
      holderType,
      holderName: id,
      shareClassId,
      shareClassCode: code,
      votesPerShare,
      totalShares,
      vestedShares,
      unvestedShares: totalShares - vestedShares,
      status,
    };
  }

  it("aggregates outstanding, vested/unvested, pool, treasury and fully-diluted shares", () => {
    const cap = computeCapTable({
      shareClasses,
      positions: [
        pos("P1", "FOUNDER", "SC1", "ORD", 5_000_000, 2_000_000),
        pos("P2", "INVESTOR", "SC2", "PREF-A", 1_000_000, 1_000_000, "ACTIVE", "0"),
        pos("P3", "ESOP_POOL", "SC1", "ORD", 1_500_000, 0),
        pos("P4", "TREASURY", "SC1", "ORD", 500_000, 0),
        pos("P5", "EMPLOYEE", "SC1", "ORD", 1_000_000, 1_000_000, "FULLY_VESTED"),
        // an EXECUTED forfeiture zeroes the position row; the ledger carries the total
        pos("P6", "FOUNDER", "SC1", "ORD", 0, 0, "FORFEITED"),
      ],
      plans: [{ planId: "PL1", poolSharesAuthorized: 2_000_000, poolSharesIssued: 1_500_000, status: "ACTIVE" }],
      grants: [
        { grantId: "G1", holderName: "E1", optionShares: 100_000, exercisedShares: 0, status: "APPROVED" },
        { grantId: "G2", holderName: "E2", optionShares: 50_000, exercisedShares: 50_000, status: "EXERCISED" },
        { grantId: "G3", holderName: "E3", optionShares: 25_000, exercisedShares: 0, status: "TERMINATED" },
      ],
      ledgerCancelledShares: 100_000,
    });

    expect(cap.authorizedShares).toBe(12_000_000);
    expect(cap.issuedShares).toBe(10_000_000);
    // outstanding excludes pool, treasury and the forfeited position
    expect(cap.outstandingShares).toBe(7_000_000);
    expect(cap.vestedShares).toBe(4_000_000);
    expect(cap.unvestedShares).toBe(3_000_000);
    expect(cap.esopPoolShares).toBe(1_500_000);
    expect(cap.treasuryShares).toBe(500_000);
    expect(cap.cancelledShares).toBe(100_000); // reconstruction comes from the ledger, not zeroed rows
    expect(cap.esopGrantedShares).toBe(100_000); // only the outstanding grant counts
    expect(cap.optionsOutstanding).toBe(100_000);
    // fully diluted = outstanding + pool(max pos,issued) + options outstanding + unallocated authorized pool
    expect(cap.fullyDilutedShares).toBe(7_000_000 + 1_500_000 + 100_000 + 500_000);
  });

  it("splits voting vs economic percentages and excludes non-voting classes from votes", () => {
    const cap = computeCapTable({
      shareClasses,
      positions: [
        pos("P1", "FOUNDER", "SC1", "ORD", 6_000_000, 6_000_000),
        pos("P2", "INVESTOR", "SC2", "PREF-A", 2_000_000, 2_000_000, "ACTIVE", "0"),
      ],
      plans: [],
      grants: [],
    });
    const founder = cap.breakdown.holders.find((h) => h.holderName === "P1")!;
    const investor = cap.breakdown.holders.find((h) => h.holderName === "P2")!;
    expect(founder.votingPct).toBe("100"); // all votes are ordinary
    expect(founder.economicPct).toBe("75");
    expect(investor.votingPct).toBe("0");
    expect(investor.economicPct).toBe("25");
    expect(cap.breakdown.byHolderType.FOUNDER.totalShares).toBe(6_000_000);
  });

  it("percentages are 6-decimal deterministic strings (same input → same string)", () => {
    const input = {
      shareClasses: [{ shareClassId: "SC1", code: "ORD", authorizedShares: 3, issuedShares: 3, votesPerShare: "1" }],
      positions: [pos("A", "FOUNDER", "SC1", "ORD", 1, 1), pos("B", "FOUNDER", "SC1", "ORD", 2, 2)],
      plans: [],
      grants: [],
    };
    const one = computeCapTable(input);
    const two = computeCapTable(input);
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    const a = one.breakdown.holders.find((h) => h.holderName === "A")!;
    expect(a.economicPct).toBe("33.333333"); // one division, one round — 1/3 of 100
  });

  it("fractional votes-per-share compute exactly (4-decimal fixed point)", () => {
    const cap = computeCapTable({
      shareClasses: [{ shareClassId: "SC1", code: "ORD", authorizedShares: 100, issuedShares: 100, votesPerShare: "0.0001" }],
      positions: [pos("A", "FOUNDER", "SC1", "ORD", 30_000, 30_000, "ACTIVE", "0.0001"), pos("B", "FOUNDER", "SC1", "ORD", 70_000, 70_000, "ACTIVE", "0.0001")],
      plans: [],
      grants: [],
    });
    // 30000 × 0.0001 = 3 votes, 70000 × 0.0001 = 7 votes → A holds 30% of votes
    const a = cap.breakdown.holders.find((h) => h.holderName === "A")!;
    expect(a.votingPct).toBe("30");
    expect(a.economicPct).toBe("30");
  });
});

describe("§14 — dilution analysis: pre → transaction → post, NEVER executes", () => {
  const base = {
    holdings: [
      { holder: "F1", group: "FOUNDER", shares: 6_000_000 },
      { holder: "I1", group: "INVESTOR", shares: 3_000_000 },
      { holder: "POOL", group: "ESOP_POOL", shares: 1_000_000 },
    ],
    optionsOutstanding: 500_000,
    poolUnallocated: 500_000,
  };

  it("computes pre and post fully-diluted totals and per-holder dilution deltas", () => {
    const out = computeDilution({
      ...base,
      transactions: [{ type: "NEW_ISSUANCE", toHolder: "I2", toGroup: "INVESTOR", shares: 2_000_000 }],
    });
    expect(out.pre.fullyDilutedShares).toBe(11_000_000);
    expect(out.post.fullyDilutedShares).toBe(13_000_000);
    const f1 = out.deltas.find((d) => d.holder === "F1")!;
    expect(f1.prePct).toBe("54.545455"); // 6/11
    expect(f1.postPct).toBe("46.153846"); // 6/13
    expect(f1.dilutionPctPoints).not.toBeNull();
    const i2 = out.deltas.find((d) => d.holder === "I2")!;
    expect(i2.prePct).toBe("0"); // new holder: 0% pre, real % post
    expect(i2.postPct).toBe("15.384615");
  });

  it("ESOP_POOL_EXPANSION grows the unallocated pool (dilutes everyone) without issuing shares", () => {
    const out = computeDilution({ ...base, transactions: [{ type: "ESOP_POOL_EXPANSION", shares: 1_000_000 }] });
    expect(out.post.poolUnallocated).toBe(1_500_000);
    expect(out.post.fullyDilutedShares).toBe(12_000_000);
    expect(out.post.holdings.find((h) => h.holder === "POOL")!.shares).toBe(1_000_000);
  });

  it("OPTION_EXERCISE moves shares from outstanding options into holdings, FD-neutral", () => {
    const out = computeDilution({
      ...base,
      transactions: [{ type: "OPTION_EXERCISE", holder: "E1", group: "EMPLOYEE", shares: 200_000 }],
    });
    expect(out.post.optionsOutstanding).toBe(300_000);
    expect(out.post.fullyDilutedShares).toBe(11_000_000); // exercise is FD-neutral
    expect(out.post.holdings.find((h) => h.holder === "E1")!.shares).toBe(200_000);
  });

  it("OPTION_EXERCISE beyond outstanding options is refused", () => {
    expect(() =>
      computeDilution({ ...base, transactions: [{ type: "OPTION_EXERCISE", holder: "E1", group: "EMPLOYEE", shares: 500_001 }] }),
    ).toThrow(/exceeds outstanding options/);
  });

  it("SECONDARY_TRANSFER is ownership-neutral in total shares and refuses negative results", () => {
    const out = computeDilution({
      ...base,
      transactions: [{ type: "SECONDARY_TRANSFER", fromHolder: "F1", toHolder: "BUYER", group: "FOUNDER", shares: 1_000_000 }],
    });
    expect(out.post.fullyDilutedShares).toBe(out.pre.fullyDilutedShares);
    expect(out.post.holdings.find((h) => h.holder === "F1")!.shares).toBe(5_000_000);
    expect(() =>
      computeDilution({ ...base, transactions: [{ type: "SECONDARY_TRANSFER", fromHolder: "F1", toHolder: "B", group: "FOUNDER", shares: 6_000_001 }] }),
    ).toThrow(/negative/);
  });

  it("refuses non-positive share counts and unknown holders in transfers", () => {
    expect(() => computeDilution({ ...base, transactions: [{ type: "NEW_ISSUANCE", toHolder: "X", toGroup: "INVESTOR", shares: 0 }] })).toThrow(EquityModelError);
    expect(() =>
      computeDilution({ ...base, transactions: [{ type: "SECONDARY_TRANSFER", fromHolder: "GHOST", toHolder: "X", group: "FOUNDER", shares: 10 }] }),
    ).toThrow(/does not exist/);
  });

  it("is deterministic and pure: the input holdings are never mutated", () => {
    const holdings = base.holdings.map((h) => ({ ...h }));
    const snapshot = JSON.stringify(holdings);
    const one = computeDilution({ holdings, optionsOutstanding: base.optionsOutstanding, poolUnallocated: base.poolUnallocated, transactions: [{ type: "NEW_ISSUANCE", toHolder: "I2", toGroup: "INVESTOR", shares: 1_000_000 }] });
    const two = computeDilution({ holdings, optionsOutstanding: base.optionsOutstanding, poolUnallocated: base.poolUnallocated, transactions: [{ type: "NEW_ISSUANCE", toHolder: "I2", toGroup: "INVESTOR", shares: 1_000_000 }] });
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    expect(JSON.stringify(holdings)).toBe(snapshot);
  });
});
