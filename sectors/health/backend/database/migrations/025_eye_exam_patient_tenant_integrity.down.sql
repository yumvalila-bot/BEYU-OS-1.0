-- Migration 025 down: remove the tenant referential-integrity guard.
DROP TRIGGER IF EXISTS trg_eye_exams_patient_tenant ON health.eye_exams;
DROP FUNCTION IF EXISTS health.ensure_eye_exam_patient_tenant();
