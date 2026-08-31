-- Migration 017: Extend health.legal_holds for e-discovery / records governance.
--
-- Adds lifecycle fields (status, scope, authority, case reference, released_by,
-- metadata, created_at) with CHECK constraints, indexes, and replaces the
-- legacy RLS policy to align with current app.tenant_id GUC convention.
--
-- Existing triggers block_void_patients_when_held / block_void_encounters_when_held
-- (migration 011) are upgraded to respect the new status/scope lifecycle so
-- that a tenant-wide (scope='all'/'tenant_wide') active hold blocks voiding
-- any patient/encounter, and a released/superseded hold does not.

ALTER TABLE health.legal_holds
  ADD COLUMN IF NOT EXISTS entity_code text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS authority text,
  ADD COLUMN IF NOT EXISTS case_reference text,
  ADD COLUMN IF NOT EXISTS released_by uuid REFERENCES beyu_identity.users(global_user_id),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'resource',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE health.legal_holds ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Backfill defaults for legacy rows.
UPDATE health.legal_holds SET status = 'active' WHERE status IS NULL OR status = '';
UPDATE health.legal_holds SET scope = 'resource' WHERE scope IS NULL OR scope = '';

ALTER TABLE health.legal_holds DROP CONSTRAINT IF EXISTS legal_holds_status_check;
ALTER TABLE health.legal_holds ADD CONSTRAINT legal_holds_status_check
  CHECK (status IN ('active','released','superseded'));

ALTER TABLE health.legal_holds DROP CONSTRAINT IF EXISTS legal_holds_scope_check;
ALTER TABLE health.legal_holds ADD CONSTRAINT legal_holds_scope_check
  CHECK (scope IN ('all','tenant_wide','resource'));

CREATE INDEX IF NOT EXISTS idx_legal_holds_tenant_resource
  ON health.legal_holds(tenant_id, resource_type, status);
CREATE INDEX IF NOT EXISTS idx_legal_holds_resource
  ON health.legal_holds(resource_type, resource_id, status);

-- RLS policy name harmonized with other domain tables.
DROP POLICY IF EXISTS health_legal_holds_isolation ON health.legal_holds;
DROP POLICY IF EXISTS health_legal_hold_isolation ON health.legal_holds;
CREATE POLICY health_legal_hold_isolation ON health.legal_holds
  USING (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''));

-- Upgrade migration 011's triggers to honour status/scope lifecycle.
CREATE OR REPLACE FUNCTION health.block_void_patients_when_held() RETURNS trigger AS $$
DECLARE
  held integer;
BEGIN
  IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
    SELECT count(*) INTO held FROM health.legal_holds h
     WHERE h.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
       AND h.resource_type = 'patient'
       AND h.status = 'active'
       AND (h.released_at IS NULL OR h.released_at > now())
       AND (h.scope IN ('all','tenant_wide') OR h.resource_id::text = NEW.patient_id::text);
    IF held > 0 THEN
      RAISE EXCEPTION 'LEGAL_HOLD_ACTIVE: cannot void patient while legal hold is active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION health.block_void_encounters_when_held() RETURNS trigger AS $$
DECLARE
  held integer;
BEGIN
  IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
    SELECT count(*) INTO held FROM health.legal_holds h
     WHERE h.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
       AND h.resource_type = 'encounter'
       AND h.status = 'active'
       AND (h.released_at IS NULL OR h.released_at > now())
       AND (h.scope IN ('all','tenant_wide') OR h.resource_id::text = NEW.encounter_id::text);
    IF held > 0 THEN
      RAISE EXCEPTION 'LEGAL_HOLD_ACTIVE: cannot void encounter while legal hold is active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
