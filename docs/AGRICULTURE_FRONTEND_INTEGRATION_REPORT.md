# Agriculture Frontend Integration Reconciliation Report

**Date:** 2026-09-18 (Africa/Nairobi)
**Current-main baseline:** `498d4b16725a46ae9dd9bab926cdbdd377ddb5c0`
**Branch:** `arena/01a0adfa-beyu-os-1-0`

## Result

Agriculture was already integrated and remains canonical at `/os/agriculture` with `/os/agriculture/capabilities`, 90 guarded APIs, 84 tables, the existing Flutter surface, canonical Noelia/HIVE observations, and Finance-only posting. PR #69's Ujenzi OS is an additive fifth Sector OS and did not displace Agriculture.

The PR #68 Agriculture documents are retained but refreshed against current main. No Agriculture product workflow, schema, migration, seed, mobile identity, or duplicate service was invented.

## Route and boundary summary

| Route/surface | Guard and source |
|---|---|
| `/launcher` | Existing `authorizedOperatingSystems`; target scope + permission determines discoverability |
| `/os/agriculture` | `requirePrincipal`, canonical `BEYU-AGRI` target, page-level `agriculture:data.read`, safe entity scope |
| `/os/agriculture/capabilities` | Same guards; truthful links to existing APIs, not fake UI completeness |
| `/api/v1/agriculture/*` | `guarded()` + canonical target recheck + RBAC/ABAC + tenant DB context + audit |
| Flutter Agriculture screen | Existing shared API client, BEYU identity, and secure offline queue |

## Reconciliation hardening

Current-main replay found that a generic `SECTOR_OPERATOR` permission could reach another sector's read API within the caller's own RLS context. The database did not leak foreign rows, but the HTTP boundary did not satisfy the stronger rule that separate sectors require separate authorization. `src/lib/api.ts` now derives the canonical target from the declared Agriculture/Ujenzi permission and denies when that target is outside the principal's governed scope. Tests execute both Agriculture→Ujenzi and Health/Ujenzi→Agriculture denials.

## Verification

| Gate | Result |
|---|---|
| Fresh migration replay and seed | PASS; migrations `0000`–`0043` |
| Migration idempotence | PASS; second fingerprint unchanged |
| Agriculture directory | 57 passed, 0 failed |
| Agriculture live HTTP | 15 passed, 0 failed |
| Frontend integration | 24 passed, 0 failed |
| Full root suite | 3,732 passed, 28 repository-defined skips, 0 failed |
| Root typecheck/lint | PASS; one pre-existing image optimization warning |
| Build without runtime secrets | PASS; 146 generated pages |
| Secret scan | PASS; 1,859 tracked files |
| Root HIGH dependency audit | PASS after lock-only `js-yaml` 4.3.2 remediation |
| Health frontend | Typecheck/build PASS; 14 tests passed |
| Flutter | BLOCKED; SDK absent and no `mobile/flutter/test` suite |

Executed Agriculture negatives include unauthenticated page/API access, missing read permission, cross-sector API/page access, read-only write attempts, foreign legal entity/country, and offline replay. Positive flows include dashboard reads, farm/harvest operations, events, simulations, and sync. Harvest verification records `HARVEST_RECORDED`, zero journals, and no capital-request creation; `CAP_POSTING` remains `LOCKED`.

## RLS statement

PostgreSQL catalogue evidence is 84/84 Agriculture tables RLS-enabled and policy-covered; 74/84 are FORCE RLS. The ten original foundation relations are not FORCE and remain an explicit hardening gap. Runtime execution uses a non-owner NOSUPERUSER/NOBYPASSRLS role; no privileged production claim is inferred from local evidence.

## Files affected

Agriculture product sources are reused. Reconciliation changes touching Agriculture behavior/evidence are limited to:

- `src/lib/api.ts` — shared canonical target-OS API boundary;
- `tests/agriculture/http.test.ts` — cross-sector read denial;
- `tests/frontend/integration.test.ts` — Agriculture↔Ujenzi page denial and Ujenzi route coverage;
- this report and `docs/AGRICULTURE_FRONTEND_INTEGRATION_AUDIT.md`.

## Deployment statement

The build contains the canonical Agriculture routes and APIs. Local production-server HTTP verifies unauthenticated fail-closed and controlled seeded-principal behavior. No authenticated production credentials were requested or used; authenticated production rendering, writes, RLS rows, and audit records remain unverified until controlled deployment evidence exists.

**Status:** Agriculture preserved and locally green. Final merge remains conditional on fresh GitHub CI and Vercel checks for the pushed reconciliation head.
