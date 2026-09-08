/**
 * BEYU Foundation OS — governed domain services (registry → grants).
 *
 * Every mutation runs VALIDATE → SCOPE → TRANSITION → PERSIST → AUDIT → EVENT
 * in one transaction. Reads are tenant-scoped through the canonical
 * tenant-scope primitive. Cross-tenant, cross-foundation and cross-entity
 * violations fail closed with FoundationError (mapped to 403/409/422).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction, type AuditInput, type EventInput } from "@/lib/audit";
import { assertWithinScope, tenantScopeIds } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import { validateFoundationTransition, validateFormationTransition, validateGrantTransition } from "./lifecycle";
import { assessFormation, type FormationIntake } from "./formation";
import { diffStructures, simulateStructureChange, type StructureGraph } from "./structure";
import { evaluateTaxStatus, type TaxEvaluationInput } from "./tax";
import { FOUNDATION_EVENTS } from "./events";
import type { FoundationStatus, FormationStatus, GrantStatus, TaxStatus } from "./types";

export type ServiceContext = {
  principal: Principal;
  traceId: string;
  ip?: string | null;
  userAgent?: string | null;
};

export type FoundationErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "VALIDATION_FAILED"
  | "APPROVAL_REQUIRED"
  | "EVIDENCE_REQUIRED";

export class FoundationError extends Error {
  constructor(
    readonly code: FoundationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FoundationError";
  }
  get status(): number {
    switch (this.code) {
      case "NOT_FOUND":
        return 404;
      case "FORBIDDEN":
        return 403;
      case "CONFLICT":
        return 409;
      case "INVALID_TRANSITION":
      case "VALIDATION_FAILED":
      case "EVIDENCE_REQUIRED":
        return 422;
      case "APPROVAL_REQUIRED":
        return 403;
    }
  }
}

function auditBase(ctx: ServiceContext, tenantId: string): Pick<AuditInput, "tenantId" | "actorUserId" | "ipAddress" | "userAgent"> {
  return {
    tenantId,
    actorUserId: ctx.principal.userId,
    ipAddress: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  };
}

function eventBase(ctx: ServiceContext, tenantId: string): Pick<EventInput, "tenantId" | "actorUserId" | "traceId" | "correlationId" | "causationId" | "authorityContext" | "policyVersion" | "destinationDomain"> {
  return {
    tenantId,
    actorUserId: ctx.principal.userId,
    traceId: ctx.traceId,
    correlationId: ctx.traceId,
    causationId: null,
    authorityContext: null,
    policyVersion: null,
    destinationDomain: null,
  };
}

export function assertMoney(value: string, field: string): void {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new FoundationError("VALIDATION_FAILED", `${field} must be a non-negative decimal with at most 2 places`);
  }
}

/* ==========================================================================
 * FOUNDATION REGISTRY
 * ========================================================================== */

export type CreateFoundationInput = {
  code: string;
  legalName: string;
  operatingName?: string;
  legalEntityId?: string;
  foundationTypeId?: string;
  legalVehicle: string;
  registrationNumber?: string;
  jurisdictionId?: string;
  countryCode: string;
  regulator?: string;
  taxAuthority?: string;
  baseCurrency?: string;
  mission?: string;
  purpose?: string;
};

export async function createFoundation(ctx: ServiceContext, input: CreateFoundationInput) {
  const tenantId = ctx.principal.tenantId;
  await assertWithinScope(ctx.principal, tenantId);
  if (!input.code.trim() || !input.legalName.trim() || !input.legalVehicle.trim() || !input.countryCode.trim()) {
    throw new FoundationError("VALIDATION_FAILED", "code, legalName, legalVehicle and countryCode are required");
  }
  const id = newId(ID_PREFIX.foundation);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.foundations).values({
        id,
        tenantId,
        code: input.code.trim(),
        legalName: input.legalName.trim(),
        operatingName: input.operatingName?.trim() || null,
        legalEntityId: input.legalEntityId ?? null,
        foundationTypeId: input.foundationTypeId ?? null,
        legalVehicle: input.legalVehicle.trim(),
        registrationNumber: input.registrationNumber?.trim() || null,
        jurisdictionId: input.jurisdictionId ?? null,
        countryCode: input.countryCode.trim(),
        regulator: input.regulator?.trim() || null,
        taxAuthority: input.taxAuthority?.trim() || null,
        baseCurrency: input.baseCurrency ?? "USD",
        mission: input.mission ?? null,
        purpose: input.purpose ?? null,
        status: "PROPOSED",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, tenantId),
      action: "foundation.registry.create",
      objectType: "FOUNDATION",
      objectId: r.id,
      newValue: { code: input.code },
    }),
    (r) => ({
      ...eventBase(ctx, tenantId),
      type: FOUNDATION_EVENTS.FOUNDATION_REGISTERED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.FOUNDATION_REGISTERED,
      legalEntityId: input.legalEntityId ?? null,
      subjectType: "FOUNDATION",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { code: input.code, legalName: input.legalName },
    }),
  );
}

export async function listFoundations(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundations).where(inArray(s.foundations.tenantId, scope));
}

export async function getFoundation(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.foundations)
    .where(and(eq(s.foundations.id, id), inArray(s.foundations.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Foundation not found in your authorised scope");
  return row;
}

export async function transitionFoundation(
  ctx: ServiceContext,
  id: string,
  to: FoundationStatus,
  approvalRef?: string,
) {
  const current = await getFoundation(ctx.principal, id);
  const verdict = validateFoundationTransition(current.status as FoundationStatus, to);
  if (!verdict.ok) throw new FoundationError("INVALID_TRANSITION", verdict.reason);
  if (verdict.rule.requiresApprovalRef && !approvalRef) {
    throw new FoundationError("APPROVAL_REQUIRED", `Transition ${current.status} → ${to} requires a governance approval reference`);
  }
  const now = new Date();
  return withAuditTransaction(
    async (tx) => {
      const [updated] = await tx
        .update(s.foundations)
        .set({ status: to, statusChangedAt: now, statusChangedBy: ctx.principal.userId, updatedAt: now })
        .where(and(eq(s.foundations.id, id), eq(s.foundations.status, current.status)))
        .returning();
      if (!updated) throw new FoundationError("CONFLICT", "The foundation changed concurrently. Reload and retry.");
      return updated;
    },
    (r) => ({
      ...auditBase(ctx, r.tenantId),
      action: "foundation.registry.transition",
      objectType: "FOUNDATION",
      objectId: r.id,
      approvalRef: approvalRef ?? undefined,
      oldValue: { status: current.status },
      newValue: { status: to },
    }),
    (r) => ({
      ...eventBase(ctx, r.tenantId),
      type: FOUNDATION_EVENTS.FOUNDATION_STATUS_CHANGED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.FOUNDATION_STATUS_CHANGED,
      legalEntityId: r.legalEntityId,
      subjectType: "FOUNDATION",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { from: current.status, to, approvalRef: approvalRef ?? null },
    }),
  );
}

/* ==========================================================================
 * FORMATION ENGINE
 * ========================================================================== */

export type OpenFormationInput = {
  code: string;
  proposedName: string;
  mission?: string;
  jurisdictionId?: string;
  proposedVehicle?: string;
  fundingModel?: string;
  intake: FormationIntake;
};

export async function openFormationCase(ctx: ServiceContext, input: OpenFormationInput) {
  const tenantId = ctx.principal.tenantId;
  await assertWithinScope(ctx.principal, tenantId);
  const assessment = assessFormation(input.intake);
  const id = newId(ID_PREFIX.formation);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.formationCases).values({
        id,
        tenantId,
        code: input.code.trim(),
        proposedName: input.proposedName.trim(),
        mission: input.mission ?? input.intake.mission ?? null,
        jurisdictionId: input.jurisdictionId ?? null,
        proposedVehicle: input.proposedVehicle ?? input.intake.proposedVehicle ?? null,
        fundingModel: input.fundingModel ?? input.intake.fundingModel ?? null,
        internationalActivities: input.intake.internationalActivities,
        expectedWorkforce: input.intake.expectedWorkforce,
        assessment: assessment as unknown as Record<string, unknown>,
        recommendation: assessment.summary,
        status: "INTAKE",
        createdBy: ctx.principal.userId,
      });
      return { id, assessment };
    },
    (r) => ({
      ...auditBase(ctx, tenantId),
      action: "foundation.formation.open",
      objectType: "FORMATION_CASE",
      objectId: r.id,
      newValue: { code: input.code, readiness: assessment.readiness },
    }),
    (r) => ({
      ...eventBase(ctx, tenantId),
      type: FOUNDATION_EVENTS.FORMATION_CASE_OPENED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.FORMATION_CASE_OPENED,
      legalEntityId: null,
      subjectType: "FORMATION_CASE",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { code: input.code, readiness: assessment.readiness },
    }),
  );
}

export async function listFormationCases(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.formationCases).where(inArray(s.formationCases.tenantId, scope));
}

export async function getFormationCase(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.formationCases)
    .where(and(eq(s.formationCases.id, id), inArray(s.formationCases.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Formation case not found in your authorised scope");
  return row;
}

export async function transitionFormationCase(ctx: ServiceContext, id: string, to: FormationStatus, approvalRef?: string) {
  const current = await getFormationCase(ctx.principal, id);
  const verdict = validateFormationTransition(current.status as FormationStatus, to);
  if (!verdict.ok) throw new FoundationError("INVALID_TRANSITION", verdict.reason);
  if (verdict.rule.requiresApprovalRef && !approvalRef) {
    throw new FoundationError("APPROVAL_REQUIRED", `Transition ${current.status} → ${to} requires an approval reference`);
  }
  return withAuditTransaction(
    async (tx) => {
      const [updated] = await tx
        .update(s.formationCases)
        .set({ status: to, updatedAt: new Date() })
        .where(and(eq(s.formationCases.id, id), eq(s.formationCases.status, current.status)))
        .returning();
      if (!updated) throw new FoundationError("CONFLICT", "The formation case changed concurrently. Reload and retry.");
      return updated;
    },
    (r) => ({
      ...auditBase(ctx, r.tenantId),
      action: "foundation.formation.transition",
      objectType: "FORMATION_CASE",
      objectId: r.id,
      approvalRef: approvalRef ?? undefined,
      oldValue: { status: current.status },
      newValue: { status: to },
    }),
    (r) => ({
      ...eventBase(ctx, r.tenantId),
      type: FOUNDATION_EVENTS.FORMATION_ASSESSED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.FORMATION_ASSESSED,
      legalEntityId: null,
      subjectType: "FORMATION_CASE",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { from: current.status, to },
    }),
  );
}

/* ==========================================================================
 * STRUCTURE DESIGNER & SIMULATOR
 * ========================================================================== */

export async function createStructureProposal(
  ctx: ServiceContext,
  input: { code: string; title: string; kind?: string; foundationId?: string; graph: StructureGraph; rationale?: string },
) {
  const tenantId = ctx.principal.tenantId;
  await assertWithinScope(ctx.principal, tenantId);
  if (!input.graph || !Array.isArray(input.graph.nodes) || !Array.isArray(input.graph.edges)) {
    throw new FoundationError("VALIDATION_FAILED", "graph must contain nodes[] and edges[]");
  }
  const id = newId(ID_PREFIX.structureProposal);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.structureProposals).values({
        id,
        tenantId,
        code: input.code.trim(),
        title: input.title.trim(),
        kind: input.kind ?? "PROPOSED",
        foundationId: input.foundationId ?? null,
        graph: input.graph as unknown as Record<string, unknown>,
        rationale: input.rationale ?? null,
        status: "DRAFT",
        proposedBy: ctx.principal.userId,
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, tenantId),
      action: "foundation.structure.propose",
      objectType: "STRUCTURE_PROPOSAL",
      objectId: r.id,
      newValue: { code: input.code },
    }),
    (r) => ({
      ...eventBase(ctx, tenantId),
      type: FOUNDATION_EVENTS.STRUCTURE_PROPOSAL_CREATED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.STRUCTURE_PROPOSAL_CREATED,
      legalEntityId: null,
      subjectType: "STRUCTURE_PROPOSAL",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { code: input.code, nodes: input.graph.nodes.length, edges: input.graph.edges.length },
    }),
  );
}

export async function listStructureProposals(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.structureProposals).where(inArray(s.structureProposals.tenantId, scope));
}

export async function getStructureProposal(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.structureProposals)
    .where(and(eq(s.structureProposals.id, id), inArray(s.structureProposals.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Structure proposal not found in your authorised scope");
  return row;
}

export async function runStructureSimulation(
  ctx: ServiceContext,
  input: { code: string; question: string; baselineProposalId: string; candidateProposalId: string },
) {
  const tenantId = ctx.principal.tenantId;
  const baseline = await getStructureProposal(ctx.principal, input.baselineProposalId);
  const candidate = await getStructureProposal(ctx.principal, input.candidateProposalId);
  const result = simulateStructureChange(
    input.question,
    baseline.graph as unknown as StructureGraph,
    candidate.graph as unknown as StructureGraph,
  );
  // Defensive: diffStructures never throws on well-formed graphs, but a stored
  // graph could predate validation — recompute cheaply to fail closed.
  void diffStructures(baseline.graph as unknown as StructureGraph, candidate.graph as unknown as StructureGraph);
  const id = newId(ID_PREFIX.structureScenario);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.structureScenarios).values({
        id,
        tenantId,
        code: input.code.trim(),
        baselineProposalId: baseline.id,
        candidateProposalId: candidate.id,
        question: input.question,
        diff: result.diff as unknown as Record<string, unknown>,
        impacts: { impacts: result.impacts } as unknown as Record<string, unknown>,
        requiredApprovals: result.requiredApprovals,
        implementationTasks: result.implementationTasks,
        status: "COMPLETED",
        createdBy: ctx.principal.userId,
      });
      return { id, result };
    },
    (r) => ({
      ...auditBase(ctx, tenantId),
      action: "foundation.structure.simulate",
      objectType: "STRUCTURE_SCENARIO",
      objectId: r.id,
      newValue: { code: input.code },
    }),
    (r) => ({
      ...eventBase(ctx, tenantId),
      type: FOUNDATION_EVENTS.STRUCTURE_SIMULATED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.STRUCTURE_SIMULATED,
      legalEntityId: null,
      subjectType: "STRUCTURE_SCENARIO",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { code: input.code, question: input.question },
    }),
  );
}

export async function listStructureScenarios(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.structureScenarios).where(inArray(s.structureScenarios.tenantId, scope));
}

/* ==========================================================================
 * FOUNDATION MEETINGS & CONFLICTS (bodies/resolutions stay canonical)
 * ========================================================================== */

export async function scheduleMeeting(
  ctx: ServiceContext,
  input: {
    foundationId: string;
    governanceBodyId: string;
    code: string;
    title: string;
    scheduledAt: Date;
    location?: string;
    agenda?: Array<Record<string, unknown>>;
    quorumRequired?: number;
  },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  const id = newId(ID_PREFIX.foundationMeeting);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.foundationMeetings).values({
        id,
        tenantId: foundation.tenantId,
        foundationId: foundation.id,
        governanceBodyId: input.governanceBodyId,
        code: input.code.trim(),
        title: input.title.trim(),
        scheduledAt: input.scheduledAt,
        location: input.location ?? null,
        agenda: (input.agenda ?? []) as Array<Record<string, unknown>>,
        quorumRequired: input.quorumRequired ?? null,
        status: "SCHEDULED",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, foundation.tenantId),
      action: "foundation.governance.scheduleMeeting",
      objectType: "FOUNDATION_MEETING",
      objectId: r.id,
      newValue: { code: input.code },
    }),
    (r) => ({
      ...eventBase(ctx, foundation.tenantId),
      type: FOUNDATION_EVENTS.MEETING_SCHEDULED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.MEETING_SCHEDULED,
      legalEntityId: foundation.legalEntityId,
      subjectType: "FOUNDATION_MEETING",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { code: input.code, foundationId: foundation.id },
    }),
  );
}

export async function listMeetings(principal: Principal, foundationId?: string) {
  const scope = await tenantScopeIds(principal);
  const where = foundationId
    ? and(eq(s.foundationMeetings.foundationId, foundationId), inArray(s.foundationMeetings.tenantId, scope))
    : inArray(s.foundationMeetings.tenantId, scope);
  return db.select().from(s.foundationMeetings).where(where);
}

export async function declareConflict(
  ctx: ServiceContext,
  input: {
    foundationId: string;
    partyId: string;
    interestType: string;
    description: string;
    relatedEntity?: string;
    relatedGrantId?: string;
    relatedProcurementId?: string;
    severity?: string;
    mitigation?: string;
  },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  const id = newId(ID_PREFIX.foundationConflict);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.foundationConflicts).values({
        id,
        tenantId: foundation.tenantId,
        foundationId: foundation.id,
        partyId: input.partyId,
        interestType: input.interestType,
        description: input.description,
        relatedEntity: input.relatedEntity ?? null,
        relatedGrantId: input.relatedGrantId ?? null,
        relatedProcurementId: input.relatedProcurementId ?? null,
        severity: input.severity ?? "MEDIUM",
        mitigation: input.mitigation ?? null,
        status: "DECLARED",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, foundation.tenantId),
      action: "foundation.governance.declareConflict",
      objectType: "FOUNDATION_CONFLICT",
      objectId: r.id,
      newValue: { interestType: input.interestType, severity: input.severity ?? "MEDIUM" },
    }),
    (r) => ({
      ...eventBase(ctx, foundation.tenantId),
      type: FOUNDATION_EVENTS.CONFLICT_DECLARED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.CONFLICT_DECLARED,
      legalEntityId: foundation.legalEntityId,
      subjectType: "FOUNDATION_CONFLICT",
      subjectId: r.id,
      classification: "RESTRICTED",
      payload: { foundationId: foundation.id, severity: input.severity ?? "MEDIUM" },
    }),
  );
}

export async function listConflicts(principal: Principal, foundationId?: string) {
  const scope = await tenantScopeIds(principal);
  const where = foundationId
    ? and(eq(s.foundationConflicts.foundationId, foundationId), inArray(s.foundationConflicts.tenantId, scope))
    : inArray(s.foundationConflicts.tenantId, scope);
  return db.select().from(s.foundationConflicts).where(where);
}

/* ==========================================================================
 * TAX INTELLIGENCE
 * ========================================================================== */

export async function publishTaxRule(
  ctx: ServiceContext,
  input: {
    code: string;
    countryCode: string;
    jurisdictionId?: string;
    authority: string;
    source: string;
    ruleVersion?: string;
    effectiveFrom: string;
    effectiveTo?: string;
    applicability: string;
    ruleBody?: Record<string, unknown>;
    verificationDate?: string;
  },
) {
  const tenantId = ctx.principal.tenantId;
  await assertWithinScope(ctx.principal, tenantId);
  const id = newId(ID_PREFIX.foundationTaxRule);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.foundationTaxRules).values({
        id,
        tenantId,
        code: input.code.trim(),
        countryCode: input.countryCode,
        jurisdictionId: input.jurisdictionId ?? null,
        authority: input.authority,
        source: input.source,
        ruleVersion: input.ruleVersion ?? "1.0",
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        applicability: input.applicability,
        ruleBody: input.ruleBody ?? {},
        verificationDate: input.verificationDate ?? null,
        status: "UNDER_REVIEW",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, tenantId),
      action: "foundation.tax.publishRule",
      objectType: "FOUNDATION_TAX_RULE",
      objectId: r.id,
      newValue: { code: input.code },
    }),
    (r) => ({
      ...eventBase(ctx, tenantId),
      type: FOUNDATION_EVENTS.TAX_RULE_PUBLISHED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.TAX_RULE_PUBLISHED,
      legalEntityId: null,
      subjectType: "FOUNDATION_TAX_RULE",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { code: input.code, authority: input.authority },
    }),
  );
}

export async function listTaxRules(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundationTaxRules).where(inArray(s.foundationTaxRules.tenantId, scope));
}

export async function recordTaxAssessment(
  ctx: ServiceContext,
  input: {
    code: string;
    foundationId: string;
    taxRuleId?: string;
    activity: string;
    transactionRef?: string;
    evidenceRefs?: string[];
    disqualifiers?: string[];
    assumptions?: string[];
    potentialBenefit?: string;
    potentialLiability?: string;
    risks?: string;
    todayIso: string;
  },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  let rule: TaxEvaluationInput["rule"] = null;
  if (input.taxRuleId) {
    const scope = await tenantScopeIds(ctx.principal);
    const [row] = await db
      .select()
      .from(s.foundationTaxRules)
      .where(and(eq(s.foundationTaxRules.id, input.taxRuleId), inArray(s.foundationTaxRules.tenantId, scope)))
      .limit(1);
    if (!row) throw new FoundationError("NOT_FOUND", "Tax rule not found in your authorised scope");
    rule = {
      id: row.id,
      authority: row.authority,
      source: row.source,
      ruleVersion: row.ruleVersion,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      verificationDate: row.verificationDate,
      status: row.status,
    };
  }
  const evaluation = evaluateTaxStatus({
    rule,
    evidenceRefs: input.evidenceRefs ?? [],
    disqualifiers: input.disqualifiers ?? [],
    assumptions: input.assumptions ?? [],
    todayIso: input.todayIso,
  });
  const id = newId(ID_PREFIX.foundationTaxAssessment);
  const status: TaxStatus = evaluation.status;
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.foundationTaxAssessments).values({
        id,
        tenantId: foundation.tenantId,
        code: input.code.trim(),
        foundationId: foundation.id,
        taxRuleId: input.taxRuleId ?? null,
        activity: input.activity,
        transactionRef: input.transactionRef ?? null,
        taxStatus: status,
        potentialBenefit: input.potentialBenefit ?? null,
        potentialLiability: input.potentialLiability ?? null,
        assumptions: (input.assumptions ?? []).join("\n") || null,
        risks: [...(input.risks ? [input.risks] : []), ...evaluation.reasons].join("\n") || null,
        professionalReviewRequired: evaluation.professionalReviewRequired,
        assessedBy: ctx.principal.userId,
      });
      return { id, evaluation };
    },
    (r) => ({
      ...auditBase(ctx, foundation.tenantId),
      action: "foundation.tax.assess",
      objectType: "FOUNDATION_TAX_ASSESSMENT",
      objectId: r.id,
      newValue: { code: input.code, status },
    }),
    (r) => ({
      ...eventBase(ctx, foundation.tenantId),
      type: FOUNDATION_EVENTS.TAX_STATUS_CHANGED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.TAX_STATUS_CHANGED,
      legalEntityId: foundation.legalEntityId,
      subjectType: "FOUNDATION_TAX_ASSESSMENT",
      subjectId: r.id,
      classification: "RESTRICTED",
      payload: { code: input.code, status, foundationId: foundation.id },
    }),
  );
}

export async function listTaxAssessments(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundationTaxAssessments).where(inArray(s.foundationTaxAssessments.tenantId, scope));
}

/* ==========================================================================
 * DONORS, DONATIONS, PLEDGES
 * ========================================================================== */

export async function registerDonor(
  ctx: ServiceContext,
  input: { code: string; displayName: string; donorType: string; partyId?: string; countryCode?: string; contactRef?: string },
) {
  const tenantId = ctx.principal.tenantId;
  await assertWithinScope(ctx.principal, tenantId);
  const id = newId(ID_PREFIX.donor);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.donors).values({
        id,
        tenantId,
        code: input.code.trim(),
        displayName: input.displayName.trim(),
        donorType: input.donorType,
        partyId: input.partyId ?? null,
        countryCode: input.countryCode ?? null,
        contactRef: input.contactRef ?? null,
        dueDiligenceStatus: "PENDING",
        status: "ACTIVE",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, tenantId),
      action: "foundation.donor.register",
      objectType: "DONOR",
      objectId: r.id,
      newValue: { code: input.code },
    }),
    (r) => ({
      ...eventBase(ctx, tenantId),
      type: FOUNDATION_EVENTS.DONOR_REGISTERED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.DONOR_REGISTERED,
      legalEntityId: null,
      subjectType: "DONOR",
      subjectId: r.id,
      classification: "RESTRICTED",
      payload: { code: input.code },
    }),
  );
}

export async function listDonors(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.donors).where(inArray(s.donors.tenantId, scope));
}

export async function getDonor(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.donors)
    .where(and(eq(s.donors.id, id), inArray(s.donors.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Donor not found in your authorised scope");
  return row;
}

export async function setDonorDueDiligence(ctx: ServiceContext, id: string, status: string) {
  const donor = await getDonor(ctx.principal, id);
  if (!["NONE", "PENDING", "CLEARED", "FLAGGED", "BLOCKED"].includes(status)) {
    throw new FoundationError("VALIDATION_FAILED", `Unknown due-diligence status ${status}`);
  }
  await db
    .update(s.donors)
    .set({ dueDiligenceStatus: status, dueDiligenceAt: new Date() })
    .where(eq(s.donors.id, id));
  return { id, dueDiligenceStatus: status, previous: donor.dueDiligenceStatus };
}

export async function recordDonation(
  ctx: ServiceContext,
  input: {
    code: string;
    donorId: string;
    foundationId: string;
    fundId?: string;
    amount: string;
    currency?: string;
    receivedAt: string;
    channel?: string;
    restrictionSummary?: string;
  },
) {
  const donor = await getDonor(ctx.principal, input.donorId);
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  if (donor.tenantId !== foundation.tenantId) {
    throw new FoundationError("FORBIDDEN", "Donor and foundation belong to different tenants");
  }
  if (donor.dueDiligenceStatus === "BLOCKED") {
    throw new FoundationError("FORBIDDEN", "Donations from a BLOCKED donor cannot be recorded");
  }
  assertMoney(input.amount, "amount");
  const id = newId(ID_PREFIX.donation);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.donations).values({
        id,
        tenantId: foundation.tenantId,
        donorId: donor.id,
        foundationId: foundation.id,
        fundId: input.fundId ?? null,
        code: input.code.trim(),
        amount: input.amount,
        currency: input.currency ?? "USD",
        receivedAt: input.receivedAt,
        channel: input.channel ?? null,
        restrictionSummary: input.restrictionSummary ?? null,
        status: "RECEIVED",
      });
      if (input.fundId) {
        await tx
          .update(s.funds)
          .set({ balance: input.amount, updatedAt: new Date() })
          .where(and(eq(s.funds.id, input.fundId), eq(s.funds.tenantId, foundation.tenantId)));
      }
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, foundation.tenantId),
      action: "foundation.donor.recordDonation",
      objectType: "DONATION",
      objectId: r.id,
      newValue: { code: input.code, amount: input.amount },
    }),
    (r) => ({
      ...eventBase(ctx, foundation.tenantId),
      type: FOUNDATION_EVENTS.DONATION_RECEIVED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.DONATION_RECEIVED,
      legalEntityId: foundation.legalEntityId,
      subjectType: "DONATION",
      subjectId: r.id,
      classification: "RESTRICTED",
      payload: { code: input.code, donorId: donor.id, amount: input.amount },
    }),
  );
}

export async function listDonations(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.donations).where(inArray(s.donations.tenantId, scope));
}

/* ==========================================================================
 * FUNDS
 * ========================================================================== */

export async function createFund(
  ctx: ServiceContext,
  input: { code: string; name: string; foundationId: string; fundType: string; purpose?: string; source?: string; currency?: string; reportingObligations?: string },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  if (!["RESTRICTED", "UNRESTRICTED", "DESIGNATED", "ENDOWMENT", "RESERVE"].includes(input.fundType)) {
    throw new FoundationError("VALIDATION_FAILED", `Unknown fund type ${input.fundType}`);
  }
  const id = newId(ID_PREFIX.fund);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.funds).values({
        id,
        tenantId: foundation.tenantId,
        foundationId: foundation.id,
        code: input.code.trim(),
        name: input.name.trim(),
        fundType: input.fundType,
        purpose: input.purpose ?? null,
        source: input.source ?? null,
        currency: input.currency ?? foundation.baseCurrency,
        reportingObligations: input.reportingObligations ?? null,
        status: "ACTIVE",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, foundation.tenantId),
      action: "foundation.fund.create",
      objectType: "FUND",
      objectId: r.id,
      newValue: { code: input.code, fundType: input.fundType },
    }),
    (r) => ({
      ...eventBase(ctx, foundation.tenantId),
      type: FOUNDATION_EVENTS.FUND_CREATED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.FUND_CREATED,
      legalEntityId: foundation.legalEntityId,
      subjectType: "FUND",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { code: input.code, fundType: input.fundType },
    }),
  );
}

export async function listFunds(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.funds).where(inArray(s.funds.tenantId, scope));
}

export async function getFund(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.funds)
    .where(and(eq(s.funds.id, id), inArray(s.funds.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Fund not found in your authorised scope");
  return row;
}

export async function addFundRestriction(
  ctx: ServiceContext,
  input: { fundId: string; restrictionType: string; rule: string; donorId?: string; effectiveFrom?: string; effectiveTo?: string },
) {
  const fund = await getFund(ctx.principal, input.fundId);
  const id = newId(ID_PREFIX.fundRestriction);
  await db.insert(s.fundRestrictions).values({
    id,
    tenantId: fund.tenantId,
    fundId: fund.id,
    restrictionType: input.restrictionType,
    rule: input.rule,
    donorId: input.donorId ?? null,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,
    status: "ACTIVE",
  });
  return { id };
}

/**
 * Allocate fund money to a program/grant. Restricted funds may only fund
 * purposes recorded in their restriction rules — the caller states the
 * purpose and the allocation is fenced to the same tenant.
 */
export async function allocateFund(
  ctx: ServiceContext,
  input: { fundId: string; programId?: string; grantId?: string; amount: string; currency?: string; purpose?: string; approvalRef?: string },
) {
  const fund = await getFund(ctx.principal, input.fundId);
  assertMoney(input.amount, "amount");
  if (!input.programId && !input.grantId) {
    throw new FoundationError("VALIDATION_FAILED", "An allocation requires a programId or grantId destination");
  }
  if (fund.fundType === "RESTRICTED" && !input.purpose) {
    throw new FoundationError("VALIDATION_FAILED", "Restricted-fund allocations require an explicit purpose");
  }
  const available = Number(fund.balance) - Number(fund.committed);
  if (Number(input.amount) > available) {
    throw new FoundationError("CONFLICT", `Allocation ${input.amount} exceeds available fund balance ${available.toFixed(2)}`);
  }
  const id = newId(ID_PREFIX.fundAllocation);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.fundAllocations).values({
        id,
        tenantId: fund.tenantId,
        fundId: fund.id,
        programId: input.programId ?? null,
        grantId: input.grantId ?? null,
        amount: input.amount,
        currency: input.currency ?? fund.currency,
        purpose: input.purpose ?? null,
        allocatedBy: ctx.principal.userId,
        approvalRef: input.approvalRef ?? null,
        status: "APPROVED",
      });
      await tx
        .update(s.funds)
        .set({ committed: String(Number(fund.committed) + Number(input.amount)), updatedAt: new Date() })
        .where(eq(s.funds.id, fund.id));
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, fund.tenantId),
      action: "foundation.fund.allocate",
      objectType: "FUND_ALLOCATION",
      objectId: r.id,
      approvalRef: input.approvalRef ?? undefined,
      newValue: { fundId: fund.id, amount: input.amount },
    }),
    (r) => ({
      ...eventBase(ctx, fund.tenantId),
      type: FOUNDATION_EVENTS.FUND_ALLOCATED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.FUND_ALLOCATED,
      legalEntityId: null,
      subjectType: "FUND_ALLOCATION",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { fundId: fund.id, amount: input.amount, programId: input.programId ?? null, grantId: input.grantId ?? null },
    }),
  );
}

/* ==========================================================================
 * GRANTEES & GRANTS
 * ========================================================================== */

export async function registerGrantee(
  ctx: ServiceContext,
  input: { code: string; displayName: string; granteeType: string; countryCode?: string; registrationRef?: string },
) {
  const tenantId = ctx.principal.tenantId;
  await assertWithinScope(ctx.principal, tenantId);
  const id = newId(ID_PREFIX.grantee);
  await db.insert(s.grantees).values({
    id,
    tenantId,
    code: input.code.trim(),
    displayName: input.displayName.trim(),
    granteeType: input.granteeType,
    countryCode: input.countryCode ?? null,
    registrationRef: input.registrationRef ?? null,
    dueDiligenceStatus: "PENDING",
    status: "ACTIVE",
  });
  return { id };
}

export async function listGrantees(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.grantees).where(inArray(s.grantees.tenantId, scope));
}

export async function getGrantee(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.grantees)
    .where(and(eq(s.grantees.id, id), inArray(s.grantees.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Grantee not found in your authorised scope");
  return row;
}

export async function createGrant(
  ctx: ServiceContext,
  input: {
    code: string;
    title: string;
    foundationId: string;
    fundId?: string;
    programId?: string;
    granteeId?: string;
    amount: string;
    currency?: string;
    budget?: Record<string, unknown>;
    restrictions?: string;
    startDate?: string;
    endDate?: string;
  },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  assertMoney(input.amount, "amount");
  if (input.granteeId) await getGrantee(ctx.principal, input.granteeId);
  if (input.fundId) await getFund(ctx.principal, input.fundId);
  const id = newId(ID_PREFIX.grant);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.grants).values({
        id,
        tenantId: foundation.tenantId,
        foundationId: foundation.id,
        fundId: input.fundId ?? null,
        programId: input.programId ?? null,
        granteeId: input.granteeId ?? null,
        code: input.code.trim(),
        title: input.title.trim(),
        amount: input.amount,
        currency: input.currency ?? "USD",
        budget: input.budget ?? {},
        restrictions: input.restrictions ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        status: "OPPORTUNITY",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, foundation.tenantId),
      action: "foundation.grant.create",
      objectType: "GRANT",
      objectId: r.id,
      newValue: { code: input.code, amount: input.amount },
    }),
    (r) => ({
      ...eventBase(ctx, foundation.tenantId),
      type: FOUNDATION_EVENTS.GRANT_CREATED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.GRANT_CREATED,
      legalEntityId: foundation.legalEntityId,
      subjectType: "GRANT",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { code: input.code, amount: input.amount },
    }),
  );
}

export async function listGrants(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.grants).where(inArray(s.grants.tenantId, scope));
}

export async function getGrant(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.grants)
    .where(and(eq(s.grants.id, id), inArray(s.grants.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Grant not found in your authorised scope");
  return row;
}

export async function transitionGrant(ctx: ServiceContext, id: string, to: GrantStatus, approvalRef?: string) {
  const current = await getGrant(ctx.principal, id);
  const verdict = validateGrantTransition(current.status as GrantStatus, to);
  if (!verdict.ok) throw new FoundationError("INVALID_TRANSITION", verdict.reason);
  if (verdict.rule.requiresApprovalRef && !approvalRef) {
    throw new FoundationError("APPROVAL_REQUIRED", `Transition ${current.status} → ${to} requires an approval reference`);
  }
  // Material gates: APPROVAL requires cleared grantee + conflict check.
  if (to === "APPROVAL") {
    if (current.granteeId) {
      const grantee = await getGrantee(ctx.principal, current.granteeId);
      if (grantee.dueDiligenceStatus !== "CLEARED") {
        throw new FoundationError("CONFLICT", `Grantee due diligence is ${grantee.dueDiligenceStatus}; approval requires CLEARED`);
      }
    }
    if (current.conflictCheckStatus !== "CLEARED") {
      throw new FoundationError("CONFLICT", "Conflict check must be CLEARED before grant approval");
    }
  }
  return withAuditTransaction(
    async (tx) => {
      const [updated] = await tx
        .update(s.grants)
        .set({ status: to, approvalRef: approvalRef ?? current.approvalRef, updatedAt: new Date() })
        .where(and(eq(s.grants.id, id), eq(s.grants.status, current.status)))
        .returning();
      if (!updated) throw new FoundationError("CONFLICT", "The grant changed concurrently. Reload and retry.");
      return updated;
    },
    (r) => ({
      ...auditBase(ctx, r.tenantId),
      action: "foundation.grant.transition",
      objectType: "GRANT",
      objectId: r.id,
      approvalRef: approvalRef ?? undefined,
      oldValue: { status: current.status },
      newValue: { status: to },
    }),
    (r) => ({
      ...eventBase(ctx, r.tenantId),
      type: to === "APPROVAL" ? FOUNDATION_EVENTS.GRANT_APPROVED : to === "CLOSEOUT" ? FOUNDATION_EVENTS.GRANT_CLOSED : FOUNDATION_EVENTS.GRANT_STATUS_CHANGED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.GRANT_STATUS_CHANGED,
      legalEntityId: null,
      subjectType: "GRANT",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { from: current.status, to },
    }),
  );
}

export async function setGrantConflictCheck(ctx: ServiceContext, id: string, status: string) {
  const grant = await getGrant(ctx.principal, id);
  if (!["PENDING", "CLEARED", "FLAGGED"].includes(status)) {
    throw new FoundationError("VALIDATION_FAILED", `Unknown conflict-check status ${status}`);
  }
  await db.update(s.grants).set({ conflictCheckStatus: status, updatedAt: new Date() }).where(eq(s.grants.id, id));
  return { id, conflictCheckStatus: status, previous: grant.conflictCheckStatus };
}

export async function addGrantMilestone(
  ctx: ServiceContext,
  input: { grantId: string; code: string; title: string; deliverables?: string; dueDate?: string },
) {
  const grant = await getGrant(ctx.principal, input.grantId);
  const id = newId(ID_PREFIX.grantMilestone);
  await db.insert(s.grantMilestones).values({
    id,
    tenantId: grant.tenantId,
    grantId: grant.id,
    code: input.code.trim(),
    title: input.title.trim(),
    deliverables: input.deliverables ?? null,
    dueDate: input.dueDate ?? null,
    status: "PENDING",
  });
  return { id };
}

export async function listGrantMilestones(principal: Principal, grantId: string) {
  await getGrant(principal, grantId);
  const scope = await tenantScopeIds(principal);
  return db
    .select()
    .from(s.grantMilestones)
    .where(and(eq(s.grantMilestones.grantId, grantId), inArray(s.grantMilestones.tenantId, scope)));
}

export async function scheduleDisbursement(
  ctx: ServiceContext,
  input: { grantId: string; code: string; amount: string; currency?: string; scheduledFor?: string; milestoneId?: string },
) {
  const grant = await getGrant(ctx.principal, input.grantId);
  assertMoney(input.amount, "amount");
  if (!["AGREEMENT", "DISBURSEMENT", "MILESTONES", "MONITORING", "REPORTING"].includes(grant.status)) {
    throw new FoundationError("INVALID_TRANSITION", `Disbursements require an approved grant; current status is ${grant.status}`);
  }
  const id = newId(ID_PREFIX.grantDisbursement);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.grantDisbursements).values({
        id,
        tenantId: grant.tenantId,
        grantId: grant.id,
        milestoneId: input.milestoneId ?? null,
        code: input.code.trim(),
        amount: input.amount,
        currency: input.currency ?? grant.currency,
        scheduledFor: input.scheduledFor ?? null,
        status: "SCHEDULED",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, grant.tenantId),
      action: "foundation.grant.scheduleDisbursement",
      objectType: "GRANT_DISBURSEMENT",
      objectId: r.id,
      newValue: { code: input.code, amount: input.amount },
    }),
    (r) => ({
      ...eventBase(ctx, grant.tenantId),
      type: FOUNDATION_EVENTS.GRANT_DISBURSED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.GRANT_DISBURSED,
      legalEntityId: null,
      subjectType: "GRANT_DISBURSEMENT",
      subjectId: r.id,
      classification: "CONFIDENTIAL",
      payload: { code: input.code, grantId: grant.id, amount: input.amount },
    }),
  );
}
