import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { UjenziDomainError } from "./errors";
import { isKnownCrs, validateLonLat } from "./crs";

async function requireProject(projectId: string, tenantId: string) {
  const [project] = await db
    .select({ id: s.ujenziProjects.id })
    .from(s.ujenziProjects)
    .where(and(eq(s.ujenziProjects.id, projectId), eq(s.ujenziProjects.tenantId, tenantId)));
  if (!project) throw new UjenziDomainError("NOT_FOUND", "Project not found");
}

function id() {
  return newId(ID_PREFIX.ujenzi);
}

export async function recordSurveyObservation(input: {
  tenantId: string;
  siteId: string;
  method: string;
  crs: string;
  eastingOrLon?: number;
  northingOrLat?: number;
  elevationM?: number;
  accuracyM?: number;
  observedOn?: string;
}) {
  if (!isKnownCrs(input.crs)) throw new UjenziDomainError("DATA_REQUIRED", `Unknown CRS ${input.crs}`);
  const [site] = await db
    .select()
    .from(s.ujenziLandSites)
    .where(and(eq(s.ujenziLandSites.id, input.siteId), eq(s.ujenziLandSites.tenantId, input.tenantId)));
  if (!site) throw new UjenziDomainError("NOT_FOUND", "Site not found");
  if (input.crs === "EPSG:4326" && input.eastingOrLon != null && input.northingOrLat != null) {
    if (!validateLonLat(input.eastingOrLon, input.northingOrLat)) {
      throw new UjenziDomainError("INVALID_STATE", "Invalid WGS84 coordinates");
    }
  }
  if (input.eastingOrLon == null || input.northingOrLat == null) {
    const rowId = id();
    await db.insert(s.ujenziSurveyObservations).values({
      id: rowId,
      tenantId: input.tenantId,
      siteId: input.siteId,
      method: input.method,
      crs: input.crs,
      dataStatus: "DATA_REQUIRED",
      source: "USER_ENTERED",
    });
    return { id: rowId, dataStatus: "DATA_REQUIRED" as const };
  }
  const rowId = id();
  await db.insert(s.ujenziSurveyObservations).values({
    id: rowId,
    tenantId: input.tenantId,
    siteId: input.siteId,
    method: input.method,
    crs: input.crs,
    eastingOrLon: String(input.eastingOrLon),
    northingOrLat: String(input.northingOrLat),
    elevationM: input.elevationM != null ? String(input.elevationM) : null,
    accuracyM: input.accuracyM != null ? String(input.accuracyM) : null,
    observedOn: input.observedOn,
    dataStatus: "RECORDED",
    source: "USER_ENTERED",
  });
  return { id: rowId, dataStatus: "RECORDED" as const };
}

export async function ingestGeoJsonDataset(input: {
  tenantId: string;
  projectId?: string;
  code: string;
  title: string;
  source: string;
  crs: string;
  geojson: unknown;
}) {
  if (!isKnownCrs(input.crs)) throw new UjenziDomainError("DATA_REQUIRED", `Unknown CRS ${input.crs}`);
  const gj = input.geojson as { type?: string; features?: unknown[] };
  if (!gj || gj.type !== "FeatureCollection" || !Array.isArray(gj.features)) {
    throw new UjenziDomainError("INVALID_STATE", "Unsupported GIS payload; FeatureCollection required");
  }
  const rowId = id();
  await db.insert(s.ujenziGisDatasets).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
    format: "GEOJSON",
    crs: input.crs,
    featureCount: gj.features.length,
    source: input.source,
    ingestStatus: "INGESTED",
  });
  for (let i = 0; i < gj.features.length; i++) {
    const f = gj.features[i] as { geometry?: { type?: string }; properties?: Record<string, unknown> };
    await db.insert(s.ujenziGisFeatures).values({
      id: id(),
      tenantId: input.tenantId,
      datasetId: rowId,
      featureIndex: i,
      geometryType: f?.geometry?.type ?? null,
      properties: f?.properties ?? {},
    });
  }
  return {
    id: rowId,
    ingestStatus: "INGESTED" as const,
    featureCount: gj.features.length,
    renderer: "NOT_IMPLEMENTED" as const,
    wms: "NOT_IMPLEMENTED" as const,
  };
}

export async function recordDefect(input: {
  tenantId: string;
  projectId: string;
  code: string;
  title: string;
  severity?: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziDefects).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
    severity: input.severity ?? "MINOR",
    status: "OPEN",
  });
  return { id: rowId, status: "OPEN" as const };
}

export async function recordRfi(input: { tenantId: string; projectId: string; code: string; question: string }) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziRfis).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    question: input.question,
    status: "OPEN",
  });
  return { id: rowId, status: "OPEN" as const };
}

export async function recordScheduleActivity(input: {
  tenantId: string;
  projectId: string;
  code: string;
  name: string;
  durationDays?: number;
  predecessorCode?: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziScheduleActivities).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    name: input.name,
    durationDays: input.durationDays,
    predecessorCode: input.predecessorCode,
    status: "PLANNED",
  });
  return { id: rowId, status: "PLANNED" as const };
}
