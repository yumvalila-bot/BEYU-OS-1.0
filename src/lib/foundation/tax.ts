/**
 * BEYU Foundation OS — tax intelligence evaluation (pure, deterministic).
 *
 * This is TAX INFORMATION, never professional advice. The engine distinguishes
 * ELIGIBLE / POTENTIALLY_ELIGIBLE / UNDER_REVIEW / CONFIRMED / NOT_ELIGIBLE /
 * EXPIRED / REQUIRES_PROFESSIONAL_REVIEW and refuses to state CONFIRMED
 * without cited evidence. Uncertain cases fail closed to professional review.
 */
import { daysBetweenUtc, isIsoDate } from "./deadlines";
import type { TaxStatus } from "./types";

export type TaxRuleInput = {
  id: string;
  authority: string;
  source: string;
  ruleVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  verificationDate: string | null;
  status: string;
};

export type TaxEvaluationInput = {
  rule: TaxRuleInput | null;
  /** Evidence the foundation actually holds the status (certificate ref, etc). */
  evidenceRefs: string[];
  /** Known disqualifiers, e.g. unrelated business activity above threshold. */
  disqualifiers: string[];
  assumptions: string[];
  todayIso: string;
};

export type TaxEvaluation = {
  status: TaxStatus;
  professionalReviewRequired: boolean;
  reasons: string[];
};

export function ruleIsFresh(rule: TaxRuleInput, todayIso: string): { fresh: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!isIsoDate(rule.effectiveFrom)) reasons.push(`Rule effective-from ${rule.effectiveFrom} is not a valid date`);
  if (rule.effectiveTo && !isIsoDate(rule.effectiveTo)) reasons.push(`Rule effective-to ${rule.effectiveTo} is not valid`);
  if (rule.effectiveTo && rule.effectiveFrom > rule.effectiveTo) reasons.push("Rule effective window is inverted");
  if (rule.effectiveTo && daysBetweenUtc(todayIso, rule.effectiveTo) < 0) reasons.push(`Rule expired on ${rule.effectiveTo}`);
  if (daysBetweenUtc(rule.effectiveFrom, todayIso) < 0) reasons.push(`Rule not yet effective (from ${rule.effectiveFrom})`);
  if (!rule.verificationDate) {
    reasons.push("Rule has never been verified against its source — verification required");
  } else if (!isIsoDate(rule.verificationDate)) {
    reasons.push(`Rule verification date ${rule.verificationDate} is not valid`);
  } else if (daysBetweenUtc(rule.verificationDate, todayIso) > 365) {
    reasons.push(`Rule verification is stale (last verified ${rule.verificationDate})`);
  }
  if (!rule.authority || !rule.source) reasons.push("Rule is missing authority or source citation");
  return { fresh: reasons.length === 0, reasons };
}

export function evaluateTaxStatus(input: TaxEvaluationInput): TaxEvaluation {
  const reasons: string[] = [];
  if (!input.rule) {
    return {
      status: "REQUIRES_PROFESSIONAL_REVIEW",
      professionalReviewRequired: true,
      reasons: ["No applicable tax rule is on record for this jurisdiction/activity — a professional must determine treatment"],
    };
  }
  const { rule } = input;
  const freshness = ruleIsFresh(rule, input.todayIso);
  if (rule.effectiveTo && daysBetweenUtc(input.todayIso, rule.effectiveTo) < 0) {
    return { status: "EXPIRED", professionalReviewRequired: true, reasons: [...freshness.reasons, "The cited rule has expired; treatment must be re-established"] };
  }
  if (input.disqualifiers.length > 0) {
    return {
      status: "NOT_ELIGIBLE",
      professionalReviewRequired: true,
      reasons: [...input.disqualifiers.map((d) => `Disqualifier: ${d}`), "Professional review is still required before acting on ineligibility"],
    };
  }
  if (!freshness.fresh) {
    return {
      status: "REQUIRES_PROFESSIONAL_REVIEW",
      professionalReviewRequired: true,
      reasons: [...freshness.reasons],
    };
  }
  if (input.evidenceRefs.length === 0) {
    return {
      status: input.assumptions.length > 0 ? "POTENTIALLY_ELIGIBLE" : "UNDER_REVIEW",
      professionalReviewRequired: true,
      reasons: [
        `Rule ${rule.authority} v${rule.ruleVersion} appears applicable but no status evidence is on file`,
        ...input.assumptions.map((a) => `Assumption: ${a}`),
      ],
    };
  }
  if (input.assumptions.length > 0) {
    return {
      status: "POTENTIALLY_ELIGIBLE",
      professionalReviewRequired: true,
      reasons: [
        `Evidence on file: ${input.evidenceRefs.join(", ")}`,
        ...input.assumptions.map((a) => `Open assumption: ${a}`),
      ],
    };
  }
  return {
    status: "CONFIRMED",
    professionalReviewRequired: false,
    reasons: [`Confirmed under ${rule.authority} v${rule.ruleVersion}; evidence: ${input.evidenceRefs.join(", ")}`],
  };
}

/**
 * Guard: the words "tax exempt" may only be rendered for CONFIRMED status.
 */
export function mayClaimExempt(status: TaxStatus): boolean {
  return status === "CONFIRMED";
}
