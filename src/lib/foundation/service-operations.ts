/**
 * BEYU Foundation OS — governed domain services (programs → assignments).
 *
 * Companion to service.ts. Programs themselves reuse the canonical
 * `foundation_programs` table; projects, beneficiaries, procurement, assets,
 * investments, safeguarding, impact and workforce assignments live here.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction } from "@/lib/audit";
import { assertWithinScope, tenantScopeIds } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import { validateAssetTransition, validateProcurementTransition, validateSafeguardingTransition } from "./lifecycle";
import { FOUNDATION_EVENTS } from "./events";
import {
  FoundationError,
  assertMoney,
  getFoundation,
  getGrant,
  type ServiceContext,
} from "./service";
import type { AssetStatus, ProcurementStatus, SafeguardingStatus } from "./types";

function auditBase(ctx: ServiceContext, tenantId: string) {
  return {
    tenantId,
    actorUserId: ctx.principal.userId,
    ipAddress: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  };
}

function eventBase(ctx: ServiceContext, tenantId: string) {
  return {
    tenantId,
    actorUserId: ctx.principal.userId,
    traceId: ctx.traceId,
    correlationId: ctx.traceId,
    causationId: null as string | null,
    authorityContext: null,
    policyVersion: null as string | null,
    destinationDomain: null as string | null,
  };
}

/* ==========================================================================
 * PROGRAMS (canonical table) + PROJECTS
 * ========================================================================== */

export async function listPrograms(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundationPrograms).where(inArray(s.foundationPrograms.tenantId, scope));
}

export async function getProgram(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.foundationPrograms)
    .where(and(eq(s.foundationPrograms.id, id), inArray(s.foundationPrograms.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Program not found in your authorised scope");
  return row;
}

export async function createProgram(
  ctx: ServiceContext,
  input: { code: string; name: string; theme: string; countryCode: string; budget: string; currency?: string },
) {
  const tenantId = ctx.principal.tenantId;
  await assertWithinScope(ctx.principal, tenantId);
  assertMoney(input.budget, "budget");
  const id = newId(ID_PREFIX.program);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.foundationPrograms).values({
        id,
        tenantId,
        code: input.code.trim(),
        name: input.name.trim(),
        theme: input.theme,
        countryCode: input.countryCode,
        budget: input.budget,
        currency: input.currency ?? "USD",
        spendToDate: "0",
        beneficiariesReached: 0,
        status: "ACTIVE",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, tenantId),
      action: "foundation.program.create",
      objectType: "FOUNDATION_PROGRAM",
      objectId: r.id,
      newValue: { code: input.code },
    }),
    (r) => ({
      ...eventBase(ctx, tenantId),
      type: FOUNDATION_EVENTS.PROGRAM_FUNDED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.PROGRAM_FUNDED,
      legalEntityId: null,
      subjectType: "FOUNDATION_PROGRAM",
      subjectId: r.id,
      classification: "CONFIDENTIAL" as const,
      payload: { code: input.code },
    }),
  );
}

export async function createProject(
  ctx: ServiceContext,
  input: {
    code: string;
    name: string;
    programId: string;
    foundationId: string;
    objectives?: string;
    geography?: string;
    budget?: string;
    currency?: string;
    startDate?: string;
    endDate?: string;
  },
) {
  const program = await getProgram(ctx.principal, input.programId);
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  if (program.tenantId !== foundation.tenantId) {
    throw new FoundationError("FORBIDDEN", "Program and foundation belong to different tenants");
  }
  if (input.budget) assertMoney(input.budget, "budget");
  const id = newId(ID_PREFIX.foundationProject);
  await db.insert(s.foundationProjects).values({
    id,
    tenantId: foundation.tenantId,
    programId: program.id,
    foundationId: foundation.id,
    code: input.code.trim(),
    name: input.name.trim(),
    objectives: input.objectives ?? null,
    geography: input.geography ?? null,
    budget: input.budget ?? null,
    currency: input.currency ?? "USD",
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    status: "PLANNED",
  });
  return { id };
}

export async function listProjects(principal: Principal, programId?: string) {
  const scope = await tenantScopeIds(principal);
  const where = programId
    ? and(eq(s.foundationProjects.programId, programId), inArray(s.foundationProjects.tenantId, scope))
    : inArray(s.foundationProjects.tenantId, scope);
  return db.select().from(s.foundationProjects).where(where);
}

export async function getProject(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.foundationProjects)
    .where(and(eq(s.foundationProjects.id, id), inArray(s.foundationProjects.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Project not found in your authorised scope");
  return row;
}

/* ==========================================================================
 * BENEFICIARIES (minimised, restricted)
 * ========================================================================== */

export async function registerBeneficiary(
  ctx: ServiceContext,
  input: { code: string; programId?: string; projectId?: string; cohort?: string },
) {
  const tenantId = ctx.principal.tenantId;
  await assertWithinScope(ctx.principal, tenantId);
  if (input.programId) await getProgram(ctx.principal, input.programId);
  if (input.projectId) await getProject(ctx.principal, input.projectId);
  const id = newId(ID_PREFIX.foundationBeneficiary);
  await db.insert(s.foundationBeneficiaries).values({
    id,
    tenantId,
    programId: input.programId ?? null,
    projectId: input.projectId ?? null,
    code: input.code.trim(),
    cohort: input.cohort ?? null,
    eligibilityStatus: "UNDER_REVIEW",
    consentStatus: "PENDING",
    status: "ACTIVE",
  });
  return { id };
}

export async function listBeneficiaries(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundationBeneficiaries).where(inArray(s.foundationBeneficiaries.tenantId, scope));
}

export async function recordBeneficiaryService(
  ctx: ServiceContext,
  input: { beneficiaryId: string; serviceType: string; providedAt: string; outcome?: string; providerRef?: string },
) {
  const scope = await tenantScopeIds(ctx.principal);
  const [beneficiary] = await db
    .select()
    .from(s.foundationBeneficiaries)
    .where(and(eq(s.foundationBeneficiaries.id, input.beneficiaryId), inArray(s.foundationBeneficiaries.tenantId, scope)))
    .limit(1);
  if (!beneficiary) throw new FoundationError("NOT_FOUND", "Beneficiary not found in your authorised scope");
  const id = newId(ID_PREFIX.beneficiaryService);
  await db.insert(s.beneficiaryServices).values({
    id,
    tenantId: beneficiary.tenantId,
    beneficiaryId: beneficiary.id,
    serviceType: input.serviceType,
    providedAt: input.providedAt,
    outcome: input.outcome ?? null,
    providerRef: input.providerRef ?? null,
  });
  return { id };
}

/* ==========================================================================
 * PROCUREMENT
 * ========================================================================== */

export async function registerSupplier(
  ctx: ServiceContext,
  input: { code: string; displayName: string; countryCode?: string; registrationRef?: string },
) {
  const tenantId = ctx.principal.tenantId;
  await assertWithinScope(ctx.principal, tenantId);
  const id = newId(ID_PREFIX.supplier);
  await db.insert(s.suppliers).values({
    id,
    tenantId,
    code: input.code.trim(),
    displayName: input.displayName.trim(),
    countryCode: input.countryCode ?? null,
    registrationRef: input.registrationRef ?? null,
    dueDiligenceStatus: "PENDING",
    status: "ACTIVE",
  });
  return { id };
}

export async function listSuppliers(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.suppliers).where(inArray(s.suppliers.tenantId, scope));
}

export async function createProcurement(
  ctx: ServiceContext,
  input: { code: string; title: string; foundationId: string; needStatement?: string; budgetAmount?: string; currency?: string },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  if (input.budgetAmount) assertMoney(input.budgetAmount, "budgetAmount");
  const id = newId(ID_PREFIX.procurement);
  await db.insert(s.procurements).values({
    id,
    tenantId: foundation.tenantId,
    foundationId: foundation.id,
    code: input.code.trim(),
    title: input.title.trim(),
    needStatement: input.needStatement ?? null,
    budgetAmount: input.budgetAmount ?? null,
    currency: input.currency ?? "USD",
    status: "NEED",
  });
  return { id };
}

export async function listProcurements(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.procurements).where(inArray(s.procurements.tenantId, scope));
}

export async function getProcurement(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.procurements)
    .where(and(eq(s.procurements.id, id), inArray(s.procurements.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Procurement not found in your authorised scope");
  return row;
}

export async function transitionProcurement(ctx: ServiceContext, id: string, to: ProcurementStatus, approvalRef?: string) {
  const current = await getProcurement(ctx.principal, id);
  const verdict = validateProcurementTransition(current.status as ProcurementStatus, to);
  if (!verdict.ok) throw new FoundationError("INVALID_TRANSITION", verdict.reason);
  if (verdict.rule.requiresApprovalRef && !approvalRef) {
    throw new FoundationError("APPROVAL_REQUIRED", `Transition ${current.status} → ${to} requires an approval reference`);
  }
  const [updated] = await db
    .update(s.procurements)
    .set({ status: to, approvalRef: approvalRef ?? current.approvalRef })
    .where(and(eq(s.procurements.id, id), eq(s.procurements.status, current.status)))
    .returning();
  if (!updated) throw new FoundationError("CONFLICT", "The procurement changed concurrently. Reload and retry.");
  return updated;
}

/* ==========================================================================
 * ASSETS
 * ========================================================================== */

export async function registerAsset(
  ctx: ServiceContext,
  input: {
    code: string;
    name: string;
    foundationId: string;
    assetType: string;
    acquisitionDate?: string;
    acquisitionValue?: string;
    currency?: string;
    donatedByDonorId?: string;
    location?: string;
    custodianRole?: string;
  },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  if (input.acquisitionValue) assertMoney(input.acquisitionValue, "acquisitionValue");
  const id = newId(ID_PREFIX.foundationAsset);
  await db.insert(s.foundationAssets).values({
    id,
    tenantId: foundation.tenantId,
    foundationId: foundation.id,
    code: input.code.trim(),
    name: input.name.trim(),
    assetType: input.assetType,
    acquisitionDate: input.acquisitionDate ?? null,
    acquisitionValue: input.acquisitionValue ?? null,
    currency: input.currency ?? "USD",
    donatedByDonorId: input.donatedByDonorId ?? null,
    location: input.location ?? null,
    custodianRole: input.custodianRole ?? null,
    status: "REGISTERED",
  });
  return { id };
}

export async function listAssets(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundationAssets).where(inArray(s.foundationAssets.tenantId, scope));
}

export async function getAsset(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.foundationAssets)
    .where(and(eq(s.foundationAssets.id, id), inArray(s.foundationAssets.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Asset not found in your authorised scope");
  return row;
}

export async function transitionAsset(ctx: ServiceContext, id: string, to: AssetStatus, approvalRef?: string) {
  const current = await getAsset(ctx.principal, id);
  const verdict = validateAssetTransition(current.status as AssetStatus, to);
  if (!verdict.ok) throw new FoundationError("INVALID_TRANSITION", verdict.reason);
  if (verdict.rule.requiresApprovalRef && !approvalRef) {
    throw new FoundationError("APPROVAL_REQUIRED", `Transition ${current.status} → ${to} requires an approval reference`);
  }
  const [updated] = await db
    .update(s.foundationAssets)
    .set({ status: to, disposalRef: to === "DISPOSED" ? (approvalRef ?? current.disposalRef) : current.disposalRef })
    .where(and(eq(s.foundationAssets.id, id), eq(s.foundationAssets.status, current.status)))
    .returning();
  if (!updated) throw new FoundationError("CONFLICT", "The asset changed concurrently. Reload and retry.");
  return updated;
}

/* ==========================================================================
 * INVESTMENTS (no autonomous material execution — approval is human)
 * ========================================================================== */

export async function createInvestmentPolicy(
  ctx: ServiceContext,
  input: {
    code: string;
    title: string;
    foundationId: string;
    assetAllocation?: Record<string, unknown>;
    liquidityRequirement?: string;
    riskAppetite?: string;
    concentrationLimits?: string;
    prohibitedInstruments?: string;
    approvalRef?: string;
    effectiveFrom?: string;
  },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  const id = newId(ID_PREFIX.foundationInvestmentPolicy);
  await db.insert(s.foundationInvestmentPolicies).values({
    id,
    tenantId: foundation.tenantId,
    foundationId: foundation.id,
    code: input.code.trim(),
    title: input.title.trim(),
    assetAllocation: input.assetAllocation ?? {},
    liquidityRequirement: input.liquidityRequirement ?? null,
    riskAppetite: input.riskAppetite ?? null,
    concentrationLimits: input.concentrationLimits ?? null,
    prohibitedInstruments: input.prohibitedInstruments ?? null,
    approvalRef: input.approvalRef ?? null,
    status: input.approvalRef ? "ACTIVE" : "DRAFT",
    effectiveFrom: input.effectiveFrom ?? null,
  });
  return { id };
}

export async function listInvestmentPolicies(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundationInvestmentPolicies).where(inArray(s.foundationInvestmentPolicies.tenantId, scope));
}

export async function proposeInvestment(
  ctx: ServiceContext,
  input: {
    code: string;
    instrument: string;
    foundationId: string;
    policyId?: string;
    fundId?: string;
    counterparty?: string;
    principalAmount: string;
    currency?: string;
    expectedReturnPct?: string;
    maturityDate?: string;
  },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  assertMoney(input.principalAmount, "principalAmount");
  const id = newId(ID_PREFIX.foundationInvestment);
  await db.insert(s.foundationInvestments).values({
    id,
    tenantId: foundation.tenantId,
    foundationId: foundation.id,
    policyId: input.policyId ?? null,
    fundId: input.fundId ?? null,
    code: input.code.trim(),
    instrument: input.instrument,
    counterparty: input.counterparty ?? null,
    principalAmount: input.principalAmount,
    currency: input.currency ?? "USD",
    expectedReturnPct: input.expectedReturnPct ?? null,
    maturityDate: input.maturityDate ?? null,
    status: "PROPOSED",
  });
  return { id };
}

export async function approveInvestment(ctx: ServiceContext, id: string, approvalRef: string) {
  const scope = await tenantScopeIds(ctx.principal);
  const [row] = await db
    .select()
    .from(s.foundationInvestments)
    .where(and(eq(s.foundationInvestments.id, id), inArray(s.foundationInvestments.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Investment not found in your authorised scope");
  if (row.status !== "PROPOSED") throw new FoundationError("INVALID_TRANSITION", `Only PROPOSED investments can be approved; current status is ${row.status}`);
  if (!approvalRef) throw new FoundationError("APPROVAL_REQUIRED", "Investment approval requires a governance approval reference");
  const [updated] = await db
    .update(s.foundationInvestments)
    .set({ status: "APPROVED", approvalRef })
    .where(and(eq(s.foundationInvestments.id, id), eq(s.foundationInvestments.status, "PROPOSED")))
    .returning();
  if (!updated) throw new FoundationError("CONFLICT", "The investment changed concurrently. Reload and retry.");
  return updated;
}

export async function listInvestments(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundationInvestments).where(inArray(s.foundationInvestments.tenantId, scope));
}

/* ==========================================================================
 * SAFEGUARDING (highly restricted)
 * ========================================================================== */

export async function reportSafeguardingCase(
  ctx: ServiceContext,
  input: { code: string; foundationId: string; caseType: string; summary: string; reporterRef?: string },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  const id = newId(ID_PREFIX.safeguarding);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.safeguardingCases).values({
        id,
        tenantId: foundation.tenantId,
        foundationId: foundation.id,
        code: input.code.trim(),
        caseType: input.caseType,
        summary: input.summary,
        reporterRef: input.reporterRef ?? null,
        status: "REPORTED",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, foundation.tenantId),
      action: "foundation.safeguarding.report",
      objectType: "SAFEGUARDING_CASE",
      objectId: r.id,
      newValue: { code: input.code, caseType: input.caseType },
    }),
    (r) => ({
      ...eventBase(ctx, foundation.tenantId),
      type: FOUNDATION_EVENTS.SAFEGUARDING_REPORTED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.SAFEGUARDING_REPORTED,
      legalEntityId: foundation.legalEntityId,
      subjectType: "SAFEGUARDING_CASE",
      subjectId: r.id,
      classification: "HIGHLY_RESTRICTED" as const,
      payload: { code: input.code, foundationId: foundation.id },
    }),
  );
}

export async function listSafeguardingCases(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.safeguardingCases).where(inArray(s.safeguardingCases.tenantId, scope));
}

export async function getSafeguardingCase(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.safeguardingCases)
    .where(and(eq(s.safeguardingCases.id, id), inArray(s.safeguardingCases.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Safeguarding case not found in your authorised scope");
  return row;
}

export async function transitionSafeguardingCase(
  ctx: ServiceContext,
  id: string,
  to: SafeguardingStatus,
  input?: { investigatorRole?: string; correctiveAction?: string; approvalRef?: string },
) {
  const current = await getSafeguardingCase(ctx.principal, id);
  const verdict = validateSafeguardingTransition(current.status as SafeguardingStatus, to);
  if (!verdict.ok) throw new FoundationError("INVALID_TRANSITION", verdict.reason);
  if (verdict.rule.requiresApprovalRef && !input?.approvalRef) {
    throw new FoundationError("APPROVAL_REQUIRED", `Transition ${current.status} → ${to} requires an approval reference`);
  }
  const [updated] = await db
    .update(s.safeguardingCases)
    .set({
      status: to,
      investigatorRole: input?.investigatorRole ?? current.investigatorRole,
      correctiveAction: input?.correctiveAction ?? current.correctiveAction,
      closedAt: to === "CLOSED" ? new Date() : current.closedAt,
    })
    .where(and(eq(s.safeguardingCases.id, id), eq(s.safeguardingCases.status, current.status)))
    .returning();
  if (!updated) throw new FoundationError("CONFLICT", "The case changed concurrently. Reload and retry.");
  return updated;
}

/* ==========================================================================
 * IMPACT (INPUT → ACTIVITY → OUTPUT → OUTCOME → IMPACT)
 * ========================================================================== */

export async function createImpactMetric(
  ctx: ServiceContext,
  input: {
    code: string;
    name: string;
    level: string;
    unit: string;
    programId?: string;
    projectId?: string;
    grantId?: string;
    baseline?: string;
    target?: string;
    geography?: string;
    beneficiaryScope?: string;
  },
) {
  const tenantId = ctx.principal.tenantId;
  await assertWithinScope(ctx.principal, tenantId);
  if (!["INPUT", "ACTIVITY", "OUTPUT", "OUTCOME", "IMPACT"].includes(input.level)) {
    throw new FoundationError("VALIDATION_FAILED", `Unknown impact level ${input.level}`);
  }
  if (input.programId) await getProgram(ctx.principal, input.programId);
  if (input.projectId) await getProject(ctx.principal, input.projectId);
  if (input.grantId) await getGrant(ctx.principal, input.grantId);
  const id = newId(ID_PREFIX.foundationImpactMetric);
  await db.insert(s.foundationImpactMetrics).values({
    id,
    tenantId,
    programId: input.programId ?? null,
    projectId: input.projectId ?? null,
    grantId: input.grantId ?? null,
    code: input.code.trim(),
    name: input.name.trim(),
    level: input.level,
    unit: input.unit,
    baseline: input.baseline ?? null,
    target: input.target ?? null,
    geography: input.geography ?? null,
    beneficiaryScope: input.beneficiaryScope ?? null,
    status: "ACTIVE",
  });
  return { id };
}

export async function listImpactMetrics(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundationImpactMetrics).where(inArray(s.foundationImpactMetrics.tenantId, scope));
}

export async function recordImpactMeasurement(
  ctx: ServiceContext,
  input: { metricId: string; period: string; actual: string; evidenceDocumentId?: string },
) {
  const scope = await tenantScopeIds(ctx.principal);
  const [metric] = await db
    .select()
    .from(s.foundationImpactMetrics)
    .where(and(eq(s.foundationImpactMetrics.id, input.metricId), inArray(s.foundationImpactMetrics.tenantId, scope)))
    .limit(1);
  if (!metric) throw new FoundationError("NOT_FOUND", "Impact metric not found in your authorised scope");
  if (!/^-?\d+(\.\d{1,4})?$/.test(input.actual)) {
    throw new FoundationError("VALIDATION_FAILED", "actual must be a decimal with at most 4 places");
  }
  const id = newId(ID_PREFIX.foundationImpactMeasurement);
  await db.insert(s.foundationImpactMeasurements).values({
    id,
    tenantId: metric.tenantId,
    metricId: metric.id,
    period: input.period,
    actual: input.actual,
    evidenceDocumentId: input.evidenceDocumentId ?? null,
    recordedBy: ctx.principal.userId,
  });
  return { id };
}

/* ==========================================================================
 * WORKFORCE ASSIGNMENTS (contextual; the worker stays in canonical HCM)
 * ========================================================================== */

export async function createWorkforceAssignment(
  ctx: ServiceContext,
  input: {
    employeeId: string;
    foundationId: string;
    programId?: string;
    projectId?: string;
    grantId?: string;
    assignmentType: string;
    roleTitle: string;
    responsibilityScope?: string;
    effectiveFrom: string;
    effectiveTo?: string;
  },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  const scope = await tenantScopeIds(ctx.principal);
  const [employee] = await db
    .select()
    .from(s.employees)
    .where(and(eq(s.employees.id, input.employeeId), inArray(s.employees.tenantId, scope)))
    .limit(1);
  if (!employee) throw new FoundationError("NOT_FOUND", "Employee not found in your authorised scope (canonical HCM)");
  if (employee.status === "TERMINATED") {
    throw new FoundationError("CONFLICT", "Terminated workers cannot receive new foundation assignments");
  }
  if (!["FOUNDATION", "PROGRAM", "PROJECT", "GRANT", "COMPLIANCE", "SAFEGUARDING", "BOARD", "FIELD"].includes(input.assignmentType)) {
    throw new FoundationError("VALIDATION_FAILED", `Unknown assignment type ${input.assignmentType}`);
  }
  const id = newId(ID_PREFIX.foundationAssignment);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.foundationWorkforceAssignments).values({
        id,
        tenantId: foundation.tenantId,
        employeeId: employee.id,
        foundationId: foundation.id,
        programId: input.programId ?? null,
        projectId: input.projectId ?? null,
        grantId: input.grantId ?? null,
        assignmentType: input.assignmentType,
        roleTitle: input.roleTitle,
        responsibilityScope: input.responsibilityScope ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        status: "ACTIVE",
      });
      return { id };
    },
    (r) => ({
      ...auditBase(ctx, foundation.tenantId),
      action: "foundation.assignment.create",
      objectType: "FOUNDATION_WORKFORCE_ASSIGNMENT",
      objectId: r.id,
      newValue: { employeeId: employee.id, assignmentType: input.assignmentType },
    }),
    (r) => ({
      ...eventBase(ctx, foundation.tenantId),
      type: FOUNDATION_EVENTS.BOARD_MEMBER_APPOINTED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.BOARD_MEMBER_APPOINTED,
      legalEntityId: null,
      subjectType: "FOUNDATION_WORKFORCE_ASSIGNMENT",
      subjectId: r.id,
      classification: "CONFIDENTIAL" as const,
      payload: { employeeId: employee.id, foundationId: foundation.id, assignmentType: input.assignmentType },
    }),
  );
}

export async function listWorkforceAssignments(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundationWorkforceAssignments).where(inArray(s.foundationWorkforceAssignments.tenantId, scope));
}
