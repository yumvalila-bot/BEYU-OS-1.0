/**
 * BEYU OS — Family Office PROTECTION & INSURANCE API service.
 *
 * The thin governed boundary between the HTTP routes under
 * `/api/v1/family-office/protection/*` and the pure engine in
 * `src/lib/family/office/protection-insurance/*`. Responsibilities, and only
 * these (identical discipline to `family-office-capital-service.ts`, whose
 * minor-unit converters this reuses rather than duplicating):
 *
 *   1. Read rows inside the caller's tenant scope (`tenantScopeIds`).
 *   2. Convert `numeric(18,2)` strings ↔ integer minor units — the ONLY place
 *      that happens (§33).
 *   3. Validate through the engine before a write and refuse when the engine
 *      returns findings.
 *   4. Append audit + enterprise events in the SAME transaction as the write
 *      (`withAuditTransaction`).
 *   5. Keep ownership explicit: `tenantId` is server-derived; a policy outside
 *      the caller's resolved scope reads as NOT_FOUND, never as FORBIDDEN with
 *   an existence oracle.
 *
 * It contains no financial arithmetic beyond integer sums, no thresholds and
 * no policy. BOUNDARY: nothing here posts, accrues, journals or reconciles;
 * the Finance posting engine and CAP_POSTING are not imported and not callable
 * from this module (§22, §32).
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction, type AuditInput, type EventInput } from "@/lib/audit";
import { assertWithinScope, tenantScopeIds } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import {
  minorToNumeric,
  numericToMinor,
  type FamilyOfficeActor,
} from "@/lib/family-office-capital-service";
import {
  FAMILY_OFFICE_PROTECTION_VERSION,
  PROTECTION_ACCOUNTING_BOUNDARY,
  PROTECTION_MODELED_DISCLAIMER,
  canAdvanceGovernanceStage,
  canTransitionClaim,
  canTransitionPolicyStatus,
  computeProtectionGap,
  computeReviewFlags,
  designationStands,
  effectivePremiumStatus,
  annualPremiumObligationMinor,
  skipChainAuthorized,
  summariseAllocations,
  validateClaimRecord,
  validateDesignation,
  validatePolicy,
  validatePremiumRecord,
  validateProceedsAdvance,
  type GapComponent,
  type InsuranceGovernanceStage,
  type InsurancePolicyStatus,
  type PolicyRecord,
  type ClaimStatus,
  type ProceedsState,
} from "@/lib/family/office/protection-insurance";
import {
  FAMILY_OFFICE_PROTECTION_EVENTS,
  FAMILY_OFFICE_PROTECTION_EVENT_DOMAIN,
  type FamilyOfficeProtectionEventType,
} from "@/lib/family/office/protection-insurance/events";

export const FAMILY_OFFICE_PROTECTION_SERVICE_VERSION = FAMILY_OFFICE_PROTECTION_VERSION;

export class FamilyOfficeProtectionError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "SCOPE" | "VALIDATION" | "GOVERNANCE",
    message: string,
    readonly findings: readonly string[] = [],
  ) {
    super(message);
    this.name = "FamilyOfficeProtectionError";
  }
}

export const FAMILY_OFFICE_PROTECTION_ERROR_STATUS: Record<FamilyOfficeProtectionError["code"], number> = {
  NOT_FOUND: 404,
  SCOPE: 403,
  VALIDATION: 422,
  GOVERNANCE: 409,
};

function auditBase(
  actor: FamilyOfficeActor,
  action: string,
  objectType: string,
  objectId: string,
  authority: string,
  newValue: Record<string, unknown>,
  oldValue: Record<string, unknown> | null = null,
  reason: string | null = null,
): AuditInput {
  return {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    actorType: "HUMAN",
    action,
    objectType,
    objectId,
    outcome: "SUCCESS",
    reason: reason ?? undefined,
    authority,
    oldValue,
    newValue,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    traceId: actor.traceId,
  };
}

function eventBase(actor: FamilyOfficeActor): Pick<
  EventInput,
  "tenantId" | "actorUserId" | "traceId" | "correlationId" | "causationId" | "authorityContext" | "policyVersion" | "destinationDomain" | "source" | "domain" | "actorType"
> {
  return {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    actorType: "HUMAN",
    traceId: actor.traceId,
    correlationId: actor.traceId,
    causationId: null,
    authorityContext: null,
    policyVersion: null,
    destinationDomain: null,
    source: "BEYU_OS",
    domain: FAMILY_OFFICE_PROTECTION_EVENT_DOMAIN,
  };
}

function protectionEvent(
  actor: FamilyOfficeActor,
  type: FamilyOfficeProtectionEventType,
  subjectType: string,
  subjectId: string,
  classification: "RESTRICTED",
  payload: Record<string, unknown>,
  legalEntityId: string | null = null,
): EventInput {
  return {
    ...eventBase(actor),
    type,
    operation: type,
    legalEntityId,
    subjectType,
    subjectId,
    classification,
    payload,
  };
}

/* ------------------------------------------------------------------ */
/* Row ↔ engine conversion                                              */
/* ------------------------------------------------------------------ */

export type PolicyRow = typeof s.familyInsurancePolicies.$inferSelect;

function rowToPolicyRecord(row: PolicyRow, loanOutstanding: boolean): PolicyRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    policyNumber: row.policyNumber,
    policyType: row.policyType as PolicyRecord["policyType"],
    ownerRef: row.ownerRef,
    ownerKind: row.ownerKind as PolicyRecord["ownerKind"],
    insuredRef: row.insuredRef,
    insuredKind: row.insuredKind as PolicyRecord["insuredKind"],
    premiumPayerRef: row.premiumPayerRef,
    insurerRef: row.insurerRef,
    brokerRef: row.brokerRef,
    legalEntityId: row.legalEntityId,
    countryCode: row.countryCode,
    currency: row.currency,
    coverageAmountMinor: numericToMinor(row.coverageAmount),
    deathBenefitMinor: numericToMinor(row.deathBenefit),
    cashValueMinor: row.cashValue === null ? null : numericToMinor(row.cashValue),
    surrenderValueMinor: row.surrenderValue === null ? null : numericToMinor(row.surrenderValue),
    premiumAmountMinor: numericToMinor(row.premiumAmount),
    premiumFrequency: row.premiumFrequency as PolicyRecord["premiumFrequency"],
    nextPremiumDueDate: row.nextPremiumDueDate,
    effectiveDate: row.effectiveDate,
    maturityDate: row.maturityDate,
    reviewIntervalDays: row.reviewIntervalDays,
    lastReviewDate: row.lastReviewDate,
    nextReviewDate: row.nextReviewDate,
    status: row.status as InsurancePolicyStatus,
    governanceStage: row.governanceStage as InsuranceGovernanceStage,
    assignmentStatus: row.assignmentStatus as PolicyRecord["assignmentStatus"],
    collateralBeneficiaryRef: row.collateralBeneficiaryRef,
    policyLoanOutstanding: loanOutstanding,
    purpose: row.purpose,
    successionPlanRef: row.successionPlanId ?? row.successionPlanRef,
    liquidityObjectiveRef: row.liquidityObjectiveRef,
    riskAssessmentRef: row.riskAssessmentRef,
    hcmEmployeeRef: row.hcmEmployeeRef,
    documentRefs: row.documentRefs ?? [],
    legalReviewStatus: row.legalReviewStatus as PolicyRecord["legalReviewStatus"],
    taxReviewStatus: row.taxReviewStatus as PolicyRecord["taxReviewStatus"],
    jurisdictionRef: row.jurisdictionRef,
    amountProvenance: row.amountProvenance as PolicyRecord["amountProvenance"],
    amountSourceRef: row.amountSourceRef,
  };
}

/* ------------------------------------------------------------------ */
/* Scope helpers                                                        */
/* ------------------------------------------------------------------ */

/** A policy id resolved INSIDE the caller's scope or NOT_FOUND — no oracle. */
async function scopedPolicyRow(principal: Principal, tenantScope: string[], policyId: string): Promise<PolicyRow> {
  const rows = await db
    .select()
    .from(s.familyInsurancePolicies)
    .where(and(inArray(s.familyInsurancePolicies.tenantId, tenantScope), eq(s.familyInsurancePolicies.id, policyId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new FamilyOfficeProtectionError("NOT_FOUND", "No such policy within the caller's scope.");
  return row;
}

async function loanOutstandingFor(txOrDb: typeof db | Parameters<Parameters<typeof db["transaction"]>[0]>[0], policyId: string): Promise<boolean> {
  const rows = await txOrDb
    .select({ id: s.familyInsurancePolicyLoans.id })
    .from(s.familyInsurancePolicyLoans)
    .where(and(eq(s.familyInsurancePolicyLoans.policyId, policyId), eq(s.familyInsurancePolicyLoans.status, "OUTSTANDING")))
    .limit(1);
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Reads                                                                */
/* ------------------------------------------------------------------ */

export async function listPolicies(principal: Principal, asOf: string) {
  const scope = await tenantScopeIds(principal);
  const [policies, designations, premiums, loans, reviews, assessments] = await Promise.all([
    db.select().from(s.familyInsurancePolicies).where(inArray(s.familyInsurancePolicies.tenantId, scope)),
    db.select().from(s.familyInsuranceBeneficiaryDesignations).where(inArray(s.familyInsuranceBeneficiaryDesignations.tenantId, scope)),
    db.select().from(s.familyInsurancePremiums).where(inArray(s.familyInsurancePremiums.tenantId, scope)),
    db.select().from(s.familyInsurancePolicyLoans).where(inArray(s.familyInsurancePolicyLoans.tenantId, scope)),
    db.select().from(s.familyInsuranceReviews).where(inArray(s.familyInsuranceReviews.tenantId, scope)),
    db.select().from(s.familyProtectionAssessments).where(inArray(s.familyProtectionAssessments.tenantId, scope)),
  ]);
  const openClaims = await db
    .select()
    .from(s.familyInsuranceClaims)
    .where(and(inArray(s.familyInsuranceClaims.tenantId, scope)))
    .limit(500);

  /** Latest FINAL assessment per currency supplies the MODELED target; absent
   *  one the review engine reports NOT_QUANTIFIED rather than a verdict. */
  const latestFinalByCurrency = new Map<string, number | null>();
  const sortedAssessments = assessments
    .filter((a) => a.status === "FINAL")
    .slice()
    .sort((a, b) => (a.asOf === b.asOf ? a.createdAt.toISOString().localeCompare(b.createdAt.toISOString()) : a.asOf.localeCompare(b.asOf)));
  for (const a of sortedAssessments) {
    const result = a.result as { totalExposureMinor?: number | null };
    latestFinalByCurrency.set(a.currency, typeof result?.totalExposureMinor === "number" ? result.totalExposureMinor : null);
  }

  const outstandingLoanPolicyIds = new Set(loans.filter((l) => l.status === "OUTSTANDING").map((l) => l.policyId));
  const views = policies.map((row) => {
    const record = rowToPolicyRecord(row, outstandingLoanPolicyIds.has(row.id));
    const policyDesignations = designations
      .filter((d) => d.policyId === row.id)
      .map((d) => ({
        id: d.id,
        policyId: d.policyId,
        beneficiaryRef: d.beneficiaryRef,
        beneficiaryKind: d.beneficiaryKind as never,
        designationType: d.designationType as never,
        entitlementBasis: d.entitlementBasis as never,
        pctMillionths: d.pctMillionths,
        fixedAmountMinor: d.fixedAmount === null ? null : numericToMinor(d.fixedAmount),
        currency: d.currency,
        effectiveDate: d.effectiveDate ?? "",
        endDate: d.endDate,
        status: d.status as never,
        relationshipBasis: d.relationshipBasis,
        notes: d.notes,
      }));
    const policyPremiums = premiums
      .filter((p) => p.policyId === row.id)
      .map((p) => ({
        id: p.id,
        policyId: p.policyId,
        dueDate: p.dueDate,
        amountMinor: numericToMinor(p.amount),
        currency: p.currency,
        frequency: p.frequency as never,
        status: p.status as never,
        payerRef: p.payerRef,
        paidDate: p.paidDate,
        paymentEvidenceDocumentRef: p.paymentEvidenceDocumentRef,
        financeRecordRef: p.financeRecordRef,
        notes: p.notes,
      }));
    const flags = computeReviewFlags({
      asOf,
      policy: {
        policyId: row.id,
        status: row.status,
        governanceStage: row.governanceStage,
        documentRefs: row.documentRefs ?? [],
        lastReviewDate: row.lastReviewDate,
        nextReviewDate: row.nextReviewDate,
        reviewIntervalDays: row.reviewIntervalDays,
        maturityDate: row.maturityDate,
        effectiveDate: row.effectiveDate,
        assignmentStatus: row.assignmentStatus as never,
        policyLoanOutstanding: outstandingLoanPolicyIds.has(row.id),
        premiumPayerRef: row.premiumPayerRef,
        ownerRef: row.ownerRef,
        insuredRef: row.insuredRef,
        currency: row.currency,
        deathBenefitMinor: numericToMinor(row.deathBenefit),
        modeledTargetMinor: latestFinalByCurrency.get(row.currency) ?? null,
        successionPlanStillCurrent: null,
      },
      designations: policyDesignations,
      premiums: policyPremiums,
      changes: { insuredRelationshipChanged: false, successionPlanChanged: false, majorFamilyChange: false, majorBusinessOwnershipChange: false },
    });
    return {
      id: row.id,
      policyNumber: row.policyNumber,
      policyType: row.policyType,
      ownerRef: row.ownerRef,
      insuredRef: row.insuredRef,
      insurerRef: row.insurerRef,
      currency: row.currency,
      countryCode: row.countryCode,
      legalEntityId: row.legalEntityId,
      status: row.status,
      governanceStage: row.governanceStage,
      assignmentStatus: row.assignmentStatus,
      coverage: {
        deathBenefitMinor: numericToMinor(row.deathBenefit),
        coverageAmountMinor: numericToMinor(row.coverageAmount),
        cashValueMinor: row.cashValue === null ? null : numericToMinor(row.cashValue),
        surrenderValueMinor: row.surrenderValue === null ? null : numericToMinor(row.surrenderValue),
        epistemicClass: row.epistemicClass,
        amountProvenance: row.amountProvenance,
        amountSourceRef: row.amountSourceRef,
        /** The §4 rule stated on the payload's face: never a wealth total. */
        contingentProtection: true,
      },
      premium: {
        premiumAmountMinor: numericToMinor(row.premiumAmount),
        frequency: row.premiumFrequency,
        nextPremiumDueDate: row.nextPremiumDueDate,
        annualObligationMinor: annualPremiumObligationMinor(numericToMinor(row.premiumAmount), row.premiumFrequency as never),
      },
      review: {
        lastReviewDate: row.lastReviewDate,
        nextReviewDate: row.nextReviewDate,
        reviewCount: reviews.filter((r) => r.policyId === row.id).length,
      },
      successionPlanId: row.successionPlanId,
      successionPlanRef: row.successionPlanId ?? row.successionPlanRef,
      beneficiarySummary: summariseAllocations(policyDesignations, asOf),
      reviewFlags: flags,
      recordedAt: row.createdAt.toISOString(),
    };
  });

  return {
    asOf,
    total: views.length,
    policies: views,
    openClaims: openClaims.filter((c) => !["CLOSED"].includes(c.status)).length,
    methodology: "beyu.protection-gap",
    methodologyVersion: FAMILY_OFFICE_PROTECTION_VERSION,
    authoritativeAccountingOwner: "FINANCE_OS",
    boundary: PROTECTION_ACCOUNTING_BOUNDARY,
  };
}

export async function getPolicyDetail(principal: Principal, policyId: string, asOf: string) {
  const scope = await tenantScopeIds(principal);
  const row = await scopedPolicyRow(principal, scope, policyId);
  const [designations, premiums, assignments, loans, reviews, claims, assessments] = await Promise.all([
    db.select().from(s.familyInsuranceBeneficiaryDesignations).where(eq(s.familyInsuranceBeneficiaryDesignations.policyId, policyId)),
    db.select().from(s.familyInsurancePremiums).where(eq(s.familyInsurancePremiums.policyId, policyId)),
    db.select().from(s.familyInsuranceAssignments).where(eq(s.familyInsuranceAssignments.policyId, policyId)),
    db.select().from(s.familyInsurancePolicyLoans).where(eq(s.familyInsurancePolicyLoans.policyId, policyId)),
    db.select().from(s.familyInsuranceReviews).where(eq(s.familyInsuranceReviews.policyId, policyId)),
    db.select().from(s.familyInsuranceClaims).where(eq(s.familyInsuranceClaims.policyId, policyId)),
    db
      .select()
      .from(s.familyProtectionAssessments)
      .where(and(inArray(s.familyProtectionAssessments.tenantId, scope), eq(s.familyProtectionAssessments.status, "FINAL"))),
  ]);
  const loanOutstanding = loans.some((l) => l.status === "OUTSTANDING");
  const record = rowToPolicyRecord(row, loanOutstanding);

  const engineDesignations = designations.map((d) => ({
    id: d.id,
    policyId: d.policyId,
    beneficiaryRef: d.beneficiaryRef,
    beneficiaryKind: d.beneficiaryKind as never,
    designationType: d.designationType as never,
    entitlementBasis: d.entitlementBasis as never,
    pctMillionths: d.pctMillionths,
    fixedAmountMinor: d.fixedAmount === null ? null : numericToMinor(d.fixedAmount),
    currency: d.currency,
    effectiveDate: d.effectiveDate ?? "",
    endDate: d.endDate,
    status: d.status as never,
    relationshipBasis: d.relationshipBasis,
    notes: d.notes,
  }));
  const enginePremiums = premiums.map((p) => ({
    id: p.id,
    policyId: p.policyId,
    dueDate: p.dueDate,
    amountMinor: numericToMinor(p.amount),
    currency: p.currency,
    frequency: p.frequency as never,
    status: p.status as never,
    payerRef: p.payerRef,
    paidDate: p.paidDate,
    paymentEvidenceDocumentRef: p.paymentEvidenceDocumentRef,
    financeRecordRef: p.financeRecordRef,
    notes: p.notes,
  }));

  // Succession-plan currency check against the referenced family plan (§12/§14).
  let successionPlanStillCurrent: boolean | null = null;
  if (row.successionPlanId) {
    const plan = await db
      .select({ status: s.familyGenerationalPlans.status })
      .from(s.familyGenerationalPlans)
      .where(eq(s.familyGenerationalPlans.id, row.successionPlanId))
      .limit(1);
    successionPlanStillCurrent = plan.length === 0 ? false : !["SUPERSEDED", "ABANDONED"].includes(plan[0].status);
  }

  const latestFinal = assessments
    .filter((a) => a.currency === row.currency)
    .sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
  const modeledTarget =
    latestFinal && typeof (latestFinal.result as { totalExposureMinor?: number | null })?.totalExposureMinor === "number"
      ? ((latestFinal.result as { totalExposureMinor: number }).totalExposureMinor as number)
      : null;

  const flags = computeReviewFlags({
    asOf,
    policy: {
      policyId: row.id,
      status: row.status,
      governanceStage: row.governanceStage,
      documentRefs: row.documentRefs ?? [],
      lastReviewDate: row.lastReviewDate,
      nextReviewDate: row.nextReviewDate,
      reviewIntervalDays: row.reviewIntervalDays,
      maturityDate: row.maturityDate,
      effectiveDate: row.effectiveDate,
      assignmentStatus: row.assignmentStatus as never,
      policyLoanOutstanding: loanOutstanding,
      premiumPayerRef: row.premiumPayerRef,
      ownerRef: row.ownerRef,
      insuredRef: row.insuredRef,
      currency: row.currency,
      deathBenefitMinor: numericToMinor(row.deathBenefit),
      modeledTargetMinor: modeledTarget,
      successionPlanStillCurrent,
    },
    designations: engineDesignations,
    premiums: enginePremiums,
    changes: { insuredRelationshipChanged: false, successionPlanChanged: false, majorFamilyChange: false, majorBusinessOwnershipChange: false },
  });

  return {
    asOf,
    policy: {
      ...record,
      statusLabel: record.status,
      purpose: row.purpose,
      brokerRef: row.brokerRef,
      successionPlanId: row.successionPlanId,
      liquidityObjectiveRef: row.liquidityObjectiveRef,
      riskAssessmentRef: row.riskAssessmentRef,
      hcmEmployeeRef: row.hcmEmployeeRef,
      authoritativeOwner: row.authoritativeOwner,
      financeRecordRef: row.financeRecordRef,
      jurisdictionRef: row.jurisdictionRef,
    },
    designations: engineDesignations,
    premiums: enginePremiums.map((p) => ({ ...p, effectiveStatus: effectivePremiumStatus(p as never, asOf) })),
    assignments,
    loans,
    reviews: reviews.sort((a, b) => b.reviewDate.localeCompare(a.reviewDate)),
    claims: claims.map((c) => ({
      id: c.id,
      claimReference: c.claimReference,
      status: c.status,
      proceedsState: c.proceedsState,
      approvedAmountMinor: c.approvedAmount === null ? null : numericToMinor(c.approvedAmount),
      receivedAmountMinor: c.receivedAmount === null ? null : numericToMinor(c.receivedAmount),
      currency: c.currency,
      proceedsReceivedDate: c.proceedsReceivedDate,
      allocationRef: c.allocationRef,
    })),
    allocationAudit: summariseAllocations(engineDesignations, asOf),
    reviewFlags: flags,
    validation: validatePolicy(record).map((f) => `${f.rule} ${f.field}: ${f.message}`),
    disclaimer: PROTECTION_MODELED_DISCLAIMER,
    authoritativeAccountingOwner: "FINANCE_OS",
  };
}

/* ------------------------------------------------------------------ */
/* Policy writes                                                        */
/* ------------------------------------------------------------------ */

export type CreatePolicyInput = {
  policyNumber: string;
  policyType: PolicyRecord["policyType"];
  ownerRef: string | null;
  ownerKind: PolicyRecord["ownerKind"] | null;
  insuredRef: string | null;
  insuredKind: PolicyRecord["insuredKind"] | null;
  premiumPayerRef: string | null;
  insurerRef: string;
  brokerRef: string | null;
  legalEntityId: string | null;
  countryCode: string | null;
  currency: string;
  coverageAmountMinor: number;
  deathBenefitMinor: number;
  cashValueMinor: number | null;
  surrenderValueMinor: number | null;
  premiumAmountMinor: number;
  premiumFrequency: PolicyRecord["premiumFrequency"];
  nextPremiumDueDate: string | null;
  effectiveDate: string | null;
  maturityDate: string | null;
  reviewIntervalDays: number | null;
  nextReviewDate: string | null;
  purpose: string;
  successionPlanId: string | null;
  successionPlanRef: string | null;
  liquidityObjectiveRef: string | null;
  riskAssessmentRef: string | null;
  hcmEmployeeRef: string | null;
  documentRefs: string[];
  jurisdictionRef: string | null;
  amountProvenance: PolicyRecord["amountProvenance"];
  amountSourceRef: string | null;
};

function candidateFromInput(actor: FamilyOfficeActor, input: CreatePolicyInput, over: Partial<PolicyRecord> = {}): PolicyRecord {
  return {
    id: "candidate",
    tenantId: actor.tenantId,
    policyNumber: input.policyNumber,
    policyType: input.policyType,
    ownerRef: input.ownerRef,
    ownerKind: input.ownerKind,
    insuredRef: input.insuredRef,
    insuredKind: input.insuredKind,
    premiumPayerRef: input.premiumPayerRef,
    insurerRef: input.insurerRef,
    brokerRef: input.brokerRef,
    legalEntityId: input.legalEntityId,
    countryCode: input.countryCode,
    currency: input.currency,
    coverageAmountMinor: input.coverageAmountMinor,
    deathBenefitMinor: input.deathBenefitMinor,
    cashValueMinor: input.cashValueMinor,
    surrenderValueMinor: input.surrenderValueMinor,
    premiumAmountMinor: input.premiumAmountMinor,
    premiumFrequency: input.premiumFrequency,
    nextPremiumDueDate: input.nextPremiumDueDate,
    effectiveDate: input.effectiveDate,
    maturityDate: input.maturityDate,
    reviewIntervalDays: input.reviewIntervalDays,
    lastReviewDate: null,
    nextReviewDate: input.nextReviewDate,
    status: "DRAFT",
    governanceStage: "DRAFT",
    assignmentStatus: "NONE",
    collateralBeneficiaryRef: null,
    policyLoanOutstanding: false,
    purpose: input.purpose,
    successionPlanRef: input.successionPlanId ?? input.successionPlanRef,
    liquidityObjectiveRef: input.liquidityObjectiveRef,
    riskAssessmentRef: input.riskAssessmentRef,
    hcmEmployeeRef: input.hcmEmployeeRef,
    documentRefs: input.documentRefs,
    legalReviewStatus: "NOT_STARTED",
    taxReviewStatus: "NOT_STARTED",
    jurisdictionRef: input.jurisdictionRef,
    amountProvenance: input.amountProvenance,
    amountSourceRef: input.amountSourceRef,
    ...over,
  };
}

async function assertLegalEntityInScope(principal: Principal, legalEntityId: string | null): Promise<void> {
  if (!legalEntityId) return;
  // Scoped through the REAL principal (never the reconstructed actor): the
  // resolution of "which tenants may this caller see" is exactly what
  // `tenantScopeIds` answers, and answering it from a partial object would be
  // authorization by inference — the thing the constitution forbids.
  const scope = await tenantScopeIds(principal);
  const rows = await db
    .select({ id: s.legalEntities.id, tenantId: s.legalEntities.tenantId })
    .from(s.legalEntities)
    .where(inArray(s.legalEntities.tenantId, scope))
    .limit(5000);
  if (!rows.some((r) => r.id === legalEntityId)) {
    throw new FamilyOfficeProtectionError("SCOPE", "The legal entity is outside the caller's scope (or unknown); corporate-adjacent views link only entities the caller may see (§21).");
  }
}

export async function createPolicy(actor: FamilyOfficeActor, principal: Principal, input: CreatePolicyInput) {
  const id = newId(ID_PREFIX.foInsurancePolicy);
  const candidate = candidateFromInput(actor, { ...input }, { id });
  const findings = validatePolicy(candidate);
  if (findings.length > 0) {
    throw new FamilyOfficeProtectionError("VALIDATION", "The policy record was refused by the Family Office protection engine.", findings.map((f) => `${f.rule} ${f.field}: ${f.message}`));
  }
  await assertWithinScope(principal, actor.tenantId);
  await assertLegalEntityInScope(principal, input.legalEntityId);

  // Duplicate policy numbers are refused here with a governed error; the unique
  // index remains the last-line authority for races.
  const clash = await db
    .select({ id: s.familyInsurancePolicies.id })
    .from(s.familyInsurancePolicies)
    .where(and(eq(s.familyInsurancePolicies.tenantId, actor.tenantId), eq(s.familyInsurancePolicies.policyNumber, input.policyNumber)))
    .limit(1);
  if (clash.length > 0) {
    throw new FamilyOfficeProtectionError("GOVERNANCE", "A policy with this policyNumber already exists in this tenant; the insurer's number identifies exactly one contract here.");
  }

  return withAuditTransaction(
    async () => {
      await db.insert(s.familyInsurancePolicies).values({
        id,
        tenantId: actor.tenantId,
        legalEntityId: input.legalEntityId,
        countryCode: input.countryCode,
        policyNumber: input.policyNumber,
        policyType: input.policyType,
        ownerRef: input.ownerRef,
        ownerKind: input.ownerKind,
        insuredRef: input.insuredRef,
        insuredKind: input.insuredKind,
        premiumPayerRef: input.premiumPayerRef,
        insurerRef: input.insurerRef,
        brokerRef: input.brokerRef,
        currency: input.currency,
        coverageAmount: minorToNumeric(input.coverageAmountMinor),
        deathBenefit: minorToNumeric(input.deathBenefitMinor),
        cashValue: input.cashValueMinor === null ? null : minorToNumeric(input.cashValueMinor),
        surrenderValue: input.surrenderValueMinor === null ? null : minorToNumeric(input.surrenderValueMinor),
        premiumAmount: minorToNumeric(input.premiumAmountMinor),
        premiumFrequency: input.premiumFrequency,
        nextPremiumDueDate: input.nextPremiumDueDate,
        effectiveDate: input.effectiveDate,
        maturityDate: input.maturityDate,
        reviewIntervalDays: input.reviewIntervalDays,
        nextReviewDate: input.nextReviewDate,
        status: "DRAFT",
        governanceStage: "DRAFT",
        purpose: input.purpose,
        successionPlanId: input.successionPlanId,
        successionPlanRef: input.successionPlanRef,
        liquidityObjectiveRef: input.liquidityObjectiveRef,
        riskAssessmentRef: input.riskAssessmentRef,
        hcmEmployeeRef: input.hcmEmployeeRef,
        documentRefs: input.documentRefs,
        jurisdictionRef: input.jurisdictionRef,
        amountProvenance: input.amountProvenance,
        amountSourceRef: input.amountSourceRef,
        epistemicClass: input.amountProvenance,
        recordedBy: actor.userId,
        classification: "RESTRICTED",
      });
      return { id };
    },
    (r) =>
      auditBase(actor, "family.protection.policy.create", "FAMILY_INSURANCE_POLICY", r.id, "familyoffice:protection.manage", {
        policyNumber: input.policyNumber,
        policyType: input.policyType,
        currency: input.currency,
        deathBenefitMinor: input.deathBenefitMinor,
        amountProvenance: input.amountProvenance,
        contingentProtection: true,
      }),
    (r) =>
      protectionEvent(actor, FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_POLICY_CREATED, "FAMILY_INSURANCE_POLICY", r.id, "RESTRICTED", {
        policyNumber: input.policyNumber,
        policyType: input.policyType,
        currency: input.currency,
      }, input.legalEntityId),
  );
}

/** The exact set of fields a PATCH may change. Anything else is server-derived. */
const PATCHABLE: readonly (keyof PolicyRecord)[] = [
  "policyNumber", "insurerRef", "brokerRef", "ownerRef", "ownerKind", "insuredRef", "insuredKind",
  "premiumPayerRef", "countryCode", "coverageAmountMinor", "deathBenefitMinor", "cashValueMinor",
  "surrenderValueMinor", "premiumAmountMinor", "premiumFrequency", "nextPremiumDueDate",
  "effectiveDate", "maturityDate", "reviewIntervalDays", "nextReviewDate", "purpose",
  "liquidityObjectiveRef", "riskAssessmentRef", "hcmEmployeeRef", "documentRefs",
  "jurisdictionRef", "amountProvenance", "amountSourceRef", "legalEntityId", "successionPlanRef",
];

export type UpdatePolicyPatch = Partial<Pick<PolicyRecord, (typeof PATCHABLE)[number]>>;

export async function updatePolicy(actor: FamilyOfficeActor, principal: Principal, policyId: string, patch: UpdatePolicyPatch) {
  const scope = await tenantScopeIds(principal);
  const current = await scopedPolicyRow(principal, scope, policyId);
  const keys = Object.keys(patch) as (keyof UpdatePolicyPatch)[];
  const unknown = keys.filter((k) => !PATCHABLE.includes(k as never));
  if (unknown.length > 0) {
    throw new FamilyOfficeProtectionError("VALIDATION", `Fields outside the governed patch set: ${unknown.join(", ")}. status/governanceStage transition through their own endpoints.`, unknown);
  }
  const loanOutstanding = await loanOutstandingFor(db, policyId);
  const base = rowToPolicyRecord(current, loanOutstanding);
  const merged: PolicyRecord = { ...base, ...patch } as PolicyRecord;
  const findings = validatePolicy(merged);
  if (findings.length > 0) {
    throw new FamilyOfficeProtectionError("VALIDATION", "The amended policy record was refused by the engine.", findings.map((f) => `${f.rule} ${f.field}: ${f.message}`));
  }
  if (patch.legalEntityId) await assertLegalEntityInScope(principal, patch.legalEntityId);

  return withAuditTransaction(
    async () => {
      await db
        .update(s.familyInsurancePolicies)
        .set({
          ...mapPolicyPatchToColumns(patch),
          epistemicClass: merged.amountProvenance,
          updatedAt: new Date(),
        })
        .where(eq(s.familyInsurancePolicies.id, policyId));
      return { id: policyId };
    },
    () =>
      auditBase(
        actor,
        "family.protection.policy.update",
        "FAMILY_INSURANCE_POLICY",
        policyId,
        "familyoffice:protection.manage",
        { changed: keys },
        { policyNumber: current.policyNumber, status: current.status, governanceStage: current.governanceStage },
        `Governed amendment of recorded fields (keys: ${keys.join(",")}). Contingent protection remains non-liquid (§4).`,
      ),
    () =>
      protectionEvent(actor, FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_POLICY_UPDATED, "FAMILY_INSURANCE_POLICY", policyId, "RESTRICTED", { changed: keys }),
  );
}

function mapPolicyPatchToColumns(patch: UpdatePolicyPatch): Partial<typeof s.familyInsurancePolicies.$inferInsert> {
  const out: Partial<typeof s.familyInsurancePolicies.$inferInsert> = {};
  if (patch.policyNumber !== undefined) out.policyNumber = patch.policyNumber;
  if (patch.insurerRef !== undefined) out.insurerRef = patch.insurerRef;
  if (patch.brokerRef !== undefined) out.brokerRef = patch.brokerRef;
  if (patch.ownerRef !== undefined) out.ownerRef = patch.ownerRef;
  if (patch.ownerKind !== undefined) out.ownerKind = patch.ownerKind;
  if (patch.insuredRef !== undefined) out.insuredRef = patch.insuredRef;
  if (patch.insuredKind !== undefined) out.insuredKind = patch.insuredKind;
  if (patch.premiumPayerRef !== undefined) out.premiumPayerRef = patch.premiumPayerRef;
  if (patch.countryCode !== undefined) out.countryCode = patch.countryCode;
  if (patch.legalEntityId !== undefined) out.legalEntityId = patch.legalEntityId;
  if (patch.coverageAmountMinor !== undefined) out.coverageAmount = minorToNumeric(patch.coverageAmountMinor);
  if (patch.deathBenefitMinor !== undefined) out.deathBenefit = minorToNumeric(patch.deathBenefitMinor);
  if (patch.cashValueMinor !== undefined) out.cashValue = patch.cashValueMinor === null ? null : minorToNumeric(patch.cashValueMinor);
  if (patch.surrenderValueMinor !== undefined) out.surrenderValue = patch.surrenderValueMinor === null ? null : minorToNumeric(patch.surrenderValueMinor);
  if (patch.premiumAmountMinor !== undefined) out.premiumAmount = minorToNumeric(patch.premiumAmountMinor);
  if (patch.premiumFrequency !== undefined) out.premiumFrequency = patch.premiumFrequency;
  if (patch.nextPremiumDueDate !== undefined) out.nextPremiumDueDate = patch.nextPremiumDueDate;
  if (patch.effectiveDate !== undefined) out.effectiveDate = patch.effectiveDate;
  if (patch.maturityDate !== undefined) out.maturityDate = patch.maturityDate;
  if (patch.reviewIntervalDays !== undefined) out.reviewIntervalDays = patch.reviewIntervalDays;
  if (patch.nextReviewDate !== undefined) out.nextReviewDate = patch.nextReviewDate;
  if (patch.purpose !== undefined) out.purpose = patch.purpose;
  if (patch.liquidityObjectiveRef !== undefined) out.liquidityObjectiveRef = patch.liquidityObjectiveRef;
  if (patch.riskAssessmentRef !== undefined) out.riskAssessmentRef = patch.riskAssessmentRef;
  if (patch.hcmEmployeeRef !== undefined) out.hcmEmployeeRef = patch.hcmEmployeeRef;
  if (patch.documentRefs !== undefined) out.documentRefs = patch.documentRefs;
  if (patch.jurisdictionRef !== undefined) out.jurisdictionRef = patch.jurisdictionRef;
  if (patch.amountProvenance !== undefined) out.amountProvenance = patch.amountProvenance;
  if (patch.amountSourceRef !== undefined) out.amountSourceRef = patch.amountSourceRef;
  if (patch.successionPlanRef !== undefined) {
    out.successionPlanRef = patch.successionPlanRef;
    // Clearing the ref also clears the structured link; the two are recorded
    // together or not at all (id-linking an amended plan is a new act).
    if (patch.successionPlanRef === null) out.successionPlanId = null;
  }
  return out;
}

export async function transitionPolicyStatus(
  actor: FamilyOfficeActor,
  principal: Principal,
  policyId: string,
  to: InsurancePolicyStatus,
  opts: { evidenceRef: string | null; reason: string },
) {
  const scope = await tenantScopeIds(principal);
  const current = await scopedPolicyRow(principal, scope, policyId);
  const findings = canTransitionPolicyStatus(
    current.status as InsurancePolicyStatus,
    to,
    opts.evidenceRef,
    current.updatedAt.toISOString().slice(0, 10),
    { maturityDate: current.maturityDate },
  );
  if (findings.length > 0) {
    throw new FamilyOfficeProtectionError("GOVERNANCE", "The proposed status transition was refused by the policy lifecycle engine.", findings.map((f) => `${f.rule}: ${f.message}`));
  }
  return withAuditTransaction(
    async () => {
      await db
        .update(s.familyInsurancePolicies)
        .set({ status: to, updatedAt: new Date() })
        .where(eq(s.familyInsurancePolicies.id, policyId));
      return { id: policyId, from: current.status, to };
    },
    (r) =>
      auditBase(
        actor,
        "family.protection.policy.status",
        "FAMILY_INSURANCE_POLICY",
        policyId,
        "familyoffice:protection.manage",
        { status: r.to, evidenceRef: opts.evidenceRef },
        { status: r.from },
        opts.reason,
      ),
    (r) =>
      protectionEvent(
        actor,
        r.to === "TERMINATED" ? FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_POLICY_TERMINATED : FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_POLICY_STATUS_CHANGED,
        "FAMILY_INSURANCE_POLICY",
        policyId,
        "RESTRICTED",
        { from: r.from, to: r.to, evidenceRef: opts.evidenceRef },
      ),
  );
}

export async function advanceGovernanceStage(
  actor: FamilyOfficeActor,
  principal: Principal,
  policyId: string,
  to: InsuranceGovernanceStage,
  ctx: { authorityRef: string | null; reviewFindingCount: number | null; isHighValue: boolean | null; thresholdSourceRef: string | null; actorType?: "HUMAN" | "SERVICE" | "AI" },
) {
  const scope = await tenantScopeIds(principal);
  const current = await scopedPolicyRow(principal, scope, policyId);
  const from = current.governanceStage as InsuranceGovernanceStage;
  const findings = canAdvanceGovernanceStage(from, to, {
    authorityRef: ctx.authorityRef,
    actorType: ctx.actorType ?? "HUMAN",
    reviewFindingCount: ctx.reviewFindingCount,
    isHighValue: ctx.isHighValue,
    thresholdSourceRef: ctx.thresholdSourceRef,
  });
  if (findings.length > 0) {
    throw new FamilyOfficeProtectionError("GOVERNANCE", "The governance-stage advance was refused.", findings.map((f) => `${f.rule}: ${f.message}`));
  }
  return withAuditTransaction(
    async () => {
      await db
        .update(s.familyInsurancePolicies)
        .set({ governanceStage: to, updatedAt: new Date() })
        .where(eq(s.familyInsurancePolicies.id, policyId));
      return { id: policyId, from, to };
    },
    (r) =>
      auditBase(
        actor,
        "family.protection.policy.governance",
        "FAMILY_INSURANCE_POLICY",
        policyId,
        ctx.authorityRef ? `authority:${ctx.authorityRef}` : "familyoffice:protection.manage",
        { governanceStage: r.to, thresholdSourceRef: ctx.thresholdSourceRef },
        { governanceStage: r.from },
        `Governance lifecycle advance ${r.from} → ${r.to}.`,
      ),
    (r) =>
      protectionEvent(actor, FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_GOVERNANCE_STAGE_ADVANCED, "FAMILY_INSURANCE_POLICY", policyId, "RESTRICTED", {
        from: r.from,
        to: r.to,
        authorityRef: ctx.authorityRef,
        skipAuthorized: skipChainAuthorized({ ...ctx, actorType: ctx.actorType ?? "HUMAN", reviewFindingCount: ctx.reviewFindingCount }),
      }),
  );
}

/* ------------------------------------------------------------------ */
/* Beneficiary designations (§6 register)                                */
/* ------------------------------------------------------------------ */

export type DesignationInput = {
  beneficiaryRef: string;
  beneficiaryKind: "FAMILY_MEMBER" | "LEGAL_ENTITY" | "TRUST" | "CHARITABLE" | "OTHER";
  designationType: "PRIMARY" | "CONTINGENT";
  entitlementBasis: "PERCENTAGE" | "FIXED_AMOUNT" | "RESIDUARY";
  pctMillionths: number | null;
  fixedAmountMinor: number | null;
  currency: string | null;
  effectiveDate: string;
  endDate: string | null;
  status: "PROPOSED" | "ACTIVE";
  relationshipBasis: string;
  notes: string | null;
  documentRef: string | null;
  supersedesDesignationId: string | null;
  authorityRef: string | null;
};

export async function recordDesignation(actor: FamilyOfficeActor, principal: Principal, policyId: string, input: DesignationInput) {
  const scope = await tenantScopeIds(principal);
  const policy = await scopedPolicyRow(principal, scope, policyId);

  const existing = await db
    .select()
    .from(s.familyInsuranceBeneficiaryDesignations)
    .where(eq(s.familyInsuranceBeneficiaryDesignations.policyId, policyId));

  const id = newId(ID_PREFIX.foInsuranceDesignation);
  const candidate = {
    id,
    policyId,
    beneficiaryRef: input.beneficiaryRef,
    beneficiaryKind: input.beneficiaryKind,
    designationType: input.designationType,
    entitlementBasis: input.entitlementBasis,
    pctMillionths: input.pctMillionths,
    fixedAmountMinor: input.fixedAmountMinor,
    currency: input.currency,
    effectiveDate: input.effectiveDate,
    endDate: input.endDate,
    status: input.status,
    relationshipBasis: input.relationshipBasis,
    notes: input.notes,
  };
  const findings = validateDesignation(candidate);
  const errors = findings.filter((f) => f.severity === "WARNING" || f.severity === "ESCALATE");
  if (errors.length > 0) {
    throw new FamilyOfficeProtectionError("VALIDATION", "The beneficiary designation was refused.", errors.map((f) => `${f.code}: ${f.detail}`));
  }

  const asOf = policy.updatedAt.toISOString().slice(0, 10);
  const engineExisting = existing
    .filter((d) => d.id !== input.supersedesDesignationId) // the superseded row leaves the ACTIVE set
    .map((d) => ({
      id: d.id,
      policyId: d.policyId,
      beneficiaryRef: d.beneficiaryRef,
      beneficiaryKind: d.beneficiaryKind as never,
      designationType: d.designationType as never,
      entitlementBasis: d.entitlementBasis as never,
      pctMillionths: d.pctMillionths,
      fixedAmountMinor: d.fixedAmount === null ? null : numericToMinor(d.fixedAmount),
      currency: d.currency,
      effectiveDate: d.effectiveDate ?? "",
      endDate: d.endDate,
      status: (input.supersedesDesignationId && d.id === input.supersedesDesignationId ? "SUPERSEDED" : d.status) as never,
      relationshipBasis: d.relationshipBasis,
      notes: d.notes,
    }));
  if (input.status === "ACTIVE") {
    // The resulting state is checked, and only IMPOSSIBLE states (ESCALATE:
    // over-100%, contradictory residuaries, mixed bases) refuse the write.
    // An INCOMPLETE allocation (WARNING: e.g. 60% assigned) is recorded AND
    // flagged — §14 says the system flags; blocking here would make it
    // impossible to ever record the first designation of a policy.
    const after = summariseAllocations([...engineExisting, candidate], asOf);
    const blocking = after.findings.filter((f) => f.severity === "ESCALATE");
    if (blocking.length > 0) {
      throw new FamilyOfficeProtectionError("GOVERNANCE", "Activating this designation would leave the policy's PRIMARY allocation impossible.", blocking.map((f) => `${f.code}: ${f.detail}`));
    }
  }
  if (input.supersedesDesignationId) {
    const target = existing.find((d) => d.id === input.supersedesDesignationId);
    if (!target || target.policyId !== policyId) {
      throw new FamilyOfficeProtectionError("NOT_FOUND", "The designation to supersede is not part of this policy.");
    }
  }

  return withAuditTransaction(
    async () => {
      await db.insert(s.familyInsuranceBeneficiaryDesignations).values({
        id,
        tenantId: actor.tenantId,
        policyId,
        beneficiaryRef: input.beneficiaryRef,
        beneficiaryKind: input.beneficiaryKind,
        designationType: input.designationType,
        entitlementBasis: input.entitlementBasis,
        pctMillionths: input.pctMillionths,
        fixedAmount: input.fixedAmountMinor === null ? null : minorToNumeric(input.fixedAmountMinor),
        currency: input.currency,
        effectiveDate: input.effectiveDate,
        endDate: input.endDate,
        status: input.status,
        relationshipBasis: input.relationshipBasis,
        reviewStatus: "CONFIRMED",
        legalReviewStatus: null,
        documentRef: input.documentRef,
        notes: input.notes,
        recordedBy: actor.userId,
        authorityRef: input.authorityRef,
      });
      if (input.supersedesDesignationId) {
        await db
          .update(s.familyInsuranceBeneficiaryDesignations)
          .set({ status: "SUPERSEDED", updatedAt: new Date() })
          .where(eq(s.familyInsuranceBeneficiaryDesignations.id, input.supersedesDesignationId));
      }
      return { id };
    },
    () =>
      auditBase(actor, "family.protection.designation.record", "FAMILY_INSURANCE_BENEFICIARY", id, "familyoffice:beneficiary.manage", {
        policyId,
        beneficiaryRef: input.beneficiaryRef,
        designationType: input.designationType,
        entitlementBasis: input.entitlementBasis,
        pctMillionths: input.pctMillionths,
        status: input.status,
        supersedesDesignationId: input.supersedesDesignationId,
      }),
    () =>
      protectionEvent(actor, FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_BENEFICIARY_CHANGED, "FAMILY_INSURANCE_BENEFICIARY", id, "RESTRICTED", {
        policyId,
        designationType: input.designationType,
        status: input.status,
      }),
  );
}

/* ------------------------------------------------------------------ */
/* Premiums (§10)                                                       */
/* ------------------------------------------------------------------ */

export type PremiumInput = {
  dueDate: string;
  amountMinor: number;
  currency: string;
  frequency: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL" | "SINGLE";
  status: "SCHEDULED" | "PAID" | "WAIVED" | "VOID";
  payerRef: string | null;
  paidDate: string | null;
  paymentEvidenceDocumentRef: string | null;
  financeRecordRef: string | null;
  notes: string | null;
};

export async function recordPremium(actor: FamilyOfficeActor, principal: Principal, policyId: string, input: PremiumInput) {
  const scope = await tenantScopeIds(principal);
  await scopedPolicyRow(principal, scope, policyId);
  const id = newId(ID_PREFIX.foInsurancePremium);
  const findings = validatePremiumRecord({
    id,
    policyId,
    dueDate: input.dueDate,
    amountMinor: input.amountMinor,
    currency: input.currency,
    frequency: input.frequency,
    status: input.status,
    payerRef: input.payerRef,
    paidDate: input.paidDate,
    paymentEvidenceDocumentRef: input.paymentEvidenceDocumentRef,
    financeRecordRef: input.financeRecordRef,
    notes: input.notes,
  });
  if (findings.length > 0) {
    throw new FamilyOfficeProtectionError("VALIDATION", "The premium record was refused.", findings);
  }
  return withAuditTransaction(
    async () => {
      await db.insert(s.familyInsurancePremiums).values({
        id,
        tenantId: actor.tenantId,
        policyId,
        dueDate: input.dueDate,
        frequency: input.frequency,
        amount: minorToNumeric(input.amountMinor),
        currency: input.currency,
        status: input.status,
        payerRef: input.payerRef,
        paidDate: input.paidDate,
        paymentEvidenceDocumentRef: input.paymentEvidenceDocumentRef,
        financeRecordRef: input.financeRecordRef,
        epistemicClass: "USER_PROVIDED",
        notes: input.notes,
        recordedBy: actor.userId,
      });
      return { id };
    },
    () =>
      auditBase(actor, "family.protection.premium.record", "FAMILY_INSURANCE_PREMIUM", id, "familyoffice:protection.manage", {
        policyId,
        dueDate: input.dueDate,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: input.status,
        note: "Obligation tracking only — not a posting. Finance OS remains the accounting authority (§22).",
      }),
    () =>
      protectionEvent(actor, FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_PREMIUM_RECORDED, "FAMILY_INSURANCE_PREMIUM", id, "RESTRICTED", {
        policyId,
        status: input.status,
      }),
  );
}

/* ------------------------------------------------------------------ */
/* Assignments & loans                                                  */
/* ------------------------------------------------------------------ */

export async function recordAssignment(actor: FamilyOfficeActor, principal: Principal, policyId: string, input: {
  assignmentType: "COLLATERAL" | "ABSOLUTE";
  assigneeRef: string;
  assigneeName: string;
  securedAmountMinor: number | null;
  currency: string | null;
  effectiveDate: string;
  instrumentDocumentRef: string;
  notes: string | null;
}) {
  const scope = await tenantScopeIds(principal);
  await scopedPolicyRow(principal, scope, policyId);
  if (!input.instrumentDocumentRef.trim()) {
    throw new FamilyOfficeProtectionError("VALIDATION", "An assignment exists as an instrument; instrumentDocumentRef names the registered document. Without it the claim is unverifiable.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) {
    throw new FamilyOfficeProtectionError("VALIDATION", "effectiveDate must be an ISO calendar date.");
  }
  const id = newId(ID_PREFIX.foInsuranceAssignment);
  return withAuditTransaction(
    async () => {
      await db.insert(s.familyInsuranceAssignments).values({
        id,
        tenantId: actor.tenantId,
        policyId,
        assignmentType: input.assignmentType,
        assigneeRef: input.assigneeRef,
        assigneeName: input.assigneeName,
        securedAmount: input.securedAmountMinor === null ? null : minorToNumeric(input.securedAmountMinor),
        currency: input.currency,
        effectiveDate: input.effectiveDate,
        status: "ACTIVE",
        instrumentDocumentRef: input.instrumentDocumentRef,
        notes: input.notes,
        recordedBy: actor.userId,
      });
      // The policy's assignment posture is a PROJECTION of its active
      // assignments, maintained in the same transaction so it can never drift.
      await db
        .update(s.familyInsurancePolicies)
        .set({
          assignmentStatus: input.assignmentType === "COLLATERAL" ? "COLLATERAL_ASSIGNED" : "ABSOLUTELY_ASSIGNED",
          collateralBeneficiaryRef: input.assigneeRef,
          updatedAt: new Date(),
        })
        .where(eq(s.familyInsurancePolicies.id, policyId));
      return { id };
    },
    () =>
      auditBase(actor, "family.protection.assignment.record", "FAMILY_INSURANCE_ASSIGNMENT", id, "familyoffice:protection.manage", {
        policyId,
        assignmentType: input.assignmentType,
        assigneeRef: input.assigneeRef,
        instrumentDocumentRef: input.instrumentDocumentRef,
      }),
    () =>
      protectionEvent(actor, FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_ASSIGNMENT_RECORDED, "FAMILY_INSURANCE_ASSIGNMENT", id, "RESTRICTED", { policyId, assignmentType: input.assignmentType }),
  );
}

export async function recordPolicyLoan(actor: FamilyOfficeActor, principal: Principal, policyId: string, input: {
  advancedDate: string;
  principalMinor: number;
  interestRateBps: number | null;
  outstandingBalanceMinor: number | null;
  authorizationRef: string | null;
  notes: string | null;
}) {
  const scope = await tenantScopeIds(principal);
  const policy = await scopedPolicyRow(principal, scope, policyId);
  const findings: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.advancedDate)) findings.push("advancedDate must be an ISO calendar date.");
  if (!Number.isSafeInteger(input.principalMinor) || input.principalMinor <= 0) findings.push("principal must be a positive integer in minor units.");
  if (input.outstandingBalanceMinor !== null && (!Number.isSafeInteger(input.outstandingBalanceMinor) || input.outstandingBalanceMinor < 0)) findings.push("outstandingBalance must be a non-negative integer in minor units, or null.");
  if (policy.cashValue === null) findings.push("A policy loan requires the contract to carry a recorded cash value; this record has none, and the engine will not invent one.");
  if (findings.length > 0) throw new FamilyOfficeProtectionError("VALIDATION", "The policy-loan record was refused.", findings);
  const id = newId(ID_PREFIX.foInsuranceLoan);
  return withAuditTransaction(
    async () => {
      await db.insert(s.familyInsurancePolicyLoans).values({
        id,
        tenantId: actor.tenantId,
        policyId,
        advancedDate: input.advancedDate,
        principal: minorToNumeric(input.principalMinor),
        interestRateBps: input.interestRateBps,
        outstandingBalance: input.outstandingBalanceMinor === null ? null : minorToNumeric(input.outstandingBalanceMinor),
        status: "OUTSTANDING",
        authorizationRef: input.authorizationRef,
        notes: input.notes,
        recordedBy: actor.userId,
      });
      return { id };
    },
    () =>
      auditBase(actor, "family.protection.loan.record", "FAMILY_INSURANCE_POLICY_LOAN", id, "familyoffice:protection.manage", {
        policyId,
        principalMinor: input.principalMinor,
        outstandingBalanceMinor: input.outstandingBalanceMinor,
      }),
    () =>
      protectionEvent(actor, FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_POLICY_LOAN_RECORDED, "FAMILY_INSURANCE_POLICY_LOAN", id, "RESTRICTED", { policyId }),
  );
}

/* ------------------------------------------------------------------ */
/* Reviews (§14) — the flag engine writes nothing; a review ROW is      */
/* recorded by a human standing over the findings.                      */
/* ------------------------------------------------------------------ */

export async function recordReview(actor: FamilyOfficeActor, principal: Principal, policyId: string, input: {
  reviewKind: "POLICY_REVIEW" | "BENEFICIARY_REVIEW" | "CLAIM_REVIEW" | "SUCCESSION_ALIGNMENT" | "MAJOR_FAMILY_CHANGE" | "MAJOR_OWNERSHIP_CHANGE";
  reviewDate: string;
  reviewerRef: string;
  outcome: "COMPLETED" | "EXCEPTIONS_RAISED" | "DEFERRED";
  exceptions: readonly unknown[];
  nextReviewDate: string | null;
  evidenceDocumentRefs: string[];
  governanceStageAfter: InsuranceGovernanceStage | null;
  authorityRef: string | null;
  notes: string | null;
}) {
  const scope = await tenantScopeIds(principal);
  const policy = await scopedPolicyRow(principal, scope, policyId);
  const findings: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reviewDate)) findings.push("reviewDate must be an ISO calendar date.");
  if (!input.reviewerRef.trim()) findings.push("reviewerRef names the human who stood over the review.");
  if (input.nextReviewDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.nextReviewDate)) findings.push("nextReviewDate must be an ISO calendar date or null.");
  if (findings.length > 0) throw new FamilyOfficeProtectionError("VALIDATION", "The review record was refused.", findings);

  // If the review proposes to move the governance stage, the stage machine —
  // not this caller — decides whether that move is lawful.
  const stageFindings =
    input.governanceStageAfter === null
      ? []
      : canAdvanceGovernanceStage(policy.governanceStage as InsuranceGovernanceStage, input.governanceStageAfter, {
          authorityRef: input.authorityRef,
          actorType: "HUMAN",
          reviewFindingCount: input.exceptions.length,
          isHighValue: null,
          thresholdSourceRef: null,
        });
  if (stageFindings.length > 0) {
    throw new FamilyOfficeProtectionError("GOVERNANCE", "The review may be recorded, but the governance advance it carries was refused.", stageFindings.map((f) => `${f.rule}: ${f.message}`));
  }

  const id = newId(ID_PREFIX.foInsuranceReview);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.familyInsuranceReviews).values({
        id,
        tenantId: actor.tenantId,
        policyId,
        reviewKind: input.reviewKind,
        reviewDate: input.reviewDate,
        reviewerRef: input.reviewerRef,
        reviewerType: "HUMAN",
        outcome: input.outcome,
        exceptions: input.exceptions as never,
        nextReviewDate: input.nextReviewDate,
        evidenceDocumentRefs: input.evidenceDocumentRefs,
        governanceStageAfter: input.governanceStageAfter,
        authorityRef: input.authorityRef,
        notes: input.notes,
      });
      // A COMPLETED review moves the policy's cadence forward — recorded, not
      // inferred: lastReviewDate/nextReviewDate become what the reviewer set.
      await tx
        .update(s.familyInsurancePolicies)
        .set({
          lastReviewDate: input.reviewDate,
          nextReviewDate: input.nextReviewDate ?? policy.nextReviewDate,
          ...(input.governanceStageAfter ? { governanceStage: input.governanceStageAfter } : {}),
          updatedAt: new Date(),
        })
        .where(eq(s.familyInsurancePolicies.id, policyId));
      return { id };
    },
    () =>
      auditBase(actor, "family.protection.review.record", "FAMILY_INSURANCE_REVIEW", id, input.authorityRef ? `authority:${input.authorityRef}` : "familyoffice:protection.manage", {
        policyId,
        reviewKind: input.reviewKind,
        outcome: input.outcome,
        exceptionCount: input.exceptions.length,
        governanceStageAfter: input.governanceStageAfter,
      }),
    () =>
      protectionEvent(actor, FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_REVIEW_COMPLETED, "FAMILY_INSURANCE_REVIEW", id, "RESTRICTED", {
        policyId,
        outcome: input.outcome,
        exceptions: input.exceptions.length,
      }),
  );
}

/* ------------------------------------------------------------------ */
/* Claims (§16)                                                         */
/* ------------------------------------------------------------------ */

export type ClaimInput = {
  policyId: string;
  claimReference: string;
  incidentDate: string;
  notificationDate: string | null;
  documentRefs: string[];
  notes: string | null;
};

export async function openClaim(actor: FamilyOfficeActor, principal: Principal, input: ClaimInput) {
  const scope = await tenantScopeIds(principal);
  const policy = await scopedPolicyRow(principal, scope, input.policyId);
  const id = newId(ID_PREFIX.foInsuranceClaim);
  const candidate = {
    id,
    policyId: input.policyId,
    claimReference: input.claimReference,
    insuredRef: policy.insuredRef ?? "",
    insurerRef: policy.insurerRef,
    incidentDate: input.incidentDate,
    notificationDate: input.notificationDate,
    status: "CLAIM_OPENED" as ClaimStatus,
    proceedsState: "NONE" as ProceedsState,
    approvedAmountMinor: null,
    receivedAmountMinor: null,
    currency: policy.currency,
    proceedsReceivedDate: null,
    allocationRef: null,
    decisionEvidenceRef: null,
    documentRefs: input.documentRefs,
  };
  const findings = validateClaimRecord(candidate);
  if (findings.length > 0) {
    throw new FamilyOfficeProtectionError("VALIDATION", "The claim record was refused.", findings.map((f) => `${f.rule}: ${f.message}`));
  }
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.familyInsuranceClaims).values({
        id,
        tenantId: actor.tenantId,
        policyId: input.policyId,
        claimReference: input.claimReference,
        insuredRef: candidate.insuredRef || "UNRECORDED",
        insurerRef: policy.insurerRef,
        incidentDate: input.incidentDate,
        notificationDate: input.notificationDate,
        status: "CLAIM_OPENED",
        proceedsState: "NONE",
        currency: policy.currency,
        documentRefs: input.documentRefs,
        notes: input.notes,
        epistemicClass: "USER_PROVIDED",
        createdBy: actor.userId,
      });
      await tx.insert(s.familyInsuranceClaimEvents).values({
        id: newId(ID_PREFIX.foInsuranceClaimEvent),
        tenantId: actor.tenantId,
        claimId: id,
        eventKind: "OPENED",
        fromStatus: null,
        toStatus: "CLAIM_OPENED",
        actorRef: actor.userId,
        actorType: "HUMAN",
      });
      return { id };
    },
    () =>
      auditBase(actor, "family.protection.claim.open", "FAMILY_INSURANCE_CLAIM", id, "familyoffice:claim.manage", {
        policyId: input.policyId,
        claimReference: input.claimReference,
      }),
    () =>
      protectionEvent(actor, FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_CLAIM_OPENED, "FAMILY_INSURANCE_CLAIM", id, "RESTRICTED", {
        policyId: input.policyId,
        claimReference: input.claimReference,
      }),
  );
}

export type ClaimTransitionInput = {
  to: ClaimStatus;
  proceedsTo: ProceedsState | null;
  evidenceRef: string | null;
  approvedAmountMinor: number | null;
  receivedAmountMinor: number | null;
  receivedDate: string | null;
  allocationRef: string | null;
  note: string | null;
  eventKind: "DOCUMENT_REQUESTED" | "DOCUMENT_SUPPLIED" | "SUBMITTED" | "INSURER_DECISION" | "DISPUTE_RAISED" | "PROCEEDS_NOTED" | "ALLOCATED" | "NOTE" | "CLOSED";
};

export async function transitionClaim(actor: FamilyOfficeActor, principal: Principal, claimId: string, input: ClaimTransitionInput) {
  const scope = await tenantScopeIds(principal);
  const claimRows = await db.select().from(s.familyInsuranceClaims).where(and(inArray(s.familyInsuranceClaims.tenantId, scope), eq(s.familyInsuranceClaims.id, claimId))).limit(1);
  const claim = claimRows[0];
  if (!claim) throw new FamilyOfficeProtectionError("NOT_FOUND", "No such claim within the caller's scope.");

  const findings = canTransitionClaim(claim.status as ClaimStatus, input.to, {
    evidenceRef: input.evidenceRef,
    approvedAmountMinor: input.approvedAmountMinor ?? (claim.approvedAmount === null ? null : numericToMinor(claim.approvedAmount)),
    receivedAmountMinor: input.receivedAmountMinor ?? (claim.receivedAmount === null ? null : numericToMinor(claim.receivedAmount)),
    receivedDate: input.receivedDate,
    allocationRef: input.allocationRef,
    actorType: "HUMAN",
  });
  if (findings.length > 0) {
    throw new FamilyOfficeProtectionError("GOVERNANCE", "The claim transition was refused.", findings.map((f) => `${f.rule}: ${f.message}`));
  }
  const proceedsFindings = input.proceedsTo === null ? [] : validateProceedsAdvance(claim.proceedsState as ProceedsState, input.proceedsTo);
  if (proceedsFindings.length > 0) {
    throw new FamilyOfficeProtectionError("GOVERNANCE", "The proceeds advance was refused.", proceedsFindings.map((f) => `${f.rule}: ${f.message}`));
  }
  // Consistency between the two machines on one row: a claim cannot be
  // PROCEEDS_RECEIVED while its proceeds are still EXPECTED, etc.
  if (input.to === "PROCEEDS_RECEIVED" && input.proceedsTo !== "RECEIVED") {
    throw new FamilyOfficeProtectionError("GOVERNANCE", "A claim moving to PROCEEDS_RECEIVED must advance its proceeds state to RECEIVED in the same governed step.");
  }
  if (input.to === "ALLOCATED" && input.proceedsTo !== "ALLOCATED") {
    throw new FamilyOfficeProtectionError("GOVERNANCE", "A claim moving to ALLOCATED must advance its proceeds state to ALLOCATED in the same governed step.");
  }
  if (input.proceedsTo === "RECEIVED" && input.to !== "PROCEEDS_RECEIVED" && input.to !== "ALLOCATED") {
    throw new FamilyOfficeProtectionError("GOVERNANCE", "Proceeds reach RECEIVED only via the PROCEEDS_RECEIVED step (or together with ALLOCATED).");
  }

  return withAuditTransaction(
    async (tx) => {
      await tx
        .update(s.familyInsuranceClaims)
        .set({
          status: input.to,
          ...(input.proceedsTo ? { proceedsState: input.proceedsTo } : {}),
          ...(input.approvedAmountMinor !== null ? { approvedAmount: minorToNumeric(input.approvedAmountMinor) } : {}),
          ...(input.receivedAmountMinor !== null ? { receivedAmount: minorToNumeric(input.receivedAmountMinor) } : {}),
          ...(input.receivedDate ? { proceedsReceivedDate: input.receivedDate } : {}),
          ...(input.allocationRef ? { allocationRef: input.allocationRef } : {}),
          ...(input.evidenceRef && (input.to === "APPROVED" || input.to === "DENIED") ? { decisionEvidenceRef: input.evidenceRef } : {}),
          updatedAt: new Date(),
        })
        .where(eq(s.familyInsuranceClaims.id, claimId));
      await tx.insert(s.familyInsuranceClaimEvents).values({
        id: newId(ID_PREFIX.foInsuranceClaimEvent),
        tenantId: actor.tenantId,
        claimId,
        eventKind: input.eventKind,
        fromStatus: claim.status,
        toStatus: input.to,
        note: input.note,
        evidenceDocumentRef: input.evidenceRef,
        actorRef: actor.userId,
        actorType: "HUMAN",
      });
      return { id: claimId, from: claim.status, to: input.to, proceedsTo: input.proceedsTo };
    },
    (r) =>
      auditBase(
        actor,
        "family.protection.claim.transition",
        "FAMILY_INSURANCE_CLAIM",
        claimId,
        "familyoffice:claim.manage",
        { status: r.to, proceedsState: r.proceedsTo, approvedAmountMinor: input.approvedAmountMinor, receivedAmountMinor: input.receivedAmountMinor, allocationRef: input.allocationRef },
        { status: r.from, proceedsState: claim.proceedsState },
        `Claim lifecycle transition recorded from insurer/receipt evidence (${input.evidenceRef ?? "no external evidence cited — permitted for non-decision steps"}).`,
      ),
    (r) => {
      const type: FamilyOfficeProtectionEventType =
        r.to === "APPROVED"
          ? FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_CLAIM_APPROVED
          : r.proceedsTo === "RECEIVED"
            ? FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_PROCEEDS_RECEIVED
            : r.proceedsTo === "ALLOCATED"
              ? FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_PROCEEDS_ALLOCATED
              : FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_CLAIM_UPDATED;
      // Reference-and-state payload only. Money values stay on the
      // HIGHLY_RESTRICTED claim ROW; the event index never carries an amount,
      // which also keeps the shared enterprise stream readable at every
      // clearance at or above RESTRICTED (no withheld-event side effects).
      return protectionEvent(actor, type, "FAMILY_INSURANCE_CLAIM", claimId, "RESTRICTED", {
        from: r.from,
        to: r.to,
        proceedsState: r.proceedsTo,
      });
    },
  );
}

/* ------------------------------------------------------------------ */
/* Protection assessments (§11)                                         */
/* ------------------------------------------------------------------ */

export async function createAssessment(actor: FamilyOfficeActor, principal: Principal, input: {
  asOf: string;
  currency: string;
  subjectRef: string;
  subjectKind: "FAMILY_MEMBER" | "LEGAL_ENTITY" | "FAMILY";
  components: GapComponent[];
  policyRefs: string[];
  status: "DRAFT" | "FINAL";
  legalEntityId: string | null;
  countryCode: string | null;
  reviewedBy: string | null;
  authorityRef: string | null;
}) {
  const scope = await tenantScopeIds(principal);
  // Every referenced policy must itself be in scope — a gap built from other
  // families' coverage would be a fabrication with extra steps.
  if (input.policyRefs.length > 0) {
    const visible = await db
      .select({ id: s.familyInsurancePolicies.id })
      .from(s.familyInsurancePolicies)
      .where(and(inArray(s.familyInsurancePolicies.tenantId, scope), inArray(s.familyInsurancePolicies.id, input.policyRefs)));
    if (visible.length !== new Set(input.policyRefs).size) {
      throw new FamilyOfficeProtectionError("SCOPE", "One or more referenced policies are outside the caller's scope or unknown.");
    }
  }
  // Deterministic engine run over the caller's inputs (validation lives there).
  const result = computeProtectionGap({ asOf: input.asOf, currency: input.currency, components: input.components });
  const id = newId(ID_PREFIX.foProtectionAssessment);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.familyProtectionAssessments).values({
        id,
        tenantId: actor.tenantId,
        legalEntityId: input.legalEntityId,
        countryCode: input.countryCode,
        subjectRef: input.subjectRef,
        subjectKind: input.subjectKind,
        asOf: input.asOf,
        currency: input.currency,
        components: input.components as never,
        policyRefs: input.policyRefs,
        result: result as never,
        methodology: "beyu.protection-gap",
        methodologyVersion: FAMILY_OFFICE_PROTECTION_VERSION,
        status: input.status,
        epistemicClass: "MODELLED",
        disclaimer: PROTECTION_MODELED_DISCLAIMER,
        reviewedBy: input.reviewedBy,
        authorityRef: input.authorityRef,
        createdBy: actor.userId,
      });
      return { id };
    },
    () =>
      auditBase(actor, "family.protection.assessment.record", "FAMILY_PROTECTION_ASSESSMENT", id, "familyoffice:protection.manage", {
        subjectRef: input.subjectRef,
        asOf: input.asOf,
        currency: input.currency,
        completeness: result.completeness,
        bound: result.bound,
        modeledGapMinor: result.modeledGapMinor,
        missingInputs: result.missingInputs,
        note: "MODELED planning data; not advice, not a quote, not accounting (§11, §32).",
      }),
    () =>
      protectionEvent(actor, FAMILY_OFFICE_PROTECTION_EVENTS.INSURANCE_PROTECTION_ASSESSED, "FAMILY_PROTECTION_ASSESSMENT", id, "RESTRICTED", {
        subjectRef: input.subjectRef,
        bound: result.bound,
        completeness: result.completeness,
      }),
  );
}

export async function listAssessments(principal: Principal, input: { subjectRef?: string; currency?: string; asOf?: string } = {}) {
  const scope = await tenantScopeIds(principal);
  const clauses = [inArray(s.familyProtectionAssessments.tenantId, scope)];
  if (input.subjectRef) clauses.push(eq(s.familyProtectionAssessments.subjectRef, input.subjectRef));
  const rows = await db
    .select()
    .from(s.familyProtectionAssessments)
    .where(and(...clauses))
    .orderBy(desc(s.familyProtectionAssessments.asOf))
    .limit(200);
  return {
    total: rows.length,
    assessments: rows.map((r) => ({
      id: r.id,
      subjectRef: r.subjectRef,
      subjectKind: r.subjectKind,
      asOf: r.asOf,
      currency: r.currency,
      status: r.status,
      methodology: r.methodology,
      methodologyVersion: r.methodologyVersion,
      result: r.result,
      disclaimer: r.disclaimer,
      createdBy: r.createdBy,
      reviewedBy: r.reviewedBy,
    })),
  };
}

export async function listClaims(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  const rows = await db.select().from(s.familyInsuranceClaims).where(inArray(s.familyInsuranceClaims.tenantId, scope));
  const events = await db.select().from(s.familyInsuranceClaimEvents).where(inArray(s.familyInsuranceClaimEvents.tenantId, scope));
  return {
    total: rows.length,
    claims: rows.map((c) => ({
      id: c.id,
      policyId: c.policyId,
      claimReference: c.claimReference,
      status: c.status,
      proceedsState: c.proceedsState,
      approvedAmountMinor: c.approvedAmount === null ? null : numericToMinor(c.approvedAmount),
      receivedAmountMinor: c.receivedAmount === null ? null : numericToMinor(c.receivedAmount),
      currency: c.currency,
      incidentDate: c.incidentDate,
      notificationDate: c.notificationDate,
      proceedsReceivedDate: c.proceedsReceivedDate,
      allocationRef: c.allocationRef,
      decisionEvidenceRef: c.decisionEvidenceRef,
      documentRefs: c.documentRefs,
      events: events.filter((e) => e.claimId === c.id).length,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard summary (§24)                                              */
/* ------------------------------------------------------------------ */

export async function protectionSummary(principal: Principal, asOf: string) {
  const listing = await listPolicies(principal, asOf);
  const claimsRes = await listClaims(principal);

  type Currency = string;
  const byCurrency = new Map<Currency, {
    policies: number;
    inForcePolicies: number;
    deathBenefitContingentMinor: number;
    cashValueRecordedMinor: number;
    surrenderValueRecordedMinor: number;
    annualPremiumObligationMinor: number;
  }>();
  const touch = (currency: string) => {
    if (!byCurrency.has(currency)) byCurrency.set(currency, { policies: 0, inForcePolicies: 0, deathBenefitContingentMinor: 0, cashValueRecordedMinor: 0, surrenderValueRecordedMinor: 0, annualPremiumObligationMinor: 0 });
    return byCurrency.get(currency)!;
  };
  for (const p of listing.policies) {
    const c = touch(p.currency);
    c.policies += 1;
    c.deathBenefitContingentMinor += p.coverage.contingentProtection && p.status === "IN_FORCE" ? p.coverage.deathBenefitMinor : 0;
    if (p.status === "IN_FORCE") c.inForcePolicies += 1;
    if (p.coverage.cashValueMinor !== null) c.cashValueRecordedMinor += p.coverage.cashValueMinor;
    if (p.coverage.surrenderValueMinor !== null) c.surrenderValueRecordedMinor += p.coverage.surrenderValueMinor;
    c.annualPremiumObligationMinor += p.premium.annualObligationMinor;
  }

  const openClaims = claimsRes.claims.filter((c) => !["CLOSED"].includes(c.status));
  const expectedProceedsByCurrency = new Map<Currency, number>();
  const receivedProceedsByCurrency = new Map<Currency, number>();
  for (const c of claimsRes.claims) {
    if (["EXPECTED", "CLAIMED", "APPROVED"].includes(c.proceedsState)) {
      expectedProceedsByCurrency.set(c.currency, (expectedProceedsByCurrency.get(c.currency) ?? 0) + (c.approvedAmountMinor ?? 0));
    }
    if (["RECEIVED", "ALLOCATED"].includes(c.proceedsState)) {
      receivedProceedsByCurrency.set(c.currency, (receivedProceedsByCurrency.get(c.currency) ?? 0) + (c.receivedAmountMinor ?? 0));
    }
  }

  const needsReview = listing.policies.filter((p) => p.reviewFlags.some((f) => f.severity === "WARNING" || f.severity === "ESCALATE")).length;
  const beneficiaryExceptions = listing.policies.filter((p) => !p.beneficiarySummary.ok).length;

  return {
    asOf,
    totalsByCurrency: [...byCurrency.entries()].map(([currency, v]) => ({ currency, ...v })),
    /**
     * §24/§4 — the separation IS the payload. Contingent protection is never
     * merged into a wealth or liquidity figure; no cross-currency total is
     * computed without a ratified FX source, consistent with the capital
     * domain's §15 rule.
     */
    claims: {
      open: openClaims.length,
      expectedProceedsMinorByCurrency: Object.fromEntries(expectedProceedsByCurrency),
      receivedProceedsMinorByCurrency: Object.fromEntries(receivedProceedsByCurrency),
      note: "EXPECTED proceeds are contingent claims state, not cash; RECEIVED proceeds are recorded receipts whose accounting truth remains with Finance OS (§13, §22).",
    },
    review: { needsReview, beneficiaryExceptions },
    methodologyVersion: FAMILY_OFFICE_PROTECTION_VERSION,
    authoritativeAccountingOwner: "FINANCE_OS",
    boundary: PROTECTION_ACCOUNTING_BOUNDARY,
    disclaimer: PROTECTION_MODELED_DISCLAIMER,
  };
}

/* ------------------------------------------------------------------ */
/* Collection reads (thin; scoped through the same policy check)        */
/* ------------------------------------------------------------------ */

export async function listDesignations(principal: Principal, policyId: string) {
  const scope = await tenantScopeIds(principal);
  await scopedPolicyRow(principal, scope, policyId);
  const rows = await db
    .select()
    .from(s.familyInsuranceBeneficiaryDesignations)
    .where(eq(s.familyInsuranceBeneficiaryDesignations.policyId, policyId));
  return {
    total: rows.length,
    designations: rows.map((d) => ({
      id: d.id,
      policyId: d.policyId,
      beneficiaryRef: d.beneficiaryRef,
      beneficiaryKind: d.beneficiaryKind,
      designationType: d.designationType,
      entitlementBasis: d.entitlementBasis,
      pctMillionths: d.pctMillionths,
      fixedAmountMinor: d.fixedAmount === null ? null : numericToMinor(d.fixedAmount),
      currency: d.currency,
      effectiveDate: d.effectiveDate,
      endDate: d.endDate,
      status: d.status,
      relationshipBasis: d.relationshipBasis,
      reviewStatus: d.reviewStatus,
      legalReviewStatus: d.legalReviewStatus,
      documentRef: d.documentRef,
      notes: d.notes,
      recordedBy: d.recordedBy,
      authorityRef: d.authorityRef,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

export async function listPremiumRows(principal: Principal, policyId: string, asOf: string) {
  const scope = await tenantScopeIds(principal);
  await scopedPolicyRow(principal, scope, policyId);
  const rows = await db
    .select()
    .from(s.familyInsurancePremiums)
    .where(eq(s.familyInsurancePremiums.policyId, policyId));
  return {
    total: rows.length,
    asOf,
    premiums: rows.map((p) => {
      const record = {
        id: p.id,
        policyId: p.policyId,
        dueDate: p.dueDate,
        amountMinor: numericToMinor(p.amount),
        currency: p.currency,
        frequency: p.frequency as never,
        status: p.status as never,
        payerRef: p.payerRef,
        paidDate: p.paidDate,
        paymentEvidenceDocumentRef: p.paymentEvidenceDocumentRef,
        financeRecordRef: p.financeRecordRef,
        notes: p.notes,
      };
      return { ...record, effectiveStatus: effectivePremiumStatus(record, asOf) };
    }),
  };
}

export async function listAssignmentsAndLoans(principal: Principal, policyId: string) {
  const scope = await tenantScopeIds(principal);
  await scopedPolicyRow(principal, scope, policyId);
  const [assignments, loans] = await Promise.all([
    db.select().from(s.familyInsuranceAssignments).where(eq(s.familyInsuranceAssignments.policyId, policyId)),
    db.select().from(s.familyInsurancePolicyLoans).where(eq(s.familyInsurancePolicyLoans.policyId, policyId)),
  ]);
  return {
    assignments: assignments.map((a) => ({
      id: a.id,
      assignmentType: a.assignmentType,
      assigneeRef: a.assigneeRef,
      assigneeName: a.assigneeName,
      securedAmountMinor: a.securedAmount === null ? null : numericToMinor(a.securedAmount),
      currency: a.currency,
      effectiveDate: a.effectiveDate,
      releaseDate: a.releaseDate,
      status: a.status,
      instrumentDocumentRef: a.instrumentDocumentRef,
    })),
    loans: loans.map((l) => ({
      id: l.id,
      advancedDate: l.advancedDate,
      principalMinor: numericToMinor(l.principal),
      interestRateBps: l.interestRateBps,
      outstandingBalanceMinor: l.outstandingBalance === null ? null : numericToMinor(l.outstandingBalance),
      status: l.status,
      repaidDate: l.repaidDate,
      authorizationRef: l.authorizationRef,
    })),
  };
}

export async function listReviews(principal: Principal, policyId: string) {
  const scope = await tenantScopeIds(principal);
  await scopedPolicyRow(principal, scope, policyId);
  const rows = await db
    .select()
    .from(s.familyInsuranceReviews)
    .where(eq(s.familyInsuranceReviews.policyId, policyId));
  return {
    total: rows.length,
    reviews: rows
      .map((r) => ({
        id: r.id,
        reviewKind: r.reviewKind,
        reviewDate: r.reviewDate,
        reviewerRef: r.reviewerRef,
        reviewerType: r.reviewerType,
        outcome: r.outcome,
        exceptions: r.exceptions,
        nextReviewDate: r.nextReviewDate,
        evidenceDocumentRefs: r.evidenceDocumentRefs,
        governanceStageAfter: r.governanceStageAfter,
        authorityRef: r.authorityRef,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      }))
      .sort((a, b) => b.reviewDate.localeCompare(a.reviewDate)),
  };
}

export async function listClaimEvents(principal: Principal, claimId: string) {
  const scope = await tenantScopeIds(principal);
  const claims = await db
    .select({ id: s.familyInsuranceClaims.id })
    .from(s.familyInsuranceClaims)
    .where(and(inArray(s.familyInsuranceClaims.tenantId, scope), eq(s.familyInsuranceClaims.id, claimId)))
    .limit(1);
  if (claims.length === 0) throw new FamilyOfficeProtectionError("NOT_FOUND", "No such claim within the caller's scope.");
  const rows = await db
    .select()
    .from(s.familyInsuranceClaimEvents)
    .where(eq(s.familyInsuranceClaimEvents.claimId, claimId));
  return {
    total: rows.length,
    events: rows
      .map((e) => ({
        id: e.id,
        eventKind: e.eventKind,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        note: e.note,
        evidenceDocumentRef: e.evidenceDocumentRef,
        actorRef: e.actorRef,
        actorType: e.actorType,
        occurredAt: e.occurredAt.toISOString(),
      }))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
  };
}

/* ------------------------------------------------------------------ */
/* Family protection view (§26)                                         */
/* ------------------------------------------------------------------ */

/**
 * The member-level protection board: PERSON → family role → recorded ownership
 * context → protection → flags → succession linkage, assembled ONLY from rows
 * the caller's scope can already see. Family registry rows are READ through
 * their own table (identity remains `people.ts` canonical); an insured
 * reference matches either the member id or the party id behind it, because
 * designations record the person, not our primary key.
 *
 * There is no "modeled exposure" here unless a FINAL assessment exists for
 * that subject — and where none exists the view says NOT_QUANTIFIED rather
 * than fabricate a number (§11, §26).
 */
export async function familyView(principal: Principal, asOf: string) {
  const scope = await tenantScopeIds(principal);
  const [members, listing, assessments] = await Promise.all([
    db
      .select({
        id: s.familyMembers.id,
        partyId: s.familyMembers.partyId,
        familyLine: s.familyMembers.familyLine,
        branch: s.familyMembers.branch,
        generation: s.familyMembers.generation,
        verificationStatus: s.familyMembers.verificationStatus,
        deceasedOn: s.familyMembers.deceasedOn,
        classification: s.familyMembers.classification,
      })
      .from(s.familyMembers)
      .where(inArray(s.familyMembers.tenantId, scope))
      .limit(500),
    listPolicies(principal, asOf),
    db
      .select()
      .from(s.familyProtectionAssessments)
      .where(and(inArray(s.familyProtectionAssessments.tenantId, scope), eq(s.familyProtectionAssessments.status, "FINAL"))),
  ]);

  const people = new Map<string, { member: (typeof members)[number]; policyIds: Set<string>; assessment: (typeof assessments)[number] | null }>();
  for (const m of members) {
    people.set(m.id, { member: m, policyIds: new Set(), assessment: null });
    if (!people.has(m.partyId)) people.set(m.partyId, { member: m, policyIds: new Set(), assessment: null });
  }

  const latestFinalBySubject = new Map<string, (typeof assessments)[number]>();
  for (const a of assessments.slice().sort((x, y) => x.asOf.localeCompare(y.asOf))) {
    latestFinalBySubject.set(a.subjectRef, a);
  }

  for (const p of listing.policies) {
    for (const ref of [p.insuredRef, p.ownerRef]) {
      if (ref && people.has(ref)) {
        people.get(ref)!.policyIds.add(p.id);
      }
    }
  }
  for (const [key, entry] of people) {
    const a = latestFinalBySubject.get(key) ?? latestFinalBySubject.get(entry.member.id) ?? null;
    entry.assessment = a;
  }

  const rows = members.map((m) => {
    const entry = people.get(m.id)!;
    const policies = listing.policies.filter((p) => entry.policyIds.has(p.id));
    const inForce = policies.filter((p) => p.status === "IN_FORCE");
    const assessmentResult = entry.assessment ? (entry.assessment.result as { modeledGapMinor?: number | null; bound?: string; missingInputs?: string[] }) : null;
    return {
      memberId: m.id,
      partyId: m.partyId,
      familyLine: m.familyLine,
      branch: m.branch,
      generation: m.generation,
      verificationStatus: m.verificationStatus,
      deceasedOn: m.deceasedOn,
      policies: policies.map((p) => ({
        id: p.id,
        policyNumber: p.policyNumber,
        policyType: p.policyType,
        status: p.status,
        currency: p.currency,
        deathBenefitMinor: p.coverage.deathBenefitMinor,
        flags: p.reviewFlags.filter((f) => f.severity === "WARNING" || f.severity === "ESCALATE").length,
        beneficiaryOk: p.beneficiarySummary.ok,
      })),
      inForcePolicies: inForce.length,
      /** Contingent protection per currency — never a single blended figure. */
      contingentProtectionByCurrency: Object.fromEntries(
        [...inForce.reduce((acc, p) => {
          acc.set(p.currency, (acc.get(p.currency) ?? 0) + p.coverage.deathBenefitMinor);
          return acc;
        }, new Map<string, number>())],
      ),
      successionObjective: policies.some((p) => p.successionPlanId !== null || p.successionPlanRef !== null)
        ? "LINKED"
        : "NONE_RECORDED",
      modeledGapMinor: assessmentResult?.modeledGapMinor ?? null,
      assessmentCurrency: entry.assessment?.currency ?? null,
      gapBound: assessmentResult?.bound ?? "NOT_QUANTIFIED",
      gapMissingInputs: (assessmentResult?.missingInputs as string[] | undefined) ?? ["NO_FINAL_ASSESSMENT"],
      reviewStatus: policies.length === 0 ? "NO_POLICIES" : policies.some((p) => p.reviewFlags.some((f) => f.severity === "ESCALATE")) ? "EXCEPTIONS" : policies.some((p) => p.reviewFlags.some((f) => f.severity === "WARNING")) ? "REVIEW" : "OK",
    };
  });

  return {
    asOf,
    methodology: "family-protection-view-1.0.0",
    rows,
    note: "Protection figures are contingent contract amounts and MODELED gaps; family registry identity remains canonical in the Family Office register, and this view grants no write path back to it. Absent assessment data is reported NOT_QUANTIFIED.",
    disclaimer: PROTECTION_MODELED_DISCLAIMER,
  };
}
