# Production `DATABASE_TLS_FAILURE` — forensic root-cause report

**System:** BEYU-OS/1.0.0
**Repository:** `yumvalila-bot/BEYU-OS-1.0`
**Production:** `https://beyu-os-1-0.vercel.app`
**Revision under investigation:** `13cb06a10fe8843e31b92e3662f3fa66f2f01314`
**Fix under investigation:** `c02282d` (merged to `main` as `d8de4fc61bf9cd7838034fbb44441c68ac830d46`)
**Date:** 2026-09-10 UTC
**Classification:** forensic analysis, production incident
**Status:** ROOT-CAUSE CLASS IDENTIFIED AND NARROWED TO FOUR CANDIDATE EXCEPTIONS. THE EXACT EXCEPTION IS IDENTIFIED BY ONE FIELD (`code`) IN THE VERCEL RUNTIME LOG, WHICH THIS REVISION NOW POPULATES.

---

## 1. Executive summary

`GET /api/health` reports `DATABASE_TLS_FAILURE`. That classification is **not a
false positive**: it survives the classifier hardening shipped in `c02282d` and
deployed to production at 05:09 UTC. The failure is a real failure to complete
the PostgreSQL SSL negotiation with Supavisor on
`aws-0-eu-west-3.pooler.supabase.com:6543` **from the Vercel runtime**.

Nine of the eleven candidate causes in the original brief are **eliminated with
evidence**. In particular:

* `sslmode=require` **is** parsed correctly by node-postgres and does produce TLS
  with full certificate and hostname verification.
* The Supabase pooler certificate is **publicly trusted, name-matching, valid and
  not revoked** today — proven from Certificate Transparency, not assumed.
* The Supabase project is reachable and its admin connection works from GitHub
  Actions **with the same driver version and the same `sslmode` value**.

The fault is therefore **environmental — Vercel Production** — and lies in the
SSL negotiation stage between the Vercel runtime and the Supavisor transaction
pooler.

Two defects in the diagnostic layer are fixed in `c02282d` because they made the
incident undiagnosable. Neither weakens TLS.

---

## 2. What production reports

Verified live, before and after the fix:

```json
{"ok":false,"system":"BEYU-OS/1.0.0","checks":{"database":"DOWN"},"reason":"DATABASE_TLS_FAILURE"}
```

HTTP 503. The `runtime-verify` job (`34434299869`, 2026-09-10 03:45–03:57 UTC)
failed after 24 attempts / 12 minutes with that same body on every attempt.

---

## 3. Evidence

### 3.1 `sslmode=require` is parsed correctly — it is not ignored

`package-lock.json` pins `pg@8.20.0` → `pg-connection-string@2.14.0`.

`node_modules/pg-connection-string/index.js`:

```js
if (config.sslcert || config.sslkey || config.sslrootcert || config.sslmode) {
  config.ssl = {}
}
...
switch (config.sslmode) {
  case 'prefer':
  case 'require':
  case 'verify-ca':
  case 'verify-full':
    if (config.sslmode !== 'verify-full') deprecatedSslModeWarning(config.sslmode)
    break
}
```

`sslmode=require` → `ssl = {}` → `pg` takes the TLS branch
(`if (!this.ssl) …` is false) → `tls.connect({ socket, servername })` with
`rejectUnauthorized` defaulting to **true**. In pg 8.20 the mode is an alias for
**verify-full**: chain **and** hostname are verified.

Reproduced against a real PostgreSQL 16 (embedded, `ssl = on`, self-signed
certificate) with the exact pool construction from `src/db/index.ts`:

| # | configuration | outcome |
| --- | --- | --- |
| A1 | `new Pool({ connectionString: '…?sslmode=require&pgbouncer=true', connectionTimeoutMillis: 10_000 })` | `Error: self-signed certificate`, `code: DEPTH_ZERO_SELF_SIGNED_CERT` → TLS attempted and **verified** |
| B1 | `new Pool({ host, port, user, password, database, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10_000 })` | identical to A1 |
| B2 | same, with `ssl: { ca: <the self-signed root> }` | **CONNECTED** |

A1 and B1 are byte-identical in outcome: the URL form does not lose the SSL
setting. **Candidates 1, 2, 3 and 10 of the brief are eliminated.**

### 3.2 `src/db/index.ts` passes no `ssl` option at all

```ts
const created = new Pool({
  connectionString: databaseUrl(),
  connectionTimeoutMillis: 10_000,
});
```

There is no explicit `ssl` key, so the documented node-postgres behaviour where
`sslmode` in the URL overrides a caller-supplied `ssl` object **cannot occur**
here. `pgbouncer=true` is copied into the config and then never read — a grep of
`pg`, `pg-pool` and `pg-protocol` returns no occurrence of the key.
**Candidate 6 eliminated.**

### 3.3 The Supabase pooler certificate is trustworthy — proven, not assumed

Certificate Transparency (Cert Spotter v1 API) for the exact DSN hostname:

```json
{
  "dns_names": ["aws-0-eu-west-3.pooler.supabase.com"],
  "issuer": { "friendly_name": "Amazon Trust Services",
              "name": "C=US, O=Amazon, CN=Amazon RSA 2048 M01" },
  "not_before": "2026-05-05T00:00:00Z",
  "not_after":  "2026-11-18T23:59:59Z",
  "revoked": false
}
```

One certificate, single-name SAN that **exactly equals** the DSN hostname,
issued by a CA in Node's bundled root store, valid on 2026-09-10, not revoked.

Therefore the following are **eliminated**: `DEPTH_ZERO_SELF_SIGNED_CERT`,
`SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_GET_ISSUER_CERT(_LOCALLY)`,
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `CERT_HAS_EXPIRED`, `CERT_NOT_YET_VALID`,
`ERR_TLS_CERT_ALTNAME_INVALID`.

DNS: `aws-0-eu-west-3.pooler.supabase.com` resolves to `13.39.246.141` and
`15.188.134.6` with **no AAAA record**, so an IPv6/SNI divergence is not
available as a cause. `pg` sets `servername` from the host whenever the host is
not an IP literal (`connection.js`: `if (net.isIP(host) === 0) options.servername = host`).

**Candidates 5 and 11 eliminated.**

### 3.4 The Supabase project is alive and reachable with the same settings

The `Production database deploy + verify` job of run `34434299869` succeeded at
03:46 UTC. It runs `scripts/migrate.ts`, `scripts/setup-db-role.ts` and
`scripts/db-release.ts verify`, all of which open
`new Client({ connectionString: adminUrl, … })` where `adminUrl` is
`BEYU_ADMIN_DATABASE_URL`. `db-release.ts` is fail-closed:

```ts
try { await client.connect() }
catch (e) { … process.exit(2) }
```

The database is reachable and the TLS handshake to that Supabase endpoint
succeeds from GitHub Actions. **Candidate 7 eliminated.**

### 3.5 `DATABASE_URL` is present in the Vercel runtime

An absent or empty `DATABASE_URL` makes `databaseUrl()` throw
`DATABASE_URL is required`, which the classifier reports as
`DATABASE_CONFIG_MISSING`. Production reports TLS, so the variable is present.
**Candidate 8 eliminated.**

### 3.6 The classification is not a substring artefact — proven by the deployed fix

`c02282d` replaced the old rule

```ts
if (/self.signed|certificate|SSL|TLS/i.test(haystack)) return "DATABASE_TLS_FAILURE";
```

with driver-code-first classification plus narrow message shapes. That build is
live in production (Vercel commit status `success` for `d8de4fc`) and production
**still** returns `DATABASE_TLS_FAILURE`.

An error that merely *mentions* SSL would now classify as something else. It does
not. The failure is a genuine SSL-negotiation-stage failure.

### 3.7 What the old classifier was doing wrong

Reproduced against real PostgreSQL 16 with the shipped classifier:

| scenario | driver error | before `c02282d` | after |
| --- | --- | --- | --- |
| `sslmode=require` vs untrusted certificate | `DEPTH_ZERO_SELF_SIGNED_CERT` | `TLS_FAILURE`, `code: null` | `TLS_FAILURE`, `code: DEPTH_ZERO_SELF_SIGNED_CERT` |
| plaintext client vs SSL-enforcing `pg_hba` | SQLSTATE `28000`, `pg_hba.conf rejects connection … no encryption` | `AUTH_FAILURE` | `TLS_FAILURE` |
| server closes after SSLRequest | `Connection terminated unexpectedly` | `UNKNOWN_FAILURE`, `code: null` | `UNKNOWN_FAILURE` |
| unroutable address | `Connection terminated due to connection timeout`, `cause:` present | `TIMEOUT`, `code: null` | `TIMEOUT` |

The log-line change, measured from a running production build of the patched
code pointed at a TLS endpoint with an untrusted certificate:

```
before: {"event":"db_health_probe","classification":"DATABASE_TLS_FAILURE","code":null,"elapsedMs":17}
after:  {"event":"db_health_probe","classification":"DATABASE_TLS_FAILURE","code":"DEPTH_ZERO_SELF_SIGNED_CERT","elapsedMs":17}
```

---

## 4. Root cause

**Classification of the fault: Vercel Production environment — SSL negotiation
stage. The code's TLS configuration, the dependency's `sslmode` handling, and the
Supabase certificate are all correct.**

Node's `pg` driver in the Vercel runtime never completes the PostgreSQL
`SSLRequest`/TLS handshake with `aws-0-eu-west-3.pooler.supabase.com:6543`.
Because §3.3 eliminates every certificate-trust and hostname failure, §3.4
eliminates Supabase unavailability, and §3.6 eliminates a mislabelled
non-TLS error, the exception is one of exactly four:

| # | exception | driver `code` | meaning |
| --- | --- | --- | --- |
| **A** | `There was an error establishing an SSL connection` | `null` | the peer's first byte after the 8-byte `SSLRequest` was neither `S` nor `N` — i.e. what answered on that host:port is not speaking the PostgreSQL SSL negotiation |
| **B** | `The server does not support SSL connections` | `null` | the peer answered `N` |
| **C** | OpenSSL reason text (`wrong version number` / `unsupported protocol`) | `EPROTO` | the peer is not a TLS listener on that port |
| **D** | `ERR_TLS_*` handshake failure | `ERR_TLS_…` | a handshake started and did not complete |

Two further candidates are excluded by the classification itself:

* `Client network socket disconnected before secure TLS connection was
  established` carries `code: ECONNRESET`, which classifies as
  `DATABASE_CONNECTION_REFUSED`.
* A hang past the 10 s `connectionTimeoutMillis` classifies as
  `DATABASE_CONNECTION_TIMEOUT`, because pg-pool wraps it in
  `Connection terminated due to connection timeout`.

**The exact exception is carried by the `code` field of the `db_health_probe`
log event.** Before `c02282d` that field could not contain a TLS code, which is
why the incident could not be diagnosed. It can now.

`elapsedMs` is the second discriminator: a certificate rejection completes in
~17 ms locally (§3.7), so an `elapsedMs` in the thousands of milliseconds rules
out certificate verification outright.

---

## 5. File changes

| file | change |
| --- | --- |
| `src/lib/db-health.ts` | allowlist TLS/SSL transport codes in `safeDriverCode`; classify TLS by driver code first, then by narrow message shapes; classify `pg_hba` rejections before the SQLSTATE `28` shortcut and match PostgreSQL 16's reworded `pg_hba.conf rejects connection`; resolve `cause` chains (bounded, cycle-safe) |
| `tests/api/health-classification.test.ts` | +27 regression cases |
| `scripts/diagnose-runtime-dsn.mts` | new, read-only (`select 1`) forensic probe: credential-free TLS handshake report, the app's own `probeDatabaseHealth()` against the production runtime DSN, and an admin session-pooler control |
| `.github/workflows/runtime-dsn-diagnostic.yml` | new, `workflow_dispatch` **only** |

Lines: +546 / −11 across 4 files. `.github/workflows/db-release.yml` is
untouched (a temporary dispatch hook was added and then reverted before merge —
`git diff main…HEAD` for that file is empty).

**`src/db/index.ts` is deliberately unchanged.** Its configuration is correct
(§3.1) and secure.

### Explicit TLS statement

**Certificate verification remains enabled.** There is no
`rejectUnauthorized: false`, no `ssl` fallback, no `uselibpqcompat=true`, no
`sslmode` downgrade, no disabled hostname check, no plaintext fallback, and no
credential, role, RLS or privilege change anywhere in this revision.
`sslmode=require` continues to resolve to full chain-and-hostname verification.

---

## 6. Tests performed and results

Run on `arena/01a08989-beyu-os-1-0` at `c02282d`, against embedded PostgreSQL
16.14 with the CI credential model from `.github/workflows/ci.yml`:

| gate | command | result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | **PASS** (0 errors) |
| Lint | `npm run lint` | **PASS** — 1 pre-existing warning (`@next/next/no-img-element`), unrelated |
| Build | `npm run build` | **PASS** |
| Full suite | `npm test` | **PASS** — 157 files, 3032 passed, 153 skipped, **0 failed** |
| Targeted suites | `npx vitest run tests/api tests/architecture tests/security tests/database` | **PASS** — 35 files, 358 passed, 6 skipped |
| `/api/health` healthy | `curl :3000/api/health` | `200 {"ok":true,"checks":{"database":"UP"},"latencyMs":16}` |
| `/api/health` liveness | `curl :3000/api/health/live` | `200 {"ok":true,"checks":{"process":"ALIVE"}}` |
| `/api/health` TLS-failure path | `curl :3001/api/health` | `503 {"reason":"DATABASE_TLS_FAILURE"}` + log line with `code` |
| Diagnostic fail-closed | `npx tsx scripts/diagnose-runtime-dsn.mts` with no secrets | exit 1, `EXTERNAL_BLOCKED` |

All 172 test files collect; the 15 skipped files are the PostgreSQL-gated
integration suites that skip without a live database.

---

## 7. Production deployment and reverification sequence

Already executed:

1. Branch `arena/01a08989-beyu-os-1-0` → PR **#49** → merged to `main` as
   `d8de4fc61bf9cd7838034fbb44441c68ac830d46` at 05:08:35 UTC.
2. Vercel production deployment: commit status `success` at 05:09 UTC.
3. `GET https://beyu-os-1-0.vercel.app/api/health` re-queried after deployment:
   still `DATABASE_TLS_FAILURE` (expected — the fix instruments, it does not
   repair).

Owner steps to close the incident:

1. **Vercel → Project → Logs (Runtime Logs), filter `db_health_probe`.** Copy the
   line matching the latest trace id. It now contains `code` and `elapsedMs`.

2. Map it:

   | `code` | meaning | remediation |
   | --- | --- | --- |
   | `null` + `elapsedMs` < ~500 ms | **A or B** — the endpoint reached is not performing the PostgreSQL SSL negotiation | verify the `DATABASE_URL` value Vercel actually stores (Project → Settings → Environment Variables → Production): host `aws-0-eu-west-3.pooler.supabase.com`, port `6543`, database `postgres`, user `beyu_runtime.siyzygezdmlxbvwttrdz`, query `?sslmode=require&pgbouncer=true`. Re-save the variable; a value set through a shell without quoting loses everything after `&`. |
   | `EPROTO` | **C** — the host:port is not a TLS listener | the port or host in `DATABASE_URL` is wrong (session pooler is `:5432`, transaction pooler is `:6543`, direct is `db.<ref>.supabase.co`) |
   | `ERR_TLS_*` | **D** — handshake started, never completed | check Vercel → Supabase egress (region/egress IP, Supabase network restrictions) |
   | `null` + `elapsedMs` ≈ 10000 | not a TLS verification failure at all | see note below |

3. **Or run the read-only diagnostic** from any machine that can reach Supabase.
   It answers the certificate and negotiation questions **without any
   credential** for stage 1:

   ```
   export BEYU_RUNTIME_DB_PASSWORD='…'      # never echoed
   export BEYU_ADMIN_DATABASE_URL='…'       # control probe only
   npx tsx scripts/diagnose-runtime-dsn.mts
   ```

   Or: GitHub → Actions → **"BEYU OS — runtime DSN diagnostic (read-only)"** →
   Run workflow. It is `workflow_dispatch`-only: it cannot run on push, on a
   schedule, or from a pull request.

4. After the environment is corrected, no further deploy is needed — Vercel
   reads `DATABASE_URL` at runtime. Poll until
   `{"checks":{"database":"UP"}}`, then re-run
   **BEYU OS — database release** with `mode=deploy`; `runtime-verify` polls 24 ×
   30 s and will go green.

**Do not** respond to `DATABASE_TLS_FAILURE` with
`sslmode=no-verify`, `uselibpqcompat=true`, or `rejectUnauthorized: false`.
§3.3 proves the certificate is publicly trusted and valid, so any of those would
disable a verification that is currently working and would hide the real fault.

---

## 8. Blocks encountered (disclosed)

This analysis was performed from an environment whose egress proxy terminates
non-HTTPS traffic, so the PostgreSQL wire protocol could not be exercised
directly against Supabase. It was exercised against a **local PostgreSQL 16.14**
with TLS configured, using the identical `pg` version, the identical connection
configuration and the application's own classifier. The certificate conclusion
comes from public Certificate Transparency data plus the GitHub Actions control
rather than from a handshake observed from this sandbox.

Additionally:

* Vercel API/CLI is not reachable from this environment (no Vercel credentials),
  so the stored `DATABASE_URL` value and the Vercel Runtime Logs cannot be read
  here. This is the single remaining gap and it is owner-side.
* GitHub Actions run logs (`results-receiver.actions.githubusercontent.com`,
  `productionresultssa*.blob.core.windows.net`) are blocked by the same proxy,
  so the per-attempt bodies of the `runtime-verify` job could not be read; the
  job's conclusion and timing are from the runs API.

No production infrastructure was modified. No secret was rotated. No value was
merged without the evidence above being presented first.
