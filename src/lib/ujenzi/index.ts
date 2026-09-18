/**
 * UJENZI OS — construction sector operational domain.
 *
 * Owns construction operational records: projects, sites, phases, milestones,
 * governed BOQ versions, cost records (ESTIMATE / BUDGET / COMMITTED /
 * ACTUAL / FORECAST), procurement, materials, equipment, site diaries,
 * quality (inspection requests, NCRs), HSE, variations, claims, payment
 * certificates and handover punch lists.
 *
 * Does NOT own identity, HCM, journals, treasury, capital execution,
 * documents, approvals, notifications or AI identity — those remain canonical
 * BEYU shared capabilities.
 *
 * Finance OS remains the only journal writer. CAP_POSTING stays LOCKED.
 * Certifying a payment certificate emits PAYMENT_CERTIFIED and never posts a
 * journal; approving a purchase order records a Ujenzi COMMITTED cost line
 * (project-control truth) and never touches the ledger.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction, type EventInput } from "@/lib/audit";
import type { Classification } from "@/lib/constants";
import { UjenziDomainError } from "./errors";

export { UjenziDomainError } from "./errors";

export type UjenziActor = {
  tenantId: string;
  userId: string;
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function ujenziId(): string {
  return newId(ID_PREFIX.ujenzi);
}

const UJENZI_SECTOR_CODE = "CONSTRUCTION";

export const UJENZI_COST_KINDS = ["ESTIMATE", "BUDGET", "COMMITTED", "ACTUAL", "FORECAST"] as const;
export type UjenziCostKind = (typeof UJENZI_COST_KINDS)[number];

function assertActorTenant(actor: UjenziActor | undefined, tenantId: string) {
  if (actor && actor.tenantId !== tenantId) {
    throw new UjenziDomainError("SCOPE", "Ujenzi actor tenant does not match the record tenant");
  }
}

/**
 * A Ujenzi write may only bind a legal entity that (a) exists, (b) belongs to
 * the record tenant, (c) carries the CONSTRUCTION sector code, and (d) — when
 * a country is supplied — sits in the entity's jurisdiction. This is the
 * entity + country isolation boundary for construction records.
 */
async function assertUjenziLegalEntity(tenantId: string, legalEntityId: string, countryCode?: string) {
  const [entity] = await db
    .select({
      id: s.legalEntities.id,
      tenantId: s.legalEntities.tenantId,
      sectorCode: s.legalEntities.sectorCode,
      countryCode: s.legalEntities.countryCode,
    })
    .from(s.legalEntities)
    .where(eq(s.legalEntities.id, legalEntityId))
    .limit(1);
  if (!entity) throw new UjenziDomainError("NOT_FOUND", "Legal entity not found");
  if (entity.tenantId !== tenantId) {
    throw new UjenziDomainError("SCOPE", "Legal entity is outside the principal tenant");
  }
  if (entity.sectorCode !== UJENZI_SECTOR_CODE) {
    throw new UjenziDomainError("SCOPE", "Ujenzi OS writes require a construction legal entity");
  }
  if (countryCode && entity.countryCode && countryCode !== entity.countryCode) {
    throw new UjenziDomainError("SCOPE", "Country is outside the legal entity jurisdiction");
  }
}

/** Resolve a project inside the tenant. Cross-tenant IDs are NOT_FOUND. */
async function getProject(projectId: string, tenantId: string) {
  const [project] = await db
    .select()
    .from(s.ujenziProjects)
    .where(and(eq(s.ujenziProjects.id, projectId), eq(s.ujenziProjects.tenantId, tenantId)))
    .limit(1);
  if (!project) throw new UjenziDomainError("NOT_FOUND", "Project not found");
  return project;
}

function auditBase(
  actor: UjenziActor,
  action: string,
  objectType: string,
  objectId: string,
  newValue: Record<string, unknown>,
) {
  return {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    actorType: "HUMAN" as const,
    action,
    objectType,
    objectId,
    outcome: "SUCCESS" as const,
    authority: "ujenzi:data.manage",
    newValue,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    traceId: actor.traceId,
  };
}

function ujenziEvent(input: {
  type: string;
  operation: string;
  subjectType: string;
  subjectId: string;
  tenantId: string;
  legalEntityId?: string | null;
  actor?: UjenziActor | null;
  payload?: Record<string, unknown>;
  traceId?: string;
}): EventInput {
  return {
    type: input.type,
    source: "beyu-os/ujenzi",
    domain: "UJENZI",
    operation: input.operation,
    destinationDomain: null,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId ?? null,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    actorUserId: input.actor?.userId ?? null,
    actorType: input.actor ? "HUMAN" : "SERVICE",
    classification: "INTERNAL" as Classification,
    payload: input.payload,
    traceId: input.traceId ?? input.actor?.traceId ?? `TRACEUJZ${Date.now()}`,
    correlationId: input.traceId ?? input.actor?.traceId ?? `TRACEUJZ${Date.now()}`,
    causationId: null,
    authorityContext: {
      authorityId: null,
      decisionId: null,
      capabilityCode: null,
      permissionCode: "ujenzi:data.manage",
      policyVersion: null,
    },
    policyVersion: null,
  };
}

/* ------------------------------ projects ------------------------------ */

export interface CreateProjectInput {
  tenantId: string;
  legalEntityId: string;
  code: string;
  name: string;
  countryCode: string;
  client?: string;
  contractRef?: string;
  contractValue?: string;
  currency?: string;
  status?: string;
  region?: string;
  location?: string;
  startDate?: string;
  plannedEndDate?: string;
  notes?: string;
}

export async function createProject(input: CreateProjectInput, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  await assertUjenziLegalEntity(input.tenantId, input.legalEntityId, input.countryCode);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziProjects).values({
      id,
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      code: input.code,
      name: input.name,
      countryCode: input.countryCode,
      client: input.client,
      contractRef: input.contractRef,
      contractValue: input.contractValue,
      currency: input.currency ?? "TZS",
      status: input.status ?? "PLANNED",
      region: input.region,
      location: input.location,
      startDate: input.startDate,
      plannedEndDate: input.plannedEndDate,
      notes: input.notes,
    });
    return { id, status: input.status ?? "PLANNED" };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.projects.create", "UJENZI_PROJECT", result.id, {
      code: input.code,
      name: input.name,
      countryCode: input.countryCode,
      legalEntityId: input.legalEntityId,
    }),
    (result) =>
      ujenziEvent({
        type: "PROJECT_CREATED",
        operation: "CREATE_PROJECT",
        subjectType: "UJENZI_PROJECT",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        actor,
        payload: { code: input.code, name: input.name, contractRef: input.contractRef ?? null },
      }),
  );
}

export async function listProjects(tenantId: string) {
  return db.select().from(s.ujenziProjects).where(eq(s.ujenziProjects.tenantId, tenantId));
}

export async function getProjectScoped(projectId: string, tenantId: string) {
  return getProject(projectId, tenantId);
}

/**
 * Generic governed insert for simple Ujenzi rows (sites, phases, milestones,
 * allocations …). Tenant comes from the ACTOR, never from client input; a
 * legalEntityId, when the table carries one, is verified against the
 * construction sector boundary.
 */
export async function insertUjenziRow(
  table: unknown,
  values: Record<string, unknown>,
  actor: UjenziActor,
  action: string,
  objectType: string,
) {
  if (typeof values.legalEntityId === "string") {
    await assertUjenziLegalEntity(
      actor.tenantId,
      values.legalEntityId,
      typeof values.countryCode === "string" ? values.countryCode : undefined,
    );
  }
  if (typeof values.projectId === "string") {
    await getProject(values.projectId, actor.tenantId);
  }
  const id = typeof values.id === "string" ? values.id : ujenziId();
  const row: Record<string, unknown> = { ...values, id, tenantId: actor.tenantId };
  if (typeof row.createdAt === "string") row.createdAt = new Date(row.createdAt);
  if (typeof row.updatedAt === "string") row.updatedAt = new Date(row.updatedAt);
  return withAuditTransaction(
    async () => {
      await db.insert(table as typeof s.ujenziProjects).values(row as never);
      return { id };
    },
    () => auditBase(actor, action, objectType, id, row),
  );
}

export async function handoverProject(input: { tenantId: string; projectId: string }, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  if (project.status === "HANDED_OVER") {
    throw new UjenziDomainError("INVALID_STATE", "Project is already handed over");
  }
  const [openPunch] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.ujenziPunchItems)
    .where(
      and(
        eq(s.ujenziPunchItems.tenantId, input.tenantId),
        eq(s.ujenziPunchItems.projectId, input.projectId),
        sql`${s.ujenziPunchItems.status} IN ('OPEN','IN_PROGRESS')`,
      ),
    );
  if (Number(openPunch?.n ?? 0) > 0) {
    throw new UjenziDomainError("INVALID_STATE", "Handover is blocked while punch items remain open", {
      openPunchItems: Number(openPunch?.n ?? 0),
    });
  }
  const write = async () => {
    await db
      .update(s.ujenziProjects)
      .set({ status: "HANDED_OVER", actualEndDate: project.actualEndDate ?? new Date().toISOString().slice(0, 10), updatedAt: new Date() })
      .where(and(eq(s.ujenziProjects.id, input.projectId), eq(s.ujenziProjects.tenantId, input.tenantId)));
    return { id: input.projectId, status: "HANDED_OVER" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.projects.handover", "UJENZI_PROJECT", result.id, { status: "HANDED_OVER" }),
    (result) =>
      ujenziEvent({
        type: "PROJECT_HANDED_OVER",
        operation: "HANDOVER_PROJECT",
        subjectType: "UJENZI_PROJECT",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { code: project.code },
      }),
  );
}

/* --------------------------------- BOQ -------------------------------- */

export interface CreateBoqInput {
  tenantId: string;
  projectId: string;
  notes?: string;
  currency?: string;
}

/**
 * Create the next governed BOQ version for a project. Version numbers are
 * sequential per project; approving a version supersedes the previous approved
 * one without mutating it (historical project-control records are never
 * overwritten).
 */
export async function createBoq(input: CreateBoqInput, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  const [maxVersion] = await db
    .select({ v: sql<number>`coalesce(max(${s.ujenziBoqs.version}), 0)::int` })
    .from(s.ujenziBoqs)
    .where(and(eq(s.ujenziBoqs.tenantId, input.tenantId), eq(s.ujenziBoqs.projectId, input.projectId)));
  const version = Number(maxVersion?.v ?? 0) + 1;
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziBoqs).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      version,
      status: "DRAFT",
      currency: input.currency ?? project.currency,
      notes: input.notes,
    });
    return { id, version };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.boqs.create", "UJENZI_BOQ", result.id, { version, projectId: input.projectId }),
    (result) =>
      ujenziEvent({
        type: "BOQ_CREATED",
        operation: "CREATE_BOQ",
        subjectType: "UJENZI_BOQ",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { version, projectId: input.projectId },
      }),
  );
}

export interface AddBoqItemInput {
  tenantId: string;
  boqId: string;
  code: string;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
  section?: string;
  costCode?: string;
}

/** Items may only be authored while a BOQ version is DRAFT or SUBMITTED. */
export async function addBoqItem(input: AddBoqItemInput, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const [boq] = await db
    .select()
    .from(s.ujenziBoqs)
    .where(and(eq(s.ujenziBoqs.id, input.boqId), eq(s.ujenziBoqs.tenantId, input.tenantId)))
    .limit(1);
  if (!boq) throw new UjenziDomainError("NOT_FOUND", "BOQ not found");
  if (boq.status === "APPROVED" || boq.status === "SUPERSEDED") {
    throw new UjenziDomainError("INVALID_STATE", "Approved BOQ versions are immutable; author a new version instead");
  }
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziBoqItems).values({
      id,
      tenantId: input.tenantId,
      boqId: input.boqId,
      code: input.code,
      description: input.description,
      section: input.section,
      unit: input.unit,
      quantity: input.quantity,
      rate: input.rate,
      costCode: input.costCode,
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () =>
    auditBase(actor, "ujenzi.boqItems.add", "UJENZI_BOQ_ITEM", id, {
      boqId: input.boqId,
      code: input.code,
      quantity: input.quantity,
      rate: input.rate,
    }),
  );
}

/**
 * Approve a BOQ version: it becomes the project's approved BOQ, the previous
 * approved version is SUPERSEDED (never deleted or mutated item-wise), and the
 * version total is derived from its items. Approval is an audited, governed
 * transition — not a silent edit.
 */
export async function approveBoq(input: { tenantId: string; boqId: string }, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const [boq] = await db
    .select()
    .from(s.ujenziBoqs)
    .where(and(eq(s.ujenziBoqs.id, input.boqId), eq(s.ujenziBoqs.tenantId, input.tenantId)))
    .limit(1);
  if (!boq) throw new UjenziDomainError("NOT_FOUND", "BOQ not found");
  if (boq.status === "APPROVED") throw new UjenziDomainError("INVALID_STATE", "BOQ version is already approved");
  if (boq.status === "SUPERSEDED") throw new UjenziDomainError("INVALID_STATE", "Superseded BOQ versions cannot be approved");
  const project = await getProject(boq.projectId, input.tenantId);
  const write = async () => {
    // Supersede the currently approved version (if any) without touching it otherwise.
    await db
      .update(s.ujenziBoqs)
      .set({ status: "SUPERSEDED", updatedAt: new Date() })
      .where(
        and(
          eq(s.ujenziBoqs.tenantId, input.tenantId),
          eq(s.ujenziBoqs.projectId, boq.projectId),
          eq(s.ujenziBoqs.status, "APPROVED"),
        ),
      );
    const [total] = await db
      .select({ sum: sql<string>`coalesce(sum(${s.ujenziBoqItems.quantity} * ${s.ujenziBoqItems.rate}), 0)::text` })
      .from(s.ujenziBoqItems)
      .where(and(eq(s.ujenziBoqItems.tenantId, input.tenantId), eq(s.ujenziBoqItems.boqId, input.boqId)));
    await db
      .update(s.ujenziBoqs)
      .set({ status: "APPROVED", totalValue: total?.sum ?? "0", approvedBy: actor?.userId ?? null, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.ujenziBoqs.id, input.boqId), eq(s.ujenziBoqs.tenantId, input.tenantId)));
    return { id: input.boqId, status: "APPROVED" as const, totalValue: total?.sum ?? "0" };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.boqs.approve", "UJENZI_BOQ", result.id, { status: "APPROVED", totalValue: result.totalValue }),
    (result) =>
      ujenziEvent({
        type: "BOQ_APPROVED",
        operation: "APPROVE_BOQ",
        subjectType: "UJENZI_BOQ",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { version: boq.version, projectId: boq.projectId, totalValue: result.totalValue },
      }),
  );
}

/* ----------------------------- cost records ---------------------------- */

export interface RecordCostInput {
  tenantId: string;
  projectId: string;
  kind: UjenziCostKind;
  amount: string;
  currency?: string;
  costCode?: string;
  description?: string;
  sourceType?: string;
  sourceId?: string;
  eventDate?: string;
}

/**
 * Record one of the five project-control cost kinds. This is Ujenzi
 * project-control truth ONLY: Finance OS remains the canonical financial
 * truth and no journal is ever posted from here.
 */
export async function recordCost(input: RecordCostInput, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  if (!UJENZI_COST_KINDS.includes(input.kind)) {
    throw new UjenziDomainError("INVALID_STATE", "kind must be one of ESTIMATE, BUDGET, COMMITTED, ACTUAL, FORECAST");
  }
  const project = await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziCostRecords).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      kind: input.kind,
      amount: input.amount,
      currency: input.currency ?? project.currency,
      costCode: input.costCode,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      eventDate: input.eventDate ?? new Date().toISOString().slice(0, 10),
      recordedBy: actor?.userId ?? null,
    });
    return { id, journalsPosted: false as const };
  };
  if (!actor) return write();
  return withAuditTransaction(write, (result) =>
    auditBase(actor, "ujenzi.costRecords.record", "UJENZI_COST_RECORD", result.id, {
      kind: input.kind,
      amount: input.amount,
      projectId: input.projectId,
      journalsPosted: false,
    }),
  );
}

/* ------------------------------ procurement ---------------------------- */

export interface CreateRequisitionInput {
  tenantId: string;
  projectId: string;
  code: string;
  description: string;
  requiredBy?: string;
}

export async function createRequisition(input: CreateRequisitionInput, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziRequisitions).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      description: input.description,
      requiredBy: input.requiredBy,
      status: "SUBMITTED",
      requestedBy: actor?.userId ?? null,
    });
    return { id, status: "SUBMITTED" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.requisitions.create", "UJENZI_REQUISITION", result.id, { code: input.code }),
    (result) =>
      ujenziEvent({
        type: "PROCUREMENT_REQUESTED",
        operation: "CREATE_REQUISITION",
        subjectType: "UJENZI_REQUISITION",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { code: input.code, projectId: input.projectId },
      }),
  );
}

export async function approveRequisition(input: { tenantId: string; requisitionId: string }, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const [requisition] = await db
    .select()
    .from(s.ujenziRequisitions)
    .where(and(eq(s.ujenziRequisitions.id, input.requisitionId), eq(s.ujenziRequisitions.tenantId, input.tenantId)))
    .limit(1);
  if (!requisition) throw new UjenziDomainError("NOT_FOUND", "Requisition not found");
  if (requisition.status !== "SUBMITTED") {
    throw new UjenziDomainError("INVALID_STATE", `Requisition is ${requisition.status}, not SUBMITTED`);
  }
  const write = async () => {
    await db
      .update(s.ujenziRequisitions)
      .set({ status: "APPROVED", approvedBy: actor?.userId ?? null, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.ujenziRequisitions.id, input.requisitionId), eq(s.ujenziRequisitions.tenantId, input.tenantId)));
    return { id: input.requisitionId, status: "APPROVED" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(write, (result) =>
    auditBase(actor, "ujenzi.requisitions.approve", "UJENZI_REQUISITION", result.id, { status: "APPROVED" }),
  );
}

export interface CreatePurchaseOrderInput {
  tenantId: string;
  projectId: string;
  requisitionId?: string;
  code: string;
  supplierName?: string;
  description?: string;
  amount?: string;
  currency?: string;
  orderDate?: string;
  expectedDelivery?: string;
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  if (input.requisitionId) {
    const [requisition] = await db
      .select()
      .from(s.ujenziRequisitions)
      .where(and(eq(s.ujenziRequisitions.id, input.requisitionId), eq(s.ujenziRequisitions.tenantId, input.tenantId)))
      .limit(1);
    if (!requisition) throw new UjenziDomainError("NOT_FOUND", "Requisition not found");
    if (requisition.projectId !== input.projectId) {
      throw new UjenziDomainError("SCOPE", "Requisition belongs to a different project");
    }
  }
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziPurchaseOrders).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      requisitionId: input.requisitionId,
      code: input.code,
      supplierName: input.supplierName,
      description: input.description,
      amount: input.amount,
      currency: input.currency ?? project.currency,
      status: "DRAFT",
      orderDate: input.orderDate,
      expectedDelivery: input.expectedDelivery,
    });
    return { id, status: "DRAFT" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(write, (result) =>
    auditBase(actor, "ujenzi.purchaseOrders.create", "UJENZI_PURCHASE_ORDER", result.id, { code: input.code, amount: input.amount ?? null }),
  );
}

/**
 * Approve a purchase order. This is a governed procurement transition: it
 * emits PURCHASE_ORDER_APPROVED and records a COMMITTED cost line (Ujenzi
 * project-control truth). It never posts a journal — Finance OS integration
 * remains the governed handoff.
 */
export async function approvePurchaseOrder(input: { tenantId: string; purchaseOrderId: string }, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const [po] = await db
    .select()
    .from(s.ujenziPurchaseOrders)
    .where(and(eq(s.ujenziPurchaseOrders.id, input.purchaseOrderId), eq(s.ujenziPurchaseOrders.tenantId, input.tenantId)))
    .limit(1);
  if (!po) throw new UjenziDomainError("NOT_FOUND", "Purchase order not found");
  if (po.status !== "DRAFT") throw new UjenziDomainError("INVALID_STATE", `Purchase order is ${po.status}, not DRAFT`);
  const project = await getProject(po.projectId, input.tenantId);
  const costId = ujenziId();
  const write = async () => {
    await db
      .update(s.ujenziPurchaseOrders)
      .set({ status: "APPROVED", approvedBy: actor?.userId ?? null, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.ujenziPurchaseOrders.id, input.purchaseOrderId), eq(s.ujenziPurchaseOrders.tenantId, input.tenantId)));
    if (po.amount) {
      await db.insert(s.ujenziCostRecords).values({
        id: costId,
        tenantId: input.tenantId,
        projectId: po.projectId,
        kind: "COMMITTED",
        amount: po.amount,
        currency: po.currency,
        description: `Purchase order ${po.code}`,
        sourceType: "PURCHASE_ORDER",
        sourceId: po.id,
        eventDate: new Date().toISOString().slice(0, 10),
        recordedBy: actor?.userId ?? null,
      });
    }
    return { id: input.purchaseOrderId, status: "APPROVED" as const, journalsPosted: false as const };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.purchaseOrders.approve", "UJENZI_PURCHASE_ORDER", result.id, { status: "APPROVED", journalsPosted: false }),
    (result) =>
      ujenziEvent({
        type: "PURCHASE_ORDER_APPROVED",
        operation: "APPROVE_PURCHASE_ORDER",
        subjectType: "UJENZI_PURCHASE_ORDER",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { code: po.code, amount: po.amount, committedCostRecordId: po.amount ? costId : null, journalsPosted: false },
      }),
  );
}

/* ------------------------------- materials ----------------------------- */

export async function createMaterial(
  input: { tenantId: string; code: string; name: string; category?: string; unit?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziMaterialCatalog).values({
      id,
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      category: input.category,
      unit: input.unit ?? "UNIT",
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () => auditBase(actor, "ujenzi.materials.create", "UJENZI_MATERIAL", id, { code: input.code }));
}

export interface RecordMovementInput {
  tenantId: string;
  projectId: string;
  siteId?: string;
  materialId: string;
  movementType: "RECEIPT" | "ISSUE" | "RETURN" | "WASTAGE";
  quantity: string;
  unit: string;
  unitCost?: string;
  reference?: string;
  movedOn?: string;
}

export async function recordMaterialMovement(input: RecordMovementInput, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  const [material] = await db
    .select()
    .from(s.ujenziMaterialCatalog)
    .where(and(eq(s.ujenziMaterialCatalog.id, input.materialId), eq(s.ujenziMaterialCatalog.tenantId, input.tenantId)))
    .limit(1);
  if (!material) throw new UjenziDomainError("NOT_FOUND", "Material not found");
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziMaterialMovements).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      siteId: input.siteId,
      materialId: input.materialId,
      movementType: input.movementType,
      quantity: input.quantity,
      unit: input.unit,
      unitCost: input.unitCost,
      reference: input.reference,
      movedBy: actor?.userId ?? null,
      movedOn: input.movedOn ?? new Date().toISOString().slice(0, 10),
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    () => auditBase(actor, "ujenzi.materials.move", "UJENZI_MATERIAL_MOVEMENT", id, {
      movementType: input.movementType,
      quantity: input.quantity,
      materialId: input.materialId,
    }),
    input.movementType === "RECEIPT"
      ? (result) =>
          ujenziEvent({
            type: "MATERIAL_RECEIVED",
            operation: "RECORD_MATERIAL_MOVEMENT",
            subjectType: "UJENZI_MATERIAL_MOVEMENT",
            subjectId: result.id,
            tenantId: input.tenantId,
            legalEntityId: project.legalEntityId,
            actor,
            payload: { materialId: input.materialId, quantity: input.quantity, projectId: input.projectId },
          })
      : undefined,
  );
}

/* ------------------------------- equipment ----------------------------- */

export async function createEquipment(
  input: { tenantId: string; code: string; name: string; equipmentType?: string; ownership?: string; legalEntityId?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  if (input.legalEntityId) {
    await assertUjenziLegalEntity(input.tenantId, input.legalEntityId);
  }
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziEquipment).values({
      id,
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      code: input.code,
      name: input.name,
      equipmentType: input.equipmentType,
      ownership: input.ownership ?? "OWNED",
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () => auditBase(actor, "ujenzi.equipment.create", "UJENZI_EQUIPMENT", id, { code: input.code }));
}

export async function allocateEquipment(
  input: { tenantId: string; equipmentId: string; projectId: string; allocatedFrom?: string; allocatedTo?: string; notes?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  await getProject(input.projectId, input.tenantId);
  const [equipment] = await db
    .select()
    .from(s.ujenziEquipment)
    .where(and(eq(s.ujenziEquipment.id, input.equipmentId), eq(s.ujenziEquipment.tenantId, input.tenantId)))
    .limit(1);
  if (!equipment) throw new UjenziDomainError("NOT_FOUND", "Equipment not found");
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziEquipmentAllocations).values({
      id,
      tenantId: input.tenantId,
      equipmentId: input.equipmentId,
      projectId: input.projectId,
      allocatedFrom: input.allocatedFrom,
      allocatedTo: input.allocatedTo,
      notes: input.notes,
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () =>
    auditBase(actor, "ujenzi.equipment.allocate", "UJENZI_EQUIPMENT_ALLOCATION", id, { equipmentId: input.equipmentId, projectId: input.projectId }),
  );
}

/* ---------------------------- site operations --------------------------- */

export interface RecordSiteDiaryInput {
  tenantId: string;
  projectId: string;
  siteId?: string;
  diaryDate: string;
  weather?: string;
  labourCount?: number;
  labourHours?: string;
  workDone?: string;
  hindrances?: string;
}

export async function recordSiteDiary(input: RecordSiteDiaryInput, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziSiteDiaries).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      siteId: input.siteId,
      diaryDate: input.diaryDate,
      weather: input.weather,
      labourCount: input.labourCount,
      labourHours: input.labourHours,
      workDone: input.workDone,
      hindrances: input.hindrances,
      recordedBy: actor?.userId ?? null,
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    () => auditBase(actor, "ujenzi.siteDiaries.record", "UJENZI_SITE_DIARY", id, { diaryDate: input.diaryDate, projectId: input.projectId }),
    (result) =>
      ujenziEvent({
        type: "SITE_PROGRESS_RECORDED",
        operation: "RECORD_SITE_DIARY",
        subjectType: "UJENZI_SITE_DIARY",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { diaryDate: input.diaryDate, labourCount: input.labourCount ?? null },
      }),
  );
}

/* -------------------------------- quality ------------------------------ */

export async function createInspectionRequest(
  input: { tenantId: string; projectId: string; code: string; inspectionType: string; requestedFor?: string; inspector?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziInspectionRequests).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      inspectionType: input.inspectionType,
      requestedFor: input.requestedFor,
      requestedBy: actor?.userId ?? null,
      inspector: input.inspector,
      result: "PENDING",
    });
    return { id, result: "PENDING" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(write, (result) =>
    auditBase(actor, "ujenzi.inspections.create", "UJENZI_INSPECTION_REQUEST", result.id, { code: input.code, result: "PENDING" }),
  );
}

export async function recordInspectionResult(
  input: { tenantId: string; inspectionRequestId: string; result: "PASSED" | "FAILED" | "REJECTED"; findings?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const [inspection] = await db
    .select()
    .from(s.ujenziInspectionRequests)
    .where(and(eq(s.ujenziInspectionRequests.id, input.inspectionRequestId), eq(s.ujenziInspectionRequests.tenantId, input.tenantId)))
    .limit(1);
  if (!inspection) throw new UjenziDomainError("NOT_FOUND", "Inspection request not found");
  if (inspection.result !== "PENDING") {
    throw new UjenziDomainError("INVALID_STATE", `Inspection result is already ${inspection.result}`);
  }
  const project = await getProject(inspection.projectId, input.tenantId);
  const write = async () => {
    await db
      .update(s.ujenziInspectionRequests)
      .set({ result: input.result, findings: input.findings, updatedAt: new Date() })
      .where(and(eq(s.ujenziInspectionRequests.id, input.inspectionRequestId), eq(s.ujenziInspectionRequests.tenantId, input.tenantId)));
    return { id: input.inspectionRequestId, result: input.result };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.inspections.result", "UJENZI_INSPECTION_REQUEST", result.id, { result: input.result }),
    (result) =>
      ujenziEvent({
        type: "QUALITY_INSPECTION_RECORDED",
        operation: "RECORD_INSPECTION_RESULT",
        subjectType: "UJENZI_INSPECTION_REQUEST",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { result: input.result, inspectionType: inspection.inspectionType },
      }),
  );
}

export async function createNcr(
  input: { tenantId: string; projectId: string; code: string; description: string; severity?: string; dueDate?: string; raisedOn?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziNcrs).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      description: input.description,
      severity: input.severity ?? "MEDIUM",
      raisedBy: actor?.userId ?? null,
      raisedOn: input.raisedOn ?? new Date().toISOString().slice(0, 10),
      dueDate: input.dueDate,
      status: "OPEN",
    });
    return { id, status: "OPEN" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.ncrs.create", "UJENZI_NCR", result.id, { code: input.code, severity: input.severity ?? "MEDIUM" }),
    (result) =>
      ujenziEvent({
        type: "NCR_CREATED",
        operation: "CREATE_NCR",
        subjectType: "UJENZI_NCR",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { code: input.code, severity: input.severity ?? "MEDIUM", projectId: input.projectId },
      }),
  );
}

export async function closeNcr(
  input: { tenantId: string; ncrId: string; correctiveAction?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const [ncr] = await db
    .select()
    .from(s.ujenziNcrs)
    .where(and(eq(s.ujenziNcrs.id, input.ncrId), eq(s.ujenziNcrs.tenantId, input.tenantId)))
    .limit(1);
  if (!ncr) throw new UjenziDomainError("NOT_FOUND", "NCR not found");
  if (ncr.status === "CLOSED") throw new UjenziDomainError("INVALID_STATE", "NCR is already closed");
  const project = await getProject(ncr.projectId, input.tenantId);
  const write = async () => {
    await db
      .update(s.ujenziNcrs)
      .set({
        status: "CLOSED",
        correctiveAction: input.correctiveAction ?? ncr.correctiveAction,
        closedBy: actor?.userId ?? null,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(s.ujenziNcrs.id, input.ncrId), eq(s.ujenziNcrs.tenantId, input.tenantId)));
    return { id: input.ncrId, status: "CLOSED" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.ncrs.close", "UJENZI_NCR", result.id, { status: "CLOSED" }),
    (result) =>
      ujenziEvent({
        type: "NCR_CLOSED",
        operation: "CLOSE_NCR",
        subjectType: "UJENZI_NCR",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { code: ncr.code },
      }),
  );
}

/* ---------------------------------- HSE -------------------------------- */

export async function recordHseIncident(
  input: {
    tenantId: string;
    projectId: string;
    siteId?: string;
    incidentType?: "INCIDENT" | "NEAR_MISS";
    severity?: string;
    occurredAt?: string;
    description: string;
  },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziHseIncidents).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      siteId: input.siteId,
      incidentType: input.incidentType ?? "INCIDENT",
      severity: input.severity ?? "MEDIUM",
      occurredAt: input.occurredAt ?? new Date().toISOString().slice(0, 10),
      description: input.description,
      reportedBy: actor?.userId ?? null,
      status: "REPORTED",
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    () => auditBase(actor, "ujenzi.hse.incidents.record", "UJENZI_HSE_INCIDENT", id, {
      incidentType: input.incidentType ?? "INCIDENT",
      severity: input.severity ?? "MEDIUM",
    }),
    (result) =>
      ujenziEvent({
        type: "HSE_INCIDENT_RECORDED",
        operation: "RECORD_HSE_INCIDENT",
        subjectType: "UJENZI_HSE_INCIDENT",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { incidentType: input.incidentType ?? "INCIDENT", severity: input.severity ?? "MEDIUM", projectId: input.projectId },
      }),
  );
}

export async function createHazard(
  input: { tenantId: string; projectId: string; hazard: string; riskLevel?: string; mitigation?: string; identifiedOn?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziHazardRegister).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      hazard: input.hazard,
      riskLevel: input.riskLevel ?? "MEDIUM",
      mitigation: input.mitigation,
      identifiedBy: actor?.userId ?? null,
      identifiedOn: input.identifiedOn ?? new Date().toISOString().slice(0, 10),
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () => auditBase(actor, "ujenzi.hse.hazards.create", "UJENZI_HAZARD", id, { hazard: input.hazard }));
}

export async function recordToolboxTalk(
  input: { tenantId: string; projectId: string; talkDate: string; topic: string; attendees?: number },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziToolboxTalks).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      talkDate: input.talkDate,
      topic: input.topic,
      attendees: input.attendees,
      deliveredBy: actor?.userId ?? null,
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () => auditBase(actor, "ujenzi.hse.toolbox.record", "UJENZI_TOOLBOX_TALK", id, { topic: input.topic }));
}

/* --------------------------- variations & claims ------------------------ */

export async function requestVariation(
  input: {
    tenantId: string;
    projectId: string;
    code: string;
    title: string;
    reason?: string;
    description?: string;
    costImpact?: string;
    currency?: string;
    scheduleImpactDays?: number;
  },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziVariations).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      title: input.title,
      reason: input.reason,
      description: input.description,
      costImpact: input.costImpact,
      currency: input.currency ?? project.currency,
      scheduleImpactDays: input.scheduleImpactDays,
      status: "SUBMITTED",
      submittedBy: actor?.userId ?? null,
    });
    return { id, status: "SUBMITTED" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.variations.request", "UJENZI_VARIATION", result.id, { code: input.code, title: input.title }),
    (result) =>
      ujenziEvent({
        type: "VARIATION_REQUESTED",
        operation: "REQUEST_VARIATION",
        subjectType: "UJENZI_VARIATION",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { code: input.code, costImpact: input.costImpact ?? null, scheduleImpactDays: input.scheduleImpactDays ?? null },
      }),
  );
}

export async function decideVariation(
  input: { tenantId: string; variationId: string; decision: "APPROVED" | "REJECTED" },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const [variation] = await db
    .select()
    .from(s.ujenziVariations)
    .where(and(eq(s.ujenziVariations.id, input.variationId), eq(s.ujenziVariations.tenantId, input.tenantId)))
    .limit(1);
  if (!variation) throw new UjenziDomainError("NOT_FOUND", "Variation not found");
  if (variation.status !== "SUBMITTED" && variation.status !== "UNDER_REVIEW") {
    throw new UjenziDomainError("INVALID_STATE", `Variation is ${variation.status} and can no longer be decided`);
  }
  const project = await getProject(variation.projectId, input.tenantId);
  const write = async () => {
    await db
      .update(s.ujenziVariations)
      .set({ status: input.decision, decidedBy: actor?.userId ?? null, decidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.ujenziVariations.id, input.variationId), eq(s.ujenziVariations.tenantId, input.tenantId)));
    return { id: input.variationId, status: input.decision };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.variations.decide", "UJENZI_VARIATION", result.id, { status: input.decision }),
    input.decision === "APPROVED"
      ? (result) =>
          ujenziEvent({
            type: "VARIATION_APPROVED",
            operation: "APPROVE_VARIATION",
            subjectType: "UJENZI_VARIATION",
            subjectId: result.id,
            tenantId: input.tenantId,
            legalEntityId: project.legalEntityId,
            actor,
            payload: { code: variation.code, costImpact: variation.costImpact, scheduleImpactDays: variation.scheduleImpactDays },
          })
      : undefined,
  );
}

export async function submitClaim(
  input: {
    tenantId: string;
    projectId: string;
    code: string;
    title: string;
    claimant?: string;
    respondent?: string;
    amount?: string;
    currency?: string;
    noticeDate?: string;
    description?: string;
    evidenceRef?: string;
  },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziClaims).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      title: input.title,
      claimant: input.claimant,
      respondent: input.respondent,
      amount: input.amount,
      currency: input.currency ?? project.currency,
      noticeDate: input.noticeDate ?? new Date().toISOString().slice(0, 10),
      description: input.description,
      evidenceRef: input.evidenceRef,
      status: "NOTIFIED",
    });
    return { id, status: "NOTIFIED" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "ujenzi.claims.submit", "UJENZI_CLAIM", result.id, { code: input.code, amount: input.amount ?? null }),
    (result) =>
      ujenziEvent({
        type: "CLAIM_SUBMITTED",
        operation: "SUBMIT_CLAIM",
        subjectType: "UJENZI_CLAIM",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: { code: input.code, amount: input.amount ?? null },
      }),
  );
}

/* -------------------------- payment certificates ------------------------ */

export interface CertifyPaymentInput {
  tenantId: string;
  projectId: string;
  code: string;
  certificateNo: number;
  periodFrom?: string;
  periodTo?: string;
  grossValue: string;
  retention?: string;
  currency?: string;
}

/**
 * Certify a construction payment certificate.
 *
 * FINANCE BOUNDARY (constitutional): a certificate is Ujenzi project-control
 * truth — a valuation of work executed. It emits PAYMENT_CERTIFIED and NEVER
 * posts a journal, never touches treasury and never unlocks CAP_POSTING. The
 * governed handoff to Finance OS happens through the canonical payments
 * capability, which remains the only posting path.
 */
export async function certifyPaymentCertificate(input: CertifyPaymentInput, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  const retention = input.retention ?? "0";
  const net = (Number(input.grossValue) - Number(retention)).toFixed(2);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziPaymentCertificates).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      certificateNo: input.certificateNo,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      grossValue: input.grossValue,
      retention,
      netValue: net,
      currency: input.currency ?? project.currency,
      status: "CERTIFIED",
      certifiedBy: actor?.userId ?? null,
      certifiedAt: new Date(),
    });
    return {
      id,
      status: "CERTIFIED" as const,
      netValue: net,
      journalsPosted: false as const,
      financeHandoff: "CERTIFIED_PENDING_FINANCE_INTEGRATION" as const,
      capPosting: "LOCKED" as const,
    };
  };
  if (!actor) return write();
  return withAuditTransaction(
    write,
    (result) =>
      auditBase(actor, "ujenzi.paymentCertificates.certify", "UJENZI_PAYMENT_CERTIFICATE", result.id, {
        code: input.code,
        certificateNo: input.certificateNo,
        grossValue: input.grossValue,
        netValue: result.netValue,
        journalsPosted: false,
      }),
    (result) =>
      ujenziEvent({
        type: "PAYMENT_CERTIFIED",
        operation: "CERTIFY_PAYMENT_CERTIFICATE",
        subjectType: "UJENZI_PAYMENT_CERTIFICATE",
        subjectId: result.id,
        tenantId: input.tenantId,
        legalEntityId: project.legalEntityId,
        actor,
        payload: {
          code: input.code,
          certificateNo: input.certificateNo,
          grossValue: input.grossValue,
          netValue: result.netValue,
          journalsPosted: false,
        },
      }),
  );
}

/* -------------------------------- handover ----------------------------- */

export async function createPunchItem(
  input: { tenantId: string; projectId: string; code: string; description: string; category?: string; raisedOn?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  await getProject(input.projectId, input.tenantId);
  const id = ujenziId();
  const write = async () => {
    await db.insert(s.ujenziPunchItems).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      description: input.description,
      category: input.category,
      raisedBy: actor?.userId ?? null,
      raisedOn: input.raisedOn ?? new Date().toISOString().slice(0, 10),
      status: "OPEN",
    });
    return { id, status: "OPEN" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(write, (result) =>
    auditBase(actor, "ujenzi.punchItems.create", "UJENZI_PUNCH_ITEM", result.id, { code: input.code }),
  );
}

export async function closePunchItem(input: { tenantId: string; punchItemId: string }, actor?: UjenziActor) {
  assertActorTenant(actor, input.tenantId);
  const [punch] = await db
    .select()
    .from(s.ujenziPunchItems)
    .where(and(eq(s.ujenziPunchItems.id, input.punchItemId), eq(s.ujenziPunchItems.tenantId, input.tenantId)))
    .limit(1);
  if (!punch) throw new UjenziDomainError("NOT_FOUND", "Punch item not found");
  if (punch.status === "CLOSED" || punch.status === "VERIFIED") {
    throw new UjenziDomainError("INVALID_STATE", "Punch item is already closed");
  }
  const write = async () => {
    await db
      .update(s.ujenziPunchItems)
      .set({ status: "CLOSED", closedBy: actor?.userId ?? null, closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.ujenziPunchItems.id, input.punchItemId), eq(s.ujenziPunchItems.tenantId, input.tenantId)));
    return { id: input.punchItemId, status: "CLOSED" as const };
  };
  if (!actor) return write();
  return withAuditTransaction(write, (result) =>
    auditBase(actor, "ujenzi.punchItems.close", "UJENZI_PUNCH_ITEM", result.id, { status: "CLOSED" }),
  );
}

/* ------------------------------- dashboard ------------------------------ */

export type UjenziDashboard = Awaited<ReturnType<typeof ujenziDashboard>>;

/**
 * Executive dashboard aggregation over REAL Ujenzi tables only. No metric is
 * fabricated: every number is a count or sum of governed rows, and the finance
 * boundary is declared explicitly rather than implied.
 */
export async function ujenziDashboard(tenantId: string) {
  const [
    [projects],
    [activeProjects],
    [portfolioValue],
    [openNcrs],
    [openClaims],
    [pendingVariations],
    [incidents],
    [nearMisses],
    [openPunch],
    [approvedPos],
    [pendingRequisitions],
    [equipmentCount],
    costByKind,
    [latestDiary],
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziProjects).where(eq(s.ujenziProjects.tenantId, tenantId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.ujenziProjects)
      .where(and(eq(s.ujenziProjects.tenantId, tenantId), eq(s.ujenziProjects.status, "ACTIVE"))),
    db
      .select({ sum: sql<string>`coalesce(sum(${s.ujenziProjects.contractValue}), 0)::text` })
      .from(s.ujenziProjects)
      .where(eq(s.ujenziProjects.tenantId, tenantId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.ujenziNcrs)
      .where(and(eq(s.ujenziNcrs.tenantId, tenantId), sql`${s.ujenziNcrs.status} <> 'CLOSED'`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.ujenziClaims)
      .where(and(eq(s.ujenziClaims.tenantId, tenantId), sql`${s.ujenziClaims.status} IN ('NOTIFIED','UNDER_REVIEW','DECIDED')`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.ujenziVariations)
      .where(and(eq(s.ujenziVariations.tenantId, tenantId), sql`${s.ujenziVariations.status} IN ('SUBMITTED','UNDER_REVIEW')`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.ujenziHseIncidents)
      .where(and(eq(s.ujenziHseIncidents.tenantId, tenantId), eq(s.ujenziHseIncidents.incidentType, "INCIDENT"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.ujenziHseIncidents)
      .where(and(eq(s.ujenziHseIncidents.tenantId, tenantId), eq(s.ujenziHseIncidents.incidentType, "NEAR_MISS"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.ujenziPunchItems)
      .where(and(eq(s.ujenziPunchItems.tenantId, tenantId), sql`${s.ujenziPunchItems.status} IN ('OPEN','IN_PROGRESS')`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.ujenziPurchaseOrders)
      .where(and(eq(s.ujenziPurchaseOrders.tenantId, tenantId), eq(s.ujenziPurchaseOrders.status, "APPROVED"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.ujenziRequisitions)
      .where(and(eq(s.ujenziRequisitions.tenantId, tenantId), sql`${s.ujenziRequisitions.status} = 'SUBMITTED'`)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziEquipment).where(eq(s.ujenziEquipment.tenantId, tenantId)),
    db
      .select({ kind: s.ujenziCostRecords.kind, sum: sql<string>`coalesce(sum(${s.ujenziCostRecords.amount}), 0)::text` })
      .from(s.ujenziCostRecords)
      .where(eq(s.ujenziCostRecords.tenantId, tenantId))
      .groupBy(s.ujenziCostRecords.kind),
    db
      .select({ diaryDate: s.ujenziSiteDiaries.diaryDate })
      .from(s.ujenziSiteDiaries)
      .where(eq(s.ujenziSiteDiaries.tenantId, tenantId))
      .orderBy(desc(s.ujenziSiteDiaries.diaryDate))
      .limit(1),
  ]);

  const cost: Record<UjenziCostKind, string> = {
    ESTIMATE: "0",
    BUDGET: "0",
    COMMITTED: "0",
    ACTUAL: "0",
    FORECAST: "0",
  };
  for (const row of costByKind) {
    if ((UJENZI_COST_KINDS as readonly string[]).includes(row.kind)) {
      cost[row.kind as UjenziCostKind] = row.sum;
    }
  }

  return {
    projects: projects?.n ?? 0,
    activeProjects: activeProjects?.n ?? 0,
    portfolioValue: portfolioValue?.sum ?? "0",
    openNcrs: openNcrs?.n ?? 0,
    openClaims: openClaims?.n ?? 0,
    pendingVariations: pendingVariations?.n ?? 0,
    incidents: incidents?.n ?? 0,
    nearMisses: nearMisses?.n ?? 0,
    openPunchItems: openPunch?.n ?? 0,
    approvedPurchaseOrders: approvedPos?.n ?? 0,
    pendingRequisitions: pendingRequisitions?.n ?? 0,
    equipment: equipmentCount?.n ?? 0,
    cost,
    latestSiteDiaryDate: latestDiary?.diaryDate ?? null,
    financeBoundary: {
      journals: "FINANCE_OS_ONLY",
      capPosting: "LOCKED",
      paymentCertificateEvent: "PAYMENT_CERTIFIED",
    },
  };
}
