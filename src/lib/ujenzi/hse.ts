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

export async function recordHseIncident(input: {
  tenantId: string;
  projectId: string;
  code: string;
  title: string;
  severity?: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziHseIncidents).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
    severity: input.severity ?? "LOW",
    status: "OPEN",
  });
  return { id: rowId, status: "OPEN" as const, certified: false as const };
}

export async function recordHazard(input: {
  tenantId: string;
  projectId: string;
  code: string;
  title: string;
  residualRisk?: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziHazards).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
    residualRisk: input.residualRisk ?? "UNASSESSED",
    status: "OPEN",
  });
  return { id: rowId, certified: false as const };
}

export async function recordNearMiss(input: { tenantId: string; projectId: string; code: string; title: string }) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziNearMisses).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
    status: "RECORDED",
  });
  return { id: rowId };
}

export async function recordPermitToWork(input: {
  tenantId: string;
  projectId: string;
  code: string;
  permitKind: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziPermitsToWork).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    permitKind: input.permitKind,
    status: "REQUESTED",
  });
  return { id: rowId, status: "REQUESTED" as const };
}
