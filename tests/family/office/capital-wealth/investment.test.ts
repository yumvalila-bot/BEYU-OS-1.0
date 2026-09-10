/**
 * Family Office capital & wealth — the investment engine (§13): measures, thesis,
 * and the decision journal.
 *
 * The load-bearing claim: a position with no valuation mark is reported as
 * UNVALUED, never as flat. "We have not marked it" and "it has not moved" are
 * different governance statements, and only one of them is true.
 */
import { describe, expect, it } from "vitest";
import {
  PRE_INVESTMENT_QUESTIONS,
  REVIEW_OUTCOMES,
  STATUSES_REQUIRING_COMMITTEE_DECISION,
  assertThesisIsComplete,
  measureInvestment,
  summarisePortfolio,
  validateInvestment,
  validatePostInvestmentReview,
  validatePreInvestmentEntry,
  type InvestmentThesis,
  type PostInvestmentReview,
  type PreInvestmentJournalEntry,
} from "../../../../src/lib/family/office/capital-wealth";
import { D, TENANT, investment } from "./fixtures";

function thesis(over: Partial<InvestmentThesis> = {}): InvestmentThesis {
  return {
    id: "TH-1",
    investmentId: "INV-1",
    thesis: "Rental income of 12,000,000 supports a 740 bps cap rate against a 1200 bps cost of debt.",
    counterThesis: "Vacancy above 1500 bps and a rising cost of debt would invert the spread within two years.",
    falsificationTest: "If realised vacancy exceeds 1500 bps for two consecutive quarters the thesis is falsified.",
    majorAssumptions: ["Occupancy holds above 90%", "Cost of debt stays below 1400 bps"],
    risks: ["Tenant concentration", "Interest rate rise"],
    maximumAcceptableLossMinor: 20_000_000,
    exitCondition: "Sell when the cap rate compresses below 600 bps or the lease expires.",
    targetReturnBps: 900,
    targetHoldingMonths: 84,
    status: "CURRENT",
    authorRef: "U-AUTHOR",
    authorType: "HUMAN",
    asOf: D.asOf,
    ...over,
  };
}

function journalEntry(over: Partial<PreInvestmentJournalEntry> = {}): PreInvestmentJournalEntry {
  return {
    id: "JE-1",
    investmentId: "INV-1",
    tenantId: TENANT,
    answers: {
      why: "The asset produces cash flow above the cost of debt and fits the property allocation.",
      thesis: "Rental income supports a 740 bps cap rate.",
      falsification: "Vacancy above 1500 bps for two quarters falsifies it.",
      assumptions: "Occupancy above 90%; cost of debt below 1400 bps.",
      risks: "Tenant concentration and rate rises.",
      maximumLoss: "20,000,000 minor units.",
      exitCondition: "Cap rate below 600 bps or lease expiry.",
      emotions: "Confidence from a recent successful disposal may be biasing the risk estimate upward.",
    },
    authorRef: "U-AUTHOR",
    authorType: "HUMAN",
    emotionDisclosure: "Recent success may be inflating my confidence.",
    asOf: D.asOf,
    ...over,
  };
}

describe("§13 — measures are null when their input is absent, and the absence is named", () => {
  it("a fully marked position produces every measure", () => {
    const m = measureInvestment(investment());
    /** Unrealised gain is 120,000,000 − 100,000,000. */
    expect(m.unrealisedGainMinor).toBe(20_000_000);
    expect(m.totalGainMinor).toBe(20_000_000);
    /** ROI on cost: 20,000,000 / 100,000,000 = 20%. */
    expect(m.roiBps).toBe(2_000);
    /** Yield on value: 8,000,000 / 120,000,000 = 6.67%. */
    expect(m.yieldBps).toBe(667);
    /** Cash-on-cash: 8,000,000 / 40,000,000 = 20%. */
    expect(m.cashOnCashBps).toBe(2_000);
    /** LTV: 60,000,000 / 120,000,000 = 50%. */
    expect(m.ltvBps).toBe(5_000);
    expect(m.irrBps).not.toBeNull();
    expect(m.cagrBps).not.toBeNull();
  });

  it("an unvalued position is UNVALUED, never flat", () => {
    /**
     * This is the central claim of the engine. Reporting an unmarked position as
     * zero gain would tell the family the asset had not moved, which is a false
     * statement about an asset nobody has measured.
     */
    const m = measureInvestment(investment({ valuation: null }));
    expect(m.currentValueMinor).toBeNull();
    expect(m.unrealisedGainMinor).toBeNull();
    expect(m.roiBps).toBeNull();
    expect(m.yieldBps).toBeNull();
    expect(m.cagrBps).toBeNull();
    expect(m.ltvBps).toBeNull();
    expect(m.netPositionMinor).toBeNull();
    /**
     * IRR survives, and that is correct rather than an oversight: it is derived
     * from the exit assumption and the realised cash flow, neither of which needs
     * a current mark. The engine's own missing-input list must not claim otherwise.
     */
    expect(m.irrBps).not.toBeNull();
    expect(m.missingInputs.join(" ")).not.toMatch(/IRR/);
    /** And the reason is stated, not merely absent. */
    expect(m.missingInputs.join(" ")).toMatch(/valuation/i);
    expect(m.basis).toBe("DATA_NOT_AVAILABLE");
  });

  it("a zero holding period makes CAGR undefined and says so", () => {
    const m = measureInvestment(investment({ heldYears: 0 }));
    expect(m.cagrBps).toBeNull();
    expect(m.missingInputs.join(" ")).toMatch(/holding period/i);
  });

  it("no exit assumption makes IRR undefined and says so", () => {
    const m = measureInvestment(investment({ exitValueAssumptionMinor: null }));
    expect(m.irrBps).toBeNull();
    expect(m.missingInputs.join(" ")).toMatch(/exit/i);
  });

  it("every measure set carries an explanation", () => {
    expect(measureInvestment(investment()).explanation.length).toBeGreaterThan(0);
    expect(measureInvestment(investment({ valuation: null })).explanation.length).toBeGreaterThan(0);
  });
});

describe("§13 — portfolio aggregation never crosses currencies and never totals unmarked positions", () => {
  it("aggregates per currency only", () => {
    const ngn = investment({ id: "I-NGN", currency: "NGN" });
    const usd = investment({ id: "I-USD", currency: "USD" });
    const p = summarisePortfolio([ngn, usd], D.asOf);
    expect(p.byCurrency).toHaveLength(2);
    expect(p.byCurrency.map((c) => c.currency).sort()).toEqual(["NGN", "USD"]);
    /** There is deliberately no cross-currency total field. */
    expect(p).not.toHaveProperty("totalAcrossCurrenciesMinor");
  });

  it("a single unmarked position makes the whole total null", () => {
    /**
     * A partial total is a misleading one. Two positions worth 120,000,000 and one
     * unmarked do not total 240,000,000 — that number would be presented as a
     * portfolio value while quietly excluding a third of the book.
     */
    const marked = [investment({ id: "I-1" }), investment({ id: "I-2" })];
    const withUnmarked = [...marked, investment({ id: "I-3", valuation: null })];

    expect(summarisePortfolio(marked, D.asOf).totalValueMinor).not.toBeNull();

    const p = summarisePortfolio(withUnmarked, D.asOf);
    expect(p.totalValueMinor).toBeNull();
    expect(p.totalUnrealisedGainMinor).toBeNull();
    expect(p.unmarkedInvestmentIds).toEqual(["I-3"]);
  });

  it("names the unmarked positions so a missing total is attributable", () => {
    const p = summarisePortfolio([investment({ id: "I-1", valuation: null })], D.asOf);
    expect(p.unmarkedInvestmentIds).toHaveLength(1);
    expect(p.portfolioYieldBps).toBeNull();
  });

  it("reports concentration by asset class, country, entity and liquidity", () => {
    const p = summarisePortfolio(
      [
        investment({ id: "I-1", assetClass: "COMMERCIAL_PROPERTY", countryCode: "NG" }),
        investment({ id: "I-2", assetClass: "COMMERCIAL_PROPERTY", countryCode: "KE" }),
        investment({ id: "I-3", assetClass: "EQUITY_PRIVATE", countryCode: "NG" }),
      ],
      D.asOf,
    );
    expect(p.byAssetClass.length).toBe(2);
    expect(p.byCountry.length).toBe(2);
    expect(p.largestPositionShareBps).not.toBeNull();
  });
});

describe("§13 — an investment past screening must reference its authority", () => {
  it("a well-formed live investment validates clean", () => {
    expect(validateInvestment(investment())).toHaveLength(0);
  });

  it("every post-screening status requires a committee decision", () => {
    for (const status of STATUSES_REQUIRING_COMMITTEE_DECISION) {
      const findings = validateInvestment(investment({ governanceStatus: status, committeeDecisionRef: null }));
      expect(findings.some((f) => /committee decision/i.test(f)), `${status} needs a committee decision`).toBe(true);
    }
  });

  it("an IDEA needs no authority, because nothing has been decided yet", () => {
    const findings = validateInvestment(
      investment({ governanceStatus: "IDEA", committeeDecisionRef: null, legalReviewRef: null, taxReviewRef: null, exitStrategy: null }),
    );
    expect(findings.filter((f) => /committee decision/i.test(f))).toHaveLength(0);
  });

  it("an EXECUTED investment must reference the Finance OS record it reconciles to", () => {
    const findings = validateInvestment(investment({ governanceStatus: "EXECUTED", financeRecordRef: null }));
    expect(findings.some((f) => /Finance OS record/i.test(f))).toBe(true);
  });

  it("a live investment with no legal or tax review is flagged, not silently accepted", () => {
    const findings = validateInvestment(investment({ legalReviewRef: null, taxReviewRef: null }));
    expect(findings.some((f) => /legal review/i.test(f))).toBe(true);
    expect(findings.some((f) => /tax review/i.test(f))).toBe(true);
  });
});

describe("§11 — a thesis is incomplete without the case against it", () => {
  it("a complete thesis validates clean", () => {
    expect(assertThesisIsComplete(thesis())).toHaveLength(0);
  });

  it("a thesis with no counter-thesis is refused (CAP-008)", () => {
    const findings = assertThesisIsComplete(thesis({ counterThesis: "none" }));
    expect(findings.some((f) => /counter-thesis/i.test(f))).toBe(true);
  });

  it("a thesis with no falsification test is refused", () => {
    /**
     * An unfalsifiable thesis cannot be monitored. Recording one makes the
     * monitoring step theatre rather than a control.
     */
    const findings = assertThesisIsComplete(thesis({ falsificationTest: "nothing would" }));
    expect(findings.some((f) => /falsification/i.test(f))).toBe(true);
  });

  it("a thesis with no named assumptions or risks is refused", () => {
    expect(assertThesisIsComplete(thesis({ majorAssumptions: [] })).some((f) => /assumption/i.test(f))).toBe(true);
    expect(assertThesisIsComplete(thesis({ risks: [] })).some((f) => /risk/i.test(f))).toBe(true);
  });

  it("a thesis with no exit condition is refused", () => {
    const findings = assertThesisIsComplete(thesis({ exitCondition: "hold" }));
    expect(findings.some((f) => /exit condition/i.test(f))).toBe(true);
  });
});

describe("§22 — the decision journal requires all eight pre-investment questions", () => {
  it("asks exactly the eight questions", () => {
    expect(PRE_INVESTMENT_QUESTIONS).toHaveLength(8);
    expect(PRE_INVESTMENT_QUESTIONS.map((q) => q.key)).toContain("emotions");
  });

  it("a fully answered entry validates clean", () => {
    expect(validatePreInvestmentEntry(journalEntry())).toHaveLength(0);
  });

  it("an unanswered question is a finding", () => {
    const answers = { ...journalEntry().answers };
    delete answers.falsification;
    const findings = validatePreInvestmentEntry(journalEntry({ answers }));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("the emotion disclosure is required and must be non-empty (CAP-009)", () => {
    /**
     * CAP-009 exists because the question is uncomfortable. A journal that lets it
     * be skipped is a journal that does not do its job.
     */
    expect(validatePreInvestmentEntry(journalEntry({ emotionDisclosure: "" })).some((f) => /emotion/i.test(f))).toBe(true);
    expect(validatePreInvestmentEntry(journalEntry({ emotionDisclosure: "   " })).some((f) => /emotion/i.test(f))).toBe(true);
  });

  it("the review outcome catalogue separates thesis error from execution error", () => {
    expect(REVIEW_OUTCOMES.map((o) => o.code)).toEqual([
      "THESIS_CORRECT_EXECUTION_CORRECT",
      "THESIS_CORRECT_EXECUTION_WRONG",
      "THESIS_WRONG_EXECUTION_CORRECT",
      "THESIS_WRONG_EXECUTION_WRONG",
      "INDETERMINATE",
    ]);
  });
});

describe("§22 — a post-investment review must state what will be done differently", () => {
  function review(over: Partial<PostInvestmentReview> = {}): PostInvestmentReview {
    return {
      id: "PIR-1",
      investmentId: "INV-1",
      preInvestmentEntryId: "JE-1",
      tenantId: TENANT,
      answers: {
        whatHappened: "Occupancy held at 93% and the spread over the cost of debt widened as forecast.",
        expected: "Occupancy above 90% and a 740 bps cap rate.",
        unexpected: "Maintenance ran 400,000 above budget in the second year.",
        thesisWrong: "No. The rental income thesis held.",
        executionWrong: "Partly. The maintenance budget was understated at acquisition.",
        learned: "Budget maintenance from the vendor's five-year actuals, not from a market average.",
      },
      outcome: "THESIS_CORRECT_EXECUTION_CORRECT",
      lessonsApplied: ["Require two independent valuations above 100,000,000 before committee."],
      realisedGainMinor: 20_000_000,
      maximumAcceptableLossMinor: 20_000_000,
      maximumLossBreached: false,
      reviewerRef: "U-REVIEWER",
      reviewerType: "HUMAN",
      asOf: D.asOf,
      ...over,
    };
  }

  it("a complete review validates clean", () => {
    expect(validatePostInvestmentReview(review())).toHaveLength(0);
  });

  it("a review with no lesson applied is refused", () => {
    /** A lesson not applied is not learned. */
    expect(validatePostInvestmentReview(review({ lessonsApplied: [] })).some((f) => /lesson/i.test(f))).toBe(true);
  });

  it("a review with no linked pre-investment entry is refused", () => {
    /**
     * Without the prior entry there is no expectation to compare against, so the
     * review can describe what happened but cannot say whether the thesis was right.
     */
    expect(validatePostInvestmentReview(review({ preInvestmentEntryId: "" })).some((f) => /pre-investment/i.test(f))).toBe(true);
  });
});
