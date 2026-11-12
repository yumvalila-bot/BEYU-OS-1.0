# BEYU OS Production TLS Trust Remediation — DSN Policy Default-Strict

**Date:** 2026-09-11
**Repository:** `yumvalila-bot/BEYU-OS-1.0`
**Base SHA:** `86575d3a74f1e2f1893b1c98202eae9825d4ee38` (origin/main, PR #52 merge)
**Classification Standard:** Facts only, labeled OBSERVED, VERIFIED, or BLOCKED.

---

## 1. The production failure being remediated — OBSERVED

`GET https://beyu-os-1-0.vercel.app/api/health` returned (HTTP 503):

```json
{"ok":false,"system":"BEYU-OS/1.0.0","checks":{"database":"DOWN"},"reason":"DATABASE_TLS_TRUST_MISCONFIGURED"}
```

`DATABASE_TLS_TRUST_MISCONFIGURED` is raised by `src/db/tls.ts`
(`DatabaseTlsTrustError`) BEFORE any network activity. The prior pinned-CA
remediation (PR #51, verified in
`docs/forensics/2026-09-11-production-supabase-tls-trust-verification.md`)
required the DSN itself to carry `sslmode=verify-full` as an explicit operator
declaration.

## 2. Why production could not satisfy the gate — VERIFIED (three independent lines of evidence)

1. **The runtime DSN diagnostic** (workflow `runtime-dsn-diagnostic.yml`, run
   `34648722567`, main): the application's own `probeDatabaseHealth()` against
   the production runtime DSN shape
   (`beyu_runtime.siyzygezdmlxbvwttrdz@aws-0-eu-west-3.pooler.supabase.com:6543`,
   `sslmode=require&pgbouncer=true`) failed with
   `DATABASE_TLS_TRUST_MISCONFIGURED` in **1 ms** — a pre-network policy
   rejection, exactly the production signature. The same run's
   **admin control probe connected in 761 ms**, proving CI→Supabase
   reachability and credential validity.
2. **The admin DSN structural diagnostic** (run `34637937961`): the GitHub
   secret `BEYU_ADMIN_DATABASE_URL` is a bare DSN — session pooler :5432,
   canonical pooler host, **zero query parameters**
   (`sslmodePresent: false`, `parameterNames: []`) — and the policy gate
   rejected it: `POLICY_REJECT — "must set sslmode=verify-full explicitly."`
   This is also why the governed `db-release` pipeline failed at live
   preflight (`db-release: TLS_FAILURE`, run `34648898485`).
3. **The 2026-09-10 forensic record** (`docs/forensics/
   2026-09-10-prod-tls-forensics-SELF_SIGNED_CERT_IN_CHAIN.md` §2): the
   deployed Vercel `DATABASE_URL` carries `?sslmode=require&pgbouncer=true`.

Neither environment variable can be modified from the engineering environment
(no Vercel token is available to Arena; GitHub secret values are write-only).
The remediation therefore had to make the application's enforced TLS posture
independent of DSN spelling — which it already was in substance; only the DSN
lint disagreed with the deployed configuration.

## 3. The change — VERIFIED

`src/db/tls.ts` (no other runtime file changed):

| Aspect | Before | After |
| --- | --- | --- |
| Accepted `sslmode` (remote DSN) | `verify-full` only | `verify-full` (recommended), `require` (upgraded), absent (strict default) |
| Effective TLS mode | verify-full, in code | **unchanged**: verify-full, in code — pinned CA + chain + hostname verification |
| `rejectUnauthorized` | hard-coded `true` | hard-coded `true` (unchanged) |
| `checkServerIdentity` | never set (Node default runs) | never set (unchanged) |
| IP-literal host | rejected | rejected (unchanged) |
| `uselibpqcompat` | rejected | rejected (unchanged) |
| Weak modes (`disable/no-verify/allow/prefer/verify-ca`) | rejected | rejected (unchanged) |
| Other `ssl*` DSN params (`ssl`, `sslcert`, `sslkey`, `sslrootcert`, `sslpassword`, `sslnegotiation`) | not specifically gated (only reachable with a valid `sslmode`) | **rejected outright** — any of them makes pg-connection-string emit an `ssl` value that clobbers the pinned `ssl` object in pg's merge |
| Params stripped from the DSN handed to pg | `sslmode` only | **every `ssl*` parameter** |
| Loopback local-dev exemption | loopback + non-production + explicit flag | unchanged |
| `NODE_TLS_REJECT_UNAUTHORIZED` guard | any value ≠ `1` throws | unchanged |

Why accepting `sslmode=require` is not a verification weakening: the parameter
never reaches pg (it is stripped), and the TLS configuration is supplied
directly by this module — pinned Supabase roots, `rejectUnauthorized: true`,
Node's default hostname check. The connection established is cryptographically
verified against the pinned `prod-ca-2021`/`prod-ca-2025` anchors regardless
of what the DSN says. A DSN asking for something weaker than verification is
still rejected outright. There is no accepted DSN spelling that produces a
weaker connection than another.

## 4. Verification matrix — VERIFIED (local, CI-equivalent)

| Check | Result |
| --- | --- |
| `tsc --noEmit` | PASS (0 errors) |
| `eslint .` | PASS (0 errors, 1 pre-existing warning) |
| `tests/security/database-tls-trust.test.ts` | PASS 62/62 (47 → 62: +3 accepted-form policy tests, +9 forbidden `ssl*` parameter shapes, +upgraded-`require`-with-`uselibpqcompat` rejection, +unrecognised-sslmode rejection, +real-handshake hostname-mismatch refusal) |
| Full vitest suite (embedded PostgreSQL 16, CI env, `next start` E2E server) | PASS 3242 / 0 failed / 5 skipped (CI tolerance ≤ 5) |
| `next build` with runtime secrets | PASS |
| `next build` without runtime secrets (deployment parity) | PASS |
| Local `/api/health` under `next start` | HTTP 200 `{"ok":true,"system":"BEYU-OS/1.0.0","checks":{"database":"UP"}}` |
| `npm run scan:secrets` | PASS (0 findings, 1630 files) |
| Policy probe (all accepted forms → identical strict config; all forbidden forms → `DatabaseTlsTrustError`) | PASS |

Post-merge production verification is recorded in §5 by the governed pipeline
(push-to-main `db-release` run) and the production health endpoint.

## 5. Production verification — VERIFIED (2026-09-11, post-merge)

Merged as PR #53 (merge commit `8f5d90d0d518fb33054fdfc56d0a1b8b7f9a56f0`,
2026-09-11T22:41:42Z). The push-to-main `db-release` run 34655116794 completed
with EVERY job green:

| Job | Result |
| --- | --- |
| Migration validation (scratch PostgreSQL 16) | ✓ 57s |
| **Production preflight (read-only)** — the previously failing step | **✓ 24s** |
| Production database deploy + verify (schema fingerprint · migrations · RLS · runtime-role constraints) | ✓ 33s — fingerprint `4122dfedf60ac130f269990bca1f4019` matches expected |
| Three-way release record | ✓ tag `db-release-8f5d90d0-132` |
| **Runtime verification (production /api/health)** | **✓ 5s — first poll reported database UP** |

CI on main (run 34655116570): all 7 jobs green, including the committed-secret
scan and the Root BEYU OS PostgreSQL security gate (full regression suite).

Vercel deployment for main commit `8f5d90d`: state **success** —
`https://vercel.com/yumvalila-1204s-projects/beyu-os-1-0/5pxBThqnuyb8SZ9hN4C2ShT25EdK`.

Direct production endpoint verification (independent of the pipeline):

```json
GET https://beyu-os-1-0.vercel.app/api/health  →  HTTP 200
{"ok":true,"system":"BEYU-OS/1.0.0","checks":{"database":"UP"},"latencyMs":690}
```

(repeated ~10 min later: `{"ok":true,...,"checks":{"database":"UP"},"latencyMs":675}`).
The ~0.7 s latency is a real cold serverless connection: pinned-CA TLS
handshake → SCRAM authentication → `select 1`. A `database: UP` report is only
reachable through a successful verified connection on the canonical pool
(`src/lib/db-health.ts`); no non-verifying connection path exists in the
runtime (`rejectUnauthorized` hard-coded `true`; no `checkServerIdentity`
override; trust narrowed to the pinned Supabase anchors; hostname verification
active against the DNS host `aws-0-eu-west-3.pooler.supabase.com`).

## 6. Regression checks — VERIFIED

- CAP_POSTING lock: `tests/security/activation-gate.test.ts` (25 tests) and
  `tests/architecture/constitutional-invariants.test.ts` green, locally and in
  the CI root gate. No posting route or capability changes are in the diff.
- RLS: the db-release deploy job's verify step re-asserted RLS-enabled tables
  and policies against production; the CI root gate ran the tenant-isolation
  and RLS suites green. No RLS change is in the diff.
- Auth/governance/audit surfaces: full suite 3242 passed / 0 failed.

## 7. Follow-up recommendations (not blockers)

1. **Vercel `DATABASE_URL` hygiene (optional):** appending
   `sslmode=verify-full` to the production DSN remains the recommended
   spelling and is now accepted; `sslmode=require` is upgraded in code either
   way, so this is documentation clarity, not a fix.
2. **Supabase SSL enforcement:** the admin control probe (2026-09-11,
   run 34648722567) connected to the session pooler over PLAINTEXT (the bare
   admin DSN + pg's no-TLS default), which indicates the project's SSL
   enforcement toggle is currently disabled. Enabling it in the Supabase
   dashboard would reject plaintext clients; BEYU's runtime (verified TLS,
   pinned CA) is unaffected. Owner action; not required for the remediated
   connection, which is always verified.
3. **GitHub `BEYU_ADMIN_DATABASE_URL`:** now policy-valid as configured; no
   change required.
