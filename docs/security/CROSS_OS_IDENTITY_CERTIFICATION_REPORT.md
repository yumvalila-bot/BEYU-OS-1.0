# Cross-OS Identity Certification Report

**Date:** 2026-09-03
**Scope:** Canonical identity federation between the BEYU OS root control plane and the Health OS sector backend, exercised end-to-end over real HTTP against real PostgreSQL on both sides.
**Result:** **10/10 scenarios PASS.**
**Suite:** `sectors/health/backend/src/test/e2e/cross-os-identity-certification.spec.ts` (commit `7c01d78`).

---

## 1. What was certified

Both operating systems ran for real, joined only by HTTP and the shared service secret:

| Side | Stack | Database |
| --- | --- | --- |
| BEYU OS root (control plane) | Production Next.js build, `npx next start` on `:3100` | Real PostgreSQL 16, database `beyu_os`, runtime DB role + RLS-guarded `audit_log` |
| Health OS (sector) | Full Nest AppModule (`AppModule`, all guards/middleware/audit), `app.listen(0)` | Real PostgreSQL 16, **fresh scratch database per run**, migrations `001`–`021` applied |
| Federation mode | **LIVE** (`BEYU_IDENTITY_ENDPOINT` set; `BEYU_IDENTITY_TEST_HARNESS` and `BEYU_HCM_BYPASS_FOR_TEST` explicitly deleted) | — |

The suite's own environment gate is part of the certification: with **no** certification env it skips all scenarios with an explicit message (verified: `10 skipped`); with a **partial** env it fails hard (`…must be provided TOGETHER…`, verified).

## 2. Scenarios and results

| # | Scenario | Result |
| --- | --- | --- |
| A | Registration provisions canonical rows at the root (asserted directly in the root DB: user ACTIVE, party ACTIVE, not a service account, tenant `BEYU-HEALTH`) and the link-once row in the sector DB | **PASS** (415 ms) |
| B | Register response leaks no canonical identifier | **PASS** (in A) |
| C | Login through LIVE federation; JWT subject = sector user id (not the canonical id); role/tenant claims correct | **PASS** (384 ms) |
| D | `/auth/me` passes request-path canonical revalidation — cache-miss (remote lookup) and TTL cache-hit paths | **PASS** (16 ms) |
| E | Sector RBAC on the real stack: patient reads patients (`200`), may not register them (`403`) | **PASS** (19 ms) |
| F | Cross-OS service token as a human Bearer → `401` (transport credential cannot impersonate a human) | **PASS** (3 ms) |
| G | Suspended migration-021 service principal (`service@health-os.internal`) cannot log in interactively → `401` | **PASS** (10 ms) |
| H | Canonical revocation at the root propagates: allowed **inside** the status TTL (documented bound), `401` **after** it, re-login `401` immediately (auth-moment lookup is uncached) | **PASS** (1656 ms) |
| I | Sector `security_version` bump rejects the stale token **immediately**; re-login mints a fresh-`sv` token | **PASS** (389 ms) |
| J | The root's immutable audit ledger recorded every cross-OS service call — `internal.identity.register:SUCCESS` and `internal.identity.lookup:SUCCESS`, actor `SERVICE`, hash-chained, written through the RLS tenant context | **PASS** (2 ms) |
| K | Restore → re-login → access resumes; the write-through-primed cache means the very next request passes with no TTL race | **PASS** (388 ms) |

Runtime: ~11 s for the full suite (excluding build/boot).

## 3. Post-run evidence (root database)

```
canonical rows: [{"id":"USR_01K1ILH9KVJCBMH0A0RR7R",
                  "email":"cert-1788406702392-5042@beyu-cert.test",
                  "status":"ACTIVE","is_service_account":false,
                  "code":"BEYU-HEALTH"}]
audit: [{"action":"internal.identity.lookup","outcome":"SUCCESS","actor_type":"SERVICE","count":"5"},
        {"action":"internal.identity.register","outcome":"SUCCESS","actor_type":"SERVICE","count":"1"}]
```

* Canonical row ends `ACTIVE` — scenario K's restore is visible in the root state.
* One register (idempotent — the replay paths never double-provisioned) and five lookups, all `SUCCESS`, all actor `SERVICE`.

## 4. How to re-run the certification

```bash
# 1. Root control plane (this repository root)
npm run build && npx next start -p 3100 &

# 2. Certification suite (scratch sector DB is created and dropped per run)
cd sectors/health/backend && \
BEYU_OS_BASE_URL=http://127.0.0.1:3100 \
BEYU_INTERNAL_SERVICE_TOKEN=<shared secret> \
TEST_DATABASE_URL=postgresql://…/postgres \
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand \
  cross-os-identity-certification
```

Optional: `BEYU_OS_ADMIN_DATABASE_URL` overrides the operator connection used to assert canonical rows and to revoke/restore (defaults to the same server, database `beyu_os`).

## 5. Findings fixed during certification

Building the certification surfaced (and the fixes are part of commit `7c01d78`):

1. **Root audit RLS context** — the register/lookup routes previously wrote audit rows outside a tenant context; the runtime DB role is (correctly) rejected by the `audit_log` RLS policy, producing a `500` on lookup. Fixed with `withDatabaseRlsContext`, exactly mirroring `guarded()`'s behavior for human sessions.
2. **Sector tenant code leakage** — `linkOnRegister` forwarded the sector-local tenant code as the canonical tenant code, which the root would reject as `TENANT_NOT_FOUND`. Canonical provisioning now always targets the canonical sector tenant.
3. **Post-login TTL race** — the per-request status cache was not primed by the auth-moment lookup; a request immediately after login could hit a stale pre-auth entry. Auth-moment lookups now write-through prime the cache (both ACTIVE and revoked outcomes).

## 6. Boundary conditions verified elsewhere (not re-certified here)

The full failure-mode surface is covered by the sector suites that run in CI: `identity-transport-failure.spec.ts` (11 — outage/garbage/retry bounds/compensation/outbox), `token-matrix.spec.ts` (13 — token forgery/staleness/tenant binding), `identity-federation.spec.ts` (16 — modes, link-once, TTL bounds, outage degraded-read rules). The contract is documented normatively in [IDENTITY_FEDERATION.md](./IDENTITY_FEDERATION.md).
