import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { UjenziDomainError } from "./errors";

type Actor = { tenantId: string; userId: string; traceId: string };

function id() {
  return newId(ID_PREFIX.ujenzi);
}

export async function registerBuilding(
  input: { tenantId: string; projectId: string; siteId?: string; code: string; name: string; occupancy?: string },
  actor?: Actor,
) {
  if (actor && actor.tenantId !== input.tenantId) throw new UjenziDomainError("SCOPE", "tenant mismatch");
  const [project] = await db
    .select({ id: s.ujenziProjects.id })
    .from(s.ujenziProjects)
    .where(and(eq(s.ujenziProjects.id, input.projectId), eq(s.ujenziProjects.tenantId, input.tenantId)));
  if (!project) throw new UjenziDomainError("NOT_FOUND", "Project not found");
  const buildingId = id();
  await db.insert(s.ujenziBuildings).values({
    id: buildingId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    siteId: input.siteId,
    code: input.code,
    name: input.name,
    occupancy: input.occupancy,
    status: "PLANNED",
  });
  if (input.siteId) {
    await db.insert(s.ujenziTwinEdges).values({
      id: id(),
      tenantId: input.tenantId,
      projectId: input.projectId,
      fromKind: "SITE",
      fromId: input.siteId,
      toKind: "BUILDING",
      toId: buildingId,
      relation: "CONTAINS",
    });
  }
  return { id: buildingId, twin: "PARTIAL" as const };
}

export async function registerLevel(input: { tenantId: string; buildingId: string; code: string; name: string }) {
  const [building] = await db
    .select()
    .from(s.ujenziBuildings)
    .where(and(eq(s.ujenziBuildings.id, input.buildingId), eq(s.ujenziBuildings.tenantId, input.tenantId)));
  if (!building) throw new UjenziDomainError("NOT_FOUND", "Building not found");
  const levelId = id();
  await db.insert(s.ujenziLevels).values({
    id: levelId,
    tenantId: input.tenantId,
    buildingId: input.buildingId,
    code: input.code,
    name: input.name,
  });
  await db.insert(s.ujenziTwinEdges).values({
    id: id(),
    tenantId: input.tenantId,
    projectId: building.projectId,
    fromKind: "BUILDING",
    fromId: input.buildingId,
    toKind: "LEVEL",
    toId: levelId,
    relation: "CONTAINS",
  });
  return { id: levelId };
}

export async function queryDigitalTwin(tenantId: string, projectId?: string) {
  const whereProject = projectId
    ? and(eq(s.ujenziBuildings.tenantId, tenantId), eq(s.ujenziBuildings.projectId, projectId))
    : eq(s.ujenziBuildings.tenantId, tenantId);
  const [[buildings], [levels], [spaces], [elements], [assets], [edges]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziBuildings).where(whereProject),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziLevels).where(eq(s.ujenziLevels.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziSpaces).where(eq(s.ujenziSpaces.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziElements).where(eq(s.ujenziElements.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziAssets).where(eq(s.ujenziAssets.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziTwinEdges).where(eq(s.ujenziTwinEdges.tenantId, tenantId)),
  ]);
  return {
    buildings: buildings?.n ?? 0,
    levels: levels?.n ?? 0,
    spaces: spaces?.n ?? 0,
    elements: elements?.n ?? 0,
    assets: assets?.n ?? 0,
    edges: edges?.n ?? 0,
    viewer: "NOT_IMPLEMENTED" as const,
    geometryPayload: "REFUSED" as const,
    note: "Digital Twin is an identifier graph. Huge models are not returned over this API.",
  };
}

export async function recordProfessional(
  input: {
    tenantId: string;
    displayName: string;
    discipline: string;
    registrationNumber?: string;
    jurisdiction?: string;
    globalUserId?: string;
  },
) {
  const rowId = id();
  await db.insert(s.ujenziProfessionals).values({
    id: rowId,
    tenantId: input.tenantId,
    displayName: input.displayName,
    discipline: input.discipline,
    registrationNumber: input.registrationNumber,
    jurisdiction: input.jurisdiction ?? "TZ",
    globalUserId: input.globalUserId,
    verificationStatus: "USER_ENTERED",
  });
  return { id: rowId, verificationStatus: "USER_ENTERED" as const, fabricated: false as const };
}
