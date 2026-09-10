/**
 * BEYU OS — FAMILY OFFICE INTELLIGENCE: Noelia's capital command centre
 * (§23, §24, §25).
 *
 * ============================ EXTEND, DO NOT DUPLICATE ========================
 *
 * This module does NOT create a second AI identity. Noelia is
 * `NOELIA_IDENTITY` in `src/lib/constants.ts`, served by `src/lib/noelia.ts` and
 * the thirty-seven modules under `src/lib/noelia/`, exposed through seventeen
 * routes under `src/app/api/v1/ai/noelia/*`, and already governed by
 * `NOELIA_EPISTEMIC_STATUS`, FIR-017 and the Noelia governance-boundary
 * migration `0014_noelia_governance_boundary.sql`.
 *
 * What this module adds is the FAMILY OFFICE capability surface for that same
 * identity: the question catalogue (§25), the CAN/CANNOT authority boundary
 * (§24) expressed for capital matters, and the seven-way epistemic tagging
 * (§25: FACT, CALCULATION, ASSUMPTION, INFERENCE, SCENARIO, RECOMMENDATION,
 * UNCERTAINTY) that every answer must carry.
 *
 * The analysis types it uses already exist in `NoeliaAnalysisType`
 * (`src/lib/noelia/types.ts:375`): CAPITAL_ANALYSIS, LIQUIDITY_ANALYSIS,
 * CONCENTRATION_ANALYSIS, STRESS_TEST, SCENARIO_COMPARISON, RISK_ANALYSIS,
 * PERFORMANCE_ANALYSIS, OPPORTUNITY_DETECTION, EARLY_WARNING,
 * GOVERNANCE_ANALYSIS, TREND_ANALYSIS, SENSITIVITY_ANALYSIS. Nothing new is
 * invented, and no second runtime is started.
 *
 * ============================== THE AUTHORITY BOUNDARY ==========================
 *
 * The boundary is enforced structurally, not by comment. `NoeliaCapitalAnswer`
 * has no field in which an approval, a transfer, an execution or an ownership
 * change could be recorded, and `assertNoeliaStaysWithinAuthority` throws if a
 * proposed action names one. The chain is fixed:
 *
 *   NOELIA → RECOMMENDATION
 *   HUMAN/GOVERNANCE → APPROVAL
 *   AUTHORIZED SYSTEM → EXECUTION
 *   FINANCE OS → ACCOUNTING
 *   AUDIT → PROOF
 */

import type { NoeliaAnalysisType } from "@/lib/noelia/types";
import type { CapitalEpistemicClass } from "./metrics";

export const FAMILY_OFFICE_NOELIA_VERSION = "family-office-noelia-1.0.0";

/* ------------------------------------------------------------------ */
/* §25 — The question catalogue                                        */
/* ------------------------------------------------------------------ */

/**
 * The twelve questions §25 names, each mapped to the analysis type that answers
 * it, the inputs it needs, and the epistemic classes its answer may legitimately
 * contain.
 *
 * `permittedClasses` is the important field. A question about net worth may be
 * answered with FACT and CALCULATION; it may not be answered with SCENARIO,
 * because a hypothetical net worth presented in answer to "what is our net
 * worth?" is a fabricated one. The constraint is checked by
 * `assertAnswerClassesArePermitted`.
 */
export const FAMILY_OFFICE_QUESTIONS = [
  {
    code: "CAPITAL_STATUS",
    question: "What is happening to family capital?",
    analysisType: "CAPITAL_ANALYSIS" as NoeliaAnalysisType,
    requiredInputs: ["BALANCE_SHEET", "CASH_FLOW", "PORTFOLIO"] as const,
    permittedClasses: ["FACT", "CALCULATION", "INFERENCE", "UNCERTAINTY"] as const,
  },
  {
    code: "NET_WORTH",
    question: "What is our current net worth?",
    analysisType: "KPI_ANALYSIS" as NoeliaAnalysisType,
    requiredInputs: ["BALANCE_SHEET"] as const,
    permittedClasses: ["FACT", "CALCULATION", "UNCERTAINTY"] as const,
  },
  {
    code: "CAPITAL_DEPLOYMENT",
    question: "Where is capital deployed?",
    analysisType: "CONCENTRATION_ANALYSIS" as NoeliaAnalysisType,
    requiredInputs: ["PORTFOLIO", "BALANCE_SHEET"] as const,
    permittedClasses: ["FACT", "CALCULATION"] as const,
  },
  {
    code: "CASH_FLOW_RANKING",
    question: "Which assets generate the most cash flow?",
    analysisType: "PERFORMANCE_ANALYSIS" as NoeliaAnalysisType,
    requiredInputs: ["PORTFOLIO", "CASH_FLOW"] as const,
    permittedClasses: ["FACT", "CALCULATION"] as const,
  },
  {
    code: "DEBT_MATURITY",
    question: "What debt matures soon?",
    analysisType: "LIQUIDITY_ANALYSIS" as NoeliaAnalysisType,
    requiredInputs: ["OBLIGATIONS"] as const,
    permittedClasses: ["FACT", "CALCULATION"] as const,
  },
  {
    code: "CONCENTRATION",
    question: "Where are we over-concentrated?",
    analysisType: "CONCENTRATION_ANALYSIS" as NoeliaAnalysisType,
    requiredInputs: ["PORTFOLIO", "BALANCE_SHEET"] as const,
    permittedClasses: ["FACT", "CALCULATION", "INFERENCE", "UNCERTAINTY"] as const,
  },
  {
    code: "UNDERPERFORMANCE",
    question: "What investments are underperforming?",
    analysisType: "PERFORMANCE_ANALYSIS" as NoeliaAnalysisType,
    requiredInputs: ["PORTFOLIO", "THESIS"] as const,
    permittedClasses: ["FACT", "CALCULATION", "INFERENCE", "UNCERTAINTY"] as const,
  },
  {
    code: "OPPORTUNITIES",
    question: "What opportunities should we investigate?",
    analysisType: "OPPORTUNITY_DETECTION" as NoeliaAnalysisType,
    requiredInputs: ["PORTFOLIO", "INTELLIGENCE"] as const,
    permittedClasses: ["INFERENCE", "RECOMMENDATION", "UNCERTAINTY"] as const,
  },
  {
    code: "WHAT_COULD_GO_WRONG",
    question: "What could go wrong?",
    analysisType: "RISK_ANALYSIS" as NoeliaAnalysisType,
    requiredInputs: ["PORTFOLIO", "OBLIGATIONS", "LIQUIDITY", "INTELLIGENCE"] as const,
    permittedClasses: ["FACT", "CALCULATION", "INFERENCE", "UNCERTAINTY"] as const,
  },
  {
    code: "REVENUE_DECLINE_30",
    question: "What happens under a 30% revenue decline?",
    analysisType: "STRESS_TEST" as NoeliaAnalysisType,
    requiredInputs: ["DEBT", "CASH_FLOW"] as const,
    permittedClasses: ["SCENARIO", "CALCULATION", "UNCERTAINTY"] as const,
  },
  {
    code: "COMMITTEE_CANDIDATES",
    question: "Which capital requests deserve committee review?",
    analysisType: "GOVERNANCE_ANALYSIS" as NoeliaAnalysisType,
    requiredInputs: ["CAPITAL_REQUESTS", "DOCTRINE"] as const,
    permittedClasses: ["FACT", "CALCULATION", "RECOMMENDATION", "UNCERTAINTY"] as const,
  },
  {
    code: "LESSONS_LEARNED",
    question: "What did we learn from previous investments?",
    analysisType: "TREND_ANALYSIS" as NoeliaAnalysisType,
    requiredInputs: ["DECISION_JOURNAL", "POST_INVESTMENT_REVIEWS"] as const,
    permittedClasses: ["FACT", "CALCULATION", "INFERENCE", "UNCERTAINTY"] as const,
  },
] as const;

export type FamilyOfficeQuestionCode = (typeof FAMILY_OFFICE_QUESTIONS)[number]["code"];

/** The §25 epistemic classes every answer must distinguish. */
export const ANSWER_EPISTEMIC_CLASSES = ["FACT", "CALCULATION", "ASSUMPTION", "INFERENCE", "SCENARIO", "RECOMMENDATION", "UNCERTAINTY"] as const;
export type AnswerEpistemicClass = (typeof ANSWER_EPISTEMIC_CLASSES)[number];

/**
 * Map from the §25 answer classes onto the canonical Finance OS epistemic model,
 * so a Family Office answer can be compared with a Finance OS figure without
 * anybody translating by hand. This is the reconciliation
 * `src/lib/finance/epistemics.ts` exists to make possible.
 */
export const ANSWER_CLASS_TO_CANONICAL: Record<AnswerEpistemicClass, CapitalEpistemicClass> = {
  FACT: "OBSERVED",
  CALCULATION: "DERIVED",
  ASSUMPTION: "ASSUMPTION",
  INFERENCE: "DERIVED",
  SCENARIO: "SCENARIO",
  RECOMMENDATION: "REQUIRES_AUTHORITY",
  UNCERTAINTY: "DATA_NOT_AVAILABLE",
};

export function isFamilyOfficeQuestion(value: string): value is FamilyOfficeQuestionCode {
  return (FAMILY_OFFICE_QUESTIONS.map((q) => q.code) as readonly string[]).includes(value);
}

export function questionByCode(code: FamilyOfficeQuestionCode) {
  const found = FAMILY_OFFICE_QUESTIONS.find((q) => q.code === code);
  if (!found) throw new Error(`Unknown Family Office question: ${code}`);
  return found;
}

/**
 * The honest gap: which inputs a question needs that were not supplied.
 *
 * Noelia answers from what it was given. When a required input is missing the
 * answer says so and reports the affected measure as UNCERTAINTY — it does not
 * fill the gap with a plausible number. That is the difference between an
 * analytical system and a fabrication engine.
 */
export function questionInputGaps(code: FamilyOfficeQuestionCode, suppliedInputs: readonly string[]): readonly string[] {
  const question = questionByCode(code);
  const supplied = new Set(suppliedInputs);
  return question.requiredInputs.filter((input) => !supplied.has(input));
}

/* ------------------------------------------------------------------ */
/* §24 — The authority boundary                                        */
/* ------------------------------------------------------------------ */

/** What Noelia CAN do (§24). */
export const NOELIA_CAN = ["ANALYZE", "CALCULATE", "SUMMARIZE", "SIMULATE", "RECOMMEND", "ALERT", "DRAFT"] as const;
export type NoeliaCanAction = (typeof NOELIA_CAN)[number];

/**
 * What Noelia CANNOT do independently (§24).
 *
 * Each carries the reason, because the boundary is a governance design and not a
 * technical limitation: nothing in the runtime would stop these if the design
 * permitted them, which is exactly why the design forbids them explicitly.
 */
export const NOELIA_CANNOT = [
  { code: "APPROVE", reason: "Approval is an accountable human act. An approval that cannot be attributed to a person cannot be audited, challenged or reversed." },
  { code: "TRANSFER_MONEY", reason: "Money movement is execution, and execution requires authority the intelligence layer does not hold." },
  { code: "EXECUTE_INVESTMENTS", reason: "Executing an investment commits capital. Committing capital on an analytical view would make the analysis the decision." },
  { code: "EXECUTE_LOANS", reason: "A loan creates an obligation. Creating obligations is a governance act." },
  { code: "CHANGE_OWNERSHIP", reason: "Ownership change alters who owns the family's capital. That is the most consequential act in the system and is never automated." },
  { code: "BYPASS_GOVERNANCE", reason: "The governance engine is the authority. An analytical layer that could route around it would be the authority." },
  { code: "BYPASS_CAP_POSTING", reason: "CAP_POSTING is the capital control. Bypassing it is a P0 by definition." },
  { code: "BYPASS_AUDIT", reason: "Audit is the proof. An action that is not audited did not, for governance purposes, happen." },
] as const;
export type NoeliaCannotAction = (typeof NOELIA_CANNOT)[number]["code"];

/** The fixed chain (§24). */
export const NOELIA_AUTHORITY_CHAIN = [
  { actor: "NOELIA", role: "RECOMMENDATION", description: "Analyses, calculates, simulates, recommends, alerts and drafts." },
  { actor: "HUMAN/GOVERNANCE", role: "APPROVAL", description: "A person with authority decides, and the decision is attributed to them." },
  { actor: "AUTHORIZED_SYSTEM", role: "EXECUTION", description: "An authorised system executes under the recorded authority." },
  { actor: "FINANCE_OS", role: "ACCOUNTING", description: "Finance OS records the accounting. Nobody else posts." },
  { actor: "AUDIT", role: "PROOF", description: "The hash-chained audit ledger is the proof of the whole chain." },
] as const;

/**
 * Assert a proposed Noelia action stays inside the boundary.
 *
 * Throws on any action in `NOELIA_CANNOT`. This is the enforcement point: a
 * capability that exists only as documentation is a capability that will
 * eventually be implemented, so the refusal lives in code.
 */
export function assertNoeliaStaysWithinAuthority(action: string): void {
  const forbidden = NOELIA_CANNOT.find((c) => c.code === action);
  if (forbidden) {
    throw new Error(
      `Noelia cannot ${forbidden.code}. ${forbidden.reason} The chain is fixed: NOELIA → RECOMMENDATION, HUMAN/GOVERNANCE → APPROVAL, AUTHORIZED SYSTEM → EXECUTION, FINANCE OS → ACCOUNTING, AUDIT → PROOF (§24).`,
    );
  }
  if (!(NOELIA_CAN as readonly string[]).includes(action)) {
    throw new Error(`"${action}" is not a Noelia action. Noelia may ${NOELIA_CAN.join(", ")} — the catalogue is closed, so an unlisted action is refused rather than assumed permitted.`);
  }
}

/**
 * The permissions Noelia holds in the Family Office: analytical only (§38).
 *
 * Every one is a read or a draft. There is no approve, execute, transfer or
 * ownership permission in the list, and that absence is the control.
 */
export const NOELIA_FAMILY_OFFICE_CAPABILITIES = [
  "family:capital.read",
  "family:investment.read",
  "family:obligation.read",
  "family:realestate.read",
  "family:treasury.read",
  "family:cashflow.read",
  "family:risk.read",
  "family:liquidity.read",
  "family:scenario.read",
  "family:decisionjournal.read",
  "family:intelligence.read",
  "family:generational.read",
  "ai:noelia.query",
  "ai:noelia.draft",
] as const;
export type NoeliaFamilyOfficeCapability = (typeof NOELIA_FAMILY_OFFICE_CAPABILITIES)[number];

/* ------------------------------------------------------------------ */
/* The answer contract                                                 */
/* ------------------------------------------------------------------ */

/** One tagged statement inside an answer. */
export type AnswerStatement = {
  /** The statement, in words. */
  text: string;
  /** Its epistemic class. Required — an unclassified statement is refused. */
  epistemicClass: AnswerEpistemicClass;
  /** The real records it was derived from. Empty for ASSUMPTION and SCENARIO. */
  sourceRefs: readonly string[];
  /** For a CALCULATION: the method, so it can be independently rechecked. */
  calculationMethod: string | null;
  /** For an ASSUMPTION: what was assumed. Required. */
  assumption: string | null;
  /** For UNCERTAINTY: what is missing. Required. */
  missingInput: string | null;
};

/**
 * A Noelia Family Office answer.
 *
 * Note what is ABSENT: there is no approval field, no execution field, no
 * transfer field and no ownership field. An answer structurally cannot carry one,
 * which is a stronger guarantee than a validation rule that checks for them.
 */
export type NoeliaCapitalAnswer = {
  engineVersion: string;
  /** Always the canonical Noelia identity. Never a second AI. */
  identity: "NOELIA";
  questionCode: FamilyOfficeQuestionCode;
  /** The canonical analysis type from `src/lib/noelia/types.ts`. */
  analysisType: NoeliaAnalysisType;
  headline: string;
  statements: AnswerStatement[];
  /** Inputs that were required and absent. The answer must name them. */
  missingInputs: readonly string[];
  /** What Noelia recommends. Advisory; requires an accountable human decision. */
  recommendations: readonly { text: string; rationale: string; requiresHumanDecision: true }[];
  /** Always true. A capital answer always requires human review. */
  humanReviewRequired: true;
  /** The scopes withheld from this caller by RBAC/ABAC/RLS. Never silently omitted. */
  deniedScopes: readonly string[];
  /** Always false. Noelia never executes. */
  executedAnything: false;
  asOf: string;
};

/**
 * Validate an answer against the §25 contract.
 *
 * Four checks, each a distinct failure mode:
 *   1. Every statement carries an epistemic class.
 *   2. Only classes the question permits appear. A SCENARIO in answer to "what is
 *      our net worth?" is a fabricated net worth.
 *   3. Every class carries its required companion: a CALCULATION needs a method,
 *      an ASSUMPTION needs the assumption, an UNCERTAINTY needs the missing input.
 *   4. Missing required inputs are named in `missingInputs`, not quietly omitted.
 */
export function validateNoeliaAnswer(answer: NoeliaCapitalAnswer): readonly string[] {
  const findings: string[] = [];
  const question = questionByCode(answer.questionCode);
  const permitted = new Set(question.permittedClasses as readonly string[]);

  for (const [i, statement] of answer.statements.entries()) {
    if (!statement.epistemicClass) {
      findings.push(`Statement ${i + 1} has no epistemic class. An unclassified statement cannot be relied on, because the reader cannot tell a fact from a guess.`);
      continue;
    }
    if (!permitted.has(statement.epistemicClass)) {
      findings.push(
        `Statement ${i + 1} is classed ${statement.epistemicClass}, which "${question.question}" does not permit (${question.permittedClasses.join(", ")}). Answering a factual question with a scenario is a fabricated answer.`,
      );
    }
    if (statement.epistemicClass === "CALCULATION" && !statement.calculationMethod) {
      findings.push(`Statement ${i + 1} is a CALCULATION with no stated method. A number that cannot be independently rechecked is not a calculation.`);
    }
    if (statement.epistemicClass === "ASSUMPTION" && !statement.assumption) {
      findings.push(`Statement ${i + 1} is an ASSUMPTION that does not state what was assumed.`);
    }
    if (statement.epistemicClass === "UNCERTAINTY" && !statement.missingInput) {
      findings.push(`Statement ${i + 1} is UNCERTAINTY that does not name the missing input. Uncertainty without a cause cannot be resolved.`);
    }
    if (statement.epistemicClass === "FACT" && statement.sourceRefs.length === 0) {
      findings.push(`Statement ${i + 1} is a FACT with no source reference. A fact with no source is an assertion.`);
    }
  }

  for (const missing of answer.missingInputs) {
    if (!answer.statements.some((s) => s.epistemicClass === "UNCERTAINTY" && s.missingInput === missing)) {
      findings.push(`"${missing}" is listed as missing but no statement reports it. A gap that is listed but never surfaced is a gap the reader will not see.`);
    }
  }
  for (const recommendation of answer.recommendations) {
    if (recommendation.requiresHumanDecision !== true) {
      findings.push("Every recommendation must require a human decision (§24).");
    }
    if (recommendation.rationale.trim().length < 10) {
      findings.push("A recommendation must state its rationale. 'Noelia said so' is not a sufficient investment rationale (§44).");
    }
  }
  if (answer.humanReviewRequired !== true) findings.push("A capital answer always requires human review (§24).");
  if (answer.executedAnything !== false) findings.push("Noelia never executes (§24).");

  return findings;
}

/**
 * Refuse an answer whose classes the question does not permit.
 *
 * The throwing form of check 2, for callers that must not render a non-conforming
 * answer at all.
 */
export function assertAnswerClassesArePermitted(answer: NoeliaCapitalAnswer): void {
  const question = questionByCode(answer.questionCode);
  const permitted = new Set(question.permittedClasses as readonly string[]);
  const offending = answer.statements.filter((s) => !permitted.has(s.epistemicClass));
  if (offending.length > 0) {
    throw new Error(
      `"${question.question}" permits only ${question.permittedClasses.join(", ")}. Refused ${offending.length} statement(s) classed ${[...new Set(offending.map((s) => s.epistemicClass))].join(", ")}.`,
    );
  }
}

/**
 * Build an answer skeleton for a question, with its input gaps already surfaced.
 *
 * This is the `DRAFT` capability: Noelia prepares the structure and names what it
 * cannot know. A human adopts, corrects or discards it. The skeleton is never an
 * answer on its own — `statements` starts empty precisely so that no number can
 * reach a reader before a statement with an epistemic class carries it.
 */
export function draftAnswerSkeleton(params: {
  questionCode: FamilyOfficeQuestionCode;
  suppliedInputs: readonly string[];
  deniedScopes?: readonly string[];
  asOf: string;
}): NoeliaCapitalAnswer {
  const question = questionByCode(params.questionCode);
  const gaps = questionInputGaps(params.questionCode, params.suppliedInputs);

  return {
    engineVersion: FAMILY_OFFICE_NOELIA_VERSION,
    identity: "NOELIA",
    questionCode: params.questionCode,
    analysisType: question.analysisType,
    headline: `${question.question} — draft skeleton, ${gaps.length} required input(s) missing.`,
    statements: gaps.map((input) => ({
      text: `${input} was not supplied, so nothing can be stated about it.`,
      epistemicClass: "UNCERTAINTY" as AnswerEpistemicClass,
      sourceRefs: [],
      calculationMethod: null,
      assumption: null,
      missingInput: input,
    })),
    missingInputs: gaps,
    recommendations: [],
    humanReviewRequired: true,
    deniedScopes: params.deniedScopes ?? [],
    executedAnything: false,
    asOf: params.asOf,
  };
}
