# BEYU OS — TLS CA trust remediation: verified evidence and final audit

**Date:** 2026-09-10 · **Branch:** `arena/01a08a1d-beyu-os-1-0` · **PR:** #51
**Supersedes:** `2026-09-10-prod-tls-forensics-SELF_SIGNED_CERT_IN_CHAIN.md` (whose §5 and §6
conclusions are corrected below).

Every statement is labelled **OBSERVED** (measured this session), **VERIFIED**
(independently recomputed/cross-checked), **INFERRED** (reasoned from evidence)
or **UNKNOWN** (could not be established here).

---

## A. Exact production endpoint — VERIFIED

| Fact | Value | Source |
| --- | --- | --- |
| Host | `aws-0-eu-west-3.pooler.supabase.com` | `.env.example`, `docs/forensics/…`, workflow defaults |
| Runtime port | `6543` — Supavisor **transaction** pooler | `.env.example`, `scripts/certify-production.mts` |
| Admin port | `5432` — Supavisor **session** pooler | `.env.example` |
| Database | `postgres` | `.env.example` |
| Project ref | `siyzygezdmlxbvwttrdz` | `.env.example` |
| Region | eu-west-3 (Paris) | `.env.example` |
| Runtime user shape | `beyu_runtime.siyzygezdmlxbvwttrdz` | `.env.example` |
| Resolved IPs | `15.188.134.6`, `13.39.246.141` → `pool-tcp-eu-west-3-9eda807-….elb.eu-west-3.amazonaws.com` | **OBSERVED** via OS resolver in this sandbox and in the Actions capture |
| TLS mode required | `verify-full` | Supabase docs; enforced by `src/db/tls.ts` |
| Runtime environment | Vercel (Node 24 line) | `docs/forensics/…`; Actions matrix reproduced 24.20.0 |

The Supabase **API** URL is not used: BEYU does not use `supabase-js`, Supabase
Auth or PostgREST. Supabase is only the managed PostgreSQL host.

---

## B. Authoritative CA — VERIFIED

Two independent first-party artifacts in Supabase's own CLI repository
[`supabase/cli`](https://github.com/supabase/cli) agree **byte-for-byte**:

- `apps/cli-go/internal/gen/types/templates/prod-ca-2021.crt` (loaded with `//go:embed`)
- `apps/cli/src/commands/gen/types/templates/prod-ca-2021.ts`
- …and the same pair for `prod-ca-2025`.

| Anchor | Subject | Serial | Validity | SHA-256 (DER) |
| --- | --- | --- | --- | --- |
| `prod-ca-2021` | `C=US, ST=Delware, L=New Castle, O=Supabase Inc, CN=Supabase Root 2021 CA` | `6CBC4CA1DEB63F692D0A2024C67289C2D13D54F6` | 2021-04-28 → 2031-04-26 | `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa` |
| `prod-ca-2025` | identical CN | `797FA0A5F9AC456F5AB05911BE3C978C7C5B7E07` | 2025-09-03 → 2035-09-01 | `5f9b77951a7aa1303f9b58eea9bfa89e358cfdc15f9786ff10d4930a722c9ae2` |

Both are self-signed (`SKI == AKI`), `CA:TRUE` critical, and each self-signature
validates under `openssl verify -CAfile <self> <self>`. Note the literal
`ST=Delware` misspelling — it is inside Supabase's own certificate and is a
useful authenticity marker.

**Material finding:** the two anchors share one subject name but have
**different keys**. Supabase rotated the root *key* on 2025-09-03 and reused
`CN=Supabase Root 2021 CA`. Trusting by name is therefore worthless; trust is
pinned by fingerprint.

`staging-ca-2021.crt` (`CN=Supabase Staging Root 2021 CA`) was retrieved and
**deliberately excluded** — BEYU production must not trust the staging root. A
test asserts that adding it to the bundle fails closed.

**UNKNOWN:** no public Supabase changelog entry for the 2025 database root
rotation was located (a changelog entry exists only for the *HTTP API* CA change,
DigiCert → Cloudflare). The rotation is established from the certificates
themselves, not from an announcement.

---

## C. Captured chain comparison — OBSERVED

Evidence: `docs/forensics/evidence/tls-{chain,trust-matrix}-node{22,24}.jsonl`,
captured by a read-only, credential-free GitHub Actions job (PR #51) from a
vantage that can reach Supabase. Node **24.20.0** (OpenSSL 3.5.7, 118 bundled
roots) and Node **22.23.2** (OpenSSL 3.5.7, 145 bundled roots).

Served chain, **identical on both ports and both Node versions**:

| Depth | Role | Subject | Issuer | Validity | SHA-256 (DER) |
| --- | --- | --- | --- | --- | --- |
| 0 | leaf | `CN=*.pooler.supabase.com` (SAN `*.pooler.supabase.com`, `*.pooler.supabase.co`) | `Supabase Intermediate 2021 CA` | 2025-03-12 → 2030-03-11 | `03709ca44d1b06e4504da0a83b6ca065761edc704cd5634bcc3894fd5c7b3248` |
| 1 | intermediate | `CN=Supabase Intermediate 2021 CA` (`CA:TRUE`) | `Supabase Root 2021 CA` | 2023-10-24 → 2033-10-21 | `303b0a59bbc8d77e967fbed20b3fe68ec5d7d391c3081ece9936efceef0a55ea` |
| 2 | self-signed root | `CN=Supabase Root 2021 CA` | itself | 2021-04-28 → 2031-04-26 | `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa` |

- node22 vs node24 chains: **byte-identical** (all three fingerprints match).
- port 6543 vs 5432 chains: **identical**.
- The chain is internally consistent: leaf → intermediate → root, each issuer
  matching the next subject, all within validity.
- The server **sends its own root** in the chain. That is the trigger for
  OpenSSL error #19 rather than a missing-intermediate error.
- `inNodeBundledCAStore = false` for **all three** certificates (recomputed with
  correct fingerprint normalisation). This is the root cause.

**Correction to the earlier report:** its §5 concluded from Certificate
Transparency logs that `*.pooler.supabase.com` leafs are issued by *Amazon Trust
Services* (`Amazon RSA 2048 M0x` → `Amazon Root CA 1`). **That is false for these
endpoints.** The measured served chain is Supabase's own private hierarchy. Its
§6 conclusion — that Node 24's root pruning was "not the mechanism here" — was
right, but for the wrong reason: the failure is not Node-version-specific at all
(see E).

**Tool defect found and fixed:** `scripts/tls-trust-matrix.mjs` compared Node's
colon-separated `fingerprint256` against no-colon hex digests, so
`inSupabaseAnchors` reported a **false negative** for the served root. The
membership values above were recomputed with normalisation; the handshake
verdicts were never affected because they come from real TLS handshakes.

---

## D. Supabase Root 2021 verification — VERIFIED, MATCH

| Item | Value |
| --- | --- |
| Captured (served) root fingerprint | `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA` |
| Independently calculated from Supabase's CLI material | `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa` |
| Subject | identical |
| Serial | `6CBC4CA1DEB63F692D0A2024C67289C2D13D54F6` — identical |
| Validity | 2021-04-28 10:56:53 → 2031-04-26 10:56:53 — identical |
| SKI == AKI | `A8:D7:B9:76:37:D8:2C:ED:92:12:26:9E:0E:32:24:D5:2D:69:46:2C` — identical |
| **Conclusion** | **MATCH.** The pinned `prod-ca-2021` *is* the certificate the endpoint presents as its root. |

The captured root is the **2021** root. The 2025 root is not currently used to
sign the pooler chain; it is pinned as the second anchor for the announced
rotation, and its presence was proven not to break the handshake.

---

## E. TLS validation — OBSERVED (from GitHub Actions)

Strict handshakes with `rejectUnauthorized: true`, `servername` = pooler host,
no `checkServerIdentity` override:

| Port | Trust set | Result |
| --- | --- | --- |
| 6543 | Node default store | **FAIL** — `SELF_SIGNED_CERT_IN_CHAIN` |
| 6543 | **Pinned Supabase anchors only** | **PASS** — TLSv1.3 / `TLS_AES_256_GCM_SHA384`, authorized, hostname OK |
| 6543 | Supabase anchors + default store | PASS |
| 5432 | Node default store | **FAIL** — `SELF_SIGNED_CERT_IN_CHAIN` |
| 5432 | **Pinned Supabase anchors only** | **PASS** — same |
| 5432 | Supabase anchors + default store | PASS |

- **Node 22 and Node 24 verdicts are identical.** The incident is not
  Node-version-specific.
- Hostname validation: `OK (SAN matches SNI hostname)` — the wildcard SAN
  `*.pooler.supabase.com` matches the pooler hostname.
- **Narrow trust is sufficient.** Pinning only the two Supabase anchors verifies;
  the ~118–145 public roots are not needed, so BEYU narrows trust rather than
  widening it.
- **This is the exact production error**, reproduced from an independent vantage
  against the exact production endpoint.

**Root cause (VERIFIED):** Supabase's pooler presents a three-certificate chain
terminating in its **private** `Supabase Root 2021 CA`, which the server includes
in the served chain. That root has never been in the Mozilla/NSS root programme,
so it is absent from Node's bundled store on Vercel. Any client relying on the
ambient store fails with OpenSSL `X509_V_ERR_SELF_SIGNED_CERT_IN_CHAIN` (#19).

**Resolution of an apparent contradiction:** migrations appeared to succeed
against the session pooler, which would contradict the measurement above. They
did not connect to Supabase: run `34445310403` executed only
*Migration validation (scratch PostgreSQL 16)*; *Production preflight*,
*Production database deploy + verify* and *Runtime verification* were all
**skipped**. No contradiction remains.

**Also confirmed by source inspection** (`pg-connection-string@2.14.0`,
`pg@8.20.0`, installed): in the default path `sslmode=require` is an **alias of
`verify-full`** — it only emits a deprecation warning and leaves `ssl = {}`, so
Node's default `rejectUnauthorized: true` applies. Verification was already ON in
production; the DSN was written assuming libpq semantics. Forbidden branches in
the same file: `sslmode=no-verify` and `uselibpqcompat=true&sslmode=require` both
set `rejectUnauthorized = false`; `uselibpqcompat=true&sslmode=require` with a
root cert replaces `checkServerIdentity` with a no-op; `sslmode=disable` sets
`ssl = false`. All are rejected by `src/db/tls.ts`.

---

## F. Application configuration

| File | Change |
| --- | --- |
| `config/tls/supabase/prod-ca-2021.crt`, `prod-ca-2025.crt`, `README.md` | Canonical provenance artifacts for the pinned trust anchors |
| `src/db/supabase-ca.ts` | The same anchors **embedded as source**, so the production trust store never depends on the bundler copying an unreferenced directory |
| `src/db/tls.ts` | New single authoritative TLS decision point |
| `src/db/index.ts`, `src/db/admin.ts` | Build the pool through that module |
| `src/lib/db-health.ts` | New `DATABASE_TLS_TRUST_MISCONFIGURED` classification |
| `.env.example`, `.github/workflows/db-release.yml`, `scripts/certify-production.mts` | `sslmode=verify-full` |
| `scripts/tls-preflight.mts` | New fail-closed 12-check production preflight (`npm run preflight:tls`) |
| `scripts/tls-trust-matrix.mjs`, `.github/workflows/tls-trust-evidence.yml` | Read-only evidence tooling |

**Verification mode:** `rejectUnauthorized: true`, hard-coded. No caller,
environment variable or DSN parameter can change it.
**Hostname verification:** preserved — `checkServerIdentity` is never set, so
Node's default runs against the `servername` pg derives from the DSN host
(`node_modules/pg/lib/connection.js`).
**Trust scope:** `ca` **replaces** Node's default store for this connection, so a
BEYU database session can only chain to the two pinned Supabase roots.
**Fail-closed:** unpinned / substituted / unexpected / missing CA material,
malformed PEM, a non-existent `BEYU_SUPABASE_CA_DIR`, `sslmode` of
`disable|no-verify|allow|prefer|verify-ca`, `uselibpqcompat`, IP-literal hosts,
and `NODE_TLS_REJECT_UNAUTHORIZED != 1` all **throw** before connecting.

**The pg trap (VERIFIED empirically):** `pg/lib/connection-parameters.js` does
`config = Object.assign({}, config, parse(config.connectionString))`, and
`pg-connection-string` sets `ssl = {}` for any `sslmode`. So the obvious fix —
`new Pool({ connectionString: "…?sslmode=verify-full", ssl: { ca } })` — **silently
discards the CA**. Measured with pg 8.20.0: with `sslmode` present the explicit
`ssl` becomes `{}`; with it removed the CA survives. The builder therefore strips
`sslmode` and supplies the equivalent-or-stronger config directly; a regression
test pins this.

**Environment scoping:** strict is the default. The single narrow exemption is a
loopback DSN in a non-production environment (CI embedded Postgres, local dev).
Production is always strict, including for loopback; any remote host is always
strict.

---

## G. Vercel — Preview VERIFIED, Production NOT VERIFIED

**OBSERVED (from the `vercel[bot]` status comment on PR #51, read through the
GitHub API):**

| Fact | Value |
| --- | --- |
| Vercel project | `beyu-os-1-0` |
| Project id | `prj_2lwDKNVHO6TUxkLYCA4m7wR5elrj` |
| Team | `yumvalila-1204s-projects` (`team_RA6qPCDSBllATerF6MZxC0jG`) |
| Deployment for this branch | **Preview** — `beyu-os-1-0-git-arena-01a08a1d-…-yumvalila-1204s-projects.vercel.app` |
| Preview build result | **Vercel check: SUCCESS**; *Vercel Preview Comments*: SUCCESS |

So the remediation **builds and deploys successfully on Vercel** — the embedded
CA compiles into the server bundle and the production build completes without
runtime secrets.

**Production is NOT verified and cannot be from this environment:**

- no Vercel CLI, no `VERCEL_TOKEN`, no `.vercel` link → environment variables,
  deployment history and runtime logs are unreadable here;
- this sandbox cannot reach `*.vercel.app` — **OBSERVED**
  `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL` against
  `https://beyu-os-1-0.vercel.app`, while `https://api.github.com` returns 200.
  That is a sandbox egress block, **not** evidence about the site;
- PR #51 is unmerged, so production still runs `main` (`6a1f25c`), which does not
  contain the fix.

**Production IS currently failing — VERIFIED from a runner that has egress.** The
`db-release` job *Runtime verification (production /api/health)* failed on both
recent `main` commits (`6a1f25c` at 06:29Z, `d8de4fc` at 05:08Z) with:

> Production runtime does not report database UP after 12 minutes.

The annotation's suggested cause ("DATABASE_URL not configured, or the Supabase
project is unreachable") is the workflow author's guess; the measured cause is
the TLS trust failure in section E. Note this job is **skipped on
`pull_request`**, so it gives no signal for this branch until it is merged.

Required, by variable **name** only (never value):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production, Preview | Runtime DSN — must be `sslmode=verify-full` |
| `BEYU_RUNTIME_DATABASE_URL` | Production, Preview | Runtime-role DSN for the privilege audit |
| `BEYU_ADMIN_DATABASE_URL` | migrations only | Admin/migration DSN — must be `sslmode=verify-full` |
| `AUTH_SECRET`, `MFA_ENCRYPTION_KEY` | Production, Preview | Session / MFA keys (unchanged) |
| `BEYU_ENV=production` | Production | Production guard; also disables the loopback plaintext opt-in |

No CA material needs to be added to Vercel: the anchors are embedded in
`src/db/supabase-ca.ts` and compile into the server bundle (verified present in
`.next/server/chunks/ssr/_0tf86sq._.js`). **`NODE_EXTRA_CA_CERTS` is not required
and must not be used as a workaround.** `BEYU_ALLOW_LOCAL_PLAINTEXT_DB` must
**never** be set in any Vercel environment.

## H. Database — partially verified

- **Local/CI:** `npm run migrate`, `scripts/setup-db-role.ts` and `npm run seed`
  all ran clean against the embedded PostgreSQL 16. **OBSERVED.**
- **Runtime role invariants:** `scripts/setup-db-role.ts` reported `rolsuper:
  false`, `rolbypassrls: false`, `rolcreaterole: false`, `rolcreatedb: false`.
  **OBSERVED** (local).
- **Production connectivity / production RLS:** **UNKNOWN** — requires
  credentials and Vercel access not available here.
- No migration was added or altered. No RLS policy was changed. No privilege was
  widened. The admin DSN is still never used by the runtime request path.

---

## I. Tests

Full suite against the embedded PostgreSQL 16 (migrated, runtime role
provisioned, seeded), CI-equivalent environment:

```
Test Files  158 passed | 15 skipped (173)
     Tests  3077 passed | 153 skipped (3230)
```

- New: `tests/security/database-tls-trust.test.ts` — **45 tests, all passing**.
  Covers fingerprint recomputation, the pg `sslmode` merge trap, environment
  scoping, and fail-closed negatives, including a **real TLS handshake** that
  reproduces OpenSSL error #19 against a served chain whose root is not a pinned
  anchor, and accepts the same chain when its root is.
- **A regression introduced by this change was found and fixed (see below).**
- One pre-existing test was updated: `tests/api/health-integration.test.ts` used
  `sslmode=require` in a fixture meant to exercise the DNS-failure path; the new
  policy correctly rejects it first, so the fixture now uses `verify-full`.
- **Blocked, with reason:** no test can contact the production Supabase database
  (no credentials in this environment, and this sandbox's egress drops the
  PostgreSQL data path — **OBSERVED**: `NO_SSL_REPLY_CONNECTION_CLOSED` /
  `ECONNRESET`). Production-equivalent TLS was therefore proven from GitHub
  Actions instead (section E).
- `npm run typecheck` and `eslint` on all changed files: clean. **OBSERVED.**

Preflight runs (**OBSERVED**, stable across repeated runs):
- production-shaped DSN → `PASS 14 / FAIL 0 / BLOCKED 8`, exit **2** (blocked =
  sandbox egress, correctly not upgraded to pass)
- `sslmode=require` → **FAIL**, exit **1**
- `NODE_TLS_REJECT_UNAUTHORIZED=0` → **FAIL**, exit **1**

---

## I-bis. Regression found in CI and fixed

The first CI run against this branch **failed** at the *Root BEYU OS —
PostgreSQL security gate* job, step `Start application for end-to-end tests`
(`.github/workflows/ci.yml`: `npx next start`, then `curl -sf /api/health`),
with `application did not become ready`.

**Root cause (REPRODUCED, not inferred):** `next start` forces
`NODE_ENV=production`. The original policy exempted loopback only when the
environment was *not* production, so CI's loopback DSN
(`…@127.0.0.1:5432/beyu_os`, no `sslmode`) was rejected with
`DATABASE_URL must set sslmode=verify-full explicitly.` The pool threw, health
returned 503, and the server never became ready. Confirmed directly:

```
NODE_ENV=production  → THREW: DATABASE_URL must set sslmode=verify-full explicitly.
NODE_ENV=test        → allowed, localDevelopment=true, ssl=undefined
```

The server log independently confirms the premise:
`{"environment":"production", …}` under `next start`.

**Fix:** loopback plaintext now requires an explicit, auditable opt-in
`BEYU_ALLOW_LOCAL_PLAINTEXT_DB=1`, which CI sets. It cannot weaken a real
deployment:

- it is **ignored when `BEYU_ENV=production`** — the documented production guard
  always wins, so production is strict even for loopback;
- it is only ever consulted for a **loopback** host; any remote host is verified
  with pinned CA + hostname regardless;
- a loopback connection has no network path, and the preflight independently
  fails any production deployment whose endpoint is not the real Supabase pooler.

All three properties are covered by tests.

**Re-verified end-to-end after the fix**, reproducing the exact CI step:
`npm run build` → `npx next start` → `curl -sf /api/health` →
`200 {"ok":true,"checks":{"database":"UP"}}`.

**Second hardening from the same investigation:** the anchors are now embedded
in `src/db/supabase-ca.ts` rather than read from disk at runtime. A local build
showed the `.crt` files were **not** present in `.next`, so relying on
`outputFileTracingIncludes` would have shipped a production outage whose failure
mode is "CA bundle directory not found" — and that assumption cannot be verified
from a sandbox. After the change the anchor PEM and its fingerprint constant are
present in the compiled chunk `.next/server/chunks/ssr/_0tf86sq._.js`, so the
trust material travels with the bundle. `outputFileTracingIncludes` was removed
as unnecessary. A test asserts the embedded PEMs are byte-identical to the
committed `.crt` files and match the allowlist, so the two cannot diverge.

---

## J. Security regression search — clean

Repo-wide search after the change for `rejectUnauthorized=false`,
`NODE_TLS_REJECT_UNAUTHORIZED=0`, `sslmode=disable|no-verify|require`,
`insecureSkipVerify`, `checkServerIdentity`, `NODE_EXTRA_CA_CERTS`,
`PGSSLROOTCERT`, `PGSSLMODE`:

- **No insecure setting exists in any production code path.**
- `scripts/forensic-tls-chain-capture.mjs` and `scripts/tls-trust-matrix.mjs` set
  `rejectUnauthorized: false` in one labelled `captureOnly` handshake each, whose
  sole purpose is to *record* a chain a strict handshake refuses to surface. Both
  are `workflow_dispatch`-only, credential-free, and never used as a verdict.
  This is diagnostic-only and is documented in the file headers.
- `scripts/forensic-tls-repro.mts` intentionally constructs `sslmode=require` /
  `uselibpqcompat` scenarios — it is the harness that *proved* those weaken
  verification.
- `src/db/tls.ts` names the forbidden constructs in prose comments; the
  source-scan test strips comments before asserting, so documentation cannot mask
  a real bypass.
- Two test fixtures were changed from `sslmode=require` to `verify-full`.

**Definitive executable-code scan (OBSERVED).** All 512 `src/**/*.ts` files were
scanned with comments stripped, so documentation naming the forbidden constructs
cannot mask a real bypass:

```
rejectUnauthorized assignments found: 3   not-true: 0   (all in src/db/tls.ts)
hard-pattern hits across 512 src files: 0
RESULT: CLEAN — no verification bypass in any executable production source.
```

Hard patterns tested: `rejectUnauthorized=false`,
`NODE_TLS_REJECT_UNAUTHORIZED=0`, `sslmode=disable`, `sslmode=no-verify`,
`insecureSkipVerify`, `checkServerIdentity =`, `uselibpqcompat=true`.

**PR #51 diff audit (OBSERVED):** 24 files; no `.key`, `.pem`, `.p12`, `.pfx`,
`id_rsa` or `.env` file; `scripts/scan-secrets.mjs` reports
"Secret scan clean: scanned 1628 tracked files"; CI's *Committed secret scan*
job passes. No migration was added or altered, and no unrelated architecture was
touched.

---

## K. Production status

**PRODUCTION BLOCKED — HUMAN/GITHUB/VERCEL ACTION REQUIRED**

Verified complete:

| Item | Result |
| --- | --- |
| Branch / head commit | `arena/01a08a1d-beyu-os-1-0` @ `2897839` (pushed; remote tip confirmed) |
| PR #51 | OPEN, base `main`, `MERGEABLE`, `mergeState=CLEAN`, not a draft, not merged |
| CI on `2897839` | **All 7 jobs SUCCESS**, run `34456228511` |
| TLS tests | 45/45 pass (incl. real-handshake error-#19 reproduction) |
| Full suite | 158 files / **3077 passed, 0 failed**, 153 skipped |
| Typecheck / lint | clean |
| Vercel Preview build | **SUCCESS** |
| Production endpoint | `aws-0-eu-west-3.pooler.supabase.com` 6543 (runtime) / 5432 (admin), db `postgres`, ref `siyzygezdmlxbvwttrdz` |
| CA fingerprint | served root `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa` **== pinned `prod-ca-2021`** |
| TLS validation | TLSv1.3 / `TLS_AES_256_GCM_SHA384`, authorized, hostname `OK (SAN matches SNI)` — from Actions against the exact endpoint |
| Security regression | CLEAN (executable-code scan, 0 hits) |
| Merge | **NOT merged** |
| Production `/api/health` | **NOT verified from here**; production is currently DOWN on `main` (verified via the db-release runtime gate) |

Exactly three human actions remain, and none of them can be performed from this
session (no merge authority without approval, no Vercel credentials, no egress to
`*.vercel.app`):

1. **Review and merge PR #51** (`2897839`) into `main`. CI is green, but merging
   on green CI alone is not this repository's policy — human approval is
   required, so the gate was stopped here rather than merged.
2. **Set `sslmode=verify-full`** on `DATABASE_URL`, `BEYU_RUNTIME_DATABASE_URL`
   (Vercel, Production **and** Preview) and on the `BEYU_ADMIN_DATABASE_URL`
   repository secret. This is fail-closed by design: an un-updated DSN fails
   loudly with `DATABASE_TLS_TRUST_MISCONFIGURED` rather than silently
   under-verifying. Do **not** set `BEYU_ALLOW_LOCAL_PLAINTEXT_DB` anywhere.
3. **Confirm production** by either watching the post-merge `db-release`
   *Runtime verification (production /api/health)* job, or running
   `npm run preflight:tls` from a host with Supabase egress and production
   credentials and requiring exit `0` (all 12 checks PASS, none BLOCKED).

Only after step 3 reports green may the status become
`PRODUCTION RECOVERED — TLS TRUST VERIFIED`. Declaring it now would be
fabrication: the deployed production commit does not yet contain the fix.

No verification was weakened at any point, no insecure fallback was introduced,
and no private key was committed.
