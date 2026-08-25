# Live HTTP / Production-Build Verification (Iteration 13)

**Status: 🟢 GREEN — every API route verified against the production build by execution.**

Requirement enforced: *"HTTP 200 = success is NOT acceptable"* — actual response
semantics (200/201/400/401/403/404/409/422/429/500) must be asserted with live
HTTP tests against the production build, and dead routes must be found.

## Method

1. `npm run build` → production build (Next.js 16, 15 `/api` routes + 16 `/os` pages).
2. `npx next start -H 0.0.0.0 -p 3100` → production server under test.
3. **80-test live-HTTP suite** (previously server-gated/skipped) executed against
   the production build:
   - `tests/governance/{decision,vote,resolution,authorization}-http.test.ts` (54)
   - `tests/finance/capital-governance-http.test.ts` (14)
   - `tests/noelia/http.test.ts` (5), `tests/hcm/hcm-http.test.ts` (5),
     `tests/api/validation-http.test.ts` (2)
   - **Result: 80/80 passed** (run of record: 2026-08-25, rebuilt stack).
4. **46-check route inventory sweep** (`scripts/route-inventory.mts assert`,
   repeatable: `npm run verify:routes`) — for every route: unauthenticated
   behavior, wrong-method behavior, and authenticated behavior with the
   *correct* and *wrong* principals, asserting status **and** structured error
   code (not just status).

## Verified semantics (46/46 checks, production build)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 1 | GET /api/health (anon) | 200 json `{ok, checks.database: UP}` | PASS |
| 2 | GET /api/v1/system/self-test (anon) | 401 UNAUTHENTICATED | PASS |
| 3 | GET /api/v1/system/self-test (admin) | 200 control summary (11/11) | PASS |
| 4 | GET /api/v1/governance/authorization (anon) | 401 UNAUTHENTICATED | PASS |
| 5 | …authorization?objectType=RESOLUTION&objectId=missing (governance) | 404 NOT_FOUND *within authorised scope* | PASS |
| 6 | …authorization?objectType=NOT_A_TYPE (governance) | 422 VALIDATION_FAILED | PASS |
| 7 | …authorization on a real seeded resolution (governance) | 200 authorization state | PASS |
| 8 | …authorization (admin) | 403 FORBIDDEN (no governance:resolution.read grant) | PASS |
| 9 | GET /api/v1/hcm/employees (anon) | 401 UNAUTHENTICATED | PASS |
| 10 | GET /api/v1/hcm/employees (hcm) | 200 workforce list | PASS |
| 11 | GET /api/v1/hcm/employees/EMP_DOES_NOT_EXIST (hcm) | 404 NOT_FOUND (not 500, not 200-empty) | PASS |
| 12 | GET /api/v1/hcm/employees (admin) | 403 FORBIDDEN (no hcm:employee.read grant) | PASS |
| 13 | POST /api/v1/ai/noelia (anon) | 401 UNAUTHENTICATED | PASS |
| 14 | POST /api/v1/ai/noelia (admin) | 403 FORBIDDEN (no ai:noelia.query grant) | PASS |
| 15 | POST /api/v1/ai/noelia empty body (ceo) | 422 VALIDATION_FAILED | PASS |
| 16 | POST /api/v1/ai/noelia question (ceo) | 200 governed answer envelope | PASS |
| 17 | POST /api/v1/finance/waterfall/simulate (anon) | 401 UNAUTHENTICATED | PASS |
| 18 | …waterfall/simulate empty body (cfo) | 422 VALIDATION_FAILED | PASS |
| 19 | …waterfall/simulate seeded config (cfo) | 200 simulation (no cash moves) | PASS |
| 20 | POST /api/v1/finance/tax/assess (anon) | 401 UNAUTHENTICATED | PASS |
| 21 | …tax/assess empty body (cfo) | 422 VALIDATION_FAILED | PASS |
| 22 | …tax/assess seeded strategy+entity (cfo) | 200 jurisdiction-gated assessment | PASS |
| 23 | POST …/capital/CAP_DOES_NOT_EXIST/governance-authorization (anon) | 401 UNAUTHENTICATED | PASS |
| 24 | …capital/… (cfo) | 404 NOT_FOUND (not 500) | PASS |
| 25 | POST /api/v1/governance/resolutions (anon) | 401 UNAUTHENTICATED | PASS |
| 26 | …resolutions empty proposal (governance) | 422 VALIDATION_FAILED (nothing created) | PASS |
| 27 | …/RES_DOES_NOT_EXIST/table (governance) | 404 NOT_FOUND | PASS |
| 28 | …/RES_DOES_NOT_EXIST/votes valid vote (governance) | 404 NOT_FOUND (schema validates first) | PASS |
| 29 | …/RES_DOES_NOT_EXIST/decision (governance) | 404 NOT_FOUND | PASS |
| 30 | POST /api/v1/auth/login empty (anon) | 422 VALIDATION_FAILED | PASS |
| 31 | POST /api/v1/auth/logout (admin) | 200 + `authenticated:false` | PASS |
| 32–46 | every route, undeclared method (authenticated) | 405 | PASS (15/15) |

Semantics proven by the 80-test suite in the same run (by execution, not source
grep): session auth (401), forgery guards (422 SERVER_CONTROLLED_FIELD),
idempotency (replay returns the original response; cross-actor key reuse never
leaks), rate limiting (429), TOTP replay prevention (consumed step rejected),
cross-tenant isolation (REQUIRES_HUMAN_REVIEW / 403), lifecycle conflicts (409),
and the Noelia cross-tenant 401→REQUIRES_HUMAN_REVIEW contract.

## Findings & classification

| ID | Finding | Classification |
|----|---------|----------------|
| F-13-1 | PLATFORM_ADMIN (admin@beyu.os) holds **no** business-domain grants (governance/finance/hcm/ai) and gets structured 403 on those routes. | **NOT_A_GAP — by design.** RBAC is role-based; platform administration is not a business role. Evidenced live (checks 8, 12, 14). |
| F-13-2 | Undeclared-method responses are Next.js default `405` with an empty text body, not a JSON envelope. | **NOT_A_GAP.** No `/api` contract clause requires a JSON envelope for 405; no HTML is ever served; the status itself is correct and asserted. |
| F-13-3 | A probe that hits `POST /api/v1/auth/logout` before other routes sees 401 on all subsequent authenticated calls. | **NOT_A_GAP — correct behavior.** Logout invalidates the session; the inventory sweep orders logout last. |
| F-13-4 | Login endpoint is rate-limited at 10 attempts/60s per IP; repeated test runs return 429. | **NOT_A_GAP — by design.** Caller-side cooldown (65s) is implemented in the test tooling; the limiter itself is never weakened. |
| F-13-5 | Mid-iteration workspace filesystem restore reset `.git` to post-clone state (commit metadata for Iterations 10–12 lost; those commits had never been pushed) and wiped `node_modules`, `.env`, the embedded-PostgreSQL tooling/data dir, and `.next`. | **INCIDENT — RECOVERED.** All file *contents* of Iterations 10–12 survived in the working tree; re-committed as recovery commit `e3cd286` and **pushed to the remote for the first time** (branch `arena/01a038ac-beyu-os-1-0` now exists on origin). Database deterministically rebuilt: fresh initdb → 16/16 migrations (checksummed) → idempotent seed. `MFA_ENCRYPTION_KEY`/`AUTH_SECRET` regenerated; stored MFA secrets re-encrypted under the production key (production guard in `src/lib/mfa.ts` enforced — the 500s observed before the fix prove the guard works). Every commit after this incident is pushed immediately. |

## Dead-route / silent-failure audit

- All 15 `/api` routes respond; **zero 404s on declared routes, zero 500s** in
  the sweep.
- No route returns HTML on `/api` (asserted per response; the only non-JSON is
  the framework 405, see F-13-2).
- No silent 200 containing a denied/error state: every denial observed is a
  401/403/404/422 with a structured `error.code`; the one intentional 200-with-
  state response (`logout → authenticated:false`) is a documented idempotent
  no-op, not a masked denial.
- Missing-object paths return 404 **within the caller's authorised scope**
  (the message wording confirms the scoping: "…within your authorised scope").

## Capability matrix impact

`noelia.api` → **GREEN** (live-HTTP verified on the production build:
80/80 suite + 46/46 inventory sweep + repeatable `npm run verify:routes`).

## Reproduce

```bash
npm run build
npx next start -H 0.0.0.0 -p 3100        # terminal 1
BEYU_TEST_BASE_URL=http://127.0.0.1:3100 \
  npx vitest run tests/**/*-http.test.ts # terminal 2 (80 tests)
npm run verify:routes                     # terminal 2 (46-check sweep)
```
