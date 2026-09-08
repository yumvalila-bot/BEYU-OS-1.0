/**
 * Agriculture OS — sector operational schema.
 *
 * Foundation (0031): farms, fields, crop types, crop cycles, inputs,
 * harvests, livestock types/herds/events.
 * Production extension (0034): land, trees, animals, aqua, inventory,
 * work, observations, weather, traceability, marketplace, projects,
 * hazards, permits, capital cases, offline sync, what-if, IoT.
 *
 * Finance OS remains authoritative for journals. Agriculture never posts.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { countries, legalEntities, tenants } from "./core";

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
    status: text("status").notNull().default("ACTIVE"),
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    boundaryGeojson: jsonb("boundary_geojson").$type<Record<string, unknown> | null>(),
    timezone: text("timezone").notNull().default("Africa/Dar_es_Salaam"),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_farms_tenant_code_uidx").on(t.tenantId, t.code),
    index("agriculture_farms_tenant_idx").on(t.tenantId),
    index("agriculture_farms_entity_idx").on(t.legalEntityId),
  ],
);

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
    irrigationType: text("irrigation_type"),
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    boundaryGeojson: jsonb("boundary_geojson").$type<Record<string, unknown> | null>(),
    classification: text("classification").notNull().default("INTERNAL"),
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

export const cropTypes = pgTable(
  "agriculture_crop_types",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
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
    season: text("season").notNull(),
    plantingDate: text("planting_date").notNull(),
    expectedHarvestDate: text("expected_harvest_date"),
    actualHarvestDate: text("actual_harvest_date"),
    seedQuantityKg: numeric("seed_quantity_kg", { precision: 12, scale: 2 }),
    expectedYieldKg: numeric("expected_yield_kg", { precision: 12, scale: 2 }),
    actualYieldKg: numeric("actual_yield_kg", { precision: 12, scale: 2 }),
    variety: text("variety"),
    status: text("status").notNull().default("PLANTED"),
    notes: text("notes"),
    classification: text("classification").notNull().default("INTERNAL"),
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

export const agriInputs = pgTable(
  "agriculture_inputs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),
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
      .references(() => agriInputs.id),
    appliedDate: text("applied_date").notNull(),
    quantityApplied: numeric("quantity_applied", { precision: 12, scale: 2 }).notNull(),
    applicationMethod: text("application_method"),
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
    qualityGrade: text("quality_grade"),
    moistureContent: numeric("moisture_content", { precision: 5, scale: 2 }),
    harvestedBy: text("harvested_by"),
    storageLocation: text("storage_location"),
    notes: text("notes"),
    unit: text("unit").notNull().default("KG"),
    batchCode: text("batch_code"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_harvests_tenant_code_uidx").on(t.tenantId, t.code),
    index("agriculture_harvests_tenant_idx").on(t.tenantId),
    index("agriculture_harvests_cycle_idx").on(t.cropCycleId),
  ],
);

export const livestockTypes = pgTable(
  "agriculture_livestock_types",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    species: text("species").notNull(),
    breed: text("breed"),
    purpose: text("purpose").notNull(),
    averageWeightKg: numeric("average_weight_kg", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agriculture_livestock_types_tenant_code_uidx").on(t.tenantId, t.code),
    index("agriculture_livestock_types_tenant_idx").on(t.tenantId),
  ],
);

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
    eventType: text("event_type").notNull(),
    eventDate: text("event_date").notNull(),
    headCount: integer("head_count").notNull(),
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

function agriTenant(name: string) {
  return {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
  };
}

export const farmers = pgTable(
  "agriculture_farmers",
  {
    ...agriTenant("farmers"),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    partyId: text("party_id"),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    farmerKind: text("farmer_kind").notNull().default("SMALLHOLDER"),
    countryCode: text("country_code").notNull().default("TZ"),
    region: text("region"),
    phone: text("phone"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("CONFIDENTIAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_farmers_0_uidx").on(t.tenantId, t.code), index("agriculture_farmers_tenant_idx").on(t.tenantId)],
);

export const landParcels = pgTable(
  "agriculture_land_parcels",
  {
    ...agriTenant("parcels"),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    tenureType: text("tenure_type").notNull().default("LEASEHOLD"),
    titleRef: text("title_ref"),
    areaHa: numeric("area_ha", { precision: 12, scale: 4 }).notNull(),
    countryCode: text("country_code").notNull().default("TZ"),
    region: text("region"),
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    boundaryGeojson: jsonb("boundary_geojson").$type<Record<string, unknown> | null>(),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_land_parcels_0_uidx").on(t.farmId, t.code), index("agriculture_land_parcels_tenant_idx").on(t.tenantId)],
);

export const fieldZones = pgTable(
  "agriculture_field_zones",
  {
    ...agriTenant("zones"),
    fieldId: text("field_id")
      .notNull()
      .references(() => fields.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    zoneKind: text("zone_kind").notNull().default("BLOCK"),
    areaHa: numeric("area_ha", { precision: 12, scale: 4 }),
    boundaryGeojson: jsonb("boundary_geojson").$type<Record<string, unknown> | null>(),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_field_zones_0_uidx").on(t.fieldId, t.code), index("agriculture_field_zones_tenant_idx").on(t.tenantId)],
);

export const treeSpecies = pgTable(
  "agriculture_tree_species",
  {
    ...agriTenant("tree_species"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("PERENNIAL"),
    typicalYieldUnit: text("typical_yield_unit").notNull().default("KG"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_tree_species_0_uidx").on(t.tenantId, t.code), index("agriculture_tree_species_tenant_idx").on(t.tenantId)],
);

export const trees = pgTable(
  "agriculture_trees",
  {
    ...agriTenant("trees"),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id),
    fieldId: text("field_id").references(() => fields.id),
    speciesId: text("species_id")
      .notNull()
      .references(() => treeSpecies.id),
    code: text("code").notNull(),
    plantedOn: text("planted_on"),
    status: text("status").notNull().default("ACTIVE"),
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_trees_0_uidx").on(t.farmId, t.code), index("agriculture_trees_tenant_idx").on(t.tenantId)],
);

export const treePlantings = pgTable(
  "agriculture_tree_plantings",
  {
    ...agriTenant("tree_plantings"),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id),
    plantingDate: text("planting_date").notNull(),
    sourceLotId: text("source_lot_id"),
    countPlanted: integer("count_planted").notNull().default(1),
    notes: text("notes"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_tree_plantings_tenant_idx").on(t.tenantId)],
);

export const animals = pgTable(
  "agriculture_animals",
  {
    ...agriTenant("animals"),
    herdId: text("herd_id")
      .notNull()
      .references(() => livestockHerds.id),
    tagCode: text("tag_code").notNull(),
    sex: text("sex"),
    birthDate: text("birth_date"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_animals_0_uidx").on(t.herdId, t.tagCode), index("agriculture_animals_tenant_idx").on(t.tenantId)],
);

export const veterinaryRecords = pgTable(
  "agriculture_veterinary_records",
  {
    ...agriTenant("vet"),
    herdId: text("herd_id")
      .notNull()
      .references(() => livestockHerds.id),
    animalId: text("animal_id").references(() => animals.id),
    recordDate: text("record_date").notNull(),
    recordKind: text("record_kind").notNull(),
    diagnosis: text("diagnosis"),
    treatment: text("treatment"),
    performedBy: text("performed_by"),
    notes: text("notes"),
    classification: text("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_veterinary_records_tenant_idx").on(t.tenantId)],
);

export const aquaUnits = pgTable(
  "agriculture_aqua_units",
  {
    ...agriTenant("aqua_units"),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    unitKind: text("unit_kind").notNull().default("POND"),
    volumeM3: numeric("volume_m3", { precision: 14, scale: 2 }),
    areaHa: numeric("area_ha", { precision: 12, scale: 4 }),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_aqua_units_0_uidx").on(t.farmId, t.code), index("agriculture_aqua_units_tenant_idx").on(t.tenantId)],
);

export const aquaStockings = pgTable(
  "agriculture_aqua_stockings",
  {
    ...agriTenant("aqua_stock"),
    aquaUnitId: text("aqua_unit_id")
      .notNull()
      .references(() => aquaUnits.id),
    species: text("species").notNull(),
    stockedOn: text("stocked_on").notNull(),
    countStocked: integer("count_stocked").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_aqua_stockings_tenant_idx").on(t.tenantId)],
);

export const waterQuality = pgTable(
  "agriculture_water_quality",
  {
    ...agriTenant("wq"),
    aquaUnitId: text("aqua_unit_id")
      .notNull()
      .references(() => aquaUnits.id),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
    ph: numeric("ph", { precision: 5, scale: 2 }),
    dissolvedOxygenMgl: numeric("dissolved_oxygen_mgl", { precision: 8, scale: 3 }),
    temperatureC: numeric("temperature_c", { precision: 6, scale: 2 }),
    turbidityNtu: numeric("turbidity_ntu", { precision: 10, scale: 3 }),
    source: text("source").notNull().default("FIELD"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_water_quality_tenant_idx").on(t.tenantId)],
);

export const aquaHarvests = pgTable(
  "agriculture_aqua_harvests",
  {
    ...agriTenant("aqua_harvests"),
    aquaUnitId: text("aqua_unit_id")
      .notNull()
      .references(() => aquaUnits.id),
    code: text("code").notNull(),
    harvestDate: text("harvest_date").notNull(),
    quantityKg: numeric("quantity_kg", { precision: 14, scale: 3 }).notNull(),
    species: text("species"),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_aqua_harvests_0_uidx").on(t.tenantId, t.code), index("agriculture_aqua_harvests_tenant_idx").on(t.tenantId)],
);

export const equipment = pgTable(
  "agriculture_equipment",
  {
    ...agriTenant("equip"),
    farmId: text("farm_id").references(() => farms.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    equipmentKind: text("equipment_kind").notNull(),
    serialNo: text("serial_no"),
    status: text("status").notNull().default("ACTIVE"),
    acquiredOn: text("acquired_on"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_equipment_0_uidx").on(t.tenantId, t.code), index("agriculture_equipment_tenant_idx").on(t.tenantId)],
);

export const equipmentService = pgTable(
  "agriculture_equipment_service",
  {
    ...agriTenant("equip_svc"),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id),
    serviceDate: text("service_date").notNull(),
    serviceKind: text("service_kind").notNull(),
    notes: text("notes"),
    performedBy: text("performed_by"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_equipment_service_tenant_idx").on(t.tenantId)],
);

export const inventoryItems = pgTable(
  "agriculture_inventory_items",
  {
    ...agriTenant("inv_items"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_inventory_items_0_uidx").on(t.tenantId, t.code), index("agriculture_inventory_items_tenant_idx").on(t.tenantId)],
);

export const inventoryLots = pgTable(
  "agriculture_inventory_lots",
  {
    ...agriTenant("inv_lots"),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    lotCode: text("lot_code").notNull(),
    qtyOnHand: numeric("qty_on_hand", { precision: 16, scale: 4 }).notNull().default("0"),
    expiresOn: text("expires_on"),
    warehouseId: text("warehouse_id"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_inventory_lots_0_uidx").on(t.itemId, t.lotCode), index("agriculture_inventory_lots_tenant_idx").on(t.tenantId)],
);

export const inventoryMoves = pgTable(
  "agriculture_inventory_moves",
  {
    ...agriTenant("inv_moves"),
    lotId: text("lot_id")
      .notNull()
      .references(() => inventoryLots.id),
    moveKind: text("move_kind").notNull(),
    qty: numeric("qty", { precision: 16, scale: 4 }).notNull(),
    movedAt: timestamp("moved_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason"),
    refType: text("ref_type"),
    refId: text("ref_id"),
    actorUserId: text("actor_user_id"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_inventory_moves_tenant_idx").on(t.tenantId)],
);

export const workOrders = pgTable(
  "agriculture_work_orders",
  {
    ...agriTenant("wo"),
    farmId: text("farm_id").references(() => farms.id),
    fieldId: text("field_id").references(() => fields.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    workKind: text("work_kind").notNull(),
    status: text("status").notNull().default("OPEN"),
    dueOn: text("due_on"),
    assignedRole: text("assigned_role"),
    classification: text("classification").notNull().default("INTERNAL"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_work_orders_0_uidx").on(t.tenantId, t.code), index("agriculture_work_orders_tenant_idx").on(t.tenantId)],
);

export const fieldTasks = pgTable(
  "agriculture_field_tasks",
  {
    ...agriTenant("tasks"),
    workOrderId: text("work_order_id").references(() => workOrders.id),
    fieldId: text("field_id").references(() => fields.id),
    title: text("title").notNull(),
    status: text("status").notNull().default("OPEN"),
    dueOn: text("due_on"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_field_tasks_tenant_idx").on(t.tenantId)],
);

export const taskAssignments = pgTable(
  "agriculture_task_assignments",
  {
    ...agriTenant("task_asg"),
    taskId: text("task_id")
      .notNull()
      .references(() => fieldTasks.id),
    assigneeUserId: text("assignee_user_id"),
    assigneeRole: text("assignee_role"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    classification: text("classification").notNull().default("INTERNAL"),
  },
  (t) => [index("agriculture_task_assignments_tenant_idx").on(t.tenantId)],
);

export const fieldObservations = pgTable(
  "agriculture_field_observations",
  {
    ...agriTenant("obs"),
    farmId: text("farm_id").references(() => farms.id),
    fieldId: text("field_id").references(() => fields.id),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    observationKind: text("observation_kind").notNull(),
    body: text("body").notNull(),
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    observedBy: text("observed_by"),
    offlineEnvelopeId: text("offline_envelope_id"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_field_observations_tenant_idx").on(t.tenantId)],
);

export const measurements = pgTable(
  "agriculture_measurements",
  {
    ...agriTenant("meas"),
    fieldId: text("field_id").references(() => fields.id),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    metricCode: text("metric_code").notNull(),
    value: numeric("value", { precision: 16, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    source: text("source").notNull().default("FIELD"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_measurements_tenant_idx").on(t.tenantId)],
);

export const pestObservations = pgTable(
  "agriculture_pest_observations",
  {
    ...agriTenant("pest"),
    fieldId: text("field_id").references(() => fields.id),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    pestName: text("pest_name").notNull(),
    severity: text("severity").notNull().default("LOW"),
    notes: text("notes"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_pest_observations_tenant_idx").on(t.tenantId)],
);

export const soilTests = pgTable(
  "agriculture_soil_tests",
  {
    ...agriTenant("soil"),
    fieldId: text("field_id").references(() => fields.id),
    sampledOn: text("sampled_on").notNull(),
    ph: numeric("ph", { precision: 5, scale: 2 }),
    organicMatterPct: numeric("organic_matter_pct", { precision: 6, scale: 3 }),
    nitrogenPpm: numeric("nitrogen_ppm", { precision: 10, scale: 3 }),
    phosphorusPpm: numeric("phosphorus_ppm", { precision: 10, scale: 3 }),
    potassiumPpm: numeric("potassium_ppm", { precision: 10, scale: 3 }),
    labName: text("lab_name"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_soil_tests_tenant_idx").on(t.tenantId)],
);

export const weatherReadings = pgTable(
  "agriculture_weather_readings",
  {
    ...agriTenant("weather"),
    farmId: text("farm_id").references(() => farms.id),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    provider: text("provider").notNull(),
    locationLabel: text("location_label"),
    gpsLatitude: numeric("gps_latitude", { precision: 10, scale: 7 }),
    gpsLongitude: numeric("gps_longitude", { precision: 10, scale: 7 }),
    temperatureC: numeric("temperature_c", { precision: 6, scale: 2 }),
    rainfallMm: numeric("rainfall_mm", { precision: 10, scale: 3 }),
    humidityPct: numeric("humidity_pct", { precision: 6, scale: 2 }),
    windMs: numeric("wind_ms", { precision: 8, scale: 3 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    epistemicStatus: text("epistemic_status").notNull().default("OBSERVED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_weather_readings_tenant_idx").on(t.tenantId)],
);

export const waterSources = pgTable(
  "agriculture_water_sources",
  {
    ...agriTenant("wsrc"),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sourceKind: text("source_kind").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_water_sources_0_uidx").on(t.farmId, t.code), index("agriculture_water_sources_tenant_idx").on(t.tenantId)],
);

export const irrigationLogs = pgTable(
  "agriculture_irrigation_logs",
  {
    ...agriTenant("irr"),
    fieldId: text("field_id").references(() => fields.id),
    waterSourceId: text("water_source_id").references(() => waterSources.id),
    irrigatedOn: text("irrigated_on").notNull(),
    volumeM3: numeric("volume_m3", { precision: 14, scale: 3 }),
    method: text("method"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_irrigation_logs_tenant_idx").on(t.tenantId)],
);

export const products = pgTable(
  "agriculture_products",
  {
    ...agriTenant("products"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    productKind: text("product_kind").notNull(),
    unitOfMeasure: text("unit_of_measure").notNull().default("KG"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_products_0_uidx").on(t.tenantId, t.code), index("agriculture_products_tenant_idx").on(t.tenantId)],
);

export const traceBatches = pgTable(
  "agriculture_trace_batches",
  {
    ...agriTenant("batches"),
    productId: text("product_id").references(() => products.id),
    harvestId: text("harvest_id").references(() => harvests.id),
    batchCode: text("batch_code").notNull(),
    originFarmId: text("origin_farm_id").references(() => farms.id),
    qty: numeric("qty", { precision: 16, scale: 4 }).notNull(),
    unit: text("unit").notNull().default("KG"),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_trace_batches_0_uidx").on(t.tenantId, t.batchCode), index("agriculture_trace_batches_tenant_idx").on(t.tenantId)],
);

export const processRuns = pgTable(
  "agriculture_process_runs",
  {
    ...agriTenant("process"),
    batchId: text("batch_id").references(() => traceBatches.id),
    processKind: text("process_kind").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    inputQty: numeric("input_qty", { precision: 16, scale: 4 }),
    outputQty: numeric("output_qty", { precision: 16, scale: 4 }),
    status: text("status").notNull().default("COMPLETED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_process_runs_tenant_idx").on(t.tenantId)],
);

export const warehouses = pgTable(
  "agriculture_warehouses",
  {
    ...agriTenant("wh"),
    farmId: text("farm_id").references(() => farms.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    countryCode: text("country_code").notNull().default("TZ"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_warehouses_0_uidx").on(t.tenantId, t.code), index("agriculture_warehouses_tenant_idx").on(t.tenantId)],
);

export const storageRecords = pgTable(
  "agriculture_storage_records",
  {
    ...agriTenant("storage"),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    batchId: text("batch_id").references(() => traceBatches.id),
    qty: numeric("qty", { precision: 16, scale: 4 }).notNull(),
    storedOn: text("stored_on").notNull(),
    condition: text("condition"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_storage_records_tenant_idx").on(t.tenantId)],
);

export const shipments = pgTable(
  "agriculture_shipments",
  {
    ...agriTenant("ship"),
    code: text("code").notNull(),
    fromWarehouseId: text("from_warehouse_id").references(() => warehouses.id),
    buyerId: text("buyer_id"),
    shippedOn: text("shipped_on"),
    status: text("status").notNull().default("DRAFT"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_shipments_0_uidx").on(t.tenantId, t.code), index("agriculture_shipments_tenant_idx").on(t.tenantId)],
);

export const shipmentItems = pgTable(
  "agriculture_shipment_items",
  {
    ...agriTenant("ship_items"),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id),
    batchId: text("batch_id").references(() => traceBatches.id),
    qty: numeric("qty", { precision: 16, scale: 4 }).notNull(),
    unit: text("unit").notNull().default("KG"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_shipment_items_tenant_idx").on(t.tenantId)],
);

export const buyers = pgTable(
  "agriculture_buyers",
  {
    ...agriTenant("buyers"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    countryCode: text("country_code").notNull().default("TZ"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_buyers_0_uidx").on(t.tenantId, t.code), index("agriculture_buyers_tenant_idx").on(t.tenantId)],
);

export const suppliers = pgTable(
  "agriculture_suppliers",
  {
    ...agriTenant("suppliers"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    countryCode: text("country_code").notNull().default("TZ"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_suppliers_0_uidx").on(t.tenantId, t.code), index("agriculture_suppliers_tenant_idx").on(t.tenantId)],
);

export const listings = pgTable(
  "agriculture_listings",
  {
    ...agriTenant("listings"),
    sellerFarmId: text("seller_farm_id").references(() => farms.id),
    productId: text("product_id").references(() => products.id),
    title: text("title").notNull(),
    qtyAvailable: numeric("qty_available", { precision: 16, scale: 4 }).notNull(),
    unit: text("unit").notNull().default("KG"),
    askingPrice: numeric("asking_price", { precision: 16, scale: 4 }),
    currency: text("currency").notNull().default("TZS"),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_listings_tenant_idx").on(t.tenantId)],
);

export const orders = pgTable(
  "agriculture_orders",
  {
    ...agriTenant("orders"),
    code: text("code").notNull(),
    buyerId: text("buyer_id").references(() => buyers.id),
    listingId: text("listing_id").references(() => listings.id),
    status: text("status").notNull().default("DRAFT"),
    orderedOn: text("ordered_on"),
    currency: text("currency").notNull().default("TZS"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_orders_0_uidx").on(t.tenantId, t.code), index("agriculture_orders_tenant_idx").on(t.tenantId)],
);

export const orderItems = pgTable(
  "agriculture_order_items",
  {
    ...agriTenant("order_items"),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    productId: text("product_id").references(() => products.id),
    qty: numeric("qty", { precision: 16, scale: 4 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 16, scale: 4 }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_order_items_tenant_idx").on(t.tenantId)],
);

export const agreements = pgTable(
  "agriculture_agreements",
  {
    ...agriTenant("agreements"),
    code: text("code").notNull(),
    counterpartyName: text("counterparty_name").notNull(),
    agreementKind: text("agreement_kind").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("RESTRICTED"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_agreements_0_uidx").on(t.tenantId, t.code), index("agriculture_agreements_tenant_idx").on(t.tenantId)],
);

export const projects = pgTable(
  "agriculture_projects",
  {
    ...agriTenant("projects"),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_projects_0_uidx").on(t.tenantId, t.code), index("agriculture_projects_tenant_idx").on(t.tenantId)],
);

export const projectMilestones = pgTable(
  "agriculture_project_milestones",
  {
    ...agriTenant("ms"),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    title: text("title").notNull(),
    dueOn: text("due_on"),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_project_milestones_tenant_idx").on(t.tenantId)],
);

export const projectBudgets = pgTable(
  "agriculture_project_budgets",
  {
    ...agriTenant("budgets"),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    period: text("period").notNull(),
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("TZS"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_project_budgets_tenant_idx").on(t.tenantId)],
);

export const assetRegister = pgTable(
  "agriculture_asset_register",
  {
    ...agriTenant("assets"),
    farmId: text("farm_id").references(() => farms.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    assetKind: text("asset_kind").notNull(),
    acquiredOn: text("acquired_on"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_asset_register_0_uidx").on(t.tenantId, t.code), index("agriculture_asset_register_tenant_idx").on(t.tenantId)],
);

export const hazardRegister = pgTable(
  "agriculture_hazard_register",
  {
    ...agriTenant("hazards"),
    farmId: text("farm_id").references(() => farms.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    hazardKind: text("hazard_kind").notNull(),
    likelihood: integer("likelihood").notNull().default(1),
    impact: integer("impact").notNull().default(1),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("RESTRICTED"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_hazard_register_0_uidx").on(t.tenantId, t.code), index("agriculture_hazard_register_tenant_idx").on(t.tenantId)],
);

export const hazardMitigations = pgTable(
  "agriculture_hazard_mitigations",
  {
    ...agriTenant("mit"),
    hazardId: text("hazard_id")
      .notNull()
      .references(() => hazardRegister.id),
    title: text("title").notNull(),
    status: text("status").notNull().default("PLANNED"),
    ownerRole: text("owner_role"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_hazard_mitigations_tenant_idx").on(t.tenantId)],
);

export const permits = pgTable(
  "agriculture_permits",
  {
    ...agriTenant("permits"),
    farmId: text("farm_id").references(() => farms.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    issuer: text("issuer"),
    issuedOn: text("issued_on"),
    expiresOn: text("expires_on"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_permits_0_uidx").on(t.tenantId, t.code), index("agriculture_permits_tenant_idx").on(t.tenantId)],
);

export const licenses = pgTable(
  "agriculture_licenses",
  {
    ...agriTenant("licenses"),
    farmId: text("farm_id").references(() => farms.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    issuer: text("issuer"),
    issuedOn: text("issued_on"),
    expiresOn: text("expires_on"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_licenses_0_uidx").on(t.tenantId, t.code), index("agriculture_licenses_tenant_idx").on(t.tenantId)],
);

export const certificates = pgTable(
  "agriculture_certificates",
  {
    ...agriTenant("certs"),
    farmId: text("farm_id").references(() => farms.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    scheme: text("scheme"),
    issuedOn: text("issued_on"),
    expiresOn: text("expires_on"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_certificates_0_uidx").on(t.tenantId, t.code), index("agriculture_certificates_tenant_idx").on(t.tenantId)],
);

export const inspections = pgTable(
  "agriculture_inspections",
  {
    ...agriTenant("insp"),
    farmId: text("farm_id").references(() => farms.id),
    inspectedOn: text("inspected_on").notNull(),
    inspector: text("inspector"),
    outcome: text("outcome").notNull().default("PENDING"),
    findings: text("findings"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_inspections_tenant_idx").on(t.tenantId)],
);

export const violations = pgTable(
  "agriculture_violations",
  {
    ...agriTenant("viol"),
    inspectionId: text("inspection_id").references(() => inspections.id),
    title: text("title").notNull(),
    severity: text("severity").notNull().default("LOW"),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_violations_tenant_idx").on(t.tenantId)],
);

export const correctiveActions = pgTable(
  "agriculture_corrective_actions",
  {
    ...agriTenant("ca"),
    violationId: text("violation_id").references(() => violations.id),
    title: text("title").notNull(),
    dueOn: text("due_on"),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_corrective_actions_tenant_idx").on(t.tenantId)],
);

export const insurancePolicies = pgTable(
  "agriculture_insurance_policies",
  {
    ...agriTenant("ins_pol"),
    farmId: text("farm_id").references(() => farms.id),
    policyNo: text("policy_no").notNull(),
    insurer: text("insurer").notNull(),
    coverKind: text("cover_kind").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_insurance_policies_0_uidx").on(t.tenantId, t.policyNo), index("agriculture_insurance_policies_tenant_idx").on(t.tenantId)],
);

export const insuranceClaims = pgTable(
  "agriculture_insurance_claims",
  {
    ...agriTenant("ins_cl"),
    policyId: text("policy_id")
      .notNull()
      .references(() => insurancePolicies.id),
    claimNo: text("claim_no").notNull(),
    filedOn: text("filed_on").notNull(),
    status: text("status").notNull().default("FILED"),
    amount: numeric("amount", { precision: 16, scale: 2 }),
    currency: text("currency").notNull().default("TZS"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_insurance_claims_0_uidx").on(t.tenantId, t.claimNo), index("agriculture_insurance_claims_tenant_idx").on(t.tenantId)],
);

export const agriDocuments = pgTable(
  "agriculture_documents",
  {
    ...agriTenant("docs"),
    farmId: text("farm_id").references(() => farms.id),
    title: text("title").notNull(),
    category: text("category").notNull(),
    uri: text("uri"),
    checksum: text("checksum"),
    classification: text("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_documents_tenant_idx").on(t.tenantId)],
);

export const capitalCases = pgTable(
  "agriculture_capital_cases",
  {
    ...agriTenant("cap_cases"),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    farmId: text("farm_id").references(() => farms.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("DRAFT"),
    financeCapitalRequestId: text("finance_capital_request_id"),
    financeHandoff: text("finance_handoff").notNull().default("SUBMITTED_PENDING_FINANCE"),
    requestedBy: text("requested_by"),
    classification: text("classification").notNull().default("RESTRICTED"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_capital_cases_0_uidx").on(t.tenantId, t.code), index("agriculture_capital_cases_tenant_idx").on(t.tenantId)],
);

export const aiAdvice = pgTable(
  "agriculture_ai_advice",
  {
    ...agriTenant("ai_advice"),
    farmId: text("farm_id").references(() => farms.id),
    topic: text("topic").notNull(),
    adviceText: text("advice_text").notNull(),
    epistemicStatus: text("epistemic_status").notNull().default("RECOMMENDATION"),
    humanReviewRequired: boolean("human_review_required").notNull().default(true),
    sourceRefs: jsonb("source_refs").$type<unknown[]>().notNull().default([]),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_ai_advice_tenant_idx").on(t.tenantId)],
);

export const syncEnvelopes = pgTable(
  "agriculture_sync_envelopes",
  {
    ...agriTenant("sync"),
    envelopeId: text("envelope_id").notNull(),
    deviceId: text("device_id"),
    operation: text("operation").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    clientOccurredAt: timestamp("client_occurred_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("ACCEPTED"),
    conflictReason: text("conflict_reason"),
    resultObjectType: text("result_object_type"),
    resultObjectId: text("result_object_id"),
    actorUserId: text("actor_user_id"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_sync_envelopes_0_uidx").on(t.tenantId, t.envelopeId), index("agriculture_sync_envelopes_tenant_idx").on(t.tenantId)],
);

export const whatIfRuns = pgTable(
  "agriculture_whatif_runs",
  {
    ...agriTenant("whatif"),
    farmId: text("farm_id").references(() => farms.id),
    title: text("title").notNull(),
    basis: text("basis").notNull().default("SIMULATION"),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    outputs: jsonb("outputs").$type<Record<string, unknown>>().notNull().default({}),
    explanation: text("explanation"),
    actorUserId: text("actor_user_id"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_whatif_runs_tenant_idx").on(t.tenantId)],
);

export const envMetrics = pgTable(
  "agriculture_env_metrics",
  {
    ...agriTenant("env"),
    farmId: text("farm_id").references(() => farms.id),
    period: text("period").notNull(),
    metricCode: text("metric_code").notNull(),
    value: numeric("value", { precision: 16, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    source: text("source").notNull(),
    epistemicStatus: text("epistemic_status").notNull().default("OBSERVED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_env_metrics_tenant_idx").on(t.tenantId)],
);

export const safetyIncidents = pgTable(
  "agriculture_safety_incidents",
  {
    ...agriTenant("safety"),
    farmId: text("farm_id").references(() => farms.id),
    occurredOn: text("occurred_on").notNull(),
    title: text("title").notNull(),
    severity: text("severity").notNull().default("LOW"),
    status: text("status").notNull().default("OPEN"),
    classification: text("classification").notNull().default("RESTRICTED"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_safety_incidents_tenant_idx").on(t.tenantId)],
);

export const traceLinks = pgTable(
  "agriculture_trace_links",
  {
    ...agriTenant("tlinks"),
    fromBatchId: text("from_batch_id")
      .notNull()
      .references(() => traceBatches.id),
    toBatchId: text("to_batch_id")
      .notNull()
      .references(() => traceBatches.id),
    linkKind: text("link_kind").notNull().default("TRANSFORMED_INTO"),
    qty: numeric("qty", { precision: 16, scale: 4 }),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_trace_links_tenant_idx").on(t.tenantId)],
);

export const yieldOutlook = pgTable(
  "agriculture_yield_outlook",
  {
    ...agriTenant("outlook"),
    cropCycleId: text("crop_cycle_id").references(() => cropCycles.id),
    asOf: text("as_of").notNull(),
    method: text("method").notNull(),
    outlookKg: numeric("outlook_kg", { precision: 16, scale: 3 }),
    basis: text("basis").notNull().default("DERIVED"),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    explanation: text("explanation").notNull(),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_yield_outlook_tenant_idx").on(t.tenantId)],
);

export const labResults = pgTable(
  "agriculture_lab_results",
  {
    ...agriTenant("lab"),
    fieldId: text("field_id").references(() => fields.id),
    sampledOn: text("sampled_on").notNull(),
    labName: text("lab_name"),
    analyte: text("analyte").notNull(),
    value: numeric("value", { precision: 16, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_lab_results_tenant_idx").on(t.tenantId)],
);

export const yieldRecords = pgTable(
  "agriculture_yield_records",
  {
    ...agriTenant("yield"),
    cropCycleId: text("crop_cycle_id")
      .notNull()
      .references(() => cropCycles.id),
    harvestId: text("harvest_id").references(() => harvests.id),
    period: text("period").notNull(),
    qtyKg: numeric("qty_kg", { precision: 16, scale: 3 }).notNull(),
    areaHa: numeric("area_ha", { precision: 12, scale: 4 }),
    kgPerHa: numeric("kg_per_ha", { precision: 16, scale: 4 }),
    basis: text("basis").notNull().default("DERIVED"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_yield_records_tenant_idx").on(t.tenantId)],
);

export const iotDevices = pgTable(
  "agriculture_iot_devices",
  {
    ...agriTenant("iot_dev"),
    farmId: text("farm_id").references(() => farms.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    deviceKind: text("device_kind").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agriculture_iot_devices_0_uidx").on(t.tenantId, t.code), index("agriculture_iot_devices_tenant_idx").on(t.tenantId)],
);

export const iotReadings = pgTable(
  "agriculture_iot_readings",
  {
    ...agriTenant("iot_rd"),
    deviceId: text("device_id")
      .notNull()
      .references(() => iotDevices.id),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    metricCode: text("metric_code").notNull(),
    value: numeric("value", { precision: 16, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    classification: text("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agriculture_iot_readings_tenant_idx").on(t.tenantId)],
);
