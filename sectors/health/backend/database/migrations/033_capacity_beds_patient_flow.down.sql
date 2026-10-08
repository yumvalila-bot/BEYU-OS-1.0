-- Migration 033 down — remove the capacity domain (wards, beds, allocations,
-- turnarounds, patient-flow trace).
--
-- Additive-only migration: dropping these tables removes no pre-existing
-- capability. `health.facilities` and `health.departments` are NOT touched.
-- Disposable environments only; this destroys ward/occupancy history.
BEGIN;

DROP TABLE IF EXISTS health.patient_flow_events;
DROP TABLE IF EXISTS health.service_turnarounds;
DROP TABLE IF EXISTS health.bed_allocations;
DROP TABLE IF EXISTS health.beds;
DROP TABLE IF EXISTS health.wards;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('wards'),('beds'),('bed_allocations'),('service_turnarounds')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;

DROP INDEX IF EXISTS health.uq_alloc_one_open_per_bed;
DROP INDEX IF EXISTS health.uq_alloc_one_open_per_patient;

COMMIT;
