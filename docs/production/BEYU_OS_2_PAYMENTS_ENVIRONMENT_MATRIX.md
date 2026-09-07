# Payment Environment Matrix — BEYU OS 2.0 payments programme

**Compiled 2026-09-06 from the files in this repository and from the running sandbox.**
Variable names only; no value from any environment file is reproduced here. All values in the
sandbox's `.env` are disposable CI-equivalent credentials for a local database, and the file is
git-ignored.

## 1. Environments

| Environment | Exists? | How it is reached | What was run in it | Status |
|---|---|---|---|---|
| Local development | **YES** | PostgreSQL 16 on `localhost:5432`, data directory `./pgdata`, started out-of-band; `.env` mirrors `ci.yml` | every test suite, the demo, the DR drill, the perf probe, the migration run | the only environment where payment work has executed |
| CI | **YES (defined), NOT EXECUTED LOCALLY AS CI** | `.github/workflows/ci.yml`: provisions Postgres, creates `beyu_runtime`, runs typecheck, lint, migrate + drift re-run, seed, `npm run build`, the vitest suites (with dedicated DBs for audit-sensitive files), dependency audit | the same gate commands were re-run in this sandbox by hand; the PR's CI run is the authoritative record | PENDING on the PR |
| Staging | **NO** | nothing in the repo points at a staging host | — | NOT_CONFIGURED |
| Production (any BEYU tenant's real deployment) | **NO** | no production DSN, no provider credential, no deployment target in Git | — | NOT_CONFIGURED, and `PRODUCTION_LAUNCH: BLOCKED` |
| Provider sandbox (real operator) | **NO** | no credential issued by any operator (`credentialStatus = NOT_ISSUED` for every real rail) | — | NOT_INTEGRATED |

Any statement of the form "verified in production" is unavailable to this programme. The
database used for all evidence here is a development database owned by this sandbox.

## 2. Roles and URLs

| URL / variable | Role | Grants | Used by | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | `beyu_runtime` (non-superuser, subject to RLS) | SELECT-only on the five payment config tables; INSERT/UPDATE on the nine transactional payment tables; no DML on revoked config; **no TRUNCATE** | `src/db/index.ts` (the app request path) | **P1 F-01 remains OPEN**: the runtime role holds blanket DML on `public` tables, so the payment-table restrictions are a domain-scoped mitigation, not closure |
| `BEYU_RUNTIME_DATABASE_URL` | same runtime DSN, pinned for the audit test | as above | `tests/security/runtime-privilege-audit.test.ts` | exists so the audit cannot be satisfied by a repointed test connection |
| `BEYU_ADMIN_DATABASE_URL` | superuser / migration role | everything | `scripts/migrate.ts`, `src/db/seed.ts`, `drizzle-kit`, `src/db/admin.ts` (`adminPool`), `scripts/payment-config.ts`, `scripts/setup-db-role.ts` | `config-write.ts` calls `assertPrivilegedWriter()` so governance-relevant writes only happen on this path; **the test `db` handle also uses this role and therefore bypasses RLS** |
| `BEYU_TEST_DATABASE_URL` | privileged test connection | — | integration suites that need their own database | `tests/helpers/ledger-reset.ts` etc. |
| scratch databases (`beyu_dr_*`) | created/dropped by `scripts/dr-drill.ts` | cloned schema + data for restore testing | DR drill only | dropped at end of drill; `--keep-scratch` retains for inspection |
| `BEYU_MOCK_WEBHOOK_SECRET` | shared secret for the **mock** provider's HMAC | — | `scripts/payments-demo.ts`, `scripts/payments-dr-fixture.ts`, `scripts/payments-perf-probe.ts`, `src/lib/payments/providers/mock.ts` | **absent from `.env`** — when unset every script falls back to a clearly-labelled placeholder (`…-not-a-real-credential`). It is not a production secret and must never become one |
| `payment_providers.credential_ref`, `payment_provider_connections.signing_secret_ref` | hold **environment variable names**, never values | — | provider adapters at runtime | a `varchar` in a config table must never contain a key; this is enforced by convention + review, not by the schema |
| `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, `BEYU_INTERNAL_SERVICE_TOKEN`, `BEYU_BOOTSTRAP_PASSWORD`, `BEYU_RUNTIME_DB_PASSWORD` | platform auth / bootstrap / service-to-service | — | the platform, not payments specifically | listed for completeness: the payments routes inherit them through `guarded()` |
| `BEYU_TEST_BASE_URL` | base URL for HTTP-level API tests | — | `tests/api/*` | when unset or unreachable those tests **skip** rather than pass — on the final gate run the URL was reachable and the suite reported 0 skipped, so the HTTP assertions did execute; a CI run remains the authoritative record |

## 3. Where each payment activity runs

| Activity | Path | Requirement |
|---|---|---|
| Migrations / schema | `scripts/migrate.ts` + `drizzle/` | admin URL; forward-only; re-running `drizzle-kit generate` must produce no diff |
| Payment config (providers, connections, accounts, mappings, policies) | `scripts/payment-config.ts` → `src/lib/payments/config-write.ts` | admin URL + approval metadata (`approvedBy`, `approvalReference`); refuses an empty evidence trail |
| Inbound webhook | `POST /api/v1/payments/webhook/[provider]` | runtime role; HMAC verification against the connection's secret reference |
| Review queue and decisions | `src/lib/payments/review.ts` | runtime role **inside `withDatabaseRlsContext([tenantId], …)`**; capability `finance:payments.review`; separation of duties enforced |
| Draft and posting | `src/lib/payments/accounting.ts` → Finance OS `postJournal` | `CAP_POSTING` capability, which stays **LOCKED** outside tests; a `Principal`; an open `financial_periods` row |
| Settlement batches | `src/lib/payments/settlement.ts` | capability `finance:settlement.manage`; `RECONCILED` requires `unmatched_count = 0 AND item_count = matched_count` |
| Demo | `scripts/payments-demo.ts` | never posts; ends in `DRAFTED`/`BLOCKED`; prints `postingAttempted: false` |
| DR drill | `scripts/dr-drill.ts --payments` | `psql`/`pg_dump` are **not on PATH** in this sandbox, so the drill uses `pg` client + logical dump through `adminPool`; that substitution is recorded, not hidden |
| Performance probe | `scripts/payments-perf-probe.ts` | admin URL (fixture lifecycle) + runtime-role code paths for ingest; artifact `docs/audit/evidence/PAYMENT_PERF_PROBE.json` |

## 4. Toolchain as measured

| Component | Value as observed |
|---|---|
| Node.js | v22.22.3 |
| PostgreSQL | 16.x on the local volume; database size measured at 26 MB during the perf probe |
| Test runner | vitest, `fileParallelism: false` (files run serially because suites share the audit hash chain) |
| CPUs available | 2 — which is why full-suite timings in this sandbox are not comparable to CI, and why a locally-green run must be re-confirmed on CI |
| Migrations | 30 (files numbered 0000 through 0029 in `drizzle/`); next free number `0030` |
| Tables | 132 (`131 pgTable()` in `src/db/schema.ts` barrel + junction), 14 of them created by `0028` |

## 5. Standing environment rules for anyone continuing this work

1. Never put a secret in a config table, a migration, a fixture, or this repository.
2. Never run the payment config writer through the runtime role — it is designed to refuse.
3. Never grant `CAP_POSTING` outside a test that revokes it in the same breath; the DR drill
   asserts the capability is LOCKED both before and after.
4. Never treat a local fixture reset as a disaster-recovery test: without a restore into a
   different database and a replay through the real code path, it measures nothing.
5. Never describe a number produced by `payments-perf-probe.ts` as production capacity.
6. Never mark P1 F-01 resolved from payment work; the runtime role's blanket DML is the finding.
