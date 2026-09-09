/**
 * Family Office capital & wealth — Noelia's authority boundary (§24) and the
 * answer-tagging contract (§25).
 *
 * Noelia is the canonical AI identity extended with Family Office capabilities —
 * never a second AI system. What it can do is bounded twice over: structurally
 * (the answer type has no approval, execution, transfer or ownership field) and
 * by validation (a class the question does not permit is refused).
 */
import { describe, expect, it } from "vitest";
import {
  ANSWER_EPISTEMIC_CLASSES,
  FAMILY_OFFICE_QUESTIONS,
  NOELIA_AUTHORITY_CHAIN,
  NOELIA_CAN,
  NOELIA_CANNOT,
  assertAnswerClassesArePermitted,
  assertNoeliaStaysWithinAuthority,
  draftAnswerSkeleton,
  questionByCode,
  validateNoeliaAnswer,
  type NoeliaCapitalAnswer,
} from "../../../../src/lib/family/office/capital-wealth";
import { D } from "./fixtures";

function answer(over: Partial<NoeliaCapitalAnswer> = {}): NoeliaCapitalAnswer {
  return {
    engineVersion: "test",
    identity: "NOELIA",
    questionCode: "NET_WORTH",
    analysisType: "KPI_ANALYSIS",
    headline: "Net worth across one currency",
    statements: [
      {
        text: "Assets total 1,200,000,000 minor units in NGN.",
        epistemicClass: "FACT",
        sourceRefs: ["FIN-JOURNAL-1"],
        calculationMethod: null,
        assumption: null,
        missingInput: null,
      },
    ],
    missingInputs: [],
    recommendations: [],
    humanReviewRequired: true,
    deniedScopes: [],
    executedAnything: false,
    asOf: D.asOf,
    ...over,
  };
}

describe("§24 — Noelia's permitted and forbidden actions are fixed and exhaustive", () => {
  it("permits exactly the seven analytical actions", () => {
    expect(NOELIA_CAN).toEqual(["ANALYZE", "CALCULATE", "SUMMARIZE", "SIMULATE", "RECOMMEND", "ALERT", "DRAFT"]);
  });

  it("forbids every action that would make the analysis the decision", () => {
    for (const code of [
      "APPROVE",
      "TRANSFER_MONEY",
      "EXECUTE_INVESTMENTS",
      "EXECUTE_LOANS",
      "CHANGE_OWNERSHIP",
      "BYPASS_GOVERNANCE",
      "BYPASS_CAP_POSTING",
      "BYPASS_AUDIT",
    ]) {
      expect(NOELIA_CANNOT.map((c) => c.code)).toContain(code);
    }
  });

  it("throws on every forbidden action — the refusal is code, not documentation", () => {
    /**
     * A capability that exists only as documentation will eventually be
     * implemented, so the refusal has to live where the call happens.
     */
    for (const entry of NOELIA_CANNOT) {
      expect(() => assertNoeliaStaysWithinAuthority(entry.code), `${entry.code} should throw`).toThrow();
    }
  });

  it("allows the analytical actions through", () => {
    for (const action of NOELIA_CAN) {
      expect(() => assertNoeliaStaysWithinAuthority(action), `${action} should be allowed`).not.toThrow();
    }
  });

  it("every forbidden action carries a reason, not just a code", () => {
    for (const entry of NOELIA_CANNOT) {
      expect(entry.reason.trim().length, `${entry.code} needs a reason`).toBeGreaterThan(20);
    }
  });

  it("the authority chain runs Noelia → human → execution → Finance OS → audit", () => {
    expect(NOELIA_AUTHORITY_CHAIN.map((s) => s.actor)).toEqual([
      "NOELIA",
      "HUMAN/GOVERNANCE",
      "AUTHORIZED_SYSTEM",
      "FINANCE_OS",
      "AUDIT",
    ]);
    /** Noelia occupies the first link and only the first. */
    expect(NOELIA_AUTHORITY_CHAIN[0]?.role).toBe("RECOMMENDATION");
    expect(NOELIA_AUTHORITY_CHAIN[1]?.role).toBe("APPROVAL");
    expect(NOELIA_AUTHORITY_CHAIN[3]?.role).toBe("ACCOUNTING");
  });
});

describe("§25 — the answer type structurally cannot carry an authority", () => {
  it("has no approval, execution, transfer or ownership field", () => {
    /**
     * This is a stronger guarantee than a validation rule. There is no field for
     * a validator to forget about, so no code path can populate one.
     */
    const a = answer() as unknown as Record<string, unknown>;
    for (const forbidden of ["approval", "approved", "approvedBy", "executed", "transferred", "ownership", "posted"]) {
      expect(a).not.toHaveProperty(forbidden);
    }
  });

  it("identity is always NOELIA — never a second AI", () => {
    expect(answer().identity).toBe("NOELIA");
  });

  it("executedAnything is false and humanReviewRequired is true", () => {
    const a = answer();
    expect(a.executedAnything).toBe(false);
    expect(a.humanReviewRequired).toBe(true);
  });
});

describe("§25 — every statement carries an epistemic class the question permits", () => {
  it("a conforming answer validates clean", () => {
    expect(validateNoeliaAnswer(answer())).toHaveLength(0);
  });

  it("an unclassified statement is refused", () => {
    const findings = validateNoeliaAnswer(
      answer({
        statements: [
          { text: "Net worth is 500,000,000.", epistemicClass: "" as never, sourceRefs: [], calculationMethod: null, assumption: null, missingInput: null },
        ],
      }),
    );
    expect(findings.some((f) => /no epistemic class/i.test(f))).toBe(true);
  });

  it("a SCENARIO in answer to 'what is our net worth?' is refused as fabrication", () => {
    /**
     * NET_WORTH permits FACT, CALCULATION and UNCERTAINTY. A scenario is a
     * hypothetical world; presenting one as net worth is the single worst failure
     * this contract exists to prevent.
     */
    const a = answer({
      statements: [
        { text: "Net worth is 500,000,000 in the modelled case.", epistemicClass: "SCENARIO", sourceRefs: [], calculationMethod: null, assumption: "8% growth", missingInput: null },
      ],
    });
    const findings = validateNoeliaAnswer(a);
    expect(findings.some((f) => /does not permit/i.test(f))).toBe(true);
    expect(() => assertAnswerClassesArePermitted(a)).toThrow();
  });

  it("a CALCULATION with no stated method is refused", () => {
    const findings = validateNoeliaAnswer(
      answer({
        statements: [
          { text: "Coverage is 148%.", epistemicClass: "CALCULATION", sourceRefs: ["OB-1"], calculationMethod: null, assumption: null, missingInput: null },
        ],
      }),
    );
    expect(findings.some((f) => /no stated method/i.test(f))).toBe(true);
  });

  it("a FACT with no source reference is refused", () => {
    const findings = validateNoeliaAnswer(
      answer({
        statements: [
          { text: "Assets total 1,200,000,000.", epistemicClass: "FACT", sourceRefs: [], calculationMethod: null, assumption: null, missingInput: null },
        ],
      }),
    );
    expect(findings.some((f) => /no source reference/i.test(f))).toBe(true);
  });

  it("an UNCERTAINTY that does not name the missing input is refused", () => {
    const findings = validateNoeliaAnswer(
      answer({
        statements: [
          { text: "Net worth cannot be stated.", epistemicClass: "UNCERTAINTY", sourceRefs: [], calculationMethod: null, assumption: null, missingInput: null },
        ],
      }),
    );
    expect(findings.some((f) => /missing input/i.test(f))).toBe(true);
  });

  it("a listed missing input must also be reported as a statement", () => {
    /**
     * A gap listed in `missingInputs` but never surfaced in the statements is a
     * gap the reader will not see, which is worse than not listing it.
     */
    const findings = validateNoeliaAnswer(answer({ missingInputs: ["VALUATION"] }));
    expect(findings.some((f) => /listed as missing/i.test(f))).toBe(true);
  });
});

describe("§44 — 'AI said so' is never a sufficient rationale", () => {
  it("a recommendation with no rationale is refused", () => {
    const findings = validateNoeliaAnswer(
      answer({ recommendations: [{ text: "Increase the position", rationale: "", requiresHumanDecision: true }] }),
    );
    expect(findings.some((f) => /rationale/i.test(f))).toBe(true);
  });

  it("a recommendation that does not require a human decision is refused", () => {
    const findings = validateNoeliaAnswer(
      answer({
        recommendations: [
          { text: "Increase the position", rationale: "Cash flow of 8,000,000 supports it at the current valuation.", requiresHumanDecision: false as never },
        ],
      }),
    );
    expect(findings.some((f) => /human decision/i.test(f))).toBe(true);
  });

  it("an answer that does not require human review is refused", () => {
    const findings = validateNoeliaAnswer(answer({ humanReviewRequired: false as never }));
    expect(findings.some((f) => /human review/i.test(f))).toBe(true);
  });
});

describe("§25 — the question catalogue is closed and each question states its inputs", () => {
  it("every question declares required inputs and permitted classes", () => {
    for (const q of FAMILY_OFFICE_QUESTIONS) {
      expect(q.requiredInputs.length, `${q.code} requiredInputs`).toBeGreaterThan(0);
      expect(q.permittedClasses.length, `${q.code} permittedClasses`).toBeGreaterThan(0);
    }
  });

  it("no factual question permits SCENARIO", () => {
    /**
     * Only forward-looking questions may carry a scenario. A question about what
     * IS cannot be answered with what MIGHT BE.
     */
    for (const q of FAMILY_OFFICE_QUESTIONS) {
      if (["NET_WORTH", "CAPITAL_DEPLOYMENT", "CASH_FLOW_RANKING", "DEBT_MATURITY"].includes(q.code)) {
        expect(q.permittedClasses).not.toContain("SCENARIO");
      }
    }
  });

  it("the epistemic class catalogue is the seven named classes", () => {
    expect(ANSWER_EPISTEMIC_CLASSES).toEqual([
      "FACT",
      "CALCULATION",
      "ASSUMPTION",
      "INFERENCE",
      "SCENARIO",
      "RECOMMENDATION",
      "UNCERTAINTY",
    ]);
  });

  it("questionByCode resolves a known code and throws on an unknown one", () => {
    expect(questionByCode("NET_WORTH").question).toMatch(/net worth/i);
    expect(() => questionByCode("INVENTED" as never)).toThrow();
  });
});

describe("§25 — DRAFT produces a skeleton that carries no number", () => {
  it("a draft carries no number — only classified statements about what it cannot know", () => {
    const draft = draftAnswerSkeleton({
      questionCode: "NET_WORTH",
      suppliedInputs: [],
      asOf: D.asOf,
    });
    /**
     * The skeleton seeds one UNCERTAINTY statement per missing input rather than
     * starting empty. That is the stronger behaviour: an empty statement list reads
     * as "nothing to say", while a named gap reads as "this is what I could not
     * check". Either way no figure can reach a reader, because nothing here is
     * classed FACT or CALCULATION.
     */
    expect(draft.statements.length).toBeGreaterThan(0);
    for (const s of draft.statements) {
      expect(s.epistemicClass).toBe("UNCERTAINTY");
      expect(s.missingInput).toBeTruthy();
      expect(s.text).not.toMatch(/\d/);
    }
    expect(draft.humanReviewRequired).toBe(true);
    expect(draft.executedAnything).toBe(false);
  });

  it("a draft names the inputs it was not given", () => {
    const draft = draftAnswerSkeleton({
      questionCode: "NET_WORTH",
      suppliedInputs: [],
      asOf: D.asOf,
    });
    /** NET_WORTH requires BALANCE_SHEET; absent, the draft must say so. */
    expect(draft.missingInputs).toContain("BALANCE_SHEET");
  });

  it("a draft with all inputs supplied names no gap", () => {
    const draft = draftAnswerSkeleton({
      questionCode: "NET_WORTH",
      suppliedInputs: ["BALANCE_SHEET"],
      asOf: D.asOf,
    });
    expect(draft.missingInputs).not.toContain("BALANCE_SHEET");
  });

  it("scopes withheld from the caller are surfaced, never silently omitted", () => {
    const draft = draftAnswerSkeleton({
      questionCode: "NET_WORTH",
      suppliedInputs: ["BALANCE_SHEET"],
      deniedScopes: ["entity:LE-2", "country:KE"],
      asOf: D.asOf,
    });
    expect(draft.deniedScopes).toContain("entity:LE-2");
    expect(draft.deniedScopes).toContain("country:KE");
  });
});
