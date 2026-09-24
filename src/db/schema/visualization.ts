/**
 * UNIVERSAL DIMENSIONAL GRAPHICS FOUNDATION — shared capability schema.
 *
 * ONE shared BEYU capability (NOT an OS): the visualization/digital-twin
 * persistence seam of the Universal Dimensional Graphics, Visualization,
 * Simulation, Digital Twin & Future XR Foundation. Sector OSs — Health OS,
 * Finance OS, Agriculture OS and UJENZI OS (a full Sector OS) — consume the
 * capability through governed adapters; nothing here duplicates a sector
 * table, and no sector truth moves here.
 *
 * WHAT IS STORED (and what is deliberately NOT):
 *   • viz_dimension_extensions — governed 9D+ dimension registrations. The
 *     canonical 1D–8D + XD registry lives in code (src/lib/viz/dimensions.ts);
 *     extensions are tenant-owned rows so a new dimension NEVER requires a
 *     database redesign.
 *   • viz_scenes — saved visualization scene configurations (dimension
 *     activation, layers, renderer hints). A scene config is a REFERENCE to
 *     governed data, never a copy of it: manifests are always rebuilt live
 *     through the authorized adapter path, so a stale or leaked config can
 *     never serve unauthorized data.
 *   • viz_digital_twins — twin REGISTRATION/identity bindings only
 *     (twin_key ↔ sector subject). Twin state is re-derived live from adapter
 *     reads at request time; twins never cache sector truth.
 *   • viz_exports — the export ledger: every governed export records its
 *     content hash, size and requester (auditable evidence, §31).
 *
 * Constitutional invariants (mirroring 0031/0034/0035/0043):
 *   • every table is tenant-owned (tenant_id FK) with classification;
 *   • ENABLE + FORCE ROW LEVEL SECURITY with beyu_tenant_ids() policies —
 *     RLS is the final database boundary and is NEVER disabled for viz;
 *   • the runtime role receives only the grants it needs;
 *   • NO journal, treasury, ledger or posting column exists anywhere here —
 *     Finance OS remains the only journal writer; CAP_POSTING stays LOCKED.
 */
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { legalEntities, tenants } from "./core";
import { users } from "./identity";
import { classificationEnum } from "./enums";

export const VIZ_EXTENSION_STATUS = ["EXPERIMENTAL", "PLANNED", "AVAILABLE", "NOT_IMPLEMENTED", "RETIRED"] as const;
export const VIZ_SCENE_STATUS = ["ACTIVE", "ARCHIVED"] as const;
export const VIZ_TWIN_STATUS = ["REGISTERED", "ARCHIVED"] as const;
export const VIZ_EXPORT_FORMATS = ["JSON", "CSV", "SVG", "PNG", "PDF"] as const;

/* ────────────────────────────────────────────────────────────────────────────
 * HOLOGRAPH — governed spatial capability registries (migration 0067).
 *
 * Holograph is the canonical NAME of this shared capability (see
 * src/lib/viz/holograph.ts). These four tables extend the existing viz
 * persistence seam with the governed registries the capability canon requires:
 *
 *   • viz_assets            — the governed spatial ASSET registry: provenance,
 *                             source, version, integrity hash, classification,
 *                             tenant/entity scope. METADATA ONLY: the registry
 *                             never stores binary geometry, and format support
 *                             is declared honestly (no parser exists in this
 *                             repository for binary formats).
 *   • viz_devices           — the hardware-independent DEVICE registry: class
 *                             (WEB/DESKTOP/MOBILE/AR/VR/SPATIAL_DISPLAY/
 *                             VOLUMETRIC_DISPLAY/FUTURE_HOLOGRAPHIC_DEVICE),
 *                             honest rendering backend, governed lifecycle
 *                             (REGISTERED/ACTIVE/SUSPENDED/REVOKED/
 *                             NOT_IMPLEMENTED). FUTURE_HOLOGRAPHIC_DEVICE rows
 *                             can never be ACTIVE (no physical holographic
 *                             hardware support exists or is claimed).
 *   • viz_render_profiles   — named RENDER PROFILES binding a renderer kind to
 *                             a device class + quality tier + object ceiling.
 *                             Presentation only; a profile never widens data
 *                             access (the governed manifest is unchanged).
 *   • viz_interactions      — the governed INTERACTION ledger: every spatial
 *                             interaction request (presentation, navigation,
 *                             workflow/approval delegation) records actor,
 *                             target, outcome (ALLOWED/DENIED/DELEGATED) and
 *                             reason. Denials are first-class rows. Interactions
 *                             NEVER mutate sector data and NEVER post anything
 *                             (CAP_POSTING stays LOCKED).
 *
 * Same constitutional invariants as the rest of this file: tenant-owned,
 * classified, ENABLE + FORCE RLS with beyu_tenant_ids() policies, runtime-role
 * grants only, and NO journal/treasury/posting state anywhere.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Spatial asset types the registry can describe (metadata, not parsers). */
export const VIZ_ASSET_TYPES = [
  "GLTF",
  "GLB",
  "IFC",
  "BIM",
  "CAD",
  "MEDICAL_3D",
  "GEOGRAPHIC",
  "INFRASTRUCTURE",
  "BUILDING",
  "EQUIPMENT",
  "FARM",
  "VEHICLE",
  "ORGANIZATION",
  "FINANCE_OBJECT",
  "FOUNDATION_OBJECT",
] as const;

/** Honest per-type format support: which asset types this repository can
 * actually PRESENT today (live projection over the canonical registry) versus
 * which are registry-only (metadata stored, parsing NOT_IMPLEMENTED). The
 * service enforces this matrix — a caller can never claim a parser that does
 * not exist. */
export const VIZ_ASSET_FORMAT_SUPPORT: Record<string, "IMPLEMENTED" | "NOT_IMPLEMENTED"> = {
  // Live projections over canonical BEYU registries (no binary involved).
  ORGANIZATION: "IMPLEMENTED",
  FINANCE_OBJECT: "IMPLEMENTED",
  FOUNDATION_OBJECT: "IMPLEMENTED",
  // Binary geometry: registry metadata only; no parser is bundled.
  GLTF: "NOT_IMPLEMENTED",
  GLB: "NOT_IMPLEMENTED",
  IFC: "NOT_IMPLEMENTED",
  BIM: "NOT_IMPLEMENTED",
  CAD: "NOT_IMPLEMENTED",
  MEDICAL_3D: "NOT_IMPLEMENTED",
  GEOGRAPHIC: "NOT_IMPLEMENTED",
  INFRASTRUCTURE: "NOT_IMPLEMENTED",
  BUILDING: "NOT_IMPLEMENTED",
  EQUIPMENT: "NOT_IMPLEMENTED",
  FARM: "NOT_IMPLEMENTED",
  VEHICLE: "NOT_IMPLEMENTED",
};

export const VIZ_ASSET_STATUS = ["REGISTERED", "ARCHIVED"] as const;

/** Governed spatial asset registry (metadata only — never binary geometry). */
export const vizAssets = pgTable(
  "viz_assets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    name: text("name").notNull(),
    assetType: text("asset_type").notNull(),
    /** Honest format support for this asset's type (see VIZ_ASSET_FORMAT_SUPPORT). */
    formatSupport: text("format_support").notNull().default("NOT_IMPLEMENTED"),
    sourceSystem: text("source_system").notNull(),
    sourceObjectId: text("source_object_id").notNull(),
    version: integer("version").notNull().default(1),
    /** sha256 of the referenced content (integrity evidence for the asset the
     * registry points at; the bytes themselves never live here). */
    integrityHash: text("integrity_hash").notNull(),
    /** Reference to externally managed storage (path/URI/key). NEVER an
     * embedded blob and never an authorization grant. */
    storageRef: text("storage_ref").notNull(),
    provenance: jsonb("provenance")
      .$type<{ registeredBy: string; rationale: string; importedAt: string; sourceVersion?: string }>()
      .notNull(),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    status: text("status").notNull().default("REGISTERED"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("viz_assets_tenant_source_uidx").on(t.tenantId, t.sourceSystem, t.sourceObjectId),
    index("viz_assets_tenant_idx").on(t.tenantId),
    index("viz_assets_type_idx").on(t.assetType),
    check(
      "viz_assets_type_ck",
      sql`${t.assetType} IN ('GLTF','GLB','IFC','BIM','CAD','MEDICAL_3D','GEOGRAPHIC','INFRASTRUCTURE','BUILDING','EQUIPMENT','FARM','VEHICLE','ORGANIZATION','FINANCE_OBJECT','FOUNDATION_OBJECT')`,
    ),
    check("viz_assets_status_ck", sql`${t.status} IN ('REGISTERED','ARCHIVED')`),
    check("viz_assets_format_ck", sql`${t.formatSupport} IN ('IMPLEMENTED','NOT_IMPLEMENTED')`),
  ],
).enableRLS();


/** Hardware-independent device registry (governed lifecycle; no drivers). */
export const VIZ_DEVICE_CLASSES = [
  "WEB",
  "DESKTOP",
  "MOBILE",
  "AR",
  "VR",
  "SPATIAL_DISPLAY",
  "VOLUMETRIC_DISPLAY",
  "FUTURE_HOLOGRAPHIC_DEVICE",
] as const;

export const VIZ_DEVICE_STATUS = ["REGISTERED", "ACTIVE", "SUSPENDED", "REVOKED", "NOT_IMPLEMENTED"] as const;

export const vizDevices = pgTable(
  "viz_devices",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    deviceClass: text("device_class").notNull(),
    /** Renderer kind the device can present (must be an IMPLEMENTED renderer
     * kind for the device to reach ACTIVE — enforced by the service). */
    renderingBackend: text("rendering_backend").notNull(),
    status: text("status").notNull().default("REGISTERED"),
    /** Declared presentation capabilities (e.g. ["reducedMotion","lowBandwidth"]). */
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    provenance: jsonb("provenance")
      .$type<{ registeredBy: string; rationale: string; registeredAt: string }>()
      .notNull(),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("viz_devices_tenant_name_uidx").on(t.tenantId, t.name),
    index("viz_devices_tenant_idx").on(t.tenantId),
    check(
      "viz_devices_class_ck",
      sql`${t.deviceClass} IN ('WEB','DESKTOP','MOBILE','AR','VR','SPATIAL_DISPLAY','VOLUMETRIC_DISPLAY','FUTURE_HOLOGRAPHIC_DEVICE')`,
    ),
    check("viz_devices_status_ck", sql`${t.status} IN ('REGISTERED','ACTIVE','SUSPENDED','REVOKED','NOT_IMPLEMENTED')`),
    // No physical holographic hardware support exists in BEYU OS and none is
    // claimed: future-holographic devices can only ever be REGISTERED or
    // NOT_IMPLEMENTED — never ACTIVE/SUSPENDED.
    check(
      "viz_devices_future_holographic_ck",
      sql`${t.deviceClass} <> 'FUTURE_HOLOGRAPHIC_DEVICE' OR ${t.status} IN ('REGISTERED','NOT_IMPLEMENTED')`,
    ),
  ],
).enableRLS();


/** Named render profiles: renderer kind × device class × quality ceiling.
 * Presentation only — a profile can only REDUCE fidelity, never widen data
 * access (the governed manifest is the single source of truth). */
export const VIZ_RENDER_PROFILE_QUALITY_TIERS = ["LOW", "MEDIUM", "HIGH", "ULTRA"] as const;

export const vizRenderProfiles = pgTable(
  "viz_render_profiles",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    /** Device class target; NULL = any registered device class. */
    deviceClass: text("device_class"),
    /** Must be a canonical renderer kind (src/lib/viz/renderers.ts). */
    renderer: text("renderer").notNull(),
    qualityTier: text("quality_tier").notNull().default("MEDIUM"),
    /** Presentation formats the profile covers (JSON/SVG/PNG/CSV). */
    formats: jsonb("formats").$type<string[]>().notNull().default([]),
    /** Server-side object ceiling for scenes rendered under this profile
     * (performance guard; authorization ceilings are unchanged). */
    maxObjects: integer("max_objects").notNull().default(300),
    status: text("status").notNull().default("ACTIVE"),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("viz_render_profiles_tenant_name_uidx").on(t.tenantId, t.name),
    index("viz_render_profiles_tenant_idx").on(t.tenantId),
    check(
      "viz_render_profiles_renderer_ck",
      sql`${t.renderer} IN ('HTML_TABLE','SVG_2D','CANVAS_2D','CHART','MAP','DIAGRAM','TIMELINE','SPATIAL_PROJECTION','WEBGL_3D','WEBGPU_3D','XR')`,
    ),
    check("viz_render_profiles_tier_ck", sql`${t.qualityTier} IN ('LOW','MEDIUM','HIGH','ULTRA')`),
    check("viz_render_profiles_status_ck", sql`${t.status} IN ('ACTIVE','ARCHIVED')`),
    check("viz_render_profiles_max_objects_ck", sql`${t.maxObjects} > 0 AND ${t.maxObjects} <= 100000`),
  ],
).enableRLS();


/** Governed interaction ledger. Every spatial interaction request is
 * recorded — including DENIED ones. An interaction never mutates sector data
 * and never posts anything; REQUEST_* types are DELEGATIONS to existing
 * governed workflows (the ledger row is the audit trail of the request). */
export const VIZ_INTERACTION_TYPES = [
  "SELECT_OBJECT",
  "INSPECT_OBJECT",
  "FOCUS_OBJECT",
  "FILTER_LAYER",
  "NAVIGATE_SCENE",
  "QUERY_SPATIAL_DATA",
  "VIEW_EVENT",
  "VIEW_AUDIT_CONTEXT",
  "OPEN_ENTITY",
  "OPEN_DOCUMENT",
  "REQUEST_WORKFLOW",
  "REQUEST_APPROVAL",
] as const;

export const VIZ_INTERACTION_OUTCOMES = ["ALLOWED", "DENIED", "DELEGATED"] as const;

export const VIZ_INTERACTION_TARGET_DOMAINS = [
  "GOVERNANCE",
  "FINANCE_CAPITAL",
  "FAMILY_OFFICE",
  "DOCUMENT",
  "LEGAL",
  "ORGANIZATION",
] as const;

export const vizInteractions = pgTable(
  "viz_interactions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sceneId: text("scene_id").references(() => vizScenes.id),
    twinId: text("twin_id").references(() => vizDigitalTwins.id),
    /** Sector whose data the interaction targeted. */
    sector: text("sector").notNull(),
    /** `${subjectType}:${subjectId}` reference the interaction addressed. */
    objectRef: text("object_ref"),
    interactionType: text("interaction_type").notNull(),
    /** For OPEN_* / REQUEST_* types: the governed domain the request is
     * delegated to (its own boundary still applies on the target surface). */
    targetDomain: text("target_domain"),
    /** Reference in the target domain (document id, entity id, resolution id…). */
    targetRef: text("target_ref"),
    outcome: text("outcome").notNull(),
    reason: text("reason"),
    deviceId: text("device_id").references(() => vizDevices.id),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("viz_interactions_tenant_idx").on(t.tenantId),
    index("viz_interactions_tenant_type_idx").on(t.tenantId, t.interactionType),
    index("viz_interactions_tenant_scene_idx").on(t.tenantId, t.sceneId),
    check(
      "viz_interactions_type_ck",
      sql`${t.interactionType} IN ('SELECT_OBJECT','INSPECT_OBJECT','FOCUS_OBJECT','FILTER_LAYER','NAVIGATE_SCENE','QUERY_SPATIAL_DATA','VIEW_EVENT','VIEW_AUDIT_CONTEXT','OPEN_ENTITY','OPEN_DOCUMENT','REQUEST_WORKFLOW','REQUEST_APPROVAL')`,
    ),
    check("viz_interactions_outcome_ck", sql`${t.outcome} IN ('ALLOWED','DENIED','DELEGATED')`),
    check("viz_interactions_sector_ck", sql`${t.sector} IN ('BEYU','HEALTH','FINANCE','AGRICULTURE','UJENZI','FOUNDATION')`),
    check(
      "viz_interactions_target_ck",
      sql`${t.targetDomain} IS NULL OR ${t.targetDomain} IN ('GOVERNANCE','FINANCE_CAPITAL','FAMILY_OFFICE','DOCUMENT','LEGAL','ORGANIZATION')`,
    ),
  ],
).enableRLS();

/** Governed 9D+ dimension extensions (the registry's extension mechanism). */
export const vizDimensionExtensions = pgTable(
  "viz_dimension_extensions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** Extension code: ordinal ≥ 9 with optional domain suffix (9D,
     * 10D_SIMULATION, 12D_ORG_ECOSYSTEM). Canonical codes are rejected by the
     * service + a CHECK constraint — an extension can never shadow 1D..8D/XD. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    dataRequirements: jsonb("data_requirements").$type<string[]>().notNull().default([]),
    renderingRequirements: jsonb("rendering_requirements").$type<string[]>().notNull().default([]),
    requiredPermissions: jsonb("required_permissions").$type<string[]>().notNull().default([]),
    sectorApplicability: jsonb("sector_applicability").$type<string[] | "*">().notNull().default("*"),
    lifecycleState: text("lifecycle_state").notNull().default("PLANNED"),
    provenance: jsonb("provenance").$type<{ registeredBy: string; rationale: string; registeredAt: string }>().notNull(),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("viz_dimension_extensions_tenant_code_uidx").on(t.tenantId, t.code),
    index("viz_dimension_extensions_tenant_idx").on(t.tenantId),
    check(
      "viz_dimension_extensions_code_ck",
      sql`${t.code} ~ '^(9|[1-9][0-9]+)D(_[A-Z0-9]+)*$'`,
    ),
    check(
      "viz_dimension_extensions_state_ck",
      sql`${t.lifecycleState} IN ('EXPERIMENTAL','PLANNED','AVAILABLE','NOT_IMPLEMENTED','RETIRED')`,
    ),
  ],
).enableRLS();


/** Saved visualization scene configurations (references, never data copies). */
export const vizScenes = pgTable(
  "viz_scenes",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    name: text("name").notNull(),
    /** Sector whose data the scene visualizes ("BEYU" for control-plane). */
    sector: text("sector").notNull(),
    /** Optional subject binding (e.g. an Ujenzi project) — a REFERENCE only;
     * deep links re-authorize through the adapter on every access. */
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    /** Activated dimension codes (canonical + governed extensions). */
    dimensions: jsonb("dimensions").$type<string[]>().notNull().default([]),
    layers: jsonb("layers").$type<Array<Record<string, unknown>>>().notNull().default([]),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("ACTIVE"),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("viz_scenes_tenant_idx").on(t.tenantId),
    index("viz_scenes_sector_idx").on(t.sector),
    index("viz_scenes_status_idx").on(t.status),
    check("viz_scenes_sector_ck", sql`${t.sector} IN ('BEYU','HEALTH','FINANCE','AGRICULTURE','UJENZI','FOUNDATION')`),
    check("viz_scenes_status_ck", sql`${t.status} IN ('ACTIVE','ARCHIVED')`),
  ],
).enableRLS();


/** Digital-twin registrations: identity bindings only (state is live-derived). */
export const vizDigitalTwins = pgTable(
  "viz_digital_twins",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** Canonical twin key: `${sector}:${subjectType}:${subjectId}`. */
    twinKey: text("twin_key").notNull(),
    sector: text("sector").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    name: text("name").notNull(),
    status: text("status").notNull().default("REGISTERED"),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("viz_digital_twins_tenant_key_uidx").on(t.tenantId, t.twinKey),
    index("viz_digital_twins_tenant_idx").on(t.tenantId),
    index("viz_digital_twins_sector_idx").on(t.sector),
    check("viz_digital_twins_sector_ck", sql`${t.sector} IN ('BEYU','HEALTH','FINANCE','AGRICULTURE','UJENZI','FOUNDATION')`),
    check("viz_digital_twins_status_ck", sql`${t.status} IN ('REGISTERED','ARCHIVED')`),
  ],
).enableRLS();


/** Export ledger — every governed export is reconstructible evidence (§31). */
export const vizExports = pgTable(
  "viz_exports",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sceneId: text("scene_id").references(() => vizScenes.id),
    twinId: text("twin_id").references(() => vizDigitalTwins.id),
    format: text("format").notNull(),
    /** sha256 of the exact exported content. */
    contentHash: text("content_hash").notNull(),
    byteSize: integer("byte_size").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    dimensions: jsonb("dimensions").$type<string[]>().notNull().default([]),
    sector: text("sector").notNull(),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("viz_exports_tenant_idx").on(t.tenantId),
    index("viz_exports_scene_idx").on(t.sceneId),
    check("viz_exports_format_ck", sql`${t.format} IN ('JSON','CSV','SVG','PNG','PDF')`),
    check("viz_exports_target_ck", sql`${t.sceneId} IS NOT NULL OR ${t.twinId} IS NOT NULL`),
  ],
).enableRLS();

