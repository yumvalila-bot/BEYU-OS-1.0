-- UNIVERSAL DIMENSIONAL GRAPHICS FOUNDATION — shared BEYU capability (additive).
--
-- ONE shared capability, NOT a new OS: the persistence seam of the BEYU
-- Universal Dimensional Graphics, Visualization, Simulation, Digital Twin &
-- Future XR Foundation (src/lib/viz/*). Sector OSs — Health OS, Finance OS,
-- Agriculture OS and UJENZI OS (a full Sector OS) — consume it through
-- governed adapters. No table here duplicates sector truth, and no sector
-- functionality is moved out of its Sector OS.
--
-- Tables:
--   viz_dimension_extensions — governed 9D+ dimension registrations (the
--                              registry's extension mechanism; canonical
--                              1D–8D + XD live in code, so adding a dimension
--                              never requires another database redesign);
--   viz_scenes               — saved scene configurations (REFERENCES to
--                              governed data; manifests are always rebuilt
--                              live through the authorized adapter path);
--   viz_digital_twins        — twin registration/identity bindings only
--                              (state is live-derived, never cached truth);
--   viz_exports              — export ledger with content hashes (§31:
--                              sensitive exports are auditable evidence).
--
-- CONSTITUTIONAL INVARIANTS (mirroring 0031/0034/0035/0043):
--   * every table is tenant-owned (tenant_id FK to tenants);
--   * every table carries a classification column (beyu_classification enum);
--   * every table gets ENABLE + FORCE ROW LEVEL SECURITY with a
--     beyu_tenant_ids() policy — RLS is the final database boundary and is
--     never disabled for visualization;
--   * the runtime role (beyu_runtime, NOSUPERUSER NOBYPASSRLS) receives only
--     the table grants it needs; migrations run on the admin role;
--   * NO journal, ledger, treasury or posting column exists anywhere here —
--     Finance OS remains the only journal writer; CAP_POSTING stays LOCKED.
--     Visualization never creates authorization to post financial
--     transactions (§11/§37).
--
-- Verification blocks at the end fail the migration if any table lacks its
-- RLS policy or CHECK constraint.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS viz_dimension_extensions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  rendering_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  sector_applicability JSONB NOT NULL DEFAULT '"*"'::jsonb,
  lifecycle_state TEXT NOT NULL DEFAULT 'PLANNED',
  provenance JSONB NOT NULL,
  classification beyu_classification NOT NULL DEFAULT 'INTERNAL',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viz_dimension_extensions_code_ck CHECK (code ~ '^(9|[1-9][0-9]+)D(_[A-Z0-9]+)*$'),
  CONSTRAINT viz_dimension_extensions_state_ck CHECK (lifecycle_state IN ('EXPERIMENTAL','PLANNED','AVAILABLE','NOT_IMPLEMENTED','RETIRED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS viz_dimension_extensions_tenant_code_uidx ON viz_dimension_extensions (tenant_id, code);
CREATE INDEX IF NOT EXISTS viz_dimension_extensions_tenant_idx ON viz_dimension_extensions (tenant_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS viz_scenes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_entity_id TEXT REFERENCES legal_entities(id),
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  layers JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  classification beyu_classification NOT NULL DEFAULT 'INTERNAL',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viz_scenes_sector_ck CHECK (sector IN ('BEYU','HEALTH','FINANCE','AGRICULTURE','UJENZI','FOUNDATION')),
  CONSTRAINT viz_scenes_status_ck CHECK (status IN ('ACTIVE','ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS viz_scenes_tenant_idx ON viz_scenes (tenant_id);
CREATE INDEX IF NOT EXISTS viz_scenes_sector_idx ON viz_scenes (sector);
CREATE INDEX IF NOT EXISTS viz_scenes_status_idx ON viz_scenes (status);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS viz_digital_twins (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  twin_key TEXT NOT NULL,
  sector TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  legal_entity_id TEXT REFERENCES legal_entities(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  classification beyu_classification NOT NULL DEFAULT 'INTERNAL',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viz_digital_twins_sector_ck CHECK (sector IN ('BEYU','HEALTH','FINANCE','AGRICULTURE','UJENZI','FOUNDATION')),
  CONSTRAINT viz_digital_twins_status_ck CHECK (status IN ('REGISTERED','ARCHIVED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS viz_digital_twins_tenant_key_uidx ON viz_digital_twins (tenant_id, twin_key);
CREATE INDEX IF NOT EXISTS viz_digital_twins_tenant_idx ON viz_digital_twins (tenant_id);
CREATE INDEX IF NOT EXISTS viz_digital_twins_sector_idx ON viz_digital_twins (sector);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS viz_exports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  scene_id TEXT REFERENCES viz_scenes(id),
  twin_id TEXT REFERENCES viz_digital_twins(id),
  format TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  sector TEXT NOT NULL,
  classification beyu_classification NOT NULL DEFAULT 'INTERNAL',
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viz_exports_format_ck CHECK (format IN ('JSON','CSV','SVG','PNG','PDF')),
  CONSTRAINT viz_exports_target_ck CHECK (scene_id IS NOT NULL OR twin_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS viz_exports_tenant_idx ON viz_exports (tenant_id);
CREATE INDEX IF NOT EXISTS viz_exports_scene_idx ON viz_exports (scene_id);

--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'viz_dimension_extensions','viz_scenes','viz_digital_twins','viz_exports'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))',
      t || '_tenant_isolation', t);
  END LOOP;
END
$$;

--> statement-breakpoint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON viz_dimension_extensions, viz_scenes, viz_digital_twins, viz_exports TO %I', r.rolname);
  END LOOP;
END
$$;

--> statement-breakpoint

-- Verification 1: every viz table exists, has RLS enabled and FORCEd, and
-- carries a beyu_tenant_ids() isolation policy.
DO $$
DECLARE
  table_name text;
  rls_enabled boolean;
  rls_forced boolean;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY[
    'viz_dimension_extensions','viz_scenes','viz_digital_twins','viz_exports'])
  LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity INTO rls_enabled, rls_forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = table_name AND c.relkind = 'r';
    IF rls_enabled IS NULL THEN
      RAISE EXCEPTION 'Migration 0062 verification failed: table % does not exist', table_name;
    END IF;
    IF NOT rls_enabled OR NOT rls_forced THEN
      RAISE EXCEPTION 'Migration 0062 verification failed: table % must have ENABLE + FORCE ROW LEVEL SECURITY', table_name;
    END IF;
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = table_name AND qual LIKE '%beyu_tenant_ids()%';
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0062 verification failed: % missing beyu_tenant_ids() policy', table_name;
    END IF;
  END LOOP;
END $$;

--> statement-breakpoint

-- Verification 2: the discriminating CHECK constraints exist.
DO $$
DECLARE
  expected_count int;
  actual_count int;
BEGIN
  SELECT count(*) INTO expected_count FROM unnest(ARRAY[
    'viz_dimension_extensions_code_ck','viz_dimension_extensions_state_ck',
    'viz_scenes_sector_ck','viz_scenes_status_ck',
    'viz_digital_twins_sector_ck','viz_digital_twins_status_ck',
    'viz_exports_format_ck','viz_exports_target_ck']) AS c(constraint_name);
  SELECT count(*) INTO actual_count
  FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND c.contype = 'c'
    AND c.conname = ANY (ARRAY[
    'viz_dimension_extensions_code_ck','viz_dimension_extensions_state_ck',
    'viz_scenes_sector_ck','viz_scenes_status_ck',
    'viz_digital_twins_sector_ck','viz_digital_twins_status_ck',
    'viz_exports_format_ck','viz_exports_target_ck']);
  IF actual_count <> expected_count THEN
    RAISE EXCEPTION 'Migration 0062 verification failed: expected % viz CHECK constraints, found %', expected_count, actual_count;
  END IF;
END $$;
