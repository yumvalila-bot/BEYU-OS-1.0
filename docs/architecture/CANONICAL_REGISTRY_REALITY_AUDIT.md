# BEYU OS — Canonical Identity, Organization, Family & Registration Capability

## Phase 0 — Current-main reality audit (pre-implementation)

- **Repository:** https://github.com/yumvalila-bot/BEYU-OS-1.0
- **Audited ref:** `main` @ `d2a92a2b5847b9280a7dd138097b8d3a03fcad2c` (merge of PR #94)
- **Working tree at audit time:** clean, branch `arena/01a0f0ae-beyu-os-1-0`
- **Open PRs at audit time:** #68, #67, #61, #54, #41, #31, #20, #14 (all pre-existing,
  none re-applied by this work). Most recent merged history: PR #94 (communications),
  PR #93 (federation), PR #92/#91 (health).
- **Method:** full-text search of `src/`, `tests/`, `drizzle/`, `docs/` before any change.

---

## IDENTITY

| Item | Status | Evidence |
| --- | --- | --- |
| `parties` (MDM master) | **EXISTS — REUSE** | `src/db/schema/identity.ts` — type, names, email, KYC, `duplicate_of_party_id`, classification, lifecycle status |
| `users` + GlobalUserID | **EXISTS — REUSE** | `users_party_uidx` unique (one GlobalUserID per Party, migration `0011_global_user_party_uniqueness`); `users_email_uidx` unique |
| `sessions` | **EXISTS — REUSE** | `sessions` table, MFA step-up columns |
| Identity graph resolution | **EXISTS — REUSE** | `src/lib/identity.ts` (`resolveByPartyId/GlobalUserId/EmployeeId`, `assertSingleGlobalUser`) |
| Duplicate identity prevention | **EXISTS (partial)** | `registerUser` rejects a second user for an existing party email (409); `assertSingleGlobalUser` reports `DATA_CONFLICT`; **no party-only registration exists**, so a person without a user can only be created by seed or the internal sector route |
| Party-only (person) registration | **MISSING** | `insert(parties)` appears only in `internal/identity/register` and `admin/governance-service.ts` — both always create a user |
| Employees (HCM master) | **EXISTS — REUSE** | `employees` unique on `party_id`; RLS entity-aware (migration `0018`); **read-only API** (`GET /api/v1/hcm/employees`); no create path |

**Person ≠ User ≠ Employee ≠ Principal** is already enforced in code and documented in
`src/lib/identity.ts` and `docs/governance/admin-user-tenant-governance.md`
("Authorization-path tables are non-RLS by design: `users`, `parties`, …").

## ORGANIZATION

| Item | Status | Evidence |
| --- | --- | --- |
| `tenants` + registration | **EXISTS — REUSE** | `POST /api/v1/admin/tenants` (code uniqueness, parent hierarchy, country, isolation tier, audit `TENANT_REGISTERED`) |
| `legal_entities` schema + RLS | **EXISTS — REUSE** | `core.ts`, RLS `legal_entities_tenant_isolation` |
| Legal entity **registration API** | **MISSING** | no `insert(legalEntities)` anywhere in `src/` outside `db/seed.ts`; permission `organization:entity.manage` exists but no route uses it |
| `org_units` (DIVISION/DEPARTMENT/BRANCH/TEAM) | **SCHEMA EXISTS, API MISSING** | no `insert(orgUnits)` outside seed |
| `ownership_records` | **SCHEMA EXISTS, API MISSING** | effective-dated ownership registry, RLS-enabled; no write path outside seed; `organization:ownership.manage` is high-risk and deliberately held only by `GROUP_CEO` (locked by `tests/authorization/rbac-audit.test.ts`) |
| `countries`, `jurisdictions` | **EXISTS — REUSE** | `core.ts` |
| `entity_appointments` (directors/officers) | **EXISTS — REUSE** | read surfaces exist under organization pages |
| Tenant ≠ Legal Entity ≠ Org Unit | **EXISTS (structurally)** | three separate tables; tenant types include `LEGAL_ENTITY`/`BRANCH`/`DEPARTMENT` only as *tenant hierarchy labels*, never as entities |

## ADMINISTRATION

| Item | Status | Evidence |
| --- | --- | --- |
| User registration/lifecycle | **EXISTS — REUSE** | `/api/v1/admin/users` (+status/remove), `registerUser` → status `CREATED`, random never-disclosed credential, audit `USER_REGISTERED` |
| Tenant registration/lifecycle | **EXISTS — REUSE** | `/api/v1/admin/tenants` (+status/remove) |
| Membership | **EXISTS — REUSE** | `/api/v1/admin/memberships` — membership IS the zero-capability `TENANT_MEMBER` role assignment (`MEMBERSHIP_GRANTED`/`REVOKED`) |
| Role assignment | **EXISTS — REUSE** | `/api/v1/admin/roles`, `identity:role.grant` high-risk, F-01 admin-DSN boundary |
| Delegation | **EXISTS — REUSE** | `/api/v1/admin/delegations`, bounded, depth-one, non-delegable set pinned by tests |
| Administrative audit | **EXISTS — REUSE** | `listAdministrativeAudit` + hash-chained `audit_log` |

## AUTHORIZATION

RBAC + ABAC in `src/lib/authz.ts` (`can()`), permission catalogue and roles in
`src/lib/constants.ts`, transaction-local RLS context in `src/lib/tenant-scope.ts`,
fail-closed `guarded()` pipeline in `src/lib/api.ts`, MFA step-up for `HIGH_RISK_PERMISSIONS`,
closed `ADMIN_DELEGATABLE_PERMISSIONS` set. **No second authorization engine exists;
none is created.** RLS: 41 migrations carry policies; `families` (new) receives the
canonical `beyu_tenant_ids()` policy; `family_members` remains a documented non-RLS
authorization-path-adjacent baseline table governed by query-level scope (explicitly
carved out by `tests/security/family-office-rls-isolation.test.ts`).

## FAMILY / FAMILY OFFICE

| Item | Status | Evidence |
| --- | --- | --- |
| Family Office capital/wealth/protection/trust | **EXISTS — REUSE** | `/api/v1/family-office/*` (~30 routes), `familyoffice:*` permissions |
| Lineage engine | **EXISTS — REUSE** | `src/lib/family/lineage.ts` + `model.ts` — governed relationship catalogue `LINEAGE_RELATIONSHIPS` (BIRTH_DESCENDANT, ADOPTED_CHILD, STEPCHILD, SPOUSE_OF_MEMBER, FORMER_SPOUSE_OF_MEMBER, OTHER_AFFINAL, NON_FAMILY); marriage-never-creates-descent invariant |
| `family_members` registry | **EXISTS — EXTEND** | tenant-scoped, unique on `party_id`, but `family_line` is a **free-text label** — no canonical Family entity, no membership lifecycle (status/dates/provenance/actor), no `linked_to_member_id` although the engine models spousal attachment |
| Canonical Family entity (`families`) | **MISSING** | grep for `families` table: none |
| Family registration API | **MISSING** | no route, no service |
| Family member registration API | **MISSING** | `insert(familyMembers)` only in `db/seed.ts` |
| Family management UI | **MISSING** | `/os/family` is a read-only dashboard; no register/list/detail surfaces |
| Family permissions | **EXISTS — REUSE** | `family:member.read`, `family:member.manage` (held by `GROUP_CEO` + `FAMILY_OFFICE_PRINCIPAL`) |

## REGISTRATION SURFACES

| Workflow | Status | Reuse / Create |
| --- | --- | --- |
| USER | EXISTS | reuse `POST /api/v1/admin/users` |
| TENANT | EXISTS | reuse `POST /api/v1/admin/tenants` |
| MEMBERSHIP | EXISTS | reuse `POST /api/v1/admin/memberships` |
| ROLE | EXISTS | reuse `POST /api/v1/admin/roles` |
| PERSON (party only) | MISSING | CREATE `POST /api/v1/admin/registry/people` |
| FAMILY | MISSING | CREATE `POST /api/v1/admin/registry/families` |
| FAMILY MEMBER | MISSING | CREATE `POST /api/v1/admin/registry/families/[id]/members` |
| LEGAL ENTITY | MISSING | CREATE `POST /api/v1/admin/registry/entities` |
| BUSINESS / OPERATING UNIT | MISSING | CREATE `POST /api/v1/admin/registry/businesses` |
| OWNERSHIP RELATIONSHIP | MISSING | CREATE `POST /api/v1/admin/registry/relationships/ownership` |
| EMPLOYMENT RELATIONSHIP | MISSING | CREATE `POST /api/v1/admin/registry/relationships/employment` |
| Unified registry UX | MISSING | CREATE `/os/registration` + `/os/family/families[...]` |

## TESTING / DOCUMENTATION (existing assets reused)

- `tests/admin/*` (governed-mutation + HTTP boundary conventions), `tests/identity/*`,
  `tests/architecture/*` (constitutional invariants), `tests/tenant-isolation/*`,
  `tests/security/*` (empirical RLS on the runtime role), `tests/migration/*`
  (integrity, expand/contract, drift), `tests/browser/*` (Playwright).
- Canonical docs: `docs/architecture/PHASE_9_CANONICAL_ARCHITECTURE.md`,
  `ARCHITECTURE_INVARIANTS.md`, `docs/governance/admin-user-tenant-governance.md`.

---

## GAP MATRIX

| # | Area | Classification | Decision |
| --- | --- | --- | --- |
| 1 | parties/users/sessions/roles/permissions/RLS/audit | **EXISTS** | REUSE untouched |
| 2 | identity graph (`lib/identity.ts`) | **EXISTS** | REUSE for resolution; never write through it |
| 3 | user/tenant/membership/role/delegation APIs | **EXISTS** | REUSE from the unified registry UX |
| 4 | Canonical Family entity | **MISSING** | CREATE `families` table: tenant-scoped, canonical `party` (type ORGANIZATION) reference, code/name/country/jurisdiction/status/classification |
| 5 | Family membership lifecycle | **MISSING** | EXTEND `family_members` with `family_id`, `membership_status`, effective dates, provenance, actor, `linked_to_member_id` (spousal attachment the engine already models) |
| 6 | Family→ownership anchor | **GAP** | solved *without new ownership storage* by giving each family a canonical Party — `ownership_records.owner_party_id` already exists |
| 7 | Person-only registration + conflict workflow | **MISSING** | CREATE, 409 conflict (never silent merge) |
| 8 | Legal entity / org unit / ownership / employment write APIs | **MISSING** | CREATE over the existing tables, existing permissions (`organization:entity.manage`, `organization:ownership.manage` high-risk, `hcm:employee.manage`) |
| 9 | Business registration permission | **CONFLICT RISK** | org units are neither legal entities nor tenants — add exactly one permission `organization:business.register` instead of overloading `entity.manage` |
| 10 | Party registration permission | **MISSING** | add exactly one permission `identity:party.register` (read rides on existing `identity:user.read` = "Read identity records") |
| 11 | Second identity system / User OS / Family OS | **DUPLICATE RISK — REFUSED** | no new identity tables beyond `families` (a relationship-domain entity, not an identity plane); no new auth engine; no new audit ledger; Noelia untouched |
| 12 | Uncontrolled generic relationship graph | **DUPLICATE RISK — REFUSED** | only explicit typed tables: `families`, `family_members`, `ownership_records`, `employees`, `role_assignments`, `tenants`, `legal_entities`, `org_units` — all pre-existing except `families` |

### Duplicate-table search performed before implementation

`parties` — one. `users` — one. `family_members` — one. `tenants` — one.
`legal_entities` — one. `org_units` — one. `ownership_records` — one.
No `families` existed. No authorization function set duplicates `can()`.
No audit ledger exists besides `audit_log` / `enterprise_events`.

---

## Phase 3+ — post-implementation reality audit (AFTER)

- **Branch:** `arena/01a0f0ae-beyu-os-1-0` · audited ref: same `d2a92a2b…` baseline (no redesign)
- **Method:** post-state verified by full-text search + executed test suites (below).

### IDENTITY — AFTER

| Item | Status | Evidence |
| --- | --- | --- |
| Party-only (person) registration | **IMPLEMENTED** | `POST /api/v1/admin/registry/parties` → `registerParty()` in `src/lib/admin/registry-service.ts`; `userCreated: false` proven by `tests/security/registered-parties-are-userless.test.ts` |
| Duplicate person conflicts | **IMPLEMENTED** | exact-email and name+birthdate → `409 DUPLICATE_PARTY` naming `existingPartyId`/`candidates`; `DENIED` audit appended; nothing inserted (`tests/registry/duplicate-conflict.test.ts`) |
| One GlobalUserID per Party | **REUSED — untouched** | `users_party_uidx`; registry never writes `users` |
| Person ≠ User ≠ Employee ≠ Member | **ENFORCED + TESTED** | userless suite + `family-member-guard` (membership writes no authorization row; principal with zero roles is denied every capability) |

### ORGANIZATION — AFTER

| Item | Status | Evidence |
| --- | --- | --- |
| Legal entity registration | **IMPLEMENTED** | `POST /api/v1/admin/registry/entities` (GROUP_CEO holds `organization:entity.manage`; PLATFORM_ADMIN deliberately refused — proven in the HTTP suite) |
| Business / operating unit registration | **IMPLEMENTED** | `POST /api/v1/admin/registry/businesses` under an in-scope legal entity; `organization:business.register` (exactly one added permission; no overload of entity/tenant) |
| Ownership registration | **IMPLEMENTED** | `POST /api/v1/admin/registry/ownership` — effective-dated; overlapping period → `409 OWNERSHIP_EXISTS`; later non-overlapping period succeeds; high-risk MFA step-up retained |
| Employment registration | **IMPLEMENTED** | `POST /api/v1/admin/registry/employment` → `createEmployment()` in `src/lib/hcm.ts` (THE single application writer) + `HIRE` row in `employment_events` + declared `EMPLOYEE_CREATED` event, atomic; duplicates → `409 EMPLOYMENT_EXISTS` / `EMPLOYEE_NO_EXISTS` |
| Tenant registration | **REUSED** | unchanged `POST /api/v1/admin/tenants` |

### FAMILY — AFTER

| Item | Status | Evidence |
| --- | --- | --- |
| `families` canonical entity | **CREATED (one additive migration)** | `drizzle/0073_canonical_family_registry.sql` — tenant FK, canonical `party_id` (parties · ORGANIZATION), unique `(tenant_id, family_line)`, `ENABLE+FORCE` RLS `beyu_tenant_ids()` policy |
| Family registration API | **IMPLEMENTED** | `POST /api/v1/admin/registry/families` — ONE transaction: MDM party + family row; duplicate code → `409 FAMILY_CODE_EXISTS`; classification `HIGHLY_RESTRICTED` |
| Membership lifecycle | **IMPLEMENTED** | `POST /api/v1/admin/registry/families/{id}/members` — relationship only: founder rules on empty families, descent requires governed parent, affinity via `linked_to_member_id` (never descent), `NON_FAMILY` no links, direct-descendant claim refused at registration (`tests/family/family-member-guard.test.ts`) |
| Membership uniqueness | **IMPLEMENTED** | one person → one canonical membership; re-add → `409 ALREADY_FAMILY_MEMBER` |
| Family UI | **IMPLEMENTED** | `/os/family/families` list + `/os/family/families/[id]` detail (GlobalUserID / employment shown only when real) + link from `/os/family`; presentation-only |

### REGISTRY ORCHESTRATION — AFTER

- **`src/lib/admin/registry-service.ts`** — the ONE BEYU REGISTRY layer over EXISTING models:
  `registerParty / registerFamily / registerFamilyMember / registerLegalEntity /
  registerOrgUnit / registerOwnership / registerEmployment` + reads
  (`listRegistry*`, `getRegistryFamily`, `buildRegistryGraph`).
- Every writer: `requireCapability(+ABAC ctx)` → `requireActionScope` → atomic
  `withAuditTransaction` (hash-chained audit action `registry.*` + declared enterprise
  event) → fail closed. No route performs `insert/update/delete` (pinned by
  `tests/admin/admin-governance-invariants.test.ts`).
- **Relationship graph** (`buildRegistryGraph`): typed edges only — `memberOf`,
  `personWorksFor`, `hasUser`, `personOwns`, `contains` — emitted only from the real
  tables, each gated by the matching read capability (no `family:member.read` → no
  family nodes/edges at all). `tests/graph/relationship-integrity.test.ts` proves
  no fabricated user/employment/membership edges.
- **Permissions added (exactly two, mission-authorized):** `identity:party.register`
  and `organization:business.register` (holders in `src/lib/constants.ts`;
  `identity:role.grant` holders unchanged: GROUP_CEO + PLATFORM_ADMIN).
- **Events added to the declared catalogue** (`docs/events/README.md`):
  `PARTY_REGISTERED`, `FAMILY_REGISTERED`, `FAMILY_MEMBER_ADDED`, `BUSINESS_REGISTERED`
  (family events carry `HIGHLY_RESTRICTED` envelope classification);
  registry reuses declared `ENTITY_CREATED` / `OWNERSHIP_CHANGED` / `EMPLOYEE_CREATED`.

### UI — AFTER

- `/os/registration` — BEYU REGISTRY console (administration group, permission-gated
  nav entry); server reads under the principal's tenant context; every form POSTs to
  the guarded API; capability-gated per form.
- `/os/family/families`, `/os/family/families/[id]` — governed family surfaces.
- Presentation-only: admin-governance invariants pin `requireAccess` + no direct
  table writes + client actions only POST + `router.refresh()`.

### TESTING — AFTER (executed)

| Suite | Result |
| --- | --- |
| `npm test` (no server) | **4871 passed / 0 failed** (313 files) |
| `npm test` with live `next start :3100` (`BEYU_TEST_BASE_URL`) | **5167 passed / 0 failed** (310 passed, 3 always-skipped files) |
| New: `tests/registry/*` (family registration, duplicate-conflict, HTTP boundary) | 12/12 |
| New: `tests/family/family-member-guard.test.ts` | 7/7 |
| New: `tests/graph/relationship-integrity.test.ts` | 4/4 |
| New: `tests/security/registered-parties-are-userless.test.ts` | 3/3 |
| typecheck / lint / build | **green** (1 pre-existing `<img>` warning, unrelated) |
| Playwright browser suite | not runnable in this sandbox (Playwright CDN blocked — ENVIRONMENT); CI installs chromium (`ci.yml`) and runs it |

### NOT DONE / NON-GOALS (confirmed absent)

- No second authorization/audit/identity engine; no User/Family/Company/Entity/Tenant OS;
  Noelia untouched; `CAP_POSTING` untouched; no country hard-coded.
- No silent merge anywhere: every duplicate path is a 409 with the existing record named.
- Entity lifecycle transitions beyond registration remain unratified (audit trail stays
  honest PARTIAL in `src/lib/architecture/hcm.ts`).

---

## Phase 2 addendum — superior/subordinate enrollment & reporting lines (2026-09-30)

### SCOPE

Extend the SAME BEYU REGISTRY orchestration (no new OS, no new engine) with the
governed superior → subordinate capability:

- **`enrollSubordinate()`** — one coherent workflow composing the EXISTING
  primitives: `registerParty` / `registerUser` (identity lifecycle), `registerEmployment`
  → `createEmployment` (THE employees writer), `grantRole` (identity:role.grant,
  MFA step-up, privileged ceiling). Each step re-authorizes itself; the
  orchestrator adds capability/scope/self-enrollment/ceiling checks and ONE
  `SUBORDINATE_ENROLLED` audit row + event.
- **`reassignReportingLine()`** → **`updateReportingLine()`** in `lib/hcm.ts`
  (THE single sanctioned mutator of `employees.manager_employee_id`, hcm-1.5.0):
  `MANAGER_CHANGE` history event + `EMPLOYMENT_MANAGER_CHANGED` audit +
  declared `EMPLOYMENT_CHANGED` enterprise event, atomic.
- **Graph** — `reportsTo` edges projected from `employees.manager_employee_id`
  (never inferred from roles/UI), gated by `hcm:employee.read`.
- **API** — `POST /api/v1/admin/registry/enrollment`,
  `PATCH /api/v1/admin/registry/employment/[id]/manager`, both `guarded()`.
- **UI** — `/os/registration` gains enrollment + reporting-line panels,
  presentation-only, gated by `hcm:employee.manage` visibility (server still
  re-authorizes every act).

### CANONICAL INVARIANTS PRESERVED

- MANAGER ≠ ADMINISTRATOR: a reporting line mints no User, role, permission or
  authorization. Role assignment stays inside `grantRole` (privileged roles
  PLATFORM_ADMIN-only) plus a NEW clearance ceiling: an enroller cannot assign
  a role whose clearance ceiling exceeds their own clearance.
- The canonical HCM integrity invariants are REUSED, not re-invented:
  `assertManagerSameScope` (no self-management; manager stays inside the same
  tenant AND legal entity) and `assertManagerAcyclic` (acyclic graph) from
  `lib/hcm.ts`.
- No duplicate identities: enrollment resolves EXACTLY one of existing-party
  reuse / new-person registration; duplicate email → controlled 409 naming the
  existing record; a party never gets a second user; self-enrollment refused.
- No new permissions: `hcm:employee.manage`, `identity:user.register`,
  `identity:party.register`, `identity:role.grant` — all pre-existing.
- One audit ledger (`audit_log`, hash-chained) and one event stream
  (`enterprise_events`); `EMPLOYMENT_CHANGED` / `SUBORDINATE_ENROLLED` declared
  in `docs/events/README.md`.
- Family capability untouched; Noelia untouched; RLS untouched (final DB
  boundary); federation readiness unchanged (country-neutral core).

### TESTING — Phase 2 (executed)

- `tests/registry/subordinate-enrollment.test.ts` — 12 service-level tests:
  enrollment happy paths (party/user/role), party reuse, unauthorized refusal
  (incl. PLATFORM_ADMIN holding NO hcm authority), self-enrollment refusal,
  ambiguity refusal, role-requires-user, clearance ceiling, privileged-role
  ceiling, reporting-line reassign (audit/event/history assertions), cycle /
  self / cross-tenant / cross-entity / terminated / no-op refusals, graph
  `reportsTo` emission + clearance gating.
- `tests/registry/registry-http.test.ts` — extended HTTP boundary: 401/403
  fail-closed, end-to-end enrollment over HTTP, ambiguous 422, governed
  reassignment, schema refusal.
- `tests/browser/registry-enrollment.spec.ts` — browser transport: anonymous
  401, family-office principal 403 despite console rendering (UI ≠ authority),
  manager console visibility + server-side schema refusal.
- Full-suite revalidation (executed 2026-09-30, scratch PostgreSQL 16 + CI-parity
  env + live `next start :3100`):
  - `npm test` no server: **4883 passed / 0 failed** (279 passed files, 35 skipped files).
  - `npm test` with live server + `BEYU_TEST_BASE_URL`: **5181 passed / 0 failed**
    (311 passed files, 11 skipped tests — same skip profile as Phase 1).
  - typecheck / lint / build: green (1 pre-existing `<img>` warning, unrelated).
  - Playwright browser suite (incl. the new `registry-enrollment.spec.ts`):
    not runnable in the sandbox (Playwright CDN blocked — ENVIRONMENT); CI
    installs chromium and executes the full browser gate.

### HONEST DEBT (unchanged)

- Lifecycle transitions beyond registration / reporting lines remain
  unratified (termination, suspension, leave). Audit / Events stay PARTIAL in
  `src/lib/architecture/hcm.ts`.
- Seed still has no employee-level manager edges (position reports-to only).
