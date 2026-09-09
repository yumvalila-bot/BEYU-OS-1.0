/**
 * Family Office capital & wealth — generational wealth (§30), family education
 * (§27) and the business systemization maturity ladder (§29).
 *
 * The load-bearing claims: nothing here creates a legal instrument; readiness is
 * reported, never granted; an assessment must be human and evidenced; and the
 * maturity report surfaces the LIMITING dimension rather than an average.
 */
import { describe, expect, it } from "vitest";
import {
  BUSINESS_MATURITY_LEVELS,
  EDUCATION_FORMATS,
  EDUCATION_TOPICS,
  SYSTEMISATION_DIMENSIONS,
  educationReadiness,
  limitingDimension,
  validateBusinessMaturityAssessment,
  validateEducationProgress,
  validateGenerationalInterest,
  validateSuccessionObjective,
  type BusinessMaturityAssessment,
  type EducationLesson,
  type EducationProgress,
  type GenerationalInterest,
  type SuccessionObjective,
} from "../../../../src/lib/family/office/capital-wealth";
import { D, TENANT } from "./fixtures";

function interest(over: Partial<GenerationalInterest> = {}): GenerationalInterest {
  return {
    id: "GI-1",
    tenantId: TENANT,
    familyMemberRef: "FM-1",
    structureRef: "TRUST-1",
    kind: "ECONOMIC_INTEREST",
    shareBps: 2_500,
    discretionary: false,
    instrumentRef: "DEED-1",
    jurisdictionRef: "NG",
    legalEffectReference: "LEGAL-1",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    status: "ACTIVE",
    ...over,
  };
}

function objective(over: Partial<SuccessionObjective> = {}): SuccessionObjective {
  return {
    id: "SO-1",
    tenantId: TENANT,
    structureRef: "TRUST-1",
    objective: "The third generation holds and governs the family's productive assets.",
    generation: 3,
    successCriteria: "Every beneficiary has completed the capital allocation curriculum and sat on the council for one full cycle.",
    requiredPreparation: ["CAPITAL_ALLOCATION", "GOVERNANCE", "BEHAVIOURAL_FINANCE"],
    targetDate: "2030-01-01",
    status: "IN_PROGRESS",
    adoptedByRef: "RES-1",
    ...over,
  };
}

function assessment(over: Partial<BusinessMaturityAssessment> = {}): BusinessMaturityAssessment {
  return {
    id: "BA-1",
    tenantId: TENANT,
    legalEntityRef: "LE-1",
    asOf: D.asOf,
    dimensions: SYSTEMISATION_DIMENSIONS.map((d) => ({
      dimension: d,
      scoreBps: 7_000,
      evidence: "Documented processes reviewed on site and evidenced in the operations manual.",
      gap: null,
    })),
    assessedLevel: "TECHNOLOGY_ASSISTED",
    keyPersons: [{ personRef: "P-MD", role: "Managing Director", mitigated: true }],
    assessorRef: "U-ASSESSOR",
    assessorType: "HUMAN",
    adoptedByRef: "RES-1",
    ...over,
  };
}

describe("§30 — generational wealth is governed data, never a legal instrument", () => {
  it("a complete interest validates clean", () => {
    expect(validateGenerationalInterest(interest())).toHaveLength(0);
  });

  it("an interest with no instrument is refused", () => {
    /**
     * An interest with no instrument behind it is an assertion, not a record. The
     * module records what exists; it does not create anything.
     */
    expect(validateGenerationalInterest(interest({ instrumentRef: null })).some((f) => /instrument/i.test(f))).toBe(true);
  });

  it("an interest with no governing jurisdiction is refused", () => {
    expect(validateGenerationalInterest(interest({ jurisdictionRef: null })).some((f) => /jurisdiction/i.test(f))).toBe(true);
  });

  it("an ACTIVE interest must carry a legal-effect reference", () => {
    /**
     * Until a legal-effect reference exists the interest is RECORDED, not
     * established. Letting it be ACTIVE without one would imply legal effect the
     * system has no authority to confer.
     */
    expect(validateGenerationalInterest(interest({ legalEffectReference: null })).some((f) => /legal-effect/i.test(f))).toBe(true);
  });

  it("a RECORDED interest needs no legal-effect reference yet", () => {
    expect(validateGenerationalInterest(interest({ status: "RECORDED", legalEffectReference: null }))).toHaveLength(0);
  });

  it("a discretionary interest must not also carry a fixed share", () => {
    /**
     * Recording both asserts a certainty the structure does not have. A
     * discretionary interest is decided by a trustee; a fixed share is not.
     */
    expect(
      validateGenerationalInterest(interest({ discretionary: true, shareBps: 2_500 })).some((f) => /discretionary/i.test(f)),
    ).toBe(true);
    expect(validateGenerationalInterest(interest({ discretionary: true, shareBps: null }))).toHaveLength(0);
  });

  it("refuses a share outside 0…10000 basis points", () => {
    expect(validateGenerationalInterest(interest({ shareBps: 12_000 })).some((f) => /basis points/i.test(f))).toBe(true);
  });

  it("refuses an end date before the start date", () => {
    expect(
      validateGenerationalInterest(interest({ effectiveFrom: "2026-06-01", effectiveTo: "2026-01-01" })).some((f) => /precede/i.test(f)),
    ).toBe(true);
  });
});

describe("§30 — a succession objective must be adopted and preparable", () => {
  it("a complete objective validates clean", () => {
    expect(validateSuccessionObjective(objective())).toHaveLength(0);
  });

  it("an objective nobody adopted is refused", () => {
    /** A succession plan nobody adopted is not the family's plan. */
    expect(validateSuccessionObjective(objective({ adoptedByRef: null })).some((f) => /governance act/i.test(f))).toBe(true);
  });

  it("an objective with no success criteria is refused", () => {
    expect(validateSuccessionObjective(objective({ successCriteria: "soon" })).some((f) => /criteria/i.test(f))).toBe(true);
  });

  it("an objective with no required preparation is refused", () => {
    /** A succession objective with no preparation is a hope. */
    expect(validateSuccessionObjective(objective({ requiredPreparation: [] })).some((f) => /preparation/i.test(f))).toBe(true);
  });
});

describe("§27 — the education curriculum and readiness reporting", () => {
  it("covers all fifteen topics in dependency order", () => {
    expect(EDUCATION_TOPICS).toHaveLength(15);
    expect(EDUCATION_TOPICS.map((t) => t.order)).toEqual([...Array(15)].map((_, i) => i + 1));
    const codes = EDUCATION_TOPICS.map((t) => t.code);
    for (const c of ["FINANCIAL_LITERACY", "CASH_FLOW", "DEBT", "INVESTING", "REAL_ESTATE", "TAX", "BEHAVIOURAL_FINANCE", "CAPITAL_ALLOCATION", "GOVERNANCE"]) {
      expect(codes).toContain(c);
    }
  });

  it("offers the five delivery forms the brief names", () => {
    expect(EDUCATION_FORMATS).toEqual(["LESSON", "SIMULATION", "CASE_STUDY", "QUIZ", "DECISION_JOURNAL_EXERCISE"]);
  });

  it("reports gaps against the objective without granting readiness", () => {
    const r = educationReadiness({ objective: objective(), completedTopicCodes: ["CAPITAL_ALLOCATION"] });
    /**
     * `grantsReadiness` is typed false. Whether a member is ready to hold an
     * interest is a governance judgement, and this module does not make it.
     */
    expect(r.grantsReadiness).toBe(false);
    expect(r.completedTopics).toEqual(["CAPITAL_ALLOCATION"]);
    expect(r.gaps).toEqual(["GOVERNANCE", "BEHAVIOURAL_FINANCE"]);
  });

  it("reports no gap once every required topic is complete", () => {
    const r = educationReadiness({
      objective: objective(),
      completedTopicCodes: ["CAPITAL_ALLOCATION", "GOVERNANCE", "BEHAVIOURAL_FINANCE"],
    });
    expect(r.gaps).toHaveLength(0);
    expect(r.grantsReadiness).toBe(false);
  });

  it("a decision journal exercise without a journal entry records attendance, not reasoning", () => {
    const lesson: EducationLesson = {
      id: "LS-1",
      tenantId: TENANT,
      topic: "BEHAVIOURAL_FINANCE",
      title: "Writing a pre-investment journal entry",
      format: "DECISION_JOURNAL_EXERCISE",
      learningObjective: "The learner can apply this to a real family capital decision.",
      prerequisites: [],
      durationMinutes: 45,
      usesLiveFamilyData: false,
      status: "PUBLISHED",
    };
    const progress: EducationProgress = {
      id: "EP-1",
      tenantId: TENANT,
      lessonId: "LS-1",
      familyMemberRef: "FM-1",
      startedAt: "2026-03-01",
      completedAt: "2026-03-02",
      scoreBps: null,
      journalEntryRef: null,
      reflection: null,
    };
    const findings = validateEducationProgress({ progress, lesson });
    expect(findings.some((f) => /journal entry/i.test(f))).toBe(true);
    expect(findings.some((f) => /reflection/i.test(f))).toBe(true);
  });

  it("a completed quiz must carry a score", () => {
    const lesson: EducationLesson = {
      id: "LS-2",
      tenantId: TENANT,
      topic: "DEBT",
      title: "Debt measures",
      format: "QUIZ",
      learningObjective: "The learner can apply this to a real family capital decision.",
      prerequisites: [],
      durationMinutes: 45,
      usesLiveFamilyData: false,
      status: "PUBLISHED",
    };
    const progress: EducationProgress = {
      id: "EP-2",
      tenantId: TENANT,
      lessonId: "LS-2",
      familyMemberRef: "FM-1",
      startedAt: "2026-03-01",
      completedAt: "2026-03-02",
      scoreBps: null,
      journalEntryRef: null,
      reflection: null,
    };
    expect(validateEducationProgress({ progress, lesson }).some((f) => /score/i.test(f))).toBe(true);
  });

  it("a lesson using live family data is subject to the same controls as the data", () => {
    const lesson: EducationLesson = {
      id: "LS-3",
      tenantId: TENANT,
      topic: "CAPITAL_ALLOCATION",
      title: "Our own allocation decisions",
      format: "CASE_STUDY",
      learningObjective: "The learner can apply this to a real family capital decision.",
      prerequisites: [],
      durationMinutes: 45,
      usesLiveFamilyData: true,
      status: "PUBLISHED",
    };
    const progress: EducationProgress = {
      id: "EP-3",
      tenantId: TENANT,
      lessonId: "LS-3",
      familyMemberRef: "FM-1",
      startedAt: null,
      completedAt: null,
      scoreBps: null,
      journalEntryRef: null,
      reflection: null,
    };
    expect(validateEducationProgress({ progress, lesson }).some((f) => /RBAC, ABAC, RLS/.test(f))).toBe(true);
  });
});

describe("§29 — the business systemization maturity ladder", () => {
  it("runs founder-dependent through to owner-independent in six levels", () => {
    expect(BUSINESS_MATURITY_LEVELS).toHaveLength(6);
    expect(BUSINESS_MATURITY_LEVELS[0]?.code).toBe("FOUNDER_DEPENDENT");
    expect(BUSINESS_MATURITY_LEVELS[5]?.code).toBe("OWNER_INDEPENDENT");
    for (let i = 1; i < BUSINESS_MATURITY_LEVELS.length; i++) {
      expect(BUSINESS_MATURITY_LEVELS[i]!.rank).toBeGreaterThan(BUSINESS_MATURITY_LEVELS[i - 1]!.rank);
    }
  });

  it("assesses all eight dimensions", () => {
    expect(SYSTEMISATION_DIMENSIONS).toHaveLength(8);
    for (const d of ["FOUNDER_DEPENDENCE", "SOP_COVERAGE", "MANAGEMENT_DEPTH", "AUTOMATION", "DELEGATION", "TECHNOLOGY", "SUCCESSION", "KEY_PERSON_RISK"]) {
      expect(SYSTEMISATION_DIMENSIONS).toContain(d);
    }
  });

  it("a complete human assessment validates clean", () => {
    expect(validateBusinessMaturityAssessment(assessment())).toHaveLength(0);
  });

  it("an AI assessment is refused", () => {
    /**
     * An analytical system can summarise the evidence. Judging management depth is
     * a human act, and an AI assessment of it would carry authority nobody gave it.
     */
    expect(validateBusinessMaturityAssessment(assessment({ assessorType: "AI" })).some((f) => /human/i.test(f))).toBe(true);
  });

  it("a partial assessment is refused", () => {
    const partial = assessment({ dimensions: assessment().dimensions.slice(0, 3) });
    expect(validateBusinessMaturityAssessment(partial).some((f) => /was not assessed/i.test(f))).toBe(true);
  });

  it("a dimension with no evidence is refused", () => {
    /** A rating without evidence is an opinion, and an opinion cannot support a capital decision. */
    const noEvidence = assessment({
      dimensions: assessment().dimensions.map((d) => ({ ...d, evidence: "fine" })),
    });
    expect(validateBusinessMaturityAssessment(noEvidence).some((f) => /evidence is required/i.test(f))).toBe(true);
  });

  it("an unmitigated key person is reported, not scored away", () => {
    const unmitigated = assessment({ keyPersons: [{ personRef: "P-FOUNDER", role: "Founder", mitigated: false }] });
    expect(validateBusinessMaturityAssessment(unmitigated).some((f) => /key-person/i.test(f))).toBe(true);
  });

  it("an assessment nobody adopted is refused", () => {
    expect(validateBusinessMaturityAssessment(assessment({ adoptedByRef: null })).some((f) => /governance act/i.test(f))).toBe(true);
  });

  it("reports the LIMITING dimension, never an average", () => {
    /**
     * A business scored 9000 on technology and 1000 on succession is not "mostly
     * systematised" — it is one resignation away from a crisis. Averaging would hide
     * exactly the thing the assessment exists to find.
     */
    const uneven = assessment({
      dimensions: SYSTEMISATION_DIMENSIONS.map((d) => ({
        dimension: d,
        scoreBps: d === "SUCCESSION" ? 1_000 : 9_000,
        evidence: "Assessed on site with documentary evidence reviewed.",
        gap: d === "SUCCESSION" ? "No documented successor for any leadership role." : null,
      })),
    });
    const limiting = limitingDimension(uneven);
    expect(limiting.dimension).toBe("SUCCESSION");
    expect(limiting.scoreBps).toBe(1_000);
  });
});
