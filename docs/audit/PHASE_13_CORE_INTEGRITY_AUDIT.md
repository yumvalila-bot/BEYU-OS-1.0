# PHASE 13 — BEYU OS CURRENT-MAIN CORE INTEGRITY AUDIT & REMEDIATION

**Audit date:** 2026-08-23  
**Repository:** `yumvalila-bot/BEYU-OS-1.0`  
**Phase baseline:** `a8472078bc32984728b954a25dad89082a05158a`  
**Main baseline:** `8516162052a59ad7f538d78cfb7539fcb2f97c40`  
**Branch:** `arena/01a02d6d-beyu-os-1-0`  
**Supabase:** explicitly excluded and not used.

This is a platform-level reconciliation of the current implementation. Previous audit reports were
used only as historical leads. Source code, migration SQL, tests and available runtime evidence
determined the findings.

## Executive result

The canonical architecture remains visible and internally coherent at the design level:

```text
BEYU OS
= constitutional control plane
+ enterprise operating kernel
+ governed intelligence layer
```

The checkout has one party/user identity model, one HCM employee table, one governance substrate,
one composed authority/capability gate, one live permission catalogue, one audit writer, one event
writer, Finance OS as the financial truth boundary, one workflow evaluator, one financial lineage
primitive and one Noelia identity label on HIVE.

This phase closed genuine platform gaps without creating another specialist or control plane:

- MFA/TOTP/recovery-code consumption is now row-locked and atomic.
- The tax and waterfall audit/event pair is now committed atomically.
- The scoped authority gate now resolves enterprise principals against their explicit tenant
  subtree and verifies the target legal entity, rather than requiring exact tenant equality.
- Migration `0001` is refused against an existing schema by the supported migration runner because
  its historical audit/event `TRUNCATE` statements are destructive.
- `users.party_id` now has a forward unique-index migration, preserving the one-GlobalUserID rule.
- The evidence script no longer truncates the constitutional audit ledger.
- Identity database regression coverage checks the new unique index.

The database itself is still unavailable in this sandbox. PostgreSQL installation was attempted via
APT but package repositories were unreachable. No database, financial state or governance state was
mutated.

**Final gate: 🔴 RED.** This is required by the user's gate rule because live database validation,
zero-skipped full testing and RLS isolation proof remain unavailable, and unresolved RLS/hash/rate
limit/dependency risks remain. Authority-only absence would be YELLOW; this result is RED because
core integrity controls are not fully proven.

---

## 1. Baseline

### Git baseline before Phase 13 edits

The working tree initially contained the previous audit's uncommitted patch while the local branch
ref was still at `8516162`. The remote fixed branch resolved to `a8472078...`. This was safely
reconciled before Phase 13 work:

1. `git fetch origin arena/01a02d6d-beyu-os-1-0` retrieved the already-pushed audit commit.
2. The existing working tree and untracked audit artifacts were compared to that commit.
3. The prior work was placed in a Git stash before ref recovery.
4. The branch was reset only to the already-verified prior audit commit; no work was discarded.
5. The resulting branch was `a8472078...`, one commit ahead of `origin/main`.

| Check | Result |
|---|---|
| Branch | `arena/01a02d6d-beyu-os-1-0` |
| Phase baseline HEAD | `a8472078bc32984728b954a25dad89082a05158a` |
| `origin/main` | `8516162052a59ad7f538d78cfb7539fcb2f97c40` |
| Phase branch vs main | 1 commit ahead, 0 behind |
| Remote Phase branch | `a8472078bc32984728b954a25dad89082a05158a` |
| PR for Phase branch | none found by `gh pr list` |
| Tags | none |
| Re-clone in Phase 13 | no; local ref recovery only |
| Working tree after recovery | clean |

No branch other than the fixed Arena branch was created or checked out. The previous audit stash
was retained while recovery was verified; the commit already contains the same files.

### Safety boundary

No `npm run migrate`, `npm run seed`, application server, database write, journal post, treasury
settlement, capital execution, policy ratification, authority activation or P1–P11 activation was
performed.

---

## 2. Current-main architecture inventory

### Repository implementation map

| Area | Current implementation | Phase 13 status |
|---|---|---|
| Identity | `src/db/schema/identity.ts`, `src/lib/identity.ts`, `session.ts`, `authz.ts`, MFA | PARTIAL |
| Governance | `governance.ts`, vote service, reserved matters, constitution, policy | PARTIAL |
| Authority | `decision-authority.ts`, `authority/model.ts`, `authority/engines.ts`, `authority/service.ts` | PARTIAL |
| HCM | `people.ts`, `hcm.ts`, `hcm-observe.ts`, HCM APIs | PARTIAL |
| Finance | `finance.ts`, posting, period, FX, intercompany, reporting, reconciliation, truth, lineage | PARTIAL |
| Tax | `tax.ts`, tax intelligence, tax API/UI | PARTIAL / REQUIRES_AUTHORITY for treatment |
| Legal | `assurance.ts` legal matters and document fields | PARTIAL / REQUIRES_AUTHORITY for interpretation |
| Security | authz, guard, session, MFA, API envelope, rate limiting, headers | PARTIAL |
| Audit | `audit_log`, hash chain, `src/lib/audit.ts` | PARTIAL |
| Events | `enterprise_events`, `publishEventTx()` | PARTIAL |
| Lineage | `src/lib/finance/lineage.ts`, specialist provenance | PARTIAL |
| Workflow | governance workflow schema plus `finance/workflow.ts` evaluator | PARTIAL |
| Noelia/HIVE | `src/lib/noelia.ts`, AI decision register, HIVE registry | PARTIAL |
| Compliance | assurance schema and `specialist/compliance` | PARTIAL |
| Risk | assurance schema and `specialist/risk` | PARTIAL |
| Sector integration | `os_registry`, Foundation surface, consumption seams | NOT_AVAILABLE |
| Workers/jobs | no worker or job implementation found | NOT_AVAILABLE |
| Integrations | registry schema only; no live connector executor | PARTIAL |
| Operations/DR | schema/docs only; no live infrastructure evidence | DATA_NOT_AVAILABLE |

### Static counts

- 75 Drizzle `pgTable` declarations in the current source schema.
- 72 baseline SQL tables in `0000`; two authority-registry tables are added by `0010`; the
  migration metadata table is created by the runner.
- 17 PostgreSQL enum declarations in the baseline SQL.
- 12 numbered migrations after this phase (`0000`–`0011`).
- 12 Drizzle snapshots (`0000`–`0011`) and migration journal entries.
- 15 API route handlers.
- 15 `/os` page components.
- 74 library TypeScript files.
- 53 test files; 47 import the database directly or through a helper.

No second employee master, financial ledger writer, enterprise event writer, audit writer or
Sector Control Plane was found.

---

## 3. Canonical reconciliation

| Canonical | Evidence | Status |
|---|---|---|
| One GlobalUserID | `users.id`, graph resolver, new `users_party_uidx` migration | PARTIAL until DB migration is applied and duplicate scan passes |
| One identity graph | party/user/employee resolver over existing tables | READY for the code path; live data unavailable |
| One HCM master | `employees` with unique `party_id` and HCM consumption API | PARTIAL because writes are not available |
| One governance plane | constitutional tables and shared governance services | PARTIAL; ratification/provenance not live-proven |
| One authority model | composed 6C + scoped authority service | PARTIAL; activation service and live state absent |
| One permission model | TS runtime catalogue; DB rows are a parity-checked derived mirror | PARTIAL; cutover/continuous enforcement is not proven |
| One policy/provenance model | `policies`, effective windows, decision registry | PARTIAL; C-1 policy provenance remains unresolved |
| One workflow primitive | `finance/workflow.ts` evaluator over persisted definitions | PARTIAL; no persisted executor |
| One audit | `lib/audit.ts` writer and `audit_log` | PARTIAL; historical SQL and hash coverage risks remain |
| One event model | `enterprise_events` and `publishEventTx` | PARTIAL; live integrity unavailable |
| One trace/correlation model | API trace IDs and audit/event trace fields | PARTIAL; fields are optional in parts of the contract |
| One lineage model | Finance lineage and specialist provenance | PARTIAL; not universal/persisted |
| One tenant model | tenant subtree helper and app predicates | PARTIAL; RLS context is unsafe under pooled concurrency |
| One legal-entity model | `legal_entities` and service checks | PARTIAL; broad composite DB constraints absent |
| One epistemic model | finance epistemics and adapters | PARTIAL; not universal in dashboards/AI outputs |
| One financial truth layer | journal ledger and financial truth registry | PARTIAL; execution authority absent |
| One capital allocation plane | Governance → capital prerequisite → Finance | PARTIAL; funding/execution absent |
| Tax family under canonical architecture | tax strategy/compliance/risk/governance capabilities | PARTIAL / REQUIRES_AUTHORITY |
| HCM first-class capability | shared HCM schema and API | PARTIAL / REQUIRES_AUTHORITY for writes |
| No specialist redefinition of governance | specialists consume shared platform | READY in code review |
| No AI self-authorization | Noelia inherits user; no authoritative AI writer | READY in code review |

Sector OSs are represented as registry/consumption boundaries only. The repository does not contain
actual Health, Agriculture, Finance or Foundation Sector OS applications. That is
`NOT_AVAILABLE`, not permission to create a competing control plane.

---

## 4. Identity

### Verified

- `users.id` remains the canonical GlobalUserID.
- `parties` remains the canonical MDM party table.
- `employees.party_id` links the one employee master to party identity.
- `src/lib/identity.ts` resolves party → user → employee → tenant → legal entity without creating
  another identity store.
- Duplicate user IDs for one party produce `DATA_CONFLICT` in graph resolution.
- HCM consumption returns `null` when a party has no login; it does not invent an ID.
- Session resolution checks active user/session, tenant and effective role assignments.
- Identity reads use non-enumerating missing/scope outcomes in the primary APIs.

### Phase 13 change

A duplicate-detection reader alone is not durable prevention because two duplicate users could
authenticate before a graph consumer reads them. The source model and resolver explicitly require
one GlobalUserID per party. A forward migration now adds:

```sql
CREATE UNIQUE INDEX "users_party_uidx" ON "users" USING btree ("party_id");
```

The migration intentionally fails if an existing database contains duplicates. It does not select a
winner, delete an identity or invent a shared-party exception. The identity data must be reconciled
explicitly before the constraint can succeed.

### Remaining identity findings

- The new index has not been applied or verified against a live database.
- `role_assignments.legal_entity_id` is not composite-keyed to its tenant.
- `role_assignments.granted_by` is free text and not foreign-keyed to a governed authority record.
- No role-grant/revoke API, password-change API or MFA enrollment API exists.
- `passwordMustChange` is returned after login but is not enforced by a password-change flow.

**Status: PARTIAL; live identity validation: DATA_NOT_AVAILABLE.**

---

## 5. Governance

### Verified in code

- Governance remains above Finance, HCM, Tax, Legal and Sector OSs.
- Constitution, bodies, reserved matters, resolutions, voting and decisions are in one governance
  substrate.
- Client input cannot set actor, tenant, reference, status, tally or final decision.
- Tabling and decision closure require presiding seats.
- Votes require an active voting seat and separate vote permission.
- Voting and decision closure are separate actions.
- Ties do not receive an invented chair tie-break.
- Governance mutations use `withAuditTransaction()`.
- Reserved matter parsing fails closed when the persisted matter is unreadable.

### Phase 13 change

Reserved-matter competence now accepts the principal's resolved tenant scope. It no longer lets an
unrelated tenant's governance body influence or appear in the competence result. This reused the
existing reserved-matter engine; no governance engine was added.

### Remaining findings

- There is no governed registry activation API.
- Governance registry issuer, decision-maker, scope, conditions and evidence remain nullable/free
  text; relational proof to a member, body or document is incomplete.
- Delegation and persisted workflow instances are schema-only/dead runtime surfaces.
- Seeded final-looking resolutions are not evidence of governed runtime decisions.
- The live governance body/resolution/policy state could not be fingerprinted.

**Status: PARTIAL; authority-dependent execution: REQUIRES_AUTHORITY.**

---

## 6. Authority

### Chain

```text
AUTHORITY
→ POLICY
→ DECISION
→ CAPABILITY
→ PERMISSION
→ SERVICE
→ EXECUTION
→ AUDIT
→ EVENT
→ TRACE
```

The chain is represented by the existing registry and composed services. `checkScopedCapability()`
does not replace the 6C activation gate; it adds tenant/entity/principal scope and delegates to the
existing decision gate.

### Positive controls

- Unknown capabilities deny.
- Empty capability dependency lists do not become a free pass.
- Only `ACTIVATED` is executable.
- Pending, future, expired, superseded, revoked, suspended and unprovenanced authority denies.
- Authority metadata requirements were strengthened in the previous audit and remain present.
- Missing execution permission is `AUTHORITY_CHAIN_INCOMPLETE`.
- An enterprise principal is resolved against its explicit tenant subtree, not exact tenant string
  equality. This preserves the canonical group → country → sector hierarchy while still denying an
  unrelated tenant.
- A non-null target legal entity is now re-read and must belong to the requested tenant and resolved
  principal scope.

### Remaining findings

- No governed service transitions a decision through ratification/activation.
- `evaluateAuthority()` remains a generic pure evaluator and does not itself enforce the runtime
  `GOVERNED_AUTHORITY` class; its callers must bind that boundary.
- Free-text authority metadata is not checked against actual body/member identity.
- The live decision/capability registry could not be verified; the intended seed state is
  PENDING/LOCKED but was not treated as current fact.

**Status: PARTIAL; production authority: REQUIRES_AUTHORITY.**

---

## 7. HCM

HCM remains the canonical workforce master and no Sector employee store was found.

```text
GlobalUserID
→ party
→ employee
→ employment events
→ position/org unit
→ employing legal entity
→ tenant scope
→ Sector OS consumption
```

The code protects compensation with classification clearance, exposes GlobalUserID through the HCM
read API, distinguishes current/historical/future/expired/terminated employment, checks manager
cycles and scope, and returns `REQUIRES_AUTHORITY` without writing for lifecycle changes.

The previous HCM scope remediation remains in place: HCM uses the employing legal entity's tenant
as the mandatory visible boundary while allowing legitimate group-held shared HCM records to be
consumed by enterprise scope. There is no second HCM master.

No create/update/terminate API, payroll connector or governed HCM write workflow exists.

**Status: PARTIAL; lifecycle writes: REQUIRES_AUTHORITY.**

---

## 8. Finance

Finance OS remains a first-class domain, not a control-plane competitor:

| BEYU OS owns | Finance OS owns |
|---|---|
| Constitution and governance | Financial truth |
| Authority and capability activation | Ledger and journal posting boundary |
| Strategic governance and capital authorization | Reporting, treasury observations and controls |
| Enterprise identity/tenant/security | Financial lineage/reconciliation rails |

`postJournal()` is the only application writer found for journal entries and lines. The service
performs capability, RBAC, tenant, entity, account, period, structural-balance, idempotency and
atomic audit/event checks. Database migrations add balance, side, immutability, period and journal
scope controls.

No journal, account, period, funded capital or treasury settlement was created in Phase 13. No P1–P11
capability was activated.

Policy-dependent recognition, measurement, tax treatment, chart of accounts, fiscal calendar,
opening balances, consolidation and capital accounting remain unimplemented or authority-blocked.
AR/AP/fixed assets/inventory have no substrate and are `NOT_AVAILABLE`, not stubbed.

**Status: PARTIAL; execution: REQUIRES_AUTHORITY.**

---

## 9. Tax

The previous tax remediation remains intact:

- Entity lookup is tenant/entity scoped and returns non-enumerating 404 for a hidden entity.
- Strategy effective date, review date and expiry are checked.
- Jurisdiction mismatch is rejected.
- `PROHIBITED_EVASION` is hard-blocked with null estimated benefit.
- Tax output is candidate intelligence, not a liability or accounting treatment.
- No tax execution writer or authority activation exists.

Tax assessment remains ephemeral. It is not written to `tax_strategy_assessments` and has no human
review/disposition endpoint. No accounting or legal judgment was added.

**Status: PARTIAL; authoritative tax treatment: REQUIRES_AUTHORITY.**

---

## 10. Legal

The implementation contains legal matter/document/evidence storage and display, jurisdiction,
exposure and deadline fields, retention/legal-hold fields and regulatory change watch records.

It does not implement legal interpretation, binding legal advice, automated law adoption or
unreviewed legal conclusions. Those remain `REQUIRES_AUTHORITY` / `REQUIRES_HUMAN_REVIEW`.

**Verified-no-change area:** no legal engine was built merely to fill a matrix.

**Status: PARTIAL.**

---

## 11. Noelia/HIVE

Noelia remains the one AI identity and HIVE remains a runtime label. The implementation:

- inherits the human principal's permission, tenant, entity and clearance;
- evaluates policy with `aiInitiated: true`;
- persists AI decisions with model/prompt versions, source references, output class, confidence,
  denied scopes and human-review flags;
- writes audit/event records atomically;
- has no financial posting, ownership mutation, beneficiary mutation or governance approval path;
- uses deterministic SQL analysis and labels rather than an external LLM/tool runner.

The previous clearance/temporal knowledge filtering remediation remains intact in both retrieval and
the page. Sources must be within clearance, `AUTHORITATIVE`, effective, within review date and
unexpired.

Remaining gaps are the absent review/dispose workflow, non-ranked regex retrieval and some
aggregate output paths that need a stronger `DATA_NOT_AVAILABLE` representation when inputs are
absent.

**Status: PARTIAL; authoritative AI action: REQUIRES_AUTHORITY.**

---

## 12. RLS / tenant isolation

### Established mechanism

- `tenantScopeIds()` returns a sector principal's own tenant or an enterprise role's explicit
  descendant subtree.
- `guarded()` and `requirePrincipal()` call `setDatabaseTenantContext()`.
- The SQL migrations define `beyu_tenant_ids()` and `beyu_global_scope()` and enable/force RLS on
  11 selected tenant tables.
- Application queries generally add `inArray(...tenantId, scope)` predicates.
- Governance child tables derive scope through their parent resolution/body.

### Hostile result

`setDatabaseTenantContext()` calls `db.execute()` twice against a module-level `pg.Pool` using
session-level `set_config(..., false)`. There is no connection pinning, no transaction-local
`SET LOCAL`, no reset in `finally`, and no request-scoped DB handle. The next query can use another
pool connection. A reused connection can retain another request's IDs/global flag.

The vulnerable sequence is:

```text
request A sets GUC on connection 1
connection 1 returns to pool
request B sets part/all of GUC on connection 2
request B query runs on connection 1 or another stale connection
```

This affects server pages, API handlers, AI queries and any code using the shared pool. No worker
processes or background jobs were found, but the absence of workers does not solve concurrent HTTP
requests or replicas. Exceptions and rollback do not reset a session-level GUC.

Application predicates reduce current exposure, but they do not make the declared RLS defense
reliable. A session with stale `beyu.global_scope=on` is especially dangerous for queries that do
not independently scope reference/entity data.

**Status: PARTIAL implementation, DATA_NOT_AVAILABLE live proof, security blocker unresolved.**

### Minimum remediation direction

Build one request-scoped database context: connection-pinned or transaction-local, used by the
shared guard and all downstream services. Do not add tenant filters independently inside Finance,
HCM, Tax or specialists. The final control must be proven with A→B, B→A, error, rollback, timeout,
nested and concurrent request tests.

---

## 13. MFA security

### Previous state

The old login path read `mfaLastAcceptedStep`/recovery hashes, verified them and updated the row in
separate operations. Two parallel requests could both observe the same unconsumed credential.

### Phase 13 remediation

The MFA portion of login now runs in a transaction with `SELECT ... FOR UPDATE` on the user row.
The locked current row is used for TOTP verification, recovery-code consumption, failure counter
updates and state clearing. MFA failure audit records are in the same transaction. The existing
identity path and TOTP implementation are reused; no second authentication system was introduced.

### Remaining auth findings

- The full concurrent HTTP test was not run because no database/server was available.
- Invalid-password account lockout still reads `failedAttempts` before updating it, so concurrent
  failures can lose increments; this is separate from the fixed MFA one-time credential race.
- Recovery/TOTP secrets are protected at rest, but production key rotation/secret management is
  infrastructure rather than repository evidence.
- Login rate limiting is in-process and keyed by an untrusted `x-forwarded-for` value unless a
  trusted proxy overwrites it.
- `passwordMustChange` is not enforced through a change-password flow.

**Status: PARTIAL; concurrency proof: DATA_NOT_AVAILABLE.**

---

## 14. Permission architecture

### Classification

| Source | Classification | Influences runtime authorization? |
|---|---|---|
| `src/lib/constants.ts` `PERMISSIONS`/`ROLES` | AUTHORITATIVE runtime catalogue | Yes |
| DB `permissions` | DERIVED/REFERENCE mirror seeded from constants | No direct runtime read |
| DB `role_permissions` | DERIVED/REFERENCE mirror and parity evidence | No direct runtime read |
| Specialist permission strings | Consumer references to canonical codes | Not a catalogue |
| Capability `execution_permission` | Authority-chain binding metadata | Not a grant by itself |

`permissionsForRoles()` reads TypeScript role definitions. `assertPermissionCatalogParity()` compares
the DB mirror to those definitions. Therefore there is one live permission source today, but the DB
mirror can drift without failing a normal request; parity is not a continuous runtime gate.

This is a latent security/configuration risk, not a reason to create a second authorization engine.
The minimum future fix is one authorized catalogue cutover or a fail-closed parity deployment gate,
with role grant/revoke, MFA metadata and rollback proof.

**Status: PARTIAL.**

---

## 15. Audit immutability

### Current controls

- `recordAuditTx()` and `publishEventTx()` are the only application append writers found.
- Chain heads are locked inside transactions.
- Partial unique parent-hash indexes reject forks.
- UPDATE/DELETE triggers protect audit and events.
- Migration `0008` adds statement-level TRUNCATE triggers.
- Governance, capital, Noelia and specialist mutations use a shared atomic transaction.

### Historical migration finding

`0001_kernel_gate1_hardening.sql` contains candidate-sandbox:

```sql
TRUNCATE TABLE audit_log;
TRUNCATE TABLE enterprise_events;
UPDATE audit_chain_heads SET current_hash = null ...;
```

The later TRUNCATE trigger does not protect a database before/while `0001` runs because the
migration intentionally truncates before installing the guard. This was executable destructive
behavior, not merely a comment defect.

### Phase 13 remediation

The supported `scripts/migrate.ts` runner now refuses `0001_kernel_gate1_hardening` when the schema
is non-empty. Clean installs have no history to destroy, so `0001` can still run in the clean
bootstrap sequence. Existing schema upgrades require an explicit archival/reconciliation procedure
outside the ordinary runner. The historical SQL was not rewritten, preserving checksum history.

`scripts/evidence/kernel-gate1.ts` also no longer truncates `audit_log`; it appends to an isolated
evidence database and compares before/after chain length. The test-only reset helper still disables
TRUNCATE guards for test cleanup; it must only ever be used against a disposable test database and
was not executed here.

### Remaining findings

- Direct execution of historical SQL outside the supported runner can still be destructive.
- Hash payloads do not cover reason, authority, approval reference, policy version, AI version,
  trace ID, IP or user-agent metadata. Changing those fields through a privileged DB bypass would
  not be detected by current hash recomputation.
- Audit actor/tenant fields are not fully foreign-keyed.
- Live trigger/RLS/ACL state was not verified.

**Status: PARTIAL; historical integrity proof: DATA_NOT_AVAILABLE.**

---

## 16. Trace / lineage integrity

### Trace

API responses include `x-trace-id`; governed mutation services generally pass the same value to
both audit and event. The pure workflow/specialist layers validate trace shape.

The contract remains incomplete:

- `AuditInput.traceId` is optional.
- `postJournal()` has no trace input and its audit call omits one.
- Logout and some auth failure paths are not paired with a domain event.
- `explainAuthority()` leaves `underWhichPolicy` null even when a policy version is supplied.
- Audit/event hashes do not include trace or other governance metadata.

### Lineage

Financial source → transformation → output and reverse trace are implemented in one Finance OS
lineage module. Derived values cannot claim canonical truth. Specialist provenance carries source
IDs and assumptions.

Universal enterprise reverse lineage is not present. Current read-only UI aggregations and Noelia
findings are not all represented as persisted lineage records.

**Status: PARTIAL.**

---

## 17. Database integrity

### Database-enforced

- Primary keys and many direct foreign keys.
- Unique codes/keys, journal references and ballot uniqueness.
- Journal non-negative/single-sided/balanced/immutable constraints.
- Journal scope triggers for account tenant and period entity.
- Period date ordering/non-overlap.
- Policy effective-window ordering.
- Governance provenance foreign keys for cited resolutions.
- Audit/event append protection after migrations `0001`/`0008`.
- RLS on 11 selected tables.
- New `users.party_id` unique index in migration `0011`.

### Application-enforced

- Principal identity resolution and role construction.
- Tenant subtree and legal-entity scope in services/pages.
- Clearance filtering.
- Capability activation semantics.
- Authority metadata completeness and policy provenance semantics.
- HCM manager cycles and lifecycle refusal.
- Tax/FX/epistemic rules.
- Trace presence.
- Cross-table tenant/entity consistency for most non-ledger tables.
- Password/MFA account lock policy.

### Both / gaps

The ledger has useful both-layer protection. Most other tenant/entity-bearing tables have
independent tenant and legal-entity foreign keys but no composite relationship. A raw SQL writer can
create independently valid but jointly invalid combinations. This is a demonstrated persistence
surface, but no live data scan was possible; no broad composite migration was invented in this
phase.

The repository contains no PostgreSQL role, ACL, grant/revoke or `SECURITY DEFINER` provisioning.
The production DB role model is therefore DATA_NOT_AVAILABLE and must be supplied outside the
application schema.

**Status: PARTIAL; live database integrity: DATA_NOT_AVAILABLE.**

---

## 18. Dependency audit

`npm ci` installed the committed lockfile. The current audit output reported:

- 8 vulnerabilities with `npm audit --omit=dev` (3 moderate, 4 high, 1 critical).
- `next@16.2.6` has current advisories and transitively includes vulnerable PostCSS/sharp paths.
- PostCSS is direct and has high-severity advisories in the installed version.
- Vitest/Vite/esbuild advisories include a critical dev-only Vitest issue and moderate/high Vite
  paths.

Classification:

| Dependency/finding | Classification |
|---|---|
| Next server-side advisory paths | REQUIRES_UPGRADE; current exploitability depends on unused Server Actions/custom rewrites/middleware paths, but the production dependency is not clean |
| PostCSS | TRANSITIVE/BUILD-PATH plus direct dev/build dependency; REQUIRES_UPGRADE |
| sharp/libvips | TRANSITIVE through Next; current image surface is limited, but REQUIRES_UPGRADE |
| Vitest/Vite/esbuild | DEV-ONLY in current scripts; not production execution, but REQUIRES_UPGRADE |
| Automatic `npm audit fix --force` | Not applied; would introduce a breaking Vitest/Next change without regression proof |

No finding was classified as a false positive solely because it was inconvenient. Dependency
upgrade is a separate bounded engineering change after compatible version review.

**Status: PARTIAL; production dependency gate: DATA_NOT_AVAILABLE for deployed artifact.**

---

## 19. Hostile testing

### Executed in this environment

Static hostile review and source-level control tracing covered:

1. cross-tenant entity lookup in tax;
2. HCM foreign employing entity scope;
3. future/stale tax strategy;
4. future/foreign emergency grants;
5. missing authority metadata;
6. permissionless activated capabilities;
7. enterprise subtree authority scope;
8. reserved-matter cross-tenant influence;
9. historical migration truncation;
10. concurrent MFA race design;
11. audit/event non-atomic route pair;
12. GlobalUserID duplicate persistence gap.

The minimum code fixes described above were applied.

### Not executed

The following could not be run against a real runtime and therefore are NOT PASS:

- A→B and B→A pooled RLS concurrency.
- RLS error, rollback, timeout, nested and replica connection reuse.
- Parallel HTTP login with the same OTP/recovery token.
- Raw SQL trigger/RLS/ACL probes.
- Live duplicate user scan and `users_party_uidx` migration.
- Live cross-tenant/entity data scan.
- Audit hash tamper and trigger disable probes.
- HTTP tax/HCM/Noelia/entity isolation.
- Full governance/authority/Finance integration.
- Clean-install and upgrade parity.

**Status: DATA_NOT_AVAILABLE.**

---

## 20. Fault injection

| Control | Negative | Positive | Fault injection status |
|---|---|---|---|
| Identity uniqueness | duplicate graph IDs produce conflict | one user per party resolves | New DB unique index test added; DB unavailable |
| MFA | replay is refused by `verifyTotp` | current TOTP accepts | Same-credential parallel route test unavailable |
| Tenant scope | foreign tenant/entity refused | descendant enterprise scope accepted | Pooled RLS transition not proven |
| Authority | pending/expired/unknown denied | activated chain path exists in code | Live registry proof unavailable |
| Permission | unknown/wildcard not matched | canonical role permission matches | DB mirror disagreement not runtime-tested |
| Audit | update/delete/truncate triggers | append chain verifies | Existing test reset disables trigger in disposable DB; live test unavailable |
| Events | standalone pair failure now prevented for tax/waterfall | paired transaction path | DB transaction failure injection unavailable |
| Epistemic | synthetic/forecast/reference promotion denied | valid derived weakening allowed | Pure tests partly pass; full suite unavailable |
| Workflow | unknown/illegal/missing trace/SoD denied | legal transition with trace | Pure tests partly pass; persistence executor absent |
| Reserved matter | unreadable/misrouted matter denied | competent scoped body passes | Cross-tenant DB fixture unavailable |
| RLS reset | expected stale-context attack | expected isolated contexts | Not executable without PostgreSQL |

No control is called proven solely because another earlier guard would deny first. Where a fault
could not be independently injected, the matrix says unavailable rather than passing.

---

## 21. Genuine defects found

### E-01 — pooled RLS context is not request-safe

- **Expected:** one request's tenant GUC cannot affect another request.
- **Actual:** session-level GUCs are set through an unpinned pool and never reset.
- **Type:** engineering/security.
- **Existing primitive:** `tenantScopeIds`, `setDatabaseTenantContext`, RLS policies.
- **Minimum fix:** one connection/transaction-scoped shared DB context; no specialist copies.
- **Regression:** bidirectional and failure/concurrency request matrix.
- **Status:** OPEN; RED blocker.

### E-02 — historical audit truncation

- **Expected:** audit history is never destroyed by an ordinary migration.
- **Actual:** `0001` truncates before the later trigger exists.
- **Type:** migration/security.
- **Minimum fix applied:** supported runner refuses `0001` on non-empty schema; evidence script no
  longer truncates.
- **Remaining:** direct SQL history cannot be rewritten; an explicit archival upgrade procedure is
  required.
- **Status:** PARTIALLY MITIGATED; RED until deployment procedure is proven.

### E-03 — concurrent MFA replay

- **Expected:** one OTP/recovery code cannot authenticate twice in parallel.
- **Actual before fix:** separate read/verify/update race.
- **Minimum fix applied:** row-locked MFA transaction in existing login path.
- **Remaining:** live parallel HTTP proof and invalid-password counter race.
- **Status:** PARTIALLY MITIGATED.

### E-04 — duplicate GlobalUserID persistence

- **Expected:** one `users.id` per party is durable.
- **Actual before fix:** application reader detected duplicate but schema permitted it.
- **Minimum fix applied:** `0011_global_user_party_uniqueness.sql` and schema unique index.
- **Remaining:** live duplicate scan and migration application.
- **Status:** PREPARED; DATA_NOT_AVAILABLE.

### E-05 — audit/event pairing gap

- **Expected:** governed observation has complete audit/event evidence.
- **Actual before fix:** tax/waterfall routes committed `recordAudit()` and `publishEvent()` separately.
- **Minimum fix applied:** both use `withAuditTransaction()`.
- **Remaining:** audit hash metadata/trace coverage.
- **Status:** PARTIALLY MITIGATED.

### E-06 — scoped authority/entity verification gap

- **Expected:** enterprise subtree and legal entity scope are checked by the common gate.
- **Actual before fix:** exact tenant equality and no direct entity ownership check in scoped gate.
- **Minimum fix applied:** resolved tenant subtree plus entity re-read/tenant check.
- **Remaining:** live positive/negative authority proof.
- **Status:** PARTIALLY MITIGATED.

### E-07 — test/evidence destructive reset surface

- **Expected:** constitutional audit cannot be reset by an evidence script.
- **Actual before fix:** evidence script truncated audit; test helper disables triggers.
- **Minimum fix applied:** evidence script appends and compares; production code has no reset path.
- **Remaining:** test helper needs explicit disposable-DB guard before a production-grade test gate.
- **Status:** PARTIALLY MITIGATED.

### E-08 — dependency advisories

- **Type:** engineering/security.
- **Status:** OPEN; bounded upgrade required.

---

## 22. Remediation

### Changes made

| File | Remediation |
|---|---|
| `src/app/api/v1/auth/login/route.ts` | Row-locked transactional MFA/recovery-code verification and failure updates |
| `src/app/api/v1/finance/tax/assess/route.ts` | Atomic audit/event evidence transaction retained with scoped entity lookup |
| `src/app/api/v1/finance/waterfall/simulate/route.ts` | Atomic audit/event evidence transaction |
| `src/lib/authority/service.ts` | Principal subtree and target legal-entity validation in scoped authority gate |
| `src/lib/governance/reserved-matters.ts` | Tenant-scope filtering for body competence scans |
| `src/lib/governance.ts` | Pass resolved scope to reserved-matter helpers |
| `src/db/schema/identity.ts` | Declare durable `users_party_uidx` |
| `drizzle/0011_global_user_party_uniqueness.sql` | Forward unique identity migration; fails closed on duplicate data |
| `drizzle/meta/0011_snapshot.json` | Current schema snapshot including the unique index |
| `drizzle/meta/_journal.json` | Migration journal entry renamed to the bounded migration |
| `scripts/migrate.ts` | Refuse destructive `0001` against existing schemas |
| `scripts/evidence/kernel-gate1.ts` | Remove audit truncation; append-only evidence procedure |
| `tests/identity/identity-graph.test.ts` | Assert database unique index is installed |

### No migration added for

- broad tenant/entity composite constraints;
- RLS connection context;
- audit hash payload versioning;
- permission catalogue cutover;
- dependency upgrades.

Those require either a live data baseline, deployment design, historical hash compatibility plan or
separate authorized compatibility work. Adding them speculatively would violate minimum-change
rules.

---

## 23. Verified-no-change areas

- No new identity engine.
- No new HCM master.
- No new governance engine.
- No new authority engine.
- No new capability registry.
- No new permission engine.
- No new workflow engine.
- No new audit system.
- No new event bus.
- No new lineage store.
- No Sector Control Plane.
- No accounting policy.
- No tax liability/treatment.
- No legal interpretation.
- No capital execution.
- No treasury settlement.
- No journal posting.
- No P1–P11 activation.
- No production data mutation.

The changes compose existing primitives and add only the durable identity migration justified by
the canonical one-GlobalUserID invariant.

---

## 24. BEFORE → AFTER

### Database/financial/governance state

| State | Before Phase 13 | After Phase 13 |
|---|---|---|
| DB connection | DATA_NOT_AVAILABLE | DATA_NOT_AVAILABLE |
| Fingerprint | NOT CAPTURED | NOT CAPTURED |
| Migrations applied | NOT CAPTURED | NOT CAPTURED |
| Tenants/entities/users/employees | NOT CAPTURED | NOT CAPTURED |
| Governance/resolutions/policies | NOT CAPTURED | NOT CAPTURED |
| Decisions/capabilities | NOT CAPTURED | NOT CAPTURED |
| Audit/events/traces | NOT CAPTURED | NOT CAPTURED |
| Ledger/treasury/capital | NOT CAPTURED | NOT CAPTURED |
| Financial mutation | none | none |
| Governance ratification | none | none |
| P1–P11 activation | none | none |

Equality cannot honestly be claimed for an unavailable database. No DB operation was executed, so
there was no audit, identity, governance or financial delta caused by this phase.

### Code/migration state

Explained deltas:

- 12 migrations now include `0011_global_user_party_uniqueness`.
- The schema declares the same unique index.
- The supported migration runner refuses the known destructive legacy migration against existing
  schemas.
- MFA, authority scope, audit/event transaction pairing and evidence reset behavior changed as
  described in §22.

---

## 25. Validation

### Passed

- `npm ci` completed from the committed lockfile.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- JSON validation passed for the Phase 13 matrix.
- Pure/DB-independent test subset: **64 tests passed across 6 files** on the current source.

### Blocked/unavailable

- `npm test`: **47 test files failed collection, 6 passed, 64 tests passed**. The 47 failures all
  stopped at `DATABASE_URL is required` during module collection.
- Seven HTTP suites contain `describe.skipIf(!available)` and were not treated as passing.
- No HTTP server was started because the supported PostgreSQL dependency was unavailable.
- Normal `npm run build` without `DATABASE_URL` fails during page-data collection by design because
  `src/db/index.ts` requires PostgreSQL at module load.
- Build succeeded previously when a non-routable placeholder URL was supplied; that verified
  compilation only and not runtime connectivity.
- `npm run migrate` was not executed against any real database. A probe URL correctly failed with
  `ECONNREFUSED` and made no changes.
- PostgreSQL installation via APT was attempted but Debian repositories were unreachable and the
  package was unavailable.
- Clean-install, existing-environment and upgrade parity were not run.
- RLS, trigger, role, permission, seed, authority, audit, event and financial database fingerprints
  were not captured.

**Validation status: DATA_NOT_AVAILABLE. Zero skipped: NOT SATISFIED.**

---

## 26. Completeness matrix

The machine-readable matrix is committed at:

- `docs/audit/phase13-core-integrity-matrix.json`

It uses only the requested status vocabulary:

`COMPLETE`, `PARTIAL`, `READY`, `REQUIRES_AUTHORITY`, `DATA_NOT_AVAILABLE`, `NOT_AVAILABLE`.

The matrix deliberately does not mark a source file as COMPLETE when live data, security or
authority proof is missing.

Headline statuses:

| Capability | Exists | Complete | Tests | Security | Authority | Production Ready |
|---|---|---|---|---|---|---|
| Identity | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | PARTIAL | DATA_NOT_AVAILABLE |
| Governance | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Authority | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| HCM | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Finance | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Tax | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Legal | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Security | READY | PARTIAL | PARTIAL | PARTIAL | PARTIAL | DATA_NOT_AVAILABLE |
| Audit | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | PARTIAL | DATA_NOT_AVAILABLE |
| Events | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | PARTIAL | DATA_NOT_AVAILABLE |
| Lineage | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | PARTIAL | DATA_NOT_AVAILABLE |
| Workflow | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Noelia/HIVE | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Compliance | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Risk | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Intercompany | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Reporting | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| FX | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Period/Close | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Capital | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | REQUIRES_AUTHORITY | REQUIRES_AUTHORITY |
| Treasury | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | DATA_NOT_AVAILABLE | DATA_NOT_AVAILABLE |
| Tenant/entity isolation | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | PARTIAL | DATA_NOT_AVAILABLE |
| PostgreSQL/migration parity | READY | PARTIAL | DATA_NOT_AVAILABLE | PARTIAL | PARTIAL | DATA_NOT_AVAILABLE |

---

## 27. Remaining blockers

### RED engineering/security blockers

1. Request-scoped RLS context is not connection/transaction safe.
2. Full audit/event immutability and metadata tamper resistance are not live-proven.
3. Direct execution of historical `0001` remains unsafe; only the supported runner refuses it.
4. Full concurrent MFA/lockout tests are unavailable; invalid-password counter race remains.
5. Database roles/ACLs and superuser/app-role separation are unavailable.
6. Permission mirror drift is not a runtime fail-closed condition.
7. Broad tenant/entity persistence constraints are absent.
8. Trace is optional in parts of the shared audit contract.
9. Dependency advisories remain.
10. Full test, HTTP and clean-install evidence is unavailable.

### Authority blockers

1. Accounting policy and P1–P11 ratification.
2. Policy provenance/ratification C-1.
3. Capital execution/funding authority.
4. Tax treatment/liability authority.
5. Legal interpretation authority.
6. Permission source cutover authority.
7. Governed activation transition authority.

### Data blockers

1. No database fingerprint.
2. No duplicate identity scan.
3. No actual RLS/trigger/ACL state.
4. No actual decision/capability status.
5. No actual policy provenance count.
6. No actual audit/event chain verification.
7. No actual treasury/ledger/capital state.
8. No clean-install/upgrade parity.

---

## 28. Recommended next phase

Do not expand Sector OSs or rebuild existing specialists. The next phase should be a bounded
**PostgreSQL-backed kernel evidence and RLS remediation phase**:

1. Provide an authorized isolated PostgreSQL runtime, not Supabase.
2. Capture the immutable database fingerprint and all requested counts/ACL/RLS/trigger state.
3. Run the new `0011` migration against a copy after duplicate party reconciliation.
4. Replace pooled session GUC state with one connection/transaction-scoped request context.
5. Add and run the A/B/error/rollback/timeout/nested/concurrent RLS matrix.
6. Run parallel HTTP OTP/recovery-code tests and close the invalid-password counter race.
7. Add explicit disposable-database protection to destructive test reset helpers.
8. Validate audit hashes and decide, without rewriting history, how future metadata coverage is
   versioned.
9. Resolve the permission catalogue ownership and make drift fail closed or cut over one source.
10. Review dependency upgrades without `--force`, then run the entire regression suite twice.
11. Run clean install → migrate → seed → fingerprint → full tests, then compare with an existing
    isolated environment.
12. Keep all accounting, tax, legal, capital and policy-dependent execution blocked until genuine
    human authority exists.

No specialist phase should start until these kernel controls are proven.

---

## 29. Final gate

# 🔴 RED

The architecture is not being restarted. Existing correct work is preserved. The RED gate is based
on actual unresolved conditions:

- PostgreSQL and financial/governance state are materially unavailable.
- Full test execution is incomplete and zero-skipped validation is not satisfied.
- RLS context can leak across pooled connections under concurrency.
- Historical migration SQL contains destructive audit truncation and is only runner-guarded.
- Audit hash coverage is incomplete for material governance metadata.
- Complete DB role/ACL isolation is not present in repository evidence.
- MFA has code-level remediation but no parallel runtime proof and a separate lockout race remains.
- Dependency advisories are unresolved.

A future YELLOW result is possible after the engineering controls are closed if only ratification or
external data remains. GREEN is not available merely because the TypeScript architecture looks
complete or because the 64 runnable tests pass.

**Canonical end state preserved:**

```text
ONE CONTROL PLANE
ONE IDENTITY
ONE GOVERNANCE MODEL
ONE AUTHORITY MODEL
ONE HCM MASTER
ONE FINANCIAL TRUTH LAYER
ONE AUDIT
ONE EVENT MODEL
ONE LINEAGE MODEL
ONE WORKFLOW MODEL
ONE SECURITY MODEL
```
