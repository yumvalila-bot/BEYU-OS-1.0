-- Migration 040 down — remove imaging/DICOM-metadata domain. Additive-only:
-- health.imaging_orders and health.imaging_reports (007) are untouched.
BEGIN;
DROP TABLE IF EXISTS health.modality_worklist_items;
DROP TABLE IF EXISTS health.critical_findings;
DROP TABLE IF EXISTS health.imaging_report_addenda;
DROP TABLE IF EXISTS health.imaging_series;
DROP TABLE IF EXISTS health.imaging_studies;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('imaging_studies'),('imaging_series'),('imaging_report_addenda'),('critical_findings'),('modality_worklist_items')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;
COMMIT;
