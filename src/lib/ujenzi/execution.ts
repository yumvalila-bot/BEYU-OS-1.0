import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { UjenziDomainError } from "./errors";

function id() {
  return newId(ID_PREFIX.ujenzi);
}

async function requireProject(projectId: string, tenantId: string) {
  const [p] = await db
    .select({ id: s.ujenziProjects.id })
    .from(s.ujenziProjects)
    .where(and(eq(s.ujenziProjects.id, projectId), eq(s.ujenziProjects.tenantId, tenantId)));
  if (!p) throw new UjenziDomainError("NOT_FOUND", "Project not found");
}

export async function createWorkPackage(input: {
  tenantId: string;
  projectId: string;
  code: string;
  title: string;
  scheduleActivityId?: string;
  plannedQty?: string;
  unit?: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziWorkPackages).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
    scheduleActivityId: input.scheduleActivityId,
    plannedQty: input.plannedQty,
    unit: input.unit,
    status: "PLANNED",
  });
  return { id: rowId, status: "PLANNED" as const };
}

export async function addWorkPackageDependency(input: {
  tenantId: string;
  predecessorId: string;
  successorId: string;
  relation?: string;
}) {
  if (input.predecessorId === input.successorId) {
    throw new UjenziDomainError("INVALID_STATE", "Self-dependency refused");
  }
  const [a] = await db
    .select()
    .from(s.ujenziWorkPackages)
    .where(and(eq(s.ujenziWorkPackages.id, input.predecessorId), eq(s.ujenziWorkPackages.tenantId, input.tenantId)));
  const [b] = await db
    .select()
    .from(s.ujenziWorkPackages)
    .where(and(eq(s.ujenziWorkPackages.id, input.successorId), eq(s.ujenziWorkPackages.tenantId, input.tenantId)));
  if (!a || !b) throw new UjenziDomainError("NOT_FOUND", "Work package not found");
  const { detectWorkPackageCycles } = await import("./integration");
  const rowId = id();
  await db.insert(s.ujenziWorkPackageDeps).values({
    id: rowId,
    tenantId: input.tenantId,
    predecessorId: input.predecessorId,
    successorId: input.successorId,
    relation: input.relation ?? "FS",
  });
  const cycles = await detectWorkPackageCycles(input.tenantId, a.projectId);
  if (cycles.cyclic) {
    await db.delete(s.ujenziWorkPackageDeps).where(eq(s.ujenziWorkPackageDeps.id, rowId));
    throw new UjenziDomainError("INVALID_STATE", "Work package dependency cycle refused");
  }
  return { id: rowId };
}

export async function recordWorkPackageProgress(input: {
  tenantId: string;
  workPackageId: string;
  actualQty: string;
  unit?: string;
}) {
  const qty = Number(input.actualQty);
  if (!(qty >= 0) || !Number.isFinite(qty)) throw new UjenziDomainError("INVALID_STATE", "Invalid actualQty");
  const [wp] = await db
    .select()
    .from(s.ujenziWorkPackages)
    .where(and(eq(s.ujenziWorkPackages.id, input.workPackageId), eq(s.ujenziWorkPackages.tenantId, input.tenantId)));
  if (!wp) throw new UjenziDomainError("NOT_FOUND", "Work package not found");
  if (input.unit && wp.unit && input.unit !== wp.unit) {
    throw new UjenziDomainError("INVALID_STATE", "Progress unit does not match work package unit");
  }
  await db
    .update(s.ujenziWorkPackages)
    .set({ actualQty: input.actualQty, status: "IN_PROGRESS" })
    .where(eq(s.ujenziWorkPackages.id, input.workPackageId));
  return { id: wp.id, plannedQty: wp.plannedQty, actualQty: input.actualQty, journalsPosted: false as const };
}

export async function recordSiteReport(input: {
  tenantId: string;
  projectId: string;
  reportDate: string;
  body: string;
  offlineEnvelopeId?: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziSiteReports).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    reportDate: input.reportDate,
    body: input.body,
    offlineEnvelopeId: input.offlineEnvelopeId,
  });
  return { id: rowId };
}

export async function recordSubmittal(input: { tenantId: string; projectId: string; code: string; title: string }) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziSubmittals).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
  });
  return { id: rowId, status: "OPEN" as const };
}

export async function recordItp(input: {
  tenantId: string;
  projectId: string;
  code: string;
  title: string;
  acceptanceCriteria: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziItps).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
    acceptanceCriteria: input.acceptanceCriteria,
  });
  return { id: rowId };
}

export async function recordItpResult(input: {
  tenantId: string;
  itpId: string;
  outcome: "PASS" | "FAIL";
  measuredValue?: string;
}) {
  const [itp] = await db
    .select()
    .from(s.ujenziItps)
    .where(and(eq(s.ujenziItps.id, input.itpId), eq(s.ujenziItps.tenantId, input.tenantId)));
  if (!itp) throw new UjenziDomainError("NOT_FOUND", "ITP not found");
  const rowId = id();
  await db.insert(s.ujenziItpResults).values({
    id: rowId,
    tenantId: input.tenantId,
    itpId: input.itpId,
    outcome: input.outcome,
    measuredValue: input.measuredValue,
    professionalCertification: "NOT_CERTIFIED",
  });
  return { id: rowId, professionalCertification: "NOT_CERTIFIED" as const };
}

export async function closeNcr(input: { tenantId: string; ncrId: string }) {
  const [ncr] = await db
    .select()
    .from(s.ujenziQualityNcrs)
    .where(and(eq(s.ujenziQualityNcrs.id, input.ncrId), eq(s.ujenziQualityNcrs.tenantId, input.tenantId)));
  if (!ncr) throw new UjenziDomainError("NOT_FOUND", "NCR not found");
  await db.update(s.ujenziQualityNcrs).set({ status: "CLOSED" }).where(eq(s.ujenziQualityNcrs.id, input.ncrId));
  return { id: ncr.id, status: "CLOSED" as const, certified: false as const };
}

export async function recordMaterialMovement(input: {
  tenantId: string;
  projectId: string;
  movementKind: "DELIVERY" | "CONSUMPTION";
  materialCode: string;
  quantity: string;
  unit: string;
  workPackageId?: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const q = Number(input.quantity);
  if (!(q > 0) || !Number.isFinite(q)) throw new UjenziDomainError("INVALID_STATE", "Invalid quantity");
  const rowId = id();
  await db.insert(s.ujenziMaterialMovements).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    movementKind: input.movementKind,
    materialCode: input.materialCode,
    quantity: input.quantity,
    unit: input.unit,
    workPackageId: input.workPackageId,
  });
  return { id: rowId };
}

export async function recordSustainabilityMetric(input: {
  tenantId: string;
  projectId: string;
  metricKind: string;
  value: string;
  unit: string;
  methodology: string;
  source: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  if (!input.methodology.trim() || !input.source.trim()) {
    throw new UjenziDomainError("DATA_REQUIRED", "Sustainability metrics require methodology and source");
  }
  const rowId = id();
  await db.insert(s.ujenziSustainabilityMetrics).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    metricKind: input.metricKind,
    value: input.value,
    unit: input.unit,
    methodology: input.methodology,
    source: input.source,
  });
  return { id: rowId, fabricated: false as const };
}
