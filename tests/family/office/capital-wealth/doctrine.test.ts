/**
 * Family Office capital & wealth — capital doctrine (§5), the asset ladder (§6)
 * and the "be the bank, not the banker" boundary (§7).
 *
 * The central claim under test: CAP-001…CAP-015 are POLICY PRINCIPLES, never
 * automatic instructions. Nothing in this layer can tell the family to buy, sell
 * or hold, and nothing can perform a regulated banking activity.
 */
import { describe, expect, it } from "vitest";
import {
  CAPITAL_ACTIONS,
  CAPITAL_DOCTRINE,
  CAPITAL_DOCTRINE_IDS,
  CAPITAL_LADDER_STAGES,
  INTERNAL_CAPITAL_ACTIVITIES,
  REGULATED_ACTIVITY_FLAGS,
  assertRationaleIsNotDoctrineCitationOnly,
  assertRationaleIsNotLadderMetaphorOnly,
  assessLadderProgression,
  checkInternalCapitalBoundary,
  doctrineById,
  doctrineRelevantTo,
  isCapitalDoctrineId,
} from "../../../../src/lib/family/office/capital-wealth";

describe("§5 — CAP-001…CAP-015 exist as principles and never as instructions", () => {
  it("all fifteen principles are present and uniquely identified", () => {
    expect(CAPITAL_DOCTRINE).toHaveLength(15);
    expect(CAPITAL_DOCTRINE_IDS).toHaveLength(15);
    expect(new Set(CAPITAL_DOCTRINE_IDS).size).toBe(15);
    expect(CAPITAL_DOCTRINE_IDS[0]).toBe("CAP-001");
    expect(CAPITAL_DOCTRINE_IDS[14]).toBe("CAP-015");
  });

  it("every principle names the ratification it still lacks", () => {
    /**
     * A principle with a `policyKey` but no ratified value can be CITED and cannot
     * be APPLIED. Naming the gap is what stops a principle being read as a rule
     * that is already in force.
     */
    for (const d of CAPITAL_DOCTRINE) {
      expect(d.policyKey.trim().length, `${d.id} policyKey`).toBeGreaterThan(0);
      expect(d.ratificationRequires.trim().length, `${d.id} ratificationRequires`).toBeGreaterThan(0);
      expect(d.statement.trim().length, `${d.id} statement`).toBeGreaterThan(0);
    }
  });

  it("no principle is expressed as an automatic action", () => {
    /**
     * A principle may be phrased as a short directive — CAP-002 is "Acquire
     * productive assets" — because that is how a stated policy reads. What §5
     * forbids is doctrine becoming an AUTOMATIC instruction, so the thing to test
     * is the absence of self-executing language, not the absence of a verb.
     */
    for (const d of CAPITAL_DOCTRINE) {
      const text = `${d.title} ${d.statement}`.toLowerCase();
      for (const automatic of [
        "automatically",
        "the system shall",
        "the engine shall",
        "noelia shall",
        "must be executed",
        "is auto-approved",
        "without approval",
      ]) {
        expect(text.includes(automatic), `${d.id} contains "${automatic}"`).toBe(false);
      }
    }
  });

  it("the doctrine layer exposes no function that emits a buy, sell or hold directive", () => {
    /**
     * The strongest form of "doctrine is not an instruction" is structural: the
     * only thing the doctrine layer can return about a move is a LOCATION on the
     * ladder plus the prerequisites a human must clear. There is no code path that
     * returns an action to take.
     */
    const assessment = assessLadderProgression({
      currentStage: CAPITAL_LADDER_STAGES[0]!.code,
      proposedStage: CAPITAL_LADDER_STAGES[1]!.code,
      action: "BUY",
      satisfiedPrerequisites: [],
    });
    expect(assessment.recommendsStageChange).toBe(false);
    expect(assessment).not.toHaveProperty("recommendedAction");
    expect(assessment).not.toHaveProperty("instruction");
    expect(assessment).not.toHaveProperty("shouldProceed");
  });

  it("isCapitalDoctrineId accepts real ids and refuses invented ones", () => {
    expect(isCapitalDoctrineId("CAP-007")).toBe(true);
    expect(isCapitalDoctrineId("CAP-016")).toBe(false);
    expect(isCapitalDoctrineId("CAP-999")).toBe(false);
    expect(isCapitalDoctrineId("")).toBe(false);
  });

  it("doctrineById returns the principle and its matter tags", () => {
    const d = doctrineById("CAP-007");
    expect(d.id).toBe("CAP-007");
    expect(d.relevantMatterTags.length).toBeGreaterThan(0);
  });

  it("doctrineRelevantTo maps matter tags to principles", () => {
    const all = doctrineRelevantTo(CAPITAL_DOCTRINE.flatMap((d) => [...d.relevantMatterTags]));
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("§5 — a doctrine-only rationale is refused, not accepted as evidence", () => {
  it("citing CAP principles with no matter-specific content throws", () => {
    /**
     * "AI said so" and "doctrine says so" are the same failure in different words.
     * A rationale that contains nothing but citations has no evidence in it.
     */
    expect(() => assertRationaleIsNotDoctrineCitationOnly("CAP-007 CAP-008", ["CAP-007", "CAP-008"])).toThrow();
  });

  it("a rationale that quotes the doctrine statement verbatim still throws", () => {
    const d = doctrineById("CAP-007");
    expect(() => assertRationaleIsNotDoctrineCitationOnly(`${d.title}. ${d.statement}`, ["CAP-007"])).toThrow();
  });

  it("a rationale carrying matter-specific evidence passes", () => {
    expect(() =>
      assertRationaleIsNotDoctrineCitationOnly(
        "The asset produces 8,000,000 minor units of annual cash flow against a 100,000,000 cost, is valued at 120,000,000 by an independent valuer, and is financed at 1200 bps fixed with a 2029 maturity; exit is planned on lease expiry.",
        ["CAP-007"],
      ),
    ).not.toThrow();
  });
});

describe("§6 — the asset ladder is a scale for locating a decision, never a prescription", () => {
  it("the ladder is ordered and the actions are the seven named ones", () => {
    expect(CAPITAL_LADDER_STAGES.length).toBeGreaterThan(0);
    expect(CAPITAL_ACTIONS).toEqual(["BUY", "HOLD", "IMPROVE", "REFINANCE", "CONSOLIDATE", "SELL", "REDEPLOY"]);
  });

  it("never recommends a stage change", () => {
    /**
     * `recommendsStageChange` is structurally false. A family can be healthy at any
     * stage; the ladder exists so a proposal can be located, not so the system can
     * say the family should be further up it.
     */
    const first = CAPITAL_LADDER_STAGES[0]!.code;
    const last = CAPITAL_LADDER_STAGES[CAPITAL_LADDER_STAGES.length - 1]!.code;
    const assessment = assessLadderProgression({
      currentStage: first,
      proposedStage: last,
      action: "BUY",
      satisfiedPrerequisites: [],
    });
    expect(assessment.recommendsStageChange).toBe(false);
    expect(assessment.metaphorIsNotARationale).toBe(true);
  });

  it("reports the direction of a move without endorsing it", () => {
    const first = CAPITAL_LADDER_STAGES[0]!.code;
    const last = CAPITAL_LADDER_STAGES[CAPITAL_LADDER_STAGES.length - 1]!.code;
    expect(assessLadderProgression({ currentStage: first, proposedStage: last, action: "BUY", satisfiedPrerequisites: [] }).direction).toBe("ADVANCE");
    expect(assessLadderProgression({ currentStage: last, proposedStage: first, action: "SELL", satisfiedPrerequisites: [] }).direction).toBe("RETREAT");
    expect(assessLadderProgression({ currentStage: first, proposedStage: first, action: "HOLD", satisfiedPrerequisites: [] }).direction).toBe("SAME");
  });

  it("names every unmet prerequisite rather than treating silence as clearance", () => {
    const assessment = assessLadderProgression({
      currentStage: CAPITAL_LADDER_STAGES[0]!.code,
      proposedStage: CAPITAL_LADDER_STAGES[1]!.code,
      action: "BUY",
      satisfiedPrerequisites: [],
    });
    expect(assessment.unmetPrerequisites).toEqual(assessment.prerequisites);
    expect(assessment.explanation.join(" ")).toMatch(/cleared by a human/);
  });

  it("records a satisfied prerequisite as satisfied", () => {
    const all = ["STRATEGIC_FIT", "FINANCIAL_MODEL", "DUE_DILIGENCE", "LEGAL_REVIEW", "TAX_REVIEW", "GOVERNANCE_APPROVAL"];
    const assessment = assessLadderProgression({
      currentStage: CAPITAL_LADDER_STAGES[0]!.code,
      proposedStage: CAPITAL_LADDER_STAGES[1]!.code,
      action: "BUY",
      satisfiedPrerequisites: all,
    });
    expect(assessment.unmetPrerequisites).toHaveLength(0);
  });

  it("refuses an acquisition rationale that rests only on the ladder metaphor", () => {
    /**
     * The "four green houses → red hotel" story is a teaching device. Fitting the
     * progression is never a reason to acquire anything.
     */
    expect(() => assertRationaleIsNotLadderMetaphorOnly("This is the next rung up the asset ladder.")).toThrow();
    expect(() => assertRationaleIsNotLadderMetaphorOnly("green house progression")).toThrow();
  });

  it("accepts a rationale carrying matter-specific evidence", () => {
    expect(() =>
      assertRationaleIsNotLadderMetaphorOnly(
        "Cap rate of 740 bps against a 1200 bps cost of debt, 40,000,000 of cash invested, an independent valuation dated 2026-03-31, and an exit at lease expiry in 2029.",
      ),
    ).not.toThrow();
  });
});

describe("§7 — 'be the bank, not the banker': the engine never performs banking", () => {
  it("an internal allocation with no flags is inside the boundary", () => {
    const check = checkInternalCapitalBoundary({
      activity: "INTERCOMPANY_FINANCING",
      raisedFlags: [],
      recordedReviews: [],
    });
    expect(check.withinInternalCapitalBoundary).toBe(true);
    expect(check.performsRegulatedActivity).toBe(false);
    expect(check.modelOnly).toBe(true);
    expect(check.requiredBeforeProceeding).toHaveLength(0);
  });

  it("a regulated flag puts the activity outside the boundary", () => {
    const check = checkInternalCapitalBoundary({
      activity: "STRUCTURED_FINANCE_ANALYSIS",
      raisedFlags: ["LENDING_AS_A_BUSINESS_TO_THIRD_PARTIES"],
      recordedReviews: [],
    });
    expect(check.withinInternalCapitalBoundary).toBe(false);
    expect(check.raisedFlags).toContain("LENDING_AS_A_BUSINESS_TO_THIRD_PARTIES");
  });

  it("names the legal, regulatory and licensing reviews required before proceeding", () => {
    const check = checkInternalCapitalBoundary({
      activity: "STRUCTURED_FINANCE_ANALYSIS",
      raisedFlags: ["ACCEPTING_DEPOSITS_FROM_THE_PUBLIC"],
      recordedReviews: [],
    });
    expect(check.requiredBeforeProceeding).toEqual(["LEGAL_REVIEW", "REGULATORY_REVIEW", "LICENSING_REVIEW"]);
  });

  it("recording all three reviews clears the requirement — but never makes the engine perform the activity", () => {
    const check = checkInternalCapitalBoundary({
      activity: "STRUCTURED_FINANCE_ANALYSIS",
      raisedFlags: ["PROVIDING_CREDIT_TO_NON_GROUP_PARTIES"],
      recordedReviews: [
        { kind: "LEGAL", jurisdictionRef: "NG", reference: "LR-1" },
        { kind: "REGULATORY", jurisdictionRef: "NG", reference: "RR-1" },
        { kind: "LICENSING", jurisdictionRef: "NG", reference: "LIC-1" },
      ],
    });
    expect(check.requiredBeforeProceeding).toHaveLength(0);
    /**
     * This is the invariant that must not be relaxed. Even fully reviewed, the
     * engine models; it does not perform. `performsRegulatedActivity` is typed
     * `false`, so the compiler holds this line too.
     */
    expect(check.performsRegulatedActivity).toBe(false);
    expect(check.modelOnly).toBe(true);
    expect(check.explanation.join(" ")).toMatch(/does not perform it/);
  });

  it("an unknown flag is refused rather than ignored — the catalogue is closed", () => {
    expect(() =>
      checkInternalCapitalBoundary({
        activity: "INTERCOMPANY_FINANCING",
        raisedFlags: ["SOMETHING_INVENTED" as never],
        recordedReviews: [],
      }),
    ).toThrow();
  });

  it("every internal capital activity is an allocation of the family's own capital", () => {
    for (const a of INTERNAL_CAPITAL_ACTIVITIES) {
      expect(a.description).toMatch(/famil|project|structured|modelling|acquisitions/i);
      /** None of the permitted activities is deposit-taking or third-party lending. */
      expect(a.code).not.toMatch(/DEPOSIT/);
    }
  });

  it("the regulated-activity catalogue covers the eight activities the Family Office is not licensed for", () => {
    expect(REGULATED_ACTIVITY_FLAGS).toHaveLength(8);
    expect(REGULATED_ACTIVITY_FLAGS).toContain("ACCEPTING_DEPOSITS_FROM_THE_PUBLIC");
    expect(REGULATED_ACTIVITY_FLAGS).toContain("PROVIDING_INSURANCE");
  });
});
