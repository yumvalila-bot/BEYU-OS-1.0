# BEYU OS — Secret Provisioning Matrix (Production)

**Status:** authoritative for production provisioning. Verified by the
secret-boundary review (code, migrations, tests, CI, and a sentinel-valued
production build). No actual secret values appear in this repository — only
variable names, purposes, and procedures.

**Placement rule (memorize this):**

- **Vercel runtime secret store** — ONLY what the Next.js application process
  reads at request time.
- **Privileged environments ONLY (owner shell / GitHub `Production`
  environment secrets)** — everything the runtime never reads. In particular,
  **`BEYU_ADMIN_DATABASE_URL` MUST NOT be present in the Vercel runtime.**
  No route, page, server component, client bundle, or runtime library module
  references it; the application builds and runs without it.

Conventions: **RUNTIME** = must be present for the app to serve traffic.
**ONE-TIME** = needed only for a governed ceremony, then rotated/unset.

---

## 1. Vercel runtime secrets (application request path)

| Secret / variable | Purpose | Consumer (code) | Runtime or one-time | Required in Vercel runtime? | Where provisioned | Rotation / revocation procedure |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL DSN for the restricted `beyu_runtime` role (NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB; RLS-subject). The ONLY database credential the app uses. | `src/db/index.ts` → every route/page via `db` | RUNTIME | **Yes** — transaction pooler string (`…6543/postgres?sslmode=require&pgbouncer=true`) | Vercel Production env | Rotate the `beyu_runtime` password in Supabase, update Vercel, redeploy. Old password stops working immediately; no app data migration needed. |
| `AUTH_SECRET` | Server-side key material. Actual code use: fallback input to the MFA at-rest key when `MFA_ENCRYPTION_KEY` is unset (`src/lib/mfa.ts`). Sessions are opaque random tokens (no signing). | `src/lib/mfa.ts` `keyMaterial()` | RUNTIME | **Yes** (unless `MFA_ENCRYPTION_KEY` is set, which takes precedence — set both) | Vercel Production env | Same constraint as `MFA_ENCRYPTION_KEY`: it decrypts stored `mfa_secret_encrypted` values. Rotate only together with an MFA re-encryption / re-enrollment window (see below). |
| `MFA_ENCRYPTION_KEY` | AES-256-GCM key (via SHA-256) encrypting all TOTP secrets at rest (`users.mfa_secret_encrypted`, staged enrollment secrets). | `src/lib/mfa.ts` `keyMaterial()` | RUNTIME | **Yes** | Vercel Production env | **Stateful rotation.** Existing rows can only be decrypted with the current key. Procedure: (1) schedule a maintenance window; (2) with the OLD key, decrypt and re-encrypt every `mfa_secret_encrypted` value under the NEW key via an owner-run script on the admin DSN, or force MFA re-enrollment for all users; (3) set the new key in Vercel and redeploy; (4) verify login+MFA, then destroy the old key. There is no automated rotation tooling — do not rotate by simply swapping the value (that locks every MFA user out). |
| `BEYU_BOOTSTRAP_SECRET` | Owner-held authorization for the ONE-TIME administrator enrollment ceremony (`/enroll` → `begin`/`verify-mfa`/`complete`). Constant-time verified; never logged, echoed, or stored (only a truncated non-reversible fingerprint lands in audit rows). | `src/lib/bootstrap/secret.ts` + `service.ts` | ONE-TIME (must be present from deploy until the bootstrap seals) | **Yes, until sealed; then NO** | Vercel Production env (pre-enrollment only) | After `GET /api/v1/auth/bootstrap/status` reports `SEALED`: **unset it in Vercel and redeploy** (preferred) or replace with a fresh random value. Post-seal the secret is unusable either way (DB trigger + service guard), but removing it shrinks the blast radius of a future secret-store compromise. It is NOT needed for administrator login. |
| `BEYU_INTERNAL_SERVICE_TOKEN` | HS256 shared secret authenticating sector service-to-service calls to `/api/v1/internal/*` (min 32 chars; endpoints fail closed to 503 without it). | `src/lib/internal/service-auth.ts` | RUNTIME (only if sectors call internal APIs) | **Yes, iff used** | Vercel Production env AND each calling sector's secret store (same value both sides) | Rotate synchronously: mint new value, deploy to BEYU Vercel + all calling sectors together (tokens live ≤300s, so the window is short), verify internal calls, destroy the old value. Per-issuer kill-switch exists in the service-principal registry for instant revocation without rotation. |

## 2. Privileged-only (NEVER in Vercel)

| Secret / variable | Purpose | Consumer (code) | Runtime or one-time | Required in Vercel runtime? | Where provisioned | Rotation / revocation procedure |
|---|---|---|---|---|---|---|
| `BEYU_ADMIN_DATABASE_URL` | Superuser/migration DSN. DDL authority for migrations, seed, `prepare:admin-bootstrap`, `setup-db-role`, `drizzle-kit`, and the `db-release` pipeline. **The runtime app never reads it.** | `src/db/admin.ts`, `scripts/*`, `drizzle.config.ts`, `.github/workflows/db-release.yml` | ONE-TIME per operation (persistent credential, episodic use) | **NO — explicitly NOT required. Do not provision it in Vercel.** | Owner's privileged shell (export per-session, never persisted) + GitHub repository secret consumed ONLY by non-PR jobs (`live-preflight`, `deploy`) under the `Production` environment | Rotate the Supabase `postgres` password, update the GitHub secret (and the owner's vault). No Vercel change, no redeploy needed. Verify with `db-release.ts preflight`. |
| `BEYU_RUNTIME_DB_PASSWORD` | Password used once to CREATE (or re-assert) the `beyu_runtime` role. | `scripts/setup-db-role.ts` only | ONE-TIME per provisioning | **NO** | Owner shell (per-session export) + GitHub secret for the `deploy` job | To rotate the runtime role password: `ALTER ROLE beyu_runtime WITH PASSWORD '…'` over the admin DSN (or re-run `setup-db-role.ts` with the new value), then update Vercel `DATABASE_URL` + redeploy. |
| `BEYU_BOOTSTRAP_PASSWORD` | Shared password for the initial constitutional seed identities (dev/test logins + the pre-enrollment `PLATFORM_ADMIN` row, which is MFA-blocked until the owner enrolls). | `src/db/seed.ts` only | ONE-TIME (initial governed seed) | **NO** | Owner shell, single session | Single-use by design. After the initial seed + enrollment: destroy it. It must never become anyone's login credential. Never re-run `npm run seed` against an enrolled production database (see §4). |
| `BEYU_ALLOW_PRODUCTION_SEED` | Literal consent flag (`I_UNDERSTAND_THIS_IS_A_ONE_TIME_GOVERNED_BOOTSTRAP`) that unlocks `seed`/`prepare` paths under `BEYU_ENV=production`. Not a secret, but a loaded gun. | `src/db/seed.ts` gate | ONE-TIME | **NO** | Owner shell, single session | Single-use. Unset from the shell immediately after the bootstrap completes. Never store it in Vercel or CI variables. |

## 3. Optional / conditional runtime secrets

| Secret / variable | Purpose | Consumer | Runtime or one-time | Required in Vercel runtime? | Where provisioned | Rotation / revocation procedure |
|---|---|---|---|---|---|---|
| `BEYU_PAYMENT_PARTY_HASH_KEY` | HMAC key for counterparty digests (min 16 chars). Absent ⇒ digests unavailable (loud gap, not silent). | `src/lib/payments/resolve.ts` | RUNTIME (payments) | Only if payment counterparty matching is used | Vercel Production env | Swap value + redeploy; historical digests become unverifiable (by design — digests are point-in-time, not credentials). |
| `BEYU_<PROVIDER>_WEBHOOK_SECRET`-style refs | Per-provider webhook signing secrets. The DATABASE stores only the env-var NAME (`*_ref` columns reject anything shaped like a value); the VALUE lives in env and is resolved at verification time, never persisted/returned/logged. | `src/lib/payments/config.ts` `secretFromRef` → `ingest.ts` | RUNTIME (payments) | Only for each mounted provider | Vercel Production env (value) + governed config write for the ref name (`scripts/payment-config.ts` over admin DSN) | Rotate at the provider dashboard, update Vercel, redeploy. Ref names need no change. |
| `NOELIA_GENERATIVE_*` | Model-gateway endpoint + credential reference for optional generative features. Gateway is inert unless BOTH endpoint and credential ref are configured. | `src/lib/noelia/model-provider.ts` | RUNTIME (optional AI) | Only if generative Noelia is enabled | Vercel Production env | Per provider; unset to fail closed to extractive-only behavior. |

## 4. Non-secret environment configuration (for completeness — never sensitive)

| Variable | Purpose | In Vercel? |
|---|---|---|
| `BEYU_ENV=production` / `NODE_ENV=production` | Enables production guards (placeholder rejection, secure cookies, dev-key refusal) | Yes (Vercel sets `NODE_ENV`; set `BEYU_ENV=production` explicitly) |
| `BEYU_TRUST_PROXY=true` | Trust `X-Forwarded-For` behind Vercel's ingress for rate limiting (C-07) | Yes |
| `BEYU_RUNTIME_DB_ROLE=beyu_runtime` | Role name (default already `beyu_runtime`) | Optional |
| `BEYU_ADMIN_EMAIL` | Owner's sign-in email, bound at PREPARE time | No (prepare-shell only) |
| `BEYU_RUNTIME_DATABASE_URL` | Read by owner-side audit/certify scripts and tests ONLY; never by `src/` | No (set it in the certify shell, equal to `DATABASE_URL`) |

---

## 5. Safest owner-side procedure: `prepare:admin-bootstrap` (privileged environment)

Run from the owner's workstation (or another trusted host with Supabase
egress) — NEVER from Vercel, NEVER from CI, NEVER over HTTP. Prerequisites:
repository checked out at the deployed commit, `npm ci`, database migrated,
runtime role provisioned, and the four Vercel runtime secrets already set
(`DATABASE_URL`, `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, `BEYU_BOOTSTRAP_SECRET`).

```sh
# 1. Fresh shell. Nothing sensitive is persisted to disk or shell history:
#    (leading space omits the line when HISTCONTROL=ignorespace; verify with
#    `echo $HISTCONTROL`. Alternatively paste values at prompts.)
 set +o history 2>/dev/null || true

# 2. Admin DSN for this session only (session pooler, port 5432).
export BEYU_ADMIN_DATABASE_URL='postgresql://postgres.siyzygezdmlxbvwttrdz:<DB_PASSWORD>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require'

# 3. Who the administrator will be (your own sign-in email).
export BEYU_ADMIN_EMAIL='owner@example.com'
export BEYU_ENV=production
export BEYU_ALLOW_PRODUCTION_SEED=I_UNDERSTAND_THIS_IS_A_ONE_TIME_GOVERNED_BOOTSTRAP

# 4. Run PREPARE. Expected last line:
#    "Administrator bootstrap prepared (ENROLLABLE-ONLY)."
#    It creates NO credential and prints NO secret.
npm run prepare:admin-bootstrap

# 5. Confirm readiness (public, unauthenticated, non-enumerating):
curl -s https://<deployment>/api/v1/auth/bootstrap/status
# expect: {"data":{"state":"AVAILABLE","secretConfigured":true,"enrollable":true}}

# 6. Enroll privately at https://<deployment>/enroll (your password, your
#    authenticator, your recovery codes — shown once, stored in your vault).

# 7. Verify: normal sign-in works; status now reports SEALED/enrollable:false;
#    audit shows administrator.activated + bootstrap.sealed.

# 8. TEAR DOWN the privileged session immediately:
unset BEYU_ADMIN_DATABASE_URL BEYU_ADMIN_EMAIL BEYU_ALLOW_PRODUCTION_SEED BEYU_BOOTSTRAP_PASSWORD
 set -o history 2>/dev/null || true
# Then, in Vercel: rotate or UNSET BEYU_BOOTSTRAP_SECRET and redeploy.
```

Why this is safe: the admin DSN never leaves the owner's session (it is not
in Vercel, not in the repo, not in CI logs — the pipeline masks secrets and
never echoes them); PREPARE is idempotent and refuses once `SEALED`; and the
ceremony materials (password, TOTP, recovery codes) are established by the
owner inside their own browser and never transit any other system.

---

## 6. Verification evidence (this review)

- `BEYU_BOOTSTRAP_SECRET`: read ONLY in `src/lib/bootstrap/secret.ts`
  (server). Never in a client component, API response body, log line, or DB
  row (audit holds only a truncated HMAC fingerprint).
- `AUTH_SECRET` / `MFA_ENCRYPTION_KEY`: read ONLY in `src/lib/mfa.ts`
  (server). No `NEXT_PUBLIC_*` anywhere; no `process.env` in any
  `"use client"` module; `next.config.ts` has no `env:` block.
- `DATABASE_URL` (runtime role): the sole DSN in `src/db/index.ts`, used by
  every route/page. Role is NOSUPERUSER/NOBYPASSRLS/NOCREATEROLE/NOCREATEDB
  (`setup-db-role.ts`, verified by `runtime-privilege-audit.test.ts` and
  `certify`); F-01 revocation denies it `role_assignments` + governance
  writes (migration `0030`, re-applied + verified by `setup-db-role.ts` §4c).
- `BEYU_ADMIN_DATABASE_URL`: imported ONLY by `src/db/admin.ts`, consumed
  ONLY by `scripts/*`, `src/db/seed.ts`, `src/lib/payments/config-write.ts`
  and `fixture-reset.ts` — none of which is reachable from any route or page
  (route-import sweep: zero hits). `assertPrivilegedWriter()` refuses
  `beyu_runtime` even if miswired.
- Seal: `SEALED` is terminal via `0033` trigger (UPDATE-when-sealed raises,
  DELETE always raises); the runtime role cannot `ALTER TABLE … DISABLE
  TRIGGER` (non-owner); service layer returns `ALREADY_SEALED`.
- Dynamic proof: production `next build` succeeds with ZERO secrets set, and
  a rebuild with sentinel secret values leaves ZERO sentinel values in
  `.next/static` (browser JS) and `.next/server` (server reads env at
  runtime). `npm run scan:secrets` clean (1355 tracked files).
- Residual risks (accepted, procedural): (a) `npm run seed` re-run after
  enrollment would reset the admin credential — gated behind the single-use
  `BEYU_ALLOW_PRODUCTION_SEED` consent + required `BEYU_BOOTSTRAP_PASSWORD`,
  never executed by CI; procedure above forbids re-running it. (b) MFA key
  rotation is manual (no re-encryption tooling) — follow the windowed
  procedure in §1. (c) The bootstrap fingerprint in audit rows assumes a
  high-entropy secret (min-32 + placeholder rejection enforce the floor).

Related: `PRODUCTION_SECRET_CONFIGURATION.md`, `BOOTSTRAP_SECURITY.md`,
`ADMINISTRATOR_ENROLLMENT.md`, `../runbooks/RB-024-initial-administrator-enrollment.md`,
`../runbooks/supabase-production-database.md`.
