# BEYU OS — post-sign-in failure audit and minimum safe remediation

**Date:** 2026-10-12 · **Baseline (main):** `9669640` (PR #105 merge)
**Working branch:** `arena/cc54151c-beyu-os-1-0` · **Change under review:** PR #106
**Runtime examined:** the real production build of the branch, served by `next start`, against a
PostgreSQL 16 provisioned from this repository's own migrations, seed and role scripts.

**Change control observed:** no push to `main`, no merge or auto-merge, no deploy/promote/rollback, no
DNS/domain/registrar/TLS change, no production secret, no production migration created or applied, no
security test disabled, no RLS or authorization weakened, no failure hidden to green a pipeline. All
work sits behind PR #106 at the human review gate.

---

## 1. Executive summary

The reported symptom — a signed-in user seeing **"BEYU OS could not load this view." / "Please try
again." / "Access remains subject to your existing permissions."** — is not an authorization decision.
It is the root route error boundary (`src/app/error.tsx`), and in production it was being triggered by
a **database that is missing migration `0075_noelia_authority_execution_hardening`**, whose column
`role_assignments.global_scope` is read by every principal resolution.

Because the sign-in page never queries the database without a session cookie, and because readiness
(`/api/health`) is a table-less `select 1`, the deployment reported **healthy** and **login
succeeded** while **every authenticated view failed** — and the only screen the user saw attributed it
to permissions.

Reproduced end to end on 2026-10-12 (see §4), root-caused from GitHub Actions deployment evidence
(§3), and remediated in three narrow ways on PR #106: the boundary now tells the truth about a load
failure and surfaces the log-correlating digest; the build no longer publishes a frozen migration
literal as its expected release fact; and a new read-only, unauthenticated
`GET /api/health/schema` names the condition (`CURRENT` / `BEHIND` / `AHEAD` / `UNKNOWN`) so the next
occurrence is visible from outside instead of silent.

**Production remediation (applying 0075 through `db-release`) is not performed here.** It requires a
human and the production secret that the pipeline currently reports as unconfigured.

---

## 2. Symptom → first failing request → root cause

| Step | Fact | Evidence |
| --- | --- | --- |
| 1 | `resolvePrincipal()` returns early when no session cookie is present | `src/lib/session.ts`; `GET /` → **200** while signed out (live, §4) |
| 2 | Sign-in itself succeeds | `POST /api/v1/auth/login` → **200** + `beyu_os_session` (live, §4) |
| 3 | The first session-bearing request fails at the **first database read** | `GET /`, `/os`, `/launcher`, `/os/finance` → **500** (live, §4) |
| 4 | That read is the role-grant query | `src/lib/authz.ts` `loadGrants()` (line 96) selects `roleAssignments.globalScope` (line 104) |
| 5 | The column exists only from migration 0075 | `drizzle/0075_noelia_authority_execution_hardening.sql` line 7: `ALTER TABLE "role_assignments" ADD COLUMN IF NOT EXISTS "global_scope" …` (added by PR #96 / `ab09460`, merged `5cdaf171`) |
| 6 | The database does not have it | Server log: `Failed query: select … "role_assignments"."global_scope" … [cause]: error: column role_assignments.global_scope does not exist` (SQLSTATE 42703) |
| 7 | The failure is therefore rendered by the error boundary, whose copy blames permissions | `src/app/error.tsx` is the **only** source of that string in the repository; every authorization outcome has its own governed copy |

**Why the pipeline could not see it.**

| Probe | Behaviour in this state | Why |
| --- | --- | --- |
| `GET /api/health` | **200** `{"checks":{"database":"UP"}}` | readiness is a table-less `select 1` (`src/lib/db-health.ts`) and knows nothing about schema revision |
| `GET /api/health/identity` | the **artifact's** expected migration | a build-time fact; never compared with the database — and it previously reported a **frozen** tag (see §6) |
| `GET /` (no cookie) | **200** | the principal resolver returns before any query |
| every view after sign-in | **500** → error boundary | the resolver's grant query references a column the database does not have |

---

## 3. Deployment evidence (why the database is behind)

| Run / commit | Evidence |
| --- | --- |
| `37955264218` @ `86dc7e77`, 2026-10-09T15:55Z — last **successful** production deploy | all jobs success; its `drizzle/meta/_journal.json` ends at **`0074_enterprise_intelligence_expansion`**; 0075 did not exist yet |
| `38018982829` @ `5cdaf171`, 2026-10-10T02:59Z — the push that shipped 0075 | Migration validation ✅; Production preflight ✅; **Production database deploy + verify ❌ at step 3 "Fail closed if production secrets are not configured"** → steps 4–9 (*apply pending migrations*, role provisioning, verification) **skipped**; `runtime-verify`, release record and PVG all **skipped** |
| `38025828217` (`2c9db21b`, PR #104 merge), `38052360038`, `38157765676`, `38203769950` (`9669640`, PR #105 merge) | deploy job **skipped** (after #104 the mutating jobs are dispatch-only by design) and **Migration validation fails in 3–5 s with zero executed steps** — a runner/infrastructure failure, not an assertion failure. Migration validation is the repository-side scratch-DB proof and runs before any live job |
| `38203769951` / `38227403742` (CI workflow) | all jobs fail in 2–5 s with an empty `steps` array — same signature on `main` HEAD and on this branch, including jobs unrelated to this change |

**Conclusion.** The production database was last migrated when the repository head was 0074. 0075 was
merged, but its deployment failed closed before applying migrations, and every attempt since has
either been skipped or has failed before executing a single step. This audit cannot see production
directly, and no credential or production access is used anywhere in it.

---

## 4. Reproduction (local, 2026-10-12)

The sandbox database was put into the exact production shape (0075 not applied: `role_assignments`
lacks `global_scope`, and the ledger has no 0075 row). Production build, real TOTP sign-in:

| Probe | Result |
| --- | --- |
| `GET /` (no session cookie) | **200** — the sign-in page renders |
| `POST /api/v1/auth/login` | **200** + session cookie — **sign-in succeeds** |
| `GET /`, `GET /os`, `GET /launcher`, `GET /os/finance` (with session) | **500** → the error boundary |
| `GET /api/health` | **200** `{"ok":true,"checks":{"database":"UP"}}` |
| `GET /api/health/schema` (after the change) | **`BEHIND`** — `appliedMigration: 0074_…`, `expectedMigration: 0075_noelia_authority_execution_hardening` |
| server log | `digest: '3288190508'` and the same digest appears in the 500 response payload — the correlation the old boundary discarded |
| after `npm run migrate` (governed forward path) | ledger 76 rows with the original checksum `0a7502a3…`; `/api/health/schema` → `CURRENT`; authenticated pages **200** again |

Recovery used the canonical migration runner (`0000…0075`, per-migration transactions, advisory lock) —
**not** a manual DDL shortcut, and not reproduced in any deliverable.

---

## 5. Current-state matrix

| Requirement | Existing implementation | Evidence | Gap | Risk | Action |
| --- | --- | --- | --- | --- | --- |
| Sign-in leads to a working view | session → principal → destination routing | §4: login 200 but every authenticated view 500 in the production shape | the database state that breaks it was **invisible** | total lock-out of authenticated users, misattributed to permissions | **fixed in PR #106** (visibility + truthful boundary) |
| Access failures are not misreported as load failures (and vice versa) | error boundary = the only "could not load this view" surface; no `global-error.tsx` | 105 routes × 10 identities = ~1,050 authenticated loads, **0 renders**, 0 5xx (excluding the simulated DB state) | the boundary asserted a permissions fact | users and operators misdiagnose outages as authorization | **fixed in PR #106** (copy + digest + explicit "not an access decision") |
| Migration state is externally observable | `/api/health` (readiness), `/api/health/identity` (artifact expectation), `/api/health/live` (liveness) | §3 | **no probe compared artifact vs database** | a behind database is indistinguishable from a healthy one | **added**: `GET /api/health/schema` |
| Release identity states the truth | `scripts/build-identity.mjs` → `latestMigration` | run output and `generated-identity.json`: previously `0047_release_approvals` in every build | frozen literal, no deployment sets `BEYU_LATEST_MIGRATION` | a false release fact in the surface PVG reads | **fixed**: derived from `drizzle/meta/_journal.json` |
| Host selects experience, never access | `src/lib/canonical-hosts.ts`, `src/proxy.ts`, `src/app/page.tsx` | §7 host table (live probe) | none found in the host map | — | none |
| Each destination renders its own frontend | destination-aware sign-in + per-destination routes | §8 matrix; 41 screenshots | apex/neutral hosts fall back to `/launcher` for multi-destination principals | product-level (see §11.2) | **owned by PR #103** (`authenticatedEntryRoute()`), deliberately not duplicated here |
| UI reflects effective permissions | destination gates re-run server-side per request | §9; screenshots 09–12, 24 | none found | — | none |
| Server and DB enforce independently of the UI | `guarded()`, `can()`, `evaluatePolicy()`, RLS | screenshots 15–17, 19, 23; no-JS renders | none found | — | none |

---

## 6. Changes in PR #106, and what was deliberately NOT changed

| File | Rationale |
| --- | --- |
| `src/app/error.tsx` | Tell the truth: the view could not be **loaded**; nothing was granted or removed; a load failure is **not** an access decision. Surface the opaque Next.js `digest` so an operator can find the server log line that carries the cause. The raw exception is never rendered or logged. Branded accessible reset kept. |
| `src/lib/health/schema-state.ts` *(new)* | Read-only classification of `public.beyu_migrations` against the migration the running artifact expects (from `drizzle/meta/_journal.json`, compiled into the bundle, with the build identity as the authoritative override). Fails honest: unreadable ledger, unordered tag, or unknown expectation ⇒ `UNKNOWN`, never `CURRENT`. No policy, no authorization input, no write, no new registry. |
| `src/app/api/health/schema/route.ts` *(new)* | Unauthenticated, information-free diagnostic (`CURRENT`/`BEHIND`/`AHEAD`/`UNKNOWN` + two public migration tags + a count). Always 200 with the state in the body; **deliberately not wired into readiness** (a readiness probe used as a liveness probe turns a database incident into a restart loop — see `src/app/api/health/live/route.ts`). One structured `schema_state_probe` log line only when code and database disagree. |
| `scripts/build-identity.mjs` | Derive `latestMigration`/`migrationCount` from the canonical journal instead of a frozen literal; export the parsers as pure functions; run the capture only when executed directly. |
| `src/lib/release/identity.ts` | Type the new build field. |
| `tests/health/schema-state.test.ts` *(new)* | 22 tests: the classification matrix including the exact reproduced shape (ledger 0074 / artifact 0075 ⇒ `BEHIND`), honest `UNKNOWN` branches, the derived expectation, "leaks nothing / authorizes nothing", and the error-boundary contract. |
| `docs/audit/evidence/2026-10-12-post-login-failure/**` | 41 screenshots + inventory + README (§10). |

**Not changed, on purpose:** no migration added or applied; no RLS policy, grant, role or tenant
touched; no authorization bypass, no widened access, no hardcoded admin default; no exception
swallowed; no test disabled; the `/launcher` fallback for multi-destination principals is **left to
PR #103**, which already owns that fix; production remediation is left to the governed
`db-release` path.

---

## 7. Canonical host map (verified live, 9 hostnames / 8 classifications)

| Hostname | Resolution kind | Destination | Anonymous entry | Authenticated, authorised | Authenticated, unauthorised |
| --- | --- | --- | --- | --- | --- |
| `beyu.co.tz` | CONTROL_PLANE | BEYU HOME | "Sign in to the control plane" | control plane / launcher | — |
| `www.beyu.co.tz` | CONTROL_PLANE | BEYU HOME | as above | as above | — |
| `health.beyu.co.tz` | SECTOR_OS | HEALTH_OS | "Sign in to Health OS — governed by BEYU OS" | `/os/health` (Health gate) | destination denial on the host |
| `finance.beyu.co.tz` | SECTOR_OS | FINANCE_OS | own destination sign-in | 307 `/os/finance` (200) | destination denial |
| `agriculture.beyu.co.tz` | SECTOR_OS | AGRICULTURE_OS | own destination sign-in | 307 `/os/agriculture` | destination denial |
| `ujenzi.beyu.co.tz` | SECTOR_OS | UJENZI_OS | own destination sign-in | 307 `/os/ujenzi` | destination denial |
| `foundation.beyu.co.tz` | SURFACE (nonprofit) | FOUNDATION | own destination sign-in | `/os/foundation` | destination denial |
| `familyoffice.beyu.co.tz` | SURFACE (capability) | Family Office | own destination sign-in | 307 `/os/family` | destination denial |
| `noelia.beyu.co.tz` | SURFACE (AI interface) | NOELIA_AI | own destination sign-in | 307 `/os/noelia` | destination denial |

Unknown labels (`unknown.beyu.co.tz`, `evil.beyu.co.tz`) resolve `NEUTRAL` with `destination: null` and
render the control-plane entry — no destination metadata, no redirect to a destination. **No mismatch
found between the canonical architecture (four Sector OSes; Foundation a separate nonprofit; Family
Office a capability; a single NOELIA_AI; HCM a shared capability; MINING_OS non-canonical) and the
executable catalogue** (`src/lib/operating-system-catalog.ts`, `src/lib/canonical-hosts.ts`).

---

## 8. Frontend-independence matrix

| Destination | Own entry surface | Own sign-in identity | Post-auth landing | Screenshot |
| --- | --- | --- | --- | --- |
| BEYU HOME | yes (control plane) | yes | `/os` (control plane) | `01-…` |
| HEALTH_OS | yes | "Sign in to Health OS" | `/os/health` behind the Health identity-federation gate (fails closed without an ACTIVE link) | `02-…`, `25-…` |
| FINANCE_OS | yes | "Sign in to Finance OS" | `/os/finance` | `03-…`, `18-…`, `20-…` |
| AGRICULTURE_OS | yes | own | `/os/agriculture` | `04-…`, `24-…` |
| UJENZI_OS | yes | own | `/os/ujenzi` | `05-…`, `11-…`, `23-…` |
| FOUNDATION | yes | own | `/os/foundation` | `06-…` |
| Family Office | yes | own | `/os/family` | `07-…` |
| NOELIA_AI | yes | own | `/os/noelia` | `08-…`, `21-…` |

Shared under all of them: one sign-in implementation, one session model, one shell/token system,
one authorization layer. **Known limitation:** a principal with more than one authorised destination
who opens an apex/neutral host is still routed to the launcher rather than to a "home" experience —
that is a routing-product decision being changed in PR #103, and this audit did not duplicate it.

---

## 9. Role-aware UI, server and database enforcement

| Requirement | Evidence | Result |
| --- | --- | --- |
| Single-OS user sees only what is granted | `09-role-single-os-launcher-desktop.png` (cfo@beyu.os) | BEYU OS + Finance OS launchable; Health/Agriculture/Ujenzi listed but not launchable |
| Multi-OS user sees only explicit grants | `10-role-multi-os-launcher-desktop.png` (admin@beyu.os) | union of explicit grants; the role's name implies nothing |
| Unauthorised deep link (destination host) | `11-…`, `24-…` | "You are signed in, but you are not authorized for …" with destination status and the user's access stated separately; no destination data |
| Unauthorised deep link (in-shell) | `12-…` | "**Authorisation denied** — required capability `ujenzi:data.read`", denial audited, no data leaked |
| Restricted action refused by the **server** | `15-server-denial-403-cfo-desktop.png` | **403** `FORBIDDEN` RBAC/ABAC from an in-browser POST carrying a real `Origin` header |
| …and not a blanket refusal | `16-server-authorized-422-admin-desktop.png` | **422** validation only, for the authorised identity — the gate distinguishes authorization from payload |
| …and granted reads work | `17-…` | **200** on a permission the identity actually holds |
| No-JavaScript / pre-hydration truth | `19-…`, `23-…` | the denial is server-rendered; no protected data in the HTML |
| Loading / empty / denied / not-found / failure are distinguishable | `18-…` (empty + **CAP_POSTING LOCKED**), `22-…` (404), `11/12/24` (denied), `25-…` (availability, fail-closed) | four distinct, non-leaking states |
| Cross-host session | `28-…` | one sign-in, canonical-host SSO; the cookie is host-only unless the canonical cookie domain is deliberately configured (`src/lib/session-cookie.ts`) |
| Perimeter | live probes | cross-host `Origin` ⇒ **403**; `Origin: https://evil.example` ⇒ 403; CSP `frame-ancestors 'none'`; `X-Frame-Options: DENY`; no-CORS-header posture (refuse-only) |

The database remains the final authority: every destination gate and every API route re-derives the
tenant/entity/classification scope and the caller's effective permissions server-side; nothing in the
screenshots is inferred from client state, and no service-role credential is exposed to the browser.

---

## 10. Screenshot evidence

`docs/audit/evidence/2026-10-12-post-login-failure/` — **41 captures** (desktop 1440×900 and mobile
390×844), `README.md` (full inventory) and `inventory.json` (file, URL, viewport, role, scenario, HTTP
status, page title, first visible text, and whether the reported failure screen appeared).

* Real production build of the tested commit, real Chromium, **real canonical hostnames** (only DNS is
  mapped to the sandbox loopback), **real sessions** from `POST /api/v1/auth/login` (TOTP included).
* Captures 26–28 drive the **real sign-in form over HTTPS** (a throwaway self-signed front door),
  because the session cookie is `Secure` and a browser will not store it over plain HTTP.
* The reported failure screen is **absent in 41/41** captures.
* **Not captured, with exact blockers:** the live Health OS sector SPA (needs an ACTIVE
  `beyu_identity.beyu_identity_links` row — the Health backend's own schema, absent here; the route
  fails closed to the truthful availability page, which *is* captured); public-DNS production URLs
  (DNS/TLS/domain attachment is unverified and out of scope); a populated Finance ledger (fail-closed
  by design, shown truthfully rather than mocked).
* Synthetic seed identities and seed data only. **No production credential, no production database, no
  real patient or financial record.**

---

## 11. Verification results

**Full suite on a freshly provisioned database** (recreated with `drop database` → `npm run migrate`
(76 migrations, head `0075_noelia_authority_execution_hardening`) → runtime role → governance role →
`npm run seed`; `BEYU_TEST_BASE_URL=http://127.0.0.1:3100`, `BEYU_TEST_CANONICAL_DOMAIN=beyu.co.tz`):

```
Test Files  341 passed | 4 skipped (345)
     Tests  5628 passed | 12 skipped | 31 todo (5671)
  Duration  1638.00s        exit code 0
```

The four skipped files are the governed bring-up suites that skip by design
(`tests/bootstrap/{enrollment-http,foundation,preparation}.test.ts`, `tests/communications/security.test.ts`).

| Command | Result |
| --- | --- |
| `npx vitest run tests/health` | 22 passed (new regression suite) |
| `npx vitest run tests/sector-domains tests/architecture/p3-release-governance.test.ts tests/architecture/p4-release-control.test.ts` | 197 passed, 39 skipped, 0 failed |
| `npm run typecheck` | clean |
| `npx eslint .` | 0 errors, 1 pre-existing warning |
| `npm run build` | exit 0 |
| Live: `/api/health/schema` | `CURRENT` on a healthy ledger; `BEHIND` with 0075 removed **while `/api/health` still reports `UP`**; restored to `CURRENT` by `npm run migrate` |

**Environment findings reported, not worked around.**

1. **CI is red for a repository-level infrastructure reason.** On this branch and on `main` HEAD
   every job fails in 2–5 s with an empty `steps` array (Committed secret scan, dependency audits,
   Health OS frontend, P3 governance — jobs unrelated to this change). Per-job logs are not retrievable
   through the API in this environment (`EOF`).
2. **Repeated runs against a drifted sandbox database** produced 69–89 failures in unrelated suites
   (admin, governance, tenant-domain, search, foundation, HCM). The same unchanged database on
   **pristine `main` @ `9669640`** (separate worktree, own build, own server) reproduced the identical
   failure set and causes, and the same suites pass on this branch on a fresh database — so those
   failures are a property of that mutated database, not of this change.
3. **The error-boundary symptom itself never reproduced** in the reachable surface: 105 routes × 10
   identities ≈ 1,050 authenticated loads produced **0 renders** of `src/app/error.tsx` and **0** 5xx
   outside the deliberately simulated database state. `docs/audit/PRODUCTION_INTEGRATION_GATE.md` §10
   already records the production error-boundary as pre-existing FAIL. It is reported as **not
   reproduced**, with the reproduction that *does* exist (the missing-migration state) documented in §4.

---

## 12. Remaining risks and manual acceptance

| # | Item | Owner |
| --- | --- | --- |
| 1 | **Apply migration 0075 in production through `db-release`** — blocked today because the deploy job fails closed at "production secrets are not configured". This is the actual user-facing fix. | Human / platform operator |
| 2 | Confirm on production that `GET /api/health/schema` reports `CURRENT` afterwards. | Human |
| 3 | PR #103 (`authenticatedEntryRoute()`) remains unmerged; until it lands, a multi-destination principal opening an apex host sees the launcher rather than a home experience. | Human review of #103 |
| 4 | PR #106 (this change) is at the human review gate; nothing is merged or deployed. | Human |
| 5 | Pre-existing: the Health OS sector surface stays unavailable until an ACTIVE canonical identity link exists in the Health backend's own schema. | Platform operator |
| 6 | Pre-existing: repository CI is failing before any step executes; it must be restored before any future change can be validated by the pipeline. | Repository maintainers |

Manual acceptance for this change:

1. `GET /api/health/schema` on a healthy deployment → `CURRENT`.
2. Point a build at a database one migration behind → `BEHIND` (and `/api/health` still `UP`), plus the
   `schema_state_probe` log line.
3. With a signed-in session on a behind database, the failure screen states a **load** failure, says it
   is **not** an access decision, and shows a reference that appears in the runtime log.
4. The governed denial on `health.beyu.co.tz` (or any destination the identity lacks) still reads as a
   denial — unchanged.

---

## 13. Explicit change-control statement

No push to `main`; no merge or auto-merge; no deploy, promotion or rollback; no DNS, domain, registrar
or TLS change; no production secret read or written; no production migration created or applied; no
security test disabled; no RLS policy or authorization weakened; no failure hidden. Everything in this
audit is reproducible from the branch behind **PR #106**, which is stopped at the human review gate.
