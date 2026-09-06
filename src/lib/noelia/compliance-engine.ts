import { and, asc, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  noeliaAiRequirements,
  noeliaApplicabilityAssessments,
  noeliaAssessorPackages,
  noeliaCertificationReadiness,
  noeliaControls,
  noeliaCorrectiveActions,
  noeliaEvidence,
  noeliaExceptions,
  noeliaFindings,
  noeliaImpactAssessments,
  noeliaInternalAudits,
  noeliaManagementReviews,
  noeliaMonitoringIndicators,
  noeliaRegulatoryChanges,
  noeliaRequirementControls,
  noeliaRiskTreatments,
} from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { checksumOf } from "@/lib/crypto";
import { ID_PREFIX, newId } from "@/lib/ids";
import { recordAuditTx, type Tx } from "@/lib/audit";

/**
 * Phase 4 Noelia AI Global Compliance, Conformity, Assurance, Evidence &
 * Continuous Governance Engine.
 *
 * This is a GOVERNANCE layer, not an authority layer. It records what exists,
 * what is applicable, what evidence supports a control and whether a readiness
 * state has been reached. It never:
 *   - converts BLOCKED to PASS,
 *   - fabricates evidence, providers, models, certificates or assessors,
 *   - self-declares CERTIFIED,
 *   - treats stale/expired evidence as current.
 *
 * Every mutation is audit-recorded and every state transition is fail-closed.
 */

export type ComplianceFrameworkId =
  | "EU_AI_ACT"
  | "ISO_42001"
  | "NIST_AI_RMF"
  | "ISO_23894"
  | "ISO_27001"
  | "ISO_27701"
  | "ISO_22989"
  | "ISO_23053"
  | "OTHER";

const CERTIFICATION_STATES = {
  NOT_STARTED: "NOT_STARTED",
  GAP_ASSESSMENT_IN_PROGRESS: "GAP_ASSESSMENT_IN_PROGRESS",
  READINESS_EVIDENCE_COLLECTION: "READINESS_EVIDENCE_COLLECTION",
  INTERNAL_READINESS_REVIEW: "INTERNAL_READINESS_REVIEW",
  EXTERNAL_ASSESSMENT_REQUIRED: "EXTERNAL_ASSESSMENT_REQUIRED",
  EXTERNAL_ASSESSMENT_IN_PROGRESS: "EXTERNAL_ASSESSMENT_IN_PROGRESS",
  ASSESSOR_PACKAGE_ISSUED: "ASSESSOR_PACKAGE_ISSUED",
  EXTERNAL_ASSESSMENT_COMPLETE: "EXTERNAL_ASSESSMENT_COMPLETE",
  CERTIFIED: "CERTIFIED",
  NOT_CERTIFIED: "NOT_CERTIFIED",
  SUSPENDED: "SUSPENDED",
} as const;

export type CertificationState = (typeof CERTIFICATION_STATES)[keyof typeof CERTIFICATION_STATES];

const CERTIFICATION_TRANSITIONS: Record<CertificationState, CertificationState[]> = {
  NOT_STARTED: [CERTIFICATION_STATES.GAP_ASSESSMENT_IN_PROGRESS, CERTIFICATION_STATES.NOT_CERTIFIED],
  GAP_ASSESSMENT_IN_PROGRESS: [
    CERTIFICATION_STATES.READINESS_EVIDENCE_COLLECTION,
    CERTIFICATION_STATES.INTERNAL_READINESS_REVIEW,
    CERTIFICATION_STATES.NOT_CERTIFIED,
  ],
  READINESS_EVIDENCE_COLLECTION: [
    CERTIFICATION_STATES.INTERNAL_READINESS_REVIEW,
    CERTIFICATION_STATES.NOT_CERTIFIED,
  ],
  INTERNAL_READINESS_REVIEW: [
    CERTIFICATION_STATES.EXTERNAL_ASSESSMENT_REQUIRED,
    CERTIFICATION_STATES.NOT_CERTIFIED,
  ],
  EXTERNAL_ASSESSMENT_REQUIRED: [CERTIFICATION_STATES.EXTERNAL_ASSESSMENT_IN_PROGRESS],
  EXTERNAL_ASSESSMENT_IN_PROGRESS: [
    CERTIFICATION_STATES.ASSESSOR_PACKAGE_ISSUED,
    CERTIFICATION_STATES.NOT_CERTIFIED,
  ],
  ASSESSOR_PACKAGE_ISSUED: [
    CERTIFICATION_STATES.EXTERNAL_ASSESSMENT_COMPLETE,
    CERTIFICATION_STATES.EXTERNAL_ASSESSMENT_IN_PROGRESS,
    CERTIFICATION_STATES.NOT_CERTIFIED,
  ],
  EXTERNAL_ASSESSMENT_COMPLETE: [
    CERTIFICATION_STATES.CERTIFIED,
    CERTIFICATION_STATES.NOT_CERTIFIED,
    CERTIFICATION_STATES.SUSPENDED,
  ],
  CERTIFIED: [CERTIFICATION_STATES.SUSPENDED, CERTIFICATION_STATES.NOT_CERTIFIED],
  NOT_CERTIFIED: [CERTIFICATION_STATES.GAP_ASSESSMENT_IN_PROGRESS, CERTIFICATION_STATES.EXTERNAL_ASSESSMENT_REQUIRED],
  SUSPENDED: [
    CERTIFICATION_STATES.INTERNAL_READINESS_REVIEW,
    CERTIFICATION_STATES.EXTERNAL_ASSESSMENT_IN_PROGRESS,
    CERTIFICATION_STATES.NOT_CERTIFIED,
  ],
};

export class ComplianceAccessError extends Error {
  constructor(readonly permission: string, message: string) {
    super(message);
    this.name = "ComplianceAccessError";
  }
}

export class ComplianceStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComplianceStateError";
  }
}

export class EvidenceIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceIntegrityError";
  }
}

function requireCanonicalContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia compliance engine requires canonical transaction-scoped tenant context");
  }
}

function requirePermission(principal: Principal, permission: Parameters<typeof can>[1]): void {
  const decision = can(principal, permission);
  if (!decision.allowed) {
    throw new ComplianceAccessError(permission, decision.reason);
  }
}

async function auditVariant(action: string, objectType: string, objectId: string, principal: Principal, traceId: string, newValue: Record<string, unknown>, reason: string): Promise<void> {
  await recordAuditTx(db as unknown as Tx, {
    actorUserId: principal.userId,
    actorType: "HUMAN",
    action,
    objectType,
    objectId,
    reason,
    authority: "AI_GLOBAL_COMPLIANCE",
    policyVersion: "ai.compliance.phase4.2026.09",
    aiVersion: "noelia.phase4",
    oldValue: null,
    newValue: { ...newValue, scope: principal.tenantId },
    traceId,
  });
}

/** Canonical evidence fingerprint. The `id`, timestamps and DB-only fields are excluded. */
export function computeEvidenceHash(input: {
  evidenceCode: string;
  evidenceType: string;
  title: string;
  description: string;
  subjectType: string;
  subjectId: string;
  tenantId?: string | null;
  sourceUri?: string | null;
  contentRef?: string | null;
  evidenceDate?: string | null;
  payload?: Record<string, unknown>;
}): string {
  return checksumOf({
    evidenceCode: input.evidenceCode,
    evidenceType: input.evidenceType,
    title: input.title,
    description: input.description,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    tenantId: input.tenantId ?? null,
    sourceUri: input.sourceUri ?? null,
    contentRef: input.contentRef ?? null,
    evidenceDate: input.evidenceDate ?? null,
    payload: input.payload ?? {},
  });
}

export function isEvidenceCurrent(evidence: {
  status: string;
  expiresAt: Date | null;
}): boolean {
  if (evidence.status !== "VERIFIED") return false;
  if (evidence.expiresAt && evidence.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

export class BeyuNoeliaComplianceService {
  /* --------------------------- requirement registry --------------------------- */

  async registerRequirement(input: {
    principal: Principal;
    traceId: string;
    requirementCode: string;
    frameworkId: string;
    reference: string;
    title: string;
    description: string;
    category: string;
    ownerRole: string;
    priority?: string;
    jurisdictionCode?: string | null;
    countryCode?: string | null;
    applicableToTypes?: string[];
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    source?: string | null;
  }): Promise<{ id: string; requirementId: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.write");
    const id = newId(ID_PREFIX.aiRequirement);
    await db.insert(noeliaAiRequirements).values({
      id,
      requirementCode: input.requirementCode,
      frameworkId: input.frameworkId,
      reference: input.reference,
      title: input.title,
      description: input.description,
      category: input.category,
      jurisdictionCode: input.jurisdictionCode ?? null,
      countryCode: input.countryCode ?? null,
      applicableToTypes: input.applicableToTypes ?? [],
      ownerRole: input.ownerRole,
      priority: input.priority ?? "MEDIUM",
      status: "ACTIVE",
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
      source: input.source ?? null,
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_REQUIREMENT_REGISTERED", "AI_REQUIREMENT", id, input.principal, input.traceId, {
      requirementCode: input.requirementCode,
      frameworkId: input.frameworkId,
    }, "Register AI compliance requirement.");
    return { id, requirementId: id };
  }

  async listRequirements(principal: Principal, frameworkId?: string): Promise<typeof noeliaAiRequirements.$inferSelect[]> {
    requireCanonicalContext();
    requirePermission(principal, "ai:compliance.read");
    const rows = await db
      .select()
      .from(noeliaAiRequirements)
      .where(frameworkId ? eq(noeliaAiRequirements.frameworkId, frameworkId) : sql`true`)
      .orderBy(asc(noeliaAiRequirements.requirementCode));
    return rows;
  }

  /* --------------------------- applicability --------------------------- */

  async assessApplicability(input: {
    principal: Principal;
    traceId: string;
    requirementId: string;
    subjectType: string;
    subjectId: string;
    tenantId?: string | null;
    countryCode?: string | null;
    legalEntityId?: string | null;
    result: string;
    rationale: string;
    legalBasis?: string;
    legallyAmbiguous?: boolean;
    validUntil?: string | null;
  }): Promise<{ id: string; applicabilityId: string; status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.write");
    const legalReview = input.legallyAmbiguous === true || input.result === "UNDETERMINED";
    const id = newId(ID_PREFIX.applicability);
    await db.insert(noeliaApplicabilityAssessments).values({
      id,
      requirementId: input.requirementId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      tenantId: input.tenantId ?? null,
      countryCode: input.countryCode ?? null,
      legalEntityId: input.legalEntityId ?? null,
      result: input.result,
      rationale: input.rationale,
      legalBasis: input.legalBasis ?? null,
      legallyAmbiguous: input.legallyAmbiguous ?? false,
      legalReviewRequired: legalReview,
      assessedBy: input.principal.userId,
      validUntil: input.validUntil ?? null,
      status: legalReview ? "LEGAL_REVIEW_REQUIRED" : "DRAFT",
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_APPLICABILITY_ASSESSED", "AI_APPLICABILITY", id, input.principal, input.traceId, {
      requirementId: input.requirementId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      result: input.result,
      legalReviewRequired: legalReview,
    }, "Assess AI requirement applicability.");
    return { id, applicabilityId: id, status: legalReview ? "LEGAL_REVIEW_REQUIRED" : "DRAFT" };
  }

  async confirmApplicability(input: {
    principal: Principal;
    traceId: string;
    id: string;
    reviewedBy?: string;
    result?: string;
  }): Promise<{ status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.audit");
    const [row] = await db
      .select()
      .from(noeliaApplicabilityAssessments)
      .where(eq(noeliaApplicabilityAssessments.id, input.id))
      .limit(1);
    if (!row) throw new ComplianceStateError("Applicability assessment not found.");
    if (row.legalReviewRequired && !input.result) {
      throw new ComplianceStateError("A legally ambiguous applicability assessment requires an explicit legal review result.");
    }
    const result = input.result ?? row.result;
    await db
      .update(noeliaApplicabilityAssessments)
      .set({
        result,
        status: "CONFIRMED",
        reviewedBy: input.reviewedBy ?? input.principal.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
        legalReviewRequired: false,
      })
      .where(eq(noeliaApplicabilityAssessments.id, input.id));
    await auditVariant("NOELIA_APPLICABILITY_CONFIRMED", "AI_APPLICABILITY", input.id, input.principal, input.traceId, {
      result,
    }, "Confirm AI requirement applicability.");
    return { status: "CONFIRMED" };
  }

  /* --------------------------- controls --------------------------- */

  async registerControl(input: {
    principal: Principal;
    traceId: string;
    controlCode: string;
    title: string;
    description: string;
    controlType: string;
    ownerRole: string;
    riskLevel?: string;
    implementationStatus?: string;
    assessmentRequirement?: string;
    sourcePath?: string | null;
    testPath?: string | null;
    evidencePath?: string | null;
    reviewDate?: string | null;
    automation?: string;
    frameworks?: string[];
  }): Promise<{ id: string; controlId: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.write");
    const id = newId(ID_PREFIX.control);
    await db.insert(noeliaControls).values({
      id,
      controlCode: input.controlCode,
      title: input.title,
      description: input.description,
      controlType: input.controlType,
      automation: input.automation ?? "MANUAL",
      frameworks: input.frameworks ?? [],
      ownerRole: input.ownerRole,
      riskLevel: input.riskLevel ?? "LOW",
      implementationStatus: input.implementationStatus ?? "NOT_IMPLEMENTED",
      assessmentRequirement: input.assessmentRequirement ?? "INTERNAL",
      sourcePath: input.sourcePath ?? null,
      testPath: input.testPath ?? null,
      evidencePath: input.evidencePath ?? null,
      active: true,
      reviewDate: input.reviewDate ?? null,
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_CONTROL_REGISTERED", "AI_CONTROL", id, input.principal, input.traceId, {
      controlCode: input.controlCode,
      implementationStatus: input.implementationStatus ?? "NOT_IMPLEMENTED",
    }, "Register AI control.");
    return { id, controlId: id };
  }

  async listControls(principal: Principal): Promise<typeof noeliaControls.$inferSelect[]> {
    requireCanonicalContext();
    requirePermission(principal, "ai:compliance.read");
    return db.select().from(noeliaControls).orderBy(asc(noeliaControls.controlCode));
  }

  async mapRequirementControl(input: {
    principal: Principal;
    traceId: string;
    requirementId: string;
    controlId: string;
    rationale?: string;
    evidenceId?: string | null;
  }): Promise<{ id: string; mappingId: string; effectiveness: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.write");
    const id = newId(ID_PREFIX.requirementControl);
    await db.insert(noeliaRequirementControls).values({
      id,
      requirementId: input.requirementId,
      controlId: input.controlId,
      mappingRationale: input.rationale ?? null,
      evidenceId: input.evidenceId ?? null,
      effectiveness: input.evidenceId ? "NOT_ASSESSED" : "NOT_EVIDENCED",
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_REQUIREMENT_CONTROL_MAPPED", "AI_REQUIREMENT_CONTROL", id, input.principal, input.traceId, {
      requirementId: input.requirementId,
      controlId: input.controlId,
    }, "Map requirement to control.");
    return { id, mappingId: id, effectiveness: input.evidenceId ? "NOT_ASSESSED" : "NOT_EVIDENCED" };
  }

  /**
   * Evaluate control effectiveness. Fail-closed: EFFECTIVE requires a current,
   * VERIFIED, non-expired evidence record. No evidence -> NOT_EVIDENCED.
   */
  async evaluateControlEffectiveness(input: {
    principal: Principal;
    traceId: string;
    mappingId: string;
    evidenceId: string | null;
    verifier?: string;
    verdict?: string;
  }): Promise<{ effectiveness: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.audit");
    const [mapping] = await db
      .select()
      .from(noeliaRequirementControls)
      .where(eq(noeliaRequirementControls.id, input.mappingId))
      .limit(1);
    if (!mapping) throw new ComplianceStateError("Requirement-control mapping not found.");

    let effectiveness = "NOT_EVIDENCED";
    if (input.evidenceId) {
      const [evidence] = await db
        .select()
        .from(noeliaEvidence)
        .where(eq(noeliaEvidence.id, input.evidenceId))
        .limit(1);
      if (!evidence) throw new ComplianceStateError("Evidence record not found.");
      if (!isEvidenceCurrent(evidence)) {
        effectiveness = "NOT_EVIDENCED";
      } else {
        effectiveness = input.verdict ?? "EFFECTIVE";
        if (effectiveness !== "EFFECTIVE" && effectiveness !== "PARTIALLY_EFFECTIVE" && effectiveness !== "NOT_EFFECTIVE") {
          throw new ComplianceStateError("Invalid effectiveness verdict.");
        }
      }
    }

    await db
      .update(noeliaRequirementControls)
      .set({
        effectiveness,
        evidenceId: input.evidenceId,
        reviewedBy: input.verifier ?? input.principal.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(noeliaRequirementControls.id, input.mappingId));
    await auditVariant("NOELIA_REQUIREMENT_CONTROL_EVALUATED", "AI_REQUIREMENT_CONTROL", input.mappingId, input.principal, input.traceId, {
      effectiveness,
      evidenceId: input.evidenceId,
    }, "Evaluate requirement-control effectiveness.");
    return { effectiveness };
  }

  /* --------------------------- evidence --------------------------- */

  async registerEvidence(input: {
    principal: Principal;
    traceId: string;
    evidenceCode: string;
    evidenceType: string;
    title: string;
    description: string;
    subjectType: string;
    subjectId: string;
    tenantId?: string | null;
    sourceUri?: string | null;
    contentRef?: string | null;
    evidenceDate?: string | null;
    expiresAt?: Date | null;
    payload?: Record<string, unknown>;
  }): Promise<{ id: string; evidenceId: string; artifactHash: string; status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.write");
    const id = newId(ID_PREFIX.evidence);
    const artifactHash = computeEvidenceHash(input);
    await db.insert(noeliaEvidence).values({
      id,
      evidenceCode: input.evidenceCode,
      evidenceType: input.evidenceType,
      title: input.title,
      description: input.description,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      tenantId: input.tenantId ?? null,
      sourceUri: input.sourceUri ?? null,
      artifactHash,
      hashAlgorithm: "SHA-256",
      contentRef: input.contentRef ?? null,
      evidenceDate: input.evidenceDate ?? null,
      expiresAt: input.expiresAt ?? null,
      status: "DRAFT",
      recordedBy: input.principal.userId,
      payload: input.payload ?? {},
    });
    await auditVariant("NOELIA_EVIDENCE_REGISTERED", "AI_EVIDENCE", id, input.principal, input.traceId, {
      evidenceCode: input.evidenceCode,
      evidenceType: input.evidenceType,
      artifactHash,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    }, "Register AI compliance evidence.");
    return { id, evidenceId: id, artifactHash, status: "DRAFT" };
  }

  async verifyEvidence(input: {
    principal: Principal;
    traceId: string;
    evidenceId: string;
    verifier?: string;
    externalAssessor?: string | null;
    externalReference?: string | null;
  }): Promise<{ status: string; artifactHash: string; integrity: boolean }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.audit");
    const [row] = await db.select().from(noeliaEvidence).where(eq(noeliaEvidence.id, input.evidenceId)).limit(1);
    if (!row) throw new ComplianceStateError("Evidence record not found.");
    const recomputed = computeEvidenceHash(row);
    if (recomputed !== row.artifactHash) {
      throw new EvidenceIntegrityError(`Evidence hash mismatch for ${input.evidenceId}.`);
    }
    await db
      .update(noeliaEvidence)
      .set({
        status: "VERIFIED",
        verifier: input.verifier ?? input.principal.userId,
        verifiedAt: new Date(),
        externalAssessor: input.externalAssessor ?? row.externalAssessor,
        externalReference: input.externalReference ?? row.externalReference,
        updatedAt: new Date(),
      })
      .where(eq(noeliaEvidence.id, input.evidenceId));
    await auditVariant("NOELIA_EVIDENCE_VERIFIED", "AI_EVIDENCE", input.evidenceId, input.principal, input.traceId, {
      verifier: input.verifier ?? input.principal.userId,
      externalAssessor: input.externalAssessor ?? null,
    }, "Verify AI compliance evidence.");
    return { status: "VERIFIED", artifactHash: row.artifactHash, integrity: true };
  }

  async verifyEvidenceIntegrity(input: { principal: Principal; traceId: string; evidenceId: string }): Promise<{
    valid: boolean;
    storedHash: string;
    recomputedHash: string;
    current: boolean;
    status: string;
  }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.read");
    const [row] = await db.select().from(noeliaEvidence).where(eq(noeliaEvidence.id, input.evidenceId)).limit(1);
    if (!row) throw new ComplianceStateError("Evidence record not found.");
    const recomputed = computeEvidenceHash(row);
    return {
      valid: recomputed === row.artifactHash,
      storedHash: row.artifactHash,
      recomputedHash: recomputed,
      current: isEvidenceCurrent(row),
      status: row.status,
    };
  }

  async listEvidence(principal: Principal, subjectType?: string, subjectId?: string): Promise<typeof noeliaEvidence.$inferSelect[]> {
    requireCanonicalContext();
    requirePermission(principal, "ai:compliance.read");
    const conditions = [];
    if (subjectType) conditions.push(eq(noeliaEvidence.subjectType, subjectType));
    if (subjectId) conditions.push(eq(noeliaEvidence.subjectId, subjectId));
    return db
      .select()
      .from(noeliaEvidence)
      .where(conditions.length > 0 ? and(...conditions) : sql`true`)
      .orderBy(desc(noeliaEvidence.createdAt));
  }

  /* --------------------------- impact & risk --------------------------- */

  async recordImpactAssessment(input: {
    principal: Principal;
    traceId: string;
    assessmentCode: string;
    systemId: string;
    requirementId?: string | null;
    tenantId?: string | null;
    countryCode?: string | null;
    legalEntityId?: string | null;
    scope: string;
    impactType: string;
    impactLevel: string;
    safetyImpact?: string;
    fundamentalRights?: string;
    dataProtection?: string;
    humanOversight?: string;
    rationale?: string;
    nextReviewAt?: string | null;
  }): Promise<{ id: string; impactId: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.write");
    const id = newId(ID_PREFIX.impactAssessment);
    await db.insert(noeliaImpactAssessments).values({
      id,
      assessmentCode: input.assessmentCode,
      systemId: input.systemId,
      requirementId: input.requirementId ?? null,
      tenantId: input.tenantId ?? null,
      countryCode: input.countryCode ?? null,
      legalEntityId: input.legalEntityId ?? null,
      scope: input.scope,
      impactType: input.impactType,
      impactLevel: input.impactLevel,
      safetyImpact: input.safetyImpact ?? "NOT_ASSESSED",
      fundamentalRights: input.fundamentalRights ?? "NOT_ASSESSED",
      dataProtection: input.dataProtection ?? "NOT_ASSESSED",
      humanOversight: input.humanOversight ?? "NOT_ASSESSED",
      rationale: input.rationale ?? null,
      assessedBy: input.principal.userId,
      status: "DRAFT",
      nextReviewAt: input.nextReviewAt ?? null,
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_IMPACT_ASSESSMENT_RECORDED", "AI_IMPACT_ASSESSMENT", id, input.principal, input.traceId, {
      assessmentCode: input.assessmentCode,
      systemId: input.systemId,
      impactLevel: input.impactLevel,
    }, "Record AI impact assessment.");
    return { id, impactId: id };
  }

  async recordRiskTreatment(input: {
    principal: Principal;
    traceId: string;
    riskId: string;
    treatment: string;
    ownerRole: string;
    rationale: string;
    targetResidual?: string | null;
    dueDate?: string | null;
    evidenceId?: string | null;
  }): Promise<{ id: string; treatmentId: string; status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.write");
    const id = newId(ID_PREFIX.riskTreatment);
    await db.insert(noeliaRiskTreatments).values({
      id,
      riskId: input.riskId,
      treatment: input.treatment,
      ownerRole: input.ownerRole,
      rationale: input.rationale,
      targetResidual: input.targetResidual ?? null,
      dueDate: input.dueDate ?? null,
      status: "PLANNED",
      evidenceId: input.evidenceId ?? null,
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_RISK_TREATMENT_RECORDED", "AI_RISK_TREATMENT", id, input.principal, input.traceId, {
      riskId: input.riskId,
      treatment: input.treatment,
    }, "Record AI risk treatment.");
    return { id, treatmentId: id, status: "PLANNED" };
  }

  async verifyRiskTreatment(input: {
    principal: Principal;
    traceId: string;
    treatmentId: string;
    evidenceId: string | null;
    verifier?: string;
  }): Promise<{ status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.audit");
    const [row] = await db.select().from(noeliaRiskTreatments).where(eq(noeliaRiskTreatments.id, input.treatmentId)).limit(1);
    if (!row) throw new ComplianceStateError("Risk treatment not found.");
    if (!row.evidenceId && !input.evidenceId) {
      throw new ComplianceStateError("Risk treatment cannot be verified without evidence.");
    }
    const evidenceId = input.evidenceId ?? row.evidenceId ?? null;
    if (evidenceId) {
      const [evidence] = await db.select().from(noeliaEvidence).where(eq(noeliaEvidence.id, evidenceId)).limit(1);
      if (!evidence) throw new ComplianceStateError("Evidence record not found.");
      if (!isEvidenceCurrent(evidence)) {
        throw new ComplianceStateError("Risk treatment evidence is not current (DRAFT, REJECTED, OBSOLETE or EXPIRED).");
      }
    }
    await db
      .update(noeliaRiskTreatments)
      .set({
        status: "VERIFIED",
        evidenceId,
        verifiedBy: input.verifier ?? input.principal.userId,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(noeliaRiskTreatments.id, input.treatmentId));
    await auditVariant("NOELIA_RISK_TREATMENT_VERIFIED", "AI_RISK_TREATMENT", input.treatmentId, input.principal, input.traceId, {
      evidenceId,
    }, "Verify AI risk treatment with evidence.");
    return { status: "VERIFIED" };
  }

  /* --------------------------- audit / finding / capa --------------------------- */

  async createAudit(input: {
    principal: Principal;
    traceId: string;
    auditCode: string;
    title: string;
    scope: string;
    objective: string;
    frameworkId?: string | null;
    auditType?: string;
    auditor: string;
    auditorRole: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    tenantId?: string | null;
    legalEntityId?: string | null;
    countryCode?: string | null;
    plannedAt?: string | null;
    notes?: string | null;
  }): Promise<{ id: string; auditId: string; status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.audit");
    const id = newId(ID_PREFIX.noeliaInternalAudit);
    await db.insert(noeliaInternalAudits).values({
      id,
      auditCode: input.auditCode,
      title: input.title,
      scope: input.scope,
      objective: input.objective,
      frameworkId: input.frameworkId ?? null,
      auditType: input.auditType ?? "GAP_ASSESSMENT",
      auditor: input.auditor,
      auditorRole: input.auditorRole,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      tenantId: input.tenantId ?? null,
      legalEntityId: input.legalEntityId ?? null,
      countryCode: input.countryCode ?? null,
      status: "PLANNED",
      plannedAt: input.plannedAt ?? null,
      notes: input.notes ?? null,
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_AUDIT_CREATED", "AI_AUDIT", id, input.principal, input.traceId, {
      auditCode: input.auditCode,
      frameworkId: input.frameworkId ?? null,
    }, "Create AI internal audit.");
    return { id, auditId: id, status: "PLANNED" };
  }

  async addFinding(input: {
    principal: Principal;
    traceId: string;
    findingCode: string;
    auditId: string;
    severity: string;
    title: string;
    description: string;
    controlId?: string | null;
    evidenceId?: string | null;
    tenantId?: string | null;
    ownerRole: string;
    dueDate?: string | null;
  }): Promise<{ id: string; findingId: string; status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.audit");
    const id = newId(ID_PREFIX.finding);
    await db.insert(noeliaFindings).values({
      id,
      findingCode: input.findingCode,
      auditId: input.auditId,
      severity: input.severity,
      title: input.title,
      description: input.description,
      controlId: input.controlId ?? null,
      evidenceId: input.evidenceId ?? null,
      tenantId: input.tenantId ?? null,
      status: "OPEN",
      ownerRole: input.ownerRole,
      dueDate: input.dueDate ?? null,
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_FINDING_ADDED", "AI_FINDING", id, input.principal, input.traceId, {
      findingCode: input.findingCode,
      severity: input.severity,
    }, "Add AI audit finding.");
    return { id, findingId: id, status: "OPEN" };
  }

  async addCorrectiveAction(input: {
    principal: Principal;
    traceId: string;
    actionCode: string;
    findingId: string;
    description: string;
    rootCause?: string | null;
    ownerRole: string;
    dueDate?: string | null;
    evidenceId?: string | null;
    tenantId?: string | null;
  }): Promise<{ id: string; actionId: string; status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.audit");
    const id = newId(ID_PREFIX.correctiveAction);
    await db.insert(noeliaCorrectiveActions).values({
      id,
      actionCode: input.actionCode,
      findingId: input.findingId,
      description: input.description,
      rootCause: input.rootCause ?? null,
      ownerRole: input.ownerRole,
      dueDate: input.dueDate ?? null,
      status: "PLANNED",
      evidenceId: input.evidenceId ?? null,
      tenantId: input.tenantId ?? null,
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_CAPA_ADDED", "AI_CORRECTIVE_ACTION", id, input.principal, input.traceId, {
      actionCode: input.actionCode,
    }, "Add AI corrective action.");
    return { id, actionId: id, status: "PLANNED" };
  }

  async verifyCorrectiveAction(input: {
    principal: Principal;
    traceId: string;
    actionId: string;
    evidenceId: string;
    verifier?: string;
  }): Promise<{ status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.audit");
    const [evidence] = await db.select().from(noeliaEvidence).where(eq(noeliaEvidence.id, input.evidenceId)).limit(1);
    if (!evidence) throw new ComplianceStateError("Evidence record not found.");
    if (!isEvidenceCurrent(evidence)) {
      throw new ComplianceStateError("Corrective action evidence is not current.");
    }
    await db
      .update(noeliaCorrectiveActions)
      .set({
        status: "VERIFIED",
        evidenceId: input.evidenceId,
        verifiedBy: input.verifier ?? input.principal.userId,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(noeliaCorrectiveActions.id, input.actionId));
    await auditVariant("NOELIA_CAPA_VERIFIED", "AI_CORRECTIVE_ACTION", input.actionId, input.principal, input.traceId, {
      evidenceId: input.evidenceId,
    }, "Verify AI corrective action.");
    return { status: "VERIFIED" };
  }

  async addException(input: {
    principal: Principal;
    traceId: string;
    exceptionCode: string;
    requirementId?: string | null;
    controlId?: string | null;
    subjectType: string;
    subjectId: string;
    tenantId?: string | null;
    rationale: string;
    riskAccepted?: string;
    compensatingControl?: string | null;
    expiryDate?: string | null;
  }): Promise<{ id: string; exceptionId: string; status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.write");
    const id = newId(ID_PREFIX.exception);
    await db.insert(noeliaExceptions).values({
      id,
      exceptionCode: input.exceptionCode,
      requirementId: input.requirementId ?? null,
      controlId: input.controlId ?? null,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      tenantId: input.tenantId ?? null,
      rationale: input.rationale,
      riskAccepted: input.riskAccepted ?? "NOT_ASSESSED",
      compensatingControl: input.compensatingControl ?? null,
      expiryDate: input.expiryDate ?? null,
      status: "REQUESTED",
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_EXCEPTION_REQUESTED", "AI_EXCEPTION", id, input.principal, input.traceId, {
      exceptionCode: input.exceptionCode,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    }, "Request AI control exception.");
    return { id, exceptionId: id, status: "REQUESTED" };
  }

  async approveException(input: {
    principal: Principal;
    traceId: string;
    exceptionId: string;
    approved?: boolean;
    approvedBy?: string;
    reviewedBy?: string;
  }): Promise<{ status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.certification");
    const [row] = await db.select().from(noeliaExceptions).where(eq(noeliaExceptions.id, input.exceptionId)).limit(1);
    if (!row) throw new ComplianceStateError("Exception not found.");
    const status = input.approved === false ? "REJECTED" : "APPROVED";
    await db
      .update(noeliaExceptions)
      .set({
        status,
        approvedBy: input.approved ?? false ? (input.approvedBy ?? input.principal.userId) : row.approvedBy,
        approvedAt: input.approved === false ? null : new Date(),
        reviewedBy: input.reviewedBy ?? input.principal.userId,
        updatedAt: new Date(),
      })
      .where(eq(noeliaExceptions.id, input.exceptionId));
    await auditVariant("NOELIA_EXCEPTION_DISPOSED", "AI_EXCEPTION", input.exceptionId, input.principal, input.traceId, {
      status,
    }, "Dispose AI control exception.");
    return { status };
  }

  /* --------------------------- management / regulatory / monitoring --------------------------- */

  async recordManagementReview(input: {
    principal: Principal;
    traceId: string;
    reviewCode: string;
    title: string;
    frameworkId?: string | null;
    meetingDate?: string | null;
    reviewedBy?: string;
    scope: string;
    decisions?: Record<string, unknown>;
    actions?: Record<string, unknown>;
    tenantId?: string | null;
    legalEntityId?: string | null;
    countryCode?: string | null;
  }): Promise<{ id: string; reviewId: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.audit");
    const id = newId(ID_PREFIX.managementReview);
    await db.insert(noeliaManagementReviews).values({
      id,
      reviewCode: input.reviewCode,
      title: input.title,
      frameworkId: input.frameworkId ?? null,
      meetingDate: input.meetingDate ?? null,
      reviewedBy: input.reviewedBy ?? input.principal.userId,
      scope: input.scope,
      decisions: input.decisions ?? {},
      actions: input.actions ?? {},
      status: "HAPPENED",
      tenantId: input.tenantId ?? null,
      legalEntityId: input.legalEntityId ?? null,
      countryCode: input.countryCode ?? null,
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_MANAGEMENT_REVIEW_RECORDED", "AI_MANAGEMENT_REVIEW", id, input.principal, input.traceId, {
      reviewCode: input.reviewCode,
    }, "Record AI management review.");
    return { id, reviewId: id };
  }

  async registerRegulatoryChange(input: {
    principal: Principal;
    traceId: string;
    changeCode: string;
    frameworkId: string;
    title: string;
    source: string;
    sourceUri?: string | null;
    jurisdictionCode?: string | null;
    effectiveDate?: string | null;
    assessment?: string;
    impactLevel?: string;
    assignedRole?: string;
    dueDate?: string | null;
  }): Promise<{ id: string; changeId: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.write");
    const id = newId(ID_PREFIX.regulatoryChange);
    await db.insert(noeliaRegulatoryChanges).values({
      id,
      changeCode: input.changeCode,
      frameworkId: input.frameworkId,
      title: input.title,
      source: input.source,
      sourceUri: input.sourceUri ?? null,
      jurisdictionCode: input.jurisdictionCode ?? null,
      effectiveDate: input.effectiveDate ?? null,
      assessment: input.assessment ?? null,
      impactLevel: input.impactLevel ?? "UNKNOWN",
      status: "IDENTIFIED",
      assignedRole: input.assignedRole ?? null,
      dueDate: input.dueDate ?? null,
      createdBy: input.principal.userId,
    });
    await auditVariant("NOELIA_REGULATORY_CHANGE_REGISTERED", "AI_REGULATORY_CHANGE", id, input.principal, input.traceId, {
      changeCode: input.changeCode,
      frameworkId: input.frameworkId,
    }, "Register AI regulatory change.");
    return { id, changeId: id };
  }

  async upsertMonitoringIndicator(input: {
    principal: Principal;
    traceId: string;
    indicatorCode: string;
    title: string;
    metric: string;
    target?: string | null;
    baseline?: string | null;
    current?: string | null;
    unit?: string | null;
    period?: string | null;
    status?: string;
    source?: string | null;
    tenantId?: string | null;
    countryCode?: string | null;
  }): Promise<{ id: string; indicatorId: string; status: string }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.write");
    const [existing] = await db
      .select()
      .from(noeliaMonitoringIndicators)
      .where(eq(noeliaMonitoringIndicators.indicatorCode, input.indicatorCode))
      .limit(1);
    const status = input.status ?? "TRACKING";
    if (existing) {
      await db
        .update(noeliaMonitoringIndicators)
        .set({
          title: input.title,
          metric: input.metric,
          target: input.target ?? existing.target,
          baseline: input.baseline ?? existing.baseline,
          current: input.current ?? existing.current,
          unit: input.unit ?? existing.unit,
          period: input.period ?? existing.period,
          status,
          source: input.source ?? existing.source,
          countryCode: input.countryCode ?? existing.countryCode,
          updatedAt: new Date(),
        })
        .where(eq(noeliaMonitoringIndicators.id, existing.id));
      return { id: existing.id, indicatorId: existing.id, status };
    }
    const id = newId(ID_PREFIX.monitoringIndicator);
    await db.insert(noeliaMonitoringIndicators).values({
      id,
      indicatorCode: input.indicatorCode,
      title: input.title,
      metric: input.metric,
      target: input.target ?? null,
      baseline: input.baseline ?? null,
      current: input.current ?? null,
      unit: input.unit ?? null,
      period: input.period ?? null,
      status,
      source: input.source ?? null,
      tenantId: input.tenantId ?? null,
      countryCode: input.countryCode ?? null,
      createdBy: input.principal.userId,
    });
    return { id, indicatorId: id, status };
  }

  async listMonitoringBreaches(principal: Principal): Promise<typeof noeliaMonitoringIndicators.$inferSelect[]> {
    requireCanonicalContext();
    requirePermission(principal, "ai:compliance.metrics");
    return db
      .select()
      .from(noeliaMonitoringIndicators)
      .where(and(isNotNull(noeliaMonitoringIndicators.current), eq(noeliaMonitoringIndicators.status, "BREACH")))
      .orderBy(asc(noeliaMonitoringIndicators.indicatorCode));
  }

  /* --------------------------- certification readiness --------------------------- */

  async transitionCertificationReadiness(input: {
    principal: Principal;
    traceId: string;
    frameworkId: string;
    targetScope: string;
    to: CertificationState;
    externalEvidenceId?: string | null;
    notes?: string | null;
  }): Promise<{
    id: string;
    state: CertificationState;
    externalAssessor: string | null;
    evidenceTerminal: boolean;
  }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.certification");

    const [row] = await db
      .select()
      .from(noeliaCertificationReadiness)
      .where(and(eq(noeliaCertificationReadiness.frameworkId, input.frameworkId), eq(noeliaCertificationReadiness.targetScope, input.targetScope)))
      .limit(1);
    if (!row) throw new ComplianceStateError("Certification readiness record not found.");
    if (!CERTIFICATION_TRANSITIONS[row.state as CertificationState].includes(input.to)) {
      throw new ComplianceStateError(`Illegal certification readiness transition ${row.state} → ${input.to}.`);
    }

    let externalAssessor = row.externalAssessor;
    let externalEvidenceId = row.externalEvidenceId;
    let evidenceTerminal = false;

    if (input.to === CERTIFICATION_STATES.CERTIFIED) {
      const evidenceId = input.externalEvidenceId ?? row.externalEvidenceId;
      if (!evidenceId) {
        throw new ComplianceStateError("CERTIFIED requires a real external certificate evidence record.");
      }
      const [evidence] = await db.select().from(noeliaEvidence).where(eq(noeliaEvidence.id, evidenceId)).limit(1);
      if (!evidence) throw new ComplianceStateError("External evidence record not found.");
      if (evidence.evidenceType !== "EXTERNAL_CERTIFICATE") {
        throw new ComplianceStateError("CERTIFIED requires evidenceType EXTERNAL_CERTIFICATE.");
      }
      if (!isEvidenceCurrent(evidence)) {
        throw new ComplianceStateError("CERTIFIED requires VERIFIED, non-expired external certificate evidence.");
      }
      if (!evidence.externalAssessor) {
        throw new ComplianceStateError("CERTIFIED requires an explicit external assessor on the certificate evidence.");
      }
      externalAssessor = evidence.externalAssessor;
      externalEvidenceId = evidence.id;
      evidenceTerminal = true;
    }

    await db
      .update(noeliaCertificationReadiness)
      .set({
        state: input.to,
        externalEvidenceId,
        externalAssessor,
        currentEvidenceHash: externalEvidenceId
          ? (
              await db.select({ hash: noeliaEvidence.artifactHash }).from(noeliaEvidence).where(eq(noeliaEvidence.id, externalEvidenceId)).limit(1)
            )[0]?.hash ?? null
          : null,
        transitionedBy: input.principal.userId,
        transitionedAt: new Date(),
        notes: input.notes ?? row.notes,
        updatedAt: new Date(),
      })
      .where(eq(noeliaCertificationReadiness.id, row.id));

    await auditVariant("NOELIA_CERTIFICATION_READINESS_TRANSITIONED", "AI_CERTIFICATION_READINESS", row.id, input.principal, input.traceId, {
      frameworkId: input.frameworkId,
      targetScope: input.targetScope,
      from: row.state,
      to: input.to,
      evidenceTerminal,
      externalAssessor,
    }, "Transition AI certification readiness state.");

    return {
      id: row.id,
      state: input.to,
      externalAssessor,
      evidenceTerminal,
    };
  }

  async getCertificationReadiness(principal: Principal, frameworkId?: string): Promise<typeof noeliaCertificationReadiness.$inferSelect[]> {
    requireCanonicalContext();
    requirePermission(principal, "ai:compliance.read");
    return db
      .select()
      .from(noeliaCertificationReadiness)
      .where(frameworkId ? eq(noeliaCertificationReadiness.frameworkId, frameworkId) : sql`true`)
      .orderBy(asc(noeliaCertificationReadiness.frameworkId));
  }

  /* --------------------------- assessor package --------------------------- */

  async generateAssessorPackage(input: {
    principal: Principal;
    traceId: string;
    frameworkId: string;
    scope: string;
    tenantId?: string | null;
    certificationReadinessId?: string | null;
  }): Promise<{ id: string; packageId: string; status: string; version: string; contents: Record<string, unknown> }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.certification");
    const id = newId(ID_PREFIX.assessorPackage);

    const requirements = await db
      .select()
      .from(noeliaAiRequirements)
      .where(eq(noeliaAiRequirements.frameworkId, input.frameworkId))
      .orderBy(asc(noeliaAiRequirements.requirementCode));
    const controls = await db.select().from(noeliaControls).orderBy(asc(noeliaControls.controlCode));
    const mappings = await db
      .select()
      .from(noeliaRequirementControls)
      .where(sql`true`)
      .orderBy(asc(noeliaRequirementControls.requirementId));
    const evidence = await db
      .select()
      .from(noeliaEvidence)
      .where(input.tenantId ? eq(noeliaEvidence.tenantId, input.tenantId) : sql`true`)
      .orderBy(asc(noeliaEvidence.evidenceCode));

    const contents: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      frameworkId: input.frameworkId,
      scope: input.scope,
      requirementCount: requirements.length,
      controlCount: controls.length,
      mappingCount: mappings.length,
      evidenceCount: evidence.length,
      requirements: requirements.map((r) => ({ id: r.id, requirementCode: r.requirementCode, title: r.title, reference: r.reference })),
      controls: controls.map((c) => ({ id: c.id, controlCode: c.controlCode, title: c.title, implementationStatus: c.implementationStatus })),
      mappings: mappings.map((m) => ({ id: m.id, requirementId: m.requirementId, controlId: m.controlId, effectiveness: m.effectiveness })),
      evidence: evidence.map((e) => ({
        id: e.id,
        evidenceCode: e.evidenceCode,
        evidenceType: e.evidenceType,
        status: e.status,
        artifactHash: e.artifactHash,
        current: isEvidenceCurrent(e),
        externalAssessor: e.externalAssessor,
        expiresAt: e.expiresAt?.toISOString() ?? null,
      })),
      certificationReadiness: input.certificationReadinessId
        ? (
            await db
              .select()
              .from(noeliaCertificationReadiness)
              .where(eq(noeliaCertificationReadiness.id, input.certificationReadinessId))
              .limit(1)
          )[0] ?? null
        : null,
      disclaimer: "This package is readiness evidence. It is not a certification and does not claim external conformity.",
    };

    await db.insert(noeliaAssessorPackages).values({
      id,
      packageCode: `APKG-${input.frameworkId}-${new Date().toISOString().slice(0, 10)}`,
      frameworkId: input.frameworkId,
      scope: input.scope,
      status: "DRAFT",
      version: "1.0",
      contents,
      generatedBy: input.principal.userId,
      certificationReadinessId: input.certificationReadinessId ?? null,
      tenantId: input.tenantId ?? null,
      createdBy: input.principal.userId,
    });

    await auditVariant("NOELIA_ASSESSOR_PACKAGE_GENERATED", "AI_ASSESSOR_PACKAGE", id, input.principal, input.traceId, {
      frameworkId: input.frameworkId,
      scope: input.scope,
      evidenceCount: evidence.length,
    }, "Generate assessor package.");

    return {
      id,
      packageId: id,
      status: "DRAFT",
      version: "1.0",
      contents,
    };
  }

  /* --------------------------- dashboard --------------------------- */

  async complianceDashboard(input: { principal: Principal; traceId: string }): Promise<{
    requirements: { total: number; active: number; superseded: number };
    applicability: { total: number; applicable: number; undetermined: number; legalReview: number };
    controls: { total: number; implemented: number; verified: number; blocked: number; evidenceRequired: number };
    mappings: { total: number; effective: number; notEvidenced: number };
    evidence: { total: number; verifiedCurrent: number; draft: number; expired: number; integrityFailures: number };
    audits: { total: number; openFindings: number; openCapa: number };
    exceptions: { active: number; expired: number };
    monitoring: { breaches: number };
    certification: Array<{ frameworkId: string; targetScope: string; state: string }>;
    status: {
      externalAssessment: string;
      actualCertification: string;
      realGenerativeInference: string;
    };
  }> {
    requireCanonicalContext();
    requirePermission(input.principal, "ai:compliance.metrics");

    const requirements = await db.select().from(noeliaAiRequirements);
    const applicable = await db.select().from(noeliaApplicabilityAssessments);
    const controls = await db.select().from(noeliaControls);
    const mappings = await db.select().from(noeliaRequirementControls);
    const evidence = await db.select().from(noeliaEvidence);
    const findings = await db.select().from(noeliaFindings);
    const capa = await db.select().from(noeliaCorrectiveActions);
    const exceptions = await db.select().from(noeliaExceptions);
    const monitoring = await db.select().from(noeliaMonitoringIndicators);
    const cert = await db.select().from(noeliaCertificationReadiness);

    let integrityFailures = 0;
    for (const row of evidence) {
      if (computeEvidenceHash(row) !== row.artifactHash) integrityFailures += 1;
    }

    const now = Date.now();
    return {
      requirements: {
        total: requirements.length,
        active: requirements.filter((r) => r.status === "ACTIVE").length,
        superseded: requirements.filter((r) => r.status === "SUPERSEDED" || r.status === "OBSOLETE").length,
      },
      applicability: {
        total: applicable.length,
        applicable: applicable.filter((a) => a.result === "APPLICABLE" || a.result === "PARTIALLY_APPLICABLE").length,
        undetermined: applicable.filter((a) => a.result === "UNDETERMINED" || a.result === "NOT_ASSESSED").length,
        legalReview: applicable.filter((a) => a.legalReviewRequired).length,
      },
      controls: {
        total: controls.length,
        implemented: controls.filter((c) => c.implementationStatus === "IMPLEMENTED").length,
        verified: controls.filter((c) => c.implementationStatus === "VERIFIED").length,
        blocked: controls.filter((c) => c.implementationStatus === "BLOCKED").length,
        evidenceRequired: controls.filter((c) => c.implementationStatus === "EVIDENCE_REQUIRED" || c.assessmentRequirement === "EXTERNAL").length,
      },
      mappings: {
        total: mappings.length,
        effective: mappings.filter((m) => m.effectiveness === "EFFECTIVE").length,
        notEvidenced: mappings.filter((m) => m.effectiveness === "NOT_EVIDENCED" || m.effectiveness === "NOT_ASSESSED").length,
      },
      evidence: {
        total: evidence.length,
        verifiedCurrent: evidence.filter((e) => isEvidenceCurrent(e)).length,
        draft: evidence.filter((e) => e.status === "DRAFT" || e.status === "SUBMITTED").length,
        expired: evidence.filter((e) => e.status === "EXPIRED" || (e.status === "VERIFIED" && e.expiresAt !== null && e.expiresAt.getTime() <= now)).length,
        integrityFailures,
      },
      audits: {
        total: findings.length > 0 || capa.length > 0 ? 1 : 0,
        openFindings: findings.filter((f) => f.status !== "CLOSED" && f.status !== "ACCEPTED").length,
        openCapa: capa.filter((c) => c.status !== "CLOSED" && c.status !== "REJECTED").length,
      },
      exceptions: {
        active: exceptions.filter((e) => e.status === "APPROVED" && (!e.expiryDate || new Date(e.expiryDate).getTime() >= now)).length,
        expired: exceptions.filter((e) => e.status === "EXPIRED" || (e.status === "APPROVED" && e.expiryDate !== null && new Date(e.expiryDate).getTime() < now)).length,
      },
      monitoring: {
        breaches: monitoring.filter((m) => m.status === "BREACH").length,
      },
      certification: cert.map((c) => ({
        frameworkId: c.frameworkId,
        targetScope: c.targetScope,
        state: c.state,
      })),
      status: {
        externalAssessment: cert.some((c) => c.state === "CERTIFIED") ? "EXTERNAL_EVIDENCE_RECORDED" : "NOT_STARTED",
        actualCertification: cert.some((c) => c.state === "CERTIFIED") ? "CERTIFIED_RECORDED" : "NOT_CERTIFIED",
        realGenerativeInference: "BLOCKED/ENVIRONMENT_LIMITED",
      },
    };
  }
}
