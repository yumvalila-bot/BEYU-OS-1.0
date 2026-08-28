# BEYU OS — Critical Remediation Verification Audit (C-02 & C-07)

**Repository:** `yumvalila-bot/BEYU-OS-1.0` (branch `arena/01a04411-beyu-os-1-0`)
**Date:** 2026-08-27
**Scope:** Fix, attack, verify, regression-test, and document the two material findings from the prior audit.

| Finding | Severity | Verdict |
|---|---|---|
| C-02 — runtime connects as `postgres` superuser; RLS bypassed | CRITICAL | **RESOLVED** |
| C-07 — login rate limiter collapses to a global bucket | HIGH | **RESOLVED** |

A finding is marked RESOLVED only because adversarial tests demonstrate the original failure condition no longer exists. The remediation introduced a non-superuser runtime role subject to RLS (proven by an adversarial DB test connecting as that role and by the HTTP/E2E suite running the server on that role), and re-keyed the login limiter so one principal can no longer exhaust another's budget (proven by a live HTTP re-attack).

---

## 1. C-02 remediation report (database-level RLS)

**FINDING (C-02):** Runtime application connected to PostgreSQL as the `postgres` superuser. PostgreSQL superusers bypass Row Level Security regardless of `FORCE ROW LEVEL SECURITY`, so the DB-level tenant-isolation backstop was inert.

**ROOT CAUSE:** `DATABASE_URL` pointed at the `postgres` superuser; no non-superuser application role was provisioned, and no `CREATE ROLE`/`GRANT` infrastructure existed. `scripts/migrate.ts`, `seed.ts`, and `drizzle.config.ts` all reused the same `DATABASE_URL`.

**CHANGE:**
1. New `scripts/setup-db-role.ts` provisions a non-superuser runtime role `beyu_runtime` (`LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION`) and grants it ordinary DML (`SELECT/INSERT/UPDATE/DELETE` on tables, `USAGE,SELECT` on sequences, `EXECUTE` on functions) as a **NON-OWNER grantee**, so RLS binds it on every RLS table (with or without `FORCE`). It also reverts any ownership previously delegated to the runtime role (ownership stays with the admin role).
2. New `src/db/admin.ts` provides an admin (superuser) handle from `BEYU_ADMIN_DATABASE_URL`, used only by `scripts/migrate.ts`, `src/db/seed.ts`, `drizzle.config.ts`, and the RLS probe test.
3. Runtime path (`src/db/index.ts`) keeps `DATABASE_URL` = `beyu_runtime`.
4. Migration `0018_employees_rls_entity_scope.sql` aligns the `employees` RLS policy with the application's authorization model (shared HCM master: employee rows held at the enterprise tenant, authorization via the employing legal entity's tenant).
5. `.env.example` documents the credential-separation variables.

**TEST:** `tests/security/rls-isolation.test.ts` (13), `tests/security/entity-isolation.test.ts` (3), `tests/security/runtime-privilege-audit.test.ts` (6). All pass.

**ATTACK / RESULT:**
- Connect as `beyu_runtime`, set `beyu.current_tenant_ids=TEN_BEYU_TZ`, run `SELECT` across `approvals` → returns only `TEN_BEYU_TZ` rows (foreign `TEN_BEYU_FINTECH` row hidden). `RESULT: BLOCKED`.
- `UPDATE`/`DELETE` a foreign-tenant row under a single-tenant context → 0 rows affected. `RESULT: BLOCKED`.
- `INSERT` a row with a forged foreign `tenant_id` under a single-tenant context → `new row violates row-level security policy`. `RESULT: BLOCKED`.
- `JOIN`/`AGGREGATE`/`SUBQUERY` across tenants → only in-context rows returned. `RESULT: BLOCKED`.
- No/invalid tenant context → 0 rows (fail safe). `RESULT: BLOCKED (safe)`.
- Multi-tenant context → both in-scope tenants returned (intended). `RESULT: allowed as scoped`.
- Connection reuse after a transaction-scoped `SET LOCAL` → context does not leak; 0 rows visible on the next transaction. `RESULT: SAFE`.

**EVIDENCE:** `tests/security/rls-isolation.test.ts` 13/13 pass; the HTTP/E2E suite (99 tests) passes with the server running on `beyu_runtime`; `pg_stat_activity` confirms the server connects as `beyu_runtime`.

**STATUS: RESOLVED.**

---

## 2. C-07 remediation report (login rate limiter)

**FINDING (C-07):** `trustedClientIp()` returned `null` when `BEYU_TRUST_PROXY` was unset, and the login route used `rateLimit('login:${ip ?? "unknown"}', 10, 60_000)`. Every client/principal therefore shared one `login:unknown` bucket → a platform-wide 429 after ~8 attempts.

**ROOT CAUSE:** The rate-limit bucket identity was a single raw key that collapsed to a global value when no trusted IP was present; it was not scoped per principal.

**CHANGE:** New dependency-free `src/lib/auth-limits.ts` defines the login bucket policy:
- Per-account bucket `login:acct:<email>` (limit 30/min) — always applied, so protection never depends on IP.
- Per-(IP, account) bucket `login:ipacct:<ip>:<email>` (limit 10/min) — applied only when a trusted proxy IP is available.
- When the proxy is untrusted, forwarding headers are ignored (a client cannot rotate `X-Forwarded-For` to mint fresh buckets) and only the per-account bucket applies — there is no global bucket.
- The login route derives keys via `loginRateLimitKeys(ip, email)`; `trustedClientIp` moved to `auth-limits.ts` and re-exported by `session.ts`.

**TEST:** `tests/security/login-rate-limit.test.ts` (11) — bucket identity, case normalization, trusted/untrusted proxy, independence of distinct keys.

**ATTACK / RESULT (live HTTP re-attack, `reattack.mjs`):**
- 35 login attempts to account A → 30 × `INVALID_CREDENTIALS`, then 429 `RATE_LIMITED`.
- Then a login to a different account B → `401 INVALID_CREDENTIALS` (NOT 429). `RESULT: attacker A can no longer exhaust attacker B's budget`.
- A real account (`health.ops@beyu.os`) after the attack → `401 INVALID_CREDENTIALS` (NOT 429). `RESULT: no platform-wide lockout`.
- Brute-force protection remains (per-account 30/min + 5-failure account lockout); credential-stuffing protection remains (shared per-account budget across IPs); spoofed headers cannot evade because untrusted proxies ignore them.

**EVIDENCE:** `tests/security/login-rate-limit.test.ts` 11/11 pass; live `reattack.mjs` output above.

**STATUS: RESOLVED.**

---

## 3. Before / after architecture

```
BEFORE (C-02)                            AFTER (C-02)
   postgres (superuser)                      postgres (superuser)   --> migrate/seed/drizzle/evidence/RLS-probe
        |                                           |                    (admin ops)
        v                                           v
   PostgreSQL (RLS bypassed)              PostgreSQL (owns schema, DDL)
        |                                           |
        +-- all runtime + tests                 beyu_runtime (NON-superuser, NON-owner, NON-bypassrls)
                                                     |  DML grants only
                                                     v
                                           PostgreSQL (RLS enforced for runtime)

BEFORE (C-07)                            AFTER (C-07)
   rateLimit('login:${ip??"unknown"}')      loginRateLimitKeys(ip, email)
   ip==null -> 'login:unknown'  (GLOBAL)     -> per-account + per-(IP,account); never global
```

---

## 4. Database role matrix

| Role | Attributes | Owner | Used by | RLS-bound |
|---|---|---|---|---|
| `postgres` | SUPERUSER | schema `public` | migrations, seed, drizzle-kit, RLS-probe, evidence gate | no (superuser) |
| `beyu_runtime` | NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB | none (grantee) | runtime app (`DATABASE_URL`), HTTP/E2E server, adversarial RLS tests | **yes** |
| `beyu_rls_probe` | non-superuser throwaway | none | RLS probe test (created/dropped via admin) | yes |
| `BEYU_TEST_DATABASE_URL` role (postgres in tests) | superuser | — | unit/integration regression suite (via `tests/setup-env.ts`) | no |

Verified by `tests/security/runtime-privilege-audit.test.ts`:
- `beyu_runtime` → `rolsuper=false, rolbypassrls=false, rolcreaterole=false, rolcreatedb=false, rolcanlogin=true`.
- `beyu_runtime` is not a member of any superuser/bypassrls role; owns no tables; cannot `SET ROLE postgres`; cannot grant itself BYPASSRLS.

---

## 5. RLS policy matrix (verified live)

| Table | RLS | FORCE | Policy | Runtime role bound? |
|---|---|---|---|---|
| `legal_entities` | yes | yes | `tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()` | yes (verified) |
| `ownership_records`, `capital_requests`, `treasury_positions`, `waterfall_configs`, `risks`, `compliance_obligations`, `documents` | yes | yes | tenant + global scope | yes |
| `audit_log`, `enterprise_events` | yes | yes | tenant / tenant-less-global / global; immutability triggers | yes |
| `employees` | yes | yes | **entity-aware** (tenant OR employing-entity tenant OR global) — migration 0018 | yes |
| `approvals`, `noelia_*`, `knowledge_sources`, `enterprise_memory` | yes | no | tenant-scoped | **yes** (as non-owner grantee) |

`relforcerowsecurity=false` tables (approvals, noelia_*) are now bound because the runtime role is a NON-OWNER grantee (owners without FORCE would bypass RLS).

---

## 6. Tenant attack matrix

| Attack | Context | Result | Evidence |
|---|---|---|---|
| SELECT foreign tenant | TENANT_A | blocked (0 rows) | rls-isolation "SELECT" |
| UPDATE foreign tenant | TENANT_A | 0 rows affected | rls-isolation "UPDATE" |
| DELETE foreign tenant | TENANT_A | 0 rows affected | rls-isolation "DELETE" |
| INSERT forged foreign tenant_id | TENANT_A | rejected (WITH CHECK) | rls-isolation "INSERT" |
| JOIN across tenants | TENANT_A | only in-context rows | rls-isolation "JOIN" |
| AGGREGATE across tenants | TENANT_A | only in-context count | rls-isolation "AGGREGATE" |
| SUBQUERY into foreign tenant | TENANT_A | empty | rls-isolation "SUBQUERY" |
| No tenant context | — | 0 rows (fail safe) | rls-isolation "NO context" |
| Invalid tenant context | bogus id | 0 rows | rls-isolation "INVALID context" |
| Multiple tenant context | A,B | both in-scope (intended) | rls-isolation "MULTIPLE" |
| Context change mid-transaction / connection reuse | SET LOCAL | no leak after commit | rls-isolation "connection reuse" |
| Dropped WHERE clause (defense-in-depth) | TENANT_A | still only TENANT_A rows | rls-isolation "DEFENSE-IN-DEPTH" |

---

## 7. Entity attack matrix

| Attack | Result | Evidence |
|---|---|---|
| Tenant A principal reads Entity B in SAME tenant | denied at app layer (ABAC `can` → "legal entity outside scope") | entity-isolation test 1 |
| Noelia tool targets Entity B (same tenant, out of scope) | `ENTITY_DENIED` | entity-isolation test 2 |
| Noelia targets an entity of ANOTHER tenant | `ENTITY_DENIED` or `TENANT_DENIED` | entity-isolation test 3 |

Note: DB-level RLS is TENANT-scoped; legal-entity authorization is derived from a principal's grants and is enforced at the application layer (ABAC `entityScope` + Noelia `ENTITY_DENIED`). This is documented and tested; it is not a regression.

---

## 8. Rate-limit attack matrix

| Attack | Expected | Result | Evidence |
|---|---|---|---|
| Attacker exhausts account A's budget | A 429 after 30 | confirmed | live reattack |
| Account B after A exhausted | B unaffected (401/200) | **confirmed (not 429)** | live reattack |
| Real account after attack | unaffected | **confirmed (not 429)** | live reattack |
| Missing IP (untrusted) | per-account only, no global key | confirmed | login-rate-limit test |
| Spoofed X-Forwarded-For | ignored under untrusted proxy; cannot mint buckets | confirmed | login-rate-limit test |
| Case variation of email | same bucket | confirmed | login-rate-limit test |
| Distinct principals | no shared key | confirmed | login-rate-limit test |
| Distributed-IP stuffing one account | shared per-account budget | confirmed | login-rate-limit test |
| Brute force / MFA | per-account + lockout retained | confirmed (MFA test, live gate) | evidence gate C-04 |

---

## 9. Security-definer / bypass audit (Part 5)

Verified against the live database by `tests/security/runtime-privilege-audit.test.ts`:
- `beyu_runtime`: `rolsuper=false`, `rolbypassrls=false`, `rolcreaterole=false`, `rolcreatedb=false`.
- `beyu_runtime` is not a member of any role that itself has superuser or BYPASSRLS.
- `beyu_runtime` owns no tables (ownership stays with `postgres`), so RLS binds it on non-FORCE tables.
- `beyu_runtime` cannot `SET ROLE` to a superuser (permission denied).
- SECURITY DEFINER functions in `public` schema: **none** (`[]`).
- Table/function/schema/sequence ownership: admin role (`postgres`); the runtime role has DML grants only.

No application-accessible path was found that can bypass RLS.

---

## 10. Credential separation matrix (Part 6)

| Operation | Role | Connection | Source |
|---|---|---|---|
| Schema migrations | `postgres` (superuser) | `BEYU_ADMIN_DATABASE_URL` | `scripts/migrate.ts` |
| Constitutional seed | `postgres` (superuser) | `BEYU_ADMIN_DATABASE_URL` | `src/db/seed.ts` (`adminDb`) |
| Migration authoring | `postgres` (superuser) | `BEYU_ADMIN_DATABASE_URL` | `drizzle.config.ts` |
| Runtime application | `beyu_runtime` | `DATABASE_URL` | `src/db/index.ts` |
| HTTP/E2E server | `beyu_runtime` | `.env` `DATABASE_URL` | `next start` |
| Unit/integration regression suite | `postgres` (test role) | `BEYU_TEST_DATABASE_URL` | `tests/setup-env.ts` |
| RLS probe / evidence | admin for role lifecycle; runtime for assertions | `BEYU_ADMIN_DATABASE_URL` / `BEYU_RUNTIME_DATABASE_URL` | tests |

No credentials are hardcoded or committed; every password is read from environment (`.env`, `BEYU_RUNTIME_DB_PASSWORD`).

---

## 11. Regression test results (Part 9)

| Gate | Result |
|---|---|
| `tsc --noEmit` | PASS (0 errors) |
| `eslint .` | PASS (0 errors) |
| `next build` (production) | PASS (28 routes) |
| `npm run migrate` | PASS (18 → 19 migrations; fingerprint stable for schema) |
| Full unit/integration suite | **2149 passed / 0 failed** (97 files) |
| HTTP/E2E suite (server on `beyu_runtime`) | **99 passed / 0 failed** (11 files) |
| Evidence gate (`kernel-gate1.ts`) | **5/5 passed** (audit concurrency 10/50/100, MFA replay, tenant non-enumeration) |

Prior passing tests all remain green; 5 static migration-count baselines updated 18→19 because a legitimate remediation migration (0018) was added, and 1 static source-inspection test updated to point at the new `auth-limits.ts` module.

---

## 12. New tests added (Part 9/12)

| File | Tests | Purpose |
|---|---|---|
| `tests/security/rls-isolation.test.ts` | 13 | Adversarial DB tenant isolation as the runtime role |
| `tests/security/entity-isolation.test.ts` | 3 | Application-level legal-entity isolation |
| `tests/security/runtime-privilege-audit.test.ts` | 6 | Runtime role privileges, SECURITY DEFINER, ownership |
| `tests/security/login-rate-limit.test.ts` | 11 | Login bucket identity / proxy trust |
| `tests/setup-env.ts` | — | Test-role credential separation |

Total new tests: **33**.

---

## 13. Exact files changed

**New:**
- `scripts/setup-db-role.ts`
- `src/db/admin.ts`
- `src/lib/auth-limits.ts`
- `drizzle/0018_employees_rls_entity_scope.sql`
- `tests/security/rls-isolation.test.ts`
- `tests/security/entity-isolation.test.ts`
- `tests/security/runtime-privilege-audit.test.ts`
- `tests/security/login-rate-limit.test.ts`
- `tests/setup-env.ts`

**Modified:**
- `.env.example`
- `drizzle.config.ts`
- `scripts/migrate.ts`
- `scripts/evidence/kernel-gate1.ts`
- `src/app/api/v1/auth/login/route.ts`
- `src/db/seed.ts`
- `src/lib/session.ts`
- `vitest.config.ts`
- `tests/architecture/phase15-integrity.test.ts`
- `tests/noelia/completeness-expansion.test.ts`
- `tests/specialist/{audit-intel,compliance,forecast,risk,treasury}.test.ts`
- `CHANGELOG.md`

**Environment (not committed):** `.env` adds `BEYU_ADMIN_DATABASE_URL`, `BEYU_RUNTIME_DATABASE_URL`, `BEYU_TEST_DATABASE_URL`, `BEYU_RUNTIME_DB_PASSWORD`.

---

## 14. Exact database changes (Part 14)

- **Role:** `beyu_runtime` created (or re-asserted) as LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION.
- **Grants:** `USAGE ON SCHEMA public`; `SELECT/INSERT/UPDATE/DELETE` on all tables; `USAGE,SELECT` on all sequences; `EXECUTE` on all functions; matching `ALTER DEFAULT PRIVILEGES` for future objects.
- **Ownership:** all objects owned by the admin role (`postgres`), not the runtime role.
- **Migration `0018`:** replaces `employees_tenant_isolation` RLS policy with an entity-aware policy (tenant-scope OR employing-entity tenant-scope OR global scope). Adds no table/column; schema drift fingerprint unchanged.

---

## 15. Remaining risks

1. **Entity isolation is application-layer only.** DB RLS is tenant-scoped; legal-entity boundaries are enforced by ABAC/Noelia. If a future table needs DB-level entity enforcement, it would require entity-scoping columns — an explicit, larger change. Documented, not a regression.
2. **Rate limiter and AI decision cache are process-local.** In a multi-instance deployment these are not shared; idempotency (the correctness-critical one) is DB-backed and safe. A distributed limiter (Redis etc.) is the documented future hardening.
3. **The unit/integration regression suite runs as a privileged test role** because it invokes domain services without the `guarded()` HTTP tenant-context wrapper. Runtime correctness under RLS is proven by the adversarial RLS tests and the HTTP/E2E suite (server on `beyu_runtime`).
4. **Credential material** (`beyu_runtime` password) lives in `.env`, which is git-ignored; it must be provided by the operator. No credential is committed.

---

## 16. Evidence for each resolved finding

| Finding | Status | Executable evidence |
|---|---|---|
| C-02 | **RESOLVED** | `beyu_runtime` non-superuser/non-bypassrls (privilege-audit 6/6); tenant isolation proven (rls-isolation 13/13: SELECT/UPDATE/DELETE/INSERT/JOIN/AGGREGATE/SUBQUERY/no-context/invalid-context/connection-reuse); HTTP/E2E 99/99 on `beyu_runtime`; evidence gate 5/5 |
| C-07 | **RESOLVED** | `login-rate-limit` 11/11; live re-attack: A exhausted (429 after 30) but B and real account return 401 (not 429); no global bucket; spoofed headers cannot evade |

---

## Final System Question

> **"Does BEYU OS now have both application-level AND database-level tenant/entity isolation while maintaining governance, Noelia, Finance, audit, identity, and continuity invariants?"**

### **YES** — for the implemented scope.

Executable evidence:

- **Database-level tenant isolation:** adversarial test connecting as the actual runtime role (`beyu_runtime`) proves RLS blocks cross-tenant SELECT/UPDATE/DELETE/INSERT/JOIN/AGGREGATE/SUBQUERY, fails safe with no/invalid context, and does not leak across reused connections (`tests/security/rls-isolation.test.ts`, 13/13).
- **Application-level isolation retained (defense in depth):** application WHERE-clause scoping and entity ABAC remain in place; a test proves that even if the tenant WHERE clause is dropped, RLS still blocks cross-tenant rows (defense-in-depth case).
- **Legal-entity isolation:** application-layer `entityScope`/Noelia `ENTITY_DENIED` enforce entity boundaries (`tests/security/entity-isolation.test.ts`, 3/3); DB RLS enforces the tenant dimension.
- **Governance, Noelia, Finance, audit, identity, continuity invariants preserved:** full regression suite **2149/2149**, HTTP/E2E **99/99** on the RLS-bound runtime role, evidence gate **5/5** (audit hash-chain integrity under 100 concurrent writers, MFA replay rejection, tenant topology non-enumeration). All previously passing tests remain green.

The two material findings (C-02 and C-07) are **RESOLVED** with adversarial, live, and regression evidence as documented above.
