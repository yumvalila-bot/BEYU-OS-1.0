# BEYU OS — Administrative User & Tenant Governance: Reality Audit and Architecture

**Program:** X10THINK master implementation — governed administrative user & tenant
governance inside BEYU OS.
**Status:** Implemented as a FIRST-CLASS SHARED BEYU OS CAPABILITY. No Admin OS,
no User OS, no Tenant OS, no second authorization engine was created.

---

## 1. Reality audit findings (Phase 0)

Audited at commit `8d2e3a23cb0918709e121004cabd5f34aed5071e` (branch point from
`main`), working tree clean.

### 1.1 What already exists and is reused unchanged

| Concern | Canonical implementation | Reused |
| --- | --- | --- |
| Authentication | `src/app/api/v1/auth/login` (+ mobile), scrypt + TOTP MFA, `sessions` table | ✅ verbatim |
| GlobalUserID | `users.id` — ONE login identity per `parties.id` (`users_party_uidx`), identity graph in `src/lib/identity.ts` | ✅ verbatim |
| Users | `parties` (MDM) + `users` (login) — `src/db/schema/identity.ts` | ✅ verbatim |
| Tenants / org | `tenants`, `legal_entities`, `org_units`, `countries`, `jurisdictions` — `src/db/schema/core.ts` | ✅ verbatim |
| RBAC | `roles`, `permissions`, `role_permissions`, `role_assignments` + canonical catalogue `ROLES`/`PERMISSIONS` in `src/lib/constants.ts` | ✅ verbatim (extended catalogue only) |
| ABAC | classification ceilings, entity scope, tenant isolation in `src/lib/authz.ts` `can()` | ✅ verbatim (delegation source added to the same primitive) |
| Principal resolution | `resolvePrincipal()` in `src/lib/session.ts` — per-request IDENTITY → TENANT → ROLE → PERMISSION → SCOPE | ✅ extended in place |
| Policy / fail-closed | `guarded()` API boundary (`src/lib/api.ts`): auth → authorization → validation → rate limit → idempotency → audit; 401/403/428 fail-closed | ✅ verbatim |
| RLS | 249 tenant-isolated tables with the canonical `tenant_id = ANY (beyu_tenant_ids())` policy; transaction-local GUC context via `withTenantDatabaseContext` | ✅ enforced; no bypass introduced |
| Audit | hash-chained append-only `audit_log` + `enterprise_events` (`src/lib/audit.ts`), `recordAuditTx` in the same transaction as the mutation | ✅ verbatim |
| Page guard | `requireAccess()` / `requirePrincipal()` (`src/lib/guard.ts`), `checkBeyuOSAuthorization` layout gate | ✅ verbatim |
| Admin bootstrap | one-time enrollment ceremony (`admin_bootstrap_state`, sealed by trigger) — the existing PLATFORM_ADMIN enrollment | ✅ untouched |
| Delegation (monetary/governance) | `delegations` table + `src/lib/governance/delegation.ts` engine (monetary authority) | ✅ untouched; distinct concern |
| Emergency access | `emergency_access_grants` — deliberately unactivatable (A-06-2) | ✅ untouched |
| Noelia boundary | single AI identity; no role in `ROLES`; cannot self-authorize (existing tests) | ✅ reinforced with new tests |

### 1.2 Gaps found (what did NOT exist)

1. **No administrative user lifecycle.** The identity plane was read-only
   (`/os/identity` renders users; nothing could register, suspend, deactivate or
   remove a user through a governed runtime path). Only the one-time bootstrap
   ceremony and the sector service-to-service
   `POST /api/v1/internal/identity/register` (internal service auth, humans
   provisioned by sectors) could create identities.
2. **No tenant governance capability.** `tenants` had NO permission in the
   catalogue at all — nothing could register or transition a tenant, and no
   dependency evaluation existed for tenant removal.
3. **No membership management.** Membership is expressed by
   `users.primary_tenant_id` + tenant-scoped `role_assignments`; there was no
   governed way to add/remove a user's presence in a tenant.
4. **No runtime role assignment path.** `identity:role.grant` existed as a
   capability (held by PLATFORM_ADMIN and GROUP_CEO) but no endpoint enforced
   it; role assignments were written only by the seed and the admin-DSN
   bootstrap script. Control F-01 deliberately revokes runtime-role DML on
   `role_assignments` (circular-trust prevention).
5. **No admin capability delegation.** The `delegations` table is the monetary
   authority model evaluated by the governance engine; nothing fed the
   authorization path, and no capability-scoped, time-bound, revocable
   administrative delegation existed.
6. **No administrative audit view.** The audit ledger existed; no admin-scoped
   surface filtered the governance actions.

### 1.3 Architectural constraints that shaped the design

- **F-01 (migration 0030):** the runtime DB role has `SELECT`-only on
  `role_assignments`. Runtime role-grant/membership writes therefore go through
  the EXISTING governed admin boundary (`src/db/admin.ts`, the admin DSN used by
  the canonical `prepare-admin-bootstrap` path), wrapped in capability check,
  MFA step-up, scope validation and canonical `recordAuditTx` appends inside the
  same admin transaction. No new unrestricted endpoint exists; the runtime role
  still cannot write `role_assignments`.
- **Authorization-path tables are non-RLS by design.** `users`, `parties`,
  `tenants`, `roles`, `role_assignments`, `sessions`,
  `emergency_access_grants`, `delegations` carry no RLS policy because
  `resolvePrincipal()` must resolve identity/authority across tenants BEFORE a
  request's tenant context exists. The new delegation table follows this exact
  pattern (documented in the migration); scoping is enforced at the query layer
  and proven by tests.
- **Permission catalogue invariants** (`tests/authorization/rbac-audit.test.ts`,
  `tests/architecture/constitutional-invariants.test.ts`): no wildcard codes;
  `identity:role.grant` holders are exactly `[GROUP_CEO, PLATFORM_ADMIN]`;
  every high-risk permission is reachable; no role derives permissions by
  catalogue filter; GROUP_CEO exclusions. All new permissions comply.
- **Capability IA pins** (`tests/frontend/control-plane-ia.test.ts`): the
  Executive / Shared / Sector / System groups have exact membership. The new
  Administration area is a NEW navigation group placed after the pinned groups,
  and the Settings administration directory gains a governed destination.
- **Seed parity:** the seed derives `permissions` / `roles` /
  `role_permissions` rows from `constants.ts`, so the catalogue extension is
  seeded automatically; migration 0044 also inserts the mirror rows for
  existing databases so `assertPermissionCatalogParity()` stays truthful.

### 1.4 Baseline validation (before any change)

- `npm run typecheck` — clean.
- `npm run lint` — 1 pre-existing warning (`noelia-cross-os-visual.tsx` `<img>`),
  unrelated to this program.
- `npm run build` — success.
- `npm test` (embedded PostgreSQL 16, CI-equivalent env, live server) —
  **3684 passed / 0 failed / 28 skipped** (skips are the sandbox artifacts:
  sealed bootstrap from an earlier run + non-Supabase boundary suites).

---

## 2. Architecture (Phase 1)

### 2.1 Authority hierarchy

Implemented exactly as mandated: BEYU Family Trust → Holding → BEYU OS →
Authorized Administrative Authority → Users/Tenants/Organizations → Sector OSs.
BEYU OS remains the single control plane; the administrative capability is a
shared capability inside it.

### 2.2 Administrator classes

- **PLATFORM ADMINISTRATOR** — holds `PLATFORM_ADMIN`; may register/suspend/
  deactivate/remove users, register/transition/archive/remove tenants, govern
  membership, assign/revoke roles, delegate and revoke delegated authority,
  review administrative audit — each act separately capability-gated.
- **DELEGATED ADMINISTRATOR** — receives ONLY explicitly delegated capabilities
  and scope through `admin_authority_delegations`; never inherits PLATFORM_ADMIN.
- **TENANT/ENTITY ADMINISTRATOR** — any grantee whose authority is scoped to
  their tenant subtree (e.g. FOUNDATION_DIRECTOR inside one foundation tenant);
  cross-tenant attempts fail closed.
- **ORDINARY USER** — no administrative capability; `TENANT_MEMBER` is the
  zero-permission membership marker role.

### 2.3 Capability model (canonical permission catalogue extension)

The repo's canonical capability mechanism is the `PERMISSIONS` catalogue
(`domain:object.action`). The prompt's `CAP_*` list maps onto a fine-grained,
DELEGABLE admin set that extends — never duplicates — the existing umbrella:

| Prompt capability | Canonical permission | Held by |
| --- | --- | --- |
| CAP_USER_REGISTER | `identity:user.register` (new) | PLATFORM_ADMIN, GROUP_CEO |
| CAP_USER_VIEW | `identity:user.read` (existing) | unchanged |
| CAP_USER_UPDATE | `identity:user.manage` (existing umbrella) | unchanged |
| CAP_USER_SUSPEND / DEACTIVATE (+ activate) | `identity:user.suspend` (new) | PLATFORM_ADMIN, GROUP_CEO |
| CAP_USER_REMOVE | `identity:user.remove` (new, HIGH-RISK) | PLATFORM_ADMIN |
| CAP_TENANT_REGISTER | `organization:tenant.register` (new) | PLATFORM_ADMIN, GROUP_CEO |
| CAP_TENANT_UPDATE / SUSPEND / DEACTIVATE / ARCHIVE | `organization:tenant.manage` (new) | PLATFORM_ADMIN, GROUP_CEO |
| CAP_TENANT_REMOVE | `organization:tenant.remove` (new, HIGH-RISK) | PLATFORM_ADMIN |
| CAP_TENANT_MEMBER_ASSIGN / REMOVE | `identity:membership.manage` (new) | PLATFORM_ADMIN, GROUP_CEO |
| CAP_ROLE_ASSIGN / REVOKE | `identity:role.grant` (existing, HIGH-RISK) | unchanged |
| CAP_ADMIN_DELEGATE / REVOKE | `identity:delegation.manage` (new, HIGH-RISK) | PLATFORM_ADMIN |
| CAP_ADMIN_GOVERNANCE_VIEW / AUDIT_VIEW | `audit:log.read` / `audit:event.read` (existing) | unchanged |

`ADMIN_DELEGATABLE_PERMISSIONS` is the closed delegable set (the eight new
fine-grained keys plus `identity:role.grant`). `identity:delegation.manage` is
deliberately NOT delegatable — delegated administrators can never create
sub-delegations, structurally preventing recursive privilege amplification.

### 2.4 Delegation model

New table `admin_authority_delegations` (migration 0044): delegator, delegatee,
permission list (⊆ delegable set), tenant/entity/country scope, effective
window, status, reason, revocation fields, audit reference — with CHECK
constraints (non-empty permission and tenant scope, delegator ≠ delegatee,
window ordering) and indexes.

Effective authority = delegator authority ∩ delegated capability ∩ tenant scope
∩ entity scope ∩ country scope ∩ policy ∩ status ∩ time validity:

- `resolvePrincipal()` loads `activeDelegatedPermissions()` on EVERY request
  (same pattern as emergency grants), so revocation and expiry take effect
  immediately — never at session expiry.
- `can()` accepts a permission from `delegatedPermissions` through the SAME
  primitive (RBAC ∪ emergency ∪ delegation, then the full ABAC chain). No
  parallel authorization logic exists.
- Creation validates: delegator holds every delegated permission through
  ROLE-derived grants (re-delegation of delegated authority is impossible),
  scope ⊆ delegator's resolved tenant scope, delegatee is an active human user,
  window is valid, self-delegation refused.
- Exercise re-validates scope: when the acting principal's permission is
  delegation-derived only, the target tenant must be inside the delegation's
  scope (intersected with the principal's own tenant scope).

### 2.5 Lifecycles (existing `beyu_lifecycle_status` enum — no new enum)

- **User:** `CREATED` (registered; cannot authenticate) → `ACTIVE` → `SUSPENDED`
  ⇄ `ACTIVE`; → `DEACTIVATED`; → `REVOKED` (removal). Removal NEVER hard-deletes:
  the user and party rows are retained for audit/legal attribution, sessions are
  revoked, role assignments end-dated, party PII anonymized under
  `removed+<id>@anonymized.beyu.os`. Guards: no self-removal, no removal of the
  last active PLATFORM_ADMIN.
- **Tenant:** `CREATED` → `ACTIVE` → `SUSPENDED`/`DEACTIVATED` → `ARCHIVED` →
  `REVOKED` (removal). Removal first evaluates dependencies (users, sessions,
  active grants, legal entities, child tenants, operational rows in every
  tenant-scoped table); blockers are reported and the operation fails safely.
  No hard delete: financial/audit/legal/ownership history is retained.

### 2.6 Security boundary

UI visibility (`visible()` in capabilities.ts) → navigation → deep-link
(`requireAccess` per page) → API (`guarded()` with capability + rate limit +
audit) → service (re-authorization + scope) → database (RLS where tenanted;
F-01 admin-DSN boundary for `role_assignments`). The frontend is never the
authority; every mutation posts to a capability-gated API route. Unauthorized →
403, unauthenticated → 401, MFA step-up required → 428 — the existing canonical
fail-closed behavior.

### 2.7 Noelia / HIVE

Noelia holds no role, no session, and no admin capability; the delegation
service refuses service-account delegatees; no administrative write path is
reachable by an AI actor. New tests pin this.

---

## 3. Components delivered

- **Schema/migration:** `src/db/schema/admin-governance.ts`,
  `drizzle/0044_admin_user_tenant_governance.sql` (table + checks + grants +
  catalogue mirror + verification).
- **Authorization integration:** `src/lib/authz.ts` (`delegatedPermissions`,
  `activeDelegatedPermissions`), `src/lib/session.ts`.
- **Domain services:** `src/lib/admin/delegation.ts` (pure validation +
  resolution), `src/lib/admin/governance-service.ts` (all governed mutations
  with atomic audit + events).
- **API:** `/api/v1/admin/users`, `/users/[id]`, `/users/[id]/status`,
  `/tenants`, `/tenants/[id]/status`, `/memberships`, `/roles`,
  `/roles/[assignmentId]`, `/delegations`, `/delegations/[id]`, `/audit`.
- **UI:** `/os/administration` (+ `tenants`, `memberships`, `roles`,
  `delegations`, `audit`) in the existing `/os` shell and visual language; new
  Administration navigation group; Settings administration destination.
- **Tests:** `tests/admin/governance-service.test.ts`,
  `tests/admin/delegation.test.ts`, `tests/admin/admin-http.test.ts`,
  `tests/security/admin-security-matrix.test.ts`, `tests/admin/noelia-boundary.test.ts`.

See the final report for validation results, commit SHA and PR.

---

## 4. Validation results (Phase 8)

Executed against a fresh embedded PostgreSQL 16 cluster, in the exact CI
pipeline order (migrate → seed → setup-db-role → build → start → test):

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (1 pre-existing unrelated `<img>` warning) |
| Migration chain | 45/45 applied on a FRESH database in CI order (0044's role-permission mirror is INSERT…SELECT-guarded so a pre-seed database cannot hit the roles FK) |
| Runtime role | non-superuser, non-bypassrls; DML on `admin_authority_delegations`; **SELECT-only on `role_assignments` (F-01 preserved and re-verified)** |
| Unit (delegation engine) | 11/11 |
| Service integration (real PostgreSQL) | 15/15 |
| HTTP boundary (real server) | 7/7 |
| Adversarial security matrix | 10/10 |
| Architectural invariant pins | 13/13 |
| Navigation pin suites (control-plane-ia, capability-completeness, brand-identity, registry-feature-flags) | all green |
| Specialist no-second-truth suites | green after deliberate migration-count pin bump 43→44→45 (0043 ujenzi from main, 0044 this program) |
| **Full suite (`npm test`)** | **197 files / 3758 tests passed, 0 failed, 11 skipped (CI budget ≤ 15)** |
| Runtime page verification | all six `/os/administration/*` pages render with live data for the platform administrator; auditor/sector-operator deep links correctly render the governed denial panel; unauthenticated `/os/administration` is redirected by the layout gate; Settings shows the Administration destinations only to authorized principals; the executive dashboard's Governance panel surfaces real pending resolutions (pre-existing, capability-gated) |

### Security matrix proofs (tests/security/admin-security-matrix.test.ts)

1. Unauthenticated → 401 on every `/api/v1/admin/*` route (GET and POST).
2. Ordinary sector user → 403 (no capability).
3. Cross-tenant denial — canonical `assertWithinScope` refuses out-of-subtree tenants.
4. Delegated administrator holds ONLY the delegated capability through the SAME `can()`; never PLATFORM_ADMIN.
5. Delegation scope can only NARROW (intersection), never widen.
6. EXPIRED delegation contributes zero authority on the next resolution.
7. REVOKED delegation contributes zero authority even inside its window (revocation outranks window).
8. No self-escalation (self-grant, self-delegation, self-lifecycle all refused).
9. No re-delegation (delegating is structurally non-delegable; chains have depth one).
10. Noelia/HIVE: no `users` row, no role, no capability, not eligible as a delegatee (DELEGATEE_INVALID).

### Remaining implementation gaps (honest inventory)

- A dedicated "transfer home tenant" act does not exist (revoking home-tenant
  membership is refused by design; the governed path today is
  register-in-new-tenant + remove).
- Delegation instruments have no renewal operation; a lapsed instrument is
  revoked/re-created (deliberate: renewal-in-place invites scope creep).
- The administrative audit surface filters the canonical ledger by the
  administrative action set; arbitrary actor/tenant search facets are future
  work on the EXISTING audit capability, not a new audit model.
