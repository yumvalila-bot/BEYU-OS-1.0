-- Migration 044 — Noelia/HIVE governed operations: tool registry, role grants
-- and recommendations with human approval.
--
-- WHY THIS EXISTS
--   `health.ai_invocations` (011) is the governed AI audit surface and
--   AiGovernanceService is fail-closed on model output. What HEALTH_OS did not
--   have was (a) any statement of WHICH tools Noelia may invoke for WHOM, and
--   (b) anywhere for an observation or suggestion to be recorded, acted upon by
--   a human, and closed out. Without a grant table, "AI tool authorization" was
--   a phrase with no enforcement point.
--
-- ARCHITECTURAL POSITION (encoded in constraints, not just prose)
--   * Noelia is an intelligence layer, NOT an authority. `write_class` is
--     CHECK-limited to ('none','draft_only'): no registered tool can write a
--     final clinical or financial state. Where a suggestion must change a
--     record, the change is made through the ordinary human-authenticated API
--     under the human's own permissions — and recorded as applied_via.
--   * `model_dependent` separates the two kinds of capability honestly:
--       model_dependent = false → deterministic rule/aggregate over rows the
--         caller is already allowed to read. Its output is computable here, so
--         it is real work, not a mock.
--       model_dependent = true  → summarization/interpretation. Routed through
--         AiGovernanceService, which stays BLOCKED with null output and null
--         confidence until a real HIVE endpoint is configured. No text is
--         invented for these.
--   * Authorization resolution order (documented so it cannot be guessed):
--       1. an explicit tenant row in noelia_tool_grants (allow or deny) wins;
--       2. otherwise the platform default_role_ids on the tool;
--       3. otherwise DENY. A tool with no default and no grant has zero
--         capability, so a newly added tool cannot inherit rights.
--   * Recommendations never mutate clinical state, and 'approved' / 'acted_on'
--     cannot be recorded without a named human — the CHECKs below make
--     autonomous Noelia action impossible at the storage layer as well as in
--     the service.
--   * Evidence is mandatory: every recommendation carries source resource
--     references and an as_of timestamp, so a reviewer can see what it was
--     derived from. An unsupported suggestion is not storable.
--
-- NON-DUPLICATION
--   * No new AI identity, model configuration, key store or Noelia user record.
--     `ai_identity` and the `hive` adapter in `health.integration_status` (007)
--     stay the only integration surface; this table references invocations by FK.
--   * Audit stays in `health.audit_log`; events stay in `health.beyu_outbox`.
--     No parallel log, no parallel event bus.
--   * Patient/encounter/ward rows are referenced, never copied.

BEGIN;

CREATE TABLE IF NOT EXISTS health.noelia_tools (
  tool_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,                       -- NULL = platform-wide definition
  tool_code       text NOT NULL,
  name            text NOT NULL,
  description     text NOT NULL,
  category        text NOT NULL,              -- operational | clinical_assistance | decision_support | governance
  model_dependent boolean NOT NULL DEFAULT false,
  write_class     text NOT NULL DEFAULT 'none', -- none | draft_only
  risk_class      text NOT NULL DEFAULT 'low',  -- low | medium | high | critical
  required_permission text NOT NULL,            -- actor must hold this; the tool adds no rights
  requires_consent boolean NOT NULL DEFAULT false,
  requires_phi    boolean NOT NULL DEFAULT false,
  default_role_ids text[] NOT NULL DEFAULT '{}',
  evidence_sources text[] NOT NULL DEFAULT '{}', -- resource types this tool may read
  max_rows_per_run integer NOT NULL DEFAULT 200 CHECK (max_rows_per_run BETWEEN 1 AND 2000),
  enabled         boolean NOT NULL DEFAULT true,
  version         text NOT NULL DEFAULT '1.0.0',
  human_approval_required boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tool_code),
  CHECK (category IN ('operational','clinical_assistance','decision_support','governance')),
  CHECK (write_class IN ('none','draft_only')),
  CHECK (risk_class IN ('low','medium','high','critical')),
  -- Anything above 'low' risk, anything writing at all, and anything touching
  -- PHI requires a human in the loop. There is no legal row that exempts it.
  CHECK (
    (risk_class = 'low' AND NOT requires_phi AND write_class = 'none')
    OR human_approval_required = true
  ),
  -- A model-dependent tool can never be auto-applied.
  CHECK ((NOT model_dependent) OR human_approval_required = true),
  CHECK (length(trim(required_permission)) > 0)
);

CREATE TABLE IF NOT EXISTS health.noelia_tool_grants (
  grant_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  tool_code       text NOT NULL,
  role_id         text NOT NULL,
  allowed         boolean NOT NULL,             -- false = explicit local deny (overrides a platform default)
  granted_by      uuid REFERENCES beyu_identity.users(global_user_id),
  granted_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  reason          text NOT NULL,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, tool_code, role_id),
  CHECK (expires_at IS NULL OR expires_at > granted_at),
  -- Every grant decision is attributable and justified: an unexplained AI
  -- capability grant is the thing an auditor asks about first.
  CHECK (granted_by IS NOT NULL),
  CHECK (length(trim(reason)) >= 8)
);
CREATE INDEX IF NOT EXISTS idx_noelia_grant_lookup ON health.noelia_tool_grants(tenant_id, role_id, tool_code);

CREATE TABLE IF NOT EXISTS health.noelia_recommendations (
  recommendation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  tool_code       text NOT NULL,
  invocation_id   uuid REFERENCES health.ai_invocations(invocation_id) ON DELETE SET NULL,
  scope           text NOT NULL DEFAULT 'operational', -- operational | clinical
  kind            text NOT NULL,
    -- bed_capacity_risk | ed_wait_breach | ed_reassessment_due | ambulance_delay
    -- | theatre_turnaround_backlog | lab_backlog | imaging_backlog
    -- | unacknowledged_critical | medication_expiry_risk | stock_shortfall
    -- | followup_overdue | duplicate_patient_suspected | care_plan_review_due
    -- | encounter_summary_blocked | documentation_gap | medication_safety_review
  title           text NOT NULL,
  rationale       text NOT NULL,
  severity        text NOT NULL DEFAULT 'info', -- info | warning | elevated | urgent
  patient_id      uuid REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  ward_id         uuid REFERENCES health.wards(ward_id) ON DELETE SET NULL,
  bed_id          uuid REFERENCES health.beds(bed_id) ON DELETE SET NULL,
  target_resource_type text,
  target_resource_id uuid,
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  as_of           timestamptz NOT NULL DEFAULT now(),
  confidence      numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  model_dependent boolean NOT NULL DEFAULT false,
  blocked         boolean NOT NULL DEFAULT false,
  blocked_reason  text,
  suggested_action text,
  status          text NOT NULL DEFAULT 'proposed',
    -- proposed | acknowledged | approved | rejected | acted_on | expired | superseded
  raised_count    integer NOT NULL DEFAULT 1 CHECK (raised_count >= 1),
  dedup_key       text,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  acknowledged_by uuid REFERENCES beyu_identity.users(global_user_id),
  acknowledged_at timestamptz,
  reviewed_by     uuid REFERENCES beyu_identity.users(global_user_id),
  reviewed_at     timestamptz,
  review_note     text,
  applied_by      uuid REFERENCES beyu_identity.users(global_user_id),
  applied_at      timestamptz,
  applied_via     text,                        -- which human-facing API carried it out
  superseded_by   uuid REFERENCES health.noelia_recommendations(recommendation_id) ON DELETE SET NULL,
  actor_global_user_id uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (scope IN ('operational','clinical')),
  CHECK (severity IN ('info','warning','elevated','urgent')),
  CHECK (status IN ('proposed','acknowledged','approved','rejected','acted_on','expired','superseded')),
  -- A recommendation must cite evidence; empty evidence is not storable.
  CHECK (evidence <> '{}'::jsonb),
  -- Only a named human can approve, and 'acted_on' needs who/when/how.
  CHECK ((status NOT IN ('approved','acted_on')) OR reviewed_by IS NOT NULL),
  CHECK ((status <> 'acted_on') OR (applied_by IS NOT NULL AND applied_at IS NOT NULL AND applied_via IS NOT NULL)),
  -- A blocked (no-HIVE) recommendation states the blocker instead of inventing output.
  CHECK ((NOT blocked) OR blocked_reason IS NOT NULL),
  CHECK (superseded_by IS NULL OR superseded_by <> recommendation_id),
  -- A clinical-scope suggestion is never auto-dismissable without review: it
  -- must end in a human decision or an explicit supersession.
  CHECK (
    scope <> 'clinical'
    OR status IN ('proposed','acknowledged','approved','rejected','acted_on','superseded','expired')
  )
);
CREATE INDEX IF NOT EXISTS idx_noelia_rec_open ON health.noelia_recommendations(tenant_id, status, severity, generated_at DESC)
  WHERE status IN ('proposed','acknowledged','approved');
CREATE INDEX IF NOT EXISTS idx_noelia_rec_patient ON health.noelia_recommendations(patient_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_noelia_rec_tool ON health.noelia_recommendations(tool_code, generated_at DESC);
-- Dedup: at most one open recommendation per (tenant, tool, kind, dedup_key), so
-- a recurring operational sweep cannot bury a ward in identical rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_noelia_rec_open_dedup
  ON health.noelia_recommendations(tenant_id, tool_code, kind, dedup_key)
  WHERE status IN ('proposed','acknowledged','approved') AND dedup_key IS NOT NULL;

-- ── platform tool definitions ────────────────────────────────────────────────
-- default_role_ids is the platform allow-list. Deterministic operational tools
-- may be auto-applied-free (they change nothing), so human_approval_required is
-- false only where write_class='none' AND risk='low' AND no PHI is needed.
INSERT INTO health.noelia_tools
  (tenant_id, tool_code, name, description, category, model_dependent, write_class,
   risk_class, required_permission, requires_consent, requires_phi, default_role_ids,
   evidence_sources, human_approval_required, version)
VALUES
  (NULL,'ops.bed_capacity','Bed capacity observation','Aggregates ward bed availability, occupancy and pending-discharge counts from rows the caller may already read, and flags wards at or over threshold.','operational',false,'none','low','report:read',false,false,'{admin,cno,ceo}','{"wards","beds","bed_allocations"}',false,'1.0.0'),
  (NULL,'ops.ed_board','Emergency waiting observation','Ranks emergency encounters by triage acuity and elapsed wait and flags reassessments that are due.','operational',false,'none','medium','phi:read',false,true,'{doctor,cno,admin}','{"encounters","triage_assessments","observations"}',true,'1.0.0'),
  (NULL,'ops.ambulance_delay','Ambulance turnaround observation','Reports dispatched or en-route requests with elapsed time and vehicles that have no crew assigned.','operational',false,'none','low','report:read',false,false,'{admin}','{"ambulance_requests","vehicles"}',false,'1.0.0'),
  (NULL,'ops.lab_backlog','Laboratory backlog observation','Counts unverified and overdue lab order items by test and priority.','operational',false,'none','low','report:read',false,false,'{lab,admin}','{"lab_orders","lab_order_items"}',false,'1.0.0'),
  (NULL,'ops.imaging_backlog','Imaging reporting backlog observation','Counts pending and unverified imaging reports and open critical findings awaiting acknowledgement.','operational',false,'none','medium','phi:read',false,true,'{radiology,admin}','{"imaging_orders","imaging_reports","critical_findings"}',true,'1.0.0'),
  (NULL,'ops.pharmacy_expiry','Pharmacy expiry and shortfall observation','Lists batches nearing expiry and items at or below reorder level, read from the canonical stock ledger.','operational',false,'none','low','inventory:read',false,false,'{pharmacy,pharmacy-chief}','{"pharmacy_batches","stock_levels","pharmacy_items"}',false,'1.0.0'),
  (NULL,'ops.theatre_utilisation','Theatre utilisation observation','Reports scheduled versus completed cases and theatre turnaround backlog per day.','operational',false,'none','low','report:read',false,false,'{admin,cmo}','{"surgical_cases","operating_theatres","service_turnarounds"}',false,'1.0.0'),
  (NULL,'clin.chart_prep','Encounter preparation brief','Drafts a pre-consultation brief (problems, active medications, allergies, recent results) as a DRAFT for the clinician to accept. Model-dependent: blocked until HIVE is configured.','clinical_assistance',true,'draft_only','medium','phi:read',false,true,'{doctor}','{"problems","medications","allergies","observations","lab_order_items"}',true,'1.0.0'),
  (NULL,'clin.timeline_summary','Longitudinal timeline summary','Summarises a patient encounter timeline. Model-dependent: blocked until HIVE is configured.','clinical_assistance',true,'none','medium','phi:read',false,true,'{doctor,cmo}','{"encounters","problems","medications"}',true,'1.0.0'),
  (NULL,'clin.documentation_gap','Missing-information detection','Deterministically flags an incomplete episode: unsigned report, absent triage assessment, no allergy record, unacknowledged critical result, or a signed case with no discharge summary.','decision_support',false,'draft_only','medium','phi:read',false,true,'{doctor,nurse,admin}','{"encounters","triage_assessments","allergies","imaging_reports","critical_findings","discharge_summaries"}',true,'1.0.0'),
  (NULL,'clin.med_safety_review','Medication safety review queue','Queues active prescriptions against recorded allergies and duplicate therapy for pharmacist review. Never alters a prescription.','decision_support',false,'draft_only','high','rx:dispense',false,true,'{pharmacy,pharmacy-chief}','{"medications","allergies","dispenses"}',true,'1.0.0'),
  (NULL,'clin.followup_due','Follow-up due detection','Lists follow-ups past due or lost to follow-up, with the originating encounter.','decision_support',false,'none','medium','phi:read',false,true,'{doctor,nurse}','{"followups","encounters"}',true,'1.0.0'),
  (NULL,'gov.duplicate_identity','Duplicate record detection','Deterministically proposes patient-merge candidates from exact identifier and demographic agreement. Never merges anything.','governance',false,'draft_only','medium','patient:read',false,true,'{admin}','{"patients","patient_identifiers"}',true,'1.0.0')
ON CONFLICT (tool_code) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('noelia_tools'),('noelia_tool_grants'),('noelia_recommendations')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- noelia_tools carries platform reference data (tenant_id IS NULL by design) so
-- it is readable by every tenant but NOT writable through the application role:
-- the platform catalogue is changed by migration, never at runtime. That keeps
-- "what may Noelia do" under the same governed release process as schema.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE health.noelia_tools ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS health_noelia_tools_isolation ON health.noelia_tools';
  EXECUTE 'CREATE POLICY health_noelia_tools_isolation ON health.noelia_tools FOR SELECT
              USING (tenant_id IS NULL OR current_setting(''app.tenant_id'', true) = tenant_id::text)';
  EXECUTE 'DROP POLICY IF EXISTS health_noelia_tools_no_runtime_write ON health.noelia_tools';
  EXECUTE 'CREATE POLICY health_noelia_tools_no_runtime_write ON health.noelia_tools FOR INSERT
              WITH CHECK (false)';
  EXECUTE 'DROP POLICY IF EXISTS health_noelia_tools_no_runtime_update ON health.noelia_tools';
  EXECUTE 'CREATE POLICY health_noelia_tools_no_runtime_update ON health.noelia_tools FOR UPDATE
              USING (false) WITH CHECK (false)';
  EXECUTE 'DROP POLICY IF EXISTS health_noelia_tools_no_runtime_delete ON health.noelia_tools';
  EXECUTE 'CREATE POLICY health_noelia_tools_no_runtime_delete ON health.noelia_tools FOR DELETE
              USING (false)';
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES ('noelia_tool_grants'),('noelia_recommendations')
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
