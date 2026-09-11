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

## 5. Production verification — recorded after merge

- `GET https://beyu-os-1-0.vercel.app/api/health` → target
  `{"ok":true,"system":"BEYU-OS/1.0.0","checks":{"database":"UP"}}`
- `db-release` push run: live preflight (admin DSN, now policy-valid, verified
  TLS), deploy + verify, three-way release record, runtime verification.
