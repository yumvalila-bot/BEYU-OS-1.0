/**
 * BEYU Ujenzi OS — ONE construction-sector operating system.
 *
 * All listed domains are capabilities inside Ujenzi OS, not inner OSs.
 * Finance OS remains the only journal writer. CAP_POSTING stays LOCKED.
 * HCM remains workforce identity truth. Noelia remains the only AI identity.
 */
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { countries, legalEntities, tenants } from "./core";

function ujzTenant() {
  return {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
  };
}

export const ujenziProjects = pgTable(
  "ujenzi_projects",
  {
    ...ujzTenant(),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    projectType: text("project_type").notNull().default("BUILDING"),
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.code),
    jurisdictionCode: text("jurisdiction_code"),
    region: text("region"),
    status: text("status").notNull().default("REGISTERED"),
    lifecycleStage: text("lifecycle_stage").notNull().default("BRIEF"),
    currency: text("currency").notNull().default("TZS"),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ujenzi_projects_tenant_code_uidx").on(t.tenantId, t.code),
    index("ujenzi_projects_tenant_idx").on(t.tenantId),
    index("ujenzi_projects_entity_idx").on(t.legalEntityId),
    index("ujenzi_projects_status_idx").on(t.status),
  ],
);

export const ujenziBriefs = pgTable(
  "ujenzi_briefs",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    objectives: text("objectives"),
    functionalRequirements: jsonb("functional_requirements").$type<unknown[]>().notNull().default([]),
    budgetEnvelope: numeric("budget_envelope", { precision: 18, scale: 2 }),
    qualityLevel: text("quality_level"),
    sustainabilityObjectives: text("sustainability_objectives"),
    constraints: text("constraints"),
    revision: integer("revision").notNull().default(1),
    status: text("status").notNull().default("DRAFT"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_briefs_project_code_uidx").on(t.projectId, t.code), index("ujenzi_briefs_tenant_idx").on(t.tenantId)],
);

export const ujenziDocuments = pgTable(
  "ujenzi_documents",
  {
    ...ujzTenant(),
    projectId: text("project_id").references(() => ujenziProjects.id),
    title: text("title").notNull(),
    category: text("category").notNull(),
    revision: text("revision").notNull().default("A"),
    uri: text("uri"),
    checksum: text("checksum"),
    provenance: text("provenance"),
    status: text("status").notNull().default("REGISTERED"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_documents_tenant_idx").on(t.tenantId)],
);

export const ujenziDesignRevisions = pgTable(
  "ujenzi_design_revisions",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    discipline: text("discipline").notNull().default("ARCHITECTURE"),
    revisionCode: text("revision_code").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("IN_DEVELOPMENT"),
    asBuilt: boolean("as_built").notNull().default(false),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_design_rev_uidx").on(t.projectId, t.discipline, t.revisionCode), index("ujenzi_design_rev_tenant_idx").on(t.tenantId)],
);

export const ujenziEngineeringCalculations = pgTable(
  "ujenzi_engineering_calculations",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    designRevisionId: text("design_revision_id").references(() => ujenziDesignRevisions.id),
    code: text("code").notNull(),
    discipline: text("discipline").notNull(),
    method: text("method").notNull(),
    formulaOrModel: text("formula_or_model").notNull(),
    standardCode: text("standard_code"),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    units: jsonb("units").$type<Record<string, string>>().notNull().default({}),
    assumptions: jsonb("assumptions").$type<unknown[]>().notNull().default([]),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    limitCheck: text("limit_check"),
    passFail: text("pass_fail").notNull().default("NEEDS_REVIEW"),
    epistemicStatus: text("epistemic_status").notNull().default("CALCULATED"),
    professionalCertification: text("professional_certification").notNull().default("NOT_CERTIFIED"),
    engineerUserId: text("engineer_user_id"),
    reviewerUserId: text("reviewer_user_id"),
    approvalState: text("approval_state").notNull().default("PENDING_REVIEW"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_eng_calc_uidx").on(t.tenantId, t.code), index("ujenzi_eng_calc_tenant_idx").on(t.tenantId)],
);

export const ujenziLandSites = pgTable(
  "ujenzi_land_sites",
  {
    ...ujzTenant(),
    projectId: text("project_id").references(() => ujenziProjects.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    countryCode: text("country_code").notNull().default("TZ"),
    parcelRef: text("parcel_ref"),
    ownershipClaimStatus: text("ownership_claim_status").notNull().default("USER_SUBMITTED"),
    areaM2: numeric("area_m2", { precision: 16, scale: 2 }),
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    /** Coordinate reference system; never mix silently. Default TZ mapping Arc 1960 / UTM 37S is config, not fabricated survey. */
    crs: text("crs").notNull().default("EPSG:4326"),
    geometrySource: text("geometry_source").notNull().default("USER_ENTERED"),
    geometryAccuracyM: numeric("geometry_accuracy_m", { precision: 10, scale: 3 }),
    floodExposure: text("flood_exposure"),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_land_sites_uidx").on(t.tenantId, t.code), index("ujenzi_land_sites_tenant_idx").on(t.tenantId)],
);

export const ujenziSoilTests = pgTable(
  "ujenzi_soil_tests",
  {
    ...ujzTenant(),
    siteId: text("site_id")
      .notNull()
      .references(() => ujenziLandSites.id),
    labName: text("lab_name"),
    sampledOn: text("sampled_on"),
    testKind: text("test_kind").notNull(),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull().default({}),
    assumedParameters: jsonb("assumed_parameters").$type<unknown[]>().notNull().default([]),
    dataStatus: text("data_status").notNull().default("DATA_REQUIRED"),
    epistemicStatus: text("epistemic_status").notNull().default("NOT_AVAILABLE"),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_soil_tests_tenant_idx").on(t.tenantId)],
);

export const ujenziBimModels = pgTable(
  "ujenzi_bim_models",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    format: text("format").notNull().default("IFC"),
    version: text("version").notNull().default("1"),
    federationStatus: text("federation_status").notNull().default("UNFEDERATED"),
    uri: text("uri"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_bim_uidx").on(t.projectId, t.code), index("ujenzi_bim_tenant_idx").on(t.tenantId)],
);

export const ujenziBoqItems = pgTable(
  "ujenzi_boq_items",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    itemCode: text("item_code").notNull(),
    description: text("description").notNull(),
    unit: text("unit").notNull(),
    quantity: numeric("quantity", { precision: 16, scale: 4 }).notNull(),
    rate: numeric("rate", { precision: 16, scale: 4 }),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    workPackage: text("work_package"),
    revision: integer("revision").notNull().default(1),
    sourceKind: text("source_kind").notNull().default("MANUAL"),
    sourceId: text("source_id"),
    journalsPosted: boolean("journals_posted").notNull().default(false),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_boq_uidx").on(t.projectId, t.itemCode, t.revision), index("ujenzi_boq_tenant_idx").on(t.tenantId)],
);

export const ujenziCostTrackers = pgTable(
  "ujenzi_cost_trackers",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    approvedBudget: numeric("approved_budget", { precision: 18, scale: 2 }),
    commitments: numeric("commitments", { precision: 18, scale: 2 }).notNull().default("0"),
    actuals: numeric("actuals", { precision: 18, scale: 2 }).notNull().default("0"),
    forecastFinalCost: numeric("forecast_final_cost", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("TZS"),
    financeHandoff: text("finance_handoff").notNull().default("TRACKER_ONLY"),
    journalsPosted: boolean("journals_posted").notNull().default(false),
    classification: text("classification").notNull().default("RESTRICTED"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_cost_project_uidx").on(t.projectId), index("ujenzi_cost_tenant_idx").on(t.tenantId)],
);

export const ujenziContracts = pgTable(
  "ujenzi_contracts",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    contractKind: text("contract_kind").notNull(),
    counterpartyName: text("counterparty_name").notNull(),
    value: numeric("value", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("TZS"),
    status: text("status").notNull().default("DRAFT"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_contracts_uidx").on(t.tenantId, t.code), index("ujenzi_contracts_tenant_idx").on(t.tenantId)],
);

export const ujenziVariations = pgTable(
  "ujenzi_variations",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    contractId: text("contract_id").references(() => ujenziContracts.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    costImpact: numeric("cost_impact", { precision: 18, scale: 2 }),
    scheduleImpactDays: integer("schedule_impact_days"),
    status: text("status").notNull().default("REQUESTED"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_variations_uidx").on(t.tenantId, t.code), index("ujenzi_variations_tenant_idx").on(t.tenantId)],
);

export const ujenziClaims = pgTable(
  "ujenzi_claims",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    status: text("status").notNull().default("SUBMITTED"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_claims_uidx").on(t.tenantId, t.code), index("ujenzi_claims_tenant_idx").on(t.tenantId)],
);

export const ujenziSuppliers = pgTable(
  "ujenzi_suppliers",
  {
    ...ujzTenant(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    countryCode: text("country_code").notNull().default("TZ"),
    status: text("status").notNull().default("REGISTERED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_suppliers_uidx").on(t.tenantId, t.code), index("ujenzi_suppliers_tenant_idx").on(t.tenantId)],
);

export const ujenziProcurementPackages = pgTable(
  "ujenzi_procurement_packages",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("PLAN"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_proc_uidx").on(t.tenantId, t.code), index("ujenzi_proc_tenant_idx").on(t.tenantId)],
);

export const ujenziContractors = pgTable(
  "ujenzi_contractors",
  {
    ...ujzTenant(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    classificationGrade: text("classification_grade"),
    countryCode: text("country_code").notNull().default("TZ"),
    status: text("status").notNull().default("REGISTERED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_contractors_uidx").on(t.tenantId, t.code), index("ujenzi_contractors_tenant_idx").on(t.tenantId)],
);

export const ujenziWorkers = pgTable(
  "ujenzi_workers",
  {
    ...ujzTenant(),
    globalUserId: text("global_user_id"),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    trade: text("trade").notNull(),
    verificationStatus: text("verification_status").notNull().default("SELF_DECLARED"),
    availability: text("availability").notNull().default("UNKNOWN"),
    contractorId: text("contractor_id").references(() => ujenziContractors.id),
    hcmEmployeeId: text("hcm_employee_id"),
    classification: text("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_workers_uidx").on(t.tenantId, t.code), index("ujenzi_workers_tenant_idx").on(t.tenantId)],
);

export const ujenziMaterials = pgTable(
  "ujenzi_materials",
  {
    ...ujzTenant(),
    projectId: text("project_id").references(() => ujenziProjects.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    specification: text("specification"),
    unit: text("unit").notNull().default("KG"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_materials_uidx").on(t.tenantId, t.code), index("ujenzi_materials_tenant_idx").on(t.tenantId)],
);

export const ujenziMaterialLots = pgTable(
  "ujenzi_material_lots",
  {
    ...ujzTenant(),
    materialId: text("material_id")
      .notNull()
      .references(() => ujenziMaterials.id),
    lotCode: text("lot_code").notNull(),
    supplierId: text("supplier_id").references(() => ujenziSuppliers.id),
    qtyReceived: numeric("qty_received", { precision: 16, scale: 4 }).notNull().default("0"),
    qtyIssued: numeric("qty_issued", { precision: 16, scale: 4 }).notNull().default("0"),
    certificateRef: text("certificate_ref"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_material_lots_uidx").on(t.materialId, t.lotCode), index("ujenzi_material_lots_tenant_idx").on(t.tenantId)],
);

export const ujenziEquipment = pgTable(
  "ujenzi_equipment",
  {
    ...ujzTenant(),
    projectId: text("project_id").references(() => ujenziProjects.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    equipmentKind: text("equipment_kind").notNull(),
    status: text("status").notNull().default("AVAILABLE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_equipment_uidx").on(t.tenantId, t.code), index("ujenzi_equipment_tenant_idx").on(t.tenantId)],
);

export const ujenziSiteReports = pgTable(
  "ujenzi_site_reports",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    reportDate: text("report_date").notNull(),
    body: text("body").notNull(),
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    offlineEnvelopeId: text("offline_envelope_id"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_site_reports_tenant_idx").on(t.tenantId)],
);

export const ujenziHseIncidents = pgTable(
  "ujenzi_hse_incidents",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    severity: text("severity").notNull().default("LOW"),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_hse_uidx").on(t.tenantId, t.code), index("ujenzi_hse_tenant_idx").on(t.tenantId)],
);

export const ujenziInspections = pgTable(
  "ujenzi_inspections",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    inspectedOn: text("inspected_on").notNull(),
    inspectionKind: text("inspection_kind").notNull().default("QAQC"),
    outcome: text("outcome").notNull().default("PENDING"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_inspections_tenant_idx").on(t.tenantId)],
);

export const ujenziProgressCertificates = pgTable(
  "ujenzi_progress_certificates",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    period: text("period").notNull(),
    certifiedAmount: numeric("certified_amount", { precision: 18, scale: 2 }),
    status: text("status").notNull().default("DRAFT"),
    financeHandoff: text("finance_handoff").notNull().default("SUBMITTED_PENDING_FINANCE"),
    journalsPosted: boolean("journals_posted").notNull().default(false),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_progress_uidx").on(t.tenantId, t.code), index("ujenzi_progress_tenant_idx").on(t.tenantId)],
);

export const ujenziInteriorPackages = pgTable(
  "ujenzi_interior_packages",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("CONCEPT"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_interior_uidx").on(t.tenantId, t.code), index("ujenzi_interior_tenant_idx").on(t.tenantId)],
);

export const ujenziFfeItems = pgTable(
  "ujenzi_ffe_items",
  {
    ...ujzTenant(),
    interiorPackageId: text("interior_package_id").references(() => ujenziInteriorPackages.id),
    projectId: text("project_id").references(() => ujenziProjects.id),
    itemCode: text("item_code").notNull(),
    specification: text("specification").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
    status: text("status").notNull().default("SPECIFIED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_ffe_tenant_idx").on(t.tenantId)],
);

export const ujenziComplianceRequirements = pgTable(
  "ujenzi_compliance_requirements",
  {
    ...ujzTenant(),
    code: text("code").notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    authority: text("authority").notNull(),
    source: text("source").notNull(),
    regulation: text("regulation").notNull(),
    version: text("version").notNull().default("1"),
    effectiveFrom: text("effective_from"),
    applicability: text("applicability"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_comp_req_uidx").on(t.tenantId, t.code), index("ujenzi_comp_req_tenant_idx").on(t.tenantId)],
);

export const ujenziGovernmentApplications = pgTable(
  "ujenzi_government_applications",
  {
    ...ujzTenant(),
    projectId: text("project_id").references(() => ujenziProjects.id),
    authority: text("authority").notNull(),
    applicationKind: text("application_kind").notNull(),
    reference: text("reference"),
    connectionStatus: text("connection_status").notNull().default("NOT_CONNECTED"),
    officialStatus: text("official_status").notNull().default("USER_ENTERED"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_gov_app_tenant_idx").on(t.tenantId)],
);

export const ujenziVision2050Scorecards = pgTable(
  "ujenzi_vision2050_scorecards",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    pillar: text("pillar").notNull(),
    metricCode: text("metric_code").notNull(),
    baseline: text("baseline"),
    target: text("target"),
    actual: text("actual"),
    evidence: text("evidence"),
    verification: text("verification").notNull().default("NOT_VERIFIED"),
    endorsementClaim: text("endorsement_claim").notNull().default("NONE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_v2050_tenant_idx").on(t.tenantId)],
);

export const ujenziHandoverPackages = pgTable(
  "ujenzi_handover_packages",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_handover_uidx").on(t.tenantId, t.code), index("ujenzi_handover_tenant_idx").on(t.tenantId)],
);

export const ujenziKnowledge = pgTable(
  "ujenzi_knowledge",
  {
    ...ujzTenant(),
    projectId: text("project_id").references(() => ujenziProjects.id),
    knowledgeLevel: text("knowledge_level").notNull().default("PROJECT"),
    title: text("title").notNull(),
    evidence: text("evidence"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    validation: text("validation").notNull().default("UNVALIDATED"),
    authorityGranted: boolean("authority_granted").notNull().default(false),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_knowledge_tenant_idx").on(t.tenantId)],
);

export const ujenziSyncEnvelopes = pgTable(
  "ujenzi_sync_envelopes",
  {
    ...ujzTenant(),
    envelopeId: text("envelope_id").notNull(),
    deviceId: text("device_id"),
    operation: text("operation").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    clientOccurredAt: timestamp("client_occurred_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("ACCEPTED"),
    actorUserId: text("actor_user_id"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_sync_uidx").on(t.tenantId, t.envelopeId), index("ujenzi_sync_tenant_idx").on(t.tenantId)],
);

/** Digital Twin graph — identifiers persist across the built-environment lifecycle. Not a Twin OS. */
export const ujenziBuildings = pgTable(
  "ujenzi_buildings",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    siteId: text("site_id").references(() => ujenziLandSites.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    occupancy: text("occupancy"),
    status: text("status").notNull().default("PLANNED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_buildings_uidx").on(t.projectId, t.code), index("ujenzi_buildings_tenant_idx").on(t.tenantId)],
);

export const ujenziLevels = pgTable(
  "ujenzi_levels",
  {
    ...ujzTenant(),
    buildingId: text("building_id")
      .notNull()
      .references(() => ujenziBuildings.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    elevationM: numeric("elevation_m", { precision: 10, scale: 3 }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_levels_uidx").on(t.buildingId, t.code), index("ujenzi_levels_tenant_idx").on(t.tenantId)],
);

export const ujenziSpaces = pgTable(
  "ujenzi_spaces",
  {
    ...ujzTenant(),
    levelId: text("level_id")
      .notNull()
      .references(() => ujenziLevels.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    useType: text("use_type"),
    areaM2: numeric("area_m2", { precision: 14, scale: 2 }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_spaces_uidx").on(t.levelId, t.code), index("ujenzi_spaces_tenant_idx").on(t.tenantId)],
);

export const ujenziElements = pgTable(
  "ujenzi_elements",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    spaceId: text("space_id").references(() => ujenziSpaces.id),
    buildingId: text("building_id").references(() => ujenziBuildings.id),
    code: text("code").notNull(),
    elementKind: text("element_kind").notNull(),
    ifcType: text("ifc_type"),
    materialCode: text("material_code"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_elements_uidx").on(t.projectId, t.code), index("ujenzi_elements_tenant_idx").on(t.tenantId)],
);

export const ujenziSystems = pgTable(
  "ujenzi_systems",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    systemKind: text("system_kind").notNull(),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_systems_uidx").on(t.projectId, t.code), index("ujenzi_systems_tenant_idx").on(t.tenantId)],
);

export const ujenziAssets = pgTable(
  "ujenzi_assets",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    elementId: text("element_id").references(() => ujenziElements.id),
    systemId: text("system_id").references(() => ujenziSystems.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    lifecycleState: text("lifecycle_state").notNull().default("DESIGNED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_assets_uidx").on(t.projectId, t.code), index("ujenzi_assets_tenant_idx").on(t.tenantId)],
);

export const ujenziModelObjects = pgTable(
  "ujenzi_model_objects",
  {
    ...ujzTenant(),
    bimModelId: text("bim_model_id")
      .notNull()
      .references(() => ujenziBimModels.id),
    elementId: text("element_id").references(() => ujenziElements.id),
    externalObjectId: text("external_object_id").notNull(),
    discipline: text("discipline"),
    provenance: text("provenance"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_model_objects_uidx").on(t.bimModelId, t.externalObjectId), index("ujenzi_model_objects_tenant_idx").on(t.tenantId)],
);

export const ujenziTwinEdges = pgTable(
  "ujenzi_twin_edges",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    fromKind: text("from_kind").notNull(),
    fromId: text("from_id").notNull(),
    toKind: text("to_kind").notNull(),
    toId: text("to_id").notNull(),
    relation: text("relation").notNull(),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_twin_edges_tenant_idx").on(t.tenantId), index("ujenzi_twin_edges_project_idx").on(t.projectId)],
);

export const ujenziProfessionals = pgTable(
  "ujenzi_professionals",
  {
    ...ujzTenant(),
    globalUserId: text("global_user_id"),
    displayName: text("display_name").notNull(),
    discipline: text("discipline").notNull(),
    registrationNumber: text("registration_number"),
    jurisdiction: text("jurisdiction").notNull().default("TZ"),
    verificationStatus: text("verification_status").notNull().default("USER_ENTERED"),
    expiresOn: text("expires_on"),
    classification: text("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_professionals_tenant_idx").on(t.tenantId)],
);

export const ujenziEngineeringStandards = pgTable(
  "ujenzi_engineering_standards",
  {
    ...ujzTenant(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    authority: text("authority").notNull(),
    jurisdiction: text("jurisdiction").notNull().default("TZ"),
    edition: text("edition"),
    effectiveFrom: text("effective_from"),
    source: text("source").notNull(),
    status: text("status").notNull().default("RECORDED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_eng_std_uidx").on(t.tenantId, t.code), index("ujenzi_eng_std_tenant_idx").on(t.tenantId)],
);

export const ujenziSurveyObservations = pgTable(
  "ujenzi_survey_observations",
  {
    ...ujzTenant(),
    siteId: text("site_id")
      .notNull()
      .references(() => ujenziLandSites.id),
    method: text("method").notNull(),
    crs: text("crs").notNull(),
    eastingOrLon: numeric("easting_or_lon", { precision: 18, scale: 8 }),
    northingOrLat: numeric("northing_or_lat", { precision: 18, scale: 8 }),
    elevationM: numeric("elevation_m", { precision: 12, scale: 4 }),
    accuracyM: numeric("accuracy_m", { precision: 10, scale: 4 }),
    source: text("source").notNull().default("USER_ENTERED"),
    observedOn: text("observed_on"),
    dataStatus: text("data_status").notNull().default("RECORDED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_survey_obs_tenant_idx").on(t.tenantId)],
);

export const ujenziGisDatasets = pgTable(
  "ujenzi_gis_datasets",
  {
    ...ujzTenant(),
    projectId: text("project_id").references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    format: text("format").notNull(),
    crs: text("crs").notNull(),
    featureCount: integer("feature_count").notNull().default(0),
    source: text("source").notNull(),
    license: text("license"),
    ingestStatus: text("ingest_status").notNull().default("REGISTERED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_gis_uidx").on(t.tenantId, t.code), index("ujenzi_gis_tenant_idx").on(t.tenantId)],
);

export const ujenziDefects = pgTable(
  "ujenzi_defects",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    inspectionId: text("inspection_id").references(() => ujenziInspections.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    severity: text("severity").notNull().default("MINOR"),
    status: text("status").notNull().default("OPEN"),
    locationNote: text("location_note"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_defects_uidx").on(t.tenantId, t.code), index("ujenzi_defects_tenant_idx").on(t.tenantId)],
);

export const ujenziRfis = pgTable(
  "ujenzi_rfis",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    question: text("question").notNull(),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_rfis_uidx").on(t.tenantId, t.code), index("ujenzi_rfis_tenant_idx").on(t.tenantId)],
);

export const ujenziScheduleActivities = pgTable(
  "ujenzi_schedule_activities",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    wbs: text("wbs"),
    durationDays: integer("duration_days"),
    predecessorCode: text("predecessor_code"),
    status: text("status").notNull().default("PLANNED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_sched_uidx").on(t.projectId, t.code), index("ujenzi_sched_tenant_idx").on(t.tenantId)],
);

export const ujenziBimArtifacts = pgTable(
  "ujenzi_bim_artifacts",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    discipline: text("discipline").notNull().default("ARCHITECTURE"),
    format: text("format").notNull(),
    checksum: text("checksum").notNull(),
    byteSize: integer("byte_size").notNull(),
    headerHint: text("header_hint"),
    ingestStatus: text("ingest_status").notNull().default("REGISTERED"),
    geometryParsed: boolean("geometry_parsed").notNull().default(false),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_bim_art_checksum_uidx").on(t.tenantId, t.checksum), index("ujenzi_bim_art_tenant_idx").on(t.tenantId)],
);

export const ujenziHazards = pgTable(
  "ujenzi_hazards",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    residualRisk: text("residual_risk").notNull().default("UNASSESSED"),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_hazards_uidx").on(t.tenantId, t.code), index("ujenzi_hazards_tenant_idx").on(t.tenantId)],
);

export const ujenziNearMisses = pgTable(
  "ujenzi_near_misses",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("RECORDED"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_near_miss_uidx").on(t.tenantId, t.code), index("ujenzi_near_miss_tenant_idx").on(t.tenantId)],
);

export const ujenziPermitsToWork = pgTable(
  "ujenzi_permits_to_work",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    permitKind: text("permit_kind").notNull(),
    status: text("status").notNull().default("REQUESTED"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_ptw_uidx").on(t.tenantId, t.code), index("ujenzi_ptw_tenant_idx").on(t.tenantId)],
);

export const ujenziCommissioningTests = pgTable(
  "ujenzi_commissioning_tests",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    systemName: text("system_name").notNull(),
    result: text("result").notNull().default("PENDING"),
    workflowState: text("workflow_state").notNull().default("PREPARED"),
    professionalCertification: text("professional_certification").notNull().default("NOT_CERTIFIED"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_comm_uidx").on(t.tenantId, t.code), index("ujenzi_comm_tenant_idx").on(t.tenantId)],
);

export const ujenziGisFeatures = pgTable(
  "ujenzi_gis_features",
  {
    ...ujzTenant(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => ujenziGisDatasets.id),
    featureIndex: integer("feature_index").notNull(),
    geometryType: text("geometry_type"),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_gis_feat_tenant_idx").on(t.tenantId), index("ujenzi_gis_feat_ds_idx").on(t.datasetId)],
);

export const ujenziQualityNcrs = pgTable(
  "ujenzi_quality_ncrs",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    twinObjectKind: text("twin_object_kind"),
    twinObjectId: text("twin_object_id"),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_ncr_uidx").on(t.tenantId, t.code), index("ujenzi_ncr_tenant_idx").on(t.tenantId)],
);

export const ujenziWorkOrders = pgTable(
  "ujenzi_work_orders",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    assetId: text("asset_id").references(() => ujenziAssets.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    workKind: text("work_kind").notNull().default("CORRECTIVE"),
    status: text("status").notNull().default("OPEN"),
    journalsPosted: boolean("journals_posted").notNull().default(false),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_wo_uidx").on(t.tenantId, t.code), index("ujenzi_wo_tenant_idx").on(t.tenantId)],
);

export const ujenziRealityCaptures = pgTable(
  "ujenzi_reality_captures",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    captureKind: text("capture_kind").notNull(),
    checksum: text("checksum").notNull(),
    byteSize: integer("byte_size").notNull(),
    computerVision: text("computer_vision").notNull().default("NOT_IMPLEMENTED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_rc_uidx").on(t.tenantId, t.code), index("ujenzi_rc_tenant_idx").on(t.tenantId)],
);

export const ujenziKnowledgeEdges = pgTable(
  "ujenzi_knowledge_edges",
  {
    ...ujzTenant(),
    knowledgeId: text("knowledge_id")
      .notNull()
      .references(() => ujenziKnowledge.id),
    relatedKind: text("related_kind").notNull(),
    relatedId: text("related_id").notNull(),
    relation: text("relation").notNull(),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_kedge_tenant_idx").on(t.tenantId)],
);

export const ujenziRfqs = pgTable(
  "ujenzi_rfqs",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("OPEN"),
    awardStatus: text("award_status").notNull().default("NOT_AWARDED"),
    journalsPosted: boolean("journals_posted").notNull().default(false),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_rfq_uidx").on(t.tenantId, t.code), index("ujenzi_rfq_tenant_idx").on(t.tenantId)],
);

export const ujenziQuotations = pgTable(
  "ujenzi_quotations",
  {
    ...ujzTenant(),
    rfqId: text("rfq_id")
      .notNull()
      .references(() => ujenziRfqs.id),
    supplierName: text("supplier_name").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("TZS"),
    status: text("status").notNull().default("RECEIVED"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_quote_tenant_idx").on(t.tenantId)],
);

export const ujenziDesignAlternatives = pgTable(
  "ujenzi_design_alternatives",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
    weightedScore: numeric("weighted_score", { precision: 12, scale: 4 }),
    approvalState: text("approval_state").notNull().default("UNAPPROVED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ujenzi_dalt_uidx").on(t.tenantId, t.code), index("ujenzi_dalt_tenant_idx").on(t.tenantId)],
);

export const ujenziComplianceEvaluations = pgTable(
  "ujenzi_compliance_evaluations",
  {
    ...ujzTenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => ujenziProjects.id),
    requirementId: text("requirement_id")
      .notNull()
      .references(() => ujenziComplianceRequirements.id),
    result: text("result").notNull().default("USER_ASSESSED"),
    officialStatus: text("official_status").notNull().default("NOT_CONNECTED"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ujenzi_ceval_tenant_idx").on(t.tenantId)],
);
