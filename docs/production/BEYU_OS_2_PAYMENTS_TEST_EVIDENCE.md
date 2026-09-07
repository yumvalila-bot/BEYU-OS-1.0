# Payment Test Evidence and Defect Register — BEYU OS 2.0 payments programme

**Scope:** what the payment subsystem's tests actually assert, the nine defects they found,
and one new record-keeping finding. Written 2026-09-06 from the repository and the development
database, not from the phase notes: each "measured" claim below was re-checked against
`information_schema`, the source, or a test run in this session.

## 1. Inventory (as re-measured in this session)

| Location | Files | Tests | Character |
|---|---|---|---|
| `tests/payments/` | 6 | 70 | DB-backed + static scans: ingest/idempotency, webhook security, money & net, accounting/posting invariants, controls & RLS scoping, governed config write path, **human-review assurance (10, added this phase)** |
| `tests/finance/` | (existing) | — | ledger/Finance OS contract, accounting-substrate boundary, payments accounting bridge |
| `tests/security/`, `tests/api/` | (existing) | — | privilege audits; HTTP route contracts. `BEYU_TEST_BASE_URL` must point at a live server for the HTTP-level tests to run; on the final gate run it was reachable, so those tests executed (0 skipped) |
| Combined local run of the four payment-relevant directories | 37 | **615 passed / 615** | green before the final full-suite gate |
| Full repository suite | 131 | 131 files / 2536 tests, all passed (0 failed, 0 skipped), 357.08 s — exit 0 | see §5 for the gate transcript summary |

Reproduce with:

    set -a && . ./.env && set +a
    npx vitest run tests/payments                       # 70
    npx vitest run tests/payments tests/finance tests/security tests/api   # 615
    npm run typecheck && npm run lint && npx vitest run # the gate CI re-runs

## 2. Defects found by building this subsystem — all ten are real, none was invented for a report

| # | Defect | How it was found | Fix | Regression coverage |
|---|---|---|---|---|
| 1 | `historyFor()` in `src/lib/payments/review.ts` passed an `asc()` fragment into `and()`, producing invalid SQL — **every** review-history read 500'd | the review suite's happy path | correct fragment composition | `tests/payments/human-review-assurance.test.ts` |
| 2 | the mock provider's self-contradictory net (net ≠ gross − fee − tax) crashed the net-tie computation | money tests | contradictory provider numbers are recorded as `net_basis = UNRESOLVED`, never repaired silently | money/net suite |
| 3 | `ingest.ts` let a driver error escape as an HTTP 500, leaking SQL text | error-path test | mapped to 422 `PROVIDER_DATA_REFUSED` plus a REJECTED inbox row so the attempt is still visible | ingest suite |
| 4 | the posting claim could be rewound (`accounting_status` edited backwards) | invariant probe | migration `0029` trigger guard | accounting/posting invariant test |
| 5 | `review.ts` read rows with **no tenant context at all** — invisible under RLS unless the connection was privileged | the assurance test's static scan + a live cross-tenant probe | reads wrapped in `withDatabaseRlsContext([tenantId], false, …)` (`reviewQueue`, `decideMatch`/`decideException` lookups) | assurance suite |
| 6 | `accounting.ts` did the same for draft context (`loadTransactionForDraft`, `resolvePeriod`, `loadDraftContext`) | same scan | helpers self-scope (call-site wrapper removed so the scanner does not flag the helper body while a caller looks protected) | same suite |
| 7 | `src/lib/payments/fixture-reset.ts` deleted parents with triggers disabled, stranding FK children — **21 orphan `payment_risk_signals` rows were found in the development database** | post-drill residue query | `removeDemoPaymentRows` now enumerates children from `pg_constraint`, deletes in FK order, and refuses when its list is behind the schema; orphans repaired via `--repair-orphans` | reset coverage in the payments suite |
| 8 | an exception *decision* was invisible to separation of duties: the reviewer who closed a blocking data gap could then accept the risk on the same payment | writing the SoD test | `historyFor()` now unions the axis trail with closed `payment_exceptions` decisions (`ACCEPTED_RISK` → AUTHORIZER, otherwise CHECKER) | assurance suite |
| 9 | a review act could be applied to **another tenant's** exception/match when the caller held a privileged handle | cross-tenant probe | explicit ownership check before mutation → `NOT_FOUND` with no existence disclosure; refusal audited as `PAYMENT_REVIEW_REFUSED` / `outcome = DENIED` | assurance suite |

Two properties worth naming, because they were design decisions under pressure rather than
accidents:

- **A refusal is recorded.** Defects 8 and 9 refuse, and `recordReviewDenial()` writes the
  refusal to `audit_log`. The audit write is wrapped so that a failure to log cannot convert a
  control refusal into an outage.
- **Scoping lives in the helper, not the call site.** Wrapping a caller while leaving the helper
  unscoped keeps the scan green and the bug alive; that variant was tried and rejected here.

| 10 | the self-test's configuration-write probe (`src/lib/payments/selftest.ts`) issued `update <table> set updated_at = updated_at`; three of the five configuration tables have no `updated_at`, so Postgres failed the statement with `42703` **before** evaluating privileges, and the check reported PASS while measuring nothing about enforcement | re-reading the fresh demo transcript after another fix in this session, where three of five checks said "refused before any row changed (42703)" | probe column resolved per table from `information_schema.columns` (preferring `id`), so no column name is assumed; and only `42501` / permission-denied now passes — any other SQLSTATE **fails** with remediation text naming the trap | the demo self-test output: all five now `refused by privilege revocation … SQLSTATE 42501 permission denied` |

**How defect 10 was found matters.** The gate was green on the first pass *except* for the
governed-config scan, and the numbers in the demo transcript were read rather than skimmed. A test
that passes because its probe crashed for an unrelated reason is the worst kind of green, and this
one sat in the tree across several phases until an unrelated edit forced a fresh look.

## 3. Deliberate non-fixes and honest blemishes

| Item | State | Why it is left that way |
|---|---|---|
| The short-resolution refusal returns code `CONFIDENCE_FLOOR` | **mislabelled vocabulary**, left in place | changing an HTTP contract's code string for cosmetics churns consumers; recorded instead so nobody mistakes it for a bug they should silently fix |
| `review.ts` refuses to delete an exception when closing it | by design | a closed exception must remain evidence (Licensing Regs 2015 r.40/r.41 make the audit trail a regulatory expectation, not a preference) |
| Fixture reset keeps refusing while a `POSTED` row is in scope | by design | a reset that can erase posted history is not a reset tool, it is a records-destruction tool |
| `payment_providers` accepts `PRODUCTION_VERIFIED` on a ≥10-character free-text evidence string | **accepted limitation** | `upsertProvider` and the `payment_providers_prod_needs_approval` CHECK stop empty claims, not fabricated prose. Making a production claim *impossible* requires the evidence field to reference an approvals row. Proposed; not built — it changes the governance model |
| The test `db` handle is the privileged role and therefore bypasses RLS | known asymmetry | it is exactly why defect 9 was fixed in the library: a test that "passes" through a superuser connection proves the module's own check, never the policy |
| `payment_transaction_states` has no `detail` column; `payment_exceptions` has no `decision` column | schema fact | probed during test writing; recorded so no one re-invents them while hunting for where a refusal reason lives |

## 4. F-NEW-1 — assessment records with no durable home (new this phase)

Eight Tanzanian providers were assessed in an earlier phase and stored as `payment_providers`
rows. A fixture sweep removed them; a restore would have done the same. The assessment now
exists only as `docs/audit/PAYMENT_PROVIDER_RESEARCH_TANZANIA.md`. Priority **P2** (records &
auditability). **Not remediated here.** Owner: payments lead + records.

## 4b. The gate caught this phase's own tooling

The first full run failed one test, and the defect was in new code from this phase:
`scripts/payments-perf-probe.ts` tore down its own policy with a raw
`delete from public.payment_policies`, which `tests/payments/governed-config-write-path.test.ts`
scans for across `src/` and `scripts/`. The fix removed the probe's configuration writes entirely —
it now reads whichever sandbox-demo policy is in force and prints it in its report — rather than
adding an exemption to the scan. Worth keeping in the record, because it is the control working on
its own author's tooling.

## 5. Gate transcript (this session)

    typecheck exit=0
    lint      exit=0
    vitest    131 files / 2536 tests, all passed (0 failed, 0 skipped), 357.08 s — exit 0
    build     exit 0 — `Compiled successfully`, the first successful `npm run build` observed on this tree in this session
    secrets   exit 0 — "Secret scan clean: scanned 1236 tracked files. No literal credentials found."
    audit     exit 0 (production dependencies, critical threshold)
    migrations: 30 applied, `drizzle-kit generate` produced no drift, seed/build order as in ci.yml

## 6. What this file is not

It is not a claim of correctness: it is a list of checks that currently pass, of the defects
those checks caught, and of the places where the honest answer is "not verified". A green suite
against a mock provider on a development database does not license, integrate or deploy
anything. `PRODUCTION_LAUNCH: BLOCKED`.
