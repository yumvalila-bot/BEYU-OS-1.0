# BEYU OS — production recovery evidence, pipeline blocker and controlled runbooks

**Date:** 2026-10-12 · **Baseline main:** `9669640` · **Branch under review:** `arena/cc54151c-beyu-os-1-0` @ `216f4f5`
**Companions:** `BEYU_OS_POST_LOGIN_FAILURE_AUDIT_2026-10-12.md`, `BEYU_OS_PRODUCTION_BASELINE_AND_HOST_CONFIG_2026-10-12.md`
**Change control:** read-only production access; no push to `main`, no merge, no deploy, no migration, no DNS/TLS
change, no environment-variable change, no secret read. Everything below is local, preview or public-endpoint evidence.

---

## 1. Evidence reconciliation

| Finding | Status |
| --- | --- |
| Current `main` = `9669640037f69366c1e75bd051b8c2f545b8151a` | **directly observed now** (git + GitHub API) |
| Production runs `9669640` (build/deployment ids, `releaseTimestamp 04:26:29.005Z`) | **directly observed now** — public `/api/health/identity`, re-read with a cache-buster so the `at` field provably advanced to `2026-10-12T10:11:57.944Z` |
| Production `/api/health` → database `UP` | **directly observed now** |
| Production `latestMigration` = `0047_release_approvals`, `schemaVersion`/`migrationFingerprint` `null` | **directly observed now** (the same response) |
| Production database journal head = `0074…`, frozen since 2026-10-09 | **supported by recorded artifacts** — the db-release pipeline history; the live database is not readable from here (§3.4) |
| db-release deploy job failed at its secrets guard on 2026-10-10 | **directly observed now** — job `114115879680` step list (§3.1) |
| All Actions jobs since 2026-10-10 04:57 fail with `steps: []` because of GitHub **account billing/spending-limit** | **directly observed now** — check-run annotations (§4) |
| `BEYU_CANONICAL_DOMAIN` absent in production; host routing inert | **directly observed now** — live host copy + three-configuration differential (§6) |
| Session cookie is host-only `Path=/; Secure; HttpOnly; SameSite=lax` | **directly observed now** (§6.4) |
| Post-sign-in failure = `column role_assignments.global_scope does not exist` (42703) on the first authenticated request | **directly observed now, independently reproduced** (§5) |
| Full suite green on a fresh DB (5628 passed / 12 skipped / 31 todo, exit 0) | **supported by recorded artifact** at a code-identical commit (`git diff b5c4430..216f4f5` = docs only, 0 code lines) — **agent-run, not re-run in this pass** (§9) |
| `BEYU_SESSION_COOKIE_DOMAIN` unset in production | **agent-reported previously; not re-verified** — irrelevant while the cookie is host-only and the apex 308s to `www` (§6.4) |
| PR #103 head commit | **corrected**: `29d509c` (an earlier report listed the branch-name suffix `bbf1624d`) |

---

## 2. Baseline

| Item | Value |
| --- | --- |
| `main` SHA | `9669640037f69366c1e75bd051b8c2f545b8151a` |
| Production SHA | **identical** to main (`gitSha` from the public identity endpoint) |
| Production build / deployment | `build-1791779189005-fitskq` · `dpl_7rG3nwA4LuqMWk5aL3n6gqhnEZo9` · `environment: production` · built 2026-10-12T04:26:29Z |
| Implication | **no code-deployment drift**; production is the newest main merge. The divergence is the **database** and one **environment variable** |
| Tested branch SHA | `216f4f5` (6 commits ahead of main) — code-identical to `b5c4430`/`128bea3` |
| Local runtime used for evidence | production build of `216f4f5` on `:3100`/`:3102`; production build of `9669640` (scratch clone) on `:3103`; both behind a throwaway TLS front door for Secure-cookie browser flows |

---

## 3. Migration 0075 and the database-release pipeline

### 3.1 Why the pipeline cannot proceed — step-level evidence

Run `38018982829` (`5cdaf171`, 2026-10-10T02:59Z) — the run that carried migration 0075 — job
`Production database deploy + verify` (`114115879680`):

```
step 1  [success]  Set up job
step 2  [success]  Checkout repository
step 3  [FAILURE]  Fail closed if production secrets are not configured
step 4  [skipped]  Use Node.js 22
step 5  [skipped]  Install root dependencies
step 6  [skipped]  Apply pending migrations (checksummed, per-migration transactions, advisory-locked)
step 7  [skipped]  Provision / constrain the NOSUPERUSER runtime role
step 8  [skipped]  Provision / constrain the NOBYPASSRLS governed-mutation role
step 9  [skipped]  Verify schema fingerprint · migrations recorded · RLS · role constraints
```

The guard has used its current explicit `if/then/fi` form since the pipeline was introduced
(`b6d0d0a`, 2026-09-03); the older form the file's own comment warns about does not exist in this
repository's history. A failure at step 3 therefore means the guard **observed at least one empty
required secret** and exited 1 — it is a genuine fail-closed stop, not the historical false-failure bug.
*Which* of the three is missing cannot be read from here (§3.4).

### 3.2 Secret contract — names and scope only

| Secret (name only) | Scope required | Consumer steps |
| --- | --- | --- |
| `BEYU_ADMIN_DATABASE_URL` | the job's `environment: Production` (environment secret, or a repo secret visible to it) | preflight, **apply migrations**, release record, drift report |
| `BEYU_RUNTIME_DB_PASSWORD` | same | runtime-role provisioning (step 7) |
| `BEYU_GOVERNANCE_DB_PASSWORD` | same | governed-mutation-role provisioning (step 8) |

No value was read, printed, decoded or tested. The guard prints only
`EXTERNAL_BLOCKED — secret <NAME> is not configured.`

### 3.3 Is 0075 safe to apply? — code-level findings

* **Transactional**: `scripts/migrate.ts` runs each migration inside `begin … commit` with a rollback on
  error, under `pg_advisory_xact_lock(hashtext('BEYU_OS_MIGRATION'))`, and records an `APPLIED` row with a
  checksum. Either all of 0075 lands or none of it does; no partial state, no concurrent double-apply.
* **Backward compatible with the currently deployed release**: the migration's own comments describe an
  **EXPAND** release — `noelia_action_requests.input_digest`, `required_approver_role`,
  `noelia_workflows.plan_version`, `approvals.mfa_verified`, `ai_decisions.classification` are all added
  `NOT NULL DEFAULT …`, and `plan_digest`/`target_tenant_id` are deliberately left nullable "so a
  concurrently running prior version is not broken". Old writers keep inserting.
* **The column the outage needs** is the first statement: `ALTER TABLE "role_assignments" ADD COLUMN IF
  NOT EXISTS "global_scope" boolean NOT NULL DEFAULT false` — on PostgreSQL 16 a constant default is a
  metadata-only change (no table rewrite), and every existing assignment stays explicitly scoped.
* **Beyond that column, 0075 is substantial** (28.8 kB): tenant/registry normalisation (`FOUNDATION_OS` →
  `SHARED_FOUNDATION_OPERATIONS`, `MINING_OS` → `SHARED_MINING_GOVERNANCE`), a `constitution_articles`
  protection trigger, `knowledge_sources` immutability/binding triggers, approval-binding columns,
  Noelia plan/action immutability triggers, and `FORCE ROW LEVEL SECURITY` on 10 tables. It grants no new
  authority and activates no provider.
* **No named-role dependency**: 0075 references no `CREATE ROLE`/`GRANT` and no role by name; its guards
  compare `current_user` with the table owner. Applying it before or after the role-provisioning steps is
  therefore not order-critical — but the workflow's own order (migrations → roles → verification) should
  be preserved exactly as written.
* **Backup/rollback**: the workflow's postflight verifies schema fingerprint, ledger rows and RLS. A
  forward-only release has no automated down-migration; recovery is Supabase's point-in-time restore on
  the production project (operator decision), which is why the runbook treats this as an operator-approved
  release rather than a casual fix.

### 3.4 What cannot be established from here (and why the runbook says so)

The **live production database journal head** is not readable with the access available: `/api/health/schema`
returns the 404 page because production does not run this branch, `/api/health/identity` reports only the
frozen build literal (explicitly *not* proof of the live journal), the workflow's read-only
`Production drift report` job is blocked by §4, and the deployment/log APIs return 403 for this
integration and redirect to an unreachable Azure Blob host. The 0074 conclusion rests on the pipeline
history (the only path that applies migrations) — it is labelled accordingly, and the runbook's preflight
step exists precisely to confirm the real head before applying anything.

---

## 4. CI blocker — account billing, not code, not workflow

Every Actions job created since **2026-10-10T04:57Z** fails before executing a single step. The GitHub
check-run annotation states the reason verbatim:

> **The job was not started because recent account payments have failed or your spending limit needs to be
> increased. Please check the 'Billing & plans' section in your settings**

| Run | SHA | When | Jobs |
| --- | --- | --- | --- |
| `38018982829` | `5cdaf17` | 2026-10-10 02:59Z | ran normally (validation + preflight passed; deploy failed at the secrets guard, §3.1) |
| `38022841604` / `38019314304` | `02cef5b` / `ac7eea8` | 2026-10-10 04:05Z / 03:05Z | ran normally, succeeded |
| `38025828217` | `2c9db21` | 2026-10-10 04:57Z | **first blocked run** (`steps: []`) |
| `38052360038` (dispatch), `38157765676`, `38203769950`, PR #106's `38232981838` | `2c9db21`…`128bea3` | 2026-10-10 → 2026-10-12 | all blocked identically |

**Consequence:** PR #106's red CI is a billing artifact, not a test result. No test step has executed on this
branch since 2026-10-12T04:57Z-era runs, so no failure should be attributed to the change — and no green CI
can be claimed either until the account is restored.

---

## 5. Independent reproduction of the production failure (the first failing request)

**Method.** A byte-faithful clone of the seeded sandbox database was created
(`CREATE DATABASE beyu_repro_0074 TEMPLATE beyu_os`), then put into the exact state the pipeline history
describes: the 0075 ledger row removed and `role_assignments.global_scope` dropped → journal head
`0074_enterprise_intelligence_expansion`, 75 ledger rows. The **same commit's** production builds were
pointed at it (`:3102` = `216f4f5`, `:3103` = `9669640`) with `BEYU_CANONICAL_DOMAIN=beyu.co.tz`. Synthetic
identity only (`cfo@beyu.os`, real TOTP). Production was not touched.

| Step | Request | Result |
| --- | --- | --- |
| 1 | `POST /api/v1/auth/login` | **200** — a session cookie is issued. *Sign-in works.* |
| 2 | `GET /os` (post-sign-in landing) | **500** ← **first failing request** |
| 3 | `GET /launcher` | 500 |
| 4 | `GET /api/v1/system/posture` (granted read) | 500 `{"code":"INTERNAL_ERROR", …, "traceId":"EVT_01K4NPLEHUGMYRXWHR04TC"}` |
| 5 | `GET /os/finance` on `finance.beyu.co.tz` | 500 |

**Server-side cause** (Next server log, digest-linked):

```
[drizzle] Failed query: select "role_assignments"."id", "roles"."code",
  "role_assignments"."legal_entity_id", "role_assignments"."tenant_id",
  "role_assignments"."global_scope", … from "role_assignments" …
  digest: '3627564076'
  [cause]: error: column role_assignments.global_scope does not exist
    code: '42703'  severity: 'ERROR'  file: 'parse_relation.c'  routine: 'errorMissingColumn'
```

**Correlation proven**: the digest `3627564076` appears both in the server log beside the 42703 cause and,
in the branch build, on the screen as *“Reference 3627564076 identifies this failure in the BEYU OS server
log.”* The API path additionally emits a governed `traceId`.

**Interpretation.** Both reported blockers are now reproduced or evidenced, and the failure is fully
explained by the database state: an unauthenticated page returns 200 while **every** authenticated view
returns 500 — exactly “sign-in works, the next screen never loads”. No third independent application
failure was found: with 0075 present in the sandbox database the identical build serves the landing view
(the 41 earlier captures, all with the failure screen absent).

### 5.1 Before/after screens (real renders, synthetic data)

| Screen | Build | What it shows |
| --- | --- | --- |
| `31/32-error-state-post-signin-main-{desktop,mobile}.png` | `9669640` = **production** | *“BEYU OS could not load this view / Please try again. Access remains subject to your existing permissions. / Try again”* — the reported symptom, verbatim, with **no reference** and a permissions claim that is untrue for a database fault |
| `29/30-error-state-post-signin-branch-{desktop,mobile}.png` | `216f4f5` | *“The view could not be loaded from the BEYU OS server. Nothing was changed … This is a load failure, not an access decision”* + **Reference 3627564076** |

The upgrade is therefore demonstrated on demand: same input, same database state, truthful and
correlatable output — no fabrication, no change to the failure itself.

---

## 6. Canonical host configuration

### 6.1 Variable contract (code evidence)

| | `BEYU_CANONICAL_DOMAIN` | `BEYU_SESSION_COOKIE_DOMAIN` |
| --- | --- | --- |
| Read at | request time — `canonical-hosts.ts:143` (`canonicalHostOptionsFromEnvironment`), `session-cookie.ts:58,69` | same file |
| Build-time embedding | **impossible** — not `NEXT_PUBLIC_*`, never inlined | impossible |
| Value | `beyu.co.tz` (repo `.env.example:213`, `docs/architecture/SECTOR_OS_SUBDOMAINS.md`, CI's own test server) | — |
| Missing | every host resolves `NEUTRAL` → control-plane experience; **nothing is granted, nothing breaks** | cookie is host-only (measured) |
| Malformed | `parseCanonicalDomain` returns `null` → resolution disabled, **never guessed** | — |
| Required? | **yes, for destination-per-host experiences** | **no** — optional cross-host SSO only |
| Authority | **none** — presentation only; every destination re-runs its own server-side gate | — |

### 6.2 Three-configuration differential (nine hosts)

Configurations exercised: **set** (`beyu.co.tz`), **unset** (production today), **malformed**
(`"not a domain"`). Produced both by running the real build (`:3100` set / `:3104` malformed, plus the
unset build) and by calling the exported resolver directly:

| Host | set → kind | unset → kind | malformed → kind | HTTP evidence (set) |
| --- | --- | --- | --- | --- |
| `beyu.co.tz` | `CONTROL_PLANE` | `NEUTRAL` | `NEUTRAL` | “Sign in to the control plane” |
| `www.beyu.co.tz` | `CONTROL_PLANE` | `NEUTRAL` | `NEUTRAL` | “Sign in to the control plane” |
| `health.beyu.co.tz` | `SECTOR_OS` HEALTH | `NEUTRAL` | `NEUTRAL` | “Sign in to Health OS — governed by BEYU OS” |
| `finance.beyu.co.tz` | `SECTOR_OS` FINANCE | `NEUTRAL` | `NEUTRAL` | “Sign in to Finance OS — governed by BEYU OS” |
| `agriculture.beyu.co.tz` | `SECTOR_OS` AGRICULTURE | `NEUTRAL` | `NEUTRAL` | own entry |
| `ujenzi.beyu.co.tz` | `SECTOR_OS` UJENZI | `NEUTRAL` | `NEUTRAL` | own entry |
| `foundation.beyu.co.tz` | `SURFACE` FOUNDATION | `NEUTRAL` | `NEUTRAL` | “Sign in to BEYU Foundation…” |
| `familyoffice.beyu.co.tz` | `SURFACE` FAMILY_OFFICE | `NEUTRAL` | `NEUTRAL` | own entry |
| `noelia.beyu.co.tz` | `SURFACE` NOELIA_AI | `NEUTRAL` | `NEUTRAL` | own entry |
| `unknown.beyu.co.tz`, `a.health.beyu.co.tz`, `*.vercel.app`, `evil.example.com` | `NEUTRAL` | `NEUTRAL` | `NEUTRAL` | control-plane fallback |

Production's live behaviour equals the **unset** column exactly ⇒ the variable is confirmed absent at
runtime, independently of any dashboard reading.

### 6.3 Host selection grants nothing; spoofing fails closed

`decideProxyAction` uses request facts and configuration only. Verified: `X-Forwarded-Host:
finance.beyu.co.tz` (and `evil.example.com`) plus `X-Forwarded-Proto: https` sent to host `beyu.co.tz`
still renders the **control plane** — a forwarded header cannot select a destination or grant access.

### 6.4 Apex → www (308): consistent, unchanged

Apex and `www` are both `CONTROL_PLANE`; 308 preserves method and body; the measured session cookie is
host-only (`beyu_os_session=…; Path=/; Expires=…; Secure; HttpOnly; SameSite=lax`, **no `Domain`**), so the
post-redirect document origin `www` always matches the cookie host. One narrow interaction exists and is
caused by the missing variable, not the redirect: a POST carrying `Origin: https://beyu.co.tz` onto host
`www` passes the fence (422 = authorization ran) **with** the variable set and is refused with a bare 403
**without** it. No application code posts to an absolute same-site URL, so this is not reachable from
BEYU's own UI. **`BEYU_SESSION_COOKIE_DOMAIN` must not be added**: no SSO requirement is approved, and
setting it would broaden a session credential to every canonical subdomain.

---

## 7. Journey matrix (Phase 6, A–K)

Executed against the production build with synthetic identities; skips are not passes and local/preview
success is not production success.

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| A | signed-out visit, 9 hosts | **PASS** | each destination's own sign-in (configured) / control plane (production config); no protected data |
| B | entitled sign-in → destination loads | **PASS** | Finance/Family Office/Noelia 200 with real sessions; screenshots 17–22 |
| C | non-entitled user → explicit denial | **PASS** | Health/Ujenzi denial surfaces; screenshots 11, 12, 23, 24 |
| D | deep link without session | **PASS** | `/os`, `/os/health`, `/os/finance`, `/os/foundation`, `/os/noelia` → `307 /`; never 200/5xx |
| E | unknown/malformed host + spoofed forwarded host | **PASS** | §6.3 |
| F | expired/invalid session | **PASS** | `307 /`, no 500, "your previous BEYU session has expired…" |
| G | API/RLS enforcement independent of UI | **PASS** | cfo `403` (audited) vs admin `422`; granted read `200`; foreign Origin `403`; RLS suites green |
| H | apex→www, CSRF/Origin, cookie scope | **PASS** | §6.4 |
| I | Finance posting / `CAP_POSTING` | **PASS** | live: entitled user + valid balanced payload → **423 `CAPABILITY_LOCKED`**, `blockedBy ["P1","P6","P7","P9"]`, checked as step 1 of `postJournal` before any account/period work |
| J | Health entry / clinical claims | **BLOCKED (dependency identified)** | the Health destination requires an ACTIVE `beyu_identity.beyu_identity_links` row (`src/lib/health-os-authorization.ts`, fail-closed); without it the destination renders the no-link state (screenshot 25). No mock dashboard is presented as live. Creating such a row is a **production data** action — not performed |
| K | loading/empty/error states | **PARTIAL** | reproducible **error** state captured for real (§5.1); Finance's empty ledger captured (screenshot 18); no loading state was fabricated |

**Not reproduced:** the previously reported search unique-index collisions. The fresh-database full suite
passed both search suites; that result stands only at the code-identical commit named in §9.

---

## 8. Screenshot inventory (45 committed captures, 4 new)

Routine captures: **32 desktop / 9 mobile**, all eight destinations present, plus an unknown-host
fail-safe screen:

| Destination | desktop | mobile |
| --- | --- | --- |
| HOME (apex) | 14 | 1 |
| HEALTH_OS | 2 | 1 |
| FINANCE_OS | 5 | 2 |
| AGRICULTURE_OS | 2 | 1 |
| UJENZI_OS | 3 | 1 |
| FOUNDATION | 1 | 1 |
| FAMILY_OFFICE | 2 | 1 |
| NOELIA_AI | 2 | 1 |
| unknown host (fail-safe) | 1 | 0 |

New this pass (each with `testedCommit`, `viewport`, `role`, `scenario`, `capturedAtUtc`, `runtime`,
`referenceShown` in `inventory.json`): the four before/after failure screens of §5.1 — the only state the
earlier set could not truthfully contain, because the sandbox database is healthy.

**Still BLOCKED:** screenshots against the public production hostnames (no credential and no synthetic
production account), and the live Health destination beyond the no-link state (§7 row J).

---

## 9. Tests and CI (honest counts)

| Check | Result | Scope |
| --- | --- | --- |
| `npx vitest run` (full suite, fresh DB, `BEYU_TEST_BASE_URL=http://127.0.0.1:3100`) | **exit 0** — 341 passed \| 4 skipped files (345); **5628 passed \| 12 skipped \| 31 todo** (5671); 1638 s | recorded artifact at a **code-identical** commit (`b5c4430`; `git diff b5c4430..216f4f5` = docs only). **Not re-run** this pass — no code changed |
| `npx vitest run tests/health` etc. | 197 passed \| 39 skipped (10 passed \| 2 skipped files) | same commit |
| `npm run typecheck` | clean | branch |
| `npx eslint .` | 0 errors, 1 warning (`src/components/noelia-cross-os-visual.tsx`) | branch |
| `npm run build` | exit 0 (branch); main `9669640` builds in a scratch clone after one transient Next checker flake (standalone `tsc --noEmit` clean, retry green, no source change) | both |
| Secret scan of the new artifacts | clean (no credentials, tokens, cookies, connection strings, personal data) | this pass |
| PR #106 CI | **no steps executed — blocked by GitHub account billing** | §4 |

Skipped suites remain SKIPPED: `tests/bootstrap/{enrollment-http,foundation,preparation}.test.ts`,
`tests/communications/security.test.ts`.

---

## 10. Architecture and security invariants (verified, unchanged)

Exactly four canonical Sector OSes — HEALTH_OS, FINANCE_OS, AGRICULTURE_OS, UJENZI_OS (only these resolve
`SECTOR_OS`). FOUNDATION is a `SURFACE` for a separate nonprofit sister organisation — not a Sector OS, not
a Sector LLC, not a Holding subsidiary. FAMILY_OFFICE is a shared capability surface (never
`FAMILY_OFFICE_OS`); HCM stays a capability; Mining remains non-canonical (`SHARED_MINING_GOVERNANCE`
draft). NOELIA_AI is the single AI identity (`SURFACE`, display NOELIA, governed assistant, never an
authorization principal). A hostname selects a presentation destination only. GlobalUserID, RBAC+ABAC,
tenant/entity/country/classification, RLS, MFA, delegation/consent and audit remain the only authority
boundaries. **`CAP_POSTING` is locked and fail-closed**, verified live at the API (423). No simulated
integration is presented as live and no demonstration data is shown as clinical, financial or
operational truth.

---

## 11. MIGRATION RUNBOOK — applying 0075 (operator, after explicit approval)

**Prerequisites (by name and scope only; values never handled here)**
1. In the repository/Vercel **`Production` environment scope**: `BEYU_ADMIN_DATABASE_URL`,
   `BEYU_RUNTIME_DB_PASSWORD`, `BEYU_GOVERNANCE_DB_PASSWORD` all present and non-empty. The pipeline's own
   guard detects precisely this and prints `EXTERNAL_BLOCKED — secret <NAME> is not configured.`
2. GitHub Actions must be able to start jobs again — i.e. the **account billing/spending limit** must be
   resolved (Settings → Billing & plans). Until then **no workflow step can run**, including the read-only
   drift report.
3. An authorised operator with Supabase project access and the ability to confirm/restore from a backup.
4. Knowledge of the environment policy for the app: applying the migration does not require a redeploy.

**Preflight (read-only, must pass before any write)**
* Confirm the current live journal head through the workflow's own read-only jobs
  (`Production drift report`, `Production preflight`) — these exist to record the real head; the public
  `/api/health/identity` value is a build literal and **must not** be treated as the live journal.
* Confirm the target: `0075_noelia_authority_execution_hardening`, single migration, EXPAND-only (§3.3).
* Confirm a Supabase backup/PITR window exists for the production project before the write.

**Approved release procedure**
1. Operator triggers the existing **database release workflow** (`db-release.yml`, workflow `349014494`)
   through the governed path already in the repository (push to `main` or an explicit `workflow_dispatch`
   approved by the human owner). No manual SQL, no ad-hoc script, no bypass of the gate.
2. The pipeline runs, in order: scratch-PostgreSQL validation → read-only production preflight → secrets
   guard → **apply pending migrations** (transactional, advisory-locked, checksummed) → runtime-role
   constraint → governed-mutation-role constraint → schema-fingerprint / ledger / RLS verification.
3. Expected ledger transition: **`0074…` → `0075_noelia_authority_execution_hardening`** (in the reference
   sandbox environment the ledger then holds 76 rows; the production count may differ only if it is behind
   0074, which the preflight step determines).

**Postflight**
* Workflow's own verification job reports schema fingerprint, recorded migrations, RLS and role constraints.
* `GET https://beyu.co.tz/api/health` → `{"ok":true,…}` (unchanged).
* `GET /api/health/schema` → `CURRENT` (available once a build containing the schema endpoint is deployed;
  today it is a 404 on production).
* Sign in with a **synthetic** account on the deployed build; the landing view must render instead of the
  error boundary, and the server log must show **no** `42703`.

**Failure handling / recovery**
* The migration is transactional: a failure rolls back completely; the ledger row is not written. Retry is
  safe (`ADD COLUMN IF NOT EXISTS`, idempotent updates).
* Escalation: if the write fails mid-release or a postflight check fails, stop, keep the environment as is,
  and escalate to the operator with the workflow run URL; only the operator may decide on point-in-time
  restore.
* **Do not** apply the migration by hand, do not disable the guard, do not mark the job optional.

---

## 12. HOST CONFIG RUNBOOK — `BEYU_CANONICAL_DOMAIN` (operator, after explicit approval)

**Contract (verified in code and at runtime)** — name `BEYU_CANONICAL_DOMAIN`; scope
**Production**; value exactly `beyu.co.tz` (lowercase, no scheme, no port, no trailing dot, no wildcard);
read at request time. Do **not** add `BEYU_SESSION_COOKIE_DOMAIN` (no approved SSO requirement; it would
broaden the session cookie to every subdomain).

**Why** — without it every canonical host serves the generic control-plane sign-in and no destination
frontend is reachable on its own subdomain, while nothing is granted and nothing breaks. With it, the nine
hosts classify exactly as in §6.2.

**Procedure**
1. Confirm independent evidence that the variable is absent at runtime — the §6.2 differential (live host
   copy identical to the unset build) is that evidence.
2. Add the variable in the **Production** environment scope (Vercel project → Settings → Environment
   Variables → Production; equivalently the repository's environment configuration).
3. **Restart/redeploy requirement**: the value is read per request, so an existing instance will pick it up
   on its next cold start; adding a variable in the host does not by itself trigger a new deployment, so a
   fresh deployment (or instance restart) is required for a running server to see it. No code change and no
   rebuild is otherwise needed.

**Verification after propagation**
* `https://health.beyu.co.tz/` → “Sign in to Health OS — governed by BEYU OS”; likewise for the other seven
  destinations; apex/`www` stay on the control plane.
* Unknown hosts and forwarded-host spoofing still fall back to the control plane.
* Apex → `www` 308 unchanged; session cookie still host-only.
* **Expectation management**: applying this variable alone does **not** make an authenticated OS load while
  the database is still at 0074 — the fix for the outage is §11. Do the database release first, then the
  variable, then verify both.

---

## 13. Explicit non-actions

No push to `main`; no merge or auto-merge; no production deploy, promotion or rollback; no production
migration; no DNS, registrar, TLS or domain change; no production environment-variable or secret change or
read; no production database write; no production identity link created. Production was read only through
public unauthenticated endpoints. All reproduction and captures ran against local sandbox databases,
scratch clones and synthetic identities.
