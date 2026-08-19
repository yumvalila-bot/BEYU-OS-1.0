import type { TaxEligibilityCriterion } from "@/db/schema";

/**
 * Tax Strategy Intelligence (capability inside Finance OS — never a separate OS).
 *
 * The engine determines whether a lawful strategy EXISTS for a taxpayer in a
 * jurisdiction, on what legal basis, with what evidence, risk and governance.
 * It NEVER recommends evasion, and every prohibited position is hard-blocked.
 */

export type TaxpayerFacts = Record<string, string | number | boolean | string[]>;

export type EligibilityOutcome = {
  eligibility: "ELIGIBLE" | "CONDITIONAL" | "INELIGIBLE" | "UNDER_REVIEW";
  metCriteria: string[];
  unmetCriteria: string[];
  blocked: boolean;
  blockReason?: string;
  riskSummary: string;
  governanceRequirement: string;
  humanReviewRequired: boolean;
  estimatedBenefit: number | null;
  rationale: string[];
};

function criterionSatisfied(c: TaxEligibilityCriterion, facts: TaxpayerFacts): boolean {
  const actual = facts[c.key];
  if (actual === undefined || actual === null) return false;
  switch (c.operator) {
    case "EQUALS":
      return String(actual).toUpperCase() === String(c.value).toUpperCase();
    case "AT_LEAST":
      return Number(actual) >= Number(c.value);
    case "AT_MOST":
      return Number(actual) <= Number(c.value);
    case "IN":
      return Array.isArray(c.value) && c.value.map(String).includes(String(actual));
    default:
      return false;
  }
}

export function assessTaxStrategy(input: {
  strategy: {
    code: string;
    title: string;
    jurisdictionCode: string;
    position: string;
    authorityStatus: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
    reviewDate: string;
    benefitRate: number | null;
    complianceRisk: number;
    auditRisk: number;
    legalRisk: number;
    reputationalRisk: number;
    requiredApprovals: string[];
    eligibilityCriteria: TaxEligibilityCriterion[];
    economicBenefitBasis: string;
  };
  taxpayerJurisdiction: string;
  facts: TaxpayerFacts;
  baseAmount: number;
  asOf?: string;
}): EligibilityOutcome {
  const { strategy, facts } = input;
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const rationale: string[] = [];

  // 1. Absolute prohibition — never returned as an option.
  if (strategy.position === "PROHIBITED_EVASION") {
    return {
      eligibility: "INELIGIBLE",
      metCriteria: [],
      unmetCriteria: [],
      blocked: true,
      blockReason: "Position classified as unlawful evasion. BEYU OS prohibits recommendation or execution.",
      riskSummary: "Unlawful. Not available under any circumstance.",
      governanceRequirement: "Report to Chief Governance Officer if requested.",
      humanReviewRequired: true,
      estimatedBenefit: null,
      rationale: ["Constitutional Article: no mechanism may facilitate illegal tax evasion."],
    };
  }

  // 2. Jurisdiction gate — Tanzanian (or any) rules never generalise globally.
  if (strategy.jurisdictionCode !== input.taxpayerJurisdiction) {
    return {
      eligibility: "INELIGIBLE",
      metCriteria: [],
      unmetCriteria: [`jurisdiction=${strategy.jurisdictionCode}`],
      blocked: false,
      riskSummary: `Strategy is authoritative only in ${strategy.jurisdictionCode}; taxpayer is in ${input.taxpayerJurisdiction}.`,
      governanceRequirement: "None — not applicable.",
      humanReviewRequired: false,
      estimatedBenefit: null,
      rationale: [
        `Jurisdiction mismatch: ${strategy.jurisdictionCode} rule cannot be applied to ${input.taxpayerJurisdiction}.`,
      ],
    };
  }

  // 3. Knowledge authority gate — expired/under review knowledge is not authoritative.
  if (strategy.authorityStatus !== "AUTHORITATIVE" || (strategy.effectiveTo && strategy.effectiveTo < asOf)) {
    return {
      eligibility: "UNDER_REVIEW",
      metCriteria: [],
      unmetCriteria: ["authority_status"],
      blocked: false,
      riskSummary: "Underlying legal source is not currently authoritative (expired or under review).",
      governanceRequirement: "Tax Governance Committee must re-validate the legal basis before any reliance.",
      humanReviewRequired: true,
      estimatedBenefit: null,
      rationale: [`Authority status is ${strategy.authorityStatus}; reliance suspended.`],
    };
  }

  // 4. Statutory eligibility evaluation.
  const met: string[] = [];
  const unmet: string[] = [];
  for (const c of strategy.eligibilityCriteria) {
    if (criterionSatisfied(c, facts)) met.push(c.label);
    else if (c.mandatory) unmet.push(c.label);
    else unmet.push(`${c.label} (optional)`);
  }
  const mandatoryUnmet = strategy.eligibilityCriteria.filter(
    (c) => c.mandatory && !criterionSatisfied(c, facts),
  );

  const riskScore =
    strategy.complianceRisk + strategy.auditRisk + strategy.legalRisk + strategy.reputationalRisk;
  const humanReviewRequired = strategy.position === "AGGRESSIVE_UNCERTAIN" || riskScore >= 10;

  let eligibility: EligibilityOutcome["eligibility"];
  if (mandatoryUnmet.length === 0) {
    eligibility = strategy.position === "AGGRESSIVE_UNCERTAIN" ? "CONDITIONAL" : "ELIGIBLE";
    rationale.push("All mandatory statutory criteria satisfied on the facts supplied.");
  } else if (mandatoryUnmet.length <= 1) {
    eligibility = "CONDITIONAL";
    rationale.push(`Conditional: ${mandatoryUnmet.length} mandatory criterion outstanding.`);
  } else {
    eligibility = "INELIGIBLE";
    rationale.push(`Ineligible: ${mandatoryUnmet.length} mandatory criteria unmet.`);
  }

  const estimatedBenefit =
    eligibility === "ELIGIBLE" || eligibility === "CONDITIONAL"
      ? Math.round((strategy.benefitRate ?? 0) * input.baseAmount * 100) / 100
      : null;

  rationale.push(`Economic benefit basis: ${strategy.economicBenefitBasis}.`);
  rationale.push(
    `Aggregate risk score ${riskScore}/20 (compliance ${strategy.complianceRisk}, audit ${strategy.auditRisk}, legal ${strategy.legalRisk}, reputational ${strategy.reputationalRisk}).`,
  );

  return {
    eligibility,
    metCriteria: met,
    unmetCriteria: unmet,
    blocked: false,
    riskSummary:
      riskScore >= 12
        ? "High aggregate risk — board-level tax governance approval required."
        : riskScore >= 7
          ? "Moderate risk — Tax Governance Committee approval required."
          : "Low risk — standard documentation and filing controls apply.",
    governanceRequirement:
      strategy.requiredApprovals.length > 0
        ? `Required approvals: ${strategy.requiredApprovals.join(", ")}.`
        : "CFO approval and contemporaneous documentation.",
    humanReviewRequired,
    estimatedBenefit,
    rationale,
  };
}
