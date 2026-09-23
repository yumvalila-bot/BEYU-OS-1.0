/**
 * UJENZI OS — construction sector operational schema.
 *
 * Ujenzi is a Sector OS under BEYU OS. It owns construction operational
 * records only: projects, sites, phases, milestones, BOQ versions, cost
 * records, procurement, materials, equipment, site diaries, quality, HSE,
 * variations, claims, payment certificates and handover punch lists.
 *
 * It does NOT own identity, HCM, journals, treasury, capital execution,
 * documents, approvals, notifications or AI — those remain canonical BEYU
 * shared capabilities that Ujenzi consumes. Finance OS remains the only
 * journal writer: a Ujenzi payment certificate is a valuation record that
 * emits PAYMENT_CERTIFIED; it never posts a journal. CAP_POSTING stays LOCKED.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { countries, legalEntities, tenants } from "./core";
import { tsvector } from "./search";

export const UJENZI_STATUS = {
  PROJECT: ["PLANNED", "ACTIVE", "COMPLETED", "HANDED_OVER", "ARCHIVED"],
  BOQ: ["DRAFT", "SUBMITTED", "APPROVED", "SUPERSEDED"],
  COST_KIND: ["ESTIMATE", "BUDGET", "COMMITTED", "ACTUAL", "FORECAST"],
  REQUISITION: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CONVERTED"],
  PURCHASE_ORDER: ["DRAFT", "APPROVED", "ISSUED", "RECEIVED", "CANCELLED"],
  MOVEMENT: ["RECEIPT", "ISSUE", "RETURN", "WASTAGE"],
  NCR: ["OPEN", "ACTION_TAKEN", "VERIFIED", "CLOSED"],
  INSPECTION: ["PENDING", "PASSED", "FAILED", "REJECTED"],
  INCIDENT: ["REPORTED", "INVESTIGATING", "RESOLVED"],
  VARIATION: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "IMPLEMENTED"],
  CLAIM: ["NOTIFIED", "UNDER_REVIEW", "DECIDED", "SETTLED", "WITHDRAWN"],
  CERTIFICATE: ["DRAFT", "CERTIFIED", "SUPERSEDED"],
  PUNCH: ["OPEN", "IN_PROGRESS", "CLOSED", "VERIFIED"],
} as const;

export const ujenziProjects = pgTable(
  "ujenzi_projects",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.code),
    client: text("client"),
    /** Reference to a record in the canonical governed contracts domain. */
    contractRef: text("contract_ref"),
    contractValue: numeric("contract_value", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("TZS"),
    status: text("status").notNull().default("PLANNED"),
    region: text("region"),
    location: text("location"),
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    startDate: text("start_date"),
    plannedEndDate: text("planned_end_date"),
    actualEndDate: text("actual_end_date"),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Shared Search capability (0066): trigger-maintained tsvector, GIN-indexed.
    searchTsv: tsvector("search_tsv"),
  },
  (t) => [
    uniqueIndex("ujenzi_projects_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_projects_tenant_idx").on(t.tenantId),
    index("ujenzi_projects_entity_idx").on(t.legalEntityId),
    index("ujenzi_projects_status_idx").on(t.status),
    check("ujenzi_projects_status_ck", sql`status IN ('PLANNED','ACTIVE','COMPLETED','HANDED_OVER','ARCHIVED')`),
    index("ujenzi_projects_search_tsv_idx").on(t.searchTsv),
  ],
);

export const ujenziProjectSites = pgTable(
  "ujenzi_project_sites",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    location: text("location"),
    region: text("region"),
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_project_sites_project_code_uidx").on(t.projectId, t.code),
    index("ujenzi_project_sites_tenant_idx").on(t.tenantId),
    index("ujenzi_project_sites_project_idx").on(t.projectId),
  ],
);

export const ujenziProjectPhases = pgTable(
  "ujenzi_project_phases",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    plannedStart: text("planned_start"),
    plannedEnd: text("planned_end"),
    actualStart: text("actual_start"),
    actualEnd: text("actual_end"),
    progressPct: numeric("progress_pct", { precision: 5, scale: 2 }),
    status: text("status").notNull().default("PLANNED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_project_phases_project_code_uidx").on(t.projectId, t.code),
    index("ujenzi_project_phases_tenant_idx").on(t.tenantId),
    index("ujenzi_project_phases_project_idx").on(t.projectId),
  ],
);

export const ujenziMilestones = pgTable(
  "ujenzi_milestones",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    phaseId: text("phase_id").references(() => ujenziProjectPhases.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    dueDate: text("due_date"),
    achievedDate: text("achieved_date"),
    status: text("status").notNull().default("PLANNED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_milestones_project_code_uidx").on(t.projectId, t.code),
    index("ujenzi_milestones_tenant_idx").on(t.tenantId),
    index("ujenzi_milestones_project_idx").on(t.projectId),
  ],
);

export const ujenziBoqs = pgTable(
  "ujenzi_boqs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    version: integer("version").notNull(),
    status: text("status").notNull().default("DRAFT"),
    currency: text("currency").notNull().default("TZS"),
    totalValue: numeric("total_value", { precision: 18, scale: 2 }),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Shared Search capability (0066): trigger-maintained tsvector, GIN-indexed.
    // The row carries no free-text name; the generated surface includes the
    // capability vocabulary ("boq", "bill of quantities") plus status/currency/notes.
    searchTsv: tsvector("search_tsv"),
  },
  (t) => [
    uniqueIndex("ujenzi_boqs_project_version_uidx").on(t.projectId, t.version),
    index("ujenzi_boqs_tenant_idx").on(t.tenantId),
    index("ujenzi_boqs_project_idx").on(t.projectId),
    index("ujenzi_boqs_status_idx").on(t.status),
    check("ujenzi_boqs_status_ck", sql`status IN ('DRAFT','SUBMITTED','APPROVED','SUPERSEDED')`),
    check("ujenzi_boqs_version_ck", sql`version >= 1`),
    index("ujenzi_boqs_search_tsv_idx").on(t.searchTsv),
  ],
);

export const ujenziBoqItems = pgTable(
  "ujenzi_boq_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    boqId: text("boq_id")
      .notNull()
      .references(() => ujenziBoqs.id),
    code: text("code").notNull(),
    description: text("description").notNull(),
    section: text("section"),
    unit: text("unit").notNull(),
    quantity: numeric("quantity", { precision: 16, scale: 3 }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 4 }).notNull(),
    costCode: text("cost_code"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_boq_items_boq_code_uidx").on(t.boqId, t.code),
    index("ujenzi_boq_items_tenant_idx").on(t.tenantId),
    index("ujenzi_boq_items_boq_idx").on(t.boqId),
  ],
);

export const ujenziCostRecords = pgTable(
  "ujenzi_cost_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    kind: text("kind").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("TZS"),
    costCode: text("cost_code"),
    description: text("description"),
    /** Optional governed link to the record that created this cost line. */
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    eventDate: text("event_date"),
    recordedBy: text("recorded_by"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ujenzi_cost_records_tenant_idx").on(t.tenantId),
    index("ujenzi_cost_records_project_idx").on(t.projectId),
    index("ujenzi_cost_records_kind_idx").on(t.kind),
    check(
      "ujenzi_cost_records_kind_ck",
      sql`kind IN ('ESTIMATE','BUDGET','COMMITTED','ACTUAL','FORECAST')`,
    ),
  ],
);

export const ujenziRequisitions = pgTable(
  "ujenzi_requisitions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    description: text("description").notNull(),
    requiredBy: text("required_by"),
    status: text("status").notNull().default("DRAFT"),
    requestedBy: text("requested_by"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_requisitions_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_requisitions_tenant_idx").on(t.tenantId),
    index("ujenzi_requisitions_project_idx").on(t.projectId),
    index("ujenzi_requisitions_status_idx").on(t.status),
    check("ujenzi_requisitions_status_ck", sql`status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','CONVERTED')`),
  ],
);

export const ujenziPurchaseOrders = pgTable(
  "ujenzi_purchase_orders",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    requisitionId: text("requisition_id").references(() => ujenziRequisitions.id),
    code: text("code").notNull(),
    supplierName: text("supplier_name"),
    description: text("description"),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("TZS"),
    status: text("status").notNull().default("DRAFT"),
    orderDate: text("order_date"),
    expectedDelivery: text("expected_delivery"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_purchase_orders_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_purchase_orders_tenant_idx").on(t.tenantId),
    index("ujenzi_purchase_orders_project_idx").on(t.projectId),
    index("ujenzi_purchase_orders_status_idx").on(t.status),
    check("ujenzi_purchase_orders_status_ck", sql`status IN ('DRAFT','APPROVED','ISSUED','RECEIVED','CANCELLED')`),
  ],
);

export const ujenziMaterialCatalog = pgTable(
  "ujenzi_material_catalog",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    unit: text("unit").notNull().default("UNIT"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_material_catalog_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_material_catalog_tenant_idx").on(t.tenantId),
  ],
);

export const ujenziMaterialMovements = pgTable(
  "ujenzi_material_movements",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    siteId: text("site_id").references(() => ujenziProjectSites.id),
    materialId: text("material_id")
      .notNull()
      .references(() => ujenziMaterialCatalog.id),
    movementType: text("movement_type").notNull(),
    quantity: numeric("quantity", { precision: 16, scale: 3 }).notNull(),
    unit: text("unit").notNull(),
    unitCost: numeric("unit_cost", { precision: 18, scale: 4 }),
    reference: text("reference"),
    movedBy: text("moved_by"),
    movedOn: text("moved_on"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ujenzi_material_movements_tenant_idx").on(t.tenantId),
    index("ujenzi_material_movements_project_idx").on(t.projectId),
    index("ujenzi_material_movements_material_idx").on(t.materialId),
    check("ujenzi_material_movements_type_ck", sql`movement_type IN ('RECEIPT','ISSUE','RETURN','WASTAGE')`),
  ],
);

export const ujenziEquipment = pgTable(
  "ujenzi_equipment",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    equipmentType: text("equipment_type"),
    ownership: text("ownership").notNull().default("OWNED"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_equipment_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_equipment_tenant_idx").on(t.tenantId),
    check("ujenzi_equipment_ownership_ck", sql`ownership IN ('OWNED','LEASED','HIRED')`),
  ],
);

export const ujenziEquipmentAllocations = pgTable(
  "ujenzi_equipment_allocations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => ujenziEquipment.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    allocatedFrom: text("allocated_from"),
    allocatedTo: text("allocated_to"),
    notes: text("notes"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ujenzi_equipment_allocations_tenant_idx").on(t.tenantId),
    index("ujenzi_equipment_allocations_equipment_idx").on(t.equipmentId),
    index("ujenzi_equipment_allocations_project_idx").on(t.projectId),
  ],
);

export const ujenziSiteDiaries = pgTable(
  "ujenzi_site_diaries",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    siteId: text("site_id").references(() => ujenziProjectSites.id),
    diaryDate: text("diary_date").notNull(),
    weather: text("weather"),
    labourCount: integer("labour_count"),
    labourHours: numeric("labour_hours", { precision: 12, scale: 2 }),
    workDone: text("work_done"),
    hindrances: text("hindrances"),
    recordedBy: text("recorded_by"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ujenzi_site_diaries_tenant_idx").on(t.tenantId),
    index("ujenzi_site_diaries_project_idx").on(t.projectId),
    index("ujenzi_site_diaries_project_date_idx").on(t.projectId, t.diaryDate),
  ],
);

export const ujenziInspectionRequests = pgTable(
  "ujenzi_inspection_requests",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    inspectionType: text("inspection_type").notNull(),
    requestedFor: text("requested_for"),
    requestedBy: text("requested_by"),
    inspector: text("inspector"),
    result: text("result").notNull().default("PENDING"),
    findings: text("findings"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_inspection_requests_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_inspection_requests_tenant_idx").on(t.tenantId),
    index("ujenzi_inspection_requests_project_idx").on(t.projectId),
    index("ujenzi_inspection_requests_result_idx").on(t.result),
    check("ujenzi_inspection_requests_result_ck", sql`result IN ('PENDING','PASSED','FAILED','REJECTED')`),
  ],
);

export const ujenziNcrs = pgTable(
  "ujenzi_ncrs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull().default("MEDIUM"),
    raisedBy: text("raised_by"),
    raisedOn: text("raised_on"),
    correctiveAction: text("corrective_action"),
    dueDate: text("due_date"),
    status: text("status").notNull().default("OPEN"),
    closedBy: text("closed_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_ncrs_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_ncrs_tenant_idx").on(t.tenantId),
    index("ujenzi_ncrs_project_idx").on(t.projectId),
    index("ujenzi_ncrs_status_idx").on(t.status),
    check("ujenzi_ncrs_status_ck", sql`status IN ('OPEN','ACTION_TAKEN','VERIFIED','CLOSED')`),
    check("ujenzi_ncrs_severity_ck", sql`severity IN ('LOW','MEDIUM','HIGH','CRITICAL')`),
  ],
);

export const ujenziHseIncidents = pgTable(
  "ujenzi_hse_incidents",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    siteId: text("site_id").references(() => ujenziProjectSites.id),
    incidentType: text("incident_type").notNull().default("INCIDENT"),
    severity: text("severity").notNull().default("MEDIUM"),
    occurredAt: text("occurred_at"),
    description: text("description").notNull(),
    reportedBy: text("reported_by"),
    status: text("status").notNull().default("REPORTED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ujenzi_hse_incidents_tenant_idx").on(t.tenantId),
    index("ujenzi_hse_incidents_project_idx").on(t.projectId),
    index("ujenzi_hse_incidents_status_idx").on(t.status),
    check("ujenzi_hse_incidents_type_ck", sql`incident_type IN ('INCIDENT','NEAR_MISS')`),
    check("ujenzi_hse_incidents_severity_ck", sql`severity IN ('LOW','MEDIUM','HIGH','CRITICAL')`),
  ],
);

export const ujenziHazardRegister = pgTable(
  "ujenzi_hazard_register",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    hazard: text("hazard").notNull(),
    riskLevel: text("risk_level").notNull().default("MEDIUM"),
    mitigation: text("mitigation"),
    status: text("status").notNull().default("OPEN"),
    identifiedBy: text("identified_by"),
    identifiedOn: text("identified_on"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ujenzi_hazard_register_tenant_idx").on(t.tenantId),
    index("ujenzi_hazard_register_project_idx").on(t.projectId),
    check("ujenzi_hazard_register_risk_ck", sql`risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')`),
  ],
);

export const ujenziToolboxTalks = pgTable(
  "ujenzi_toolbox_talks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    talkDate: text("talk_date").notNull(),
    topic: text("topic").notNull(),
    attendees: integer("attendees"),
    deliveredBy: text("delivered_by"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ujenzi_toolbox_talks_tenant_idx").on(t.tenantId),
    index("ujenzi_toolbox_talks_project_idx").on(t.projectId),
  ],
);

export const ujenziVariations = pgTable(
  "ujenzi_variations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    reason: text("reason"),
    description: text("description"),
    costImpact: numeric("cost_impact", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("TZS"),
    scheduleImpactDays: integer("schedule_impact_days"),
    status: text("status").notNull().default("SUBMITTED"),
    submittedBy: text("submitted_by"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_variations_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_variations_tenant_idx").on(t.tenantId),
    index("ujenzi_variations_project_idx").on(t.projectId),
    index("ujenzi_variations_status_idx").on(t.status),
    check("ujenzi_variations_status_ck", sql`status IN ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','IMPLEMENTED')`),
  ],
);

export const ujenziClaims = pgTable(
  "ujenzi_claims",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    claimant: text("claimant"),
    respondent: text("respondent"),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("TZS"),
    noticeDate: text("notice_date"),
    description: text("description"),
    /** Optional governed link to evidence in the canonical documents registry. */
    evidenceRef: text("evidence_ref"),
    status: text("status").notNull().default("NOTIFIED"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_claims_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_claims_tenant_idx").on(t.tenantId),
    index("ujenzi_claims_project_idx").on(t.projectId),
    index("ujenzi_claims_status_idx").on(t.status),
    check("ujenzi_claims_status_ck", sql`status IN ('NOTIFIED','UNDER_REVIEW','DECIDED','SETTLED','WITHDRAWN')`),
  ],
);

export const ujenziPaymentCertificates = pgTable(
  "ujenzi_payment_certificates",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    certificateNo: integer("certificate_no").notNull(),
    periodFrom: text("period_from"),
    periodTo: text("period_to"),
    grossValue: numeric("gross_value", { precision: 18, scale: 2 }).notNull(),
    retention: numeric("retention", { precision: 18, scale: 2 }).notNull().default("0"),
    netValue: numeric("net_value", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("TZS"),
    status: text("status").notNull().default("DRAFT"),
    certifiedBy: text("certified_by"),
    certifiedAt: timestamp("certified_at", { withTimezone: true }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_payment_certificates_tenant_code_uidx").on(t.tenantId, t.code),
    uniqueIndex("ujenzi_payment_certificates_project_no_uidx").on(t.projectId, t.certificateNo),
    index("ujenzi_payment_certificates_tenant_idx").on(t.tenantId),
    index("ujenzi_payment_certificates_project_idx").on(t.projectId),
    index("ujenzi_payment_certificates_status_idx").on(t.status),
    check("ujenzi_payment_certificates_status_ck", sql`status IN ('DRAFT','CERTIFIED','SUPERSEDED')`),
  ],
);

export const ujenziPunchItems = pgTable(
  "ujenzi_punch_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    description: text("description").notNull(),
    category: text("category"),
    status: text("status").notNull().default("OPEN"),
    raisedBy: text("raised_by"),
    raisedOn: text("raised_on"),
    closedBy: text("closed_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_punch_items_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_punch_items_tenant_idx").on(t.tenantId),
    index("ujenzi_punch_items_project_idx").on(t.projectId),
    index("ujenzi_punch_items_status_idx").on(t.status),
    check("ujenzi_punch_items_status_ck", sql`status IN ('OPEN','IN_PROGRESS','CLOSED','VERIFIED')`),
  ],
);
