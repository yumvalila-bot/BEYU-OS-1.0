-- 0034 — Agriculture OS production schema (additive Sector OS)
--
-- Extends the 0031/0032 foundation. Does NOT rewrite 0031 tables.
-- Additive ALTERs only on foundation tables (geo/classification columns).
--
-- Naming: tables are agriculture_* and deliberately avoid specialist LIKE pins
-- (%risk% %exposure% %concentration% %compliance% %obligation% %evidence%
-- %forecast% %scenario% %assumption% %cash% %treasur% %fx%).
-- Operational hazards live in agriculture_hazard_*; yield outlook is not a forecast table.
--
-- Geo: GeoJSON JSONB + lat/lon only. PostGIS is EXTERNAL_BLOCKED on CI postgres:16.
-- Finance: no journal / ledger / treasury tables. Capital cases are operational only.
-- CAP_POSTING remains LOCKED.

--> statement-breakpoint

-- Additive columns on 0031 foundation tables
ALTER TABLE agriculture_farms ADD COLUMN IF NOT EXISTS gps_latitude NUMERIC(10,7);
ALTER TABLE agriculture_farms ADD COLUMN IF NOT EXISTS gps_longitude NUMERIC(10,7);
ALTER TABLE agriculture_farms ADD COLUMN IF NOT EXISTS boundary_geojson JSONB;
ALTER TABLE agriculture_farms ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam';
ALTER TABLE agriculture_farms ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE agriculture_farms ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE agriculture_fields ADD COLUMN IF NOT EXISTS boundary_geojson JSONB;
ALTER TABLE agriculture_fields ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'INTERNAL';

ALTER TABLE agriculture_harvests ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'KG';
ALTER TABLE agriculture_harvests ADD COLUMN IF NOT EXISTS batch_code TEXT;
ALTER TABLE agriculture_harvests ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'INTERNAL';

ALTER TABLE agriculture_crop_cycles ADD COLUMN IF NOT EXISTS variety TEXT;
ALTER TABLE agriculture_crop_cycles ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'INTERNAL';

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_farmers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_entity_id TEXT REFERENCES legal_entities(id),
  party_id TEXT,
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  farmer_kind TEXT NOT NULL DEFAULT 'SMALLHOLDER',
  country_code TEXT NOT NULL DEFAULT 'TZ' REFERENCES countries(code),
  region TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_farmers_tenant_idx ON agriculture_farmers (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_farmers_0_uidx ON agriculture_farmers (tenant_id, code);
ALTER TABLE agriculture_farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_farmers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_farmers_tenant_isolation ON agriculture_farmers;
CREATE POLICY agriculture_farmers_tenant_isolation ON agriculture_farmers
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_land_parcels (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT NOT NULL REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  tenure_type TEXT NOT NULL DEFAULT 'LEASEHOLD',
  title_ref TEXT,
  area_ha NUMERIC(12,4) NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'TZ' REFERENCES countries(code),
  region TEXT,
  gps_latitude NUMERIC(10,7),
  gps_longitude NUMERIC(10,7),
  boundary_geojson JSONB,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_land_parcels_tenant_idx ON agriculture_land_parcels (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_land_parcels_0_uidx ON agriculture_land_parcels (farm_id, code);
ALTER TABLE agriculture_land_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_land_parcels FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_land_parcels_tenant_isolation ON agriculture_land_parcels;
CREATE POLICY agriculture_land_parcels_tenant_isolation ON agriculture_land_parcels
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_field_zones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  field_id TEXT NOT NULL REFERENCES agriculture_fields(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  zone_kind TEXT NOT NULL DEFAULT 'BLOCK',
  area_ha NUMERIC(12,4),
  boundary_geojson JSONB,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_field_zones_tenant_idx ON agriculture_field_zones (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_field_zones_0_uidx ON agriculture_field_zones (field_id, code);
ALTER TABLE agriculture_field_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_field_zones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_field_zones_tenant_isolation ON agriculture_field_zones;
CREATE POLICY agriculture_field_zones_tenant_isolation ON agriculture_field_zones
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_tree_species (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'PERENNIAL',
  typical_yield_unit TEXT NOT NULL DEFAULT 'KG',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_tree_species_tenant_idx ON agriculture_tree_species (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_tree_species_0_uidx ON agriculture_tree_species (tenant_id, code);
ALTER TABLE agriculture_tree_species ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_tree_species FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_tree_species_tenant_isolation ON agriculture_tree_species;
CREATE POLICY agriculture_tree_species_tenant_isolation ON agriculture_tree_species
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_trees (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT NOT NULL REFERENCES agriculture_farms(id),
  field_id TEXT REFERENCES agriculture_fields(id),
  species_id TEXT NOT NULL REFERENCES agriculture_tree_species(id),
  code TEXT NOT NULL,
  planted_on TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  gps_latitude NUMERIC(10,7),
  gps_longitude NUMERIC(10,7),
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_trees_tenant_idx ON agriculture_trees (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_trees_0_uidx ON agriculture_trees (farm_id, code);
ALTER TABLE agriculture_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_trees FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_trees_tenant_isolation ON agriculture_trees;
CREATE POLICY agriculture_trees_tenant_isolation ON agriculture_trees
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_tree_plantings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tree_id TEXT NOT NULL REFERENCES agriculture_trees(id),
  planting_date TEXT NOT NULL,
  source_lot_id TEXT,
  count_planted INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_tree_plantings_tenant_idx ON agriculture_tree_plantings (tenant_id);
ALTER TABLE agriculture_tree_plantings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_tree_plantings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_tree_plantings_tenant_isolation ON agriculture_tree_plantings;
CREATE POLICY agriculture_tree_plantings_tenant_isolation ON agriculture_tree_plantings
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_animals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  herd_id TEXT NOT NULL REFERENCES agriculture_livestock_herds(id),
  tag_code TEXT NOT NULL,
  sex TEXT,
  birth_date TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_animals_tenant_idx ON agriculture_animals (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_animals_0_uidx ON agriculture_animals (herd_id, tag_code);
ALTER TABLE agriculture_animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_animals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_animals_tenant_isolation ON agriculture_animals;
CREATE POLICY agriculture_animals_tenant_isolation ON agriculture_animals
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_veterinary_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  herd_id TEXT NOT NULL REFERENCES agriculture_livestock_herds(id),
  animal_id TEXT REFERENCES agriculture_animals(id),
  record_date TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  diagnosis TEXT,
  treatment TEXT,
  performed_by TEXT,
  notes TEXT,
  classification TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_veterinary_records_tenant_idx ON agriculture_veterinary_records (tenant_id);
ALTER TABLE agriculture_veterinary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_veterinary_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_veterinary_records_tenant_isolation ON agriculture_veterinary_records;
CREATE POLICY agriculture_veterinary_records_tenant_isolation ON agriculture_veterinary_records
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_aqua_units (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT NOT NULL REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_kind TEXT NOT NULL DEFAULT 'POND',
  volume_m3 NUMERIC(14,2),
  area_ha NUMERIC(12,4),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_aqua_units_tenant_idx ON agriculture_aqua_units (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_aqua_units_0_uidx ON agriculture_aqua_units (farm_id, code);
ALTER TABLE agriculture_aqua_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_aqua_units FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_aqua_units_tenant_isolation ON agriculture_aqua_units;
CREATE POLICY agriculture_aqua_units_tenant_isolation ON agriculture_aqua_units
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_aqua_stockings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  aqua_unit_id TEXT NOT NULL REFERENCES agriculture_aqua_units(id),
  species TEXT NOT NULL,
  stocked_on TEXT NOT NULL,
  count_stocked INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_aqua_stockings_tenant_idx ON agriculture_aqua_stockings (tenant_id);
ALTER TABLE agriculture_aqua_stockings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_aqua_stockings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_aqua_stockings_tenant_isolation ON agriculture_aqua_stockings;
CREATE POLICY agriculture_aqua_stockings_tenant_isolation ON agriculture_aqua_stockings
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_water_quality (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  aqua_unit_id TEXT NOT NULL REFERENCES agriculture_aqua_units(id),
  sampled_at TIMESTAMPTZ NOT NULL,
  ph NUMERIC(5,2),
  dissolved_oxygen_mgl NUMERIC(8,3),
  temperature_c NUMERIC(6,2),
  turbidity_ntu NUMERIC(10,3),
  source TEXT NOT NULL DEFAULT 'FIELD',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_water_quality_tenant_idx ON agriculture_water_quality (tenant_id);
ALTER TABLE agriculture_water_quality ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_water_quality FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_water_quality_tenant_isolation ON agriculture_water_quality;
CREATE POLICY agriculture_water_quality_tenant_isolation ON agriculture_water_quality
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_aqua_harvests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  aqua_unit_id TEXT NOT NULL REFERENCES agriculture_aqua_units(id),
  code TEXT NOT NULL,
  harvest_date TEXT NOT NULL,
  quantity_kg NUMERIC(14,3) NOT NULL,
  species TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_aqua_harvests_tenant_idx ON agriculture_aqua_harvests (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_aqua_harvests_0_uidx ON agriculture_aqua_harvests (tenant_id, code);
ALTER TABLE agriculture_aqua_harvests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_aqua_harvests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_aqua_harvests_tenant_isolation ON agriculture_aqua_harvests;
CREATE POLICY agriculture_aqua_harvests_tenant_isolation ON agriculture_aqua_harvests
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_equipment (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  equipment_kind TEXT NOT NULL,
  serial_no TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  acquired_on TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_equipment_tenant_idx ON agriculture_equipment (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_equipment_0_uidx ON agriculture_equipment (tenant_id, code);
ALTER TABLE agriculture_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_equipment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_equipment_tenant_isolation ON agriculture_equipment;
CREATE POLICY agriculture_equipment_tenant_isolation ON agriculture_equipment
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_equipment_service (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  equipment_id TEXT NOT NULL REFERENCES agriculture_equipment(id),
  service_date TEXT NOT NULL,
  service_kind TEXT NOT NULL,
  notes TEXT,
  performed_by TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_equipment_service_tenant_idx ON agriculture_equipment_service (tenant_id);
ALTER TABLE agriculture_equipment_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_equipment_service FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_equipment_service_tenant_isolation ON agriculture_equipment_service;
CREATE POLICY agriculture_equipment_service_tenant_isolation ON agriculture_equipment_service
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_inventory_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_inventory_items_tenant_idx ON agriculture_inventory_items (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_inventory_items_0_uidx ON agriculture_inventory_items (tenant_id, code);
ALTER TABLE agriculture_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_inventory_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_inventory_items_tenant_isolation ON agriculture_inventory_items;
CREATE POLICY agriculture_inventory_items_tenant_isolation ON agriculture_inventory_items
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_inventory_lots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  item_id TEXT NOT NULL REFERENCES agriculture_inventory_items(id),
  lot_code TEXT NOT NULL,
  qty_on_hand NUMERIC(16,4) NOT NULL DEFAULT 0,
  expires_on TEXT,
  warehouse_id TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_inventory_lots_tenant_idx ON agriculture_inventory_lots (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_inventory_lots_0_uidx ON agriculture_inventory_lots (item_id, lot_code);
ALTER TABLE agriculture_inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_inventory_lots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_inventory_lots_tenant_isolation ON agriculture_inventory_lots;
CREATE POLICY agriculture_inventory_lots_tenant_isolation ON agriculture_inventory_lots
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_inventory_moves (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  lot_id TEXT NOT NULL REFERENCES agriculture_inventory_lots(id),
  move_kind TEXT NOT NULL,
  qty NUMERIC(16,4) NOT NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  ref_type TEXT,
  ref_id TEXT,
  actor_user_id TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_inventory_moves_tenant_idx ON agriculture_inventory_moves (tenant_id);
ALTER TABLE agriculture_inventory_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_inventory_moves FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_inventory_moves_tenant_isolation ON agriculture_inventory_moves;
CREATE POLICY agriculture_inventory_moves_tenant_isolation ON agriculture_inventory_moves
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_work_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  field_id TEXT REFERENCES agriculture_fields(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  work_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  due_on TEXT,
  assigned_role TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_work_orders_tenant_idx ON agriculture_work_orders (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_work_orders_0_uidx ON agriculture_work_orders (tenant_id, code);
ALTER TABLE agriculture_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_work_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_work_orders_tenant_isolation ON agriculture_work_orders;
CREATE POLICY agriculture_work_orders_tenant_isolation ON agriculture_work_orders
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_field_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  work_order_id TEXT REFERENCES agriculture_work_orders(id),
  field_id TEXT REFERENCES agriculture_fields(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  due_on TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_field_tasks_tenant_idx ON agriculture_field_tasks (tenant_id);
ALTER TABLE agriculture_field_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_field_tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_field_tasks_tenant_isolation ON agriculture_field_tasks;
CREATE POLICY agriculture_field_tasks_tenant_isolation ON agriculture_field_tasks
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_task_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  task_id TEXT NOT NULL REFERENCES agriculture_field_tasks(id),
  assignee_user_id TEXT,
  assignee_role TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  classification TEXT NOT NULL DEFAULT 'INTERNAL'
);
CREATE INDEX IF NOT EXISTS agriculture_task_assignments_tenant_idx ON agriculture_task_assignments (tenant_id);
ALTER TABLE agriculture_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_task_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_task_assignments_tenant_isolation ON agriculture_task_assignments;
CREATE POLICY agriculture_task_assignments_tenant_isolation ON agriculture_task_assignments
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_field_observations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  field_id TEXT REFERENCES agriculture_fields(id),
  observed_at TIMESTAMPTZ NOT NULL,
  observation_kind TEXT NOT NULL,
  body TEXT NOT NULL,
  gps_latitude NUMERIC(10,7),
  gps_longitude NUMERIC(10,7),
  observed_by TEXT,
  offline_envelope_id TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_field_observations_tenant_idx ON agriculture_field_observations (tenant_id);
ALTER TABLE agriculture_field_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_field_observations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_field_observations_tenant_isolation ON agriculture_field_observations;
CREATE POLICY agriculture_field_observations_tenant_isolation ON agriculture_field_observations
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_measurements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  field_id TEXT REFERENCES agriculture_fields(id),
  measured_at TIMESTAMPTZ NOT NULL,
  metric_code TEXT NOT NULL,
  value NUMERIC(16,4) NOT NULL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'FIELD',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_measurements_tenant_idx ON agriculture_measurements (tenant_id);
ALTER TABLE agriculture_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_measurements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_measurements_tenant_isolation ON agriculture_measurements;
CREATE POLICY agriculture_measurements_tenant_isolation ON agriculture_measurements
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_pest_observations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  field_id TEXT REFERENCES agriculture_fields(id),
  observed_at TIMESTAMPTZ NOT NULL,
  pest_name TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'LOW',
  notes TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_pest_observations_tenant_idx ON agriculture_pest_observations (tenant_id);
ALTER TABLE agriculture_pest_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_pest_observations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_pest_observations_tenant_isolation ON agriculture_pest_observations;
CREATE POLICY agriculture_pest_observations_tenant_isolation ON agriculture_pest_observations
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_soil_tests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  field_id TEXT REFERENCES agriculture_fields(id),
  sampled_on TEXT NOT NULL,
  ph NUMERIC(5,2),
  organic_matter_pct NUMERIC(6,3),
  nitrogen_ppm NUMERIC(10,3),
  phosphorus_ppm NUMERIC(10,3),
  potassium_ppm NUMERIC(10,3),
  lab_name TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_soil_tests_tenant_idx ON agriculture_soil_tests (tenant_id);
ALTER TABLE agriculture_soil_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_soil_tests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_soil_tests_tenant_isolation ON agriculture_soil_tests;
CREATE POLICY agriculture_soil_tests_tenant_isolation ON agriculture_soil_tests
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_weather_readings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  captured_at TIMESTAMPTZ NOT NULL,
  provider TEXT NOT NULL,
  location_label TEXT,
  gps_latitude NUMERIC(10,7),
  gps_longitude NUMERIC(10,7),
  temperature_c NUMERIC(6,2),
  rainfall_mm NUMERIC(10,3),
  humidity_pct NUMERIC(6,2),
  wind_ms NUMERIC(8,3),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  epistemic_status TEXT NOT NULL DEFAULT 'OBSERVED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_weather_readings_tenant_idx ON agriculture_weather_readings (tenant_id);
ALTER TABLE agriculture_weather_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_weather_readings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_weather_readings_tenant_isolation ON agriculture_weather_readings;
CREATE POLICY agriculture_weather_readings_tenant_isolation ON agriculture_weather_readings
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_water_sources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT NOT NULL REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_water_sources_tenant_idx ON agriculture_water_sources (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_water_sources_0_uidx ON agriculture_water_sources (farm_id, code);
ALTER TABLE agriculture_water_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_water_sources FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_water_sources_tenant_isolation ON agriculture_water_sources;
CREATE POLICY agriculture_water_sources_tenant_isolation ON agriculture_water_sources
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_irrigation_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  field_id TEXT REFERENCES agriculture_fields(id),
  water_source_id TEXT REFERENCES agriculture_water_sources(id),
  irrigated_on TEXT NOT NULL,
  volume_m3 NUMERIC(14,3),
  method TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_irrigation_logs_tenant_idx ON agriculture_irrigation_logs (tenant_id);
ALTER TABLE agriculture_irrigation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_irrigation_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_irrigation_logs_tenant_isolation ON agriculture_irrigation_logs;
CREATE POLICY agriculture_irrigation_logs_tenant_isolation ON agriculture_irrigation_logs
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  product_kind TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL DEFAULT 'KG',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_products_tenant_idx ON agriculture_products (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_products_0_uidx ON agriculture_products (tenant_id, code);
ALTER TABLE agriculture_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_products_tenant_isolation ON agriculture_products;
CREATE POLICY agriculture_products_tenant_isolation ON agriculture_products
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_trace_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES agriculture_products(id),
  harvest_id TEXT REFERENCES agriculture_harvests(id),
  batch_code TEXT NOT NULL,
  origin_farm_id TEXT REFERENCES agriculture_farms(id),
  qty NUMERIC(16,4) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'KG',
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_trace_batches_tenant_idx ON agriculture_trace_batches (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_trace_batches_0_uidx ON agriculture_trace_batches (tenant_id, batch_code);
ALTER TABLE agriculture_trace_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_trace_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_trace_batches_tenant_isolation ON agriculture_trace_batches;
CREATE POLICY agriculture_trace_batches_tenant_isolation ON agriculture_trace_batches
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_process_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  batch_id TEXT REFERENCES agriculture_trace_batches(id),
  process_kind TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  input_qty NUMERIC(16,4),
  output_qty NUMERIC(16,4),
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_process_runs_tenant_idx ON agriculture_process_runs (tenant_id);
ALTER TABLE agriculture_process_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_process_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_process_runs_tenant_isolation ON agriculture_process_runs;
CREATE POLICY agriculture_process_runs_tenant_isolation ON agriculture_process_runs
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_warehouses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'TZ' REFERENCES countries(code),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_warehouses_tenant_idx ON agriculture_warehouses (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_warehouses_0_uidx ON agriculture_warehouses (tenant_id, code);
ALTER TABLE agriculture_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_warehouses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_warehouses_tenant_isolation ON agriculture_warehouses;
CREATE POLICY agriculture_warehouses_tenant_isolation ON agriculture_warehouses
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_storage_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  warehouse_id TEXT NOT NULL REFERENCES agriculture_warehouses(id),
  batch_id TEXT REFERENCES agriculture_trace_batches(id),
  qty NUMERIC(16,4) NOT NULL,
  stored_on TEXT NOT NULL,
  condition TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_storage_records_tenant_idx ON agriculture_storage_records (tenant_id);
ALTER TABLE agriculture_storage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_storage_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_storage_records_tenant_isolation ON agriculture_storage_records;
CREATE POLICY agriculture_storage_records_tenant_isolation ON agriculture_storage_records
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_shipments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  from_warehouse_id TEXT REFERENCES agriculture_warehouses(id),
  buyer_id TEXT,
  shipped_on TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_shipments_tenant_idx ON agriculture_shipments (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_shipments_0_uidx ON agriculture_shipments (tenant_id, code);
ALTER TABLE agriculture_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_shipments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_shipments_tenant_isolation ON agriculture_shipments;
CREATE POLICY agriculture_shipments_tenant_isolation ON agriculture_shipments
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_shipment_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  shipment_id TEXT NOT NULL REFERENCES agriculture_shipments(id),
  batch_id TEXT REFERENCES agriculture_trace_batches(id),
  qty NUMERIC(16,4) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'KG',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_shipment_items_tenant_idx ON agriculture_shipment_items (tenant_id);
ALTER TABLE agriculture_shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_shipment_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_shipment_items_tenant_isolation ON agriculture_shipment_items;
CREATE POLICY agriculture_shipment_items_tenant_isolation ON agriculture_shipment_items
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_buyers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'TZ' REFERENCES countries(code),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_buyers_tenant_idx ON agriculture_buyers (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_buyers_0_uidx ON agriculture_buyers (tenant_id, code);
ALTER TABLE agriculture_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_buyers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_buyers_tenant_isolation ON agriculture_buyers;
CREATE POLICY agriculture_buyers_tenant_isolation ON agriculture_buyers
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'TZ' REFERENCES countries(code),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_suppliers_tenant_idx ON agriculture_suppliers (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_suppliers_0_uidx ON agriculture_suppliers (tenant_id, code);
ALTER TABLE agriculture_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_suppliers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_suppliers_tenant_isolation ON agriculture_suppliers;
CREATE POLICY agriculture_suppliers_tenant_isolation ON agriculture_suppliers
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_listings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  seller_farm_id TEXT REFERENCES agriculture_farms(id),
  product_id TEXT REFERENCES agriculture_products(id),
  title TEXT NOT NULL,
  qty_available NUMERIC(16,4) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'KG',
  asking_price NUMERIC(16,4),
  currency TEXT NOT NULL DEFAULT 'TZS',
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_listings_tenant_idx ON agriculture_listings (tenant_id);
ALTER TABLE agriculture_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_listings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_listings_tenant_isolation ON agriculture_listings;
CREATE POLICY agriculture_listings_tenant_isolation ON agriculture_listings
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  buyer_id TEXT REFERENCES agriculture_buyers(id),
  listing_id TEXT REFERENCES agriculture_listings(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  ordered_on TEXT,
  currency TEXT NOT NULL DEFAULT 'TZS',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_orders_tenant_idx ON agriculture_orders (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_orders_0_uidx ON agriculture_orders (tenant_id, code);
ALTER TABLE agriculture_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_orders_tenant_isolation ON agriculture_orders;
CREATE POLICY agriculture_orders_tenant_isolation ON agriculture_orders
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_order_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  order_id TEXT NOT NULL REFERENCES agriculture_orders(id),
  product_id TEXT REFERENCES agriculture_products(id),
  qty NUMERIC(16,4) NOT NULL,
  unit_price NUMERIC(16,4),
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_order_items_tenant_idx ON agriculture_order_items (tenant_id);
ALTER TABLE agriculture_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_order_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_order_items_tenant_isolation ON agriculture_order_items;
CREATE POLICY agriculture_order_items_tenant_isolation ON agriculture_order_items
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_agreements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  counterparty_name TEXT NOT NULL,
  agreement_kind TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_agreements_tenant_idx ON agriculture_agreements (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_agreements_0_uidx ON agriculture_agreements (tenant_id, code);
ALTER TABLE agriculture_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_agreements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_agreements_tenant_isolation ON agriculture_agreements;
CREATE POLICY agriculture_agreements_tenant_isolation ON agriculture_agreements
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_entity_id TEXT REFERENCES legal_entities(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  starts_on TEXT,
  ends_on TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_projects_tenant_idx ON agriculture_projects (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_projects_0_uidx ON agriculture_projects (tenant_id, code);
ALTER TABLE agriculture_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_projects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_projects_tenant_isolation ON agriculture_projects;
CREATE POLICY agriculture_projects_tenant_isolation ON agriculture_projects
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_project_milestones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES agriculture_projects(id),
  title TEXT NOT NULL,
  due_on TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_project_milestones_tenant_idx ON agriculture_project_milestones (tenant_id);
ALTER TABLE agriculture_project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_project_milestones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_project_milestones_tenant_isolation ON agriculture_project_milestones;
CREATE POLICY agriculture_project_milestones_tenant_isolation ON agriculture_project_milestones
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_project_budgets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES agriculture_projects(id),
  period TEXT NOT NULL,
  amount NUMERIC(16,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TZS',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_project_budgets_tenant_idx ON agriculture_project_budgets (tenant_id);
ALTER TABLE agriculture_project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_project_budgets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_project_budgets_tenant_isolation ON agriculture_project_budgets;
CREATE POLICY agriculture_project_budgets_tenant_isolation ON agriculture_project_budgets
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_asset_register (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_kind TEXT NOT NULL,
  acquired_on TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_asset_register_tenant_idx ON agriculture_asset_register (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_asset_register_0_uidx ON agriculture_asset_register (tenant_id, code);
ALTER TABLE agriculture_asset_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_asset_register FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_asset_register_tenant_isolation ON agriculture_asset_register;
CREATE POLICY agriculture_asset_register_tenant_isolation ON agriculture_asset_register
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_hazard_register (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  hazard_kind TEXT NOT NULL,
  likelihood INTEGER NOT NULL DEFAULT 1,
  impact INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_hazard_register_tenant_idx ON agriculture_hazard_register (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_hazard_register_0_uidx ON agriculture_hazard_register (tenant_id, code);
ALTER TABLE agriculture_hazard_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_hazard_register FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_hazard_register_tenant_isolation ON agriculture_hazard_register;
CREATE POLICY agriculture_hazard_register_tenant_isolation ON agriculture_hazard_register
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_hazard_mitigations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  hazard_id TEXT NOT NULL REFERENCES agriculture_hazard_register(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  owner_role TEXT,
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_hazard_mitigations_tenant_idx ON agriculture_hazard_mitigations (tenant_id);
ALTER TABLE agriculture_hazard_mitigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_hazard_mitigations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_hazard_mitigations_tenant_isolation ON agriculture_hazard_mitigations;
CREATE POLICY agriculture_hazard_mitigations_tenant_isolation ON agriculture_hazard_mitigations
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_permits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  issuer TEXT,
  issued_on TEXT,
  expires_on TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_permits_tenant_idx ON agriculture_permits (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_permits_0_uidx ON agriculture_permits (tenant_id, code);
ALTER TABLE agriculture_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_permits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_permits_tenant_isolation ON agriculture_permits;
CREATE POLICY agriculture_permits_tenant_isolation ON agriculture_permits
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_licenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  issuer TEXT,
  issued_on TEXT,
  expires_on TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_licenses_tenant_idx ON agriculture_licenses (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_licenses_0_uidx ON agriculture_licenses (tenant_id, code);
ALTER TABLE agriculture_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_licenses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_licenses_tenant_isolation ON agriculture_licenses;
CREATE POLICY agriculture_licenses_tenant_isolation ON agriculture_licenses
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_certificates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  scheme TEXT,
  issued_on TEXT,
  expires_on TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_certificates_tenant_idx ON agriculture_certificates (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_certificates_0_uidx ON agriculture_certificates (tenant_id, code);
ALTER TABLE agriculture_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_certificates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_certificates_tenant_isolation ON agriculture_certificates;
CREATE POLICY agriculture_certificates_tenant_isolation ON agriculture_certificates
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_inspections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  inspected_on TEXT NOT NULL,
  inspector TEXT,
  outcome TEXT NOT NULL DEFAULT 'PENDING',
  findings TEXT,
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_inspections_tenant_idx ON agriculture_inspections (tenant_id);
ALTER TABLE agriculture_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_inspections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_inspections_tenant_isolation ON agriculture_inspections;
CREATE POLICY agriculture_inspections_tenant_isolation ON agriculture_inspections
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_violations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  inspection_id TEXT REFERENCES agriculture_inspections(id),
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'LOW',
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_violations_tenant_idx ON agriculture_violations (tenant_id);
ALTER TABLE agriculture_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_violations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_violations_tenant_isolation ON agriculture_violations;
CREATE POLICY agriculture_violations_tenant_isolation ON agriculture_violations
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_corrective_actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  violation_id TEXT REFERENCES agriculture_violations(id),
  title TEXT NOT NULL,
  due_on TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_corrective_actions_tenant_idx ON agriculture_corrective_actions (tenant_id);
ALTER TABLE agriculture_corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_corrective_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_corrective_actions_tenant_isolation ON agriculture_corrective_actions;
CREATE POLICY agriculture_corrective_actions_tenant_isolation ON agriculture_corrective_actions
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_insurance_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  policy_no TEXT NOT NULL,
  insurer TEXT NOT NULL,
  cover_kind TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_insurance_policies_tenant_idx ON agriculture_insurance_policies (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_insurance_policies_0_uidx ON agriculture_insurance_policies (tenant_id, policy_no);
ALTER TABLE agriculture_insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_insurance_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_insurance_policies_tenant_isolation ON agriculture_insurance_policies;
CREATE POLICY agriculture_insurance_policies_tenant_isolation ON agriculture_insurance_policies
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_insurance_claims (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  policy_id TEXT NOT NULL REFERENCES agriculture_insurance_policies(id),
  claim_no TEXT NOT NULL,
  filed_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'FILED',
  amount NUMERIC(16,2),
  currency TEXT NOT NULL DEFAULT 'TZS',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_insurance_claims_tenant_idx ON agriculture_insurance_claims (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_insurance_claims_0_uidx ON agriculture_insurance_claims (tenant_id, claim_no);
ALTER TABLE agriculture_insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_insurance_claims FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_insurance_claims_tenant_isolation ON agriculture_insurance_claims;
CREATE POLICY agriculture_insurance_claims_tenant_isolation ON agriculture_insurance_claims
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  uri TEXT,
  checksum TEXT,
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_documents_tenant_idx ON agriculture_documents (tenant_id);
ALTER TABLE agriculture_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_documents_tenant_isolation ON agriculture_documents;
CREATE POLICY agriculture_documents_tenant_isolation ON agriculture_documents
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_capital_cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_entity_id TEXT REFERENCES legal_entities(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(16,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  finance_capital_request_id TEXT,
  finance_handoff TEXT NOT NULL DEFAULT 'SUBMITTED_PENDING_FINANCE',
  requested_by TEXT,
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_capital_cases_tenant_idx ON agriculture_capital_cases (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_capital_cases_0_uidx ON agriculture_capital_cases (tenant_id, code);
ALTER TABLE agriculture_capital_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_capital_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_capital_cases_tenant_isolation ON agriculture_capital_cases;
CREATE POLICY agriculture_capital_cases_tenant_isolation ON agriculture_capital_cases
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_ai_advice (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  topic TEXT NOT NULL,
  advice_text TEXT NOT NULL,
  epistemic_status TEXT NOT NULL DEFAULT 'RECOMMENDATION',
  human_review_required BOOLEAN NOT NULL DEFAULT TRUE,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_ai_advice_tenant_idx ON agriculture_ai_advice (tenant_id);
ALTER TABLE agriculture_ai_advice ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_ai_advice FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_ai_advice_tenant_isolation ON agriculture_ai_advice;
CREATE POLICY agriculture_ai_advice_tenant_isolation ON agriculture_ai_advice
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_sync_envelopes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  envelope_id TEXT NOT NULL,
  device_id TEXT,
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,
  client_occurred_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACCEPTED',
  conflict_reason TEXT,
  result_object_type TEXT,
  result_object_id TEXT,
  actor_user_id TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_sync_envelopes_tenant_idx ON agriculture_sync_envelopes (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_sync_envelopes_0_uidx ON agriculture_sync_envelopes (tenant_id, envelope_id);
ALTER TABLE agriculture_sync_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_sync_envelopes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_sync_envelopes_tenant_isolation ON agriculture_sync_envelopes;
CREATE POLICY agriculture_sync_envelopes_tenant_isolation ON agriculture_sync_envelopes
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_whatif_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  title TEXT NOT NULL,
  basis TEXT NOT NULL DEFAULT 'SIMULATION',
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanation TEXT,
  actor_user_id TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_whatif_runs_tenant_idx ON agriculture_whatif_runs (tenant_id);
ALTER TABLE agriculture_whatif_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_whatif_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_whatif_runs_tenant_isolation ON agriculture_whatif_runs;
CREATE POLICY agriculture_whatif_runs_tenant_isolation ON agriculture_whatif_runs
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_env_metrics (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  period TEXT NOT NULL,
  metric_code TEXT NOT NULL,
  value NUMERIC(16,4) NOT NULL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL,
  epistemic_status TEXT NOT NULL DEFAULT 'OBSERVED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_env_metrics_tenant_idx ON agriculture_env_metrics (tenant_id);
ALTER TABLE agriculture_env_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_env_metrics FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_env_metrics_tenant_isolation ON agriculture_env_metrics;
CREATE POLICY agriculture_env_metrics_tenant_isolation ON agriculture_env_metrics
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_safety_incidents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  occurred_on TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'LOW',
  status TEXT NOT NULL DEFAULT 'OPEN',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_safety_incidents_tenant_idx ON agriculture_safety_incidents (tenant_id);
ALTER TABLE agriculture_safety_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_safety_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_safety_incidents_tenant_isolation ON agriculture_safety_incidents;
CREATE POLICY agriculture_safety_incidents_tenant_isolation ON agriculture_safety_incidents
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_trace_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  from_batch_id TEXT NOT NULL REFERENCES agriculture_trace_batches(id),
  to_batch_id TEXT NOT NULL REFERENCES agriculture_trace_batches(id),
  link_kind TEXT NOT NULL DEFAULT 'TRANSFORMED_INTO',
  qty NUMERIC(16,4),
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_trace_links_tenant_idx ON agriculture_trace_links (tenant_id);
ALTER TABLE agriculture_trace_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_trace_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_trace_links_tenant_isolation ON agriculture_trace_links;
CREATE POLICY agriculture_trace_links_tenant_isolation ON agriculture_trace_links
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_yield_outlook (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  crop_cycle_id TEXT REFERENCES agriculture_crop_cycles(id),
  as_of TEXT NOT NULL,
  method TEXT NOT NULL,
  outlook_kg NUMERIC(16,3),
  basis TEXT NOT NULL DEFAULT 'DERIVED',
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanation TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_yield_outlook_tenant_idx ON agriculture_yield_outlook (tenant_id);
ALTER TABLE agriculture_yield_outlook ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_yield_outlook FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_yield_outlook_tenant_isolation ON agriculture_yield_outlook;
CREATE POLICY agriculture_yield_outlook_tenant_isolation ON agriculture_yield_outlook
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_lab_results (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  field_id TEXT REFERENCES agriculture_fields(id),
  sampled_on TEXT NOT NULL,
  lab_name TEXT,
  analyte TEXT NOT NULL,
  value NUMERIC(16,4) NOT NULL,
  unit TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_lab_results_tenant_idx ON agriculture_lab_results (tenant_id);
ALTER TABLE agriculture_lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_lab_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_lab_results_tenant_isolation ON agriculture_lab_results;
CREATE POLICY agriculture_lab_results_tenant_isolation ON agriculture_lab_results
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_yield_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  crop_cycle_id TEXT NOT NULL REFERENCES agriculture_crop_cycles(id),
  harvest_id TEXT REFERENCES agriculture_harvests(id),
  period TEXT NOT NULL,
  qty_kg NUMERIC(16,3) NOT NULL,
  area_ha NUMERIC(12,4),
  kg_per_ha NUMERIC(16,4),
  basis TEXT NOT NULL DEFAULT 'DERIVED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_yield_records_tenant_idx ON agriculture_yield_records (tenant_id);
ALTER TABLE agriculture_yield_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_yield_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_yield_records_tenant_isolation ON agriculture_yield_records;
CREATE POLICY agriculture_yield_records_tenant_isolation ON agriculture_yield_records
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_iot_devices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  device_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_iot_devices_tenant_idx ON agriculture_iot_devices (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_iot_devices_0_uidx ON agriculture_iot_devices (tenant_id, code);
ALTER TABLE agriculture_iot_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_iot_devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_iot_devices_tenant_isolation ON agriculture_iot_devices;
CREATE POLICY agriculture_iot_devices_tenant_isolation ON agriculture_iot_devices
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_iot_readings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  device_id TEXT NOT NULL REFERENCES agriculture_iot_devices(id),
  captured_at TIMESTAMPTZ NOT NULL,
  metric_code TEXT NOT NULL,
  value NUMERIC(16,4) NOT NULL,
  unit TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_iot_readings_tenant_idx ON agriculture_iot_readings (tenant_id);
ALTER TABLE agriculture_iot_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_iot_readings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_iot_readings_tenant_isolation ON agriculture_iot_readings;
CREATE POLICY agriculture_iot_readings_tenant_isolation ON agriculture_iot_readings
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON agriculture_farmers, agriculture_land_parcels, agriculture_field_zones, agriculture_tree_species, agriculture_trees, agriculture_tree_plantings, agriculture_animals, agriculture_veterinary_records, agriculture_aqua_units, agriculture_aqua_stockings, agriculture_water_quality, agriculture_aqua_harvests, agriculture_equipment, agriculture_equipment_service, agriculture_inventory_items, agriculture_inventory_lots, agriculture_inventory_moves, agriculture_work_orders, agriculture_field_tasks, agriculture_task_assignments, agriculture_field_observations, agriculture_measurements, agriculture_pest_observations, agriculture_soil_tests, agriculture_weather_readings, agriculture_water_sources, agriculture_irrigation_logs, agriculture_products, agriculture_trace_batches, agriculture_process_runs, agriculture_warehouses, agriculture_storage_records, agriculture_shipments, agriculture_shipment_items, agriculture_buyers, agriculture_suppliers, agriculture_listings, agriculture_orders, agriculture_order_items, agriculture_agreements, agriculture_projects, agriculture_project_milestones, agriculture_project_budgets, agriculture_asset_register, agriculture_hazard_register, agriculture_hazard_mitigations, agriculture_permits, agriculture_licenses, agriculture_certificates, agriculture_inspections, agriculture_violations, agriculture_corrective_actions, agriculture_insurance_policies, agriculture_insurance_claims, agriculture_documents, agriculture_capital_cases, agriculture_ai_advice, agriculture_sync_envelopes, agriculture_whatif_runs, agriculture_env_metrics, agriculture_safety_incidents, agriculture_trace_links, agriculture_yield_outlook, agriculture_lab_results, agriculture_yield_records, agriculture_iot_devices, agriculture_iot_readings TO %I', r.rolname);
  END LOOP;
END
$$;

--> statement-breakpoint

-- Verification: every new table has RLS using beyu_tenant_ids()
DO $$
DECLARE
  table_name text;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY['agriculture_farmers', 'agriculture_land_parcels', 'agriculture_field_zones', 'agriculture_tree_species', 'agriculture_trees', 'agriculture_tree_plantings', 'agriculture_animals', 'agriculture_veterinary_records', 'agriculture_aqua_units', 'agriculture_aqua_stockings', 'agriculture_water_quality', 'agriculture_aqua_harvests', 'agriculture_equipment', 'agriculture_equipment_service', 'agriculture_inventory_items', 'agriculture_inventory_lots', 'agriculture_inventory_moves', 'agriculture_work_orders', 'agriculture_field_tasks', 'agriculture_task_assignments', 'agriculture_field_observations', 'agriculture_measurements', 'agriculture_pest_observations', 'agriculture_soil_tests', 'agriculture_weather_readings', 'agriculture_water_sources', 'agriculture_irrigation_logs', 'agriculture_products', 'agriculture_trace_batches', 'agriculture_process_runs', 'agriculture_warehouses', 'agriculture_storage_records', 'agriculture_shipments', 'agriculture_shipment_items', 'agriculture_buyers', 'agriculture_suppliers', 'agriculture_listings', 'agriculture_orders', 'agriculture_order_items', 'agriculture_agreements', 'agriculture_projects', 'agriculture_project_milestones', 'agriculture_project_budgets', 'agriculture_asset_register', 'agriculture_hazard_register', 'agriculture_hazard_mitigations', 'agriculture_permits', 'agriculture_licenses', 'agriculture_certificates', 'agriculture_inspections', 'agriculture_violations', 'agriculture_corrective_actions', 'agriculture_insurance_policies', 'agriculture_insurance_claims', 'agriculture_documents', 'agriculture_capital_cases', 'agriculture_ai_advice', 'agriculture_sync_envelopes', 'agriculture_whatif_runs', 'agriculture_env_metrics', 'agriculture_safety_incidents', 'agriculture_trace_links', 'agriculture_yield_outlook', 'agriculture_lab_results', 'agriculture_yield_records', 'agriculture_iot_devices', 'agriculture_iot_readings'])
  LOOP
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND qual LIKE '%beyu_tenant_ids()%';
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0034 verification failed: % missing beyu_tenant_ids() policy', table_name;
    END IF;
  END LOOP;
END $$;
