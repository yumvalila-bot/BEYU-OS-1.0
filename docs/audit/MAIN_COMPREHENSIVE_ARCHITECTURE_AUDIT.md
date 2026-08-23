# BEYU OS — CURRENT MAIN COMPREHENSIVE ARCHITECTURE AUDIT

**Audit date:** 2026-08-23 (UTC)  
**Repository:** `yumvalila-bot/BEYU-OS-1.0`  
**Audited ref:** `origin/main` at `8516162052a59ad7f538d78cfb7539fcb2f97c40`  
**Audit branch:** `arena/01a02d6d-beyu-os-1-0`  
**Supabase:** explicitly excluded; no Supabase configuration or connection was used.

This report is based on the checked-out implementation, SQL migrations, tests and static
repository evidence. Historical phase reports were treated as claims to verify, not as the
source of truth.

## Executive finding

BEYU OS contains a substantial and coherent **control-plane substrate**: a party/user/session
identity model, tenant/entity model, constitutional and governance model, HCM employee master,
Finance OS schema and posting boundary, policy and capability registries, append-only audit/event
writers, specialist platform, financial epistemics, lineage, workflow rules and a single Noelia
identity on the HIVE label.

It is **not production-ready**. The live PostgreSQL database could not be reached in this
sandbox, so database fingerprint, seed parity, RLS behaviour, migration parity and the
PostgreSQL-dependent test suites could not be proven. Static review also found genuine unresolved
security/integrity defects, including non-transactional pooled RLS context, a destructive historical
migration, concurrent MFA replay exposure, incomplete durable identity uniqueness and a permission
catalogue split. Those are not authority-only blockers.

The audit made only minimum changes to demonstrated engineering seams: tax entity scoping, HCM
entity scoping, Noelia knowledge clearance/temporal filtering, tax temporal filtering, emergency
grant activation/tenant filtering, authority metadata and permission-chain fail-closed checks, and
reserved-matter tenant scoping. No database was connected, seeded, migrated, posted to, funded,
ratified or otherwise mutated.

**Final gate: 🔴 RED.** Authority absence alone would be 🟡 YELLOW, but the unresolved security
and audit-integrity findings require RED until independently remediated and proven against a real
PostgreSQL deployment.

---

## 1. Current Git State

### Immutable baseline captured before modification

| Check | Result |
|---|---|
| Current branch | `arena/01a02d6d-beyu-os-1-0` |
| Baseline HEAD | `8516162052a59ad7f538d78cfb7539fcb2f97c40` |
| `origin/main` | `8516162052a59ad7f538d78cfb7539fcb2f97c40` |
| Ahead/behind `origin/main...HEAD` | `0 / 0` |
| Working tree at baseline | clean |
| Untracked files at baseline | none |
| Tags | none |
| Recent commit | `HCM-1 — governed workforce consumption and canonical HCM completeness (#2)` |
| Remote heads | `main` plus unrelated historical/feature refs; no newer `origin/main` |

`git fetch origin --prune`, `git rev-parse`, `git status`, `git ls-remote`, tag inspection and
recent-history inspection were performed. The checkout was therefore verified as the current
`main` implementation before the audit remediation edits.

The final audit patch is intentionally on the fixed Arena branch. No other branch was created or
checked out.

---

## 2. Database Baseline

### Available evidence

The repository statically contains:

- 11 numbered SQL migrations, `0000` through `0010`.
- 11 Drizzle metadata snapshots plus `_journal.json`.
- 72 `CREATE TABLE` statements in the baseline migration.
- 17 PostgreSQL enum types in the baseline migration.
- A runtime `beyu_migrations` metadata table created by `scripts/migrate.ts`, making 73 expected
  public tables after a clean install before any other external objects.
- 11 tenant/RLS policies in migration `0001` (legal entities, ownership, employees, capital,
  treasury, waterfall configs, risks, compliance obligations, documents, audit and events).
- Database triggers for audit/event append protection, journal balance/immutability/scope,
  period overlap and policy-window integrity.
- No `CREATE ROLE`, `GRANT`, `REVOKE` or `SECURITY DEFINER` statements in the repository.

### Unavailable evidence

`DATABASE_URL` was not set. No `postgres`, `psql`, `pg_ctl`, `initdb` or Docker runtime was
available. Consequently the following could not be captured:

- database identity/version and schema fingerprint;
- applied migration count/checksums and upgrade parity;
- actual schema, triggers, RLS state, disabled triggers and PostgreSQL permissions;
- tenants, legal entities, users, employees, governance, authority, treasury or financial counts;
- seed parity and clean-install parity;
- database-backed security, concurrency and transaction tests.

`npm run migrate` with a non-persistent probe URL correctly failed closed with
`connect ECONNREFUSED`; no migration ran. `npm run seed` was not run. There was no financial or
governance state mutation by this audit.

The historical `scripts/evidence/phase9-state.mjs` is not a current baseline: it assumes a live
candidate database and cannot establish state here.

---

## 3. Repository Inventory

The actual implementation inventory is:

| Area | Implementation found | Assessment |
|---|---|---|
| Applications/UI | Next.js App Router; 15 `/os` pages plus sign-in and shared components | Present, server-rendered, mostly read-only |
| APIs | 15 route handlers: health, auth, HCM, governance, tax, waterfall, capital governance, Noelia, self-test | Present; no general CRUD surface |
| Database | `src/db/index.ts`, Drizzle schema split into core/identity/people/governance/finance/platform/assurance | Present; PostgreSQL required at module load |
| Migrations | `drizzle/0000`–`0010` | Present; historical destructive statement remains |
| Seeds | `src/db/seed.ts` | Present; requires explicit bootstrap password; updates MFA fields for legacy rows |
| Identity | parties, users, sessions, roles, permissions, role assignments, graph resolver, MFA | Present; durable uniqueness/source-of-truth gaps remain |
| Governance | constitution, policy, bodies, members, resolutions, votes, approvals, decisions, reserved matters | Present; authority lifecycle is incomplete and DB evidence unavailable |
| Authority | decision registry, capability registry, 6C activation gate, scoped authority service, simulation | Present; fail-closed path strengthened during audit |
| HCM | employee master, positions, employment events, read/observe services, HCM API | Present as canonical read master; writes intentionally refused |
| Finance | ledger schema, posting engine, periods, FX, intercompany, reconciliation, reporting, truth registry | Present as rails; accounting execution is authority-blocked |
| Capital/Treasury | capital request schema and governance prerequisite; treasury observation schema/specialist | Present as observation/authorization seam; no settlement |
| Tax | tax strategy schema, tax engine, specialist/API/UI | Candidate intelligence only; no authoritative liability |
| Legal | legal matter/document fields and read UI | Storage/evidence only; no legal interpretation engine |
| Risk/Compliance/Audit | assurance schema and read-only specialist services | Present as read/analysis surfaces; write lifecycle absent |
| Events | `enterprise_events`, one append writer in `lib/audit.ts` | Present; non-atomic route paths remain |
| Audit | `audit_log`, hash chain and append-only triggers | Present; migration and metadata weaknesses remain |
| Lineage | `finance/lineage.ts`, specialist provenance fields | Present for financial derivations; not universal |
| Workflow | persisted definitions plus pure Finance workflow primitive | Definition storage and pure evaluator; no persisted executor |
| Workers/jobs | none found | NOT_AVAILABLE |
| Integrations | integration registry table and documentation | Registry only; no runtime connector execution |
| Intelligence | deterministic Noelia analysis with HIVE label | Present; not an external LLM/tool runtime |
| Security/observability | MFA, sessions, headers, rate limiter, audit/event logs, self-test | Present but not production-proven; several security blockers |

### Actual implementation map

```text
BEYU OS
├── Core / constitutional control plane
│   ├── src/db/schema/core.ts
│   ├── src/db/schema/governance.ts
│   ├── src/lib/governance.ts
│   ├── src/lib/governance/constitution.ts
│   ├── src/lib/governance/reserved-matters.ts
│   ├── src/lib/policy.ts
│   └── src/lib/authority/*
├── Identity and security kernel
│   ├── src/db/schema/identity.ts
│   ├── src/lib/identity.ts
│   ├── src/lib/session.ts
│   ├── src/lib/authz.ts
│   ├── src/lib/tenant-scope.ts
│   ├── src/lib/mfa.ts
│   ├── src/lib/guard.ts
│   └── src/lib/api.ts
├── HCM
│   ├── src/db/schema/people.ts (employees, positions, employment_events)
│   ├── src/lib/hcm.ts
│   ├── src/lib/hcm-observe.ts
│   └── src/app/api/v1/hcm/*
├── Finance OS
│   ├── src/db/schema/finance.ts
│   ├── src/lib/finance/posting-engine.ts
│   ├── src/lib/finance/period.ts
│   ├── src/lib/finance/fx.ts
│   ├── src/lib/finance/intercompany.ts
│   ├── src/lib/finance/reconciliation.ts
│   ├── src/lib/finance/reporting.ts
│   ├── src/lib/finance/truth.ts
│   ├── src/lib/finance/epistemics.ts
│   └── src/lib/finance/lineage.ts
├── Assurance / specialist capabilities
│   ├── src/db/schema/assurance.ts
│   ├── src/lib/specialist/platform.ts
│   ├── src/lib/specialist/{risk,compliance,treasury,forecast,fpna,audit}/*
│   └── src/lib/specialist/tax-intelligence.ts
├── AI / HIVE
│   ├── src/lib/noelia.ts
│   ├── src/db/schema/platform.ts (ai_decisions, knowledge_sources)
│   └── src/app/api/v1/ai/noelia/route.ts
└── Shared platform
    ├── src/lib/audit.ts
    ├── src/lib/idempotency.ts
    ├── src/lib/execution/simulate.ts
    ├── src/lib/finance/workflow.ts
    └── documents/events/registry/notifications/integrations tables
```

There is no second Sector Control Plane. `os_registry` records sector/future OS declarations;
this checkout does not contain actual Health, Agriculture, Finance or Foundation Sector OS
applications. The Foundation page is a BEYU OS surface consuming scoped records, not a separate
control plane.

---

## 4. Canonical Architecture Map

| Canonical capability | Current implementation | Status | Reconciliation |
|---|---|---|---|
| Constitutional control | 12 seeded articles, policy levels, constitution evaluator | PARTIAL | Real control-plane primitive; active policy provenance is unresolved |
| Identity | parties → users → sessions → roles/grants | PARTIAL | One model exists, but `users.party_id` is not unique |
| Enterprise identity graph | `src/lib/identity.ts`; GlobalUserID is `users.id` | READY for read resolution | No new identity store; duplicate input is detected, not prevented |
| HCM master | `employees` table and HCM consumption API | PARTIAL | Canonical employee master is present; lifecycle writes are authority-blocked |
| Governance | body/resolution/vote/decision services | PARTIAL | Propose/table/vote/closure exist; general policy/delegation/workflow execution does not |
| Authority | decision/capability registries and gates | PARTIAL | Fail-closed gates exist; no ratified execution authority is evidenced |
| Permission | `ROLES`/`PERMISSIONS` constants plus DB catalogue | PARTIAL | This is a real dual-source architecture, not a harmless duplicate |
| Finance truth | journal entries/lines and sole posting writer | PARTIAL | Correct boundary; empty/unverified state and authority block execution |
| Capital | request records and non-executing governance authorization | PARTIAL | No capital funding/settlement/execution |
| Tax | strategy intelligence and jurisdiction checks | PARTIAL | No tax liability or treatment is claimed as authoritative |
| Legal | matter/document storage and display | PARTIAL | Legal interpretation intentionally remains outside the implementation |
| Epistemic trust | financial classes, promotion rules, lineage | PARTIAL | Strong finance rails; UI/AI/dashboard coverage is not universal |
| Audit/events/trace | one audit/event append module and hash chains | PARTIAL | Writers exist; migration, atomicity and trace completeness remain |
| Workflow | one pure workflow evaluator plus persisted definitions | PARTIAL | No second executor, but no durable lifecycle executor |
| Intelligence | Noelia/HIVE deterministic analyst | PARTIAL | Governed and audited; no LLM/tool execution or review disposal |
| Sector consumption | registry and HCM/Finance/assurance consumption seams | NOT_AVAILABLE | Actual Sector OS implementations are absent |

**Sector OS relationship:** the code consistently describes Finance OS and sector records as
consumers of BEYU OS identity, tenant, governance, permissions, audit, events and HCM. No
specialist module creates a competing governance or identity store. The lack of actual Sector OS
applications is a capability/data availability statement, not a reason to build a new control
plane here.

---

## 5. Identity

### What exists

- `parties` is the MDM party store.
- `users.id` is explicitly named `GlobalUserID` by `src/lib/identity.ts`.
- `employees.party_id` is unique in the schema and links the HCM master to parties.
- Sessions link users to a tenant and are token-hash based.
- Role assignments are effective-dated and entity-aware.
- `resolveByPartyId`, `resolveByGlobalUserId`, `resolveByEmployeeId` and batch party-to-user
  resolution use the existing stores rather than adding a graph store.
- `filterByClearance`, RBAC, ABAC, tenant scope and MFA are implemented.

### Findings

1. **Duplicate prevention is not durable.** `users.party_id` has no unique index. The graph
   resolver throws `DATA_CONFLICT` when it sees multiple user IDs, but both duplicate users can
   still authenticate and `resolvePrincipal()` does not itself reject a duplicated party. This is
   an architectural integrity gap, not merely a missing test. A future migration should add a
   unique constraint only after a real database duplicate scan and governed duplicate resolution.
2. Role assignment `legal_entity_id` is not tied to `role_assignments.tenant_id` by a composite
   database constraint. Application checks reduce exposure, but raw SQL can create an invalid
   scope relation.
3. `role_assignments.granted_by` is descriptive text, not a foreign-keyed governed authority
   record. The runtime accepts effective-dated rows; a DB writer could inject a grant.
4. Runtime permissions come from TypeScript `ROLES`, while DB `roles`, `permissions` and
   `role_permissions` are also seeded. `assertPermissionCatalogParity()` detects drift but does
   not establish one source of truth.

### Assessment

**Status: PARTIAL.** The canonical identity concept is correct and no duplicate identity engine
was created. Durable uniqueness, DB authority for role grants and live database evidence remain
unproven.

---

## 6. HCM

### Verified in code

- `employees` is the single workforce master.
- `employees.party_id` is unique.
- Employment events are separate immutable facts; the read service does not rewrite history.
- HCM links to GlobalUserID through the identity graph and returns `null` when no login exists;
  it does not invent a user.
- Position, manager, organization, temporal and compensation boundaries are represented.
- Compensation is filtered at `RESTRICTED` clearance.
- Sector consumption uses the HCM read service/API; no Sector employee master exists.
- HCM lifecycle write evaluation returns `REQUIRES_AUTHORITY` and `mutated: false`.
- Cycle, self-manager, date and cross-scope structural checks exist.

### Audit remediation applied

The workforce query previously admitted a row when **either** its employee tenant or employing
legal-entity tenant was in scope. Because shared HCM seed rows are held at the group tenant,
that `OR` was necessary for legitimate consumption but also admitted corrupt rows with a foreign
employing entity. The minimum correction now scopes on the employing legal entity tenant, then
applies the principal's entity scope. This preserves shared HCM consumption while preventing a
foreign legal entity from entering a sector result.

### Remaining gaps

- No employee create/update/terminate API exists. This is correctly an authority boundary today,
  but it means HCM is not an operational write system.
- Manager and employment-event reads depend on parent employee IDs and application-level
  selection; there is no tenant column on `employment_events` because tenancy is inherited.
- HCM write authority, payroll integration and legal employment interpretation are not available.

**Status: PARTIAL; production writes: REQUIRES_AUTHORITY.** HCM is first-class and canonical,
but “complete employee master” must not be read as “production HCM operating system.”

---

## 7. Governance

### Present

- Constitution articles and hierarchy.
- Governance bodies with quorum, majority and reserved matters.
- Effective-dated membership and voting rights.
- Resolution proposal, tabling, ballot change, voting conclusion and separate decision closure.
- Server-derived actor, tenant, reference, tally, quorum and final status.
- Presiding-seat checks for tabling and decision closure.
- Reserved-matter parsing and competence checks.
- Atomic domain + audit + event transactions for governance mutations.
- Resolution provenance can be distinguished from seed data through audit trails.

### Behavioural controls that are present

- A client cannot submit a decided status, tenant, actor, reference, tally or outcome.
- A voter must have an active seat; permission alone is insufficient.
- A resolution cannot be closed before the voting window closes or all eligible members vote.
- Ties are `DEADLOCKED`; there is no invented chair tie-break.
- Unparseable reserved matter strings fail closed.
- A different body cannot be used to bypass a reserved matter in the scoped service.

### Audit remediation applied

`requiresReservedMatterTreatment()` and `checkBodyCompetence()` now accept the resolved tenant
scope. Proposal-time competence evaluation no longer reads every tenant's governance body as if
it were one global registry. An out-of-scope body's reserved matter cannot veto or be disclosed in
a tenant-scoped proposal.

### Gaps

- Policy lifecycle management, delegation activation, approval-chain execution and persisted
  workflow execution are not implemented.
- Governance decision registry activation is directly writable at the database level by any DB
  principal with sufficient table access; the repository has no governed activation API.
- The governance registry fields `approving_body`, `decision_maker`, `scope`, `conditions` and
  `evidence` are free text/nullable and are not relationally linked to the responsible body/member
  or evidence document.
- Historical seed resolutions include final-looking statuses, but they are seed/reference data,
  not proof of a governed runtime decision.

**Status: PARTIAL; production governance execution: REQUIRES_AUTHORITY.** No parallel governance
engine was introduced.

---

## 8. Authority

### Chain reviewed

```text
AUTHORITY → POLICY → DECISION → CAPABILITY → PERMISSION → SERVICE → EXECUTION → AUDIT → EVENT → TRACE
```

The existing code has both the original decision-level activation gate and the scoped authority
service. The scoped service composes `checkCapabilityActivation()` rather than creating a second
independent decision engine.

### Positive properties

- Unknown capability fails closed.
- Empty required-decision lists do not become a free pass.
- Only `ACTIVATED` is executable in the decision gate.
- Pending, future, expired, superseded, revoked, suspended and unprovenanced authority do not
  execute.
- Tenant/entity/principal scope is evaluated separately in the scoped authority service.
- Simulations are explicitly non-mutating and use simulation vocabulary.
- Missing execution permission now returns `AUTHORITY_CHAIN_INCOMPLETE` in the scoped gate rather
  than creating a permissionless activated capability.
- An activated decision now requires non-empty issuer, decision maker, scope, conditions and
  evidence metadata; future approval dates are refused. This closes a demonstrated bypass in
  which `status='ACTIVATED'` plus a valid resolution could pass with the rest of the authority
  chain absent.

### Remaining authority defects

- There is no governed service/API that transitions registry decisions from PENDING through
  ratification and activation. Database state is the only possible future activation path.
- The gate does not yet independently prove that free-text `approving_body` and `decision_maker`
  match an active governance body/member or that the scope matches the cited resolution.
- `evaluateAuthority()` is a pure generic evaluator and does not itself require
  `authorityClass='GOVERNED_AUTHORITY'`; callers must supply the correct record boundary.
- `checkCapabilityActivation()` relies on registry data and does not independently prove the
  capability's execution permission is a canonical DB permission. A non-null unknown permission is
  eventually rejected by principal-set comparison, but registry validation is incomplete.

**Status: PARTIAL; all current financial capability execution: REQUIRES_AUTHORITY.**

---

## 9. Finance OS

### Present

- Financial entity, account, journal, period, treasury, capital, waterfall and tax schemas.
- `postJournal()` is the only application journal writer found.
- A policy-independent structural journal validator.
- Integer minor-unit application arithmetic for posting.
- Database-level balance, line-side, immutability, period overlap and scope triggers.
- Tenant/entity/account/period rechecks inside the posting transaction.
- Trial balance/reporting/FX/intercompany/reconciliation read/derivation rails.
- A financial truth registry explicitly names canonical tables and sole writers.
- Tax is inside Finance OS, not a separate tax control plane.

### Authority boundary

`CAP_POSTING`, chart-of-accounts, periods, opening balances, FX, capital accounting, treasury
settlement, intercompany and reversal capabilities are seeded LOCKED/PENDING dependencies. The
posting engine correctly refuses to execute before authority. This audit did not post a journal,
create accounts, open a period, alter FX, settle treasury or change capital.

### Policy-dependent versus implemented

| Layer | Current truth |
|---|---|
| Double-entry structure | Implemented and DB reinforced |
| Journal immutability | Implemented by trigger, subject to DB-role/superuser controls |
| Account/period creation | Not implemented; REQUIRES_AUTHORITY |
| Recognition/measurement/materiality | Not implemented; REQUIRES_AUTHORITY |
| FX source | Refusal and data-quality scan; no invented rate |
| Consolidation/elimination | Structural assessment only; REQUIRES_AUTHORITY |
| Financial statements | Derivation rails only; no live DB proof |
| AR/AP/fixed assets/inventory | No substrate; DATA_NOT_AVAILABLE/NOT_AVAILABLE, not stubbed |

**Status: PARTIAL; execution: REQUIRES_AUTHORITY.** Finance OS remains a first-class BEYU OS
domain and no second financial truth store was created.

---

## 10. Capital

- `capital_requests` is the canonical request table.
- Capital governance authorization transitions only to `GOVERNANCE_AUTHORIZED`.
- The transition is explicitly not capital approval, funding or execution.
- Resolution status/provenance, body reach and tenant/entity scope are rechecked.
- Mutation, audit and event are atomic and concurrency-guarded.

No funding, settlement, capital accounting or disbursement executor exists. The source contains
capital “approval” seed rows, but seed rows are not proof of a governed execution decision.

**Status: PARTIAL; execution: REQUIRES_AUTHORITY.**

---

## 11. Treasury

Treasury positions are observed records with institution, account label, currency, balance,
base-currency balance, date and classification. Treasury specialists analyze concentration,
liquidity, counterparty and attribution without writing financial truth. FX is not derived from
balances. Reconciliation reports `DATA_NOT_AVAILABLE` when the ledger side is absent.

The repository's seed code contains group-tenant treasury rows, including a known mismatch risk
between claimed tenant and legal-entity ownership that the data-quality scanner is designed to
report rather than repair. Because PostgreSQL was unavailable, the actual count, balances and
attribution findings were not asserted in this audit.

There is no bank connector, settlement worker, transfer executor or reconciliation sign-off API.

**Status: PARTIAL; current data: DATA_NOT_AVAILABLE; settlement: REQUIRES_AUTHORITY.**

---

## 12. Tax

### Present

- Tax Strategy Intelligence is implemented under Finance OS.
- Positions distinguish legal planning, lawful avoidance, aggressive/uncertain positions and
  prohibited evasion.
- Prohibited evasion is hard-blocked and estimated benefit is `null`.
- Jurisdiction mismatch is not generalized across countries.
- Required documentation, approvals, risk and human review are represented.
- No tax liability is recognized as authoritative and no tax posting capability is activated.

### Audit remediation applied

- The tax assessment endpoint now resolves the client-selected legal entity only inside the
  authenticated tenant/entity scope and returns the same non-enumerating 404 for hidden entities.
- Strategy assessment now refuses a future effective date, an expired effective date, a stale
  review date and malformed `asOf` input.
- The added regression covers future and post-review strategy refusal.

### Remaining gap

The endpoint still computes an ephemeral assessment; it does not save a tax assessment record or
create a human Tax Governance disposition workflow. Tax reference data is not ratified policy.

**Status: PARTIAL; authoritative tax treatment/liability: REQUIRES_AUTHORITY.**

---

## 13. Legal

What exists is deliberately limited:

- `legal_matters` with matter type, entity, jurisdiction, exposure, deadlines, counsel and status.
- Document registry fields for checksum, authority status, evidence, retention and legal hold.
- Assurance page display and legal read permission.
- Regulatory change watch records.

What does **not** exist:

- A legal interpretation engine.
- Binding legal advice or a legal conclusion generator.
- Automated adoption of external law into BEYU policy.
- A legal matter mutation/review workflow.

This is correct under the no-invented-law rule. Legal interpretation remains `REQUIRES_AUTHORITY`
or `REQUIRES_HUMAN_REVIEW`, not an artificial “complete” row.

**Status: PARTIAL; interpretation: REQUIRES_AUTHORITY.**

---

## 14. Epistemic / Data Trust

`src/lib/finance/epistemics.ts` provides explicit classes including `POSTED`, `OBSERVED`,
`DERIVED`, `FORECAST`, `ASSUMPTION`, `SCENARIO`, `REFERENCE_DATA`, `SYNTHETIC`,
`REQUIRES_AUTHORITY`, `REQUIRES_POLICY`, `GOVERNANCE_REVIEW_REQUIRED`, `DATA_NOT_AVAILABLE` and
`DATA_CONFLICT`.

Positive controls:

- `UNKNOWN`/unrecognized classifications throw rather than silently default.
- Synthetic data cannot be promoted to production truth.
- Forecast/assumption/scenario/reference data cannot become POSTED.
- Empty inputs become `DATA_NOT_AVAILABLE` in the finance value helpers.
- Lineage marks derivations non-canonical.
- FX refuses implied rates.

Gaps found:

- Some dashboard and Noelia paths use SQL `coalesce(..., 0)` or render “no approved commitments”
  without carrying an explicit `DATA_NOT_AVAILABLE`/observed basis.
- The generic policy evaluator returns an `ALLOW` effect when there is no matching rule. Callers
  also use RBAC, so this is not an immediate API bypass, but policy effect alone must not be
  interpreted as authorization.
- Epistemic labels in specialist models and the canonical finance classes are adapters, not a
  single persisted enterprise data-trust column.

**Status: PARTIAL.** The model is strong in Finance OS but not proven universal across every output.

---

## 15. Tenant Isolation

### Present

- `tenantScopeIds()` resolves an enterprise principal to its descendant subtree and a sector
  principal to its own tenant.
- Governance, HCM, capital, treasury, risk, compliance, audit and event reads generally use
  scope predicates.
- Hidden IDs are usually returned as non-enumerating `NOT_FOUND`.
- RLS policies exist for 11 high-value tables.
- Sector/Foundation page scope bypasses identified by historical reports is fixed in current code;
  the tax endpoint received an additional audit fix in this audit.

### Critical unresolved issue: pooled RLS context

`setDatabaseTenantContext()` executes two session-level `set_config(..., false)` calls through the
module-level `pg.Pool`, then subsequent queries use the same pool without connection pinning or a
shared transaction. A pool does not guarantee that the following query uses either connection
that received the settings. Session settings also persist on whichever connection was used.

Therefore the RLS context is not a reliable per-request security boundary under concurrency or
multiple replicas. The application predicates are the currently more reliable control, but RLS
cannot be represented as proven defense in depth until all scoped work is connection-pinned or
transaction-local. PostgreSQL superusers also bypass RLS, as the migration comment acknowledges.

### Other gaps

- RLS is not enabled on all tenant-bearing tables.
- Global `beyu.global_scope=on` is a powerful session variable with no PostgreSQL role separation
  in the repository.
- Several child tables inherit tenancy from parents; this is valid architecture only if every
  query preserves the parent constraint.

**Status: PARTIAL architecture, BLOCKED security proof.**

---

## 16. Entity Isolation

Application services commonly verify that a legal entity belongs to the requested tenant and
that it is in the principal's entity scope. Posting and capital governance re-read entity scope.
The tax route was corrected during this audit. HCM now uses the employing legal-entity tenant as
the mandatory scope boundary while preserving group-held shared HCM rows.

The schema does not generally use composite foreign keys such as `(tenant_id, legal_entity_id)`
to enforce the relationship at the database layer. `entity_appointments`, ownership, positions,
capital, treasury, waterfall, risk, compliance, legal and related tables can hold independently
valid but cross-tenant combinations unless application checks or a data scan catches them.

This is a material persistence-level gap for a system whose canonicals require legal-entity
isolation. It needs a real data inventory and a governed, minimally scoped constraint plan; no
migration was invented without the database baseline.

**Status: PARTIAL; security proof: BLOCKED.**

---

## 17. Permissions

### Current model

- Canonical permission names are in `src/lib/constants.ts`.
- Canonical role-to-permission assignments are also persisted in `permissions` and
  `role_permissions` by the seed.
- Runtime `permissionsForRoles()` reads `ROLES` from TypeScript, not DB rows.
- `assertPermissionCatalogParity()` compares the two sets.
- High-risk MFA requirements are also defined in TypeScript (`HIGH_RISK_PERMISSIONS`) while the
  DB permission table contains `requires_mfa` and `high_risk` fields.

### Assessment

This is an **architectural duplication**, not a legitimate adapter, because both stores are
catalogues capable of being interpreted as authority and only one is live. Parity checking is a
detection control, not one source of truth. A dedicated authorization change is required to select
one authoritative catalogue, migrate/cut over safely and prove grant/revoke/role drift behavior.

No broad permission migration was made during this audit because it would alter the security
source of truth without a live DB and governed cutover plan.

**Status: PARTIAL; production authorization: BLOCKED.**

---

## 18. Capabilities

The registry contains 60 seeded capability rows in code, including specialist, Finance, capital,
treasury, posting, reversal and control capabilities. Read-only specialist capabilities declare
no required decisions and are not used as write authorization. Execution capabilities declare
pending decisions and are LOCKED.

`checkCapabilityActivation()` and `checkScopedCapability()` provide one composed gate. The
registry itself does not grant a role permission. The Finance posting engine additionally checks
`finance:ledger.post`, tenant, entity, account, period, balance and atomic audit/event.

No capability is proven activated in this audit. Static seed code deliberately starts all decision
rows PENDING and capabilities LOCKED. The DB state could not be confirmed.

**Status: PARTIAL; execution: REQUIRES_AUTHORITY.**

---

## 19. Audit

### Present

- `audit_log` is the single application audit writer.
- Hash chain heads are serialized with `SELECT ... FOR UPDATE` in transactions.
- Partial unique parent-hash indexes reject forks.
- UPDATE and DELETE triggers protect audit/event rows.
- Migration `0008` adds TRUNCATE triggers.
- `withAuditTransaction()` composes domain mutation + audit + event atomically for governance,
  capital authorization, Noelia and specialist analysis/write paths that use it.
- Chain verification recomputes hashes, checks parent links, duplicate parents and chain head.

### Critical unresolved issue: destructive migration

`drizzle/0001_kernel_gate1_hardening.sql` executes:

```sql
TRUNCATE TABLE audit_log;
TRUNCATE TABLE enterprise_events;
UPDATE audit_chain_heads SET current_hash = null ...;
```

The surrounding comment says production must export/archive first, but the migration runner does
not enforce that instruction and the statements execute as part of ordinary migration application.
A production upgrade can therefore destroy audit/event history before the later TRUNCATE guard is
installed. This violates the canonical append-only audit requirement. Comments are not a control.

### Other gaps

- Audit hash payload does not cover `reason`, `authority`, `approvalRef`, policy version, AI
  version, trace ID, IP or user agent. Append-only triggers protect ordinary mutations, but a
  privileged storage bypass could change material metadata without hash detection.
- `audit_log` actor and tenant fields are not fully foreign-keyed.
- `AuditInput.traceId` is optional, and several operations (including posting and logout) can
  produce audit records without a trace.

**Status: PARTIAL; integrity proof: BLOCKED.**

---

## 20. Events

`enterprise_events` is the single enterprise event table and `publishEventTx()` is the single
application append writer found. Events are hash-chained, classified, versioned and trace-aware.
No second event bus or specialist event truth was found.

Governance, capital, Noelia and specialist paths use the shared transaction primitive. The
waterfall simulation and tax assessment routes call standalone `recordAudit()` followed by
standalone `publishEvent()`. If the second operation fails after the first commits, the operation
has incomplete audit/event pairing. These routes do not mutate financial truth, but they are still
governed operations requiring complete traceability.

Event hash payload also omits source, schema version, actor, classification and trace fields.

**Status: PARTIAL; production event integrity: BLOCKED.**

---

## 21. Trace

API responses carry `x-trace-id` and the governed mutation routes pass trace IDs to audit/event
records. The pure workflow and specialist platforms validate trace format.

The contract is not universal: `AuditInput.traceId` is nullable/optional, `postJournal()` has no
trace parameter, and standalone auth/logout/finance paths can omit correlation in the persisted
audit row. `explainAuthority()` also sets `underWhichPolicy: null` even when a policy version is
passed separately.

**Status: PARTIAL.** A full governed operation trace must require WHO, WHAT, WHEN, WHY, authority,
policy/version, decision, capability, permission, tenant, entity, evidence and trace at the
shared primitive rather than by convention.

---

## 22. Lineage

`finance/lineage.ts` provides source → transformation → output nodes, weakest-link classification,
reverse source tracing and an explicit non-canonical assertion for derived values. Specialist
results carry source IDs, assumptions and blockers. Finance truth explicitly refuses a stored
balance projection as a second canonical store.

Lineage is not a universal persisted enterprise primitive: many UI aggregations and Noelia
findings use source labels/IDs but do not create a common reverse lineage record. This is adequate
for current read-only analysis only if outputs remain advisory and non-authoritative.

**Status: PARTIAL.**

---

## 23. Workflow

There are two related but not competing concepts:

1. `governance.workflows`/`workflow_instances`/`tasks` are persisted definitions/substrate.
2. `src/lib/finance/workflow.ts` is the one pure transition/SoD evaluator used by simulations and
   Finance rails.

The second is not a second persisted workflow engine; it is the shared evaluation primitive. It
has default-deny state/trace validation, illegal-transition handling, role incompatibility
symmetry, execution capability requirement and post-hoc SoD review.

No durable workflow instance is created by application code. Human review flags exist for AI and
compliance, but no review/dispose executor exists.

**Status: PARTIAL; financial transitions: REQUIRES_AUTHORITY.**

---

## 24. HIVE / Noelia

### Present

- One AI identity label: `NOELIA`; one runtime label: `HIVE`.
- Human principal authentication, RBAC, tenant and clearance are inherited.
- Policy is evaluated with `aiInitiated: true`.
- AI decisions are persisted and atomically paired with audit/event records.
- Output class, confidence, sources, denied scopes, model/prompt versions and human-review flag
  are stored.
- Noelia does not post journals, mutate ownership, alter beneficiaries or approve resolutions.
- No external LLM/API or executable tool runner exists; tool names are deterministic labels.

### Audit remediation applied

Noelia knowledge retrieval and the Noelia page now enforce:

- principal clearance against source classification;
- source effective date reached;
- review date not passed;
- expiry not passed;
- `AUTHORITATIVE` status only.

### Gaps

- Human review is a boolean/metadata flag with no review/dispose API or accountable disposition
  workflow.
- The deterministic analyst reports some aggregate values with `Number(... ?? 0)` and labels
  findings as FACT even where absence/observed basis needs a stronger epistemic representation.
- RAG is a bounded SQL regex scan, not a ranked/embedded retrieval system. This is a capability
  limitation, not permission to invent a second intelligence layer.

**Status: PARTIAL; AI authoritative action: REQUIRES_AUTHORITY.**

---

## 25. Security / Hostile Audit

### Attack outcomes supported by current code

| Attack | Current result |
|---|---|
| Forged client actor/tenant/tally/status on governance routes | Rejected or server-derived |
| Forged governance outcome | Outcome recomputed from ballots |
| Cross-tenant HCM/entity ID | Generally non-enumerating; HCM and tax seams strengthened in this audit |
| Foreign tax legal entity | Rejected after audit fix |
| Future/expired tax strategy | `UNDER_REVIEW`, no benefit, after audit fix |
| Future emergency grant | Rejected after audit fix by `activated_at <= now` |
| Emergency grant from another tenant | Excluded after audit fix by tenant equality |
| Unknown capability | Denied |
| Empty capability requirement | Denied |
| Pending/unprovenanced authority | Denied |
| Derived FX from balances | Explicit fabrication error |
| Synthetic → production promotion | Denied |
| Journal unbalanced/negative/sided incorrectly | Application + DB controls |
| Journal UPDATE/DELETE/TRUNCATE | DB triggers, assuming non-superuser and installed migrations |
| Duplicate resolution voting | Unique ballot key/upsert and transaction lock |
| AI direct financial mutation | No write path; constitutional policy denies |

### Valid attacks that do not yet have a proven fail-closed result

1. **Pooled RLS connection context** can be stale or absent across pool connections.
2. **Concurrent MFA/TOTP or recovery-code login** can pass the same one-time credential before
   `mfaLastAcceptedStep`/recovery hashes are atomically claimed.
3. **Duplicate `users.party_id`** can create two login identities before a graph consumer detects
   the conflict.
4. **DB-level role/grant injection** is not prevented by PostgreSQL roles/GRANTs in the repo and
   runtime permission source is not DB-authoritative.
5. **Migration 0001 audit deletion** destroys prior history during an upgrade.
6. **Raw SQL cross-tenant/entity rows** are not comprehensively blocked by composite constraints.
7. **Audit/event forged metadata** is not fully covered by the chain payload.
8. **CSRF/origin checks** are absent as explicit controls. SameSite=Lax mitigates ordinary browser
   cross-site POST behavior, but there is no independent Origin/Referer or CSRF-token gate.
9. **Forwarded IP trust** is unconditional; a client can spoof `x-forwarded-for` when deployed
   without a trusted overwriting proxy and evade the in-memory login rate key.
10. **Dependency advisories** remain: current `npm audit --omit=dev` reported 8 vulnerabilities
    (3 moderate, 4 high, 1 critical), including Next.js 16.2.6/PostCSS/sharp production paths and
    Vitest/Vite development paths. This audit did not run an unreviewed force upgrade.

**Hostile-audit conclusion: PARTIAL, not proven secure.** The RED gate is warranted by the
unresolved items above, not by missing authority alone.

---

## 26. Fault Injection

### Controls independently exercised or statically reviewed

- Unknown capability denial.
- Empty required-decision denial.
- Activated capability with pending decisions denial.
- Authority date/expiry/supersession/revocation pure evaluations.
- Policy conflict/no-winner pure evaluations.
- Synthetic and illegal epistemic promotions.
- FX fabrication attempt.
- Workflow unknown state, illegal transition, missing trace and SoD.
- HCM self-manager, cycles, invalid dates and cross-scope manager.
- Governance lifecycle forgery fields and computed decision outcome.
- HCM/tax entity scope seams fixed in code.
- Missing authority metadata on activated decision now has a DB integration regression.

### Vacuous-pass findings

- Most database hostile tests did not execute here because imports failed without `DATABASE_URL`.
- HTTP suites use `describe.skipIf(!available)`, so they are not evidence when no server exists.
- Source-text assertions exist in the test suite; those prove text shape, not runtime behavior.
- Existing phase reports with large pass counts cannot substitute for a reproducible run against
  this checkout and its current database.
- The architecture registries contain hand-authored evidence booleans and historical “complete”
  rows; the new report does not treat those as proof where current code/database evidence is
  missing.

**Status: BLOCKED for full fault-injection proof.**

---

## 27. Database / Migrations

### Good controls

- Migration checksums are recorded and drift is rejected.
- Migration application is advisory-lock serialized and transactional per file.
- Clean schema has explicit constraints for journal integrity, policy windows, provenance FKs,
  periods and audit append-only behavior.
- No migration was added merely to satisfy this report.

### Findings

1. `0001` is destructive on upgrade as described in §19. This is the highest migration risk.
2. `0004_governance_decision.sql` is empty but recorded in migration metadata. This is not itself
   a defect, but migration count claims must count it consistently.
3. Drizzle snapshots mark RLS disabled in metadata snapshots even though raw migrations add RLS;
   actual database state, not snapshots, must resolve that parity question.
4. No database roles/permissions are authored. Application DB credentials therefore determine
   whether the connection user can bypass or alter controls.
5. RLS is partial and request context is not connection-pinned.
6. Composite tenant/entity constraints are absent across much of the schema.
7. `users.party_id` uniqueness is absent.

### Required database work before any execution

Run an isolated, authorized PostgreSQL baseline capture; compare clean install and upgrade from an
existing candidate; inspect `pg_roles`, ACLs, RLS, triggers, constraints, extensions and checksums;
scan duplicate users and cross-tenant/entity rows; archive before changing any historical migration
behavior. Do not run seed or destructive migration statements against a production database as
part of this audit.

**Status: BLOCKED.**

---

## 28. Duplicate Architecture Scan

| Concern | Implementations found | Classification |
|---|---|---|
| Identity | `parties/users/employees` + `lib/identity.ts` | Legitimate projection/resolver; no second store |
| Employee master | `employees` plus HCM read/observe services | Legitimate canonical store + adapters |
| Governance | `governance.ts`, `governance-vote-service.ts`, `governance-authorization.ts`, reserved-matter parser | Legitimate composed services over one schema; no parallel state authority found |
| Authority | `decision-authority.ts` + `authority/service.ts` + pure `authority/engines.ts` | Legitimate composition; scoped gate delegates to original gate |
| Permissions | TS `ROLES/PERMISSIONS` + DB `roles/permissions/role_permissions` | **Architectural duplication**; H-01 remains open |
| Capability | DB capability registry + TypeScript Finance/specialist descriptors | Registry plus code descriptors; not a second execution gate, but parity should be checked |
| Workflow | persisted governance definitions + `finance/workflow.ts` pure evaluator | Legitimate definition/evaluator split; no durable second executor |
| Audit | `lib/audit.ts` writers + specialist audit readers/intelligence | Legitimate writer/consumer split |
| Events | `enterprise_events` + event append functions | One event truth; no broker/second bus |
| Lineage | financial lineage + specialist provenance fields | Partial adapter pattern, not a second financial truth store |
| Financial truth | `FINANCIAL_TRUTH` code registry + DB `source_of_truth` metadata | Two metadata registries; neither stores financial balances. Requires ownership clarification |
| Tax truth | `tax.ts`, specialist tax intelligence, tax tables | Legitimate capability/service layering; no tax liability writer |
| AI identity | `NOELIA_IDENTITY`, Noelia service, `ai_decisions` | One AI identity; HIVE is runtime label |
| Sector control plane | `os_registry` records and Foundation page | No competing Sector Control Plane found |

No duplicate engine was created by this audit. The permission catalogue split is the one clear
architectural duplication requiring a future authorized cutover.

---

## 29. Production Completeness Matrix

The machine-readable matrix is committed at:

- `docs/audit/main-architecture-matrix.json`

It uses only the permitted readiness vocabulary:

`READY`, `PARTIAL`, `BLOCKED`, `REQUIRES_AUTHORITY`, `DATA_NOT_AVAILABLE`, `NOT_AVAILABLE`.

The matrix intentionally distinguishes “a primitive exists” from “the capability is complete,
secure, authority-backed and production-ready.” It records `DATA_NOT_AVAILABLE` for test/database
columns where the sandbox could not connect to PostgreSQL rather than converting absence into a
pass.

Headline matrix results:

| Capability | Exists | Complete | Tests | Security | Authority | Production Ready | Blocker |
|---|---|---|---|---|---|---|---|
| Constitutional control plane | READY | PARTIAL | PARTIAL | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY | Provenance/ratification and DB evidence |
| Identity / GlobalUserID | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | PARTIAL | BLOCKED | No durable users.party_id uniqueness |
| HCM master/consumption | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY | Writes intentionally blocked |
| Governance lifecycle | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY | No ratified execution authority |
| Authority/capability gate | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY | All seed authority is pending/locked |
| Permission model | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | PARTIAL | BLOCKED | TS/DB dual catalogue |
| Tenant isolation | READY | PARTIAL | DATA_NOT_AVAILABLE | BLOCKED | PARTIAL | BLOCKED | Pooled RLS context not pinned |
| Entity isolation | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | PARTIAL | BLOCKED | Missing broad composite DB constraints |
| Finance OS / ledger | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY | No ratified accounting authority |
| Treasury | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | DATA_NOT_AVAILABLE | DATA_NOT_AVAILABLE | Live positions not available |
| Tax | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY | No authoritative treatment/liability |
| Legal | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY | Human legal interpretation required |
| Audit | READY | PARTIAL | DATA_NOT_AVAILABLE | BLOCKED | PARTIAL | BLOCKED | Destructive migration and incomplete hash coverage |
| Events/trace | READY | PARTIAL | DATA_NOT_AVAILABLE | BLOCKED | PARTIAL | BLOCKED | Non-atomic route pairs and optional trace |
| Lineage | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | PARTIAL | BLOCKED | Not universal/persisted |
| Workflow | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY | No persisted executor |
| HIVE/Noelia | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY | No review disposition or authoritative action |
| Sector OS consumption | PARTIAL | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | NOT_AVAILABLE | Sector implementations absent |
| PostgreSQL/migration parity | READY | PARTIAL | DATA_NOT_AVAILABLE | BLOCKED | PARTIAL | BLOCKED | No live PostgreSQL baseline |

---

## 30. Genuine Gaps

### Architectural gaps

- Permission source-of-truth duplication: TS constants versus DB catalogue.
- No universal persisted lineage/trace contract for every material output.
- No actual Sector OS implementation in this repository, only registration/consumption seams.
- No durable, governed activation transition service for the decision registry.

### Engineering gaps

- Pooled RLS context is not connection-pinned or transaction-local.
- Migration `0001` can truncate audit/event history on upgrade.
- MFA/TOTP/recovery-code acceptance is not atomically claimed under a row lock/conditional update.
- `users.party_id` is not durably unique.
- Entity/tenant relationships are not broadly enforced with composite database constraints.
- Audit/event payloads and trace requirements are incomplete.
- Tax/waterfall audit and event appends are not one transaction.
- Explicit CSRF/origin validation is absent.
- Dependencies have current advisories.

### Data gaps

Cannot be asserted without the live database:

- current fingerprint, migration rows, triggers, RLS and ACLs;
- duplicate users/parties;
- cross-tenant/entity rows;
- decision/capability status counts;
- policy provenance counts;
- treasury attribution conflicts;
- ledger/period/funded counts;
- seed parity and clean-install parity.

### Authority gaps

- Accounting policy and financial execution authority.
- Capital execution/funding authority.
- Tax treatment/liability authority.
- Legal interpretation authority.
- Policy provenance/ratification and policy lifecycle decisions.
- Final activation/permission cutover authority.

---

## 31. Authority Blockers

The correct behavior is refusal, not invented policy:

1. Accounting recognition, measurement, fiscal periods, chart of accounts, posting controls,
   capital accounting, intercompany and opening balances remain P1–P11/C decisions.
2. `CAP_POSTING`, `CAP_CAPITAL_ACCOUNTING`, `CAP_TREASURY_SETTLEMENT`, `CAP_VAT`, `CAP_FX` and
   related execution capabilities must remain locked until genuine ratification, effective dating,
   evidence, scope, activation and principal permission are all proven.
3. Active seed policies without approving resolution provenance remain an explicit C-1 blocker.
4. Tax strategy output remains candidate intelligence; it must not become liability or a journal.
5. Legal conclusions remain human-review/authority boundaries.
6. No AI output may activate authority, approve a resolution or write authoritative financial state.

No authority was invented or coded around.

---

## 32. Engineering Blockers

These are genuine engineering/security blockers and not authority decisions:

| ID | Symptom → root cause | Minimum safe direction |
|---|---|---|
| E-01 | RLS appears enabled but pool session context is not pinned → request context can be stale/absent | Introduce a single transaction/connection-scoped request DB context for all RLS-protected work, or remove the claim that RLS is request enforcement until this is proven |
| E-02 | Audit upgrade can erase history → destructive statements embedded in `0001` | Preserve migration immutability; block unsafe upgrade mode and require an explicit archival/repair procedure before hardening. Never silently truncate |
| E-03 | One-time MFA can replay concurrently → verify and update are separate operations | Row-lock or atomically condition the accepted-step/recovery-code claim and test concurrent login attempts |
| E-04 | One party can have multiple login IDs → no `users.party_id` unique constraint | Scan/resolve existing duplicates under governance, then add the minimum unique constraint and retain graph conflict detection |
| E-05 | Permission truth can drift → runtime and DB catalogues both exist | Authorized DB-backed or code-backed cutover, one source only, with parity and rollback evidence |
| E-06 | Material operation can lack full trace → optional trace fields and standalone audit/event writes | Make trace required in the shared governed-operation contract and use `withAuditTransaction()` for governed route pairs |
| E-07 | Current dependency advisories → pinned vulnerable versions | Review and upgrade direct dependencies with lockfile/build/security regression validation; no force upgrade during an audit |

---

## 33. Data Blockers

The audit cannot classify the following as clean, complete or production-ready until a supported
PostgreSQL runtime is made available:

- actual applied migrations/checksums and schema fingerprint;
- actual role/ACL/RLS/trigger state;
- seed record counts and content parity;
- policy provenance and resolution provenance;
- decision/capability activation state;
- duplicate identity scan;
- cross-tenant/entity consistency scan;
- treasury attribution and stale-data scan;
- ledger, period, journal, funded-capital and financial mutation counts;
- clean-install and upgrade-from-candidate parity;
- full database and HTTP test execution.

`DATA_NOT_AVAILABLE` is the correct result. It must not be turned into zero or a passing test.

---

## 34. Minimum-Change Remediation

### Completed during this audit

1. **Tax entity IDOR**
   - Symptom: tax API loaded any legal entity by ID.
   - Cause: no tenant/entity scope predicate.
   - Systemic cause: relying on RLS/route guard rather than binding client-selected entity to scope.
   - Root cause: the endpoint treated entity lookup as reference data.
   - Fix: scope legal entity query through `tenantScopeIds()` and entity scope; return non-enumerating
     404.
   - Regression: code path now rejects foreign entity; live HTTP proof remains pending DB/server.

2. **HCM foreign employing-entity admission**
   - Symptom: employee query used employee-tenant OR legal-entity-tenant.
   - Cause: shared HCM storage and sector consumption were combined with an unsafe OR.
   - Fix: legal-entity tenant is the mandatory boundary; shared group-held HCM remains consumable by
     enterprise scope.
   - Regression: existing HCM architecture tests remain type-valid; live tenant test unavailable.

3. **Noelia knowledge leakage/stale authority**
   - Symptom: global knowledge retrieval/UI did not enforce source clearance or effective/review
     window.
   - Fix: filter by clearance, `AUTHORITATIVE`, effective date, review date and expiry.
   - Regression: implemented in `noelia.ts` and Noelia page; live clearance proof unavailable.

4. **Tax future/stale strategy use**
   - Symptom: future effective or post-review strategies could be evaluated as current.
   - Fix: explicit ISO date validation and temporal authority gate.
   - Regression: added to `tests/engines.test.ts`.

5. **Emergency grant activation/tenant scope**
   - Symptom: future grants and grants from another tenant were eligible by user ID alone.
   - Fix: `activated_at <= now`, `expires_at >= now`, `revoked_at IS NULL` and exact tenant binding.
   - Regression: requires live authz/DB execution; no DB available.

6. **Authority/capability metadata bypass**
   - Symptom: an activated decision could pass with missing scope/conditions/issuer metadata if it
     cited an approved governed resolution.
   - Fix: fail closed on required metadata, future approval dates and missing execution permission.
   - Regression: added activation-gate integration test and updated positive fixture metadata.

7. **Cross-tenant reserved-matter influence**
   - Symptom: competence helpers scanned all governance bodies.
   - Fix: pass principal-resolved tenant scope into both reserved-matter queries.
   - Regression: live DB test still pending.

### Not changed

- No migration was added.
- No role/permission cutover was attempted.
- No audit history was touched.
- No financial or governance state was mutated.
- No legal/tax/accounting policy was invented.
- No duplicate engine or Sector Control Plane was created.

---

## 35. BEFORE → AFTER

### Material state

| State | Before | After |
|---|---|---|
| PostgreSQL connection | DATA_NOT_AVAILABLE | DATA_NOT_AVAILABLE |
| Database fingerprint | NOT CAPTURED | NOT CAPTURED |
| Applied migrations | NOT CAPTURED | NOT CAPTURED |
| Tenants/entities/governance/authority | NOT CAPTURED | NOT CAPTURED |
| Ledger/journals/periods/funded capital | NOT CAPTURED | NOT CAPTURED |
| Seed execution | not run | not run |
| Migration execution | not run | not run |
| Financial mutation | none performed | none performed |
| Governance ratification/activation | none performed | none performed |

The audit did not have a database against which to assert equality, so it does not falsely claim a
fingerprint match. It did not perform any operation that could mutate the absent database.

### Code state

Code-only audit remediations are recorded in the current patch and do not constitute activation,
ratification or financial mutation. `node_modules` and `.next` are ignored and were not added to
Git.

---

## 36. Full Validation

### Passed in this sandbox

- `npm ci` completed from the committed lockfile.
- `npm run typecheck` passed after the audit edits.
- `npm run lint` passed after the audit edits.
- `DATABASE_URL=postgresql://...@127.0.0.1:1/... npm run build` passed when a nonempty build-time
  URL was supplied; no connection was made. Without `DATABASE_URL`, build correctly fails at DB
  module import because the application requires PostgreSQL.
- Pure/DB-independent subset selected by execution: **6 test files, 64 tests passed**.

### Failed or unavailable

- `npm test` with no `DATABASE_URL`: **47 test files failed collection**, **6 files passed**,
  **64 tests passed**. Failures were `DATABASE_URL is required`, not skipped tests.
- The full test suite therefore did not pass.
- HTTP tests could not be run because no application server and no database were available.
- HTTP test files contain `describe.skipIf(!available)` and must not be counted as passing when no
  server is reachable.
- `npm run migrate` with a deliberately non-routable probe URL failed closed with
  `ECONNREFUSED`; no migration ran.
- `scripts/verify.mjs` was not reported as a pass because its database-dependent migration/full
  suite steps cannot execute here.
- `npm audit --omit=dev` reported **8 vulnerabilities: 3 moderate, 4 high, 1 critical** on the
  installed dependency tree. No automatic `--force` remediation was applied.

**Full-validation status: BLOCKED. Zero-skipped requirement: NOT SATISFIED.**

---

## 37. Final Gate

# 🔴 RED

GREEN is unavailable because:

- complete tests did not execute;
- zero-skipped validation was not achieved;
- live PostgreSQL, clean-install parity and migration parity were unavailable;
- production authority is not ratified;
- audit migration history can be truncated on upgrade;
- RLS request context is not reliably connection-scoped;
- MFA replay and identity uniqueness are not durably closed;
- permission source-of-truth is duplicated;
- audit/event trace and metadata coverage are incomplete;
- dependency advisories remain.

This is not a conclusion that the whole architecture must be rebuilt. The canonical equation is
still visible in the code:

```text
constitutional control plane
+ enterprise operating kernel
+ governed intelligence layer
```

The RED decision means that production execution and trust claims must stop until the specific
integrity/security blockers are closed and proven. It does **not** authorize inventing accounting,
tax, legal or governance policy.

---

## 38. Recommended Next Build

Do not start another broad specialist phase and do not rebuild HCM, Finance OS, Governance,
identity, audit, events or Noelia.

The next work should be a tightly bounded **integrity/security remediation and evidence gate**:

1. Provide an authorized supported PostgreSQL runtime and capture the immutable baseline without
   Supabase.
2. Resolve/scan duplicate identities and cross-tenant/entity records before any constraint change.
3. Make RLS context transaction/connection-safe or formally remove it as a claimed request control.
4. Replace the destructive migration path with a safe, immutable upgrade procedure that cannot
   delete audit/event history.
5. Atomically claim TOTP/recovery credentials and test concurrent replay.
6. Choose one permission source of truth and execute a separately authorized cutover.
7. Make audit/event trace fields and route pairing mandatory where the operation is governed.
8. Review and upgrade vulnerable dependencies.
9. Run clean-install, upgrade, database, hostile, fault-injection, HTTP and deterministic second
   runs with **zero skipped**.
10. Only after the RED engineering findings are closed should the authorized human governance path
    consider ratifying any P1–P11/C decisions. Until then all financial, tax, capital, legal and
    policy-dependent execution remains correctly blocked.

The audit answer to “what is actually missing?” is therefore:

> The canonical substrate is present, but production proof and several security/integrity controls
> are still genuinely missing. The correct response is minimum-change remediation and evidence,
> not a restart, duplicate engine or invented authority.
