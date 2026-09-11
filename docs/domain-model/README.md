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

## `family-office-protection.ts` — Family Office · Protection & Insurance
Life insurance as a governed Family Office capability (never an OS).
`family_insurance_policies` (the five ownership roles recorded separately: owner · insured · beneficiary ·
payer · assignee; coverage & death benefit as CONTINGENT protection — never summed into wealth; cash/surrender
value only where the contract has them; premium posture; review cadence; assignment posture; succession/liquidity/
risk/HCM references; provenance + epistemic class + `authoritative_owner='FINANCE_OS'` on amounts),
`family_insurance_beneficiary_designations` (insurance contract designations — distinct from the TRUST
`beneficiaries` register above; exact integer millionths-of-percent allocation; PRIMARY/CONTINGENT;
PERCENTAGE/FIXED_AMOUNT/RESIDUARY), `family_insurance_premiums` (schedule rows; OVERDUE is read-time state,
never a mutation), `family_insurance_assignments`, `family_insurance_policy_loans`, `family_insurance_reviews`
(human review records with serialized engine exceptions), `family_insurance_claims` (the claim lifecycle +
monotonic proceeds machine `NONE→EXPECTED→CLAIMED→APPROVED→RECEIVED→ALLOCATED`) and its append-only
`family_insurance_claim_events`, `family_protection_assessments` (deterministic six-component protection-gap
runs with per-line provenance, bounds for missing inputs, methodology version and disclaimer stored as data).
All tables: `tenant_id` + RLS `tenant_id = ANY (beyu_tenant_ids())` (migration 0038, self-verifying),
`numeric(18,2)` money, no posting paths (CAP_POSTING untouched; Finance OS remains the sole accounting authority).
Architecture & methodology: `docs/architecture/family-office-protection-insurance.md`.

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
