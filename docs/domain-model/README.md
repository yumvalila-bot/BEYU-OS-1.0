# BEYU OS — Domain model

Schema modules live in `src/db/schema/` and are re-exported by `src/db/schema.ts`.

## `core.ts` — control plane
`countries`, `jurisdictions`, `tenants` (self-referencing hierarchy), `legal_entities`
(effective-dated, self-referencing), `org_units`, `ownership_records` (economic %, voting %,
control, beneficial, provenance, effective dating), `entity_appointments` (directors, officers,
trustees), `os_registry`, `source_of_truth`.

## `identity.ts` — one identity model
`parties` (MDM for person / organization / service account / AI agent / device, KYC, biometric
consent, duplicate linkage), `users`, `sessions`, `roles`, `permissions`, `role_permissions`,
`role_assignments` (effective-dated, entity-scoped), `emergency_access_grants`, `delegations`,
`consents` (purpose, lawful basis, jurisdiction, evidence).

## `governance.ts` — constitution, policy, decisions
`constitution_articles`, `policies` (8-level hierarchy + machine-readable `rules`),
`governance_bodies`, `governance_members`, `resolutions` (rationale, data basis, authority policy,
consequences, quorum, votes), `resolution_votes` (with conflict declaration), `approvals`
(maker/checker), `workflows`, `workflow_instances`, `tasks`, `strategic_objectives`.

## `assurance.ts` — risk, control, compliance, legal, continuity
`risks` (inherent/residual likelihood × impact vs. appetite), `controls`,
`compliance_obligations`, `compliance_assessments` (six explicit states, AI-assist flag, human
confirmation), `legal_matters`, `anomaly_signals` (evidence + confidence), `continuity_plans`
(RPO/RTO/test evidence).

## `finance.ts` — Finance OS
`financial_periods`, `ledger_accounts`, `journal_entries` (immutable, reversal-linked,
idempotency key), `journal_lines` (double entry), `treasury_positions`, `capital_requests`
(IRR/NPV/payback/risk-adjusted), `waterfall_configs`, `waterfall_tiers`, `waterfall_runs`
(checksum, engine version, explanation), `waterfall_run_lines` (basis, allocation, remaining,
formula, legal basis), `tax_strategies`, `tax_strategy_assessments`.

## `people.ts` — HCM & Family Office
`positions`, `employees` (one master per party — enforced by a unique index), `employment_events`,
`workforce_requests`; `family_members` (line, branch, generation, verified direct descent),
`beneficiaries` (eligibility, entitlement, conditions, approving resolution), `family_vault_items`
(family / member / trust / emergency / credential / legacy); `foundation_programs`,
`sector_metrics`.

## `platform.ts` — platform services
`documents` (full attachment metadata, checksum, supersession, legal hold, retention),
`retention_policies`, `enterprise_events` (hash-chained), `audit_log` (hash-chained),
`ai_decisions`, `knowledge_sources`, `notifications`, `integrations` (secret **references** only),
`feature_flags`, `metric_definitions`, `data_assets` (owner, steward, lineage, quality rules),
`architecture_decisions`, `regulatory_changes`.

## Database principles applied

Normalised core models · strong foreign keys · unique constraints preventing duplicate masters ·
immutable prefixed identifiers · effective dating instead of destructive updates · append-only
audit and event ledgers · tenant columns on every tenant-scoped table · indexes on tenant, object
and lookup paths · integer-minor-unit arithmetic in financial engines · idempotency keys on
financial writes · corrections by reversal, never overwrite.
