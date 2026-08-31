-- Rollback 011 additions. Tables dropped in FK-safe order.
DROP TRIGGER IF EXISTS trg_patients_legal_hold ON health.patients;
DROP TRIGGER IF EXISTS trg_encounters_legal_hold ON health.encounters;
DROP TRIGGER IF EXISTS trg_audit_immutable ON health.audit_log;
DROP FUNCTION IF EXISTS health.block_void_patients_when_held();
DROP FUNCTION IF EXISTS health.block_void_encounters_when_held();
DROP FUNCTION IF EXISTS health.block_audit_delete();
DROP FUNCTION IF EXISTS health.practitioner_can(uuid, text);

DROP POLICY IF EXISTS health_optical_dispensing_isolation ON health.optical_dispensing;
DROP TABLE IF EXISTS health.optical_dispensing;
DROP POLICY IF EXISTS health_ophthalmic_prescriptions_isolation ON health.ophthalmic_prescriptions;
DROP TABLE IF EXISTS health.ophthalmic_prescriptions;
DROP POLICY IF EXISTS health_optical_devices_isolation ON health.optical_devices;
DROP TABLE IF EXISTS health.optical_devices;
DROP POLICY IF EXISTS health_signatures_isolation ON health.signatures;
DROP TABLE IF EXISTS health.signatures;
DROP POLICY IF EXISTS health_ai_invocations_isolation ON health.ai_invocations;
DROP TABLE IF EXISTS health.ai_invocations;
DROP POLICY IF EXISTS health_adapter_circuits_isolation ON health.adapter_circuits;
DROP TABLE IF EXISTS health.adapter_circuits;
