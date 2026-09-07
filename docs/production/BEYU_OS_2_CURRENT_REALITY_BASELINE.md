<!-- SUPERSEDED for verdicts by BEYU_OS_2_PRODUCTION_READINESS_MASTER_REPORT.md (2026-09-06 evidence-reconciliation pass). Facts here were re-verified; where the two disagree, the master report governs. -->
# BEYU OS 2.0 — Current Reality Baseline (Phase 0)

**Head:** `0eaa71debb38cb6fc1aa2d9114d5cee0ed85f391` (`main`) · **Date:** 2026-09-06 · **Method:** execute and measure; documents are claims to be tested, never evidence.

This is the Phase 0 record: what the repository **actually is**, before any hardening. Companion: `BEYU_OS_2_PRODUCTION_READINESS.md` (verdicts), `BEYU_OS_2_EVIDENCE_MATRIX.json` (per-claim evidence + reproduction commands), `BEYU_OS_2_READINESS_SCORECARD.json` (status model).

## 1. Measured inventory

| Item | Count | Item | Count |
|---|---|---|---|
| Root `.ts` files | 256 | Health `*.spec.ts` | 93 |
| Root test files | 125 | Health `.up.sql` | 30 |
| Root tests (passing) | **2451** at baseline | Health backend modules | 31 |
| `src/app/api/**/route.ts` | 45 | Health TS files | 290 |
| Pages | 19 | Flutter dart files | 19 |
| `drizzle/*.sql` | 28 (0 down) | Docs files | 168 |
| DB tables | **118** | `docs/runbooks` | 2 |
| RLS / FORCE / policies | 44 / 34 / 44 | `docs/compliance` | 1 |
| `noelia_*` tables | 253 | Sectors present | **`health` only** |

## 2. Claims tested against reality

| Repository claim | Measured reality | Disposition |
|---|---|---|
| | README: "the root Vitest suite is 111 test files / 2375 tests" | 123 files / 2451 tests at this HEAD | README count stale by 12 files / 76 tests; its caveats are accurate |
| "Health backend carries 2522 lint errors … job FAILS, not made to pass" (`ci.yml`) | 0 errors, 0 warnings, 271 files; CI job green on `main` | **Stale → corrected in place** |
| "RAG is implemented" | No `vector` type, extensions only `plpgsql`+`btree_gist`, `embedding_status` defaults `NOT_EMBEDDED`; retrieval is lexical regex | Docs are honest; summary framing overstated |
| Generative inference available | `OpenAICompatibleAdapter` constructed in 0 non-test files; gateway default mounts deterministic analyst only | `REAL_GENERATIVE_INFERENCE = BLOCKED` |
| `BEYU_OS_AI_PLATFORM` should be ACTIVE | Now `DISABLED` post-remediation | Upstream-consistent |
| `src/db/schema.ts` is source of truth | `migrate.ts` fingerprint + live `pg_catalog` agree; 0 drift | Consistent |
| `agents`/`tools`/`skills`/`triggers`/`automations` are live legacy schema (`0016` header) | Those tables do not exist | **Doc wrong — recorded, not obeyed** |
| Finance "100 % complete, no engineering blockers" | Code complete and passing; **activation** governed off | True as to code; not a contradiction |
| `journal_entries` empty because blocked | 0 rows; 60/60 capabilities `LOCKED`+`NOT_IMPLEMENTED`; `postJournal()` throws at `requireCapability` before any RBAC | Defence in depth working as designed |
| "Production deployed" | Vercel deploy record `success` for this SHA; `db-release` **fails** `EXTERNAL_BLOCKED` at `ci.yml:149` | App deployed, schema never released from CI |

## 3. Baseline gate results (all executed)

**Root:** `tsc` 0 · `eslint` 0 · `next build` 0 (65 route entries / 45 API routes / 5 prerendered) · migrations 28/28 applied, re-run no-op, same fingerprint, 0 drift · `drizzle-kit generate` writes no file · seed 0 · `/api/health` = `database:UP` on `beyu_runtime` · **vitest 123 files / 2451 tests / 0 failed / 0 skipped in 354.89 s** · `scan-secrets.mjs` clean (1180 files, no allowlist) · `dr-drill.ts` **PASSED** (schema from migrations alone, fingerprint parity, 117 tables, 44 RLS tables preserved, both chains intact) · `npm audit --omit=dev` root 0.

**Runtime role:** `rolesuper=f rolbypassrls=f rolcreaterole=f rolcreatedb=f` — app genuinely non-owner, so RLS binds.

**Health:** `tsc` 0 · 30/30 migrations on real PG16 · real-PostgreSQL security suite **10 suites / 94 tests pass** · `health` schema 63/63 tables RLS, `beyu_identity` 4/9, 68 policies, none without RLS · 5 `SECURITY DEFINER` functions all pin `search_path` · PGlite 91 passed / 2 env-gated skips / 0 failed → **93/93 pass once live-federation env supplied** · audit: frontend 0, backend 13 moderate / 0 high / 0 critical.

**CI on `main`:** `ci.yml` run `34026282329` — **7/7 jobs success**. `db-release.yml` run `34026282327` — **failure** at preflight (intentional fail-closed), downstream steps skipped by design.

**Live probes:** `/api/system/self-test` → 401 unauthenticated, `HEALTHY` with 10→12 controls · `/internal/events` → 401 without token, valid HS256 token passes auth and reaches validation (422), **wrong-secret signature → 401 `INVALID_SERVICE_TOKEN`** · replay → `status:DENIED` + `REPLAY_BLOCKED` with the original audit preserved.

## 4. Gaps identified at baseline (before remediation)

1. **No privilege assertion on the running path.** `rolesuper` appears in `src/lib` only via a governance report writer and `scripts/setup-db-role.ts`; `src/app/api/**` has 0 privilege checks, and no self-test control asserted role posture. → closed by `CTL-SEC-011`.
2. **Noelia config drift** `NOELIA_GENERATIVE_CREDENTIAL_REF` (status layer) vs `…_API_KEY_REF` (adapter); neither in `.env.example`; `BEYU_INTERNAL_SERVICE_TOKEN` also undocumented. → resolver unified, `.env.example` completed.
3. **Availability reported from env, not from wiring** (`resilience.ts` returned `OPENAI_COMPATIBLE_ADAPTER_IMPLEMENTED` unconditionally on config). → now configured ∧ mounted.
4. **10 enable-only + 34 non-RLS tenant-scoped tables.** Adjudicated table-by-table; 0 HTTP path bypasses today; 14 have no read path. Blanket `FORCE` would break migrations/seed → architectural decision recorded, not patched.
5. **Agriculture declared, not built**: ACTIVE principal (`0020:15`), accepted event source (`src/app/api/v1/internal/events/route.ts:54`), `apis:["/api/v1/agriculture/*"]` + `dataAuthority:["FARM_BLOCK","CROP_CYCLE","HARVEST"]` (`src/db/seed.ts:1002`) over 0 tables/0 routes.
6. **RAG**: no vector store; `osId` audit-only with no filter predicate and no policy dimension.
7. **Ops**: 2 of ~20 runbooks; no down-migrations; no metrics/tracing; only an AI-class incident table.
8. **CI/CD**: owner secret absent → production schema never released from CI; branch protection **403 / NOT_VERIFIABLE** (not "unprotected").
9. **Committed generated evidence** (`sectors/health/coverage/*.json`) regenerated by any test run, no commit-SHA binding; running Health suites dirties the tree.

## 5. Things deliberately not trusted, and how they were resolved

- `relforcerowsecurity = false` was **not** read as "RLS missing" — `relrowsecurity` was queried alongside, and the owner-vs-grantee exemption was derived from PostgreSQL's actual semantics rather than asserted.
- A live single-tenant sandbox returning 0 rows was **not** treated as proof of isolation; every one of the 34 non-RLS tables was read at source, and the adversarial suite (including "drop the `WHERE` entirely and still cannot leak") was cited instead.
- `gh api .../actions/secrets` → 403: secret presence recorded as **inferred from CI's own fail-closed step**, not as "absent".
- `beyu-os-1-0.vercel.app` unreachable (TLS `SSL_ERROR_SYSCALL`) while `api.github.com` returned 200: recorded as **unverified**, never as "production is down".
- `psql` is absent from the image, so all SQL ran through a scratch stdin-only driver wrapper; passing SQL as a CLI argument silently no-opped and was corrected.
- The Health PGlite full run was OOM-killed at 62/93 by the 4 GB sandbox (`dmesg`: killed `node`, `anon-rss:3515136kB`). Reported **ENVIRONMENT_LIMITED** and completed in bounded batches — never as a product failure.
- Repeated `admin@beyu.os` logins tripped the 120/60 s per-principal limiter, making suites crawl. The limiter was **left intact** (it is the thing under audit) and runs were spaced instead.

## 6. Reproduction

```bash
npm ci && npx tsx scripts/setup-db-role.ts        # non-privileged runtime role
npm run migrate && npm run migrate                # 28/28, then prove no-op
npx drizzle-kit generate --name=drift_check       # must write no file
npx vitest run --reporter=json                    # 125 files / 2466 tests
node scripts/scan-secrets.mjs
npx tsx scripts/dr-drill.ts                       # restore + chain verification

# Health cross-OS suites need both systems live:
cd sectors/health/backend
npm run migration:identity:up
BEYU_OS_BASE_URL=http://127.0.0.1:3100 BEYU_INTERNAL_SERVICE_TOKEN=*** \
TEST_DATABASE_URL=<health> BEYU_OS_ADMIN_DATABASE_URL=<root> \
BEYU_EVENTS_INTEGRATION=1 \
  node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand \
  cross-os-identity-certification events.integration
git checkout -- sectors/health/coverage/          # suites rewrite committed artifacts
```
