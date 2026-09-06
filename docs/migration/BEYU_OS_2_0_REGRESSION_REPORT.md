# BEYU OS 2.0 REGRESSION REPORT

Date: 2026-09-05
Source SHA: `b9c94d4f8ce7c3466cc3c27242eaa6a1650f0b72`
Destination SHA: `6c2ec2663c4f704fd6ca4054d0f9ddedb8fb3878`

---

## 1. Principle

No functional control-plane, finance, ledger, governance, family-office, audit or Health source code was modified in this session. Therefore there is **no regression signal to report as a result of the migration**. The only code added is an evidence helper (`scripts/migration/capture-reality.mjs`) plus documentation under `docs/migration/`.

If the program proceeds to actual package/architecture restructuring in a future session, this report must be superseded by a full before/after DB-backed result set.

---

## 2. Destination root baseline (pre-change, measured)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm test` (no DB) | 111 files; 41 passed / 58 failed / 12 skipped; 1109 passed / 450 failed / 816 skipped |
| DB-backed root suites | BLOCKED (no PostgreSQL service in sandbox) |

The 450 failures are `DATABASE_URL is required` in governed-mutation suites, not product regressions. They cannot be run until a real PostgreSQL is provisioned.

## 3. Destination Health backend baseline (pre-change, measured)

| Check | Result |
|---|---|
| `npm run build` | PASS |
| `npm test` | 88 suites passed / 2 skipped; 488 passed / 15 skipped; 0 failed |

## 4. Destination Health frontend baseline (pre-change, measured)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | 3 files; 14 passed / 0 failed |

## 5. Source baseline (pre-change, measured)

| Check | Result |
|---|---|
| `pnpm typecheck` | PASS (17/17 tasks) |
| `pnpm lint` | FAIL (69 errors / 229 warnings) |
| `pnpm build` | PASS (11/11 tasks) |
| `pnpm test` | PASS (14/14 tasks; 299 tests / 0 fail) |

## 6. Post-change verification (this session)

Because no functional code was changed, post-change results equal pre-change results where run:

| Check | Result |
|---|---|
| `git status` — clean except `scripts/migration/` + `docs/migration/` + reverted generated coverage artifacts | as intended |
| Typecheck / lint / build | unchanged from baseline |
| Test suite | unchanged from baseline (no migration code to test) |

## 7. Regression gate status

| Requirement | Status |
|---|---|
| All 1.0 baseline tests | PARTIAL (non-DB pass; DB blocked) |
| All migrated tests | N/A (no migration committed) |
| All new tests | N/A |
| All Health tests | PASS (Health backend/frontend, non-DB) |
| All Finance tests | PARTIAL (643 pass / 146 fail due to no DB) |
| All security tests | PARTIAL (many require DB) |
| All adversarial tests | BLOCKED (DB) |
| E2E | BLOCKED (requires server + DB) |
| Lint / typecheck / build | PASS |
| Migration verification | BLOCKED (no PostgreSQL) |

## 8. Conclusion

The repo is in its strongest **honest non-DB state**. It is **not** in a state that permits a migration correctness certificate, because the DB-backed regression gate could not run. Any future migration commit must pass a PostgreSQL-backed run before it may be merged.
