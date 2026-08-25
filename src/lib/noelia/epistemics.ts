/**
 * NOELIA — canonical epistemic model for intelligence answers (Iteration 10).
 *
 * THE SINGLE SOURCE OF TRUTH FOR EPISTEMIC STATES IS `@/lib/finance/epistemics`
 * (13 canonical classes, Phase 7J §5). This module does not invent new states;
 * it defines how Noelia answers consume them:
 *
 *   SOURCE → DATA QUALITY → PROVENANCE → EPISTEMIC STATE → CONFIDENCE
 *        → UNCERTAINTY → RECOMMENDATION → ACTION → OUTCOME
 *
 * Seven honesty rules are enforced here and tested adversarially:
 *
 *   1. missing ≠ zero                      (MISSING_IS_NOT_ZERO)
 *   2. forecast ≠ actual                   (FORECAST_IS_NOT_ACTUAL)
 *   3. inference ≠ fact                    (INFERENCE_IS_NOT_FACT)
 *   4. stale ≠ current                     (STALE_IS_NOT_CURRENT)
 *   5. unverified ≠ authoritative          (UNVERIFIED_IS_NOT_AUTHORITATIVE)
 *   6. unavailable ≠ negative              (UNAVAILABLE_IS_NOT_NEGATIVE)
 *   7. absence of evidence ≠ evidence of absence (ABSENCE_OF_EVIDENCE_IS_NOT_EVIDENCE_OF_ABSENCE)
 *
 * Where a rule is violated Noelia downgrades confidence, classifies the
 * uncertainty explicitly, or fails closed. No rule may be satisfied by
 * inventing a stronger claim.
 */
import {
  EPISTEMIC_CLASS,
  type EpistemicClass,
  FACTUAL_CLASSES,
  NON_VALUE_CLASSES,
  canPromote,
  combineClasses,
} from "@/lib/finance/epistemics";
import type { Classification } from "@/lib/constants";
import type { NoeliaFinding, NoeliaSource } from "./types";

export { EPISTEMIC_CLASS, FACTUAL_CLASSES, NON_VALUE_CLASSES, canPromote, combineClasses };
export type { EpistemicClass };

/** The canonical epistemic states Noelia may claim. One model, shared with Finance OS. */
export const NOELIA_CANONICAL_STATES: readonly EpistemicClass[] = EPISTEMIC_CLASS;

/** The 7 honesty rules, in canonical form. */
export const HONESTY_RULES = [
  "MISSING_IS_NOT_ZERO",
  "FORECAST_IS_NOT_ACTUAL",
  "INFERENCE_IS_NOT_FACT",
  "STALE_IS_NOT_CURRENT",
  "UNVERIFIED_IS_NOT_AUTHORITATIVE",
  "UNAVAILABLE_IS_NOT_NEGATIVE",
  "ABSENCE_OF_EVIDENCE_IS_NOT_EVIDENCE_OF_ABSENCE",
] as const;
export type HonestyRule = (typeof HONESTY_RULES)[number];

/**
 * A retrieved datum with its epistemic provenance.
 *
 * `epistemicClass` is the class of the underlying datum, normalized through the
 * canonical model (an unknown value is a failure, never a permissive default).
 * `authorityStatus` must be AUTHORITATIVE for the datum to count as verified;
 * the other two window fields express governed validity (dates are YYYY-MM-DD).
 */
export type EvidenceRecord = {
  source: NoeliaSource;
  epistemicClass: EpistemicClass;
  authorityStatus?: string;
  effectiveFrom?: string;
  reviewDate?: string;
  expiresAt?: string | null;
};

export type EvidenceFlags = {
  /** No source was retrieved at all. */
  missingSources: boolean;
  /** At least one source is outside its validity window (STALE_IS_NOT_CURRENT). */
  staleSources: boolean;
  /** Two or more sources about the same subject disagree (contradictory evidence). */
  conflictingSources: boolean;
  /** At least one source lacks ref or authority (provenance loss). */
  missingProvenance: boolean;
  /** At least one source is not AUTHORITATIVE (UNVERIFIED_IS_NOT_AUTHORITATIVE). */
  unverifiedAuthority: boolean;
  /** At least one planned tool was denied (partial authority loss). */
  toolDenials: boolean;
};

export type EvidenceAssessment = {
  /** The weakest epistemic class the answer may claim (never stronger than its inputs). */
  claimedClass: EpistemicClass;
  /** Confidence above this cap would be fabricated certainty. */
  confidenceCap: number;
  /** Human-readable, ordered list of applied downgrades. */
  factors: Array<{ rule: HonestyRule; detail: string }>;
  flags: EvidenceFlags;
};

/** A source is stale when it is not yet effective, past review, or expired at `asOf`. */
export function isSourceStale(
  record: Pick<EvidenceRecord, "effectiveFrom" | "reviewDate" | "expiresAt">,
  asOf: string,
): boolean {
  if (record.effectiveFrom && record.effectiveFrom > asOf) return true;
  if (record.reviewDate && record.reviewDate < asOf) return true;
  if (record.expiresAt && record.expiresAt < asOf) return true;
  return false;
}

/** Stable subject identity for conflict detection: same kind + ref = same claim. */
function subjectKey(source: NoeliaSource): string {
  return `${source.kind}:${source.ref}`;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Assesses the epistemic quality of everything an answer is built on.
 *
 * Pure and total: it never throws on bad evidence — it classifies it. Every
 * downgrade is recorded as an explicit factor so the answer's uncertainty is
 * inspectable, not hidden.
 */
export function assessEvidence(input: {
  evidence: EvidenceRecord[];
  toolDenials: string[];
  asOf: string;
  baseConfidence: number;
}): EvidenceAssessment {
  const { evidence, toolDenials, asOf } = input;
  const factors: EvidenceAssessment["factors"] = [];
  const flags: EvidenceFlags = {
    missingSources: evidence.length === 0,
    staleSources: false,
    conflictingSources: false,
    missingProvenance: false,
    unverifiedAuthority: false,
    toolDenials: toolDenials.length > 0,
  };

  let cap = Math.max(0, Math.min(1, input.baseConfidence));

  // Rule 7 — absence of evidence is not evidence of absence: without a source
  // the answer may not assert that data does not exist; certainty is capped.
  if (flags.missingSources) {
    factors.push({
      rule: "ABSENCE_OF_EVIDENCE_IS_NOT_EVIDENCE_OF_ABSENCE",
      detail: "No source was retrieved; the answer must not assert that the data is absent.",
    });
    cap = Math.min(cap, 0.5);
  }

  // Partial authority loss: a denied tool means the picture is incomplete.
  if (flags.toolDenials) {
    factors.push({
      rule: "UNVERIFIED_IS_NOT_AUTHORITATIVE",
      detail: `Denied scope(s) leave the evidence incomplete: ${toolDenials.join(", ")}.`,
    });
    cap = Math.min(cap, 0.7);
  }

  const bySubject = new Map<string, Set<string>>();
  for (const record of evidence) {
    if (!record.source.ref || !record.source.authority) {
      flags.missingProvenance = true;
    }
    if (record.authorityStatus !== undefined && record.authorityStatus !== "AUTHORITATIVE") {
      flags.unverifiedAuthority = true;
    }
    if (isSourceStale(record, asOf)) flags.staleSources = true;
    const claim = `${record.epistemicClass}|${record.source.authority}`;
    const seen = bySubject.get(subjectKey(record.source)) ?? new Set<string>();
    seen.add(claim);
    bySubject.set(subjectKey(record.source), seen);
  }

  for (const [subject, claims] of bySubject) {
    if (claims.size > 1) {
      flags.conflictingSources = true;
      factors.push({
        rule: "UNAVAILABLE_IS_NOT_NEGATIVE",
        detail: `Contradictory evidence for subject '${subject}'; no ratified rule selects a winner.`,
      });
    }
  }

  if (flags.staleSources) {
    factors.push({
      rule: "STALE_IS_NOT_CURRENT",
      detail: "At least one source is outside its governed validity window.",
    });
    cap = Math.min(cap, 0.7);
  }
  if (flags.missingProvenance) {
    factors.push({
      rule: "UNVERIFIED_IS_NOT_AUTHORITATIVE",
      detail: "At least one source lacks provenance (ref or authority) and cannot be verified.",
    });
    cap = Math.min(cap, 0.6);
  }
  if (flags.unverifiedAuthority) {
    factors.push({
      rule: "UNVERIFIED_IS_NOT_AUTHORITATIVE",
      detail: "At least one source is not AUTHORITATIVE; it is evidence, not authority.",
    });
    cap = Math.min(cap, 0.6);
  }
  if (flags.conflictingSources) {
    cap = Math.min(cap, 0.5);
  }

  // Rule 1/6 — with no evidence the answer claims no epistemic class at all;
  // DATA_NOT_AVAILABLE keeps the absence explicit instead of a zero.
  // A single datum keeps its own class (combineClasses demotes even one
  // observed input, which would be wrong for evidence that is not arithmetic).
  const classes = evidence.map((record) => record.epistemicClass);
  const claimedClass: EpistemicClass =
    evidence.length === 0
      ? "DATA_NOT_AVAILABLE"
      : evidence.length === 1
        ? classes[0]
        : combineClasses(classes);

  return { claimedClass, confidenceCap: round4(cap), factors, flags };
}

/**
 * Resolves the answer-level output class under the weakest-link rule.
 *
 * The class is never stronger than the evidence: a factual claim requires
 * current, provenance-complete, conflict-free sources and sufficient
 * confidence; anything else is downgraded, and conflicts or policy denials
 * fail closed to human review.
 */
export function resolveOutputClass(input: {
  engine: string;
  policyDenied: boolean;
  completelyDenied: boolean;
  findings: NoeliaFinding[];
  assessment: EvidenceAssessment;
  confidence: number;
  obligationsRequireHuman: boolean;
}): "FACT" | "INFERENCE" | "RECOMMENDATION" | "PREDICTION" | "UNCERTAINTY" | "REQUIRES_HUMAN_REVIEW" {
  if (input.policyDenied || input.completelyDenied) return "REQUIRES_HUMAN_REVIEW";
  if (input.engine === "TAX") return "REQUIRES_HUMAN_REVIEW";
  if (input.assessment.flags.conflictingSources) return "REQUIRES_HUMAN_REVIEW";
  if (input.obligationsRequireHuman) return "REQUIRES_HUMAN_REVIEW";

  if (input.assessment.flags.missingSources) return "UNCERTAINTY";

  // Knowledge answers are synthesised from sources; they carry no per-item
  // findings by design, so the empty-findings rule does not apply to them.
  if (input.engine === "KNOWLEDGE") {
    return input.assessment.flags.staleSources
      || input.assessment.flags.missingProvenance
      || input.confidence < 0.5
      ? "UNCERTAINTY"
      : "INFERENCE";
  }

  if (input.findings.length === 0) return "UNCERTAINTY";
  if (input.findings.some((finding) => finding.kind === "RECOMMENDATION")) return "RECOMMENDATION";

  // Rule 3 — inference is never fact: any inferred finding, or evidence that
  // is not direct observation (derived, forecast, …), keeps the whole answer
  // one step away from FACT.
  const allObserved = input.findings.every((finding) => finding.kind === "FACT");
  const sourceBacked = !input.assessment.flags.missingSources;
  const directEvidence = FACTUAL_CLASSES.includes(input.assessment.claimedClass);
  const current = !input.assessment.flags.staleSources;
  const provenComplete = !input.assessment.flags.missingProvenance;
  const sufficient = input.confidence >= 0.5;

  if (input.engine === "KNOWLEDGE") {
    // Synthesizing governed knowledge is inference even when every source is a fact.
    return sourceBacked && current && provenComplete && sufficient ? "INFERENCE" : "UNCERTAINTY";
  }
  if (allObserved && sourceBacked && directEvidence && current && provenComplete && sufficient) return "FACT";
  if (input.confidence < 0.5) return "UNCERTAINTY";
  return "INFERENCE";
}

/**
 * The canonical recommendation record: every Noelia recommendation must carry
 * its full epistemic envelope. Missing fields are failures, not defaults.
 */
export type NoeliaRecommendation = {
  id: string;
  engine: string;
  /** The recommendation statement itself. */
  statement: string;
  epistemicStatus: EpistemicClass;
  evidence: NoeliaSource[];
  assumptions: string[];
  confidence: number;
  uncertainty: {
    classification: EpistemicClass;
    confidenceCap: number;
    factors: string[];
  };
  limitations: string[];
  alternatives: string[];
  /** Conditions under which this recommendation would change. */
  changeConditions: string[];
  provenance: {
    /** The authoritative system of record for the underlying data. */
    sourceOfTruth: string;
    retrievedAt: string;
    traceId: string;
    decisionId: string | null;
  };
  freshness: {
    asOf: string;
    stale: boolean;
  };
  classification: Classification;
  scope: { tenantId: string; legalEntityId: string | null; countryCode: string | null };
  materiality: "LOW" | "MEDIUM" | "HIGH";
  risk: "LOW" | "HIGH";
  authorizationRequired: boolean;
  authorizationBasis: string | null;
  humanReviewRequired: boolean;
};

export class NoeliaRecommendationError extends Error {
  constructor(
    readonly code:
      | "FACTUAL_CLAIM_WITHOUT_EVIDENCE"
      | "FORECAST_PRESENTED_AS_ACTUAL"
      | "CONFIDENCE_EXCEEDS_CAP"
      | "INVALID_EPISTEMIC_STATUS",
    message: string,
  ) {
    super(message);
    this.name = "NoeliaRecommendationError";
  }
}

/**
 * Builds the canonical recommendation from an answer. Fails closed on hard
 * violations (a factual claim without evidence, a forecast presented as
 * actual); clamps soft ones (confidence above the evidence cap) and records
 * the clamp as an uncertainty factor.
 */
export function buildRecommendation(input: {
  id: string;
  engine: string;
  statement: string;
  assessment: EvidenceAssessment;
  evidence: EvidenceRecord[];
  confidence: number;
  findings: NoeliaFinding[];
  assumptions?: string[];
  limitations?: string[];
  alternatives?: string[];
  changeConditions?: string[];
  asOf: string;
  traceId: string;
  decisionId?: string | null;
  classification?: Classification;
  scope: NoeliaRecommendation["scope"];
  materiality?: "LOW" | "MEDIUM" | "HIGH";
  risk?: "LOW" | "HIGH";
  humanReviewRequired: boolean;
  authorizationBasis?: string | null;
}): NoeliaRecommendation {
  const { assessment } = input;

  if (!EPISTEMIC_CLASS.includes(assessment.claimedClass)) {
    throw new NoeliaRecommendationError(
      "INVALID_EPISTEMIC_STATUS",
      `Epistemic status '${String(assessment.claimedClass)}' is not a canonical class.`,
    );
  }
  // Rule 2 — a factual claim must be supported only by factual evidence
  // (POSTED/OBSERVED). A FORECAST, ASSUMPTION or SCENARIO input keeps the
  // claim non-factual; a tampered assessment that says otherwise fails closed.
  if (FACTUAL_CLASSES.includes(assessment.claimedClass)) {
    for (const record of input.evidence) {
      if (!FACTUAL_CLASSES.includes(record.epistemicClass)) {
        throw new NoeliaRecommendationError(
          "FORECAST_PRESENTED_AS_ACTUAL",
          `Evidence of class ${record.epistemicClass} cannot support a factual claim.`,
        );
      }
    }
  }
  // Rule 3 + 7 — a factual epistemic status demands evidence.
  if (FACTUAL_CLASSES.includes(assessment.claimedClass) && input.evidence.length === 0) {
    throw new NoeliaRecommendationError(
      "FACTUAL_CLAIM_WITHOUT_EVIDENCE",
      "A factual recommendation requires at least one proven source.",
    );
  }
  const factors = assessment.factors.map((factor) => `${factor.rule}: ${factor.detail}`);
  let confidence = Math.max(0, Math.min(1, input.confidence));
  if (confidence > assessment.confidenceCap) {
    confidence = assessment.confidenceCap;
    factors.push(`MISSING_IS_NOT_ZERO: confidence clamped to the evidence cap ${assessment.confidenceCap}.`);
  }

  const materiality = input.materiality ?? "LOW";
  const risk = input.risk ?? "LOW";
  const authorizationRequired =
    input.humanReviewRequired || materiality === "HIGH" || risk === "HIGH";

  const sourceOfTruth = input.evidence[0]?.source.authority ?? "NONE";

  return {
    id: input.id,
    engine: input.engine,
    statement: input.statement,
    epistemicStatus: assessment.claimedClass,
    evidence: input.evidence.map((record) => record.source),
    assumptions: [...new Set(input.assumptions ?? [])],
    confidence,
    uncertainty: {
      classification: assessment.claimedClass,
      confidenceCap: assessment.confidenceCap,
      factors,
    },
    limitations: [...new Set(input.limitations ?? [])],
    alternatives: [...new Set(input.alternatives ?? [])],
    changeConditions: [...new Set(input.changeConditions ?? [])],
    provenance: {
      sourceOfTruth,
      retrievedAt: input.asOf,
      traceId: input.traceId,
      decisionId: input.decisionId ?? null,
    },
    freshness: {
      asOf: input.asOf,
      stale: assessment.flags.staleSources,
    },
    classification: input.classification ?? "INTERNAL",
    scope: input.scope,
    materiality,
    risk,
    authorizationRequired,
    authorizationBasis: authorizationRequired ? input.authorizationBasis ?? null : null,
    humanReviewRequired: input.humanReviewRequired,
  };
}

export type RecommendationViolationCode =
  | "MISSING_EVIDENCE_FOR_FACTUAL_CLAIM"
  | "CONFIDENCE_EXCEEDS_CAP"
  | "FORECAST_AS_ACTUAL"
  | "MISSING_PROVENANCE"
  | "MATERIALITY_WITHOUT_AUTHORIZATION"
  | "FABRICATED_CERTAINTY"
  | "ABSENCE_ASSERTED_AS_EVIDENCE"
  | "INCOMPLETE_ENVELOPE";

/**
 * Audits a recommendation (its consumers and the test matrix use this to
 * verify the full epistemic envelope). Returns the violated rule codes; an
 * empty list means the recommendation is epistemically sound.
 */
export function verifyRecommendation(r: NoeliaRecommendation): string[] {
  const violations: string[] = [];

  const incomplete =
    !r.id || !r.engine || !r.statement || !r.provenance.sourceOfTruth || !r.provenance.traceId ||
    !r.provenance.retrievedAt || !r.freshness.asOf || !r.scope.tenantId;
  if (incomplete) violations.push("INCOMPLETE_ENVELOPE");

  if (FACTUAL_CLASSES.includes(r.epistemicStatus) && r.evidence.length === 0) {
    violations.push("MISSING_EVIDENCE_FOR_FACTUAL_CLAIM");
  }
  if (r.confidence > r.uncertainty.confidenceCap + 1e-9) {
    violations.push("CONFIDENCE_EXCEEDS_CAP");
  }
  if (FACTUAL_CLASSES.includes(r.epistemicStatus) && r.evidence.some((source) => source.authority === "FORECAST")) {
    violations.push("FORECAST_AS_ACTUAL");
  }
  if (r.evidence.some((source) => !source.ref || !source.authority)) {
    violations.push("MISSING_PROVENANCE");
  }
  if ((r.materiality === "HIGH" || r.risk === "HIGH") && !r.authorizationRequired) {
    violations.push("MATERIALITY_WITHOUT_AUTHORIZATION");
  }
  // Fabricated certainty: near-full confidence with no evidence at all.
  if (r.evidence.length === 0 && r.confidence >= 0.9) {
    violations.push("FABRICATED_CERTAINTY");
  }
  // Rule 7 — claiming the data is absent is only allowed when the claim is
  // explicit about the retrieval window, never as bare absence-of-evidence.
  if (r.epistemicStatus === "DATA_NOT_AVAILABLE" && r.humanReviewRequired === false && r.evidence.length === 0) {
    violations.push("ABSENCE_ASSERTED_AS_EVIDENCE");
  }
  return violations;
}

/**
 * Convenience: the answer-level honesty check used by consumers and tests.
 * An answer labelled FACT with conflicting/stale/unproven evidence, or with
 * confidence above the evidence cap, is a violation.
 */
export function answerViolatesHonesty(input: {
  outputClass: string;
  confidence: number;
  confidenceCap: number;
  flags: EvidenceFlags;
}): string[] {
  const violations: string[] = [];
  if (input.outputClass === "FACT") {
    if (input.flags.conflictingSources) violations.push("CONFLICT_AS_FACT");
    if (input.flags.staleSources) violations.push("STALE_AS_CURRENT");
    if (input.flags.missingSources) violations.push("ABSENCE_AS_EVIDENCE");
    if (input.flags.missingProvenance) violations.push("UNPROVEN_FACT");
    if (input.confidence > input.confidenceCap + 1e-9) violations.push("CONFIDENCE_EXCEEDS_CAP");
  }
  return violations;
}

/**
 * Rule 1 — missing ≠ zero. A datum of a non-value class (DATA_NOT_AVAILABLE,
 * REQUIRES_AUTHORITY, …) may never carry an amount. The Finance OS
 * constructors (`classifiedValue`/`unavailable`) already refuse this at
 * construction; this assertion re-checks at Noelia's boundary so a tampered
 * or hand-built record cannot smuggle a zero into an absence.
 */
export function assertNoValueCoercion(epistemicClass: EpistemicClass, amount: string | null): void {
  if (NON_VALUE_CLASSES.includes(epistemicClass) && amount !== null) {
    throw new Error(
      `${epistemicClass} asserts no value; carrying an amount '${amount}' violates MISSING_IS_NOT_ZERO.`,
    );
  }
}
