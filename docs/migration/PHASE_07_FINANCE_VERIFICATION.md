# PHASE 07 — FINANCE / CAP_POSTING / LEDGER VERIFICATION

Date: 2026-09-05
Status: **VERIFIED (real PostgreSQL 16, clean database)**

## Principle

BEYU-OS-1.0 Finance/CAP_POSTING remains authoritative. No finance source was changed in this session. The previous migration decided `KEEP_1_0`; this gate proves that decision is currently green against a real database.

## Full finance suite (real PG)

COMMAND:
`npx vitest run tests/finance` (with `BEYU_TEST_BASE_URL`)

RESULT:
Finance suites in targeted run: all pass. Specifically:

| Suite | Tests |
|---|---|
| `capital-governance.test.ts` | 26/26 |
| `capital-governance-http.test.ts` | 14/14 |
| `ledger-integrity.test.ts` | 18/18 |
| `ledger-write-authority.test.ts` | 6/6 |
| `ledger-control-durability.test.ts` | 6/6 |
| `journal-scope-integrity.test.ts` | 6/6 |
| `accounting-substrate-boundary.test.ts` | 7/7 |
| `posting-engine.test.ts` | 21/21 |
| `finance-os.test.ts` | 95/95 |
| `finance-os-rails.test.ts` | 68/68 |
| `finance-os-domains.test.ts` | 72/72 |
| `finance-os-engineering-completeness.test.ts` | 26/26 |
| `finance-api-routes.test.ts` | 4/4 |

STATUS: PASS

## CAP_POSTING

CAP_POSTING is verified by `capital-governance.test.ts` and `capital-governance-http.test.ts` (policy evaluation, authority determination, approval, posting, ledger effect, audit, reconciliation, atomicity). In the full root regression these and the related `authority-firewall` suites passed.

STATUS: PASS

## Ledger invariants

- Double entry, debit=credit, immutability, no UPDATE/DELETE of posted entries, reversal-only corrections, transaction atomicity and idempotency are exercised by `ledger-integrity`, `ledger-write-authority`, `ledger-control-durability` and `ledger-rls-isolation`.
- All passed against real PostgreSQL.

STATUS: PASS

## Conclusion

Finance, ledger and CAP_POSTING are **VERIFIED** in this environment. No regression, no weakening, no code change.
