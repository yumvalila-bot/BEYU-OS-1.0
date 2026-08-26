/**
 * BEYU OS — Family Office: validation engine.
 *
 * The single deterministic validation pass every office record/submission
 * goes through. It composes, in a fixed order:
 *
 *   1. SCOPE — tenant scope shape (tenant isolation is canonical);
 *   2. DOMAIN — the record's domain and kind are known and consistent;
 *   3. DOMAIN RULES — the domain's assert suite runs against the record
 *      (every domain module's invariants, with the exact failure named);
 *   4. FINANCE BOUNDARY — the canonical FIR-018 sweep: no financial state
 *      field anywhere in the record;
 *   5. POLICY — every cited policy key is RESOLVED (ratified) at `asOf`;
 *      unresolved → POLICY_DECISION_REQUIRED; configuration conflict →
 *      ARCHITECTURE_DECISION_REQUIRED;
 *   6. AUTHORITY — the act's authority context verifies (identity ≠
 *      authority; AI refused; delegation chain verified; not expired).
 *
 * The result is a structured ValidationReport. Status precedence
 * (deterministic): ARCHITECTURE_DECISION_REQUIRED >
 * POLICY_DECISION_REQUIRED > DENIED > VALID. A report is never "VALID"
 * with findings — valid means exactly zero findings.
 */

import { FamilyError, type FamilyErrorCode } from "../phase3/errors";
import { assertNoFinancialState } from "../phase3/contracts";
import type { PolicyRegistry } from "./policy";
import { resolvePolicy } from "./policy";
import { type ActScope, type AuthorityContext, type VerifiedDelegation, isAuthorityCurrent, toTaxonomyCode, verifyAuthority } from "./authority";
import { type OfficeDomain, assertScopeShape, isOfficeDomain } from "./types";
import { assertBusinessDevelopmentProposal, assertBusinessEngagement, assertBusinessInstruction, assertBusinessReference, assertOwnershipReference } from "./business";
import { assertCapitalAllocation, assertCapitalReference } from "./capital";
import { assertLiquidityReference } from "./capital";
import { assertWealthPlanningProposal, assertPlanningAssessment, assertPlanningEngagement, assertWealthReference, assertLifecycleObservation } from "./wealth";
import { assertLoanReference, assertLoanStatusRecord } from "./loan";
import { assertLifestyleApproval, assertLifestyleEngagement, assertLifestyleRequest } from "./lifestyle";
import { assertPhilanthropyProposal, assertPhilanthropyVehicle, assertGiftReference } from "./philanthropy";
import { assertEducationDecision, assertEducationEngagement, assertEducationFundingReference } from "./education";
import { assertApprovalDecision, assertFamilyDecision, assertFamilyGovernanceBody, assertGovernanceMembership } from "./governance";
import { assertTrustClause, assertTrustReference, assertTrusteeAppointment, assertTrusteeRemoval } from "./trust";
import { assertFamilyConstitution } from "./constitution";
import { assertFamilyDocumentRef, assertFamilyInstrumentRef } from "./documents";
import { assertFamilyMember, assertFamilyRelationship } from "./identity";

export interface OfficeRecordInput {
  /** The concrete record kind (e.g. "CapitalAllocation"). */
  kind: string;
  domain: OfficeDomain;
  tenantId: string;
  legalEntityId: string | null;
  jurisdictionRef: string | null;
  [key: string]: unknown;
}

export interface ValidationFinding {
  code: FamilyErrorCode;
  domain: OfficeDomain | "OFFICE";
  kind: string;
  detail: string;
}

export type ValidationStatus = "VALID" | "DENIED" | "POLICY_DECISION_REQUIRED" | "ARCHITECTURE_DECISION_REQUIRED";

export interface ValidationReport {
  status: ValidationStatus;
  findings: ValidationFinding[];
  policyGaps: { policyKey: string; state: string; reason: string }[];
}

/** A kind validator: runs the assert suite for one concrete record kind. */
type KindValidator = (record: OfficeRecordInput) => void;

/** Domain → accepted kinds → validators. A kind outside a domain is a finding. */
const DOMAIN_VALIDATORS: Record<OfficeDomain, Record<string, KindValidator>> = {
  BUSINESS_DEVELOPMENT: {
    BusinessReference: (r) => assertBusinessReference(r as never),
    OwnershipReference: (r) => assertOwnershipReference(r as never),
    BusinessEngagement: (r) => assertBusinessEngagement(r as never),
    BusinessInstruction: (r) => assertBusinessInstruction(r as never),
    BusinessDevelopmentProposal: (r) => assertBusinessDevelopmentProposal(r as never),
  },
  WEALTH_MANAGEMENT: {
    WealthReference: (r) => assertWealthReference(r as never),
    PlanningEngagement: (r) => assertPlanningEngagement(r as never),
    PlanningAssessment: (r) => assertPlanningAssessment(r as never),
    WealthPlanningProposal: (r) => assertWealthPlanningProposal(r as never),
    LifecycleObservation: (r) => assertLifecycleObservation(r as never),
  },
  WEALTH_PLANNING: {
    PlanningEngagement: (r) => assertPlanningEngagement(r as never),
    PlanningAssessment: (r) => assertPlanningAssessment(r as never),
    WealthPlanningProposal: (r) => assertWealthPlanningProposal(r as never),
    LifecycleObservation: (r) => assertLifecycleObservation(r as never),
  },
  FAMILY_GOVERNANCE: {
    FamilyGovernanceBody: (r) => assertFamilyGovernanceBody(r as never),
    GovernanceMembership: (r) => assertGovernanceMembership(r as never),
    FamilyDecision: (r) => assertFamilyDecision(r as never),
    ApprovalDecision: (r) => assertApprovalDecision(r as never),
  },
  LIFESTYLE_MANAGEMENT: {
    LifestyleEngagement: (r) => assertLifestyleEngagement(r as never),
    LifestyleRequest: (r) => assertLifestyleRequest(r as never),
    LifestyleApproval: (r) => assertLifestyleApproval(r as never),
    LifecycleObservation: (r) => assertLifecycleObservation(r as never),
  },
  PHILANTHROPY: {
    PhilanthropyVehicle: (r) => assertPhilanthropyVehicle(r as never),
    GiftReference: (r) => assertGiftReference(r as never),
    PhilanthropyProposal: (r) => assertPhilanthropyProposal(r as never),
  },
  FAMILY_EDUCATION: {
    EducationEngagement: (r) => assertEducationEngagement(r as never),
    EducationFundingReference: (r) => assertEducationFundingReference(r as never),
    EducationDecision: (r) => assertEducationDecision(r as never),
  },
  FAMILY_INSTITUTION: {
    FamilyMember: (r) => assertFamilyMember(r as never),
    FamilyRelationship: (r) => assertFamilyRelationship(r as never),
    FamilyDocumentRef: (r) => assertFamilyDocumentRef(r as never),
    FamilyInstrumentRef: (r) => assertFamilyInstrumentRef(r as never),
    FamilyConstitution: (r) => assertFamilyConstitution(r as never),
    TrustReference: (r) => assertTrustReference(r as never),
    TrusteeAppointment: (r) => assertTrusteeAppointment(r as never),
    TrusteeRemoval: (r) => assertTrusteeRemoval(r as never),
    TrustClause: (r) => assertTrustClause(r as never),
  },
  FAMILY_CAPITAL: {
    CapitalReference: (r) => assertCapitalReference(r as never),
    CapitalAllocation: (r) => assertCapitalAllocation(r as never),
    LiquidityReference: (r) => assertLiquidityReference(r as never),
  },
  FAMILY_LOAN: {
    LoanReference: (r) => assertLoanReference(r as never),
    LoanStatusRecord: (r) => assertLoanStatusRecord(r as never),
  },
};

function finding(code: FamilyErrorCode, domain: OfficeDomain | "OFFICE", kind: string, detail: string): ValidationFinding {
  return { code, domain, kind, detail };
}

/**
 * Record-level validation (steps 1–4). Pure: no registry, no authority —
 * the structure and boundaries of the record itself.
 */
export function validateOfficeRecord(record: OfficeRecordInput): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const domain = isOfficeDomain(record.domain) ? record.domain : null;

  // 1. Scope shape.
  try {
    assertScopeShape({ tenantId: record.tenantId, legalEntityId: record.legalEntityId, jurisdictionRef: record.jurisdictionRef }, "office record");
  } catch (e) {
    findings.push(finding("TENANT_ISOLATION_DENIED", "OFFICE", record.kind ?? "unknown", String(e)));
  }

  // 2. Domain known.
  if (domain === null) {
    findings.push(finding("EVIDENCE_INSUFFICIENT", "OFFICE", record.kind ?? "unknown", `Unknown office domain "${String(record.domain)}".`));
    return findings;
  }

  // 3. Kind accepted by the domain; run the domain's assert suite.
  const validators = DOMAIN_VALIDATORS[domain];
  const validator = record.kind in validators ? validators[record.kind] : null;
  if (validator === null) {
    findings.push(finding("EVIDENCE_INSUFFICIENT", domain, record.kind ?? "unknown", `Record kind "${String(record.kind)}" is not a known record of domain ${domain}.`));
  } else {
    try {
      validator(record);
    } catch (e) {
      if (e instanceof FamilyError) {
        findings.push(finding(e.code, domain, record.kind, e.message));
      } else {
        findings.push(finding("EVIDENCE_INSUFFICIENT", domain, record.kind, `Unexpected structural failure: ${String(e)}`));
      }
    }
  }

  // 4. Finance boundary sweep (FIR-018): no financial state anywhere.
  try {
    assertNoFinancialState(record as object, `office record ${record.kind}`);
  } catch (e) {
    if (e instanceof FamilyError) {
      findings.push(finding(e.code, domain, record.kind, e.message));
    }
  }

  return findings;
}

export interface OfficeSubmission {
  record: OfficeRecordInput;
  /** Every policy key the act cites (each must be resolved at asOf). */
  policyKeys: readonly string[];
  authorityContext: AuthorityContext;
  act: ActScope;
  delegations?: ReadonlyMap<string, VerifiedDelegation>;
  asOf: string;
}

/**
 * Full submission validation (steps 1–6). Deterministic; fails closed;
 * never invents a missing policy or authority.
 */
export function validateOfficeSubmission(registry: PolicyRegistry, submission: OfficeSubmission): ValidationReport {
  const findings: ValidationFinding[] = validateOfficeRecord(submission.record);
  const policyGaps: ValidationReport["policyGaps"] = [];

  // 5. Policy: every cited policy must be RESOLVED at asOf.
  for (const policyKey of submission.policyKeys) {
    const resolved = resolvePolicy<Record<string, unknown>>(registry, policyKey, submission.asOf);
    if (resolved.state === "RESOLVED") continue;
    if (resolved.state === "DENIED") {
      findings.push(finding(resolved.code, "OFFICE", "policy", `${policyKey}: ${resolved.reason}`));
      continue;
    }
    policyGaps.push({ policyKey, state: resolved.state, reason: resolved.reason });
    findings.push(
      finding(
        resolved.state === "ARCHITECTURE_DECISION_REQUIRED" ? "ARCHITECTURE_DECISION_REQUIRED" : "POLICY_DECISION_REQUIRED",
        "OFFICE",
        "policy",
        `${policyKey}: ${resolved.reason}`,
      ),
    );
  }

  // 6. Authority.
  const verification = verifyAuthority(submission.authorityContext, submission.act, submission.delegations ?? new Map());
  if (!verification.ok) {
    findings.push(finding(toTaxonomyCode(verification.code), "OFFICE", "authority", `${verification.code}: ${verification.reason}`));
  } else if (!isAuthorityCurrent(submission.authorityContext, submission.asOf)) {
    findings.push(finding("AUTHORITY_UNPROVEN", "OFFICE", "authority", `The cited authority expired before ${submission.asOf}.`));
  }

  // Status precedence: ARCH > POLICY > DENIED > VALID.
  let status: ValidationStatus = "VALID";
  if (findings.some((f) => f.code === "ARCHITECTURE_DECISION_REQUIRED")) status = "ARCHITECTURE_DECISION_REQUIRED";
  else if (findings.some((f) => f.code === "POLICY_DECISION_REQUIRED")) status = "POLICY_DECISION_REQUIRED";
  else if (findings.length > 0) status = "DENIED";

  return { status, findings, policyGaps };
}
