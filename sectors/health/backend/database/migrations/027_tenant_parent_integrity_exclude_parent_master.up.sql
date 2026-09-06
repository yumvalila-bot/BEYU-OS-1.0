-- Migration 027: corrective — exclude parent master tables from the guard.
--
-- 026 must not attach the tenant-parent trigger to `health.patients` itself:
-- patients is the parent source (patient_id IS the PK), so a trigger comparing
-- NEW.patient_id to NEW.tenant_id would reject legitimate inserts of the very
-- row that child rows reference.
-- This migration is idempotent and is also what fresh installs apply after 026.
DROP TRIGGER IF EXISTS trg_patients_tenant_parent ON health.patients;
