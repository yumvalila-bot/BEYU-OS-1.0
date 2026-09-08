# BEYU OS 1.0 — Production Secret Boundary Matrix

**Generated:** 2026-09-08 · **Base commit:** `cc621ab1e1122a36dc5e2ea6c870589cf7b1d952`

Derived from **actual repository consumers**, not from intent. Enumerated with a
grep covering both dot and bracket notation (`process.env.X` and
`process.env["X"]`) across `src/`, `scripts/`, `tests/`, `sectors/`, `mobile/`.

> No secret **value** appears in this document. Only names, scopes and consumers.

## Legend

`YES` required · `NO` must never be present · `—` not applicable · `OPT` optional

---

## A · Vercel runtime (BEYU OS root)

| Variable | Vercel Prod | GitHub | Local | Test | Consumer |
|---|---|---|---|---|---|
| `DATABASE_URL` | **YES** | NO | YES | separate | `src/db/index.ts` — the only runtime pool |
| `AUTH_SECRET` | **YES** | NO | YES | separate | `src/lib/mfa.ts` (fallback key material) |
| `MFA_ENCRYPTION_KEY` | **YES** | NO | YES | separate | `src/lib/mfa.ts` — **must be 64 lowercase hex** |
| `BEYU_TRUST_PROXY` | **YES** (`true`) | NO | OPT | OPT | `src/lib/auth-limits.ts:52` — sole consumer |
| `NODE_ENV` | **YES** (`production`) | auto | YES | auto | platform + 32 call sites |
| `BEYU_ENV` | **YES** (`production`) | NO | OPT | OPT | production-mode assertions |
| `BEYU_BOOTSTRAP_SECRET` | **Production only, temporarily** | NO | secure operator | NO | `src/lib/bootstrap/secret.ts` — **delete after SEALED** |

## B · GitHub Actions — administrative / DB-release path

| Variable | Vercel | GitHub | Local | Test | Admin |
|---|---|---|---|---|---|
| `BEYU_ADMIN_DATABASE_URL` | **NO — never** | **YES (repository scope)** | YES | NO | YES |
| `BEYU_RUNTIME_DB_PASSWORD` | **NO** | YES (deploy job) | OPT | test equivalent | YES |

**Scope is load-bearing.** `db-release.yml:135` `live-preflight` declares **no**
`environment:` key, so it reads **repository-scoped** secrets only. Only `deploy`
(line 185) is bound to `environment: Production`. A `BEYU_ADMIN_DATABASE_URL`
placed *only* at Production-environment scope is invisible to `live-preflight`,
which fails permanently at step 3 and leaves `deploy` skipped forever.

Do **not** duplicate the secret across both scopes to work around this.

## C · Tests only — must never reach production

| Variable | Consumer |
|---|---|
| `BEYU_TEST_DATABASE_URL` | `tests/setup-env.ts` — repoints `db` at the privileged test role |
| `BEYU_RUNTIME_DATABASE_URL` | adversarial RLS suites, pinned to the runtime role |
| `TEST_DATABASE_URL` / `TEST_DATABASE_URL_SUPERUSER` | Health backend suites |
| `BEYU_TEST_BASE_URL` | HTTP/E2E hard-fail mode |
| `BEYU_FIXTURE_RESET_DEBUG` | fixture diagnostics |
| `BEYU_HCM_BYPASS_FOR_TEST` | HCM harness — **must be unset in production** |
| `BEYU_IDENTITY_TEST_HARNESS` | identity harness — **must be unset in production** |
| `BEYU_OS_TEST_SERVICE_TOKEN` | federation harness |

⚠️ In CI, `BEYU_TEST_DATABASE_URL` is the **superuser** DSN (`ci.yml:196`) because
governed-mutation suites call domain services without the `guarded()` HTTP
tenant-context wrapper. Pointing it at the runtime role produces hundreds of
spurious RLS failures that are a harness artefact, not a product defect.

## D · Scripts only

| Variable | Consumer |
|---|---|
| `BEYU_BOOTSTRAP_PASSWORD` | `src/db/seed.ts` — required; no default credential permitted |
| `BEYU_RUNTIME_DB_ROLE` | `scripts/setup-db-role.ts` (default `beyu_runtime`) |
| `BEYU_ALLOW_PRODUCTION_SEED` | production-seed guard |
| `BEYU_ADMIN_EMAIL` | bootstrap preparation |

## E · Noelia

| Variable | Vercel | Notes |
|---|---|---|
| `NOELIA_GENERATIVE_ENDPOINT` | OPT | reference only; inference deferred |
| `NOELIA_GENERATIVE_CREDENTIAL_REF` | OPT | a **reference**, not a credential |
| `NOELIA_GENERATIVE_API_KEY_REF` | OPT | a **reference**, not a credential |

The `_REF` naming is deliberate: the repository stores an indirection, never key
material.

---

## Stale / dangerous variables observed in the Vercel inventory

Consumer analysis across the full repository. **Not deleted** — Arena has no
Vercel control-plane access, and Phase J forbids removal on inventory evidence
alone.

| Variable | Code consumers | Workflow consumers | Classification |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **0** | 0 | **SAFE TO REMOVE — HIGH RISK** (bypasses RLS) |
| `SUPABASE_SECRET_KEY` | **0** | 0 | SAFE TO REMOVE — HIGH RISK |
| `SUPABASE_JWT_SECRET` | **0** | 0 | SAFE TO REMOVE — HIGH RISK |
| `POSTGRES_PASSWORD` | **0** | 0 | SAFE TO REMOVE — HIGH RISK |
| `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST` | **0** | 0 | SAFE TO REMOVE — inert |
| `NEXT_PUBLIC_SUPABASE_URL` | **0** | 0 | SAFE TO REMOVE — **browser-inlined** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **0** | 0 | SAFE TO REMOVE — **browser-inlined** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **0** | 0 | SAFE TO REMOVE — **browser-inlined** |

Corroborating evidence: `src/` contains **zero** `NEXT_PUBLIC_*` reads; no
`"use client"` file reads `process.env`; `next.config.ts` declares no `env`
block; `mobile/**/*.dart` references no secret. The Supabase client architecture
has been retired — the sole database path is `DATABASE_URL` → `src/db/index.ts`.

**Removal remains an operator action requiring Vercel access.** The three
`NEXT_PUBLIC_*` values must be treated as **already public** and rotated at
source, not merely deleted.

---

## Invariants

1. `BEYU_ADMIN_DATABASE_URL` exists **only** as a GitHub Actions repository secret — never in Vercel, never committed, never printed.
2. `DATABASE_URL` is **runtime-only**, bound to `beyu_runtime`, and never an admin or service-role credential.
3. No request-path module reads `BEYU_ADMIN_DATABASE_URL` — verified by grep across `src/`.
4. Test credentials never enter production; production credentials never enter tests.
5. As of F-NEW-2, database tooling emits only a failure **class** — never a hostname, port, user, database name or DSN.
