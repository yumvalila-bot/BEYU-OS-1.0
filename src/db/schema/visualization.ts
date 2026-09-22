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

