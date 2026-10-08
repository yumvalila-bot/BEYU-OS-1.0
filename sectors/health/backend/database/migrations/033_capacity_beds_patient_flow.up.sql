-- Migration 033 — Capacity: wards, beds, bed allocation, service turnaround,
-- patient flow trace.
--
-- WHY THIS EXISTS
--   HEALTH_OS could record an encounter, order a bed-side service and dispatch
--   an ambulance, but it had no bed model at all: no ward registry, no bed
--   registry, no allocation, no transfer, no terminal-cleaning state and no
--   place a discharge could be written against. Emergency admission, theatre
--   recovery and nursing assignment all depend on that model, so it is built
--   first.
--
-- NON-DUPLICATION (checked against migrations 001-032 before writing)
--   * `health.facilities` (009) and `health.departments` (004) already own the
--     facility and department registries. A ward is NOT a department: it is a
--     physical nursing unit inside a facility with its own bed list, so it is a
--     new entity, with an OPTIONAL department_id for reporting alignment.
--   * Inpatient stay is NOT modelled here. `health.encounters` already owns
--     encounter kind (incl. 'inpatient') and disposition. A bed allocation
--     links to an encounter; it never copies encounter clinical content.
--   * Turnaround is ONE generic table (`health.service_turnarounds`) keyed by
--     resource_type + resource_id, because beds, theatres and isolation rooms
--     need the identical "out of service → cleaned → back in service" state
--     machine. Separate near-identical tables per resource would be
--     duplication; one table serves all three.
--   * `health.patient_flow_events` is an APPEND-ONLY trace of operational
--     steps (registration → arrival → triage → waiting → encounter →
--     admission → transfer → discharge → referral → follow-up). It is not a
--     second status column: encounters.status stays the clinical-of-record
--     state machine, and this table only records that an operational step
--     happened, when and by whom. Nothing here overwrites encounters.
--
-- CONVENTIONS inherited from migrations 004-011
--   uuid PK via gen_random_uuid(), tenant_id FK ON DELETE CASCADE, entity_code,
--   country_code, created_by/updated_by/correlation_id, soft delete via
--   voided_at/voided_by, CHECK-constrained state columns, updated_at trigger
--   via health.set_updated_at(), RLS enabled with a `*_isolation` policy that
--   pins app.tenant_id AND re-checks the boundary predicate.
--
-- All DDL is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS /
-- CREATE OR REPLACE) so the bootstrap can be re-run safely.

BEGIN;

-- ── wards ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.wards (
  ward_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  facility_id     uuid REFERENCES health.facilities(facility_id) ON DELETE SET NULL,
  department_id   uuid REFERENCES health.departments(department_id) ON DELETE SET NULL,
  ward_code       text NOT NULL,
  name            text NOT NULL,
  ward_type       text NOT NULL DEFAULT 'general',
    -- general | medical | surgical | paediatric | maternity | icu | hdu |
    -- isolation | emergency | theatre_recovery | dialysis | neonatal
  floor_level     text,
  default_length_of_stay_days integer CHECK (default_length_of_stay_days IS NULL OR default_length_of_stay_days > 0),
  staff_ratio     text,                       -- e.g. '1:4' nurse:patient (informational)
  status          text NOT NULL DEFAULT 'active', -- active | inactive | closed
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, ward_code),
  CHECK (status IN ('active','inactive','closed')),
  CHECK (ward_type IN ('general','medical','surgical','paediatric','maternity','icu','hdu','isolation','emergency','theatre_recovery','dialysis','neonatal'))
);
CREATE INDEX IF NOT EXISTS idx_wards_facility ON health.wards(facility_id, status);

-- ── beds ─────────────────────────────────────────────────────────────────────
-- `status` is the bed's OWN state (serviceability). Occupancy is derived from
-- the open allocation, never duplicated onto the bed row: a bed that says
-- 'occupied' while its allocation was already discharged is exactly the kind of
-- drift that makes a capacity board lie to a charge nurse.
CREATE TABLE IF NOT EXISTS health.beds (
  bed_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  ward_id         uuid NOT NULL REFERENCES health.wards(ward_id) ON DELETE CASCADE,
  bed_code        text NOT NULL,
  label           text,
  bed_type        text NOT NULL DEFAULT 'general',
    -- general | icu | hdu | isolation | negative_pressure | paediatric |
    -- maternity | bariatric | observation
  isolation_capable boolean NOT NULL DEFAULT false,
  oxygen_outlet   boolean NOT NULL DEFAULT false,
  suction_available boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'available',
    -- available | cleaning | maintenance | isolated | retired
  notes           text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, ward_id, bed_code),
  CHECK (status IN ('available','cleaning','maintenance','isolated','retired')),
  CHECK (bed_type IN ('general','icu','hdu','isolation','negative_pressure','paediatric','maternity','bariatric','observation'))
);
CREATE INDEX IF NOT EXISTS idx_beds_ward_status ON health.beds(ward_id, status);
CREATE INDEX IF NOT EXISTS idx_beds_tenant ON health.beds(tenant_id, status);

-- ── bed allocations (admission / transfer / discharge) ───────────────────────
CREATE TABLE IF NOT EXISTS health.bed_allocations (
  allocation_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code         text,
  country_code        text,
  bed_id              uuid NOT NULL REFERENCES health.beds(bed_id) ON DELETE RESTRICT,
  ward_id             uuid NOT NULL REFERENCES health.wards(ward_id) ON DELETE RESTRICT,
  patient_id          uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id        uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  reason              text NOT NULL DEFAULT 'admission',
    -- admission | transfer_in | observation | post_anaesthesia_care |
    -- isolation | emergency_hold | boarding
  status              text NOT NULL DEFAULT 'allocated',
    -- allocated | occupied | pending_discharge | discharged | moved | cancelled
  transfer_from_allocation_id uuid REFERENCES health.bed_allocations(allocation_id) ON DELETE SET NULL,
  allocated_at        timestamptz NOT NULL DEFAULT now(),
  occupied_at         timestamptz,
  closed_at           timestamptz,
  closed_reason       text,
  idempotency_key     text,
  created_by          uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by          uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  voided_at           timestamptz,
  voided_by           uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('allocated','occupied','pending_discharge','discharged','moved','cancelled')),
  CHECK (reason IN ('admission','transfer_in','observation','post_anaesthesia_care','isolation','emergency_hold','boarding')),
  -- 'moved' and 'discharged' are terminal for the OUTGOING row and require a
  -- close timestamp, so no allocation can end silently.
  CHECK (
    (status IN ('discharged','moved','cancelled') AND closed_at IS NOT NULL)
    OR status IN ('allocated','occupied','pending_discharge')
  ),
  CHECK (closed_at IS NULL OR closed_at >= allocated_at)
);
-- At most one OPEN allocation per bed, and at most one per patient. These
-- partial unique indexes are the hard guarantee behind "no double-allocated
-- bed" — the service-level check alone would race under concurrency.
CREATE UNIQUE INDEX IF NOT EXISTS uq_alloc_one_open_per_bed
  ON health.bed_allocations(bed_id)
  WHERE status IN ('allocated','occupied','pending_discharge');
CREATE UNIQUE INDEX IF NOT EXISTS uq_alloc_one_open_per_patient
  ON health.bed_allocations(patient_id)
  WHERE status IN ('allocated','occupied','pending_discharge');
CREATE INDEX IF NOT EXISTS idx_alloc_tenant_status ON health.bed_allocations(tenant_id, status, allocated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alloc_patient ON health.bed_allocations(patient_id, allocated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alloc_encounter ON health.bed_allocations(encounter_id);

-- ── service turnaround (terminal cleaning / maintenance) ─────────────────────
CREATE TABLE IF NOT EXISTS health.service_turnarounds (
  turnaround_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  resource_type   text NOT NULL,              -- bed | ward | theatre | room
  resource_id     uuid NOT NULL,
  kind            text NOT NULL DEFAULT 'clean', -- clean | deep_clean | isolation_terminal | maintenance | inspection
  status          text NOT NULL DEFAULT 'requested', -- requested | in_progress | completed | cancelled
  reason          text,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  completed_by    uuid REFERENCES beyu_identity.users(global_user_id),
  target_status   text,                        -- bed status to restore on completion
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (resource_type IN ('bed','ward','theatre','room')),
  CHECK (kind IN ('clean','deep_clean','isolation_terminal','maintenance','inspection')),
  CHECK (status IN ('requested','in_progress','completed','cancelled')),
  CHECK (completed_at IS NULL OR completed_at >= requested_at)
);
CREATE INDEX IF NOT EXISTS idx_turnaround_resource ON health.service_turnarounds(resource_type, resource_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_turnaround_open ON health.service_turnarounds(tenant_id, status, requested_at)
  WHERE status IN ('requested','in_progress');

-- ── patient flow trace ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.patient_flow_events (
  flow_event_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  step            text NOT NULL,
    -- registration | arrival | triage | waiting | encounter_started |
    -- admission | transfer | discharge | referral | followup_scheduled |
    -- ambulance_requested | bed_allocated | bed_freed
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  ward_id         uuid REFERENCES health.wards(ward_id) ON DELETE SET NULL,
  bed_id          uuid REFERENCES health.beds(bed_id) ON DELETE SET NULL,
  allocation_id   uuid REFERENCES health.bed_allocations(allocation_id) ON DELETE SET NULL,
  reference_type  text,
  reference_id    uuid,
  note            text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (step IN ('registration','arrival','triage','waiting','encounter_started','admission','transfer','discharge','referral','followup_scheduled','ambulance_requested','bed_allocated','bed_freed'))
);
CREATE INDEX IF NOT EXISTS idx_flow_encounter ON health.patient_flow_events(encounter_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_flow_tenant_step ON health.patient_flow_events(tenant_id, step, occurred_at DESC);

-- ── updated_at triggers ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('wards'),('beds'),('bed_allocations'),('service_turnarounds')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

-- ── RLS: every table isolated by tenant + boundary predicate ─────────────────
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('wards'),('beds'),('bed_allocations'),('service_turnarounds'),('patient_flow_events')
  LOOP
    EXECUTE format('ALTER TABLE health.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS health_%I_isolation ON health.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY health_%I_isolation ON health.%I
         USING (current_setting(''app.tenant_id'', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id))
         WITH CHECK (current_setting(''app.tenant_id'', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id))',
      tbl, tbl);
  END LOOP;
END $$;

COMMIT;
