/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH ENGINE: generational wealth (§26),
 * family education (§27) and business systemisation (§30).
 *
 * ============================== WHAT THIS IS ================================
 *
 * Governed data about continuity: who holds what, who benefits, what the
 * succession objectives are, what the next generation is being taught, and how
 * dependent each business still is on its founder.
 *
 * ============================ WHAT THIS IS NOT ================================
 *
 * NOT a trust drafting system. A legal structure here is GOVERNED DATA — a
 * reference to an instrument, a jurisdiction, a trustee and a status — never the
 * creation of a legal entity or an interest. `src/lib/family/office/trust.ts`
 * already enforces this for the institution layer, and this module inherits the
 * discipline rather than restating it.
 *
 * NOT an entitlement engine. Recording a beneficial interest does not confer it.
 * `src/lib/family/office/beneficiary.ts` already refuses to derive entitlement
 * from relationship (R19: genealogy is not entitlement), and nothing here
 * weakens that.
 */

export const FAMILY_GENERATIONAL_VERSION = "family-generational-1.0.0";

/* ------------------------------------------------------------------ */
/* §26 — Generational wealth                                           */
/* ------------------------------------------------------------------ */

/** The kinds of interest a person can hold. Kept distinct because they differ legally. */
export const INTEREST_KINDS = [
  { code: "LEGAL_OWNERSHIP", label: "Legal ownership", description: "Title held in the person's own name." },
  { code: "BENEFICIAL_INTEREST", label: "Beneficial interest", description: "The right to benefit from an asset held by another." },
  { code: "ECONOMIC_INTEREST", label: "Economic interest", description: "The right to the economics without title or beneficial status." },
  { code: "VOTING_RIGHT", label: "Voting right", description: "The right to vote without an economic interest." },
  { code: "CONTINGENT_INTEREST", label: "Contingent interest", description: "An interest that arises only on a stated condition." },
] as const;
export type InterestKind = (typeof INTEREST_KINDS)[number]["code"];

/**
 * A held interest, as governed data.
 *
 * `legalEffectReference` is null until a ratified instrument or jurisdictional
 * ruling supplies it. That is the same posture `office/identity.ts` takes: a
 * structure is recorded, its legal effect is not invented.
 */
export type GenerationalInterest = {
  id: string;
  tenantId: string;
  /** The family member. References the canonical `family_members` record. */
  familyMemberRef: string;
  /** The structure or entity the interest is in. */
  structureRef: string;
  kind: InterestKind;
  /** Basis points of the structure. Null for a discretionary interest. */
  shareBps: number | null;
  /** Whether the interest is discretionary — decided by a trustee, not fixed. */
  discretionary: boolean;
  /** The instrument that creates the interest. Required: an interest with no instrument is an assertion. */
  instrumentRef: string | null;
  /** The governing law. Required: the same words mean different things in different places. */
  jurisdictionRef: string | null;
  /** Null until a ratified instrument or ruling supplies it. */
  legalEffectReference: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "PROPOSED" | "RECORDED" | "ACTIVE" | "SUSPENDED" | "RELEASED" | "LAPSED";
};

/** Validate a generational interest record. */
export function validateGenerationalInterest(interest: GenerationalInterest): readonly string[] {
  const findings: string[] = [];
  if (!interest.familyMemberRef.trim()) findings.push("A family member reference is required.");
  if (!interest.structureRef.trim()) findings.push("The structure or entity the interest is in must be named.");
  if (!interest.instrumentRef) findings.push("An instrument reference is required. An interest with no instrument behind it is an assertion, not a record.");
  if (!interest.jurisdictionRef) findings.push("A governing jurisdiction is required: the same words create different interests in different places.");
  if (interest.shareBps !== null && (interest.shareBps < 0 || interest.shareBps > 10_000)) {
    findings.push(`A share must be between 0 and 10000 basis points; received ${interest.shareBps}.`);
  }
  if (interest.discretionary && interest.shareBps !== null) {
    findings.push("A discretionary interest must not carry a fixed share. Recording both asserts a certainty the structure does not have.");
  }
  if (interest.effectiveTo !== null && interest.effectiveTo < interest.effectiveFrom) {
    findings.push("effectiveTo must not precede effectiveFrom.");
  }
  if (interest.status === "ACTIVE" && !interest.legalEffectReference) {
    findings.push("An ACTIVE interest must carry a legal-effect reference. Until one exists the interest is recorded, not established.");
  }
  return findings;
}

/** A succession objective. Recorded, tracked, never auto-created. */
export type SuccessionObjective = {
  id: string;
  tenantId: string;
  structureRef: string;
  objective: string;
  /** The generation the objective concerns. */
  generation: number;
  /** What must be true for the objective to be met. */
  successCriteria: string;
  /** The education and preparation the objective requires. */
  requiredPreparation: readonly string[];
  targetDate: string | null;
  status: "PLANNED" | "IN_PROGRESS" | "MET" | "ABANDONED" | "SUPERSEDED";
  /** The governance act that adopted it. Required. */
  adoptedByRef: string | null;
};

/** Validate a succession objective. */
export function validateSuccessionObjective(objective: SuccessionObjective): readonly string[] {
  const findings: string[] = [];
  if (objective.objective.trim().length < 15) findings.push("The objective must be stated.");
  if (objective.successCriteria.trim().length < 15) findings.push("Success criteria are required. An objective with no criteria cannot be met or missed.");
  if (objective.requiredPreparation.length === 0) findings.push("The required preparation must be named. A succession objective with no preparation is a hope.");
  if (!objective.adoptedByRef) findings.push("The governance act that adopted the objective is required. A succession plan nobody adopted is not the family's plan.");
  if (!Number.isInteger(objective.generation) || objective.generation < 1) findings.push("Generation must be a positive integer.");
  return findings;
}

/* ------------------------------------------------------------------ */
/* §27 — Family education                                              */
/* ------------------------------------------------------------------ */

/**
 * The curriculum (§27).
 *
 * Ordered roughly by dependency: cash flow before investing, debt before real
 * estate, behavioural finance before capital allocation. The order is a teaching
 * sequence, not a gate — an adult learner may start anywhere.
 */
export const EDUCATION_TOPICS = [
  { code: "FINANCIAL_LITERACY", label: "Financial literacy", order: 1 },
  { code: "ACCOUNTING", label: "Accounting", order: 2 },
  { code: "CASH_FLOW", label: "Cash flow", order: 3 },
  { code: "ASSETS_AND_LIABILITIES", label: "Assets and liabilities", order: 4 },
  { code: "DEBT", label: "Debt", order: 5 },
  { code: "RISK", label: "Risk", order: 6 },
  { code: "COMPOUNDING", label: "Compounding", order: 7 },
  { code: "INVESTING", label: "Investing", order: 8 },
  { code: "REAL_ESTATE", label: "Real estate", order: 9 },
  { code: "BUSINESS", label: "Business", order: 10 },
  { code: "TAX", label: "Tax", order: 11 },
  { code: "BEHAVIOURAL_FINANCE", label: "Behavioural finance", order: 12 },
  { code: "CAPITAL_ALLOCATION", label: "Capital allocation", order: 13 },
  { code: "ENTREPRENEURSHIP", label: "Entrepreneurship", order: 14 },
  { code: "GOVERNANCE", label: "Governance", order: 15 },
] as const;
export type EducationTopicCode = (typeof EDUCATION_TOPICS)[number]["code"];

/** The delivery forms §27 names. */
export const EDUCATION_FORMATS = ["LESSON", "SIMULATION", "CASE_STUDY", "QUIZ", "DECISION_JOURNAL_EXERCISE"] as const;
export type EducationFormat = (typeof EDUCATION_FORMATS)[number];

export type EducationLesson = {
  id: string;
  tenantId: string;
  topic: EducationTopicCode;
  format: EducationFormat;
  title: string;
  /** The learning objective: what the learner should be able to do afterwards. */
  learningObjective: string;
  /** Prerequisite lessons, by id. */
  prerequisites: readonly string[];
  /** Estimated minutes. */
  durationMinutes: number;
  /** Whether it is a simulation the learner can run against their own data. */
  usesLiveFamilyData: boolean;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
};

export type EducationProgress = {
  id: string;
  tenantId: string;
  familyMemberRef: string;
  lessonId: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Score for a quiz, basis points. Null for a non-assessed format. */
  scoreBps: number | null;
  /** The decision journal entry produced, where the format requires one. */
  journalEntryRef: string | null;
  /** The learner's own reflection. Required for a decision journal exercise. */
  reflection: string | null;
};

/**
 * Validate education progress.
 *
 * A `DECISION_JOURNAL_EXERCISE` without a journal entry, or with no reflection,
 * is incomplete: the point of the exercise is the learner's own reasoning, and a
 * completion record without it records attendance rather than learning.
 */
export function validateEducationProgress(params: {
  progress: EducationProgress;
  lesson: EducationLesson;
}): readonly string[] {
  const findings: string[] = [];
  if (params.lesson.prerequisites.length > 0 && params.progress.completedAt) {
    findings.push(`Prerequisite check required: ${params.lesson.prerequisites.join(", ")}. Completion is recorded here; whether the prerequisites were met is the caller's to assert.`);
  }
  if (params.lesson.format === "DECISION_JOURNAL_EXERCISE") {
    if (!params.progress.journalEntryRef) findings.push("A decision journal exercise must produce a journal entry. Without one the exercise recorded attendance, not reasoning.");
    if (!params.progress.reflection || params.progress.reflection.trim().length < 20) findings.push("A decision journal exercise requires the learner's own reflection.");
  }
  if (params.lesson.format === "QUIZ" && params.progress.completedAt && params.progress.scoreBps === null) {
    findings.push("A completed quiz must carry a score.");
  }
  if (params.progress.completedAt && !params.progress.startedAt) {
    findings.push("A completed lesson must record when it started.");
  }
  if (params.lesson.usesLiveFamilyData) {
    findings.push("This lesson uses live family data, so it is subject to the same RBAC, ABAC, RLS and classification controls as the data itself. A learner without clearance must not see it.");
  }
  return findings;
}

/**
 * Readiness summary: which topics a member has covered and which gaps remain
 * against a succession objective's required preparation.
 *
 * Readiness is reported, never granted. Whether a member is ready to hold an
 * interest is a governance judgement, and this module does not make it.
 */
export function educationReadiness(params: {
  objective: SuccessionObjective;
  completedTopicCodes: readonly EducationTopicCode[];
}): {
  engineVersion: string;
  objectiveId: string;
  requiredPreparation: readonly string[];
  completedTopics: readonly EducationTopicCode[];
  /** Preparation items with no matching completed topic. */
  gaps: readonly string[];
  /** Always false: readiness is never granted by this module. */
  grantsReadiness: false;
  explanation: string[];
} {
  const completed = new Set(params.completedTopicCodes.map((c) => c.toUpperCase()));
  const gaps = params.objective.requiredPreparation.filter((p) => !completed.has(p.toUpperCase().replace(/[^A-Z0-9]/g, "_")));

  return {
    engineVersion: FAMILY_GENERATIONAL_VERSION,
    objectiveId: params.objective.id,
    requiredPreparation: params.objective.requiredPreparation,
    completedTopics: params.completedTopicCodes,
    gaps,
    grantsReadiness: false,
    explanation: [
      `Objective "${params.objective.objective}" requires: ${params.objective.requiredPreparation.join(", ")}.`,
      gaps.length === 0 ? "Every required preparation item has a matching completed topic." : `Gaps: ${gaps.join(", ")}.`,
      "This is a coverage report, not a readiness decision. Whether the member is ready to hold an interest is a governance judgement made by a human (§26); this module never grants it.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* §30 — Business systemisation                                        */
/* ------------------------------------------------------------------ */

/**
 * The maturity ladder (§30), in order.
 *
 * Each level is defined by what the business depends on, not by how well it
 * performs: a highly profitable business can be FOUNDER_DEPENDENT, and that is
 * precisely the risk CAP-013 exists to surface.
 */
export const BUSINESS_MATURITY_LEVELS = [
  { rank: 1, code: "FOUNDER_DEPENDENT", label: "Founder dependent", description: "The business depends on the founder personally." },
  { rank: 2, code: "PROCESS_DEPENDENT", label: "Process dependent", description: "Documented processes carry the work, but the founder still decides." },
  { rank: 3, code: "TECHNOLOGY_ASSISTED", label: "Technology assisted", description: "Systems carry routine work and reduce human dependency." },
  { rank: 4, code: "MANAGEMENT_OPERATED", label: "Management operated", description: "A management team runs the business day to day." },
  { rank: 5, code: "GOVERNANCE_CONTROLLED", label: "Governance controlled", description: "A board governs the business; management is accountable to it." },
  { rank: 6, code: "OWNER_INDEPENDENT", label: "Owner independent", description: "The business operates without the owner's involvement." },
] as const;
export type BusinessMaturityCode = (typeof BUSINESS_MATURITY_LEVELS)[number]["code"];

/** The dimensions assessed (§30). */
export const SYSTEMISATION_DIMENSIONS = [
  "FOUNDER_DEPENDENCE",
  "SOP_COVERAGE",
  "MANAGEMENT_DEPTH",
  "AUTOMATION",
  "DELEGATION",
  "TECHNOLOGY",
  "SUCCESSION",
  "KEY_PERSON_RISK",
] as const;
export type SystemisationDimension = (typeof SYSTEMISATION_DIMENSIONS)[number];

export type BusinessMaturityAssessment = {
  id: string;
  tenantId: string;
  /** The canonical legal entity. Attribution lives with the entity, not the family. */
  legalEntityRef: string;
  asOf: string;
  /** Per-dimension findings. `evidence` is required: a rating without evidence is an opinion. */
  dimensions: {
    dimension: SystemisationDimension;
    /** Basis points: 0 = absent, 10000 = fully established. */
    scoreBps: number;
    evidence: string;
    /** What would raise the score. */
    gap: string | null;
  }[];
  /** The overall level. Derived from the dimensions, stated by the assessor. */
  assessedLevel: BusinessMaturityCode;
  /** Key-person risk: named individuals the business could not operate without. */
  keyPersons: readonly { personRef: string; role: string; mitigated: boolean }[];
  assessorRef: string;
  /** Always a human. An AI assessment of management depth is not an assessment. */
  assessorType: "HUMAN" | "AI";
  /** The governance act that adopted the assessment. */
  adoptedByRef: string | null;
};

/**
 * Validate a maturity assessment.
 *
 * Every dimension needs evidence. An unmitigated key person is flagged, not
 * scored away: naming the dependency is the point of the assessment, and a
 * business that cannot survive one person's absence is a capital risk whatever
 * its revenue.
 */
export function validateBusinessMaturityAssessment(assessment: BusinessMaturityAssessment): readonly string[] {
  const findings: string[] = [];
  if (assessment.assessorType !== "HUMAN") {
    findings.push("A maturity assessment must be made by a human. An analytical system can summarise the evidence; judging management depth is a human act.");
  }
  const covered = new Set(assessment.dimensions.map((d) => d.dimension));
  for (const dimension of SYSTEMISATION_DIMENSIONS) {
    if (!covered.has(dimension)) findings.push(`Dimension ${dimension} was not assessed. A partial assessment cannot support an overall level.`);
  }
  for (const dimension of assessment.dimensions) {
    if (!Number.isInteger(dimension.scoreBps) || dimension.scoreBps < 0 || dimension.scoreBps > 10_000) {
      findings.push(`${dimension.dimension}: score must be 0–10000 basis points; received ${dimension.scoreBps}.`);
    }
    if (dimension.evidence.trim().length < 15) {
      findings.push(`${dimension.dimension}: evidence is required. A rating without evidence is an opinion, and an opinion cannot support a capital decision.`);
    }
  }
  const unmitigated = assessment.keyPersons.filter((k) => !k.mitigated);
  if (unmitigated.length > 0) {
    findings.push(`Unmitigated key-person risk: ${unmitigated.map((k) => `${k.personRef} (${k.role})`).join(", ")}. This is reported, not scored away: naming the dependency is the point of the assessment.`);
  }
  if (!assessment.adoptedByRef) findings.push("The governance act that adopted the assessment is required.");
  return findings;
}

/**
 * The lowest dimension score, which is what actually limits the business.
 *
 * A business scored 9000 on technology and 1000 on succession is not "mostly
 * systematised"; it is one resignation away from a crisis. Reporting the average
 * would hide exactly the thing the assessment exists to find, so this returns the
 * minimum and names the dimension.
 */
export function limitingDimension(assessment: BusinessMaturityAssessment): {
  dimension: SystemisationDimension | null;
  scoreBps: number | null;
  gap: string | null;
  explanation: string;
} {
  if (assessment.dimensions.length === 0) {
    return { dimension: null, scoreBps: null, gap: null, explanation: "No dimensions were assessed, so no limiting dimension can be identified." };
  }
  const sorted = [...assessment.dimensions].sort((a, b) => a.scoreBps - b.scoreBps);
  const lowest = sorted[0];
  const average = Math.round(assessment.dimensions.reduce((s, d) => s + d.scoreBps, 0) / assessment.dimensions.length);
  return {
    dimension: lowest.dimension,
    scoreBps: lowest.scoreBps,
    gap: lowest.gap,
    explanation: `The limiting dimension is ${lowest.dimension} at ${lowest.scoreBps} bps (average across dimensions: ${average} bps). The average is reported alongside it precisely because it would hide this: a business strong everywhere except succession is one resignation away from a crisis, and CAP-013 exists to surface that before capital is committed.`,
  };
}
