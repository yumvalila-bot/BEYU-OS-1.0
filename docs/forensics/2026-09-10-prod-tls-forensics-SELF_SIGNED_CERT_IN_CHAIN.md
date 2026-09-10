# FORENSIC REPORT — Production `SELF_SIGNED_CERT_IN_CHAIN` (Vercel → Supabase pooler)

**Date:** 2026-09-10 · **Production deployment:** `d8de4fc` (PR #49 instrumentation) · **Mode:** READ-ONLY forensics
**Status:** Config/driver/CA-store evidence complete; the credential-free chain capture (`scripts/forensic-tls-chain-capture.mjs` + `.github/workflows/tls-chain-capture.yml`) is committed under this authorization and dispatched via `workflow_dispatch` — captured results recorded below. **No remediation authorized or implemented.**

> ⛔ **STOP honored:** nothing was merged, deployed, committed, rotated, disabled or weakened. The remediation in §10 is a *proposal only*.

---

## 1. The production evidence being explained

Vercel Production Runtime Logs, `GET /api/health`, deployment `d8de4fc`:

```json
{"event":"db_health_probe","classification":"DATABASE_TLS_FAILURE","code":"SELF_SIGNED_CERT_IN_CHAIN","elapsedMs":261}
```

Repeated with `elapsedMs` ≈ 252–304 ms, HTTP 503. The log line is trustworthy: it is emitted by `src/lib/db-health.ts` (PR #49) from the **canonical runtime pool** (`src/db/index.ts`), and its field set is fixed and sanitized.

## 2. The exact production connection configuration (as deployed)

From the repository's own deployment records (`docs/deployment/THREE_WAY_PRODUCTION_ARCHITECTURE.md`, `docs/runbooks/supabase-production-database.md`) — secrets never printed:

| Fact | Value |
| --- | --- |
| Host | `aws-0-eu-west-3.pooler.supabase.com` (Supavisor, eu-west-3/Paris) |
| Port | `6543` (transaction pooler) — runtime DSN; `5432` session pooler for admin |
| Database | `postgres` |
| User shape | `beyu_runtime.siyzygezdmlxbvwttrdz` |
| DSN query params | `?sslmode=require&pgbouncer=true` |
| Pool config (`src/db/index.ts`) | `new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 10_000 })` — **no explicit `ssl` option** |
| Resolved IPs (this vantage) | `13.39.246.141`, `15.188.134.6` → `pool-tcp-eu-west-3-9eda807-….elb.eu-west-3.amazonaws.com` (AWS ELB, Paris) |

TLS behavior is therefore determined **entirely** by the DSN's `sslmode` parsed by `pg-connection-string` — there is no code-level `ssl` override anywhere in the runtime path.

## 3. Driver truth: what `sslmode=require` means in pg 8.20.0 (verified live in this session)

Dependencies (locked, installed verbatim by Vercel from `package-lock.json`): **pg 8.20.0**, **pg-connection-string 2.14.0**.

Parsing the exact production DSN shape (dummy password) with the installed `pg-connection-string@2.14.0`:

```text
parsed.ssl = {}                       ← empty object
rejectUnauthorized explicitly set?    false (key absent)
Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are
treated as aliases for 'verify-full'. In the next major version (pg-connection-string
v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics…
```

The code path (`pg-connection-string/dist/index.js`, v2.14.0): any `sslmode` → `config.ssl = {}`; without `uselibpqcompat`, `require` falls into the default branch that only emits the deprecation warning. Then in `pg/lib/connection.js`:

```js
const options = { socket: self.stream }
if (self.ssl !== true) Object.assign(options, self.ssl)   // {} adds NOTHING
options.servername = host                                  // SNI = pooler hostname ✓
self.stream = tls.connect(options)                         // Node default rejectUnauthorized: TRUE
```

**Finding E-1 (config):** the production DSN's `sslmode=require` does **not** mean libpq's "encrypt, don't verify". In pg 8.20.0 it is an **alias of `verify-full`**: Node performs full chain verification + hostname (SAN) check with `rejectUnauthorized: true`. This is a deliberate, documented breaking change in pg-connection-string 2.x (reversed to libpq semantics only in v3/pg 9). **SNI is correct** (servername = pooler hostname).

## 4. Empirical differential: which chain shapes produce which error codes

A local reproduction harness (`scripts/forensic-tls-repro.mts`, scratch, uncommitted) ran the repository's **actual** `pg` 8.20.0 pool and **actual** `classifyConnectionError`/`safeDriverCode` against a local Postgres-STARTTLS fake endpoint presenting different chain shapes, using the exact production DSN parameter set (`sslmode=require&pgbouncer=true`; DNS patched in-process to 127.0.0.1 — zero production contact, no credentials):

| # | Served chain | DSN params | pg surfaced | Repo classification |
|---|---|---|---|---|
| S1 | leaf + **unknown self-signed root included** | `sslmode=require&pgbouncer=true` | `code: SELF_SIGNED_CERT_IN_CHAIN` | `DATABASE_TLS_FAILURE` + `SELF_SIGNED_CERT_IN_CHAIN` — **byte-identical to the Vercel log** |
| S2 | leaf only (**missing intermediate**) | same | `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | `DATABASE_TLS_FAILURE`, **different code — NOT what Vercel saw** |
| S3 | leaf + unknown intermediate, root **not sent** | same | `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | `DATABASE_TLS_FAILURE`, **different code — NOT what Vercel saw** |
| S4 | same failing server as S1 | `+uselibpqcompat=true` | **no TLS code at all** (verification skipped; reached protocol/auth layer) | proves the DSN param alone toggles verification |
| S5 | same failing server as S1 | `sslmode=verify-full` | `SELF_SIGNED_CERT_IN_CHAIN` | identical to S1 → **`require` ≡ `verify-full` alias confirmed** |

Re-ran S1 under **Node 24.19.0** (official Node 24-line binary, SHA-256-verified from PyPI `nodejs-wheel-binaries`): **identical result** — the verification semantics are not Node-version-specific.

**Finding E-2 (error semantics):** `SELF_SIGNED_CERT_IN_CHAIN` (OpenSSL X509_V_ERR_SELF_SIGNED_CERT_IN_CHAIN, #19) fires **only when the served chain itself contains a self-signed certificate that is not in the trust store** — classically a server that sends its (root) CA together with the chain, or an injected interception chain. A merely *missing intermediate* produces a **different** code (S2/S3). Therefore Vercel's Node is receiving a chain **containing an untrusted self-signed certificate** — this is no longer an inference from the error string; it is the empirically established trigger condition.

## 5. What the public certificate actually is (CT logs, independent vantage)

Certificate Transparency (certspotter, all `*.pooler.supabase.com` issuances):

- Current leafs are issued by **Amazon Trust Services** — AWS ACM: `C=US, O=Amazon, CN=Amazon RSA 2048 M01` and `…M04` (intermediates).
- Newest issuance: **2026-05-04**, valid to **2026-11-17** (older batch: issued 2025-09-17/18, valid to 2026-10-16/17). No CA switch, no expiry (today: 2026-09-10).
- Public chain shape: `leaf → Amazon RSA 2048 M0x → Amazon Root CA 1` — i.e., a **publicly trusted AWS chain**, consistent with the "publicly observed certificate appears publicly trusted" observation.

## 6. Node 24's bundled CA set (inspected, not assumed)

Vercel's Node 24 runtime uses the bundled Mozilla/NSS-derived store (`NODE_USE_SYSTEM_CA` is opt-in, not default; no `NODE_EXTRA_CA_CERTS` is set by Vercel). Official-line binaries were SHA-256-verified and inspected:

| Build | Bundled roots |
| --- | --- |
| Node 22 line (22.20.0 official-line binary / sandbox 22.22.3) | **146 / 145** |
| Node 24 line (24.19.0 official-line binary) | **120** |

- **29 roots present in the Node 22 line are pruned from the Node 24 line** (3 added). Pruned families include: `GTS Root R2`, `Entrust Root G2`, `Entrust Root EC1`, `DigiCert Global Root CA`, `DigiCert Assured ID Root CA`, `DigiCert High Assurance EV Root CA`, `Trustwave Global (×3)`, `AffirmTrust (×4)`, `QuoVadis Root CA 2/3`, `SecureTrust CA`, `Secure Global CA`, `SwissSign Gold G2`, `TeliaSonera Root v1`, `COMODO Certification Authority`, `CommScope (×4)`, and others — mirroring Mozilla NSS 3.119→3.126 store cleanups (Node commits: "crypto: update root certificates to NSS 3.121" Mar 2026 … "NSS 3.126" Aug 2026).
- **Decisive for this incident: `Amazon Root CA 1` (and 2/3/4) ARE present in Node 24's store.** A correctly-served `[leaf → Amazon RSA 2048 M0x]` chain verifies fine on Node 24.
- The store pruning explains the *class* of "publicly trusted elsewhere, fails on Node 24" incidents ecosystem-wide — but **not this one**, because the pooler's public chain anchors at Amazon Root CA 1, which Node 24 still trusts.

## 7. Verdict on each hypothesis

| Hypothesis | Verdict | Evidence |
| --- | --- | --- |
| **A — Supabase presents an unexpected/self-signed chain (at least to some client paths)** | **PRIMARY SUSPECT (still requires the one missing measurement)** | E-2 proves the chain Vercel receives *contains an untrusted self-signed cert*. The public CT chain (§5) would verify on Node 24 (§6). Hence the chain Vercel receives ≠ the public CT chain. Notably, `SELF_SIGNED_CERT_IN_CHAIN` against Supabase endpoints has precedent (n8n #13517, Feb 2025, transaction pooler, port 6543; drizzle discussion re `db.<ref>.supabase.co` after a Postgres upgrade). |
| **B — missing/untrusted intermediate in Vercel's bundle** | **RULED OUT as the direct cause** | Missing intermediates produce `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, not error 19 (proven empirically, S2/S3). |
| **C — Node 24 CA behavior differs from external inspection** | **Contributing factor class; NOT the mechanism here** | Node 24 pruned 29 roots (§6) — a real divergence source — but Amazon Root CA 1 is present, so the public chain is unaffected. `NODE_USE_SYSTEM_CA` is opt-in. |
| **D — Vercel egress TLS interception** | **Cannot be excluded from outside; no supporting evidence** | No public record of Vercel MITM-ing egress; `elapsedMs` 252–304 is consistent with a genuine TLS handshake to Paris (transatlantic RTT + TCP + SSLRequest + TLS ≈ 250–340 ms), i.e. a real remote peer, not a nearby proxy. The capture (§9) settles this: if Actions sees the clean public chain while Vercel still errors, the paths differ. |
| **E — pg / pg-connection-string / Node TLS config causes a different verification path** | **CONFIRMED as the enabling condition** | §3: `sslmode=require` ≡ `verify-full` in pg 8.20.0/pg-connection-string 2.14.0. The DSN was written assuming libpq semantics ("require" = no verification). Verification is fully ON, which is *why* a chain anomaly is fatal here. (Ecosystem corroboration: Prisma #29060, DigitalOcean App Platform reports, all Jan–2026-ish.) |
| **F — another environmental cause** | No additional cause identified in repo/config | Pool has no `ssl` override; no `NODE_EXTRA_CA_CERTS`/`NODE_TLS_REJECT_UNAUTHORIZED` anywhere in repo/workflows; `pgbouncer=true` is an inert pass-through param. |

## 8. The required forensic capture — what is still missing and why

The decisive artifact is the **exact served chain as seen from GitHub's and Vercel's networks**. This sandbox cannot obtain it: its egress accepts TCP to the pooler but kills the data path (verified; consistent with the repo's earlier audits "TCP :5432/:6543 OPEN from sandbox, SSLRequest unanswered"), while GitHub Actions demonstrably *can* reach Supabase (the `db-release.yml` migration pipeline runs there).

**Prepared (uncommitted, awaiting authorization):**

- `scripts/forensic-tls-chain-capture.mjs` — credential-free capture: sends ONLY the 8-byte SSLRequest (no startup packet, no user, no password, no SQL), performs (i) a strict handshake (`rejectUnauthorized:true`, the production path) and (ii) a capture handshake (`rejectUnauthorized:false`, diagnostic-only, to *record* the chain), then reports hostname, port, TLS state, resolved IPs, Node/OpenSSL/pg versions, per-cert subject/issuer/SAN/validity/fingerprints/self-signed-ness, membership of Node's bundled store, leaf-SAN vs SNI match, the exact error code/name/message/cause chain, and a computed trust-failure verdict (leaf/intermediate/root + depth). Validated end-to-end locally under Node 22 and Node 24 against a fake STARTTLS server.
- `.github/workflows/tls-chain-capture.yml` — `workflow_dispatch`-only, **zero secrets**, Node 24 + Node 22 matrix, uploads JSONL artifacts. Also complements the existing (secret-using) `runtime-dsn-diagnostic.yml`.

Reading the results:
- `trust.classification = UNTRUSTED_SELF_SIGNED_CERT_IN_SERVED_CHAIN (depth k)` from Actions → **hypothesis A confirmed**: Supabase's edge is serving a broken/private chain to everyone; the JSON gives the exact cert (fingerprint/subject) for a Supabase support escalation.
- `CHAIN_TRUSTED_BY_NODE_BUNDLED_STORE` from Actions while Vercel still fails → **hypothesis D (or a Vercel-runtime store anomaly)**: the two vantages receive different chains.

## 9. Answers to the mandated capture checklist

| Required item | Status |
| --- | --- |
| hostname / port | `aws-0-eu-west-3.pooler.supabase.com` : `6543` (runtime) / `5432` (admin path) |
| TLS enabled state | TLS **required and enforced**; verification fully ON (E-1) |
| Node version | Vercel runtime: Node 24 line (24.19.0–24.21.0 current); analyzed 24.19.0 + 24-line commits |
| pg version | 8.20.0 (+ pg-connection-string 2.14.0) |
| TLS error code | `SELF_SIGNED_CERT_IN_CHAIN` (OpenSSL err #19) |
| error name / message | `Error: self-signed certificate in certificate chain` (pg surfacing captured verbatim in S1) |
| cause chain | single-level: pg surfaces the TLS socket error directly; wrapper carries `cause` per `db-health.ts` design |
| certificate subject / issuer / SAN / validity | **Served-chain capture pending** (tool ready); CT-recorded leaf: AWS ACM `Amazon RSA 2048 M01/M04`, issued 2026-05-04, expires 2026-11-17 |
| authorizationError | pending capture (the strict-handshake step reports it) |
| server cert itself trusted? | CT leaf chains to `Amazon Root CA 1` — present in Node 24 store → the *public* leaf is trusted; what Vercel actually receives is the open question |
| failure at leaf / intermediate / root? | error 19 ⇒ **an untrusted self-signed cert inside the served chain** (root or mid-chain), *not* a leaf trust failure and *not* a missing-intermediate failure |
| SNI correct? | **Yes** — pg sets `servername = host`; nothing overrides it |
| resolved IPs | from this vantage: `13.39.246.141`, `15.188.134.6` (AWS ELB eu-west-3); Vercel-side IPs come from the capture |
| Vercel vs independent client same chain? | **Pending the capture** — this is exactly what the prepared diagnostic answers |

## 10. Proposed MINIMAL SECURE remediation (NOT implemented, NOT committed)

Principles: keep TLS verification ON; make trust **stronger** (pinned), never weaker; make the DSN's meaning explicit; isolate Supabase-side fix from application-side hardening.

1. **(Isolation — recommend first) Prove and report the server-side chain defect.** Run the prepared credential-free capture; if it confirms an untrusted self-signed chain from Supabase's edge, open a Supabase support incident with the captured JSON. No application change is correct if the server presents a broken chain — and per `docs/runbooks` Supabase is a managed dependency.
2. **(Application-side minimal, verification-preserving) Make TLS intent explicit in code** — in `src/db/index.ts::createPool()`, stop relying on the DSN's `sslmode` aliasing:

   ```ts
   const created = new Pool({
     connectionString: databaseUrl(),
     connectionTimeoutMillis: 10_000,
     ssl: { rejectUnauthorized: true },   // explicit; independent of pg-connection-string versions
   });
   ```

   This pins today's effective behavior (`verify-full` semantics) in code, immune to the pg-connection-string v3 flip. *(Even stronger variant, if the capture shows a clean Amazon chain: also pin `ca` to the AWS/Amazon root(s) — or to Supabase's published CA — which narrows trust from ~120 public roots to one. This requires shipping a CA artifact and a rotation story, so it is phase 2.)*
3. **(DSN hygiene, no behavior change under current pg)** Optionally change the documented DSNs to explicit `sslmode=verify-full` (or add `uselibpqcompat=true&sslmode=require` if libpq semantics are ever genuinely wanted) so the string says what the runtime does. **Do NOT adopt `uselibpqcompat=true&sslmode=require` as the fix**: S4 proves it silently **disables** certificate verification — that is the forbidden weakening.
4. **(Regression guard)** A unit test asserting the pool's effective SSL options (`rejectUnauthorized` truthiness) so a dependency bump can never silently change the verification posture.
5. **(Awareness)** Track Supabase's pooler leaf expiry window (2026-10-16/17 batch and 2026-11-17) — a renewal mis-chain at rotation is a plausible trigger moment for this incident class.

**Explicitly rejected (forbidden weakening):** `rejectUnauthorized:false`, `sslmode=no-verify`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, plaintext/`sslmode=disable`, trusting arbitrary system stores. None of these appear in any proposal above.

## 11. Evidence appendix (this session, reproducible)

- Parsed production DSN shape → `ssl = {}` + pg-connection-string 2.14.0 deprecation warning (verbatim, captured live).
- Differential matrix S1–S5 (local fake STARTTLS endpoints; repo's own pg + classifier; zero production contact) — outputs captured verbatim in-session.
- Node 24.19.0 (SHA-256-verified official-line binary) reproducing S1 identically.
- CA-store diff: Node 22 line 145–146 roots vs Node 24 line 120; 29-root prune list enumerated; `Amazon Root CA 1` present in both.
- CT log (certspotter): pooler leafs = AWS ACM `Amazon RSA 2048 M01/M04`; newest issued 2026-05-04, expire 2026-11-17.
- Node store update commits (`nodejs/node`): "crypto: update root certificates to NSS 3.119/3.121/3.123.1/3.125/3.126" (Jan–Aug 2026).
- Scratch artifacts (uncommitted): `scripts/forensic-tls-repro.mts`, `scripts/forensic-tls-chain-capture.mjs`, `.github/workflows/tls-chain-capture.yml`.

*No changes were committed, pushed, merged, deployed, rotated, or weakened. Awaiting explicit authorization for (a) committing + dispatching the read-only capture, and/or (b) any remediation.*
