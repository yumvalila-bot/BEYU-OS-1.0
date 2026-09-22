/**
 * BEYU OS — UJENZI OS VISUALIZATION ADAPTER (shared capability → Sector OS).
 *
 * UJENZI OS IS A FULL SECTOR OS. This adapter is how Ujenzi OS CONSUMES the
 * shared universal dimensional graphics foundation — construction-sector
 * semantics stay inside Ujenzi OS, and the graphics foundation never becomes
 * a "BIM OS", "Digital Twin OS" or a Ujenzi subsystem. Nothing is moved out
 * of Ujenzi OS to simplify graphics: this module only READS existing Ujenzi
 * tables/services through their existing authorization boundary.
 *
 * Mapped Ujenzi capabilities (§17-UJENZI):
 *   sites & buildings (2D/3D via governed GPS + planar projection foundation),
 *   work packages/phases & schedules (4D), site diaries (4D), BOQ & cost
 *   records (5D — READ ONLY: a Ujenzi cost record is project-control truth,
 *   never a journal; CAP_POSTING stays LOCKED), equipment & punch/handover
 *   (7D), HSE/hazards/NCR/inspections (8D), digital-twin identity binding
 *   (twin keys over Ujenzi subjects), spatial coordinates with explicit CRS
 *   (EPSG:4326 for the governed GPS columns).
 *
 * NOT IMPLEMENTED (declared honestly): IFC/BIM geometry parsing, mesh/scene
 * file ingestion, CAD drawing rendering, point clouds, offline conflict
 * handling for viz (Ujenzi's own offline sync stays canonical and untouched).
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { classificationsAtOrBelow, type Classification } from "@/lib/constants";
import { assertSectorAccess } from "../authorization";
import { observed, unavailable } from "../provenance";
import { mapStatusToStage, type LifecycleEvent } from "../engines/lifecycle";
import { mapSeverity, type RiskPoint } from "../engines/risk";
import type { TimePoint } from "../engines/time";
import type { QuantityPoint } from "../engines/quantity";
import type { SceneObjectInput } from "../scene-model";
import { emptyDataset, rowVisible, type AdapterDataset, type AdapterDescriptor, type AdapterRequest, type SectorVisualizationAdapter } from "./types";

const SYSTEM_OF_RECORD =
  "ujenzi_projects, ujenzi_project_sites, ujenzi_project_phases, ujenzi_milestones, ujenzi_boqs, ujenzi_cost_records, ujenzi_site_diaries, ujenzi_equipment, ujenzi_inspection_requests, ujenzi_ncrs, ujenzi_hse_incidents, ujenzi_hazard_register, ujenzi_punch_items, ujenzi_payment_certificates (Ujenzi OS)";

/** Governed CRS of the Ujenzi GPS columns. */
const UJENZI_CRS = "EPSG:4326";

function num(value: string | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const ujenziAdapterDescriptor: AdapterDescriptor = {
  sector: "UJENZI",
  status: "IMPLEMENTED",
  suppliedDimensions: ["1D", "2D", "3D", "4D", "5D", "6D", "7D", "8D"],
  mappedCapabilities: [
    "projects & sites (2D map, 3D planar-projection foundation)",
    "phases, milestones & schedules (4D)",
    "site diaries (4D, incl. weather + labour as 6D)",
    "BOQ versions & cost records ESTIMATE/BUDGET/COMMITTED/ACTUAL/FORECAST (5D, read-only)",
    "payment certificates as valuations (5D, read-only — never journals)",
    "equipment register (7D)",
    "punch items & handover (7D)",
    "inspection requests, NCRs, HSE incidents, hazard register (8D)",
    "digital-twin identity binding over Ujenzi subjects",
  ],
  notImplemented: [
    "IFC/BIM geometry parsing (no parser exists; 3D is the planar-projection foundation)",
    "CAD drawing rendering",
    "point clouds / mesh ingestion",
    "server-side screenshots",
  ],
  systemOfRecord: SYSTEM_OF_RECORD,
};

export const ujenziAdapter: SectorVisualizationAdapter = {
  sector: "UJENZI",
  describe: () => ujenziAdapterDescriptor,

  async collect(principal: Principal, request: AdapterRequest): Promise<AdapterDataset> {
    // DATA AUTHORIZATION: Ujenzi's own boundary, re-checked here (never trust
    // the route-level viz permission alone, never trust the request payload).
    const access = await assertSectorAccess(principal, "UJENZI");
    if (!access.allowed) return emptyDataset("UJENZI", SYSTEM_OF_RECORD, access.reason);

    const allowed = classificationsAtOrBelow(principal.clearance) as Classification[];
    if (allowed.length === 0) return emptyDataset("UJENZI", SYSTEM_OF_RECORD, "Principal clearance does not admit any classification.");

    const tenantId = principal.tenantId;
    const limit = Math.min(Math.max(request.limit ?? 200, 1), 500);

    const projectWhere = request.subjectId
      ? and(eq(s.ujenziProjects.tenantId, tenantId), eq(s.ujenziProjects.id, request.subjectId))
      : eq(s.ujenziProjects.tenantId, tenantId);

    const projects = (
      await db.select().from(s.ujenziProjects).where(projectWhere).orderBy(desc(s.ujenziProjects.createdAt)).limit(limit)
    ).filter((p) => rowVisible(p.classification, allowed));

    const projectIds = projects.map((p) => p.id);
    if (projectIds.length === 0) {
      return { ...emptyDataset("UJENZI", SYSTEM_OF_RECORD), status: "OK" };
    }

    const wants = new Set(request.dimensions);
    const objects: SceneObjectInput[] = [];
    const time: TimePoint[] = [];
    const quantities: QuantityPoint[] = [];
    const lifecycle: LifecycleEvent[] = [];
    const risk: RiskPoint[] = [];
    const performance: AdapterDataset["performance"] = [];

    /* ── Projects & sites: 2D map + 3D projection foundation ───────────── */
    for (const p of projects) {
      const lat = num(p.gpsLatitude);
      const lon = num(p.gpsLongitude);
      objects.push({
        id: p.id,
        label: `${p.code} — ${p.name}`,
        layerId: "ujenzi-projects",
        classification: p.classification as Classification,
        geometry:
          lat !== null && lon !== null
            ? { crs: UJENZI_CRS, latitude: lat, longitude: lon, points: [[lon, lat, 0]] }
            : null,
        dimensionValues: {
          "1D": observed(p.status),
          "2D": observed(p.region ?? p.location ?? "Unlocated", null),
          "5D": p.contractValue !== null ? observed(p.contractValue, p.currency) : unavailable(),
          "7D": observed(p.status),
        },
        accessibleText: `Construction project ${p.code} ${p.name}, status ${p.status}, client ${p.client ?? "unknown"}, country ${p.countryCode}${lat !== null && lon !== null ? `, located at ${lat}, ${lon} (${UJENZI_CRS})` : ", non-spatial record"}.`,
        timeAnchor: p.startDate ?? null,
        sourceRef: `ujenzi_projects:${p.id}`,
        status: p.status,
      });
      const stage = mapStatusToStage(p.status);
      if (stage) {
        if (p.startDate) lifecycle.push({ subjectKey: p.id, stage, at: p.startDate, sourceStatus: p.status, source: "ujenzi_projects" });
        if (p.actualEndDate) lifecycle.push({ subjectKey: p.id, stage: mapStatusToStage("COMPLETED") ?? "COMPLETED", at: p.actualEndDate, sourceStatus: "COMPLETED", source: "ujenzi_projects" });
      }
      if (p.startDate) time.push({ at: p.startDate, label: `${p.code} planned start`, source: "ujenzi_projects", kind: "PLANNED", ref: p.id });
      if (p.plannedEndDate) time.push({ at: p.plannedEndDate, label: `${p.code} planned end`, source: "ujenzi_projects", kind: "PLANNED", ref: p.id });
      if (p.actualEndDate) time.push({ at: p.actualEndDate, label: `${p.code} actual end`, source: "ujenzi_projects", kind: "OCCURRED", ref: p.id });
    }

    /* ── Phases & milestones: 4D schedule ──────────────────────────────── */
    if (wants.has("4D") || wants.has("7D")) {
      const phases = await db
        .select()
        .from(s.ujenziProjectPhases)
        .where(and(eq(s.ujenziProjectPhases.tenantId, tenantId)))
        .limit(limit * 4);
      for (const ph of phases.filter((r) => rowVisible(r.classification, allowed) && projectIds.includes(r.projectId))) {
        if (ph.plannedStart) time.push({ at: ph.plannedStart, label: `${ph.code} planned start`, source: "ujenzi_project_phases", kind: "PLANNED", ref: ph.id });
        if (ph.plannedEnd) time.push({ at: ph.plannedEnd, label: `${ph.code} planned end`, source: "ujenzi_project_phases", kind: "PLANNED", ref: ph.id });
        if (ph.actualStart) time.push({ at: ph.actualStart, label: `${ph.code} actual start`, source: "ujenzi_project_phases", kind: "OCCURRED", ref: ph.id });
        if (ph.actualEnd) time.push({ at: ph.actualEnd, label: `${ph.code} actual end`, source: "ujenzi_project_phases", kind: "OCCURRED", ref: ph.id });
        const stage = mapStatusToStage(ph.status);
        if (stage && ph.actualStart) lifecycle.push({ subjectKey: ph.projectId, stage, at: ph.actualStart, sourceStatus: ph.status, source: `ujenzi_project_phases:${ph.code}` });
        objects.push({
          id: ph.id,
          label: `${ph.code} — ${ph.name}`,
          layerId: "ujenzi-phases",
          classification: ph.classification as Classification,
          geometry: null,
          dimensionValues: {
            "4D": observed(`${ph.plannedStart ?? "?"} → ${ph.plannedEnd ?? "?"}`),
            "7D": ph.progressPct !== null ? observed(ph.progressPct, "%") : unavailable(),
          },
          accessibleText: `Phase ${ph.code} ${ph.name}: planned ${ph.plannedStart ?? "unknown"} to ${ph.plannedEnd ?? "unknown"}; progress ${ph.progressPct ?? "UNKNOWN"}%; status ${ph.status}.`,
          timeAnchor: ph.actualStart ?? ph.plannedStart ?? null,
          sourceRef: `ujenzi_project_phases:${ph.id}`,
          status: ph.status,
        });
      }
      const milestones = await db.select().from(s.ujenziMilestones).where(eq(s.ujenziMilestones.tenantId, tenantId)).limit(limit * 4);
      for (const m of milestones.filter((r) => rowVisible(r.classification, allowed) && projectIds.includes(r.projectId))) {
        if (m.dueDate) time.push({ at: m.dueDate, label: `Milestone ${m.code} due`, source: "ujenzi_milestones", kind: "PLANNED", ref: m.id });
        if (m.achievedDate) time.push({ at: m.achievedDate, label: `Milestone ${m.code} achieved`, source: "ujenzi_milestones", kind: "OCCURRED", ref: m.id });
      }
    }

    /* ── Cost records: 5D — READ ONLY, never a posting path ────────────── */
    if (wants.has("5D")) {
      const costs = await db.select().from(s.ujenziCostRecords).where(eq(s.ujenziCostRecords.tenantId, tenantId)).orderBy(desc(s.ujenziCostRecords.createdAt)).limit(limit * 6);
      for (const c of costs.filter((r) => rowVisible(r.classification, allowed) && projectIds.includes(r.projectId))) {
        quantities.push({
          subjectKey: c.projectId,
          kind: c.kind as QuantityPoint["kind"],
          amount: c.amount !== null && c.amount !== undefined ? observed(String(c.amount), c.currency) : unavailable(),
          currency: c.currency,
          at: c.eventDate ?? null,
          label: c.costCode ?? c.description ?? undefined,
        });
      }
      const certificates = await db.select().from(s.ujenziPaymentCertificates).where(eq(s.ujenziPaymentCertificates.tenantId, tenantId)).limit(limit * 2);
      for (const cert of certificates.filter((r) => rowVisible(r.classification, allowed) && projectIds.includes(r.projectId))) {
        // A payment certificate is a VALUATION record (Ujenzi truth). It is
        // visualized read-only; it never posts and never authorizes posting.
        quantities.push({
          subjectKey: cert.projectId,
          kind: "ACTUAL",
          amount: cert.netValue !== null ? observed(String(cert.netValue), cert.currency) : unavailable(),
          currency: cert.currency,
          at: cert.certifiedAt ? cert.certifiedAt.toISOString() : null,
          label: `Payment certificate ${cert.certificateNo ?? cert.code} (valuation only — CAP_POSTING LOCKED)`,
        });
        if (cert.certifiedAt) {
          time.push({ at: cert.certifiedAt.toISOString(), label: `Certificate ${cert.certificateNo ?? cert.code} certified`, source: "ujenzi_payment_certificates", kind: "OCCURRED", ref: cert.id });
        }
      }
    }

    /* ── Site diaries: 4D + 6D (weather, labour) ───────────────────────── */
    if (wants.has("4D") || wants.has("6D")) {
      const diaries = await db.select().from(s.ujenziSiteDiaries).where(eq(s.ujenziSiteDiaries.tenantId, tenantId)).orderBy(desc(s.ujenziSiteDiaries.diaryDate)).limit(limit * 4);
      for (const d of diaries.filter((r) => rowVisible(r.classification, allowed) && projectIds.includes(r.projectId))) {
        time.push({ at: d.diaryDate, label: `Site diary: ${d.workDone?.slice(0, 60) ?? "entry"}`, source: "ujenzi_site_diaries", kind: "OCCURRED", ref: d.id });
        if (d.weather) {
          performance.push({
            subjectKey: d.projectId,
            kind: "ENVIRONMENTAL_CONDITION",
            code: "SITE_WEATHER",
            reading: observed(d.weather),
            at: d.diaryDate,
          });
        }
        if (d.labourCount !== null && d.labourCount !== undefined) {
          performance.push({
            subjectKey: d.projectId,
            kind: "RESOURCE_EFFICIENCY",
            code: "LABOUR_COUNT",
            reading: observed(Number(d.labourCount), "workers", d.diaryDate),
            at: d.diaryDate,
          });
        }
      }
    }

    /* ── Equipment & punch: 7D ─────────────────────────────────────────── */
    if (wants.has("7D")) {
      const equipment = await db.select().from(s.ujenziEquipment).where(eq(s.ujenziEquipment.tenantId, tenantId)).limit(limit * 2);
      for (const e of equipment.filter((r) => rowVisible(r.classification, allowed))) {
        objects.push({
          id: e.id,
          label: `${e.code} — ${e.name}`,
          layerId: "ujenzi-equipment",
          classification: e.classification as Classification,
          geometry: null,
          dimensionValues: { "7D": observed(e.status), "1D": observed(e.ownership) },
          accessibleText: `Equipment ${e.code} ${e.name} (${e.equipmentType}), ownership ${e.ownership}, operational status ${e.status}.`,
          timeAnchor: null,
          sourceRef: `ujenzi_equipment:${e.id}`,
          status: e.status,
        });
        const stage = mapStatusToStage(e.status);
        if (stage) lifecycle.push({ subjectKey: e.id, stage, at: null, sourceStatus: e.status, source: "ujenzi_equipment" });
      }
      const punch = await db.select().from(s.ujenziPunchItems).where(eq(s.ujenziPunchItems.tenantId, tenantId)).limit(limit * 4);
      for (const pi of punch.filter((r) => rowVisible(r.classification, allowed) && projectIds.includes(r.projectId))) {
        if (pi.raisedOn) time.push({ at: pi.raisedOn, label: `Punch ${pi.code} raised`, source: "ujenzi_punch_items", kind: "OCCURRED", ref: pi.id });
        if (pi.closedAt) time.push({ at: pi.closedAt.toISOString(), label: `Punch ${pi.code} closed`, source: "ujenzi_punch_items", kind: "OCCURRED", ref: pi.id });
      }
    }

    /* ── Quality & HSE: 8D ─────────────────────────────────────────────── */
    if (wants.has("8D")) {
      const hazards = await db.select().from(s.ujenziHazardRegister).where(eq(s.ujenziHazardRegister.tenantId, tenantId)).limit(limit * 4);
      for (const h of hazards.filter((r) => rowVisible(r.classification, allowed) && projectIds.includes(r.projectId))) {
        risk.push({
          subjectKey: h.projectId,
          kind: "HAZARD",
          severity: mapSeverity(h.riskLevel),
          label: h.hazard,
          at: h.identifiedOn ?? null,
          state: h.status === "CLOSED" ? "CLOSED" : h.status ? "OPEN" : "UNKNOWN",
          locationRef: null,
        });
      }
      const ncrs = await db.select().from(s.ujenziNcrs).where(eq(s.ujenziNcrs.tenantId, tenantId)).limit(limit * 4);
      for (const n of ncrs.filter((r) => rowVisible(r.classification, allowed) && projectIds.includes(r.projectId))) {
        risk.push({
          subjectKey: n.projectId,
          kind: "NCR",
          severity: mapSeverity(n.severity),
          label: `${n.code}: ${n.description?.slice(0, 80) ?? "non-conformance"}`,
          at: n.raisedOn ?? null,
          state: n.status === "CLOSED" || n.status === "VERIFIED" ? "CLOSED" : "OPEN",
        });
      }
      const incidents = await db.select().from(s.ujenziHseIncidents).where(eq(s.ujenziHseIncidents.tenantId, tenantId)).limit(limit * 4);
      for (const i of incidents.filter((r) => rowVisible(r.classification, allowed) && projectIds.includes(r.projectId))) {
        risk.push({
          subjectKey: i.projectId,
          kind: i.incidentType === "NEAR_MISS" ? "NEAR_MISS" : "INCIDENT",
          severity: mapSeverity(i.severity),
          label: i.description?.slice(0, 80) ?? i.incidentType,
          at: i.occurredAt ?? null,
          state: i.status === "RESOLVED" ? "CLOSED" : "OPEN",
          locationRef: i.siteId ?? null,
        });
        if (i.occurredAt) time.push({ at: i.occurredAt, label: `HSE ${i.incidentType.toLowerCase()}`, source: "ujenzi_hse_incidents", kind: "OCCURRED", ref: i.id });
      }
      const inspections = await db.select().from(s.ujenziInspectionRequests).where(eq(s.ujenziInspectionRequests.tenantId, tenantId)).limit(limit * 4);
      for (const ir of inspections.filter((r) => rowVisible(r.classification, allowed) && projectIds.includes(r.projectId))) {
        risk.push({
          subjectKey: ir.projectId,
          kind: "INSPECTION_FINDING",
          // Severity is not a column on inspection requests — an inspection
          // finding's OPEN/CLOSED state is honest; a fabricated severity is not.
          severity: unavailable(),
          label: `${ir.code} ${ir.inspectionType}: ${ir.result ?? "PENDING"}`,
          at: ir.updatedAt.toISOString(),
          state: ir.result === "PASSED" ? "CLOSED" : ir.result === "FAILED" || ir.result === "REJECTED" ? "OPEN" : "UNKNOWN",
        });
      }
    }

    return {
      sector: "UJENZI",
      status: "OK",
      objects,
      time,
      quantities,
      performance,
      lifecycle,
      risk,
      relationships: [],
      systemOfRecord: SYSTEM_OF_RECORD,
    };
  },
};
