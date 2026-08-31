-- BEYU Health OS — Clinical Foundation (Migration 004 DOWN)
DROP TRIGGER IF EXISTS trg_enc_updated         ON health.encounters;
DROP TRIGGER IF EXISTS trg_appts_updated       ON health.appointments;
DROP TRIGGER IF EXISTS trg_providers_updated   ON health.providers;
DROP TRIGGER IF EXISTS trg_departments_updated ON health.departments;
DROP TRIGGER IF EXISTS trg_patients_updated    ON health.patients;

DROP TABLE IF EXISTS health.encounters CASCADE;
DROP TABLE IF EXISTS health.appointments CASCADE;
DROP TABLE IF EXISTS health.patients CASCADE;
DROP TABLE IF EXISTS health.providers CASCADE;
DROP TABLE IF EXISTS health.departments CASCADE;

DROP FUNCTION IF EXISTS health.set_updated_at() CASCADE;

DROP SCHEMA IF EXISTS health CASCADE;
