# BEYU OS 1.0 — Production Dependency Graph

**Generated:** 2026-09-08
**Base commit:** `cc621ab1e1122a36dc5e2ea6c870589cf7b1d952`
**Assessment branch:** `arena/01a07fbc-beyu-os-1-0`
**Environment:** Arena sandbox — disposable PostgreSQL 16.14, Node 22.22.3

## Evidence tiers

Every gate is classified on three independent axes. One never substitutes for another.

| Tier | Means |
|---|---|
| **CODE** | The source implements the property. |
| **CI** | Automated execution against a disposable database proves it. |
| **PRODUCTION** | The live deployed system demonstrates it. |

## Status vocabulary

`PASS — VERIFIED` · `FAIL — VERIFIED` · `BLOCKED — EXTERNAL` · `NOT CERTIFIED` · `NOT APPLICABLE`

---

## The chain

```
GitHub repository ──► GitHub Actions ──► DB release ──► Supabase PostgreSQL
      ▲                                                          │
      │                                                          ▼
      │                                                   runtime DB role
      │                                                          │
      │                                                          ▼
 sector OS ◄── Noelia ◄── audit ◄── RLS ◄── RBAC/ABAC      DATABASE_URL
 boundaries                                    ▲                  │
                                               │                  ▼
                                    bootstrap ◄─ MFA ◄─ identity ◄─ /api/health
                                                                   ▲
                                                          Next.js runtime
                                                                   ▲
                                                          Vercel deployment
```

---

## Link-by-link

### L-01 · GitHub repository

- **Required configuration:** clean tree, HEAD == origin/main
- **Secret boundary:** none
- **Consumer:** GitHub Actions, Vercel
- **Verification:** `git rev-parse`, `git status --porcelain`
- **Evidence:** `HEAD == origin/main == cc621ab`, tree clean at audit start
- **Status:** **PASS — VERIFIED** (CODE)

### L-02 · GitHub Actions — CI

- **Required configuration:** `.github/workflows/ci.yml`
- **Consumer:** every push/PR to main
- **Evidence:** run `34188069357` on `cc621ab` — success
- **Status:** **PASS — VERIFIED** (CI)

### L-03 · GitHub Actions — DB release

- **Required configuration:** `.github/workflows/db-release.yml`
- **Secret boundary:** `BEYU_ADMIN_DATABASE_URL` (repository scope), `BEYU_RUNTIME_DB_PASSWORD` (deploy job)
- **Upstream:** L-01 · **Downstream:** L-04
- **Verification:** workflow inspection + run history
- **Evidence:** latest run `34188069360` failed at `live-preflight` step 3 (DSN guard). `deploy`, `release-record`, `runtime-verification`, `drift-report` all **skipped**. Zero `db-live-preflight-*` artifacts have ever been produced.
- **Failure state:** fail-closed, correct behaviour
- **Status:** **BLOCKED — EXTERNAL** (workflow dispatch requires `actions: write`, which the Arena token lacks)

### L-04 · Supabase PostgreSQL (production)

- **Required configuration:** reachable admin DSN, TLS
- **Verification:** would be `db-release.ts preflight`
- **Evidence:** TCP to `aws-0-eu-west-3.pooler.supabase.com` :5432 and :6543 is **OPEN** from the sandbox; HTTPS egress to `supabase.com` is blocked at TLS. No pipeline run has ever reached the database.
- **Status:** **NOT CERTIFIED** — never contacted by any governed run

### L-05 · Runtime DB role (`beyu_runtime`)

- **Required:** `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION`, owns zero application objects
- **Consumer:** `DATABASE_URL`
- **Evidence (CI):** `db-release.ts verify` → all five attributes `false`, `constrained: true`, `runtimeRoleOwnedObjects: []`
- **Status:** **PASS — VERIFIED (CI)** · **NOT CERTIFIED (PRODUCTION)** — the role does not exist in production

### L-06 · `DATABASE_URL` → Vercel runtime

- **Required:** transaction pooler `:6543`, `sslmode=require`, `pgbouncer=true`, `beyu_runtime` role
- **Consumer:** `src/db/index.ts` (reads `process.env.DATABASE_URL` only)
- **Must never be:** admin DSN, `postgres` superuser, or a service-role credential
- **Evidence:** code path confirmed single-source; no request-path module reads `BEYU_ADMIN_DATABASE_URL`
- **Status:** **BLOCKED — EXTERNAL** (depends on L-04/L-05; no Vercel control-plane access)

### L-07 · Vercel deployment

- **Evidence:** GitHub deployment `6320808378`, environment Production, sha `cc621ab`, creator `vercel[bot]`, state **success**, 2026-09-08T04:45:43Z
- **Status:** **PASS — VERIFIED (build/deploy)** · runtime configuration **NOT CERTIFIED**

### L-08 · Next.js runtime

- **Evidence:** `next build` completes with **all** runtime secrets unset (deployment parity); `.next/` contains no secret material
- **Status:** **PASS — VERIFIED** (CI)

### L-09 · `/api/health`

- **Contract:** `GET /api/health` → 200 `{checks:{database:"UP"}}`, 503 when the database is unreachable. `GET /api/health/live` → always 200, performs no I/O (readiness/liveness correctly separated).
- **Evidence:** sandbox egress to `*.vercel.app` fails at TLS ClientHello — HTTP 000. DNS resolves, TCP :443 connects.
- **Status:** **BLOCKED — EXTERNAL** (sandbox network restriction — **not** an outage, and must never be reported as DOWN)

### L-10 · Identity / authentication

- **Evidence:** opaque database-backed sessions, sha256-at-rest — **not** JWT (verified in `src/lib/session.ts`)
- **Status:** **PASS — VERIFIED (CI)** · **NOT CERTIFIED (PRODUCTION)**

### L-11 · MFA

- **Required:** `MFA_ENCRYPTION_KEY` = 64 lowercase hex (satisfies both BEYU and Health)
- **Evidence:** AES-256-GCM, 12-byte IV, `v1:iv:tag:ct`. Production key-strength validation **added this session** (F-NEW-1); 8 regression tests.
- **Status:** **PASS — VERIFIED (CODE/CI)** · **NOT CERTIFIED (PRODUCTION)**

### L-12 · Bootstrap enrollment

- **Lifecycle:** `NOT_PREPARED → AVAILABLE → IN_PROGRESS → MFA_PENDING → MFA_VERIFIED → SEALED`
- **Evidence:** seal terminality enforced by database trigger; status route fails closed to `NOT_PREPARED`
- **Status:** **NOT CERTIFIED** — **BOOTSTRAP AVAILABLE — ENROLLMENT DEFERRED**. One-time irreversible; requires a healthy production database first.

### L-13 · RBAC / ABAC

- **Evidence:** two-gate model in `src/lib/authz.ts`, fail-closed on unknown clearance
- **Status:** **PASS — VERIFIED (CI)** · **NOT CERTIFIED (PRODUCTION)**

### L-14 · RLS / tenant / entity / country isolation

- **Evidence:** 174 RLS-enabled tables / 174 policies / 174 policy tables; **0 SECURITY DEFINER functions**; adversarial cross-tenant, cross-entity, cross-country suites all DENY
- **Status:** **PASS — VERIFIED (CI)** · **NOT CERTIFIED (PRODUCTION)**

### L-15 · Audit ledger

- **Evidence:** hash-chained, append-only; fork rejection and tamper detection assert in the suite (negative tests on a disposable database only)
- **Status:** **PASS — VERIFIED (CI)**

### L-16 · Internal service federation

- **Contract:** HS256, audience `BEYU_OS`, ≤300 s lifetime, ≤60 s skew, fail-closed 503
- **Status:** **PASS — VERIFIED (CODE/CI)** · live federation **BLOCKED — EXTERNAL DEPLOYMENT** (Health OS has no production deployment; none invented)

### L-17 · Noelia / HIVE

- **Evidence:** subject to RBAC/ABAC/tenant/entity/country/OS boundaries; holds no admin DSN, no superuser, no RLS bypass. `agriculture.operations.observe` allowed for CEO, denied for HCM. Generative inference deferred (`NOELIA_GENERATIVE_*` are reference-only).
- **Status:** **PASS — VERIFIED (CI)**

### L-18 · Finance OS / CAP_POSTING

- **Evidence:** all **60** capabilities read `LOCKED` after the full suite. Database enforcement: privileges revoked + SQLSTATE `42501`. Application enforcement: activation gate rejects forged, expired, uncited and out-of-vocabulary authority.
- **Status:** **PASS — VERIFIED (CI)** — CAP_POSTING **LOCKED**

### L-19 · Sector OS boundaries

- Health: **BLOCKED — EXTERNAL DEPLOYMENT**
- Agriculture: **PASS — VERIFIED (CI)** — isolation, RBAC, ABAC, CAP_POSTING lock re-earned this session
- Finance: **PASS — VERIFIED (CI)**

### L-20 · Mobile (Flutter)

- **Evidence:** no Flutter/Dart SDK in the execution environment; static inspection only — `app_config.dart` reads `BEYU_API_URL`, no secrets
- **Status:** **BLOCKED — SDK ENVIRONMENT**

---

## Summary

| Classification | Count |
|---|---|
| PASS — VERIFIED (CI/CODE) | 12 |
| BLOCKED — EXTERNAL | 5 |
| NOT CERTIFIED | 3 |

**Zero links carry PRODUCTION-tier evidence.** The chain breaks at **L-03 → L-04**: no governed pipeline run has ever reached the production database, so every downstream link is unreachable rather than broken.
