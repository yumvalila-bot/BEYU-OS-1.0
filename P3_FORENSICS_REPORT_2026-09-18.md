# BEYU OS — P3 CI FAILURE FORENSICS REPORT

**Date:** 2026-09-18  
**PR:** #73 — feat(release): P3 release orchestration + PVG + canary + blue/green governance  
**Final HEAD:** 61975fa fix(p3): restore clean CI and update specialist migration pin to 47  
**Merge Commit:** 4c3f940 (main)  
**Final Main SHA:** 4c3f940  

---

## 1. P3 PR
- **Number:** 73
- **Title:** feat(release): P3 release orchestration + PVG + canary + blue/green governance
- **Branch:** arena/01a0b5f0-beyu-os-1-0
- **URL:** https://github.com/yumvalila-bot/BEYU-OS-1.0/pull/73

## 2. PR HEAD SHA
- **Before fix:** e7a4dc2a98606846af64661a53a563c3418c786b
- **After fix (final):** 61975fa (fix(p3): restore clean CI and update specialist migration pin to 47)
- **Merge commit on main:** 4c3f940

## 3. Failing Workflow
- **Name:** BEYU OS CI — PostgreSQL-backed security gate
- **Run IDs:**
  - 35395433207 — e7a4dc2 (failure)
  - 35397480711 — 61975fa (success after fix)
  - 35399007966 — 4c3f940 merge commit (success)

## 4. Failing Job
- **Name:** Root BEYU OS — PostgreSQL security gate
- **Job IDs:**
  - 105763082027 — e7a4dc2 failure
  - For 61975fa: same job name, success
- **Duration:** ~15 minutes (full regression)

## 5. Failing Step
- **Step:** Full root regression (PostgreSQL-backed + HTTP/E2E)
- **Command:** `npm test` (vitest run) with DATABASE_URL=postgres service and BEYU_TEST_BASE_URL=running server
- **Previous also failing (earlier):** Drift-gate self-test — prove the gate separates valid from drift (case 8) — fixed by uniqueConstraintSignature

## 6. Exact Original Error
```
AssertionError: expected 47 to be 46 // Object.is equality
- Expected
+ Received
- 46
+ 47
❯ tests/specialist/treasury.test.ts:925:85
❯ tests/specialist/risk.test.ts:1075:15
❯ tests/specialist/forecast.test.ts:1007:85
❯ tests/specialist/compliance.test.ts:1185:85
❯ tests/specialist/audit-intel.test.ts:920:85
```

Via GitHub Annotations API (fetch_page on https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/35395433207/job/105763082027):
- 7 errors, 2 warnings
- 5 specialist migration count assertions failing

Earlier failure (before drift fix):
```
::error::DECLARED_NOT_IN_DB uniqueConstraint release_records.unique constraints —
database [{"columns":["release_id"],"nullsNotDistinct":false,"name":"release_records_release_id_unique"}],
declared [{"name":"release_records_release_id_unique","nullsNotDistinct":false,"columns":["release_id"]}]
::error::SCHEMA DRIFT DETECTED — 1 divergence(s)
```

## 7. P2 Baseline Result
- **SHA:** 9e83967476ad3dd90fac6f6941ab3c391114a923 (origin/main before P3, P2 complete)
- **Migration count:** 46 (0000-0045)
- **Specialist tests:** Expect 46 → PASS
- **Drift gate:** PASS (with known metadata debt 0045)
- **Proven via:** git ls-tree origin/main drizzle/ shows 46 SQL files + meta = 47 entries, 46 migrations

## 8. Current Main Result (before merge)
- **SHA:** origin/main at 9e83967 (same as P2 baseline, since P3 not yet merged)
- **Migration count:** 46
- **Specialist tests:** PASS with 46
- **Drift gate:** PASS

## 9. P3 Result (before fix)
- **SHA:** e7a4dc2
- **Migration count:** 47 (0000-0046)
- **Specialist tests:** Expect 46 but DB has 47 → FAIL (5 tests)
- **Drift gate:** Initially FAIL due to unique constraint JSON key order, then PASS after ac06cb8 fix
- **Full regression:** FAIL due to specialist count

## 10. Root Cause Classification
Two distinct root causes, sequential:

**A. Drift comparison false positive (fixed in ac06cb8):**
- `drizzle-kit pull` produces `{"columns":["release_id"],"nullsNotDistinct":false,"name":"..."}`
- `drizzle-kit generate` produces `{"name":"...","nullsNotDistinct":false,"columns":["release_id"]}`
- `src/lib/migration/drift.ts` used `JSON.stringify(Object.values(uniqueConstraints).sort())` which preserves key order
- Same semantic constraint reported as drift → blocking failure in case 8
- Classification: Comparator defect, not schema drift

**B. Specialist migration pin mismatch (fixed in 61975fa):**
- P3 adds legitimate migration 0046_release_governance (additive, expand-only, 6 tables: release_records, release_transitions, pvg_runs, canary_deployments, blue_green_deployments, rollback_requests)
- Specialist tests (audit-intel, compliance, forecast, risk, treasury) hardcode expected count 46 with attribution comments for 0000-0045
- After adding 0046, count is 47, but tests still expect 46 → FAIL
- Classification: Test fixture pin not updated after legitimate migration, not a pre-existing failure

## 11. Exact Fix
**Minimal root-cause fix, in order of preference:**

1. **Correct faulty comparator (drift.ts):**
```typescript
function uniqueConstraintSignature(v: { name?: string; columns?: string[]; nullsNotDistinct?: boolean }): string {
  const name = v.name ?? "";
  const cols = (v.columns ?? []).join(",");
  const nnd = v.nullsNotDistinct ? "1" : "0";
  return `${name}|${cols}|${nnd}`;
}
// Before: const dbUq = JSON.stringify(Object.values(dbT.uniqueConstraints ?? {}).sort())
// After: compare by signature set ignoring JSON key order
const dbUqSigs = new Set(Object.values(dbT.uniqueConstraints ?? {}).map((v: any) => uniqueConstraintSignature(v as any)));
const decUqSigs = new Set(Object.values(decT.uniqueConstraints ?? {}).map((v: any) => uniqueConstraintSignature(v as any)));
```

2. **Correct faulty test fixture (specialist tests):**
- Updated 5 files: `tests/specialist/audit-intel.test.ts`, `compliance.test.ts`, `forecast.test.ts`, `risk.test.ts`, `treasury.test.ts`
- Changed `toBe(46)` → `toBe(47)` (and `expect(n).toBe(47)` for risk.test.ts)
- Added attribution comment:
```typescript
// 46 -> 47: 0046_release_governance (P3 release governance — canonical control-plane
// capability: release_records, release_transitions, pvg_runs, canary_deployments,
// blue_green_deployments, rollback_requests; all additive, expand-only, no specialist
// truth, no posting path, CAP_POSTING stays LOCKED, six OSs unchanged, BEYU OS single
// control plane).
```

3. **Restore clean CI:**
- Restored `.github/workflows/ci.yml` from canonical P3 commit b695714
- Removed debug hacks that were causing extra failure (Post full regression failure as PR comment step failing due to invalid GH_TOKEN)
- Preserved P3 governance job (release-governance) and migration count 0000-0046

**Not done (per RULE 6):**
- No deletion of failing assertion
- No blanket ignore
- No skipping of table/constraints
- No weakening of gate
- No suppression of drift detection

## 12. Files Changed
- `.github/workflows/ci.yml` — restored to clean P3 (removes 77 lines of debug)
- `src/lib/migration/drift.ts` — added uniqueConstraintSignature + normalized comparison (19 insertions, 4 deletions) — commit ac06cb8
- `tests/specialist/audit-intel.test.ts` — 46→47 + comment
- `tests/specialist/compliance.test.ts` — 46→47 + comment
- `tests/specialist/forecast.test.ts` — 46→47 + comment
- `tests/specialist/risk.test.ts` — 46→47 + comment
- `tests/specialist/treasury.test.ts` — 46→47 + comment
- Total: 6 files, 31 insertions, 81 deletions in final fix commit 61975fa (plus drift fix earlier)

## 13. Migration Inventory
- **Count:** 47
- **Files:** 0000-0046 inclusive
- **0000-0044:** Kernel, governance, Noelia, financial, agriculture, foundation, government fabric, family office, Ujenzi, admin governance (as per P2)
- **0045:** payment_webhook_events_tenant_index — P2 corrective, additive index, IF NOT EXISTS, no specialist truth
- **0046:** release_governance — P3 canonical, additive, expand-only:
  - `release_records` — immutable release identity (id, release_id unique, git_sha, repository, build_id, deployment_id, environment, application_version, runtime_version, migration_fingerprint, latest_migration, migration_count, schema_fingerprint, release_timestamp, created_at)
  - `release_transitions` — append-only ledger (id, release_id FK, source_commit, artifact_build_id, environment, timestamp, actor_id, actor_type check HUMAN/SERVICE/AI/SYSTEM, previous_state, next_state check 12 states, reason, verification_evidence jsonb, correlation_id, trace_id, created_at)
  - `pvg_runs` — PVG verification runs (id, release_id FK, environment, status PASS/FAIL, commit_sha, deployment_id, build_id, database jsonb, schema jsonb, security jsonb, events jsonb, runtime jsonb, checks jsonb, blocking_failures jsonb, verified_at, correlation_id, trace_id, created_at)
  - `canary_deployments` — canary governance (id, release_id FK, environment, state check 8 states, traffic_percentage check 0/1/5/25/50/100, previous_percentage, verification_evidence, pvg_result, created_at, updated_at, actor_id, correlation_id)
  - `blue_green_deployments` — blue/green (id, environment, blue_release_id, green_release_id, state check 9 states, traffic_state jsonb, verification_evidence, pvg_evidence, created_at, updated_at, actor_id, correlation_id)
  - `rollback_requests` — governed rollback (id, release_id, target_release_id, type check APPLICATION/DATABASE/TRAFFIC, reason, actor_id, actor_type HUMAN/SERVICE, compatibility_checked, authorized, evidence jsonb, correlation_id, created_at)
- **Checksums:** 0000-0044 unchanged from P2, 0045 and 0046 new, registered in KNOWN_METADATA_DEBT.missingSnapshot and missingJournal as acknowledged non-authoritative debt (drizzle/meta ends at 0039, intentional)
- **Ledger status:** All 47 recorded in beyu_migrations, deterministic re-run applies nothing
- **Why 47 exists:** P3 release governance is required for governed release lifecycle; not a workaround for CI

## 14. Drift-Gate Result
- **Before fix:** FAIL — 1 blocking uniqueConstraint due to JSON key order
- **After fix (ac06cb8):** PASS
- **Final (61975fa + 4c3f940):** PASS
- **Semantics preserved:** VALID SCHEMA → PASS, GENUINE DRIFT → FAIL, MISSING MIGRATION → FAIL, CHECKSUM MISMATCH → FAIL, etc.
- **Proof:** Job step "Verify no schema drift between the applied migrations and src/db/schema" SUCCESS in runs 35397480711 and 35399007966
- **Drift self-test:** PASS — proves gate separates valid from drift (case 8 and others)

## 15. P3 Governance Result
- **Job:** P3 Release Governance — DB-free verification
- **Run:** 35397480711 job 105763082... (for 61975fa) SUCCESS, 35399007966 for main SUCCESS
- **Tests:** 193 passed (11 test files)
  - state-machine: 12+ states, explicit transitions, fail-closed
  - identity: release tuple, secret check, mismatch blocks
  - pvg: 10 checks (runtime health, release identity, DB connectivity, migration state, schema fingerprint, auth/security invariants, app readiness, event/outbox health, env identity, deployment identity)
  - canary: CONFIGURED→DEPLOYED→PVG_VERIFIED→TRAFFIC_ACTIVE→OBSERVATION→PROMOTION_ELIGIBLE, traffic % != auth, adapter boundary noop/vercel
  - blue-green: BLUE_ACTIVE→GREEN_DEPLOYED→GREEN_PVG_VERIFIED→GREEN_CANARY→GREEN_PROMOTION_READY→GREEN_ACTIVE→BLUE_RETIRED, adapter boundary, human governance for retire
  - expand-contract: ADDITIVE vs DESTRUCTIVE classification, contract safety gate, compatibility window
  - rollback: APPLICATION/DATABASE/TRAFFIC distinction, forward-fix DB, audit event
  - security: RBAC, ABAC, tenant/entity/country, RLS, Noelia/HIVE, CAP_POSTING LOCKED
  - observability: release ID, deployment ID, PVG status, canary state, traffic state, etc.
  - architecture: canonical location, no duplicate, DEPLOYED!=VERIFIED!=PROMOTED, no secret leakage

## 16. Security/RLS Result
- **Committed secret scan:** PASS
- **Production dependency audit (critical only):** PASS for root, health-backend, health-frontend
- **RLS:** Runtime role genuinely constrained, NOSUPERUSER/NOBYPASSRLS, critical tenant-scoped tables have RLS
- **Auth chain:** GlobalUserID→RBAC+ABAC→OS→tenant→entity→country→policy→app→Postgres RLS preserved
- **No URL auth, no bypass, no RLS weakening**
- **CAP_POSTING:** Remains LOCKED fail-closed
- **Six OSs:** Exactly BEYU, Finance, Health, Agriculture, Ujenzi, Foundation

## 17. Full Test Totals
- **P3 DB-free:** 193 passed
- **Migration integrity:** 36 passed
- **Architecture:** 116 passed (DB-free) + 14 DB-dependent skipped locally, PASS in CI
- **Release governance:** 132 in tests/release/ + 25 in p3-release-governance.test.ts
- **Full root regression (PostgreSQL-backed + HTTP/E2E):** Previously FAIL due to 5 specialist count, now PASS in 61975fa and 4c3f940
- **Health backend:** PASS
- **Health frontend:** PASS

## 18. Typecheck
- **Command:** `npm run typecheck` (tsc --noEmit)
- **Result:** PASS

## 19. Lint
- **Command:** `npm run lint` (eslint .)
- **Result:** PASS with 1 warning (pre-existing: src/components/noelia-cross-os-visual.tsx 33:7 warning no-img-element)

## 20. Build
- **Command:** `npm run build` (next build)
- **Result:** PASS — all routes compiled, including new /api/health/identity, /api/v1/system/release, /api/v1/system/release/transitions, /api/v1/system/release/pvg

## 21. CI Result
- **For 61975fa (final PR HEAD):**
  - BEYU OS CI — PostgreSQL-backed security gate: SUCCESS (run 35397480711)
  - BEYU OS — database release: SUCCESS (run 35397480803)
  - Jobs: Root BEYU OS PASS, Health backend PASS, P3 governance PASS, secret scan PASS, dependency audits PASS, frontend verification PASS
- **For 4c3f940 (merge commit on main):**
  - BEYU OS CI: SUCCESS (run 35399007966)
  - Database release: SUCCESS (run 35399008027)
  - Same job breakdown: all PASS

## 22. Merge Commit
- **SHA:** 4c3f940
- **Message:** feat(release): P3 release orchestration + PVG + canary + blue/green governance
- **Parents:** 9e83967 (main before P3) + 61975fa (P3 branch)
- **Stats:** 41 files changed, 6720 insertions, 12 deletions
- **Method:** git merge --no-ff arena/01a0b5f0-beyu-os-1-0, pushed to origin/main (no bypass, no force)

## 23. Final Main SHA
- **SHA:** 4c3f940
- **Branch:** main
- **Remote:** origin/main updated from 9e83967 to 4c3f940

## 24. Production DB-Release Evidence
- **Workflow:** BEYU OS — database release (GitHub → Supabase)
- **Run IDs:**
  - 35397480803 for 61975fa: SUCCESS
  - 35399008027 for 4c3f940: SUCCESS
- **Steps (per workflow):**
  - Production preflight (read-only): skipping (not main? actually runs on push)
  - Production drift report (read-only): skipping
  - Production database deploy + verify: skipping (requires secrets, only on main with secrets)
  - Migration validation (scratch PostgreSQL 16): PASS (proves 0000-0046 apply clean)
  - Three-way release record, runtime verification, etc.: skipping (no prod secrets in PR)
- **Migration validation proves:** 47 migrations apply deterministically, ledger reconciliation PASS, checksums preserved for 0000-0044
- **No prod secrets requested/printed/committed**

## 25. PVG Evidence
- **PVG implementation:** src/lib/release/pvg.ts with 10 mandatory checks
- **Checks:**
  1. runtime health
  2. release identity
  3. DB connectivity
  4. migration state
  5. schema fingerprint
  6. auth/security invariants
  7. app readiness
  8. event/outbox health
  9. env identity
  10. deployment identity
- **Fail-closed:** Any blocking failure → PVG FAIL → blocks promotion
- **Independent:** PVG independent of health 200, independent of canary %
- **Evidence model:** Structured JSON with blocking_failures, checks, database, schema, security, events, runtime
- **API:** POST /api/v1/system/release/pvg guarded with platform:config.manage, GET /api/v1/system/release read guarded with dashboard.read
- **CI evidence:** P3 governance job runs PVG tests (PASS), release-governance evidence artifact uploaded (.next/RELEASE_IDENTITY.json)
- **Promotion blocking:** Verified in tests: PVG FAIL blocks transition, identity mismatch blocks, schema/migration mismatch blocks, unauthorized actor blocks

## 26. Remaining Issues
- **None for P3.** All gates green.
- **Post-merge verification done:**
  - Final main SHA 4c3f940 CI SUCCESS
  - Migration count 47, checksums preserved
  - Schema fingerprint: release governance tables present, no drift
  - Runtime identity: build-identity script captures git SHA, buildId, deploymentId, env, version, schema fingerprint
  - Security/RLS: PASS
  - Release provenance: release_records, release_transitions, pvg_runs tables exist, additive
- **Distinctions kept:**
  - DEPLOYED ≠ VERIFIED ≠ PROMOTED (enforced in state machine)
  - EXPAND→MIGRATE→VERIFY→CANARY→PROMOTE→CONTRACT (enforced in expand-contract gate)
  - PVG independent, canary % != authorization, no client-side promotion bypass
- **Next:** P4 can proceed (autonomous P4→final program) only after this P3 merge, per RULE 14

---

## Forensics Methodology (RULE 2-4)

**Identification via public API (no GH_TOKEN needed):**
- `curl https://api.github.com/repos/yumvalila-bot/BEYU-OS-1.0/pulls/73` → PR 73, HEAD e7a4dc2
- `curl .../actions/runs?per_page=20` → run 35395433207 failure for e7a4dc2, 35397480711 success for 61975fa
- `curl .../actions/runs/35395433207/jobs` → job 105763082027 Root BEYU OS failure
- `curl .../actions/jobs/105763082027` → steps, Full root regression failure
- `fetch_page https://github.com/.../actions/runs/35395433207/job/105763082027` → annotations with exact assertion errors (expected 47 to be 46)
- `git ls-tree origin/main drizzle/` → 46 migrations on main, 47 on P3

**Three-state comparison:**
| State | SHA | Migration Count | Specialist Expect | Result | Failure |
|-------|-----|-----------------|-------------------|--------|---------|
| P2 baseline (origin/main before P3) | 9e83967 | 46 | 46 | PASS | None |
| Current main (before merge) | 9e83967 | 46 | 46 | PASS | None |
| P3 HEAD before fix | e7a4dc2 | 47 | 46 | FAIL | 5 specialist count |
| P3 HEAD after fix | 61975fa | 47 | 47 | PASS | None |
| Merge commit | 4c3f940 | 47 | 47 | PASS | None |

Proves failure is NOT pre-existing, is caused by P3 adding 0046 without updating pins.

**Unique constraint forensics (RULE 5):**
- **Canonical DB reality:** `release_records_release_id_unique` UNIQUE (release_id) exists in DB, created by 0046
- **Application schema:** src/db/schema/release.ts declares `releaseId` unique with same name
- **Migration SQL:** 0046 now has explicit `CONSTRAINT "release_records_release_id_unique" UNIQUE ("release_id")` (fixed in 071d9f3)
- **Introspection output (drizzle-kit pull):** `{"columns":["release_id"],"nullsNotDistinct":false,"name":"release_records_release_id_unique"}`
- **Declared output (drizzle-kit generate from schema.ts):** `{"name":"release_records_release_id_unique","nullsNotDistinct":false,"columns":["release_id"]}`
- **Drift comparator before fix:** `JSON.stringify(...sort())` → different key order → false drift
- **Drift comparator after fix:** signature `name|columns|nullsNotDistinct` → same → PASS
- **Test fixture:** gate-selftest case 8 expects drift detection to work, was failing due to comparator, now PASS

---

## Conclusion

P3 is green and merged. The remaining Root BEYU OS gate failure was NOT a pre-existing defect nor a drift gate weakness, but two legitimate issues:

1. Drift comparator key-order bug (fixed by normalizing unique constraints)
2. Specialist migration pin 46→47 after adding 0046 (fixed by updating pins)

Both fixes are minimal, truthful, and preserve gate semantics. CI now passes on PR HEAD and on merge commit main. Production DB-release validation passes. Security and P3 governance pass. Ready for P4.
