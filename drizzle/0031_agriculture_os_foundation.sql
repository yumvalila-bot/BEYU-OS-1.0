-- Agriculture OS — foundational schema
--
-- STATUS: SCAFFOLDED (core tables only)
--
-- Covers: farms, fields, crop types, crop cycles, inputs, harvests,
-- livestock types, herds, and livestock events.
--
-- Full Agriculture OS (fisheries, aquaculture, processing, traceability,
-- value chain, analytics) is a future phase.
--
-- Authority: Agriculture OS owns agricultural operations
-- Finance OS owns financial consequences
-- BEYU OS owns identity, authorization, governance

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Farms
CREATE TABLE IF NOT EXISTS agriculture_farms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL REFERENCES countries(code),
  region TEXT,
  total_area_ha NUMERIC(12,2),
  arable_area_ha NUMERIC(12,2),
  elevation_m INTEGER,
  soil_type TEXT,
  water_source TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_farms_tenant_code_uidx ON agriculture_farms (tenant_id, code);
CREATE INDEX IF NOT EXISTS agriculture_farms_tenant_idx ON agriculture_farms (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_farms_entity_idx ON agriculture_farms (legal_entity_id);

-- Fields
CREATE TABLE IF NOT EXISTS agriculture_fields (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT NOT NULL REFERENCES agriculture_farms(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  area_ha NUMERIC(12,2) NOT NULL,
  soil_type TEXT,
  irrigation_type TEXT,
  gps_latitude NUMERIC(10,7),
  gps_longitude NUMERIC(10,7),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_fields_farm_code_uidx ON agriculture_fields (farm_id, code);
CREATE INDEX IF NOT EXISTS agriculture_fields_tenant_idx ON agriculture_fields (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_fields_farm_idx ON agriculture_fields (farm_id);

-- Crop types (master data)
CREATE TABLE IF NOT EXISTS agriculture_crop_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  variety TEXT,
  growth_cycle_days INTEGER,
  yield_per_ha_kg NUMERIC(12,2),
  unit_of_measure TEXT NOT NULL DEFAULT 'KG',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_crop_types_tenant_code_uidx ON agriculture_crop_types (tenant_id, code);
CREATE INDEX IF NOT EXISTS agriculture_crop_types_tenant_idx ON agriculture_crop_types (tenant_id);

-- Crop cycles
CREATE TABLE IF NOT EXISTS agriculture_crop_cycles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  field_id TEXT NOT NULL REFERENCES agriculture_fields(id),
  crop_type_id TEXT NOT NULL REFERENCES agriculture_crop_types(id),
  code TEXT NOT NULL,
  season TEXT NOT NULL,
  planting_date TEXT NOT NULL,
  expected_harvest_date TEXT,
  actual_harvest_date TEXT,
  seed_quantity_kg NUMERIC(12,2),
  expected_yield_kg NUMERIC(12,2),
  actual_yield_kg NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'PLANTED',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_crop_cycles_tenant_code_uidx ON agriculture_crop_cycles (tenant_id, code);
CREATE INDEX IF NOT EXISTS agriculture_crop_cycles_tenant_idx ON agriculture_crop_cycles (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_crop_cycles_field_idx ON agriculture_crop_cycles (field_id);
CREATE INDEX IF NOT EXISTS agriculture_crop_cycles_status_idx ON agriculture_crop_cycles (status);

-- Inputs (seeds, fertilizer, etc.)
CREATE TABLE IF NOT EXISTS agriculture_inputs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  manufacturer TEXT,
  registration_number TEXT,
  active_ingredient TEXT,
  safety_data_sheet_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_inputs_tenant_code_uidx ON agriculture_inputs (tenant_id, code);
CREATE INDEX IF NOT EXISTS agriculture_inputs_tenant_idx ON agriculture_inputs (tenant_id);

-- Input applications
CREATE TABLE IF NOT EXISTS agriculture_input_applications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  crop_cycle_id TEXT NOT NULL REFERENCES agriculture_crop_cycles(id),
  input_id TEXT NOT NULL REFERENCES agriculture_inputs(id),
  applied_date TEXT NOT NULL,
  quantity_applied NUMERIC(12,2) NOT NULL,
  application_method TEXT,
  applied_by TEXT,
  weather_conditions TEXT,
  pre_harvest_interval_days INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_input_applications_tenant_idx ON agriculture_input_applications (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_input_applications_cycle_idx ON agriculture_input_applications (crop_cycle_id);

-- Harvests
CREATE TABLE IF NOT EXISTS agriculture_harvests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  crop_cycle_id TEXT NOT NULL REFERENCES agriculture_crop_cycles(id),
  code TEXT NOT NULL,
  harvest_date TEXT NOT NULL,
  quantity_kg NUMERIC(12,2) NOT NULL,
  quality_grade TEXT,
  moisture_content NUMERIC(5,2),
  harvested_by TEXT,
  storage_location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_harvests_tenant_code_uidx ON agriculture_harvests (tenant_id, code);
CREATE INDEX IF NOT EXISTS agriculture_harvests_tenant_idx ON agriculture_harvests (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_harvests_cycle_idx ON agriculture_harvests (crop_cycle_id);

-- Livestock types
CREATE TABLE IF NOT EXISTS agriculture_livestock_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  breed TEXT,
  purpose TEXT NOT NULL,
  average_weight_kg NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_livestock_types_tenant_code_uidx ON agriculture_livestock_types (tenant_id, code);
CREATE INDEX IF NOT EXISTS agriculture_livestock_types_tenant_idx ON agriculture_livestock_types (tenant_id);

-- Livestock herds
CREATE TABLE IF NOT EXISTS agriculture_livestock_herds (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  farm_id TEXT NOT NULL REFERENCES agriculture_farms(id),
  livestock_type_id TEXT NOT NULL REFERENCES agriculture_livestock_types(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  head_count INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_livestock_herds_farm_code_uidx ON agriculture_livestock_herds (farm_id, code);
CREATE INDEX IF NOT EXISTS agriculture_livestock_herds_tenant_idx ON agriculture_livestock_herds (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_livestock_herds_farm_idx ON agriculture_livestock_herds (farm_id);

-- Livestock events
CREATE TABLE IF NOT EXISTS agriculture_livestock_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  herd_id TEXT NOT NULL REFERENCES agriculture_livestock_herds(id),
  event_type TEXT NOT NULL,
  event_date TEXT NOT NULL,
  head_count INTEGER NOT NULL,
  description TEXT,
  performed_by TEXT,
  cost NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agriculture_livestock_events_tenant_idx ON agriculture_livestock_events (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_livestock_events_herd_idx ON agriculture_livestock_events (herd_id);
CREATE INDEX IF NOT EXISTS agriculture_livestock_events_date_idx ON agriculture_livestock_events (event_date);

-- ============================================================================
-- RLS (Row Level Security) — tenant isolation for all agriculture tables
-- ============================================================================

-- Enable RLS on all agriculture tables
ALTER TABLE agriculture_farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_crop_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_crop_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_input_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_harvests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_livestock_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_livestock_herds ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_livestock_events ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY agriculture_farms_tenant_isolation ON agriculture_farms
  USING (tenant_id = current_setting('beyu.tenant_id', true));

CREATE POLICY agriculture_fields_tenant_isolation ON agriculture_fields
  USING (tenant_id = current_setting('beyu.tenant_id', true));

CREATE POLICY agriculture_crop_types_tenant_isolation ON agriculture_crop_types
  USING (tenant_id = current_setting('beyu.tenant_id', true));

CREATE POLICY agriculture_crop_cycles_tenant_isolation ON agriculture_crop_cycles
  USING (tenant_id = current_setting('beyu.tenant_id', true));

CREATE POLICY agriculture_inputs_tenant_isolation ON agriculture_inputs
  USING (tenant_id = current_setting('beyu.tenant_id', true));

CREATE POLICY agriculture_input_applications_tenant_isolation ON agriculture_input_applications
  USING (tenant_id = current_setting('beyu.tenant_id', true));

CREATE POLICY agriculture_harvests_tenant_isolation ON agriculture_harvests
  USING (tenant_id = current_setting('beyu.tenant_id', true));

CREATE POLICY agriculture_livestock_types_tenant_isolation ON agriculture_livestock_types
  USING (tenant_id = current_setting('beyu.tenant_id', true));

CREATE POLICY agriculture_livestock_herds_tenant_isolation ON agriculture_livestock_herds
  USING (tenant_id = current_setting('beyu.tenant_id', true));

CREATE POLICY agriculture_livestock_events_tenant_isolation ON agriculture_livestock_events
  USING (tenant_id = current_setting('beyu.tenant_id', true));

-- Grant DML to runtime role
GRANT SELECT, INSERT, UPDATE, DELETE ON
  agriculture_farms, agriculture_fields, agriculture_crop_types,
  agriculture_crop_cycles, agriculture_inputs, agriculture_input_applications,
  agriculture_harvests, agriculture_livestock_types, agriculture_livestock_herds,
  agriculture_livestock_events
TO beyu_runtime;
