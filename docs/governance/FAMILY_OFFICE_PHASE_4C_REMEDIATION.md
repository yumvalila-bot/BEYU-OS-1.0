# BEYU Family Office — Phase 4C Controlled Remediation Record

Document ID: `BEYU-FO-IMP-01`
Title: Family Office Phase 4C — uncovered-table register, RLS disposition, migration reconciliation and FO-IMP matrix
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Classification: `INTERNAL`
Owner (proposed): Chief Governance Officer `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Related documents: `BEYU-FO-AUD-01` (Phase 4A/4B audit), `BEYU-SCG-16`, `BEYU-SCG-18`, `src/lib/migration/integrity.ts`
Depends on: the Phase 4C commit; nothing else

> **CONTROL BLOCK.**
> **This is** the Phase 4C record: an authoritative inventory of every table without Row Level Security,
> a per-group disposition, a reconciliation of the `family_policy_*` question, a per-item plan for
> `FO-IMP-01`…`08`, and the exact tests that were run. It accompanies one additive change: a new
> regression suite. **No migration, no schema change, no policy change, no grant change and no production
> action was made.**
> **This is not** an approval, an authorization, a legal opinion, a compliance statement, or a claim of
> production safety.
> **Three Phase 4A claims are CORRECTED below** (`C-1`, `C-2`, `C-3`). Where the audit and the repository
> disagreed, the repository won.
> `CAP_POSTING` remains `LOCKED`; `A7` remains prohibited; `grants_authority` remains `false`; every
> execution path remains simulated and disabled.

---

## 1. Verified repository, PR and environment state

Independently re-verified at the start of this phase, per gate 1. The Phase 4A report was **not** assumed
to remain current.

| Item | Observed |
|---|---|
| Branch | `arena/8fbc8030-beyu-os-1-0` (this session's branch; the only branch worked on) |
| HEAD at phase start | `4951c2c` — 15 commits over `main` `05e2fba`, tree clean |
| PR #108 | **OPEN, not draft, not merged**, `MERGEABLE`, review decision empty |
| Other open PRs | **25 untouched** — none closed, modified or merged |
| Sandbox state on arrival | **Reset again**: HEAD at `main` with branch content as uncommitted local modifications |
| Integrity gate applied before restore | All **156** branch-only paths byte-compared against `origin/arena/8fbc8030-beyu-os-1-0` → **156 identical, 0 differing, 0 missing**; only then restored |

**Environment.** PostgreSQL 16.14, cluster at gitignored `pgdata/`, isolated and disposable. Migrations
applied (`exit 0`), runtime and governance roles reconciled (`exit 0` each), seed complete (`exit 0`).
**No production database, schema or data was touched.**

**Environment limit, stated plainly.** The clone is **shallow** — 16 commits, `.git/shallow` present — so
`main`'s full history is not available locally and no historical claim in this document rests on it.
Where history would have settled a question, the question is reported as open instead of guessed.

---

## 2. Corrections to the Phase 4A audit

Gate 4 required determining whether the `family_policy_*` tables are "truly missing or intentionally
supplied elsewhere", and this phase's instruction was to independently verify each finding. Three Phase 4A
claims do not survive that check.

| # | Phase 4A claim | Verified reality | Effect |
|---|---|---|---|
| `C-1` | `FO-BLK-01`: "`family_policy_*` are declared and snapshotted but never migrated — policy definitions/versions/ratifications **cannot persist**", rated **HIGH** | **Not a defect.** `src/db/schema/family-office.ts` states its own status in its header: **"STATUS: DESIGNED, NOT MATERIALIZED. This module is intentionally NOT exported from the schema barrel (src/db/schema.ts) and NO migration exists for it. It is database-READY: when the first ratification is registered by the authorized governance process, materialization = add the barrel export + generate the migration."** Verified: the barrel does not export `./schema/family-office` (it exports `family-office-capital` and `family-office-protection` at lines 56 and 61); nothing in `src/`, `tests/` or `scripts/` references the tables; and no migration creates them | **Reclassified: intentional deferral with a documented trigger.** `FO-BLK-01` withdrawn |
| `C-2` | `FO-BLK-02`: "declaration/table count mismatch — 466 declarations vs 464 live tables" | **Fully explained, arithmetic exact.** Snapshot 0075 holds 466 tables; the database holds 464. Set difference: **3 in snapshot but not in DB** (`family_policy_definitions`, `family_policy_ratifications`, `family_policy_versions`) and **1 in DB but not in snapshot** (`beyu_migrations`, the runner's own ledger, already allowlisted as `DB_ONLY_TABLE_ALLOWLIST`). 466 − 3 + 1 = 464 | `FO-BLK-02` closed as explained |
| `C-3` | `FO-IMP-02`: "additive migration creating `family_policy_*`" proposed as a remediation | **Withdrawn on the evidence.** Materialising these tables now would implement the *one* thing the module deliberately defers, and its trigger — "the first ratification is registered by the authorized governance process" — has not occurred, because no approving body is evidenced as constituted (`BLK-01`) | `FO-IMP-02` withdrawn; see §4 |

**Why this matters.** `FO-BLK-01` and `FO-BLK-02` were the two findings most likely to be read as
"the policy registry is broken". They are not. The registry is deliberately absent because the authority
that would populate it does not exist yet — the same keystone blocker, expressed as a design decision
rather than a gap. **Nothing was changed.**

### 2.1 A genuine defect found instead: the snapshot chain is broken

Independent verification surfaced a real defect that the audit had not characterised precisely.

| Element | Observation |
|---|---|
| Defect | `drizzle/meta/0038_snapshot.json` and `0039_snapshot.json` share the **same `id`** (`c424f097-…`) **and the same `prevId`** (`c52eb0fd-…`, i.e. 0037's id) — two children of one parent |
| Symptom | `npx drizzle-kit generate` **aborts**: `Error: [0038_snapshot.json, 0039_snapshot.json] are pointing to a parent snapshot … which is a collision` |
| Aggravation | `0048_snapshot.json.prevId` **is** the duplicated id `c424f097-…`, so repairing 0039 cascades: a scratch experiment that corrected 0039 immediately produced the next collision against 0048 |
| Already known? | **Yes, in part.** `KNOWN_METADATA_DEBT.chainCollision = ["0039"]` and `tests/migration/schema-drift.test.ts` documents the exit-0-with-error behaviour verbatim. The integrity module reports three acknowledged issues for 0039: `SNAPSHOT_ID_NOT_UNIQUE`, `SNAPSHOT_CHAIN_COLLISION` (prevId), `SNAPSHOT_CHAIN_COLLISION` (byte-identical copy) |
| **New consequence found in this phase** | Because the tool aborts, **no new snapshot can be generated**, and `src/lib/migration/integrity.ts` states: *"0074 and later migrations have source-generated snapshots chained from the real predecessor. New migrations must not extend this debt register."* A new migration therefore has no way to obtain the snapshot the gate demands |

**Proven empirically, not asserted.** A throwaway migration `0076_probe_rls.sql` plus a journal entry was
added to a **scratch copy outside this repository** and the real CI stage was run against it:

```
$ npx tsx scripts/migration/integrity.ts
…
::error::SQL_WITHOUT_SNAPSHOT 0076 — 0076_probe_rls.sql has no meta/0076_snapshot.json
MIGRATION INTEGRITY FAILED — 1 unacknowledged discrepancy(ies).
INTEGRITY_EXIT=1
```

**This makes `FO-IMP-01` — the RLS remediation migration — BLOCKED** pending a human decision (§4). It is
not blocked by design disagreement; it is blocked by a toolchain defect that the repository already
acknowledges but whose consequence for *new* migrations had not been recorded.

---

## 3. The uncovered-table inventory (authoritative)

Measured against the migrated database via `pg_class.relrowsecurity` and
`information_schema.role_table_grants`, with the runtime role provisioned.

**464 public tables: 387 with RLS, 77 without.**

`**D2 — tenant-scoped (has `tenant_id`) (26)** — remediation target: these are where the absence of a policy is a tenancy problem
- `admin_authority_delegations` · `anomaly_signals` · `beneficiaries`
- `compliance_assessments` · `consents` · `controls`
- `delegations` · `emergency_access_grants` · `entity_appointments`
- `family_members` · `family_vault_items` · `idempotency_records`
- `integrations` · `legal_matters` · `notifications`
- `org_units` · `policies` · `positions`
- `role_assignments` · `sector_metrics` · `sessions`
- `strategic_objectives` · `tax_strategy_assessments` · `waterfall_runs`
- `workflow_instances` · `workforce_requests`

**D3 — tenant-adjacent (has a tenant-named column other than `tenant_id`) (2)** — review which boundary the column expresses
- `tenants` · `users`

**D4 — global / reference / catalogue (no tenant-named column) (49)** — a tenant policy would be meaningless; needs an explicit, reasoned disposition instead
- `admin_bootstrap_state` · `admin_enrollment_sessions` · `architecture_decisions`
- `audit_chain_heads` · `beyu_migrations` · `blue_green_deployments`
- `canary_deployments` · `constitution_articles` · `continuity_plans`
- `countries` · `data_assets` · `employment_events`
- `feature_flags` · `governance_capability_registry` · `governance_decision_registry`
- `jurisdictions` · `metric_definitions` · `model_registry`
- `noelia_ai_identity` · `noelia_ai_requirements` · `noelia_controls`
- `noelia_evaluations` · `noelia_model_artifacts` · `noelia_model_lifecycle_events`
- `noelia_model_provenance` · `noelia_provider_lifecycle_events` · `noelia_providers`
- `noelia_regulatory_changes` · `noelia_requirement_controls` · `noelia_risk_register`
- `noelia_risk_treatments` · `os_registry` · `parties`
- `permissions` · `pvg_runs` · `regulatory_changes`
- `release_approvals` · `release_records` · `release_transitions`
- `retention_policies` · `role_permissions` · `roles`
- `rollback_requests` · `service_principals` · `source_of_truth`
- `tax_strategies` · `waterfall_run_lines` · `waterfall_tiers`
- `workflows`

**DELETE held by `beyu_runtime` among the uncovered set (37)** — least-privilege review target
- `admin_enrollment_sessions` · `anomaly_signals` · `audit_chain_heads`
- `beneficiaries` · `blue_green_deployments` · `canary_deployments`
- `compliance_assessments` · `consents` · `continuity_plans`
- `data_assets` · `employment_events` · `entity_appointments`
- `family_members` · `family_vault_items` · `idempotency_records`
- `integrations` · `legal_matters` · `noelia_regulatory_changes`
- `noelia_risk_register` · `noelia_risk_treatments` · `notifications`
- `org_units` · `parties` · `positions`
- `pvg_runs` · `regulatory_changes` · `sector_metrics`
- `strategic_objectives` · `tax_strategies` · `tax_strategy_assessments`
- `tenants` · `users` · `waterfall_run_lines`
- `waterfall_runs` · `waterfall_tiers` · `workflows`
- `workforce_requests`
'

The five dispositions below are **proposals**. Applying any of them requires the decision in §4, because
the mechanism that would carry them is blocked.

| Group | Count | Data / boundary character | Proposed disposition | Status |
|---|---|---|---|---|
| **D2 — tenant-scoped** | 26 | Tenant data. Includes `family_members`, `beneficiaries`, `family_vault_items`, `delegations`, `entity_appointments`, `policies`, `role_assignments`, `emergency_access_grants` | **Enable RLS + FORCE + the canonical `beyu_tenant_ids()` tenant policy**, matching the convention used by the 387 protected tables | **PROPOSED — blocked (`FO-BLK-03` / §4)** |
| **D3 — tenant-adjacent** | 2 | Tenant boundary expressed by a differently-named column | Determine which boundary the column expresses, then either enable the matching policy or record an exclusion | **PROPOSED — needs review** |
| **D4 — global / reference / catalogue** | 49 | `countries`, `jurisdictions`, `permissions`, `roles`, `role_permissions`, `os_registry`, `source_of_truth`, `metric_definitions`, `feature_flags`, `model_registry`, `retention_policies`, `constitution_articles`, `beyu_migrations` and the `noelia_*` catalogue | A tenant policy is **meaningless** here. Prefer **read-only grants for the runtime role** plus a recorded exclusion naming the compensating control. `beyu_migrations` also relies on ledger checksum verification | **PROPOSED — needs review** |

**This is the point the audit was making, stated exactly.** The existing coverage guard
(`tests/security/family-office-rls-isolation.test.ts`) asserts RLS for `family\_%` tables and
**deliberately excludes** `family_members` and `family_vault_items` by name, citing "their own
(pre-existing) controls". The other uncovered tables are **not excluded — they are outside the guard's
scope entirely**, which is why nothing failed. The register in §7 now pins all 77, so neither growth nor
an unreviewed exclusion is silent again.

### 3.1 What is proven, and what is not

Proven by §5's probes, at the database layer, with the real `beyu_runtime` role (`rolsuper=false`,
`rolbypassrls=false`):

* On an RLS-protected table, a session scoped to one tenant sees **only** that tenant's rows.
* On an uncovered table, the **same session sees other tenants' rows** — measured, including
  `family_members`, the family membership table.
* On an uncovered table the session **can write** another tenant's rows.

**Not proven, and therefore not claimed:** whether any specific API, UI, background job or export path
leaks across tenants. Application-layer tenant scoping exists and its suites pass (§5). The gap is at the
**database boundary**, where RLS is absent. Both statements must be read together; neither alone is the
whole truth.

### 3.2 DELETE privilege — least-privilege review

| Measure | Value |
|---|---|
| Tables where `beyu_runtime` holds `DELETE` | **375 of 464** |
| Of those, tables with **no RLS** | **37** |
| Of those 37, tenant-scoped | see `REGISTERED_DELETE_HOLDERS` in the suite |

**Recommendation (proposed, not applied).** Grant `DELETE` only where a legitimate delete path exists.
For the audit, authority, identity and family tables the safer default is **no `DELETE`** — corrections
belong in superseding records, not in erased rows, which is the same principle `BEYU-SCG-18` §10 records
for audit history. Two incidental controls were found and are worth keeping visible: `role_assignments`
grants **SELECT only** (an over-broad probe failed with "permission denied", which is least privilege
working), and a cross-tenant delete on `family_members` is refused by the foreign key
`beneficiaries_family_member_id_family_members_id_fk` — referential integrity, **not** tenant isolation: it
stops a delete only when a dependent row happens to exist, and would not stop a read.

---

## 4. `FO-IMP-01`…`08` implementation matrix

Per gate 5: mapped to existing primitives before editing, with dependencies, risk, files, tests and
acceptance criteria. **Only `FO-IMP-03` was implemented**, because it is the only item that is both safe
now and genuinely needed.

| Item | Scope | Reuses | Status | Why |
|---|---|---|---|---|
| `FO-IMP-01` | RLS + FORCE + tenant policy on the D2 set | `beyu_tenant_ids()`, `beyu_global_scope()`, the 387-table convention | **BLOCKED** | No new migration can pass the integrity gate while the snapshot chain is broken and the policy forbids extending the debt register (§2.1). **Human decision required, options below** |
| `FO-IMP-02` | Materialise `family_policy_*` | `family-office.ts`, `office/policy.ts` | **WITHDRAWN** | Intentional deferral; trigger unmet; no authority to ratify anything (`BLK-01`) — `C-3` above |
| `FO-IMP-03` | Uncovered-table register + cross-tenant read/write probes with the real runtime role | `pg_class`, `pg_policy`, `information_schema.role_table_grants`, the existing `set_config('beyu.current_tenant_ids')` pattern | **IMPLEMENTED — 8 tests, 8 passed** | Converts "unproven" into measured evidence, and pins the boundary so the gap cannot grow silently |
| `FO-IMP-04` | IP / software-licence registry (D1) | `documents`, `legal_entities`, `contract_records`, `workflow`, `resolutions` | **NOT STARTED — planned** | Domain 1 is genuinely missing (`FO-BLK-04`). A registry is additive, but it must default to `UNVERIFIED`/`PROPOSED` and must assert **no** ownership. Requires its own review; not "smallest defensible" alongside the RLS work |
| `FO-IMP-05` | Related-party disclosure + COI declaration records (D2/D8) | `governance_meeting_conflicts`, `decision-gate` CHECK_CONFLICT, `trust_governance` §16 | **NOT STARTED — planned** | Needs the `FO-P-02`/`FO-P-08` proposals adopted before records mean anything |
| `FO-IMP-06` | RACI model (D12), `UNASSIGNED` default | `positions`, `entity_appointments`, `PERMISSIONS` | **NOT STARTED — planned** | Grants nothing legally; must fail closed when UNASSIGNED (`FO-BLK-07`) |
| `FO-IMP-07` | Dashboard extension with the status vocabulary | `src/app/os/family/page.tsx` gates and classification filter | **NOT STARTED — planned** | UI on top of ∅ registers would display nothing; sequence after 04–06 |
| `FO-IMP-08` | Succession plan **register** (no activation) | `family_generational_plans`, `continuity_plans`, `documents` | **NOT STARTED — planned** | Blocked in substance by `FO-BLK-08` (minors/incapacity unmodelled) |

### 4.1 Required human decision to unblock `FO-IMP-01`

Three options. **This phase did not choose one**, because choosing changes metadata or policy that this
phase is not authorised to change.

| Option | Action | Assessment |
|---|---|---|
| **A — repair the chain** *(recommended)* | Give `0039_snapshot.json` a unique `id` and a `prevId` that chains from 0038, then update every downstream `prevId` that references the duplicated id (0048 onward), then generate the snapshot and the migration | Repairs real corruption and restores the toolchain. It is metadata-only, touches no applied SQL, and `HISTORICAL_MIGRATION_CHECKSUMS` pins `.sql` files rather than snapshots. **Largest blast radius**; needs its own reviewed change |
| **B — policy exception** | Add `0076` to `KNOWN_METADATA_DEBT.missingSnapshot` with a justification | Ten lines and reviewable, and the register's own text says a justified entry is "the reviewable act". But it **contradicts the explicit rule** "New migrations must not extend this debt register", so adopting it is a deliberate policy change, not a workaround |
| **C — hand-author and accept red CI** | Ship the migration without a snapshot | **Rejected.** `INTEGRITY_EXIT=1` proven above; a red gate is not an acceptable resting state |

---

## 5. Tests and exact verification results

Every figure was observed in this session.

| Check | Command | Result |
|---|---|---|
| Migrations | `npx tsx scripts/migrate.ts` | **exit 0** — `fingerprintAfter eebc66981c8f176dbd8ef9ba0a43a58b` (post-role-setup: `eee62965fa8d37540b56493265ff241d`, the same transition Phase 3 recorded) |
| Roles | `npx tsx scripts/setup-db-role.ts`, `npm run db:setup-governance-role` | **exit 0 / exit 0** |
| Seed | `npx tsx src/db/seed.ts` | **exit 0** |
| **New suite** | `npx vitest run tests/security/family-office-uncovered-table-isolation.test.ts` | **exit 0 — 8 tests passed** |
| **Can it fail?** | Temporarily `ENABLE ROW LEVEL SECURITY` + a tenant policy on `role_assignments` in the isolated DB, re-run | **exit 1 — 4 tests failed** (register mismatch, tenant-scoped subset, the gap measurement, the discriminator). Reverted; suite green again; **0 orphan policies**; uncovered count back to **77** |
| Security + family regression | `npx vitest run tests/security tests/family` | **exit 0 — 83 files passed, 1,483 passed, 4 skipped, 0 failed** |
| Migration suite | `npx vitest run tests/migration` | **exit 0 — 11 files passed, 105 passed** |
| Typecheck | `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit` | **exit 0** |
| Lint | `npx eslint tests/security/family-office-uncovered-table-isolation.test.ts` | **exit 0**, no findings |
| SCG gate | `npm run verify:scg` | **exit 0** — 4 checks, 0 blocking, 0 advisory |
| Secret scan | `npm run scan:secrets` | **exit 0** — 2,786 tracked files, no literal credentials |

### 5.1 A failure I caused, and the correction

An intermediate regression run of `tests/security tests/family tests/migration` reported **7 failed**.
Rather than attribute them to a pre-existing condition or to my change, I read the logs: every failure was
`spawnSync`-launched `seed.ts` aborting with
`BEYU_BOOTSTRAP_PASSWORD is required. No default credentials are permitted.` — **I had omitted that
variable from that invocation's environment.** Re-run with the complete environment, all 7 pass and the
migration suite is 105/105 green.

**Classification: environment/operator error, not a repository failure.** Recorded because "7 failed" was
a real observed result and the correction must be visible, not quietly overwritten.

### 5.2 Reported honestly as NOT RUN

The **full repository suite**, the **build**, and the **browser/HTTP specs** were **not** run in this
phase. The `-http.test.ts` suites skip without a live server; **4 skipped** tests in §5 are those. No
claim is made about them. `npm run verify` as a whole was not executed.

---

## 6. Minimal diff summary

| Change | Type | Lines |
|---|---|---|
| `tests/security/family-office-uncovered-table-isolation.test.ts` | **New test file** | ~305 |
| `docs/governance/FAMILY_OFFICE_PHASE_4C_REMEDIATION.md` | **New documentation** | this file |
| Schema / migration | **none** | 0 |
| Service / API / UI | **none** | 0 |
| Grants / policies | **none** | 0 |
| Seed / fixtures | **none** | 0 |
| Existing tests | **untouched** | 0 |

**Rollback:** delete the two new files. Nothing else changed, so no migration reversal, no grant
restoration and no data repair is required. The suite is read-only apart from write probes that are always
rolled back inside their own transactions, and it **fails closed** rather than weakening an assertion.

---

## 7. Residual risks and blockers

| # | Risk / blocker | Severity | Evidence | Owner | Clearance |
|---|---|---|---|---|---|
| `FO-BLK-03` | **RLS absent on 77 tables, 26 of them tenant-scoped**; the runtime role holds `DELETE` on 37 of them | **HIGH** | §3; probes in §5 | Engineering under review | Either RLS+FORCE+policy on the D2 set **or** a reasoned per-table exclusion; register updated deliberately |
| `FO-BLK-13` | **No new migration can pass the integrity gate** — snapshot chain broken at 0038/0039, cascading to 0048; policy forbids extending the debt register for 0074+ | **HIGH** | §2.1, proven with `INTEGRITY_EXIT=1` | Engineering under review | Option A, B or C in §4.1 — **human decision** |
| `FO-BLK-14` | **375 of 464 tables grant `DELETE` to the runtime role**, including audit and authority tables | MEDIUM | §3.2 | Engineering under review | Least-privilege review; prefer superseding records over deletes |
| `FO-BLK-02` | ~~count mismatch~~ | — | §2 `C-2` | — | **CLOSED — explained** (3 unmaterialised − 1 ledger table) |
| `FO-BLK-01` | ~~`family_policy_*` never migrated~~ | — | §2 `C-1` | — | **WITHDRAWN — intentional, documented deferral** |
| `FO-BLK-09` | **No approving body evidenced as constituted** — keystone | **HIGH** | `BEYU-SCG-16` `BLK-01` | **UNASSIGNED** | The ten-item checklist in `BEYU-SCG-18` §3.1 |
| `FO-BLK-04`…`08`, `10`…`12` | Domain gaps carried forward from Phase 4A | MEDIUM/HIGH | `BEYU-FO-AUD-01` §8 | **UNASSIGNED** | As recorded there |

**Nothing above is cleared except where marked closed.** Closing `FO-BLK-01`/`02` removes two false
findings; it does not advance any authority.

---

## 8. What this phase did not do

* It did not merge, deploy, run a production migration, or alter any live or shared record.
* It did not enable RLS, add or alter a policy, or grant or revoke any privilege.
* It did not push to `main`, force-push, auto-merge, close an unrelated PR, or restructure PR #108.
* It did not materialise `family_policy_*`, adopt any `FO-P-*` proposal, constitute any body, appoint any
  owner, or populate any register.
* It did not fabricate identity, authority, appointment, approval, evidence or verification.
* It did not weaken, skip or suppress a test. The one observed failure was investigated to its root cause
  and is reported in §5.1.

Family facts and safeguards are unchanged: both intended parents remain **intended settlors** in the
drafting context; the child remains **one of several intended beneficiaries**, not the sole beneficiary,
and an intended Family Office member; no other beneficiary, birth date, identity number, trustee, guardian
or instrument is invented; membership confers no trusteeship, signing, unrestricted records access,
financial or voting authority; and **a minor receives no login, admin, signing, payment, investment or
unrestricted personal-data access through membership alone.** The Phase 3 `BLK-08` corrections and their
regression suite are preserved. Seed values such as `FAMILY_COUNCIL`, `VERIFIED` KYC or
`NIDA_DOCUMENT_VERIFICATION` are not evidence.

---

## 9. What this document does not establish

* It is not an approval, a compliance statement, a legal opinion, or a claim of production safety.
* It does not prove cross-tenant leakage through any specific API, job or export — only that the
  **database** does not enforce the boundary on the 77 registered tables.
* It does not clear `FO-BLK-03`, `FO-BLK-13` or `FO-BLK-14`; `FO-IMP-01` is blocked, not done.
* `D2`/`D3`/`D4` dispositions are **proposals**. Documentation alone does not establish safety; the
  register establishes *visibility*, and only a migration plus the probes can establish *enforcement*.
* A control that has never run is not a control passed. A register that is correct today is not a
  boundary tomorrow.

**Status: minimal additive remediation complete; the RLS migration is BLOCKED pending a human decision.
Stopping at the review gate.**
