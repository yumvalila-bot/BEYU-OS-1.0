/**
 * BEYU OS — AGRICULTURE OS VISUALIZATION ADAPTER (shared capability → Sector OS).
 *
 * Maps Agriculture OS domain data into the universal dimensional model:
 * farms & fields (2D map / 3D projection foundation, governed GPS + boundary
 * GeoJSON references), crop cycles (4D), harvests & inputs (5D quantities),
 * weather readings & env metrics (6D — with their EXISTING epistemic status
 * preserved, unknown stays unknown), equipment & service history (7D),
 * hazard register & safety incidents (8D).
 *
 * READ-ONLY. Agriculture OS remains the sector system of record; Finance OS
 * remains the only journal writer (CAP_POSTING LOCKED — harvest recording
 * already emits HARVEST_RECORDED and never posts; visualization adds no
 * posting path of any kind).
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { classificationsAtOrBelow, type Classification } from "@/lib/constants";
import { assertSectorAccess } from "../authorization";
import { derived, observed, unavailable } from "../provenance";
import { mapStatusToStage } from "../engines/lifecycle";
import { mapSeverity } from "../engines/risk";
import type { SceneGeometry } from "../scene-model";
import { emptyDataset, rowVisible, type AdapterDataset, type AdapterDescriptor, type AdapterRequest, type SectorVisualizationAdapter } from "./types";

const SYSTEM_OF_RECORD =
  "agriculture_farms, agriculture_fields, agriculture_land_parcels, agriculture_crop_cycles, agriculture_harvests, agriculture_equipment, agriculture_equipment_service, agriculture_weather_readings, agriculture_env_metrics, agriculture_hazard_register, agriculture_safety_incidents (Agriculture OS)";

const AGRI_CRS = "EPSG:4326";

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Deterministic 5×5 likelihood×impact → neutral severity band (DERIVED). */
function hazardScoreToSeverity(likelihood: number, impact: number): AdapterDataset["risk"][number]["severity"] {
  const score = likelihood * impact;
  const severity = score >= 16 ? "CRITICAL" : score >= 9 ? "HIGH" : score >= 4 ? "MEDIUM" : "LOW";
  return derived(severity);
}

/** Boundary GeoJSON is carried as a REFERENCE + coarse point extraction only.
 * Malformed or absent geometry produces NO geometry — never a guess. */
function geometryFrom(farm: { gpsLatitude: string | null; gpsLongitude: string | null; boundaryGeojson: Record<string, unknown> | null }): SceneGeometry | null {
  const lat = num(farm.gpsLatitude);
  const lon = num(farm.gpsLongitude);
  const points: Array<[number, number]> = [];
  const boundary = farm.boundaryGeojson;
  if (boundary && Array.isArray((boundary as { coordinates?: unknown }).coordinates)) {
    const walk = (coords: unknown): void => {
      if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
        if (points.length < 200) points.push([coords[0] as number, coords[1] as number]);
        return;
      }
      if (Array.isArray(coords)) for (const c of coords) walk(c);
    };
    walk(boundary.coordinates);
  }
  if (lat === null && lon === null && points.length === 0) return null;
  return { crs: AGRI_CRS, latitude: lat, longitude: lon, points: points.length > 0 ? points : lat !== null && lon !== null ? [[lon, lat]] : undefined };
}

export const agricultureAdapterDescriptor: AdapterDescriptor = {
  sector: "AGRICULTURE",
  status: "IMPLEMENTED",
  suppliedDimensions: ["1D", "2D", "3D", "4D", "5D", "6D", "7D", "8D"],
  mappedCapabilities: [
    "farms, fields & land parcels (2D map, boundary GeoJSON, 3D projection foundation)",
    "crop cycles: planting → expected/actual harvest (4D)",
    "harvest quantities & quality grades (5D)",
    "weather readings & environmental metrics with existing epistemic status (6D)",
    "equipment register & service history (7D)",
    "hazard register & safety incidents (8D)",
    "supply-chain/traceability visualization (PLANNED — trace links exist in Agriculture OS but no viz mapping is implemented yet)",
  ],
  notImplemented: ["satellite/remote-sensing imagery", "irrigation network schematics", "supply-chain graph rendering"],
  systemOfRecord: SYSTEM_OF_RECORD,
};

export const agricultureAdapter: SectorVisualizationAdapter = {
  sector: "AGRICULTURE",
  describe: () => agricultureAdapterDescriptor,

  async collect(principal: Principal, request: AdapterRequest): Promise<AdapterDataset> {
    const access = await assertSectorAccess(principal, "AGRICULTURE");
    if (!access.allowed) return emptyDataset("AGRICULTURE", SYSTEM_OF_RECORD, access.reason);

    const allowed = classificationsAtOrBelow(principal.clearance) as Classification[];
    if (allowed.length === 0) return emptyDataset("AGRICULTURE", SYSTEM_OF_RECORD, "Principal clearance does not admit any classification.");

    const tenantId = principal.tenantId;
    const limit = Math.min(Math.max(request.limit ?? 200, 1), 500);
    const wants = new Set(request.dimensions);

    const farmWhere = request.subjectId
      ? and(eq(s.farms.tenantId, tenantId), eq(s.farms.id, request.subjectId))
      : eq(s.farms.tenantId, tenantId);
    const farms = (await db.select().from(s.farms).where(farmWhere).orderBy(desc(s.farms.createdAt)).limit(limit)).filter((f) =>
      rowVisible(f.classification, allowed),
    );
    const farmIds = farms.map((f) => f.id);
    if (farmIds.length === 0) return { ...emptyDataset("AGRICULTURE", SYSTEM_OF_RECORD), status: "OK" };

    const objects: AdapterDataset["objects"] = [];
    const time: AdapterDataset["time"] = [];
    const quantities: AdapterDataset["quantities"] = [];
    const performance: AdapterDataset["performance"] = [];
    const lifecycle: AdapterDataset["lifecycle"] = [];
    const risk: AdapterDataset["risk"] = [];

    for (const f of farms) {
      objects.push({
        id: f.id,
        label: `${f.code} — ${f.name}`,
        layerId: "agri-farms",
        classification: f.classification as Classification,
        geometry: geometryFrom(f),
        dimensionValues: {
          "1D": observed(f.status),
          "2D": observed(f.region ?? "Unlocated"),
          "5D": f.totalAreaHa !== null ? observed(f.totalAreaHa, "ha") : unavailable(),
          "6D": f.waterSource ? observed(f.waterSource) : unavailable(),
          "7D": observed(f.status),
        },
        accessibleText: `Farm ${f.code} ${f.name}, country ${f.countryCode}, region ${f.region ?? "unknown"}, total area ${f.totalAreaHa ?? "UNKNOWN"} ha, arable ${f.arableAreaHa ?? "UNKNOWN"} ha, soil ${f.soilType ?? "unknown"}, water source ${f.waterSource ?? "unknown"}, status ${f.status}.`,
        timeAnchor: f.createdAt.toISOString(),
        sourceRef: `agriculture_farms:${f.id}`,
        status: f.status,
      });
      const stage = mapStatusToStage(f.status);
      if (stage) lifecycle.push({ subjectKey: f.id, stage, at: null, sourceStatus: f.status, source: "agriculture_farms" });
    }

    /* Fields (2D/3D) */
    const fields = await db.select().from(s.fields).where(eq(s.fields.tenantId, tenantId)).limit(limit * 4);
    for (const fl of fields.filter((r) => rowVisible(r.classification, allowed) && farmIds.includes(r.farmId))) {
      objects.push({
        id: fl.id,
        label: `${fl.code} — ${fl.name}`,
        layerId: "agri-fields",
        classification: fl.classification as Classification,
        geometry: geometryFrom(fl),
        dimensionValues: {
          "2D": observed(fl.irrigationType ?? "non-irrigated"),
          "5D": observed(fl.areaHa, "ha"),
        },
        accessibleText: `Field ${fl.code} ${fl.name}, area ${fl.areaHa} ha, irrigation ${fl.irrigationType ?? "none"}, soil ${fl.soilType ?? "unknown"}, status ${fl.status}.`,
        timeAnchor: null,
        sourceRef: `agriculture_fields:${fl.id}`,
        status: fl.status,
      });
    }

    /* Crop cycles (4D) + harvest quantities (5D) */
    if (wants.has("4D") || wants.has("5D") || wants.has("7D")) {
      const cycles = await db.select().from(s.cropCycles).where(eq(s.cropCycles.tenantId, tenantId)).limit(limit * 4);
      for (const c of cycles.filter((r) => rowVisible(r.classification, allowed))) {
        if (c.plantingDate) time.push({ at: c.plantingDate, label: `${c.code} planted`, source: "agriculture_crop_cycles", kind: "OCCURRED", ref: c.id });
        if (c.expectedHarvestDate) time.push({ at: c.expectedHarvestDate, label: `${c.code} expected harvest`, source: "agriculture_crop_cycles", kind: "PLANNED", ref: c.id });
        if (c.actualHarvestDate) time.push({ at: c.actualHarvestDate, label: `${c.code} actual harvest`, source: "agriculture_crop_cycles", kind: "OCCURRED", ref: c.id });
        quantities.push({
          subjectKey: c.fieldId,
          kind: "QUANTITY",
          amount: c.actualYieldKg !== null ? observed(String(c.actualYieldKg), "kg") : c.expectedYieldKg !== null ? { value: String(c.expectedYieldKg), status: "FORECAST", unit: "kg", observedAt: null } : unavailable(),
          unit: "kg",
          at: c.actualHarvestDate ?? c.expectedHarvestDate ?? null,
          label: `${c.code} ${c.variety ?? ""} yield`.trim(),
        });
        const stage = mapStatusToStage(c.status);
        if (stage) lifecycle.push({ subjectKey: c.id, stage, at: c.plantingDate ?? null, sourceStatus: c.status, source: "agriculture_crop_cycles" });
      }
      const harvests = await db.select().from(s.harvests).where(eq(s.harvests.tenantId, tenantId)).orderBy(desc(s.harvests.harvestDate)).limit(limit * 4);
      for (const h of harvests.filter((r) => rowVisible(r.classification, allowed))) {
        time.push({ at: h.harvestDate, label: `Harvest ${h.code} (${h.quantityKg} kg)`, source: "agriculture_harvests", kind: "OCCURRED", ref: h.id });
        quantities.push({
          subjectKey: h.cropCycleId,
          kind: "ACTUAL",
          amount: h.quantityKg !== null ? observed(String(h.quantityKg), h.unit ?? "kg") : unavailable(),
          unit: h.unit ?? "kg",
          at: h.harvestDate,
          label: `Harvest ${h.code} grade ${h.qualityGrade ?? "ungraded"}`,
        });
      }
    }

    /* Weather + env metrics (6D) — existing epistemic status preserved */
    if (wants.has("6D")) {
      const weather = await db.select().from(s.weatherReadings).where(eq(s.weatherReadings.tenantId, tenantId)).orderBy(desc(s.weatherReadings.capturedAt)).limit(limit * 4);
      for (const w of weather) {
        // farmId is nullable on weather readings; an unattached or out-of-scope
        // reading is skipped (fail-closed), never widened to tenant level.
        if (w.farmId === null || !farmIds.includes(w.farmId)) continue;
        if (!rowVisible(w.classification, allowed)) continue;
        const at = w.capturedAt.toISOString();
        const status = (w.epistemicStatus ?? "OBSERVED") as AdapterDataset["performance"][number]["reading"]["status"];
        if (w.temperatureC !== null) performance.push({ subjectKey: w.farmId, kind: "CLIMATE", code: "TEMPERATURE_C", reading: { value: Number(w.temperatureC), status, unit: "°C", observedAt: at }, at });
        if (w.rainfallMm !== null) performance.push({ subjectKey: w.farmId, kind: "CLIMATE", code: "RAINFALL_MM", reading: { value: Number(w.rainfallMm), status, unit: "mm", observedAt: at }, at });
        if (w.humidityPct !== null) performance.push({ subjectKey: w.farmId, kind: "ENVIRONMENTAL_CONDITION", code: "HUMIDITY_PCT", reading: { value: Number(w.humidityPct), status, unit: "%", observedAt: at }, at });
      }
      const envMetrics = await db.select().from(s.envMetrics).where(eq(s.envMetrics.tenantId, tenantId)).limit(limit * 4);
      for (const m of envMetrics) {
        if (m.farmId === null || !farmIds.includes(m.farmId)) continue;
        if (!rowVisible(m.classification, allowed)) continue;
        performance.push({
          subjectKey: m.farmId,
          kind: "SUSTAINABILITY",
          code: m.metricCode,
          reading: m.value !== null ? { value: Number(m.value), status: (m.epistemicStatus ?? "OBSERVED") as AdapterDataset["performance"][number]["reading"]["status"], unit: m.unit ?? null, observedAt: null } : unavailable(),
          at: null,
        });
      }
    }

    /* Equipment & service (7D) */
    if (wants.has("7D")) {
      const equipment = await db.select().from(s.equipment).where(eq(s.equipment.tenantId, tenantId)).limit(limit * 2);
      for (const e of equipment) {
        if (e.farmId === null || !farmIds.includes(e.farmId)) continue;
        if (!rowVisible(e.classification, allowed)) continue;
        objects.push({
          id: e.id,
          label: `${e.code} — ${e.name}`,
          layerId: "agri-equipment",
          classification: e.classification as Classification,
          geometry: null,
          dimensionValues: { "7D": observed(e.status), "1D": observed(e.equipmentKind) },
          accessibleText: `Agricultural equipment ${e.code} ${e.name} (${e.equipmentKind}), serial ${e.serialNo ?? "unknown"}, status ${e.status}, acquired ${e.acquiredOn ?? "unknown"}.`,
          timeAnchor: e.acquiredOn ?? null,
          sourceRef: `agriculture_equipment:${e.id}`,
          status: e.status,
        });
        const stage = mapStatusToStage(e.status);
        if (stage) lifecycle.push({ subjectKey: e.id, stage, at: e.acquiredOn ?? null, sourceStatus: e.status, source: "agriculture_equipment" });
      }
      const services = await db.select().from(s.equipmentService).where(eq(s.equipmentService.tenantId, tenantId)).limit(limit * 4);
      for (const sv of services.filter((r) => rowVisible(r.classification, allowed))) {
        lifecycle.push({ subjectKey: sv.equipmentId, stage: "UNDER_MAINTENANCE", at: sv.serviceDate, sourceStatus: sv.serviceKind, source: "agriculture_equipment_service" });
      }
    }

    /* Hazards + safety incidents (8D) */
    if (wants.has("8D")) {
      const hazards = await db.select().from(s.hazardRegister).where(eq(s.hazardRegister.tenantId, tenantId)).limit(limit * 4);
      for (const h of hazards.filter((r) => rowVisible(r.classification, allowed) && (r.farmId === null || farmIds.includes(r.farmId)))) {
        risk.push({
          subjectKey: h.farmId ?? tenantId,
          kind: "HAZARD",
          // Severity is DERIVED deterministically from the register's own
          // likelihood × impact scores (5×5 matrix) — never invented.
          severity: hazardScoreToSeverity(h.likelihood, h.impact),
          label: `${h.code} ${h.title} (${h.hazardKind})`,
          at: h.createdAt.toISOString(),
          state: h.status === "CLOSED" ? "CLOSED" : "OPEN",
        });
      }
      const incidents = await db.select().from(s.safetyIncidents).where(eq(s.safetyIncidents.tenantId, tenantId)).limit(limit * 4);
      for (const i of incidents) {
        if (i.farmId === null || !farmIds.includes(i.farmId)) continue;
        if (!rowVisible(i.classification, allowed)) continue;
        risk.push({
          subjectKey: i.farmId,
          kind: "INCIDENT",
          severity: mapSeverity(i.severity),
          label: i.title,
          at: i.occurredOn ?? null,
          state: i.status === "CLOSED" || i.status === "RESOLVED" ? "CLOSED" : "OPEN",
        });
        if (i.occurredOn) time.push({ at: i.occurredOn, label: `Safety incident: ${i.title}`, source: "agriculture_safety_incidents", kind: "OCCURRED", ref: i.id });
      }
    }

    return { sector: "AGRICULTURE", status: "OK", objects, time, quantities, performance, lifecycle, risk, relationships: [], systemOfRecord: SYSTEM_OF_RECORD };
  },
};
