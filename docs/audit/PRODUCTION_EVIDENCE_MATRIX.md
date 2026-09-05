# BEYU OS Production Evidence Matrix

**Timestamp:** 2026-09-05 UTC  
**Branch:** `arena/01a07261-beyu-os-1-0`  
**Baseline commit:** `6bc9fe9ab5072aaa9fc0746313b54285f8c1b3cc`  
**Production:** <https://beyu-os-1-0.vercel.app>

| Domain | Test | Evidence | Environment | Result |
|--------|------|----------|-------------|--------|
| Repository baseline | `git rev-parse HEAD`; `git branch --show-current`; `git status --short --branch` | HEAD `6bc9fe9ab5072aaa9fc0746313b54285f8c1b3cc`; branch `arena/01a07261-beyu-os-1-0`; prior state had untracked audit report only | Local repo | PASS |
| Origin target | `git ls-remote origin main` | `origin/main` points to `6bc9fe9ab5072aaa9fc0746313b54285f8c1b3cc` | GitHub | PASS |
| Node/npm toolchain | `node --version`; `npm --version`; `npx tsc --version`; `npx next --version`; `npx drizzle-kit --version` | Node `v22.22.3`; npm `10.9.8`; TypeScript `5.9.3`; Next `16.3.3`; Drizzle Kit `0.31.10` | Local | PASS |
| External local DB tooling | `pg_isready --version`; `psql --version`; `docker --version` | All commands not found | Local | EXTERNALLY BLOCKED |
| Flutter tooling | `flutter --version`; `dart --version` | Both commands not found | Local | EXTERNALLY BLOCKED |
| Root dependency install | `npm ci` | 442 packages installed; 4 moderate vulnerabilities | Local | PARTIAL |
| Root lint | `npm run lint` | ESLint completed exit 0 | Local | PASS |
| Root typecheck | `npm run typecheck` | `tsc --noEmit` completed exit 0 | Local | PASS |
| Root production build | `npm run build` | Next compiled successfully and produced route table including auth, health, finance, governance, HCM, Noelia, `/os/*` | Local | PASS |
| Root dependency audit | `npm audit --json` | `{info:0, low:0, moderate:4, high:0, critical:0, total:4}` | Local | PARTIAL / P2 |
| Root schema drift failure reproduction | `DATABASE_URL=postgres://x:y@localhost/db npx drizzle-kit generate --name=ci_drift_check` before metadata fix | Generated `drizzle/0023_ci_drift_check.sql` with ledger account index diff | Local | FAIL REPRODUCED |
| Root schema drift remediation | Added `drizzle/meta/0022_snapshot.json`; reran `DATABASE_URL=postgres://x:y@localhost/db npx drizzle-kit generate --name=ci_drift_check` | Output: `No schema changes, nothing to migrate 😴`; no duplicate `0023` migration persisted | Local | PASS for drift check |
| Root full DB-backed tests | `npm test -- --reporter=verbose` baseline | `58 failed | 41 passed | 12 skipped`; `450 failed | 1109 passed | 816 skipped`; representative failure `DATABASE_URL is required` | Local | FAIL / EXTERNALLY BLOCKED |
| Root local production start | `PORT=3000 npm run start -- --hostname 0.0.0.0` after build | Server started on `0.0.0.0:3000`; local `/api/health` returned HTTP 503 database DOWN | Local | PARTIAL |
| Production process liveness | `fetch_page(https://beyu-os-1-0.vercel.app/api/health/live)` | `{"ok":true,"system":"BEYU-OS/1.0.0","checks":{"process":"ALIVE"}}` | Production | PASS for process only |
| Production DB health | `fetch_page(https://beyu-os-1-0.vercel.app/api/health)` | `{"ok":false,"system":"BEYU-OS/1.0.0","checks":{"database":"DOWN"}}` | Production | FAIL / P0 |
| Production unauthenticated Finance API | `fetch_page(https://beyu-os-1-0.vercel.app/api/v1/finance/accounts)` | `UNAUTHENTICATED`; trace/correlation ID returned | Production | PASS for unauth denial only |
| GitHub CI status | `gh run list`; `gh run view 33966552138` | Latest main root CI for `6bc9fe9...` conclusion `failure`; root job failed at schema drift and skipped later critical stages | GitHub Actions | FAIL / P1 |
| GitHub DB release status | `gh run list`; `gh run view 33966552151` | Latest main DB release for `6bc9fe9...` conclusion `failure`; live preflight failed at missing production DSN secret; deploy/verify skipped | GitHub Actions | FAIL / P0 |
| GitHub secret inspection | `gh secret list --repo yumvalila-bot/BEYU-OS-1.0` | `HTTP 403: Resource not accessible by integration` | GitHub Actions/API | EXTERNALLY BLOCKED |
| Vercel environment inspection | `npx vercel env ls production` | `Error: No existing credentials found. Please run vercel login or pass --token` | Vercel CLI | EXTERNALLY BLOCKED |
| Health OS frontend install/typecheck/test/build | `npm ci`; `npm run typecheck`; `npm test -- --reporter=dot`; `npm run build` in `sectors/health` | Typecheck passed; Vitest `3` files/`14` tests passed; Vite build passed | Local | PASS for local build/tests |
| Health OS frontend dependency audit | `npm audit --json` in `sectors/health` | `5 vulnerabilities (1 low, 4 high)` | Local | FAIL/P2 |
| Health OS backend install/build/test | `npm ci`; `npm run build`; `npm test -- --runInBand` in `sectors/health/backend` | Nest build passed; Jest `88` suites passed, `2` skipped; `488` tests passed, `15` skipped | Local | PASS for local build/tests |
| Health OS backend dependency audit | `npm audit --json` in `sectors/health/backend` | `32 vulnerabilities (3 low, 19 moderate, 10 high)`; npm warns Apollo Server v4 EOL | Local | FAIL/P2 |
| Mobile source inspection | Read `mobile/flutter/lib/config/app_config.dart`, `auth_provider.dart`, `api_client.dart` | Default API URL `https://api.beyu.os`; `submitMfaCode` not fully implemented; `getHealthDashboard` throws `UnimplementedError` | Source | FAIL/P1 for certification |
| CAP_POSTING source inspection | Read `src/lib/finance/posting-engine.ts` | `postJournal` starts with `await requireCapability("CAP_POSTING")`; route maps `CapabilityLockedError` to HTTP 423 | Source | PARTIAL / activation blocked |
| Security headers local | Local `curl -i http://127.0.0.1:3000/` | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP/CORP, CSP present; `X-Powered-By: Next.js` present; CSP includes `unsafe-inline` and `unsafe-eval` | Local | PARTIAL |
| PR DB release scratch validation after remediation | GitHub Actions run `33978661392` on commit `1027572debc3771aa57559937ba102fdbe085fab` | Workflow conclusion `success`; scratch PostgreSQL migration validation passed; production preflight/deploy/runtime jobs skipped on PR | GitHub Actions | PASS for scratch only |
| PR root CI after remediation | GitHub Actions run `33978661410` on commit `1027572debc3771aa57559937ba102fdbe085fab` | Workflow conclusion `failure`; schema drift, DR drill, runtime role, seed, build, production start, and DB health steps passed; `Full root regression (PostgreSQL-backed + HTTP/E2E)` failed; log/artifact download attempts returned EOF from Actions blob storage | GitHub Actions | FAIL / P1 |
| Root CI regression failure diagnosis | GitHub check annotations for job `101341032480` from run `33979132075` | Exact failures: five specialist tests expected `public.beyu_migrations` count `22` but received `23` after legitimate migration `0022`; files: `tests/specialist/treasury.test.ts`, `risk.test.ts`, `forecast.test.ts`, `compliance.test.ts`, `audit-intel.test.ts` | GitHub Actions API | FAIL REPRODUCED |
| Specialist migration-count remediation | Updated the five tests to assert `23` migrations and document `0022_chart_of_accounts_tenant_uniqueness` as additive/hardening baseline, without skipping or weakening security assertions | `npm run lint` PASS; `npm run typecheck` PASS; `drizzle-kit generate` still reports no schema changes | Local | PASS pending CI |
| PR root CI after second remediation | GitHub Actions run `33979933714`, job `101343232013`, commit `9c0a652c574cede6b382e0aae4fc6e21fa5c9cbc` | Root BEYU OS PostgreSQL security gate passed every step: migrations, deterministic rerun, schema drift, DR drill, runtime role constraints, seed, production builds, server start, DB health, full root regression, skip-detection | GitHub Actions scratch PostgreSQL | PASS |
| PR status after second remediation | `gh pr view 28 --json statusCheckRollup,headRefOid` | PR head `9c0a652c574cede6b382e0aae4fc6e21fa5c9cbc`; root CI success; DB release scratch validation success; production preflight/deploy/runtime jobs skipped on PR; Vercel preview status success | GitHub/Vercel status API | PARTIAL — engineering PASS, production BLOCKED |
| Fresh production DB health after CI remediation | `fetch_page(https://beyu-os-1-0.vercel.app/api/health)` | `{"ok":false,"system":"BEYU-OS/1.0.0","checks":{"database":"DOWN"}}` | Production | FAIL / P0 |
| Current PR root CI after docs-finalization commit | GitHub Actions run `33980464301`, job `101344657098`, commit `7c9e2fb3fe24af5331eccd48eaedca34e745e4f7` | Root BEYU OS PostgreSQL security gate passed every step, including full root regression and skip-detection | GitHub Actions scratch PostgreSQL | PASS |
| Current PR DB release scratch validation after docs-finalization commit | GitHub Actions run `33980464224`, commit `7c9e2fb3fe24af5331eccd48eaedca34e745e4f7` | Scratch PostgreSQL migration validation passed; production preflight/deploy/runtime jobs skipped on PR | GitHub Actions scratch PostgreSQL | PASS for scratch only |
