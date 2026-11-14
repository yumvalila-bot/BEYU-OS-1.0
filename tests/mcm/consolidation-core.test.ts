/**
 * MULTI_COMPANY_MANAGEMENT — the consolidation arithmetic, proved without a database.
 *
 * WHY THIS FILE HAS NO FIXTURES. `journal_entries` and `journal_lines` carry
 * `BEFORE UPDATE OR DELETE` triggers that refuse mutation, and several finance
 * suites assert that the ledger is EMPTY while CAP_POSTING is LOCKED
 * (`select count(*) from journal_entries` → 0). A test that committed a ledger row
 * would therefore be permanent AND would break another suite's invariant — which is
 * the self-poisoning-fixture defect already documented in the final report. So the
 * arithmetic is tested where it lives: on a pure function, with figures the test
 * computes itself and states in full.
 *
 * WHAT THE NUMBERS BELOW ARE. Every expected value is written as a literal derived
 * by hand from the inputs, not echoed from the implementation. The three that most
 * deserve the check:
 *
 *   * `1 490 000 000` TZS minor → `59 600 000` USD minor at 0.0004. TZS has
 *     exponent 0 and USD exponent 2, so the answer is `× rate × 100`. An
 *     implementation that forgot the rescale produces `596 000` and still returns
 *     integers, still balances, and still "looks right": that is the bug this
 *     assertion exists to catch, in both directions.
 *   * `−2 300 000` residual. The members' books are balanced (each entry's debits
 *     equal its credits), so a residual is ONLY explainable by income having been
 *     carried at a different rate from the balance sheet. The test recomputes it from
 *     the two rates rather than trusting the engine's own arithmetic.
 *   * `3 150 000` non-controlling interest: 30% of translated equity *including*
 *     the translation difference, i.e. the outside holders carry their share of it.
 *
 * THE ASSERTION THAT IS NOT ABOUT MONEY: the rate lookup records every pair it is
 * asked for and the suite asserts no same-currency pair was ever requested. The core
 * is allowed to know that a currency converts to itself at 1; if it delegated that to
 * the authority it would be asking permission to do arithmetic — and if it invented
 * the answer for a real pair, the test below (`refuses instead of defaulting`) fails.
 */
import { describe, expect, it } from "vitest";
import {
  computeConsolidation,
  complementShare,
  convertMinor,
  minorFromMajorUnits,
  minorFromMinorUnits,
  roundHalfAwayFromZero,
  scaleRate,
  type AccountTotals,
  type IntercompanyInput,
  type MemberInput,
  type RateKind,
  type RateResolution,
} from "@/lib/mcm/consolidation-core";

const accounts = (over: Partial<Record<keyof AccountTotals, string>> = {}): AccountTotals => ({
  ASSET: "0",
  LIABILITY: "0",
  EQUITY: "0",
  REVENUE: "0",
  EXPENSE: "0",
  ...over,
});

type RateTable = Record<string, string>;

/**
 * A rate authority that only ever says what it is told, and that reports which pairs
 * it was asked about — so "it never invented a rate" is an assertion, not a hope.
 */
function makeRates(table: RateTable) {
  const asked: string[] = [];
  const lookup = async (input: { from: string; to: string; kind: RateKind }): Promise<RateResolution> => {
    const key = `${input.from}/${input.to}@${input.kind}`;
    asked.push(key);
    const rate = table[key];
    if (rate === undefined) {
      return {
        ok: false,
        decision: "REQUIRES_AUTHORITY",
        reason: `No governed ${input.from}/${input.to} rate exists for the date. A rate cannot be derived, defaulted or estimated.`,
      };
    }
    return { ok: true, rate, rowIds: [`FX_${key.replaceAll("/", "_")}`] };
  };
  return { lookup, asked };
}

const HOLDING = { id: "LEN_HOLD", code: "BEYU-TZH", functionalCurrency: "TZS", isRootInScope: true };
const AGRI = { id: "LEN_AGRI", code: "BEYU-AGR", functionalCurrency: "TZS", isRootInScope: false };
const FINTECH = { id: "LEN_FIN", code: "BEYU-FIN", functionalCurrency: "TZS", isRootInScope: false };
const PARENT_USD = { id: "LEN_HLD", code: "BEYU-HLD", functionalCurrency: "USD", isRootInScope: true };

function member(
  base: Pick<MemberInput, "id" | "code" | "functionalCurrency" | "isRootInScope">,
  over: Partial<Omit<MemberInput, "id" | "code" | "functionalCurrency" | "isRootInScope">> = {},
): MemberInput {
  return {
    ...base,
    balancesByCurrency: [{ currency: base.functionalCurrency, accounts: accounts() }],
    ownership: [],
    ownershipEvidenceMissing: false,
    ...over,
  };
}

/** The three-member group used across the arithmetic tests, in TZS major-unit ledger strings. */
function groupMembers(over: Partial<Record<string, Partial<MemberInput>>> = {}): MemberInput[] {
  return [
    member({ ...HOLDING }, {
      balancesByCurrency: [
        {
          currency: "TZS",
          accounts: accounts({
            ASSET: "1080000000.00",
            LIABILITY: "400000000.00",
            EQUITY: "500000000.00",
            REVENUE: "300000000.00",
            EXPENSE: "120000000.00",
          }),
        },
      ],
      ...over[HOLDING.id],
    }),
    member({ ...AGRI }, {
      balancesByCurrency: [
        {
          currency: "TZS",
          accounts: accounts({
            ASSET: "350000000.00",
            LIABILITY: "100000000.00",
            EQUITY: "200000000.00",
            REVENUE: "50000000.00",
            EXPENSE: "0.00",
          }),
        },
      ],
      ownership: [{ id: "OWN_AGRI_TZH", ownerEntityId: HOLDING.id, pct: "70.000000", ownershipType: "DIRECT" }],
      ...over[AGRI.id],
    }),
    member({ ...FINTECH }, {
      balancesByCurrency: [
        {
          currency: "TZS",
          accounts: accounts({ ASSET: "60000000.00", EQUITY: "60000000.00" }),
        },
      ],
      ownership: [{ id: "OWN_FIN_TZH", ownerEntityId: HOLDING.id, pct: "100.000000", ownershipType: "DIRECT" }],
      ...over[FINTECH.id],
    }),
  ];
}

function run(over: Partial<Parameters<typeof computeConsolidation>[0]> = {}) {
  return computeConsolidation({
    periodCode: "2031-11",
    asOf: "2031-11-30",
    reportingCurrency: "TZS",
    members: groupMembers(),
    intercompany: [],
    rates: makeRates({}).lookup,
    ...over,
  });
}

const byEntity = (result: Awaited<ReturnType<typeof run>>, id: string) =>
  result.entities.find((entity) => entity.legalEntityId === id)!;

describe("consolidation arithmetic — aggregation", () => {
  it("sums each member's trial balance into the group, in minor units of the currency", async () => {
    const result = await run();
    // 1 080 + 350 + 60 = 1 490 million TZS (exponent 0, so minor = major × 1).
    expect(result.totalAssetsMinor).toBe("1490000000");
    expect(result.totalLiabilitiesMinor).toBe("500000000");
    // Equity includes the period's profit: (500+300−120) + (200+50−0) + 60 = 990 million.
    expect(result.totalEquityMinor).toBe("990000000");
    expect(result.residualMinor).toBe("0");
    expect(result.balances).toBe(true);
    expect(result.nothingTranslatable).toBe(false);
    expect(result.includedCount).toBe(3);
    expect(result.excludedCount).toBe(0);
  });

  it("keeps profit inside equity so the member's own trial balance closes", async () => {
    const result = await run();
    const agri = byEntity(result, AGRI.id);
    expect(agri.localAssetsMinor).toBe("350000000");
    expect(agri.localLiabilitiesMinor).toBe("100000000");
    expect(agri.localEquityMinor).toBe("250000000");
    expect(agri.translationReserveMinor).toBe("0");
    expect(agri.dataState).toBe("ACTUAL");
    // The group root is 100% by definition of membership; the subsidiary carries the
    // registry's percentage rather than an assumed one.
    expect(agri.ownershipPct).toBe("70.000000");
    expect(byEntity(result, HOLDING.id).ownershipPct).toBe("100.000000");
  });

  it("asks the rate authority nothing when the reporting currency is the member's own", async () => {
    const rates = makeRates({});
    await run({ rates: rates.lookup });
    expect(rates.asked).toEqual([]);
  });
});

describe("consolidation arithmetic — translation", () => {
  it("rescales between currencies whose minor units differ, in both directions", async () => {
    const rates = makeRates({ "TZS/USD@CLOSING": "0.000400000000" });
    const result = await run({ reportingCurrency: "USD", rates: rates.lookup });
    // 1 490 000 000 TZS × 0.0004 = 596 000 USD = 59 600 000 cents. The 596 000 an
    // implementation that forgot the exponent difference would return is the bug.
    expect(result.totalAssetsMinor).toBe("59600000");
    expect(result.totalLiabilitiesMinor).toBe("20000000");
    expect(result.totalEquityMinor).toBe("39600000");
    expect(result.residualMinor).toBe("0");
    expect(rates.asked).toContain("TZS/USD@CLOSING");
    // And the reverse: USD 1.00 (100 cents) at 2500 = 2500 TZS, divided by 100.
    expect(convertMinor(BigInt(100), scaleRate("2500"), "USD", "TZS")).toBe(BigInt(2500));
    expect(convertMinor(BigInt(2500), scaleRate("0.0004"), "TZS", "USD")).toBe(BigInt(100));
  });

  it("marks the estimate it had to make, and leaves the average rate absent", async () => {
    const result = await run({
      reportingCurrency: "USD",
      rates: makeRates({ "TZS/USD@CLOSING": "0.000400000000" }).lookup,
    });
    const holding = byEntity(result, HOLDING.id);
    expect(holding.dataState).toBe("ESTIMATED");
    expect(holding.averageRate).toBeNull();
    expect(holding.closingRate).toBe("0.000400000000");
    expect(holding.unavailabilityReason).toMatch(/no AVERAGE rate is recorded/i);
    expect(holding.unavailabilityReason).toMatch(/zero by construction/i);
    expect(holding.sourceRefs.some((ref) => ref.startsWith("fx_rates:FX_TZS_USD@CLOSING"))).toBe(true);
  });

  it("produces a real cumulative translation difference when income carries an average rate", async () => {
    const result = await run({
      reportingCurrency: "USD",
      rates: makeRates({
        "TZS/USD@CLOSING": "0.000400000000",
        "TZS/USD@AVERAGE": "0.000500000000",
      }).lookup,
    });
    // Holding: assets 1 080m ×0.0004 = 43 200 000; liabilities 16 000 000;
    // equity 20 000 000; profit (300m − 120m) at 0.0005 = 1 500 000? no:
    // revenue 300m ×0.0005 ×100 = 15 000 000 and expense 120m ×0.0005 ×100 = 6 000 000.
    const holding = byEntity(result, HOLDING.id);
    expect(holding.translatedAssetsMinor).toBe("43200000");
    expect(holding.translatedLiabilitiesMinor).toBe("16000000");
    expect(holding.translatedEquityMinor).toBe("29000000"); // 20 000 000 + 15 000 000 − 6 000 000
    expect(holding.translationReserveMinor).toBe("-1800000"); // 43 200 000 − 16 000 000 − 29 000 000
    expect(holding.dataState).toBe("ACTUAL");
    expect(holding.averageRate).toBe("0.000500000000");
    const agri = byEntity(result, AGRI.id);
    expect(agri.translatedEquityMinor).toBe("10500000"); // 8 000 000 + 50m ×0.0005 ×100
    expect(agri.translationReserveMinor).toBe("-500000");

    expect(result.totalAssetsMinor).toBe("59600000"); // assets are unaffected by the P&L rate
    expect(result.totalEquityMinor).toBe("41900000");
    expect(result.residualMinor).toBe("-2300000");
    expect(result.balances).toBe(false);

    const translation = result.proposals.find((proposal) => proposal.adjustmentType === "FX_TRANSLATION");
    expect(translation).toBeDefined();
    expect(translation!.amountMinor).toBe("2300000"); // positive magnitude, `amount_check`
    expect(translation!.description).toMatch(/not a plug/i);
    expect(translation!.sourceReferences.length).toBeGreaterThan(0);
  });

  it("restates an entry currency into the functional currency before translating the group currency", async () => {
    // A USD-functional entity that posted a USD entry, consolidated into TZS.
    const result = await computeConsolidation({
      periodCode: "2031-11",
      asOf: "2031-11-30",
      reportingCurrency: "TZS",
      members: [
        member({ ...PARENT_USD }, {
          balancesByCurrency: [{ currency: "USD", accounts: accounts({ ASSET: "1000.00", EQUITY: "1000.00" }) }],
        }),
      ],
      intercompany: [],
      rates: makeRates({ "USD/TZS@CLOSING": "2500" }).lookup,
    });
    // 1000.00 USD = 100 000 cents × 2500 ÷ 100 = 2 500 000 TZS minor.
    expect(result.totalAssetsMinor).toBe("2500000");
    expect(result.totalEquityMinor).toBe("2500000");
    expect(result.residualMinor).toBe("0");
  });

  it("refuses the member rather than defaulting a rate it was not given", async () => {
    const rates = makeRates({});
    const result = await run({ reportingCurrency: "USD", rates: rates.lookup });
    expect(result.includedCount).toBe(0);
    expect(result.nothingTranslatable).toBe(true);
    // Absent, not zero: an untranslatable run must not report a group of nothing.
    expect(result.totalAssetsMinor).toBe("");
    expect(result.totalEquityMinor).toBe("");
    expect(result.proposals).toEqual([]);
    expect(result.outstanding.map((item) => item.kind)).toEqual(["FX_RATE", "FX_RATE", "FX_RATE"]);
    expect(result.outstanding[0].reason).toMatch(/REQUIRES_AUTHORITY/);
    expect(rates.asked).toContain("TZS/USD@CLOSING");
    expect(rates.asked.some((key) => key.endsWith("@AVERAGE"))).toBe(false);
  });

  it("refuses a ledger amount finer than the currency's smallest unit, without rounding it", async () => {
    const result = await run({
      members: groupMembers({
        [AGRI.id]: {
          balancesByCurrency: [{ currency: "TZS", accounts: accounts({ ASSET: "350000000.50", EQUITY: "350000000.50" }) }],
        },
      }),
    });
    const agri = byEntity(result, AGRI.id);
    expect(agri.included).toBe(false);
    expect(agri.dataState).toBe("UNAVAILABLE");
    expect(agri.unavailabilityReason).toMatch(/below the currency's smallest unit|smallest unit/i);
    // The other two members are untouched: one bad cell does not contaminate a total.
    expect(byEntity(result, HOLDING.id).included).toBe(true);
    expect(result.totalAssetsMinor).toBe("1140000000");
  });

  it("excludes a member with no trial balance instead of consolidating it as nil", async () => {
    const result = await run({
      members: groupMembers({
        [FINTECH.id]: { balancesByCurrency: [] },
      }),
    });
    const fintech = byEntity(result, FINTECH.id);
    expect(fintech.included).toBe(false);
    expect(fintech.translatedAssetsMinor).toBeNull();
    expect(fintech.unavailabilityReason).toMatch(/no journal entries/i);
    expect(fintech.unavailabilityReason).toMatch(/unrecorded/i);
    expect(result.totalAssetsMinor).toBe("1430000000");
    expect(result.outstanding.map((item) => item.kind)).toContain("TRIAL_BALANCE");
  });
});

describe("consolidation arithmetic — ownership and non-controlling interests", () => {
  it("recognises the outside share of a 70%-held member, in the group's own currency", async () => {
    const result = await run();
    const nci = result.proposals.filter((proposal) => proposal.adjustmentType === "NCI_RECOGNITION");
    expect(nci).toHaveLength(1); // the 100%-held member has no outside share
    expect(nci[0].amountMinor).toBe("75000000"); // 30% of 250 000 000
    expect(nci[0].creditEntityId).toBe(AGRI.id);
    expect(nci[0].description).toMatch(/70\.000000%/);
    expect(nci[0].sourceReferences).toContain("ownership_records:OWN_AGRI_TZH");
  });

  it("gives the outside holders their share of the translation difference too", async () => {
    const result = await run({
      reportingCurrency: "USD",
      rates: makeRates({
        "TZS/USD@CLOSING": "0.000400000000",
        "TZS/USD@AVERAGE": "0.000500000000",
      }).lookup,
    });
    const nci = result.proposals.find((proposal) => proposal.adjustmentType === "NCI_RECOGNITION");
    expect(nci!.amountMinor).toBe("3150000"); // 30% of 10 500 000, reserve included
  });

  it("treats control without economic interest as 0%, not as 100%", async () => {
    const result = await run({
      members: groupMembers({
        [AGRI.id]: {
          ownership: [{ id: "OWN_AGRI_CTRL", ownerEntityId: HOLDING.id, pct: "0.000000", ownershipType: "CONTROL_ONLY" }],
        },
      }),
    });
    const agri = byEntity(result, AGRI.id);
    expect(agri.included).toBe(true);
    expect(agri.ownershipPct).toBe("0.000000");
    expect(agri.dataState).toBe("ESTIMATED");
    expect(agri.unavailabilityReason).toMatch(/CONTROL_ONLY/);
    const nci = result.proposals.find((proposal) => proposal.adjustmentType === "NCI_RECOGNITION");
    expect(nci!.amountMinor).toBe("250000000"); // all of it belongs to others
  });

  it("will not guess a share for a subsidiary whose registry is silent", async () => {
    const result = await run({
      members: groupMembers({
        [AGRI.id]: { ownership: [], ownershipEvidenceMissing: true },
      }),
    });
    const agri = byEntity(result, AGRI.id);
    expect(agri.included).toBe(false);
    expect(agri.ownershipPct).toBeNull();
    expect(agri.unavailabilityReason).toMatch(/invent a wholly-owned subsidiary/i);
    expect(result.proposals.some((proposal) => proposal.adjustmentType === "NCI_RECOGNITION")).toBe(false);
    expect(result.outstanding.map((item) => item.kind)).toContain("OWNERSHIP");
  });

  it("refuses conflicting percentages for one owner rather than picking one", async () => {
    const result = await run({
      members: groupMembers({
        [AGRI.id]: {
          ownership: [
            { id: "OWN_A", ownerEntityId: HOLDING.id, pct: "70.000000", ownershipType: "DIRECT" },
            { id: "OWN_B", ownerEntityId: HOLDING.id, pct: "74.000000", ownershipType: "INDIRECT" },
          ],
        },
      }),
    });
    expect(byEntity(result, AGRI.id).included).toBe(false);
    expect(byEntity(result, AGRI.id).unavailabilityReason).toMatch(/no precedence rule/i);
    expect(result.outstanding.map((item) => item.kind)).toContain("OWNERSHIP_CONFLICT");
  });

  it("agrees with itself when the same owner is recorded twice at the same percentage", async () => {
    const result = await run({
      members: groupMembers({
        [AGRI.id]: {
          ownership: [
            { id: "OWN_A", ownerEntityId: HOLDING.id, pct: "70", ownershipType: "DIRECT" },
            { id: "OWN_B", ownerEntityId: HOLDING.id, pct: "70.000000", ownershipType: "DIRECT" },
          ],
        },
      }),
    });
    // `"70"` and `"70.000000"` are the same number; summing them as if they were two
    // owners would report a 140% stake and then "cap" it.
    expect(byEntity(result, AGRI.id).ownershipPct).toBe("70.000000");
    expect(result.proposals.find((proposal) => proposal.adjustmentType === "NCI_RECOGNITION")!.amountMinor).toBe("75000000");
  });

  it("reports an impossible register instead of capping it at 100%", async () => {
    const result = await run({
      members: groupMembers({
        [AGRI.id]: {
          ownership: [
            { id: "OWN_A", ownerEntityId: HOLDING.id, pct: "60.000000", ownershipType: "DIRECT" },
            { id: "OWN_B", ownerEntityId: FINTECH.id, pct: "60.000000", ownershipType: "DIRECT" },
          ],
        },
      }),
    });
    expect(byEntity(result, AGRI.id).included).toBe(false);
    expect(byEntity(result, AGRI.id).unavailabilityReason).toMatch(/sum to 120\.000000%/);
    // The reason names the likely innocent cause — a beneficial stake restating a
    // direct one — as well as why the engine will not resolve it.
    expect(byEntity(result, AGRI.id).unavailabilityReason).toMatch(/BENEFICIAL percentage may well restate/i);
    expect(byEntity(result, AGRI.id).unavailabilityReason).toMatch(/capping is a decision/i);
  });
});

describe("consolidation arithmetic — proposed eliminations", () => {
  const authorized = (over: Partial<IntercompanyInput> = {}): IntercompanyInput => ({
    id: "ICT_1",
    reference: "IC-2031-0001",
    currency: "TZS",
    amountMinor: "50000000",
    bothSidesAuthorized: true,
    state: "BOTH_SIDES_AUTHORIZED",
    receivableEntityId: AGRI.id,
    payableEntityId: HOLDING.id,
    reconciliationDifferenceMinor: null,
    ...over,
  });

  it("proposes the elimination of a balance both sides have accepted", async () => {
    const result = await run({ intercompany: [authorized()] });
    const elimination = result.proposals.filter((proposal) => proposal.adjustmentType === "INTERCOMPANY_ELIMINATION");
    expect(elimination).toHaveLength(1);
    expect(elimination[0].amountMinor).toBe("50000000");
    expect(elimination[0].currency).toBe("TZS");
    expect(elimination[0].debitEntityId).toBe(HOLDING.id);
    expect(elimination[0].creditEntityId).toBe(AGRI.id);
    expect(elimination[0].sourceReferences).toEqual(["intercompany_transactions:ICT_1", "reference:IC-2031-0001"]);
    expect(elimination[0].description).toMatch(/Proposed, not applied/i);
    expect(result.eliminationsMinor).toBe("50000000");
    expect(result.outstanding).toEqual([]);
  });

  it("translates the elimination into the reporting currency, with the same rescale", async () => {
    const result = await run({
      reportingCurrency: "USD",
      intercompany: [authorized()],
      rates: makeRates({ "TZS/USD@CLOSING": "0.000400000000" }).lookup,
    });
    // 50 000 000 TZS × 0.0004 × 100 = 2 000 000 cents.
    expect(result.proposals.find((proposal) => proposal.adjustmentType === "INTERCOMPANY_ELIMINATION")!.amountMinor).toBe("2000000");
  });

  it("leaves an unauthorized balance alone and says why", async () => {
    const result = await run({ intercompany: [authorized({ bothSidesAuthorized: false, state: "AWAITING_COUNTERPARTY", id: "ICT_2" })] });
    expect(result.proposals.filter((proposal) => proposal.adjustmentType === "INTERCOMPANY_ELIMINATION")).toHaveLength(0);
    expect(result.eliminationsMinor).toBe("0");
    const gap = result.outstanding.find((item) => item.kind === "ELIMINATION");
    expect(gap!.subject).toBe("IC-2031-0001");
    expect(gap!.reason).toMatch(/AWAITING_COUNTERPARTY/);
    expect(gap!.reason).toMatch(/counterparty's claim/i);
  });

  it("will not eliminate across an unresolved reconciliation difference", async () => {
    const result = await run({ intercompany: [authorized({ reconciliationDifferenceMinor: "2500000" })] });
    expect(result.proposals.filter((proposal) => proposal.adjustmentType === "INTERCOMPANY_ELIMINATION")).toHaveLength(0);
    expect(result.outstanding.find((item) => item.kind === "ELIMINATION")!.reason).toMatch(/would pick a side/i);
  });

  it("reports a nil intra-group balance instead of eliminating zero", async () => {
    const result = await run({ intercompany: [authorized({ amountMinor: "0" })] });
    expect(result.proposals.filter((proposal) => proposal.adjustmentType === "INTERCOMPANY_ELIMINATION")).toHaveLength(0);
    expect(result.outstanding.find((item) => item.kind === "ELIMINATION")!.reason).toMatch(/positive magnitude/i);
  });

  it("says nothing about a transaction whose other side is not in the run", async () => {
    const result = await run({ intercompany: [authorized({ payableEntityId: "LEN_SOMEBODY_ELSE" })] });
    // No elimination is proposed for a counterparty outside the run, and no gap is
    // reported either: a transaction with an entity that is not in this group is not
    // this run's business, and pretending otherwise would fill `outstanding` with
    // noise a reader cannot act on.
    expect(result.proposals.filter((proposal) => proposal.adjustmentType === "INTERCOMPANY_ELIMINATION")).toHaveLength(0);
    expect(result.outstanding).toHaveLength(0);
    expect(result.eliminationsMinor).toBe("0");
  });

  it("reports a one-sided elimination when the counterparty is a member the run excluded", async () => {
    // AGRI is a member of the group but has no trial balance, so it is excluded.
    // The difference from the case above is the point: a counterparty outside the
    // group is nobody's gap, while a counterparty THIS run dropped leaves a balance
    // consolidated on one side only — an amount that reads as a real claim on the
    // group. It is reported, and it is not eliminated either.
    const result = await run({
      members: groupMembers({ [AGRI.id]: { balancesByCurrency: [] } }),
      intercompany: [authorized()],
    });
    expect(result.proposals.filter((proposal) => proposal.adjustmentType === "INTERCOMPANY_ELIMINATION")).toHaveLength(0);
    const gap = result.outstanding.find((item) => item.kind === "ELIMINATION_PARTIAL");
    expect(gap, "a one-sided elimination must be reported, not skipped").toBeDefined();
    expect(gap!.subject).toBe("IC-2031-0001");
    expect(gap!.reason).toMatch(/BEYU-AGR is a member of this group but was excluded/);
    expect(gap!.reason).toMatch(/Reported, not resolved/i);
    expect(result.eliminationsMinor).toBe("0");
  });

  it("refuses to translate an elimination it has no rate for", async () => {
    const result = await run({
      reportingCurrency: "USD",
      intercompany: [authorized({ currency: "KES", amountMinor: "900000" })],
      rates: makeRates({ "TZS/USD@CLOSING": "0.000400000000" }).lookup,
    });
    expect(result.proposals.filter((proposal) => proposal.adjustmentType === "INTERCOMPANY_ELIMINATION")).toHaveLength(0);
    expect(result.outstanding.find((item) => item.kind === "ELIMINATION")!.reason).toMatch(/KES\/USD@CLOSING|REQUIRES_AUTHORITY/);
  });
});

describe("consolidation arithmetic — the money primitives themselves", () => {
  it("converts a ledger decimal into exact minor units, honouring a zero-decimal currency", () => {
    expect(minorFromMajorUnits("1000.00", "TZS")).toBe(BigInt(1000));
    expect(minorFromMajorUnits("1000", "TZS")).toBe(BigInt(1000));
    expect(minorFromMajorUnits("10.50", "USD")).toBe(BigInt(1050));
    expect(minorFromMajorUnits("10.5", "USD")).toBe(BigInt(1050));
    expect(minorFromMajorUnits("-3.25", "USD")).toBe(-BigInt(325));
    expect(() => minorFromMajorUnits("1000.50", "TZS")).toThrow(/smallest unit/);
    expect(() => minorFromMajorUnits("1.234", "USD")).toThrow(/smallest unit/);
    expect(() => minorFromMajorUnits("100", "XYZ")).toThrow(/no registered minor-unit exponent/);
    expect(() => minorFromMajorUnits("1e5", "TZS")).toThrow(/not a plain decimal/);
  });

  it("parses an already-minor amount without touching it", () => {
    expect(minorFromMinorUnits("50000000")).toBe(BigInt(50000000));
    expect(minorFromMinorUnits("-1")).toBe(-BigInt(1));
    expect(() => minorFromMinorUnits("50.00")).toThrow(/integer minor-unit/);
  });

  it("scales a rate to 12dp and refuses one the column cannot hold", () => {
    expect(scaleRate("1")).toBe(BigInt(1000000000000));
    expect(scaleRate("0.0004")).toBe(BigInt(400000000));
    expect(scaleRate("2613.333333")).toBe(BigInt(2613333333000000));
    expect(() => scaleRate("0.0000000000001")).toThrow(/finer than the 12 decimal places/);
    expect(() => scaleRate("1.5e3")).toThrow(/not a plain decimal rate/);
  });

  it("rounds halves away from zero, on both signs", () => {
    expect(roundHalfAwayFromZero(BigInt(5), BigInt(2))).toBe(BigInt(3));
    expect(roundHalfAwayFromZero(-BigInt(5), BigInt(2))).toBe(-BigInt(3));
    expect(roundHalfAwayFromZero(BigInt(4), BigInt(2))).toBe(BigInt(2));
    expect(() => roundHalfAwayFromZero(BigInt(1), BigInt(0))).toThrow(/division by zero/);
  });

  it("splits a percentage so the two shares still add back to the original", () => {
    // 1 000 000 001 minor units at 33.333333%: both halves must survive the rounding.
    const total = BigInt(1000000001);
    const complement = complementShare(total, "33.333333");
    const share = total - complement;
    expect(share + complement).toBe(total);
    expect(complement).toBe(BigInt(666666671)); // 1 000 000 001 − 333 333 330
    expect(complementShare(BigInt(0), "70.000000")).toBe(BigInt(0));
    expect(() => complementShare(BigInt(100), "100.000001")).toThrow(/exceeds 100%/);
    expect(() => complementShare(BigInt(100), "1.0000001")).toThrow(/finer than the 6 decimal places/);
  });
});
