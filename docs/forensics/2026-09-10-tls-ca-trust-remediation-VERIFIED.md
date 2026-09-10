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
| `config/tls/supabase/prod-ca-2021.crt`, `prod-ca-2025.crt`, `README.md` | New pinned trust anchors + provenance/rotation procedure |
| `src/db/tls.ts` | New single authoritative TLS decision point |
| `src/db/index.ts`, `src/db/admin.ts` | Build the pool through that module |
| `src/lib/db-health.ts` | New `DATABASE_TLS_TRUST_MISCONFIGURED` classification |
| `next.config.ts` | `outputFileTracingIncludes` so the CA bundle ships to Vercel |
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

## G. Vercel — NOT VERIFIED (blocked)

**UNKNOWN.** This session has no Vercel CLI or token access, so the production
deployment, its environment variables and its runtime logs could not be
inspected. Nothing here may be read as production verification.

Required, by variable **name** only (never value):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production, Preview | Runtime DSN — must be `sslmode=verify-full` |
| `BEYU_RUNTIME_DATABASE_URL` | Production, Preview | Runtime-role DSN for the privilege audit |
| `BEYU_ADMIN_DATABASE_URL` | migrations only | Admin/migration DSN — must be `sslmode=verify-full` |
| `AUTH_SECRET`, `MFA_ENCRYPTION_KEY` | Production, Preview | Session / MFA keys (unchanged) |
| `BEYU_ENV=production` | Production | Production guard |

No CA material needs to be added to Vercel: the anchors are committed and traced
into the deployment by `outputFileTracingIncludes`. **`NODE_EXTRA_CA_CERTS` is not
required and must not be used as a workaround.**

⚠️ **Required deployment step:** every DSN must change `sslmode=require` →
`sslmode=verify-full`. An un-updated DSN fails closed with an actionable error.

---

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
Test Files  157 passed | 15 skipped (173)
     Tests  3071 passed | 153 skipped (3225)
```

- New: `tests/security/database-tls-trust.test.ts` — **40 tests, all passing**.
  Covers fingerprint recomputation, the pg `sslmode` merge trap, environment
  scoping, and fail-closed negatives, including a **real TLS handshake** that
  reproduces OpenSSL error #19 against a served chain whose root is not a pinned
  anchor, and accepts the same chain when its root is.
- One pre-existing test was updated: `tests/api/health-integration.test.ts` used
  `sslmode=require` in a fixture meant to exercise the DNS-failure path; the new
  policy correctly rejects it first, so the fixture now uses `verify-full`.
- **Blocked, with reason:** no test can contact the production Supabase database
  (no credentials in this environment, and this sandbox's egress drops the
  PostgreSQL data path — **OBSERVED**: `NO_SSL_REPLY_CONNECTION_CLOSED` /
  `ECONNRESET`). Production-equivalent TLS was therefore proven from GitHub
  Actions instead (section E).
- `npm run typecheck` and `eslint` on all changed files: clean. **OBSERVED.**

Preflight runs (**OBSERVED**):
- production-shaped DSN → `PASS 14 / FAIL 0 / BLOCKED 8`, exit **2** (blocked =
  sandbox egress, correctly not upgraded to pass)
- `sslmode=require` → **FAIL**, exit **1**
- `NODE_TLS_REJECT_UNAUTHORIZED=0` → **FAIL**, exit **1**

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

---

## K. Production status

**PRODUCTION BLOCKED — AUTHORITATIVE TLS TRUST EVIDENCE INCOMPLETE**

The authoritative CA **is** established and verified, the exact production
endpoint **is** established, the served chain **is** captured and matched to the
pinned anchor, and the trust configuration **is** proven to produce a
fully-verified, hostname-checked TLSv1.3 session against the exact production
endpoint from an independent vantage.

What remains unverified is **the production deployment itself**: no Vercel access
and no production database credentials were available, so the deployed commit,
its environment variables, `GET /api/health` and a real authenticated
`beyu_runtime` session have not been observed. Declaring recovery without them
would be fabrication.

To close it:

1. Set `sslmode=verify-full` on `DATABASE_URL`, `BEYU_RUNTIME_DATABASE_URL` and
   `BEYU_ADMIN_DATABASE_URL` (Vercel **and** the GitHub repository secret).
2. Merge PR #51 and deploy.
3. Run `npm run preflight:tls` from a host with Supabase egress and production
   credentials; require exit `0` (all 12 checks PASS, none BLOCKED).
4. Confirm `GET /api/health` reports `database: UP` with no TLS classification.

No verification was weakened at any point, no insecure fallback was introduced,
and no private key was committed.
