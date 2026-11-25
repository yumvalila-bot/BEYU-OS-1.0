-- ============================================================================
-- 0084_noelia_cognitive_core.sql
--
-- NOELIA UNIFIED INTELLIGENCE ECOSYSTEM — additive migration.
--
-- Adds ONLY what the cognitive core genuinely needs and what no existing table
-- already holds. Nothing here duplicates an existing capability:
--   • institutional knowledge stays in `knowledge_sources`
--   • governed memory stays in `enterprise_memory`
--   • AI decision evidence stays in `ai_decisions`
--   • workflow state stays in `noelia_workflows` / `noelia_workflow_steps`
--   • model/provider registry stays in `model_registry` / `noelia_providers`
--
-- New tables:
--   1. noelia_kg_edges        — institutional knowledge-graph edges
--   2. noelia_decision_records— institutional DECISION memory (rationale,
--                               alternatives, approvals, provenance)
--   3. noelia_council_sessions + noelia_council_findings
--                             — Intelligence Council deliberations
--   4. noelia_simulations     — strategic scenario runs (SIMULATION only)
--   5. noelia_learning_records + noelia_golden_cases
--                             — controlled learning & evaluation
--
-- SAFETY PROPERTIES
--   • Additive only. No existing table/column/policy is altered or dropped.
--   • Every table carries tenant-scoped RLS using the same session
--     variable/helper the existing NOELIA tables use.
--   • No table stores retrieved content that could widen context: council
--     findings store digests + statements, simulations store inputs/outputs
--     explicitly labelled SIMULATION.
--   • CHECK constraints make illegal epistemic states unrepresentable
--     (a simulation can never be recorded as an ACTUAL).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Institutional knowledge-graph edges.
--
-- The graph is DERIVED from and REFERENCES authoritative records; an edge is
-- never itself authoritative. Reuse PostgreSQL: no graph database.
-- ---------------------------------------------------------------------------
create table if not exists noelia_kg_edges (
  id text primary key,
  tenant_id text not null references tenants(id),
  legal_entity_id text references legal_entities(id),
  country_code text references countries(code),
  classification beyu_classification not null default 'INTERNAL',

  from_type text not null,
  from_ref text not null,
  relation text not null,
  to_type text not null,
  to_ref text not null,

  -- Provenance: which authoritative record asserted this relationship.
  provenance text not null,
  source_ref text,
  -- OBSERVED = read from an authoritative record; DERIVED = computed by a
  -- documented rule; SIMULATED = produced by a scenario engine.
  origin text not null default 'OBSERVED',
  confidence numeric(5, 4),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),

  constraint noelia_kg_edge_types check (
    from_type in ('PERSON','ENTITY','COMPANY','COUNTRY','PROJECT','ASSET','DOCUMENT',
                  'POLICY','CONTRACT','DECISION','EVENT','OBJECTIVE','RISK','WORKFLOW','TENANT')
    and to_type in ('PERSON','ENTITY','COMPANY','COUNTRY','PROJECT','ASSET','DOCUMENT',
                    'POLICY','CONTRACT','DECISION','EVENT','OBJECTIVE','RISK','WORKFLOW','TENANT')
  ),
  constraint noelia_kg_edge_origin check (origin in ('OBSERVED','DERIVED','SIMULATED')),
  constraint noelia_kg_edge_no_self check (not (from_type = to_type and from_ref = to_ref)),
  constraint noelia_kg_edge_confidence check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint noelia_kg_edge_window check (effective_to is null or effective_to > effective_from)
);

create unique index if not exists noelia_kg_edges_uidx
  on noelia_kg_edges (tenant_id, from_type, from_ref, relation, to_type, to_ref)
  where effective_to is null;
create index if not exists noelia_kg_edges_from_idx
  on noelia_kg_edges (tenant_id, from_type, from_ref);
create index if not exists noelia_kg_edges_to_idx
  on noelia_kg_edges (tenant_id, to_type, to_ref);
create index if not exists noelia_kg_edges_relation_idx
  on noelia_kg_edges (tenant_id, relation);

alter table noelia_kg_edges enable row level security;
alter table noelia_kg_edges force row level security;

drop policy if exists noelia_kg_edges_tenant_read on noelia_kg_edges;
create policy noelia_kg_edges_tenant_read on noelia_kg_edges
  for select using (tenant_id = current_setting('beyu.tenant_id', true)::text
                    or current_setting('beyu.governance_scope', true) = 'ENTERPRISE');

drop policy if exists noelia_kg_edges_tenant_write on noelia_kg_edges;
create policy noelia_kg_edges_tenant_write on noelia_kg_edges
  for all using (tenant_id = current_setting('beyu.tenant_id', true)::text)
  with check (tenant_id = current_setting('beyu.tenant_id', true)::text);

-- ---------------------------------------------------------------------------
-- 2. Institutional DECISION memory.
--
-- `ai_decisions` records what NOELIA SAID. This table records what the
-- INSTITUTION DECIDED and why — an authorised human act, with rationale,
-- alternatives considered, the approving body and the evidence relied upon.
-- NOELIA may PROPOSE; only a human act lands here.
-- ---------------------------------------------------------------------------
create table if not exists noelia_decision_records (
  id text primary key,
  tenant_id text not null references tenants(id),
  legal_entity_id text references legal_entities(id),
  country_code text references countries(code),
  classification beyu_classification not null default 'INTERNAL',

  decision_code text not null,
  title text not null,
  question text not null,
  -- The institution's answer, as recorded by the accountable decision-maker.
  decision text not null,
  rationale text not null,
  alternatives_considered jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,

  status text not null default 'EFFECTIVE',
  decided_on date not null,
  decided_by text references users(id),
  decided_by_role text not null,
  approving_body text,
  approval_reference text,

  -- Continuity: supersession is a CHAIN, never an overwrite.
  supersedes_id text references noelia_decision_records(id),
  provenance text not null,
  created_at timestamptz not null default now(),
  created_by text references users(id),

  constraint noelia_decision_status check (status in ('EFFECTIVE','SUPERSEDED','RESCINDED','DRAFT')),
  constraint noelia_decision_no_self_supersede check (supersedes_id is null or supersedes_id <> id),
  constraint noelia_decision_rationale_present check (length(btrim(rationale)) >= 10)
);

create unique index if not exists noelia_decision_records_code_uidx
  on noelia_decision_records (tenant_id, decision_code);
create index if not exists noelia_decision_records_date_idx
  on noelia_decision_records (tenant_id, decided_on desc);
create index if not exists noelia_decision_records_entity_idx
  on noelia_decision_records (tenant_id, legal_entity_id);

alter table noelia_decision_records enable row level security;
alter table noelia_decision_records force row level security;

drop policy if exists noelia_decision_records_tenant_read on noelia_decision_records;
create policy noelia_decision_records_tenant_read on noelia_decision_records
  for select using (tenant_id = current_setting('beyu.tenant_id', true)::text
                    or current_setting('beyu.governance_scope', true) = 'ENTERPRISE');

drop policy if exists noelia_decision_records_tenant_write on noelia_decision_records;
create policy noelia_decision_records_tenant_write on noelia_decision_records
  for all using (tenant_id = current_setting('beyu.tenant_id', true)::text)
  with check (tenant_id = current_setting('beyu.tenant_id', true)::text);

-- ---------------------------------------------------------------------------
-- 3. Intelligence Council.
--
-- A session is a governed deliberation. Each finding is produced by ONE
-- specialist brain from ONE bounded task and carries its own evidence.
-- `dissent` records disagreement explicitly — consensus is never manufactured.
-- ---------------------------------------------------------------------------
create table if not exists noelia_council_sessions (
  id text primary key,
  tenant_id text not null references tenants(id),
  legal_entity_id text references legal_entities(id),
  country_code text references countries(code),
  classification beyu_classification not null default 'INTERNAL',

  question text not null,
  objective text not null,
  participants jsonb not null default '[]'::jsonb,
  status text not null default 'PLANNED',
  -- Reconciled output. NULL until the session is SYNTHESISED.
  synthesis jsonb,
  consensus jsonb not null default '[]'::jsonb,
  dissent jsonb not null default '[]'::jsonb,
  confidence numeric(5, 4),
  human_decision_required boolean not null default true,
  requesting_user_id text references users(id),
  trace_id text not null,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint noelia_council_status check (status in ('PLANNED','RUNNING','SYNTHESISED','FAILED','CANCELLED')),
  constraint noelia_council_confidence check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint noelia_council_completion check (status <> 'SYNTHESISED' or synthesis is not null)
);

create index if not exists noelia_council_sessions_tenant_idx
  on noelia_council_sessions (tenant_id, started_at desc);

alter table noelia_council_sessions enable row level security;
alter table noelia_council_sessions force row level security;

drop policy if exists noelia_council_sessions_tenant_read on noelia_council_sessions;
create policy noelia_council_sessions_tenant_read on noelia_council_sessions
  for select using (tenant_id = current_setting('beyu.tenant_id', true)::text
                    or current_setting('beyu.governance_scope', true) = 'ENTERPRISE');

drop policy if exists noelia_council_sessions_tenant_write on noelia_council_sessions;
create policy noelia_council_sessions_tenant_write on noelia_council_sessions
  for all using (tenant_id = current_setting('beyu.tenant_id', true)::text)
  with check (tenant_id = current_setting('beyu.tenant_id', true)::text);

create table if not exists noelia_council_findings (
  id text primary key,
  session_id text not null references noelia_council_sessions(id) on delete cascade,
  tenant_id text not null references tenants(id),

  brain text not null,
  capability text,
  task text not null,
  -- Finding statement. Deliberately a statement + evidence refs, not raw
  -- retrieved content: the council must not become a context-widening store.
  statement text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  confidence numeric(5, 4),
  claim_kind text not null default 'INFERENCE',
  -- A specialist that disagrees with the emerging synthesis says so here.
  position text not null default 'SUPPORTING',

  created_at timestamptz not null default now(),

  constraint noelia_council_findings_confidence check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint noelia_council_findings_kind check (
    claim_kind in ('FACT','INFERENCE','ASSUMPTION','PREDICTION','RECOMMENDATION','UNKNOWN','SIMULATION')
  ),
  constraint noelia_council_findings_position check (
    position in ('SUPPORTING','DISSENTING','NEUTRAL','INSUFFICIENT_EVIDENCE')
  )
);

create index if not exists noelia_council_findings_session_idx
  on noelia_council_findings (session_id, brain);

alter table noelia_council_findings enable row level security;
alter table noelia_council_findings force row level security;

drop policy if exists noelia_council_findings_read on noelia_council_findings;
create policy noelia_council_findings_read on noelia_council_findings
  for select using (tenant_id = current_setting('beyu.tenant_id', true)::text
                    or current_setting('beyu.governance_scope', true) = 'ENTERPRISE');

drop policy if exists noelia_council_findings_write on noelia_council_findings;
create policy noelia_council_findings_write on noelia_council_findings
  for all using (tenant_id = current_setting('beyu.tenant_id', true)::text)
  with check (tenant_id = current_setting('beyu.tenant_id', true)::text);

-- ---------------------------------------------------------------------------
-- 4. Strategic simulations.
--
-- `result_class` is constrained: a simulation row can NEVER be stamped
-- ACTUAL. Simulation must not post transactions or change live records, so
-- this table is the only artefact a scenario produces.
-- ---------------------------------------------------------------------------
create table if not exists noelia_simulations (
  id text primary key,
  tenant_id text not null references tenants(id),
  legal_entity_id text references legal_entities(id),
  country_code text references countries(code),
  classification beyu_classification not null default 'INTERNAL',

  objective text not null,
  scenario_kind text not null,
  -- OPTIMISTIC | BASELINE | ADVERSE
  scenario_label text not null,

  -- Baseline data as actually read (with its epistemic status) — never invented.
  baseline jsonb not null default '{}'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  variables jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  calculation_method text not null,
  outputs jsonb not null default '{}'::jsonb,
  sensitivity jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  confidence numeric(5, 4),

  -- Structurally guarantees a simulation is never mistakable for a record.
  result_class text not null default 'SIMULATION',
  created_by text references users(id),
  trace_id text not null,
  created_at timestamptz not null default now(),

  constraint noelia_simulations_result_class check (result_class = 'SIMULATION'),
  constraint noelia_simulations_label check (scenario_label in ('OPTIMISTIC','BASELINE','ADVERSE')),
  constraint noelia_simulations_confidence check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists noelia_simulations_tenant_idx
  on noelia_simulations (tenant_id, created_at desc);

alter table noelia_simulations enable row level security;
alter table noelia_simulations force row level security;

drop policy if exists noelia_simulations_tenant_read on noelia_simulations;
create policy noelia_simulations_tenant_read on noelia_simulations
  for select using (tenant_id = current_setting('beyu.tenant_id', true)::text
                    or current_setting('beyu.governance_scope', true) = 'ENTERPRISE');

drop policy if exists noelia_simulations_tenant_write on noelia_simulations;
create policy noelia_simulations_tenant_write on noelia_simulations
  for all using (tenant_id = current_setting('beyu.tenant_id', true)::text)
  with check (tenant_id = current_setting('beyu.tenant_id', true)::text);

-- ---------------------------------------------------------------------------
-- 5. Controlled learning.
--
-- A golden case is an immutable benchmark input. A learning record is a
-- MEASUREMENT or a PROPOSAL — never an automatic change to policy, prompts or
-- permissions. Publication requires human approval recorded in the audit log.
-- ---------------------------------------------------------------------------
create table if not exists noelia_golden_cases (
  id text primary key,
  code text not null,
  brain text not null,
  capability text,
  question text not null,
  expected_output_class text not null,
  required_evidence jsonb not null default '[]'::jsonb,
  -- Must-not-do assertions (e.g. "must not surface restricted finance data").
  forbidden_claims jsonb not null default '[]'::jsonb,
  tolerance numeric(5, 4) not null default 0.9,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint noelia_golden_cases_class check (
    expected_output_class in ('FACT','INFERENCE','RECOMMENDATION','PREDICTION','UNCERTAINTY','REQUIRES_HUMAN_REVIEW')
  ),
  constraint noelia_golden_cases_tolerance check (tolerance > 0 and tolerance <= 1)
);

create unique index if not exists noelia_golden_cases_code_uidx on noelia_golden_cases (code);

create table if not exists noelia_learning_records (
  id text primary key,
  tenant_id text references tenants(id),
  record_kind text not null,
  golden_case_code text,
  brain text,
  capability text,

  -- For MEASUREMENT: observed vs expected. For PROPOSAL: the change requested.
  observed jsonb not null default '{}'::jsonb,
  expected jsonb not null default '{}'::jsonb,
  passed boolean,
  -- Baseline a change is measured against; NULL means no baseline recorded.
  baseline_score numeric(5, 4),
  observed_score numeric(5, 4),
  regression boolean not null default false,

  status text not null default 'RECORDED',
  proposed_change text,
  requires_human_approval boolean not null default true,
  approved_by text references users(id),
  approved_at timestamptz,

  trace_id text,
  created_at timestamptz not null default now(),

  constraint noelia_learning_kind check (record_kind in ('MEASUREMENT','PROPOSAL','CORRECTION')),
  constraint noelia_learning_status check (status in ('RECORDED','PENDING_APPROVAL','APPROVED','REJECTED','APPLIED')),
  constraint noelia_learning_score check (
    (baseline_score is null or (baseline_score >= 0 and baseline_score <= 1))
    and (observed_score is null or (observed_score >= 0 and observed_score <= 1))
  ),
  -- A proposal can never be APPLIED without a recorded approver.
  constraint noelia_learning_approval check (
    status <> 'APPLIED' or (approved_by is not null and approved_at is not null)
  )
);

create index if not exists noelia_learning_records_case_idx
  on noelia_learning_records (golden_case_code, created_at desc);
create index if not exists noelia_learning_records_status_idx
  on noelia_learning_records (status, created_at desc);

alter table noelia_learning_records enable row level security;
alter table noelia_learning_records force row level security;

drop policy if exists noelia_learning_records_read on noelia_learning_records;
create policy noelia_learning_records_read on noelia_learning_records
  for select using (tenant_id is null
                    or tenant_id = current_setting('beyu.tenant_id', true)::text
                    or current_setting('beyu.governance_scope', true) = 'ENTERPRISE');

drop policy if exists noelia_learning_records_write on noelia_learning_records;
create policy noelia_learning_records_write on noelia_learning_records
  for all using (tenant_id is null or tenant_id = current_setting('beyu.tenant_id', true)::text)
  with check (tenant_id is null or tenant_id = current_setting('beyu.tenant_id', true)::text);

-- Golden cases are enterprise-wide benchmark definitions: global config with no
-- tenant data, like `model_registry`. No tenant RLS; write access is restricted
-- by grants to the governance role only.

-- ---------------------------------------------------------------------------
-- Grants — mirror the existing NOELIA table grant model.
-- The runtime role may operate within RLS; the governance role may operate
-- within its stricter boundary. Ownership stays with the migration role.
-- ---------------------------------------------------------------------------
grant select, insert, update on noelia_kg_edges to beyu_runtime;
grant select, insert, update on noelia_decision_records to beyu_runtime;
grant select, insert, update on noelia_council_sessions to beyu_runtime;
grant select, insert, update on noelia_council_findings to beyu_runtime;
grant select, insert on noelia_simulations to beyu_runtime;
grant select on noelia_golden_cases to beyu_runtime;
grant select, insert, update on noelia_learning_records to beyu_runtime;
