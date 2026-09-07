/**
 * BEYU OS — Agriculture OS schema
 *
 * STATUS: SCAFFOLDED (foundational tables only)
 *
 * This schema provides the foundational data model for Agriculture OS operations:
 * farms, fields, crop cycles, livestock, and basic production tracking.
 *
 * Full Agriculture OS implementation (fisheries, aquaculture, processing,
 * traceability, value chain, analytics) is a future phase.
 *
 * Authority: Agriculture OS owns agricultural operations
 * Finance OS owns financial consequences
 * BEYU OS owns identity, authorization, governance
 */

import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants, legalEntities, countries } from "./core";

// ============================================================================
// FARMS
// ============================================================================

export const farms = pgTable(
  "agriculture_farms",
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
    region: text("region"),
    totalAreaHa: numeric("total_area_ha", { precision: 12, scale: 2 }),
    arableAreaHa: numeric("arable_area_ha", { precision: 12, scale: 2 }),
    elevationM: integer("elevation_m"),
    soilType: text("soil_type"),
    waterSource: text("water_source"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | INACTIVE | SUSPENDED
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_farms_tenant_code_uidx").on(t.tenantId, t.code),
    index("agriculture_farms_tenant_idx").on(t.tenantId),
    index("agriculture_farms_entity_idx").on(t.legalEntityId),
  ],
);

// ============================================================================
// FIELDS (parcels/blocks within a farm)
// ============================================================================

export const fields = pgTable(
  "agriculture_fields",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    areaHa: numeric("area_ha", { precision: 12, scale: 2 }).notNull(),
    soilType: text("soil_type"),
    irrigationType: text("irrigation_type"), // DRIP | SPRINKLER | FLOOD | RAINFED
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_fields_farm_code_uidx").on(t.farmId, t.code),
    index("agriculture_fields_tenant_idx").on(t.tenantId),
    index("agriculture_fields_farm_idx").on(t.farmId),
  ],
);

// ============================================================================
// CROP TYPES (master data)
// ============================================================================

export const cropTypes = pgTable(
  "agriculture_crop_types",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(), // CEREAL | LEGUME | VEGETABLE | FRUIT | TREE | TUBER | FIBER | OILSEED
    variety: text("variety"),
    growthCycleDays: integer("growth_cycle_days"),
    yieldPerHaKg: numeric("yield_per_ha_kg", { precision: 12, scale: 2 }),
    unitOfMeasure: text("unit_of_measure").notNull().default("KG"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_crop_types_tenant_code_uidx").on(t.tenantId, t.code),
    index("agriculture_crop_types_tenant_idx").on(t.tenantId),
  ],
);

// ============================================================================
// CROP CYCLES (a planting season for a specific field and crop)
// ============================================================================

export const cropCycles = pgTable(
  "agriculture_crop_cycles",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fieldId: text("field_id")
      .notNull()
      .references(() => fields.id),
    cropTypeId: text("crop_type_id")
      .notNull()
      .references(() => cropTypes.id),
    code: text("code").notNull(),
    season: text("season").notNull(), // LONG_RAINS | SHORT_RAINS | DRY | IRRIGATED
    plantingDate: text("planting_date").notNull(),
    expectedHarvestDate: text("expected_harvest_date"),
    actualHarvestDate: text("actual_harvest_date"),
    seedQuantityKg: numeric("seed_quantity_kg", { precision: 12, scale: 2 }),
    expectedYieldKg: numeric("expected_yield_kg", { precision: 12, scale: 2 }),
    actualYieldKg: numeric("actual_yield_kg", { precision: 12, scale: 2 }),
    status: text("status").notNull().default("PLANTED"), // PLANTED | GROWING | HARVESTING | COMPLETED | ABANDONED
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_crop_cycles_tenant_code_uidx").on(t.tenantId, t.code),
    index("agriculture_crop_cycles_tenant_idx").on(t.tenantId),
    index("agriculture_crop_cycles_field_idx").on(t.fieldId),
    index("agriculture_crop_cycles_status_idx").on(t.status),
  ],
);

// ============================================================================
// INPUTS (seeds, fertilizer, chemicals, etc.)
// ============================================================================

export const agricultureInputs = pgTable(
  "agriculture_inputs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(), // SEED | FERTILIZER | PESTICIDE | HERBICIDE | FUNGICIDE | ORGANIC
    unitOfMeasure: text("unit_of_measure").notNull(), // KG | L | UNIT
    manufacturer: text("manufacturer"),
    registrationNumber: text("registration_number"),
    activeIngredient: text("active_ingredient"),
    safetyDataSheetUrl: text("safety_data_sheet_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_inputs_tenant_code_uidx").on(t.tenantId, t.code),
    index("agriculture_inputs_tenant_idx").on(t.tenantId),
  ],
);

// ============================================================================
// INPUT APPLICATIONS (when an input is applied to a crop cycle)
// ============================================================================

export const inputApplications = pgTable(
  "agriculture_input_applications",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cropCycleId: text("crop_cycle_id")
      .notNull()
      .references(() => cropCycles.id),
    inputId: text("input_id")
      .notNull()
      .references(() => agricultureInputs.id),
    appliedDate: text("applied_date").notNull(),
    quantityApplied: numeric("quantity_applied", { precision: 12, scale: 2 }).notNull(),
    applicationMethod: text("application_method"), // BROADCAST | BANDED | FOLIAR | DRIP | INJECTION
    appliedBy: text("applied_by"),
    weatherConditions: text("weather_conditions"),
    preHarvestIntervalDays: integer("pre_harvest_interval_days"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("agriculture_input_applications_tenant_idx").on(t.tenantId),
    index("agriculture_input_applications_cycle_idx").on(t.cropCycleId),
  ],
);

// ============================================================================
// HARVESTS
// ============================================================================

export const harvests = pgTable(
  "agriculture_harvests",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cropCycleId: text("crop_cycle_id")
      .notNull()
      .references(() => cropCycles.id),
    code: text("code").notNull(),
    harvestDate: text("harvest_date").notNull(),
    quantityKg: numeric("quantity_kg", { precision: 12, scale: 2 }).notNull(),
    qualityGrade: text("quality_grade"), // A | B | C | REJECTED
    moistureContent: numeric("moisture_content", { precision: 5, scale: 2 }),
    harvestedBy: text("harvested_by"),
    storageLocation: text("storage_location"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_harvests_tenant_code_uidx").on(t.tenantId, t.code),
    index("agriculture_harvests_tenant_idx").on(t.tenantId),
    index("agriculture_harvests_cycle_idx").on(t.cropCycleId),
  ],
);

// ============================================================================
// LIVESTOCK TYPES (master data)
// ============================================================================

export const livestockTypes = pgTable(
  "agriculture_livestock_types",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    species: text("species").notNull(), // CATTLE | GOAT | SHEEP | POULTRY | PIG | FISH
    breed: text("breed"),
    purpose: text("purpose").notNull(), // MEAT | DAIRY | DUAL | BREEDING | WORKER
    averageWeightKg: numeric("average_weight_kg", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_livestock_types_tenant_code_uidx").on(t.tenantId, t.code),
    index("agriculture_livestock_types_tenant_idx").on(t.tenantId),
  ],
);

// ============================================================================
// LIVESTOCK HERDS (groups of animals, not individual tracking)
// ============================================================================

export const livestockHerds = pgTable(
  "agriculture_livestock_herds",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id),
    livestockTypeId: text("livestock_type_id")
      .notNull()
      .references(() => livestockTypes.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    headCount: integer("head_count").notNull().default(0),
    location: text("location"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_livestock_herds_farm_code_uidx").on(t.farmId, t.code),
    index("agriculture_livestock_herds_tenant_idx").on(t.tenantId),
    index("agriculture_livestock_herds_farm_idx").on(t.farmId),
  ],
);

// ============================================================================
// LIVESTOCK EVENTS (births, deaths, purchases, sales, vaccinations)
// ============================================================================

export const livestockEvents = pgTable(
  "agriculture_livestock_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    herdId: text("herd_id")
      .notNull()
      .references(() => livestockHerds.id),
    eventType: text("event_type").notNull(), // BIRTH | DEATH | PURCHASE | SALE | VACCINATION | TREATMENT | TRANSFER
    eventDate: text("event_date").notNull(),
    headCount: integer("head_count").notNull(), // positive = addition, negative = removal
    description: text("description"),
    performedBy: text("performed_by"),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("agriculture_livestock_events_tenant_idx").on(t.tenantId),
    index("agriculture_livestock_events_herd_idx").on(t.herdId),
    index("agriculture_livestock_events_date_idx").on(t.eventDate),
  ],
);
