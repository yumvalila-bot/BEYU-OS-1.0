-- Revert migration 017 extensions to legal_holds (restores migration 009/011 shape).
DROP POLICY IF EXISTS health_legal_hold_isolation ON health.legal_holds;
DROP INDEX IF EXISTS health.idx_legal_holds_tenant_resource;
DROP INDEX IF EXISTS health.idx_legal_holds_resource;
ALTER TABLE health.legal_holds
  DROP CONSTRAINT IF EXISTS legal_holds_status_check,
  DROP CONSTRAINT IF EXISTS legal_holds_scope_check;
ALTER TABLE health.legal_holds
  DROP COLUMN IF EXISTS entity_code,
  DROP COLUMN IF EXISTS country_code,
  DROP COLUMN IF EXISTS authority,
  DROP COLUMN IF EXISTS case_reference,
  DROP COLUMN IF EXISTS released_by,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS scope,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS created_at;
-- Reinstate legacy RLS (migration 009).
DROP POLICY IF EXISTS health_legal_holds_isolation ON health.legal_holds;
CREATE POLICY health_legal_holds_isolation ON health.legal_holds
  USING (current_setting('app.tenant_id', true) = tenant_id::text)
  WITH CHECK (current_setting('app.tenant_id', true) = tenant_id::text);
-- Reinstate migration-011 trigger bodies (pre-017 semantics).
CREATE OR REPLACE FUNCTION health.block_void_patients_when_held() RETURNS trigger AS $$
DECLARE held integer;
BEGIN
  IF NEW.voided_at IS NOT NULL AND (OLD.voided_at IS NULL) THEN
    SELECT count(*) INTO held FROM health.legal_holds
     WHERE resource_type = 'patient'
       AND (resource_id IS NULL OR resource_id = NEW.patient_id)
       AND released_at IS NULL
       AND tenant_id = current_setting('app.tenant_id', true)::uuid;
    IF held > 0 THEN RAISE EXCEPTION 'LEGAL_HOLD_ACTIVE: cannot void patient while legal hold is active'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION health.block_void_encounters_when_held() RETURNS trigger AS $$
DECLARE held integer;
BEGIN
  IF NEW.voided_at IS NOT NULL AND (OLD.voided_at IS NULL) THEN
    SELECT count(*) INTO held FROM health.legal_holds
     WHERE resource_type = 'encounter'
       AND (resource_id IS NULL OR resource_id = NEW.encounter_id)
       AND released_at IS NULL
       AND tenant_id = current_setting('app.tenant_id', true)::uuid;
    IF held > 0 THEN RAISE EXCEPTION 'LEGAL_HOLD_ACTIVE: cannot void encounter while legal hold is active'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
