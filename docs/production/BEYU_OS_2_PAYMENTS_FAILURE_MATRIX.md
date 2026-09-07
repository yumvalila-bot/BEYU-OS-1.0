# Payment Failure Matrix — BEYU OS 2.0 payments programme

Every row is a way this subsystem can be wrong or attacked, what currently detects it, what
the system does when it fires, and where the evidence lives. "DETECTED" means an automated
check exists in this repository; "UNDETECTED" is recorded as such rather than rounded up.
Nothing in this file claims a failure mode is *impossible* — only that a named control catches
it in the tested paths.

## A. Provider message integrity

| Failure mode | Detection | System behaviour when it fires | Evidence | Status |
|---|---|---|---|---|
| Signature absent | `verifyInbound` → `signatureValid=false`, detail `NO_WEBHOOK_SECRET_CONFIGURED` when the connection names no resolvable secret | `REJECTED`/409, inbox row `processing_state=REJECTED`, no transaction created | `tests/payments/payment-controls-db.test.ts`, `tests/payments/webhook-security-and-provider-honesty.test.ts` | DETECTED |
| Signature wrong / body tampered | HMAC over `${timestamp}.${body}`, constant-time compare | as above; `verification_detail` records the mismatch | `tests/payments/webhook-security-and-provider-honesty.test.ts` (tamper test) | DETECTED |
| Replay (same event id, same bytes) | `payment_webhook_events` unique on `(connection_id, provider_event_id)` + digest compare | `DUPLICATE`/200 `ALREADY_RECEIVED`, **no second transaction** | `tests/payments/payment-controls-db.test.ts`; DR drill phase 5b replay outcome | DETECTED |
| Provider reuses an event id for **different** bytes | digest mismatch on the existing row | `REJECTED`/409 `DUPLICATE_CONFLICT` + CRITICAL `payment_exceptions` row | the DR drill's `--tamper=amount` run; perf probe's first (accidental) variant also produced it | DETECTED |
| Same provider transaction id, new event | `unique(connection_id, provider_transaction_id)` | `ALREADY_INGESTED`, returns the original `transactionId` — never a second ledger row | `tests/payments/payment-controls-db.test.ts` | DETECTED |
| Clock skew beyond policy | `timestampValid=false` against `payment_policies.max_clock_skew_seconds` | accepted-with-flag or refused per policy version; recorded in `verification_detail` | `tests/payments/webhook-security-and-provider-honesty.test.ts` | DETECTED |
| Oversized payload | `payload_size_bytes` guard at 262144 B | refused before parsing | `tests/payments/webhook-security-and-provider-honesty.test.ts` | DETECTED |
| Amount as float / wrong currency / negative | `parseProviderAmount` → `INVALID_AMOUNT`, `NEGATIVE_AMOUNT`, `UNSUPPORTED_CURRENCY`, `FRACTIONAL_MINOR_UNIT`, `AMOUNT_OVERFLOW` | `PROVIDER_DATA_REFUSED`/422 + REJECTED inbox row; never coerced | `tests/payments/money-and-precision.test.ts` | DETECTED |
| Provider net contradicts its own components | `netBasis=UNRESOLVED`, gap codes `FEE_ABSENT`, `REPORTED_NET_DISAGREES_WITH_COMPONENTS` | no posting; exception raised; **never** silently re-derived | `tests/payments/money-and-precision.test.ts` | DETECTED |
| Unknown provider error surfaces as 500 with driver text | defect 3 fix in `src/lib/payments/ingest.ts`: Postgres error → 422 `PROVIDER_DATA_REFUSED` + REJECTED row | `tests/payments/` ingest suite | FIXED, regression-covered |

## B. Money and the ledger

| Failure mode | Detection | System behaviour | Evidence | Status |
|---|---|---|---|---|
| Bridge produces unbalanced entry | `INTERNAL_IMBALANCE` before any write | refused; nothing lands in `journal_lines` | `tests/payments/state-machines-and-gates.test.ts` | DETECTED |
| Fee present in provider payload but not modelled | unreported fee ⇒ **no line is created** for it | gross/net recorded with `net_basis` stating why | bridge tests | DETECTED |
| `float` arithmetic anywhere | columns are `numeric(18,0)` minor units; `money.ts` parses to integers | a fractional minor unit is refused at the boundary | `tests/payments/money-and-precision.test.ts` | DETECTED |
| Posting without the trust ladder | gate blockers `NOT_VERIFIED_BY_PROVIDER`, `TRUST_INSUFFICIENT`, `NOT_INTERNALLY_RECONCILED`, `SETTLEMENT_FAILED` | `BLOCKED` with the first blocker named; `ALREADY_POSTED` is idempotent | gate table + `tests/finance/` | DETECTED |
| `POSTED` without a real journal entry | `0028` CHECK: `accounting_status='POSTED'` requires an in-tenant `journal_entries` row with `source='PAYMENTS'` | database refuses the update | `tests/payments/state-machines-and-gates.test.ts` | DETECTED |
| Posting without an open period | `NO_OPEN_PERIOD` from `resolvePeriod` | `BLOCKED`; the demo shows `postingAttempted: false` | demo self-test output | DETECTED |
| Posting claimed then rewound | migration `0029` trigger guard on the posting claim | update aborted | `tests/payments/` (rewind guard) | DETECTED |
| Auto-post at a ceiling of 0 | policy semantics: `0` never posts, `null` is unlimited; auto-confirm only when `method!=="FUZZY" && confidence>=floor` | `HUMAN_APPROVAL_REQUIRED` | `tests/payments/governed-config-write-path.test.ts` | DETECTED |
| `CAP_POSTING` silently left enabled | `capability_activation_log` re-checked; the DR drill asserts LOCKED identical after grant-then-restore | drill fails | `/tmp/dr-payments-run5.txt` | DETECTED |
| Unknown amount treated as revenue | not representable: `net_basis='UNRESOLVED'` blocks posting | suspended for review | bridge tests | DETECTED |

## C. Authorization and tenancy

| Failure mode | Detection | System behaviour | Evidence | Status |
|---|---|---|---|---|
| Actor performs both sides of a review | `ROLE_INCOMPATIBILITY` refusal, and a `PAYMENT_REVIEW_REFUSED` audit row with `outcome=DENIED` | refused; refusal itself is auditable | `tests/payments/human-review-assurance.test.ts` | DETECTED (after defect 8 fix) |
| A blocking data-gap reviewer then accepts the risk | exception decisions now count toward the actor's role history (`ACCEPTED_RISK`→AUTHORIZER, else CHECKER) | refused | same suite | DETECTED |
| Review act applied to another tenant's row | explicit `tenantId` check on the loaded exception/match → `NOT_FOUND`, no existence disclosure | refused + `PAYMENT_REVIEW_REFUSED` audit row | same suite (defect 9) | DETECTED |
| Review/accounting reads run without RLS context | defect 5/6 fixes; the suite's static scanner refuses unscoped `db.*` calls in `src/lib/payments/review.ts` and `accounting.ts` | CI fails on reintroduction | same suite | DETECTED |
| Runtime role mutates payment controls | revoked DML on the five config tables (`scripts/setup-db-role.ts` step 4b deny-list) | `permission denied` | `tests/security/`, `payment-controls-db.test.ts` | DETECTED — **does not close P1 F-01** |
| Missing/unknown capability for an HTTP route | `guarded()` + `finance:payments.*` / `finance:settlement.manage` scopes | 403 with capability named | no `tests/api` payment route tests exist — HTTP behaviour is exercised by `scripts/payments-demo.ts` against a running server and by the static route checks in `tests/payments/governed-config-write-path.test.ts` | DETECTED |
| Elevated URL used where runtime was intended | `assertPrivilegedWriter()` in `src/lib/payments/config-write.ts` | writes refused | `tests/payments/governed-config-write-path.test.ts` | DETECTED |

## D. Configuration and schema

| Failure mode | Detection | System behaviour | Evidence | Status |
|---|---|---|---|---|
| Provider logic writes config directly | static scan of `src/` and `scripts/` for inserts/updates to config tables, `config-write.ts` excepted | test fails listing offenders | `tests/payments/governed-config-write-path.test.ts` | DETECTED |
| Mapping/account approved by nobody | `NOT NULL` `approved_by` / `approval_reference` on `payment_account_mappings` | insert refused | schema `0028` | DETECTED |
| Policy edit out of process | `upsertPolicy` is the only writer; policy version is a required, comparable string | drift is visible | `config-write.ts` | DETECTED |
| Migration drift | `npm run migrate:generate` after `migrate` must leave the tree clean; `drizzle/` count re-pinned to 30 | CI fails | ci.yml migrate + rerun steps | DETECTED |
| Fixture reset strands FK children | `removeDemoPaymentRows` enumerates children from `pg_constraint` and refuses if its own list is behind | refuses instead of orphans | defect 7 (21 orphan risk signals found and repaired) | DETECTED |
| Fixture reset destroys posted history | refuses while a `POSTED` row is in scope | refusal by design | `src/lib/payments/fixture-reset.ts` | DETECTED |

## E. Availability and operations (weakest area, stated as such)

| Failure mode | Current state | Status |
|---|---|---|
| Provider sends nothing (outage) | no scheduled reconciliation sweep exists; `UNDETERMINED` handling is in `reconcile.ts` but nothing invokes it on a timer | **UNDETECTED — needs a scheduler** |
| Webhook endpoint flooded | app rate limiting exists platform-wide; per-connection throttling and provider quota handling are not implemented | **PARTIAL** |
| Pool exhaustion under burst | measured: 25 concurrent ingests on the default 10-connection pool raise p50 from 14 ms to 192 ms; throughput plateaus near 120 events/s locally | MEASURED, not remediated |
| Restore from backup | `dr-drill.ts --payments` exercises fixture → scratch DB → grant parity → restore → replay → invariant comparison | VERIFIED LOCALLY ONLY |
| Records destroyed by tooling in production | purge/reset tools are CONFIRM-token gated and demo-scoped but not environment-gated | **UNDETECTED — see R1 in the regulatory research doc** |
| Silent provider contract change | digest/idempotency checks catch *some* shape changes; nothing detects a renamed field | **UNDETECTED** |
| A control's own probe passes for the wrong reason | defect 10: the config-write probe died on `42703` undefined column, so three of five checks "passed" without testing privileges. Nothing in the suite asserted *which* refusal was acceptable; the fix narrows the accepted SQLSTATE to `42501` and resolves the probe column from the catalog | **PARTIAL — a self-test can be green and empty; assertion strength must be reviewed, not just the colour** |

## F. What this matrix does not prove

It proves that named checks fire on the paths exercised by the tests in this repository, against
a mock provider, on a development database. It does not prove behaviour under a real provider's
error semantics, under production data volume, across a failover, or against an attacker with a
valid credential. `PRODUCTION_LAUNCH: BLOCKED` is unchanged by this file.
