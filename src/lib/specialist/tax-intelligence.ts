/**
 * BEYU OS — Tax Intelligence specialist (Phase 7B, Priority 3).
 *
 * THE MOST DANGEROUS SPECIALIST TO BUILD, AND THEREFORE THE MOST CONSTRAINED.
 *
 * Tax is where an engineering convenience most easily becomes an unratified legal position. This
 * module is built so that it CANNOT do that:
 *
 *   - It ships with ZERO tax rules. The registry is empty, and the seed populates nothing.
 *     No rate, threshold, exemption, deduction, allowance, fiscal year or legal conclusion appears
 *     anywhere in this file.
 *   - A rule can only enter the registry with a jurisdiction, a legal source, an effective date
 *     and an authority status. A rule without provenance is rejected structurally.
 *   - A rule is only APPLICABLE if it is effective-dated for the assessment date AND its authority
 *     status is AUTHORITATIVE. Anything else is reported as REQUIRES_SPECIALIST_REVIEW or LOCKED.
 *   - The module computes CANDIDATE treatments, never treatments. A candidate is a hypothesis with
 *     an evidence requirement attached.
 *
 * SEPARATION MANDATED BY §4. Analysis, planning, compliance, risk and governance are represented
 * as distinct concerns; EXECUTION is absent entirely and is gated by `CAP_VAT` (decision P3),
 * which is locked.
 */
import { SpecialistError, bandRisk, selectEffectiveRules, runSpecialist, type SpecialistContext, type SpecialistResult } from "./platform";

export const TAX_INTELLIGENCE_VERSION = "tax-intel-1.0.0";

/** Authority status of a tax rule. Only AUTHORITATIVE may inform a firm conclusion. */
export type TaxRuleAuthority =
  | "AUTHORITATIVE"
  | "REQUIRES_SPECIALIST_REVIEW"
  | "DRAFT"
  | "SUPERSEDED"
  | "UNVERIFIED";

export type TaxType = "VAT" | "WHT" | "CIT" | "PAYE" | "CGT" | "CUSTOMS" | "OTHER";

/**
 * A tax rule. Every field that makes a rule legally meaningful is REQUIRED, so an
 * under-specified rule cannot be registered at all.
 */
export type TaxRule = {
  ruleCode: string;
  jurisdictionCode: string;
  taxType: TaxType;
  description: string;
  /** Citation of the statute, regulation or ruling. Free text; presence is enforced, truth is not. */
  legalSource: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  authority: TaxRuleAuthority;
  /** Machine-checkable applicability conditions. */
  applicability: {
    entityTypes?: string[];
    minAmountMinor?: number;
    maxAmountMinor?: number;
    currencies?: string[];
  };
  /** What must be retained to defend this position in an audit. */
  evidenceRequirements: string[];
  /** 0-100 assessment of audit challenge risk. Supplied by a specialist, never inferred. */
  auditRiskScore: number;
};

export type TaxAssessmentRequest = {
  jurisdictionCode: string;
  taxType: TaxType;
  /** Transaction amount in minor units. */
  amountMinor: number;
  currency: string;
  entityType?: string;
  /** ISO date the assessment is made as at. */
  asOf: string;
};

export type TaxTreatmentCandidate = {
  ruleCode: string;
  legalSource: string;
  authority: TaxRuleAuthority;
  /** Whether this candidate may be relied upon, and if not, why. */
  status: "APPLICABLE" | "REQUIRES_SPECIALIST_REVIEW" | "NOT_APPLICABLE" | "LOCKED";
  reason: string;
  evidenceRequirements: string[];
  auditRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

export type TaxAssessmentOutput = {
  jurisdictionCode: string;
  taxType: TaxType;
  asOf: string;
  rulesConsidered: number;
  candidates: TaxTreatmentCandidate[];
  /** Always present. Tax computation requires ratified authority that does not exist. */
  computedLiability: null;
  computedLiabilityReason: string;
  complianceChecklist: string[];
  overallRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

/**
 * In-memory rule registry.
 *
 * SHIPS EMPTY, DELIBERATELY. Rules are supplied at runtime by an authorised process; none is
 * hard-coded, because a hard-coded rate or threshold would be an unratified tax position embedded
 * in source. Tests inject synthetic rules with fictitious jurisdictions.
 */
const RULE_REGISTRY = new Map<string, TaxRule>();

/** Structural validation. Rejects any rule that could not be defended. */
export function registerTaxRule(rule: TaxRule): void {
  const required: Array<[keyof TaxRule, string]> = [
    ["ruleCode", "rule code"],
    ["jurisdictionCode", "jurisdiction"],
    ["taxType", "tax type"],
    ["legalSource", "legal source"],
    ["effectiveFrom", "effective from date"],
    ["authority", "authority status"],
  ];
  for (const [field, label] of required) {
    if (!rule[field] || String(rule[field]).trim() === "") {
      throw new SpecialistError("RULE_VIOLATION", `A tax rule requires a ${label}.`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.effectiveFrom)) {
    throw new SpecialistError("RULE_VIOLATION", "effectiveFrom must be an ISO date.");
  }
  if (rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) {
    throw new SpecialistError("RULE_VIOLATION", "effectiveTo cannot precede effectiveFrom.");
  }
  if (!Array.isArray(rule.evidenceRequirements) || rule.evidenceRequirements.length === 0) {
    throw new SpecialistError(
      "RULE_VIOLATION",
      "A tax rule must state what evidence defends it; an undefendable rule is not registrable.",
    );
  }
  if (!Number.isFinite(rule.auditRiskScore) || rule.auditRiskScore < 0 || rule.auditRiskScore > 100) {
    throw new SpecialistError("RULE_VIOLATION", "auditRiskScore must be between 0 and 100.");
  }
  RULE_REGISTRY.set(rule.ruleCode, rule);
}

export function clearTaxRules(): void {
  RULE_REGISTRY.clear();
}

export function listTaxRules(): TaxRule[] {
  return [...RULE_REGISTRY.values()].sort((a, b) => a.ruleCode.localeCompare(b.ruleCode));
}

/**
 * Pure assessment. Selects candidate treatments; never computes a liability.
 * Exported for deterministic unit testing without a database or principal.
 */
export function assess(request: TaxAssessmentRequest): TaxAssessmentOutput {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.asOf)) {
    throw new SpecialistError("RULE_VIOLATION", "asOf must be an ISO date (YYYY-MM-DD).");
  }
  if (!Number.isSafeInteger(request.amountMinor) || request.amountMinor < 0) {
    throw new SpecialistError("RULE_VIOLATION", "amountMinor must be a non-negative safe integer.");
  }
  if (!/^[A-Z]{3}$/.test(request.currency)) {
    throw new SpecialistError("RULE_VIOLATION", "Currency must be a three-letter ISO code.");
  }

  const jurisdictionRules = listTaxRules().filter(
    (r) => r.jurisdictionCode === request.jurisdictionCode && r.taxType === request.taxType,
  );

  // Effective dating uses the shared platform helper — identical semantics to every specialist.
  const effective = selectEffectiveRules(jurisdictionRules, request.asOf);

  const candidates: TaxTreatmentCandidate[] = effective.map((rule) => {
    const applicability = rule.applicability ?? {};
    const outOfScope: string[] = [];

    if (applicability.entityTypes?.length && request.entityType) {
      if (!applicability.entityTypes.includes(request.entityType)) {
        outOfScope.push(`entity type ${request.entityType} is out of scope`);
      }
    }
    if (applicability.currencies?.length && !applicability.currencies.includes(request.currency)) {
      outOfScope.push(`currency ${request.currency} is out of scope`);
    }
    if (applicability.minAmountMinor !== undefined && request.amountMinor < applicability.minAmountMinor) {
      outOfScope.push("amount is below the rule's lower bound");
    }
    if (applicability.maxAmountMinor !== undefined && request.amountMinor > applicability.maxAmountMinor) {
      outOfScope.push("amount is above the rule's upper bound");
    }

    if (outOfScope.length > 0) {
      return {
        ruleCode: rule.ruleCode,
        legalSource: rule.legalSource,
        authority: rule.authority,
        status: "NOT_APPLICABLE",
        reason: outOfScope.join("; "),
        evidenceRequirements: rule.evidenceRequirements,
        auditRisk: bandRisk(rule.auditRiskScore),
      };
    }

    if (rule.authority !== "AUTHORITATIVE") {
      return {
        ruleCode: rule.ruleCode,
        legalSource: rule.legalSource,
        authority: rule.authority,
        status: "REQUIRES_SPECIALIST_REVIEW",
        reason:
          `Rule authority is ${rule.authority}. A qualified tax specialist must confirm this ` +
          "position before it may be relied upon.",
        evidenceRequirements: rule.evidenceRequirements,
        auditRisk: bandRisk(rule.auditRiskScore),
      };
    }

    return {
      ruleCode: rule.ruleCode,
      legalSource: rule.legalSource,
      authority: rule.authority,
      status: "APPLICABLE",
      reason: "Rule is effective, in scope, and marked authoritative by a specialist.",
      evidenceRequirements: rule.evidenceRequirements,
      auditRisk: bandRisk(rule.auditRiskScore),
    };
  });

  const checklist = [
    ...new Set(
      candidates
        .filter((c) => c.status !== "NOT_APPLICABLE")
        .flatMap((c) => c.evidenceRequirements),
    ),
  ];

  const riskOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
  const overallRisk =
    candidates.length === 0
      ? "HIGH" // no rule found is itself a risk, not a clean result
      : candidates.reduce<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">(
          (worst, c) => (riskOrder[c.auditRisk] > riskOrder[worst] ? c.auditRisk : worst),
          "LOW",
        );

  return {
    jurisdictionCode: request.jurisdictionCode,
    taxType: request.taxType,
    asOf: request.asOf,
    rulesConsidered: jurisdictionRules.length,
    candidates,
    // Never computed. Stating a number here would be an unratified tax position.
    computedLiability: null,
    computedLiabilityReason:
      "Tax liability is not computed. Computation requires ratified accounting authority (P3) " +
      "and the CAP_VAT capability, which is locked.",
    complianceChecklist: checklist,
    overallRisk,
  };
}

/**
 * Governed tax assessment. ANALYSIS only, bound to `CAP_VAT` so the result is explicitly
 * qualified REQUIRES_AUTHORITY while P3 is unratified — the caller cannot mistake it for a
 * computed liability.
 */
export async function assessTax(
  context: SpecialistContext,
  request: TaxAssessmentRequest,
): Promise<SpecialistResult<TaxAssessmentOutput>> {
  return runSpecialist<TaxAssessmentOutput>(
    {
      specialist: "TAX_INTELLIGENCE",
      operation: "ASSESS",
      kind: "ANALYSIS",
      permission: "finance:tax.read",
      capabilityCode: "CAP_VAT",
      version: TAX_INTELLIGENCE_VERSION,
      riskClass: "HIGH",
    },
    context,
    async () => {
      const output = assess(request);

      return {
        data: output,
        explanation: [
          `Considered ${output.rulesConsidered} registered rule(s) for ${request.jurisdictionCode}/${request.taxType}, effective as at ${request.asOf}.`,
          `${output.candidates.filter((c) => c.status === "APPLICABLE").length} applicable, ` +
            `${output.candidates.filter((c) => c.status === "REQUIRES_SPECIALIST_REVIEW").length} requiring specialist review, ` +
            `${output.candidates.filter((c) => c.status === "NOT_APPLICABLE").length} out of scope.`,
          "No liability is computed and no legal conclusion is asserted. Candidates are hypotheses with evidence requirements.",
          "A qualified tax specialist must review any candidate before it informs a filing or a posting.",
        ],
        provenance: {
          sources: output.candidates.map((c) => ({ type: "TAX_RULE", id: c.ruleCode })),
          assumptions: [
            "Registered rules accurately reflect their cited legal sources; this module verifies presence, not truth.",
            "No fiscal year, rate, threshold or exemption is assumed.",
          ],
          blockedBy: ["P3"],
        },
      };
    },
  );
}
