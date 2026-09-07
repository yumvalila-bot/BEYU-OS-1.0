# RB-05 · Supabase as the production PostgreSQL host (eu-west-3)

BEYU OS keeps its own identity, RBAC, MFA, governance, Finance, Noelia, audit,
Drizzle and RLS architecture. **Supabase is only a managed PostgreSQL database.**
Do **not** install `@supabase/supabase-js` / `@supabase/ssr`, do **not** use
Supabase Auth, REST-as-database, or the `sb_publishable`/`sb_secret` keys for the
data layer. The data layer is the existing `pg` driver + Drizzle (`src/db`), and
`beyu_runtime` is the RLS-subject application principal.

```
Vercel → BEYU backend (Next.js) → DATABASE_URL → Supabase PostgreSQL (eu-west-3)
                                                → beyu_runtime (NOSUPERUSER, NOBYPASSRLS) → RLS
```

- **Project ref:** `siyzygezdmlxbvwttrdz`
- **Region:** West EU (Paris) — `eu-west-3`
- **Supavisor host:** `aws-0-eu-west-3.pooler.supabase.com`
- **Database:** `postgres`

---

## 1. Connection strings (server-only; never commit credentials)

Usernames are `role.project_ref`. Passwords come from the secret store — never
from source control or chat.

**Runtime — Transaction pooler (port 6543).** This is Vercel's `DATABASE_URL`.
Requests use transaction-scoped connections and `SET LOCAL` tenant GUCs, so
transaction pooling is correct and pgbouncer-safe (Drizzle `node-postgres`, no
named prepared statements):

```
DATABASE_URL=postgresql://beyu_runtime.siyzygezdmlxbvwttrdz:<RUNTIME_PASSWORD>@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
BEYU_RUNTIME_DATABASE_URL=<identical to DATABASE_URL>
```

**Admin/migration — Session pooler (port 5432).** Used by `scripts/migrate.ts`,
`src/db/seed.ts`, `drizzle-kit`, and `scripts/setup-db-role.ts`:

```
BEYU_ADMIN_DATABASE_URL=postgresql://postgres.siyzygezdmlxbvwttrdz:<DB_PASSWORD>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require
```

The direct host `db.siyzygezdmlxbvwttrdz.supabase.co:5432` is IPv6-only on
current Supabase projects; Vercel serverless reaches the IPv4 pooler, so prefer
the pooler for both roles. Never prefix these with `NEXT_PUBLIC_`.

## 2. One-time provisioning (from a host that can reach the pooler)

```bash
export BEYU_ADMIN_DATABASE_URL='postgresql://postgres.siyzygezdmlxbvwttrdz:<DB_PASSWORD>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require'
npm ci
npm run migrate                 # applies every migration in drizzle/ (0000..0033)
export BEYU_RUNTIME_DB_PASSWORD='<strong-runtime-password-14+chars>'
npx tsx scripts/setup-db-role.ts   # creates beyu_runtime: NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB
# governed one-time bootstrap (SINGLE USE — never re-run after enrollment seals):
export BEYU_ENV=production
export BEYU_ALLOW_PRODUCTION_SEED=I_UNDERSTAND_THIS_IS_A_ONE_TIME_GOVERNED_BOOTSTRAP
export BEYU_BOOTSTRAP_PASSWORD='<bootstrap-password-14+chars>'
npm run seed
# then prepare the enrollable-only administrator and enroll via RB-024:
#   BEYU_ADMIN_EMAIL='<owner-email>' npm run prepare:admin-bootstrap
#   (see RB-024-initial-administrator-enrollment.md; unset the one-time
#   BEYU_BOOTSTRAP_PASSWORD / BEYU_ALLOW_PRODUCTION_SEED from the shell after use)
```

> **Single-use warning:** `npm run seed` resets demo-identity credentials. It is
> part of the initial governed bootstrap ONLY. Re-running it after the
> administrator has enrolled would overwrite the enrolled administrator's
> credential. The `BEYU_ALLOW_PRODUCTION_SEED` consent value must be treated as
> single-use: export it only for the initial bootstrap shell session.

## 3. Vercel production environment variables (secret store)

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | runtime transaction pooler string (§1) |
| `BEYU_RUNTIME_DB_ROLE` | `beyu_runtime` |
| `AUTH_SECRET` | random 32+ char secret |
| `MFA_ENCRYPTION_KEY` | random 32+ char secret |
| `BEYU_BOOTSTRAP_SECRET` | random ≥32 char secret (one-time enrollment; rotate/unset after sealing — see RB-024) |
| `BEYU_INTERNAL_SERVICE_TOKEN` | random 32+ char secret (only if sector service-to-service calls are used) |
| `BEYU_TRUST_PROXY` | `true` (Vercel is a trusted ingress proxy) |

**MUST NOT be provisioned in Vercel** (privileged environments only — the
owner's shell and/or GitHub `Production` environment secrets for the
`db-release` pipeline; the Next.js runtime never reads them):

| Variable | Where it lives instead |
|----------|------------------------|
| `BEYU_ADMIN_DATABASE_URL` | owner shell + GitHub secret (migrations, seed, `prepare:admin-bootstrap`, `db-release`) |
| `BEYU_RUNTIME_DB_PASSWORD` | owner shell + GitHub secret (`setup-db-role.ts` only) |
| `BEYU_BOOTSTRAP_PASSWORD` | owner shell, single-use (initial `npm run seed` only) |
| `BEYU_ALLOW_PRODUCTION_SEED` | owner shell, single-use consent flag |
| `BEYU_RUNTIME_DATABASE_URL` | not read by the application at all (owner-side audit scripts may set it equal to `DATABASE_URL`) |

No `NEXT_PUBLIC_*` secrets of any kind. The app connects lazily, so the Vercel
build succeeds without runtime secrets
(`tests/architecture/build-without-database-url`; also proven by a
sentinel-valued production build containing zero secret values in
`.next/static` or `.next/server`).

## 4. Backups / PITR

Database → Backups: enable daily backups and **Point-in-Time Recovery** (WAL
archiving). Restore-test into a shadow project per RB-03, then run the audit-chain
check below.

## 5. Certification (gating — run before declaring operational)

```bash
# from the Vercel runtime / CI / any host with Supabase egress:
BEYU_BASE_URL=https://beyu-os-1-0.vercel.app \
BEYU_BOOTSTRAP_PASSWORD=... AUTH_SECRET=... MFA_ENCRYPTION_KEY=... \
DATABASE_URL=... BEYU_RUNTIME_DATABASE_URL=... BEYU_ADMIN_DATABASE_URL=... \
  npm run certify
```

Requires **0 failures, 0 skips**. It asserts the live Supabase DB and deployed
app: `/api/health/live` 200; `/api/health` `database: UP`; authentication; MFA;
RBAC; RLS enabled (≥20 tables / ≥20 policies); tenant/entity/country isolation
(runtime role sees 0 rows without context, only its own tenant when scoped,
0 cross-tenant); governance DENY; Finance authorization (CFO); Noelia
authorization; audit creation + chain integrity (single genesis, 0 forks, 0
dangling, head matches tail) for `audit_log` and `enterprise_events`; and
`beyu_runtime` = NOSUPERUSER/NOBYPASSRLS/NOCREATEROLE/NOCREATEDB, owns no
tables, cannot `SET ROLE postgres`, no elevating memberships — plus the 19
migrations, PostgreSQL version and pooling/`max_connections`.

Exit `2` = the database could not be reached (hard stop — never declare
operational); exit `1` = a check failed; exit `0` = **PRODUCTION CERTIFIED**.

> **Network note:** an egress-firewalled sandbox (no route to
> `aws-0-eu-west-3.pooler.supabase.com` or `*.vercel.app`) cannot run this — the
> runner fails at the connection stage. It must run from Vercel/CI with real
> egress. Do not infer Supabase health from a local PostgreSQL instance.
