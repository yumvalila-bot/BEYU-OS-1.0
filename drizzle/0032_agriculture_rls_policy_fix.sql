-- 0032 — Agriculture OS RLS Policy Correction
--
-- CRITICAL FIX: The agriculture RLS policies from migration 0031 used
-- current_setting('beyu.tenant_id', true) which is NOT the canonical
-- tenant isolation mechanism. The correct mechanism is beyu_tenant_ids()
-- which reads from beyu.current_tenant_ids (plural, comma-separated).
--
-- This migration drops the incorrect policies and creates correct ones
-- that match the rest of the codebase.

-- ============================================================================
-- Drop incorrect policies
-- ============================================================================

DROP POLICY IF EXISTS agriculture_farms_tenant_isolation ON agriculture_farms;
DROP POLICY IF EXISTS agriculture_fields_tenant_isolation ON agriculture_fields;
DROP POLICY IF EXISTS agriculture_crop_types_tenant_isolation ON agriculture_crop_types;
DROP POLICY IF EXISTS agriculture_crop_cycles_tenant_isolation ON agriculture_crop_cycles;
DROP POLICY IF EXISTS agriculture_inputs_tenant_isolation ON agriculture_inputs;
DROP POLICY IF EXISTS agriculture_input_applications_tenant_isolation ON agriculture_input_applications;
DROP POLICY IF EXISTS agriculture_harvests_tenant_isolation ON agriculture_harvests;
DROP POLICY IF EXISTS agriculture_livestock_types_tenant_isolation ON agriculture_livestock_types;
DROP POLICY IF EXISTS agriculture_livestock_herds_tenant_isolation ON agriculture_livestock_herds;
DROP POLICY IF EXISTS agriculture_livestock_events_tenant_isolation ON agriculture_livestock_events;

-- ============================================================================
-- Create correct policies using beyu_tenant_ids()
-- ============================================================================

CREATE POLICY agriculture_farms_tenant_isolation ON agriculture_farms
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

CREATE POLICY agriculture_fields_tenant_isolation ON agriculture_fields
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

CREATE POLICY agriculture_crop_types_tenant_isolation ON agriculture_crop_types
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

CREATE POLICY agriculture_crop_cycles_tenant_isolation ON agriculture_crop_cycles
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

CREATE POLICY agriculture_inputs_tenant_isolation ON agriculture_inputs
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

CREATE POLICY agriculture_input_applications_tenant_isolation ON agriculture_input_applications
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

CREATE POLICY agriculture_harvests_tenant_isolation ON agriculture_harvests
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

CREATE POLICY agriculture_livestock_types_tenant_isolation ON agriculture_livestock_types
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

CREATE POLICY agriculture_livestock_herds_tenant_isolation ON agriculture_livestock_herds
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

CREATE POLICY agriculture_livestock_events_tenant_isolation ON agriculture_livestock_events
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  table_name text;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY[
    'agriculture_farms', 'agriculture_fields', 'agriculture_crop_types',
    'agriculture_crop_cycles', 'agriculture_inputs', 'agriculture_input_applications',
    'agriculture_harvests', 'agriculture_livestock_types', 'agriculture_livestock_herds',
    'agriculture_livestock_events'
  ])
  LOOP
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND qual LIKE '%beyu_tenant_ids()%';
    
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0032 verification failed: % does not have correct RLS policy using beyu_tenant_ids()', table_name;
    END IF;
  END LOOP;
END $$;
