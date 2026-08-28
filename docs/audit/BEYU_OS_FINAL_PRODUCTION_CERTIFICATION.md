# BEYU OS — Final Production Certification (Supabase PostgreSQL target)

**Date:** 2026-08-28
**System:** BEYU-OS/1.0.0
**Branch:** `arena/01a0485f-beyu-os-1-0` · **PR:** #13
**Target DB:** Supabase project `siyzygezdmlxbvwttrdz`, region **eu-west-3 (Paris)**,
Supavisor `aws-0-eu-west-3.pooler.supabase.com` (transaction `:6543`, session `:5432`), database `postgres`.

**Evidence rule:** "TCP connected" is never reported as "database connected"; a local
PostgreSQL result is never reported as a Supabase result; a Vercel *build* pass is never
reported as "production operational". Each item is bucketed as A (verified production),
B (verified on the local functional gate), C (blocked, with the exact blocker), or
D (not tested).

---

## Final decision

**NOT CERTIFIED (production).**

The application source, migrations, runtime role, governed seed, the full 2215-test
suite (0 failures, 0 skips) and the `npm run certify` battery (20/20) are all re-proven
end-to-end on a **production-parity local PostgreSQL functional gate** using the exact
same code paths and the non-superuser RLS-bound `beyu_runtime` role. **None of the
Supabase- or Vercel-production conditions could be executed**, because (1) the execution
sandbox egress firewall resets the PostgreSQL/TLS data plane to the Supavisor pooler
*before authentication* and resets HTTPS to `*.vercel.app`, and (2) the real Supabase
database password is an external secret that is correctly absent from the sandbox.
Therefore the final decision rule (18 conditions) is not met.

---

## A. VERIFIED PRODUCTION (against real Supabase / Vercel)

| # | Condition | Result | Evidence |
|---|-----------|--------|----------|
| — | Real Supabase PostgreSQL connection | **NOT MET** | TCP to `aws-0-eu-west-3.pooler.supabase.com:6543/5432` connects, but the PostgreSQL `SSLRequest` gets no reply and `pg` fails *before auth* (`Connection terminated unexpectedly` / `ECONNRESET`). HTTPS to `beyu-os-1-0.vercel.app` and `api.vercel.com` is TLS-reset (curl rc 35). No authenticated query ever succeeded. |
| — | Migrations on real Supabase | **NOT RUN** | depends on connection above |
| — | Vercel production runtime secrets | **NOT SET FROM HERE** | Vercel API egress-blocked; DB password external |
| — | Deployed `/api/health/live` = 200, `/api/health` = `database: UP` | **NOT REACHABLE** | curl rc 35 |
| — | `npm run certify` against the deployed URL + real Supabase | **NOT RUN** | network/secret blocker |
| — | Vercel build | **GREEN** | PR #13 commit status `Vercel: pass` (project `beyu-os-1-0`). This proves the *build* succeeds without embedded secrets — not that the database is connected. |

## B. VERIFIED LOCAL FUNCTIONAL GATE (production-parity PostgreSQL 18.4, same code paths)

The gate was provisioned with BEYU's canonical tooling against a real PostgreSQL
instance, using the runtime role for the request path and the admin role only for
DDL/seed — the identical role topology required for Supabase.

| Condition | Result | Evidence |
|-----------|--------|----------|
| Architecture = pg + Drizzle only (no Prisma, no `@supabase/*`, no Supabase Auth/REST) | **PASS** | `package.json`: `pg@8.20.0`, `drizzle-orm@0.45.2`; zero Prisma/Supabase deps |
| Application secrets generated (≥32 bytes, distinct, unprinted, gitignored) | **PASS** | `AUTH_SECRET` (44-char base64 of 32 random bytes), `MFA_ENCRYPTION_KEY` (independent, ≠ AUTH_SECRET), `BEYU_BOOTSTRAP_PASSWORD` (32 chars, satisfies ≥14 policy); written only to gitignored `.env`/`tmp/secret-values.env` (mode 600) |
| Migrations | **PASS — 19/19** | `npm run migrate` applied `0000…0018` forward; extension `btree_gist` created (migration 0005); drift fingerprint stable |
| Runtime role lockdown (independent catalog queries) | **PASS** | `rolsuper=f rolbypassrls=f rolcreaterole=f rolcreatedb=f`, `rolcanlogin=t`; **0** tables owned by `beyu_runtime`; **0** superuser/BYPASSRLS memberships; `SET ROLE postgres` → permission denied; `CONNECT` on db + `USAGE` on public = true |
| RLS | **PASS** | 20 RLS-enabled tables, 11 FORCE ROW LEVEL SECURITY, 20 policies |
| Governed seed | **PASS** | `npm run seed` succeeded; prints no credentials; 6 tenants, 8 legal entities, 9 identities |
| Typecheck / Lint / Build | **PASS** | `tsc --noEmit` exit 0; `eslint .` exit 0; `next build` compiled |
| Full test suite | **PASS — 2215/2215, 0 skips** | 104/104 files, run with server on `beyu_runtime` + `BEYU_TEST_BASE_URL` set (HTTP/E2E execute, no skips) |
| `npm run certify` | **PASS — 20/20, 0 failed, 0 skipped** | covers health live/ready, auth+MFA login, RBAC, RLS, tenant/entity/country isolation, governance DENY, Finance authorization (CFO), Noelia authorization, audit creation + `audit_log` chain + `enterprise_events` chain (1 genesis, 0 forks, 0 dangling, head==tail), runtime-role lockdown, migrations, pooling/max_connections |
| Health endpoints (gate server) | **PASS** | `/api/health/live` → 200 `process:ALIVE`; `/api/health` → 200 `database:UP` |
| Frontend/bundle/git secret scan | **PASS** | 0 hits for `postgresql://`, `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, bootstrap password, `beyu_runtime`, Supabase keys, or `@beyu.os` emails in `.next/static`, unauthenticated `/os` HTML, and git-tracked files; no `.env`/secret file tracked; no `NEXT_PUBLIC_` server secrets |
| Fail-closed defaults | **PASS** | unauthenticated governed API → 401; build succeeds without runtime secrets |

## C. BLOCKED (exact technical blocker for each)

1. **Real Supabase connection — BLOCKED (egress firewall).** The sandbox allows TCP
   connect to `aws-0-eu-west-3.pooler.supabase.com:6543`/`:5432` but resets the
   PostgreSQL data plane at the TLS boundary: the Postgres `SSLRequest` byte receives
   **no server response**, raw `openssl s_client` reports no certificate / cipher NONE,
   and `pg.Client.connect()` fails in <12 ms with `Connection terminated unexpectedly`
   / `ECONNRESET` — i.e. the failure stage is **SSL/TLS**, before PostgreSQL startup and
   before authentication. Allowlists reachable (npm registry, GitHub) confirm a generic
   egress restriction, not a Supabase outage.
2. **Supabase database password — BLOCKED (external credential).** The real password for
   the `postgres.<ref>` / `beyu_runtime.<ref>` Supavisor users is not present in the
   execution environment/secret store. It is never to be supplied in chat. The
   transaction (`:6543`) and session (`:5432`) DSN templates are configured in
   `.env.example` and RB-05; only the `<PASSWORD>` segment is missing.
3. **Migrations / role / seed against Supabase — BLOCKED** by (1)+(2). (Proven on the
   gate in section B.)
4. **Vercel production environment variables — BLOCKED.** `api.vercel.com` is
   egress-blocked (rc 35) and there is no Vercel CLI/token in the sandbox, so the six
   production server variables (`DATABASE_URL`, `BEYU_RUNTIME_DATABASE_URL`,
   `BEYU_ADMIN_DATABASE_URL`, `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`,
   `BEYU_BOOTSTRAP_PASSWORD`) cannot be set here.
5. **Live production health & live `certify` — BLOCKED** by (1)+(4).
6. **CI activation — BLOCKED (workflows permission).** Adding `.github/workflows/ci.yml`
   was rejected by GitHub: *"refusing to allow a GitHub App to create or update workflow
   `.github/workflows/ci.yml` without `workflows` permission."* This was **not bypassed**.
   The vetted pipeline remains at `docs/ci/ci.yml` (provisions `beyu_runtime` before
   tests, independently asserts `f|f|f|f`, fails unless `database:UP`, sets
   `BEYU_TEST_BASE_URL` to prevent skips, and runs secret scans).
7. **Branch protection — BLOCKED (permissions).** `GET /branches/main/protection` →
   HTTP 403 "Resource not accessible by integration"; no merge to `main` was performed.

## D. NOT TESTED (cannot be exercised until the blockers clear)

- Real Supabase RLS/tenant/entity/country isolation across the live network.
- Real Supabase audit-chain verification.
- Live Vercel deployment SHA ↔ GitHub SHA mapping and production `/api/health` body.
- `npm run certify` with `BEYU_BASE_URL=https://beyu-os-1-0.vercel.app`.
- PITR/backup restore drill on the Supabase project (RB-03) — confirmable only in the
  Supabase dashboard/Vercel network.

---

## Remaining actions to reach PRODUCTION CERTIFIED

1. Make the Supabase **database password** available via the secret store (never chat)
   and run from a host with Supavisor + Vercel network egress.
2. Set the six Vercel **Production, server-only** variables (templates in
   `docs/runbooks/supabase-production-database.md`; no `NEXT_PUBLIC_`).
3. `npm run migrate` → `BEYU_RUNTIME_DB_PASSWORD=… npx tsx scripts/setup-db-role.ts` →
   governed `npm run seed`.
4. Merge PR #13 through the protected branch; a `workflows`-scoped token/maintainer
   copies `docs/ci/ci.yml` to `.github/workflows/ci.yml`.
5. Confirm `/api/health/live` = 200 and `/api/health` = `database: UP`.
6. Run `BEYU_BASE_URL=https://beyu-os-1-0.vercel.app npm run certify`; require **0
   failures, 0 skips** through `beyu_runtime`. Only then record **PRODUCTION CERTIFIED**.
