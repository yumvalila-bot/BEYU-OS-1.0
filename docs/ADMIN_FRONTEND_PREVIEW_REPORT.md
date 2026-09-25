# BEYU Admin — Frontend Preview: Implementation Report

**Scope:** enable the current canonical BEYU administrator to preview, inspect and develop
the frontends of the six canonical BEYU frontend surfaces — Health OS, Finance OS,
Agriculture OS, Ujenzi OS, Foundation OS (Sector OSs) and Family Office (capability/domain
surface, **not** an OS) — inside this repository, under the existing governed authorization
chain.

**Branch:** `arena/01a0d58f-beyu-os-1-0` · **Implementation commit:** `963e49901e13fdc4a67d4a97bdcc72a44dbdd990`

---

## 1. Per-surface status (pre-change → post-change)

Pre-change admin access was the audit matrix required before modification:

| Surface | Route (pre) | Frontend status (pre) | Admin access (pre) | Missing pieces (pre) |
|---|---|---|---|---|
| Health OS | `/os/health` → `/health` | Real mount + canonical federation truth page | Blocked at federation gate (fail-closed, `NOT_LINKED`/unavailable — no `beyu_identity` link in this deployment) | None for preview: the honest canonical state is the truth page; federation linking is an external Health-backend concern |
| Finance OS | `/os/finance`, `/os/finance/payments` | Real page + `requireAccess` guards + data panels | **Denied** — `PLATFORM_ADMIN` role held no `finance:*.read` | Read-side finance grants on the canonical admin role |
| Agriculture OS | `/os/agriculture`, `/os/agriculture/capabilities` | Real page + `agriculture:data.read` guard + entity-scope refusal | **Denied** — no `agriculture:data.read` | `agriculture:data.read` |
| Ujenzi OS | `/os/ujenzi` + 13 subroutes | Real page + `ujenzi:data.read` guard + entity-scope refusal in layout | **Denied** — no `ujenzi:data.read` | `ujenzi:data.read` |
| Foundation OS | `/os/foundation` + 13 subroutes | Real page + 11+6 foundation guard codes + target-scope resolution | **Denied** — no `foundation:*.read` | Read-side foundation grant set |
| Family Office | `/os/family`, `/os/family/capital`, `/os/family/protection(+[policyId])` | Real page + `family:member.read` / `familyoffice:capital.read` guards + per-panel `can()` | **Denied** — no `family:*` / `familyoffice:*` | Read-side family/familyoffice grant set + a visible canonical entry point (absent from the launcher by design — it is not a Sector OS) |

Post-change: the canonical admin role holds the full read-side capability set of all six
surfaces (item 6); every surface's own server-side guard, ABAC scope and RLS boundary run
unchanged on entry. The admin's launcher gains the governed "BEYU Admin — Frontend Preview"
section listing all six surfaces with their live authorized/denied state, and the `/os`
shell header shows the indicator (item 6, item 7).

Data-state truth (no fabricated data anywhere):

| Surface | Canonical data state in this deployment |
|---|---|
| Health OS | **NOT_CONNECTED** — the federation identity bridge (`beyu_identity.beyu_identity_links`) is an external Health-backend schema; no link rows exist here. The mount fails closed and `/health` renders the canonical truth page. Nothing is presented as connected. |
| Finance OS | Real seeded ledger/finance data rendered by the existing panels (governed by `finance:*.read` + tenant scope + RLS). |
| Agriculture OS | Seeded agriculture data via existing panels (`agriculture:data.read`). |
| Ujenzi OS | Seeded construction data via existing panels (`ujenzi:data.read`); entity-scoped principals refused at the layout boundary. |
| Foundation OS | Seeded foundation registry/funds data via existing panels (11+6 `foundation:*.read` codes, target-scope resolved). |
| Family Office | Real seeded family data, **classification-ceiling limited**: seed inserts 2 members defaulting to `HIGHLY_RESTRICTED`; the admin's `RESTRICTED` clearance therefore sees an empty member list — the correct, honest outcome of the classification ceiling, not a defect. A `HIGHLY_RESTRICTED` principal (e.g. Group CEO) sees the 2 rows (asserted in tests). |

## 2. Exact routes

| Surface | Entry route | Subroutes |
|---|---|---|
| Health OS | `/os/health` (mount) → 307 → `/health` | `/health` (canonical federation truth page) |
| Finance OS | `/os/finance` | `/os/finance/payments` (plus the shared finance-domain capability routes `/os/tax`, `/os/capital`, `/os/waterfall`, `/os/workflow`) |
| Agriculture OS | `/os/agriculture` | `/os/agriculture/capabilities` |
| Ujenzi OS | `/os/ujenzi` | `boq-cost`, `claims`, `equipment`, `handover`, `hse`, `materials`, `payments`, `procurement`, `projects`, `projects/[id]`, `quality`, `site`, `variations` (13) |
| Foundation OS | `/os/foundation` | `beneficiaries`, `compliance`, `donors`, `formation`, `funds`, `governance`, `grants`, `operations`, `programs`, `registry`, `safeguarding`, `structures`, `tax` (13) |
| Family Office (capability surface, **not an OS**) | `/os/family` | `/os/family/capital`, `/os/family/protection`, `/os/family/protection/[policyId]` |

All six entry routes pre-date this change; none was added, renamed or hidden. The Family
Office listing in the admin preview section is the smallest possible consistent entry point
(the existing canonical page), and it does not enter the Sector OS registry.

## 3. Reused components (no new page components)

- **Six surfaces themselves:** 100% existing pages/components — every `requireAccess` guard,
  data panel, `Denied` component and layout gate is untouched.
- **Launcher preview section** (`src/app/launcher/page.tsx`): reuses the existing
  `SECTOR_OPERATING_SYSTEMS` canonical registry (no literal sector hrefs — keeps the
  launcher's registry-purity test green), the existing `Icon` registry, the existing
  `DestinationCard`/section styling patterns, and the already-computed
  `authorizedOperatingSystems()` results (no new resolver).
- **`/os` header indicator** (`src/app/os/layout.tsx`): one inline `span` in the existing
  header row; reuses the existing `resolvePrincipal()`/`can()` machinery and the
  `admin_bootstrap_state` singleton already in the schema.
- **Tests:** reuse `tests/helpers/http.ts` (`login`, `apiGet`, `isDeniedPage`,
  `serverAvailable`) and `tests/noelia/db-fixtures.ts` conventions; source-assert style
  follows the repo's existing architecture-boundary suites.

## 4. Changes made (6 files, scoped)

| File | Change |
|---|---|
| `src/lib/constants.ts` | `PERMISSIONS` += `platform:frontend.preview` (presentation-only, documented as granting no data access). `ROLES.PLATFORM_ADMIN.permissions` += the read-side set: `platform:frontend.preview`, `ai:noelia.query`, 6× `finance:*.read`, `agriculture:data.read`, `ujenzi:data.read`, 17× `foundation:*.read`, 3× `family:*.read`, 11× `familyoffice:*.read`, `governance:resolution.read`, `hcm:employee.read`. **Zero write codes added.** No role descriptions, no role catalogue structure, no other role touched. Permissions are computed from the in-code catalog at runtime — no database migration. |
| `src/app/os/layout.tsx` | Server-resolved `frontendPreview` = sealed bootstrap singleton `admin_user_id === principal.userId` **AND** `can(principal, "platform:frontend.preview")`; renders the gold "BEYU Admin — Frontend Preview" chip in the header (title text states the marker grants nothing). Missing state row fails closed to "no marker". |
| `src/app/launcher/page.tsx` | Gated section "The six canonical frontend surfaces" (visible only when `platform:frontend.preview` holds): 5 Sector OS rows from `SECTOR_OPERATING_SYSTEMS` + 1 Family Office row (labeled "BEYU capability/domain surface — never an OS"); per-surface state from the existing resolvers; authorized → "Open frontend →" link, else the exact missing-grant/`NOT_CONNECTED` label. Read-only chip: "DEVELOPMENT PREVIEW — READ-ONLY, GOVERNED". |
| `tests/frontend/admin-frontend-preview.test.ts` | **New** — 31 tests implementing the 14 mandated proofs (item 13). |
| `tests/viz/interactions.test.ts` | Finance-negative fixture swapped from admin → `hcm@beyu.os` (HCM_DIRECTOR): the admin is now a legitimately-authorized finance principal, so the grant-less negative fixture must be a different identity. |
| `tests/viz/family-office-view.test.ts` | Same swap for the `family:member.read` negative; the ownership negative (admin) is unchanged and still valid (admin holds no `organization:ownership.read`). |

No other source file changed. (A build artifact, `src/app/health/os/spa-content.ts`, was
regenerated by `npm run build`'s `build:health-spa` step and explicitly reverted to its
committed placeholder to keep the diff scoped — it is rebuilt by every build.)

## 5. Admin-access resolution (no new or duplicate admin)

- The canonical BEYU administrator is the **bootstrap-sealed identity**:
  `admin_bootstrap_state` singleton (`id = "SINGLETON"`) → `admin_user_id` =
  `fixedId(USR, "PLATFORM_ADMIN")` — a deterministic **GlobalUserID** (`users.id`), tenant
  `BEYU-GROUP` (ENTERPRISE root, `RESTRICTED` clearance), single `PLATFORM_ADMIN` role
  assignment granted by `OWNER_BOOTSTRAP_PREPARATION`. Enrollment is terminal (SEALED).
- `admin@beyu.os` is a seed convenience **only** — it is never an identity check anywhere
  in this change (asserted by test: the preview capability is bound to the sealed
  GlobalUserID, and a permissionless principal is denied).
- No new admin user, no duplicate admin identity, no hardcoded email in code.
- The `PLATFORM_ADMIN` role grant is catalog-based (`permissionsForRoles` computes
  permissions from `ROLES` at runtime); nothing about the admin's stored identity,
  GlobalUserID or role assignment changed.

## 6. Preview authorization mechanism

Flow for every previewed surface (all stages server-side, all pre-existing except stage 4
which is a named grant in the same catalog):

1. **BEYU admin authentication** — existing session (`resolvePrincipal`), MFA/step-up
   unchanged.
2. **GlobalUserID** — `principal.userId` is the canonical `users.id` GlobalUserID.
3. **Admin authz** — role grants resolved from the canonical catalog
   (`permissionsForRoles`), including the six-surface read-side set (item 4).
4. **Preview permission** — `platform:frontend.preview`: a named, catalogued,
   **presentation-only** permission. It renders the indicator and the launcher section. It
   satisfies no data guard on any surface, is not high-risk, is not delegable, and is held
   by no role other than `PLATFORM_ADMIN` (all asserted in tests).
5. **Surface entry** — the existing unchanged server-side authorization of that surface:
   `requireAccess` permission codes, `operatingSystemTenantInScope` / target-scope
   resolution, entity-scope refusals, Health federation gate, per-panel `can()` checks.
6. **RLS as final boundary** — every query runs through `withTenantDatabaseContext`
   (present in all five Sector OS pages) with the admin's actual tenant/entity/country
   scope and `RESTRICTED` clearance ceiling.

The preview therefore **cannot grant any permission the admin does not already possess**:
the granted set was audited in code — it is exactly the union of the six surfaces'
existing read guards, all ending in `.read`, with zero write/administrative codes
(asserted: zero non-`.read` codes in the six namespaces; `can(admin, "finance:ledger.post")`,
`can(admin, "finance:waterfall.commit")`, `can(admin, "foundation:grant.approve")` all
`false`; no emergency-access or delegation rows created).

## 7. Security preservation

All invariants verified intact (new suite + full regression):

- **GlobalUserID / RBAC / ABAC** — unchanged; the preview is a role-catalog grant, resolved
  server-side exactly like any other permission.
- **Tenant / entity / country isolation** — `tenantScopeIds` subtree for
  `GLOBAL_GOVERNANCE_ROLES` unchanged (covers `BEYU-GROUP`, `BEYU-TZ`, `BEYU-AGRI`,
  `BEYU-FOUNDATION`, `BEYU-UJENZI` — asserted); entity-scoped principals still refused at
  the ujenzi/foundation layout boundary and the agriculture page boundary (asserted by
  source + existing behavior); `withTenantDatabaseContext` present in all five Sector OS
  pages (asserted).
- **Classification ceilings** — admin stays `RESTRICTED`; sector tenants are `CONFIDENTIAL`
  (resolved); `family_members` default `HIGHLY_RESTRICTED`, so the RESTRICTED admin
  genuinely sees 0 family rows while a `HIGHLY_RESTRICTED` principal sees 2 (asserted — the
  ceiling is a live boundary, not decorative).
- **Step-up MFA, delegation, emergency access** — untouched; asserted that the admin has no
  emergency-access or delegation rows from this change.
- **No client-controlled privilege** — source-asserted: none of the six entry files reads
  `searchParams`/`useSearchParams`/`URLSearchParams`/`request.url` for authorization;
  HTTP-proven: `?admin=true`, `?preview=true`, `?role=PLATFORM_ADMIN`,
  `?tenant=…`, `?bypass-auth=true` all still denied for an unauthorized user (and never
  grant the admin anything they don't have).
- **Unauthenticated and unauthorized users stay blocked** — HTTP-proven on all six surfaces
  (unauthenticated ×6; HCM-director unauthorized ×5 + Health canonical fail-closed page).
- **Deep-link authz** — direct navigation to every canonical route re-runs the full
  server-side chain (asserted in the new suite's deep-link section).
- **No service-role / production credentials in the browser** — asserted: no `@/db/admin`
  imports anywhere under `src/app`; no `BEYU_ADMIN_DATABASE_URL` or superuser DSN in the
  changed page/layout code; the runtime pool keeps its `NOSUPERUSER NOBYPASSRLS` role.
- **No hidden routes** — everything is a pre-existing visible route; the new UI is a
  section in two existing pages.

## 8. Demo-data isolation

No demo data was added, and none is presented as real data. The surfaces render their
governed real (seeded) data or their canonical truth states. Health OS explicitly shows
**NOT_CONNECTED** (federation bridge absent in this deployment) rather than any simulated
connection. There is no `?demo` flag, no demo seed toggle, and no fixture that writes to
production data paths; the only data the tests touch is the throwaway CI database.

## 9. Family Office status

**Capability/domain surface — not a Sector OS, never `FAMILY_OFFICE_OS`.** It lives in the
control plane at `/os/family` (with `/capital`, `/protection`), is deliberately absent from
`SECTOR_OPERATING_SYSTEMS` and the launcher's Sector OS grid, and is listed in the admin
preview section explicitly labeled "BEYU capability/domain surface — never an OS". The
family page's own copy ("never a separate OS") is asserted by test. Its authorization is
the existing `family:member.read` / `familyoffice:*.read` guard set — extended to the
canonical admin's role read-side, nothing more.

## 10. Tax handling

**Tax remains a shared capability** — no `TAX_OS` was created. Tax capability routes
(`/os/tax` in the finance-domains capability group; `foundation:tax.read` panel in the
Foundation OS) are unchanged. The admin's new `finance:tax.read` and `foundation:tax.read`
grants are read-side entries in the existing shared-capability permission namespaces; no
tax application, OS code or catalogue entry was added (asserted: no `TAX_OS` string in any
`src` file; capability IA keeps Tax in the shared/finance-domains groups).

## 11. HCM handling

**HCM remains a shared capability** — no `HCM_OS` was created. `/os/hcm` and its guard
(`hcm:employee.read`) are unchanged; the admin received `hcm:employee.read` (read-side,
needed for the six-surface read set's completeness — the Family Office surface consults
HR-related panels). The HCM role (`HCM_DIRECTOR`) is additionally used in two test
fixtures as the canonical *unauthorized* principal for finance/family negatives (it holds
neither namespace), which is what makes the negative proofs honest. No `HCM_OS` string in
any `src` file (asserted).

## 12. Noelia handling

Single canonical identity preserved: `NOELIA_AI` (`NOELIA_CANONICAL_ID`), single asset
`public/NOELIA.png` (exists), `NoeliaShellForOS` reused in the OS layout with the existing
`ai:noelia.query` gate (which the admin's read set includes — already the canonical way
every OS shell queries Noelia). No sector-specific Noelia identities, no replacement
assets, no new assets. All four points asserted in the new suite.

## 13. Tests executed + results

**New suite `tests/frontend/admin-frontend-preview.test.ts` — 31 tests, all passing**,
covering the 14 mandated proofs:

| # | Mandated proof | Where |
|---|---|---|
| 1 | Unauthenticated users blocked on all six surfaces | HTTP ×6 (no cookies → login redirect / canonical states) |
| 2 | Unauthorized-authenticated users blocked on all six | HTTP ×5 (HCM_DIRECTOR denial panel) + Health canonical fail-closed |
| 3 | Admin previews all six frontends | HTTP: admin 200 + non-denied HTML on all six; launcher lists all six with governed state |
| 4 | Preview adds no DB permissions | Source: zero non-`.read` codes in the six namespaces; write probes `can()=false`; no emergency/delegation rows; preview permission held only by PLATFORM_ADMIN, catalogued, not high-risk, not in `ADMIN_DELEGATABLE_PERMISSIONS` |
| 5 | No RLS/tenant/entity/country bypass | Source: `withTenantDatabaseContext` in all five Sector OS pages; entity-scope refusal in ujenzi/foundation layouts + agriculture page; tenant scope ⊇ required codes; classification-ceiling DB proof (RESTRICTED admin → 0 family rows vs HIGHLY_RESTRICTED → 2) |
| 6 | URL manipulation can't escalate | HTTP: `?admin=true`, `?preview=true`, `?role=…`, `?tenant=…`, `?bypass-auth=true` all stay denied; source: no `searchParams`/`useSearchParams`/`URLSearchParams`/`request.url` in the six entry files |
| 7 | No service-role credentials in browser | Source: no `@/db/admin` under `src/app`; no admin DSN/superuser creds in changed page code |
| 8 | Deep-link authz holds | Direct GETs to every canonical route re-run the server-side chain |
| 9 | Shared capabilities not duplicated | Source: capability IA groups (shared/sector/finance-domains) intact |
| 10 | No `FAMILY_OFFICE_OS` | Source scan of all `src` files; Family Office absent from Sector registry |
| 11 | Tax shared | `TAX_OS` absent; Tax in shared/finance-domains capability groups |
| 12 | HCM shared | `HCM_OS` absent; `/os/hcm` route + guard unchanged |
| 13 | Canonical admin binding (not email) | Bootstrap singleton → fixed GlobalUserID → PLATFORM_ADMIN; permissionless principal denied |
| 14 | Noelia canonical | `NOELIA_AI`, asset exists, no sector identities, `ai:noelia.query` + `NoeliaShellForOS` in layout |

**Full CI-equivalent regression** (embedded PostgreSQL 16, migrations applied, DB role set
up, seeded, production build, `next start`, `BEYU_TEST_BASE_URL` set):

```
Test Files  298 passed | 3 skipped (301)
     Tests  4980 passed | 11 skipped (4991)
```

Zero failures, zero errors — including all pre-existing suites (the two viz suites with
swapped fixtures, launcher registry-purity, governance, RLS/ledger, Noelia security,
bootstrap/constitution suites).

## 14. Build / lint / typecheck results

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **pass** (clean) |
| Lint | `npm run lint` (`eslint .`) | **pass** (0 errors; 1 pre-existing `no-img-element` warning in `noelia-cross-os-visual.tsx`, untouched by this change) |
| Build | `npm run build` (brand check → identity → Health SPA → `next build`) | **pass** (all routes compiled, including `/os/health` mount and all six surfaces) |
| Deployment-parity build | `npm run build` with all runtime env cleared (CI's cleared-env gate) | **pass** (covered by the `build-without-database-url` suite in the full run) |

## 15. PR / commit and remaining gaps

- **Implementation commit:** `963e49901e13fdc4a67d4a97bdcc72a44dbdd990` on
  `arena/01a0d58f-beyu-os-1-0` (this report committed alongside).
- **PR status:** push/PR creation is **blocked on the sandbox's GitHub connection** — both
  ambient tokens (`GH_TOKEN`, `GITHUB_TOKEN`) return "Bad credentials", so `git push` and
  `gh pr create` cannot authenticate. No auto-merge, promotion, DNS or production change
  was attempted, per the human-promotion gate: **work stops here for a human** until the
  GitHub connection is restored, after which the only remaining steps are
  `git push origin arena/01a0d58f-beyu-os-1-0` and opening the PR.
- **Remaining gaps / notes (by design, not defects of this change):**
  1. Health OS federation is genuinely **NOT_CONNECTED** in this deployment (external
     `beyu_identity` schema/link rows are owned by the Health backend). The canonical truth
     page is the correct preview state; actual federated preview awaits the Health backend
     link, outside this repo's scope.
  2. The seeded family members default to `HIGHLY_RESTRICTED`, so the RESTRICTED admin sees
     an empty family list — correct ceiling behavior. If the org wants the admin to *see*
     those rows, that is a data-classification governance decision, not a preview
     defect (and would require a deliberate, separate change).
  3. PR number pending GitHub connectivity (item above).
