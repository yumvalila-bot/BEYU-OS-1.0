# Payment Implementation Status — BEYU OS 2.0 payments programme

Compiled 2026-09-06. Each row carries **independent** status lines; a component is not promoted
because a neighbouring one is green, and `VERIFIED_LOCAL` never means production.

Vocabulary: `IMPLEMENTED` (code exists) · `TESTED_LOCAL` (automated checks pass on this machine)
· `VERIFIED_LOCAL` (a specific artifact proves it locally) · `ENVIRONMENT_LIMITED` (blocked by
this sandbox, not by design) · `NOT_INTEGRATED` · `NOT_CONFIGURED` · `BLOCKED_EXTERNAL_DEPENDENCY`
· `LEGAL_REVIEW_REQUIRED` · `OPEN` (unresolved finding) · `NOT_ESTABLISHED` (unknown, recorded
as unknown).

## 1. Platform-wide status lines

| Line | Status | Basis |
|---|---|---|
| Technical readiness of the payment subsystem | **PARTIAL — VERIFIED_LOCAL against a mock provider only** | E1–E12 of `BEYU_OS_2_PAYMENTS_EVIDENCE_MATRIX.md` |
| Regulatory authorization (Bank of Tanzania) | **NONE — NOT_APPLIED** | Licensing Regs 2015 r.3; `license.status = NOT_APPLIED` |
| Legal licensing / corporate preconditions | **NOT_ESTABLISHED, `LEGAL_REVIEW_REQUIRED`** | regulatory research §1–§2 |
| Real provider end-to-end | **BLOCKED_EXTERNAL_DEPENDENCY** (`REAL_PROVIDER_E2E = BLOCKED_NOT_ATTEMPTED`) | one adapter (`mock.ts`), zero credentials |
| Production launch | **BLOCKED** | unchanged; payment work does not move a platform gate |
| Baseline findings | **P0 0 · P1 1 (F-01 OPEN) · P2 11 · P3 8** — 15 gates PASSED / 7 FAILED / 8 BLOCKED | `docs/production/BEYU_OS_2_CURRENT_REALITY_BASELINE.md` |

## 2. Component status

| Component | Implementation | Tests | Verification | Independent blockers |
|---|---|---|---|---|
| Schema (`0028`, `0029`; 14 payment tables) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL (132 tables, 70 payment CHECKs, 14/14 RLS enabled+forced) | none in-domain; retention floor still absent (R1) |
| Provider adapter contract (`providers/adapter.ts`, 10 facts per provider) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL | `NOT_INTEGRATED` for every real rail |
| Mock provider (`providers/mock.ts`) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL | by design `PRODUCTION_VERIFIED` unreachable; recorded in its own `blocked_reason` |
| Amount parsing (`money.ts`) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL | provider decimal conventions unverified (no provider) |
| Webhook ingest + inbox (`ingest.ts`) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL | `ENVIRONMENT_LIMITED` — HTTP-level asserts run in CI, skipped locally without a live server |
| Signature/timestamp/replay verification (`providers/hmac.ts`) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL | real schemes `NOT_ESTABLISHED` |
| Matching (`matching.ts`) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL | fuzzy cap 0.750 + reviewer≠proposer; no production corpus tested |
| Exception + risk model (`exceptions.ts`, `risk.ts`) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL | no AML case table, no screening source (`NOT_INTEGRATED`); regulatory research R5 |
| Review decisions + SoD (`review.ts`) | IMPLEMENTED (defects 1, 5, 8, 9 fixed) | TESTED_LOCAL (10-test assurance suite) | VERIFIED_LOCAL | real org role tables `NOT_CONFIGURED`; `CONFIDENCE_FLOOR` label misnomer recorded |
| Accounting bridge + draft (`accounting.ts`) | IMPLEMENTED (defect 6 fixed) | TESTED_LOCAL | VERIFIED_LOCAL | `POSTED` requires `CAP_POSTING` → LOCKED outside tests |
| Posting engine reuse (`src/lib/finance/posting-engine.ts`) | IMPLEMENTED (unchanged by this programme) | TESTED_LOCAL | VERIFIED_LOCAL | platform `accounting` gate stays FAILED/OPEN per baseline; Finance OS controls not bypassed |
| Settlement batches + items (`settlement.ts`) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL | provider settlement files `NOT_INTEGRATED`; `AUTOMATIC_DAILY` vs `MANUAL_BATCH` `NOT_ESTABLISHED` per rail |
| Reconciliation sweep (`reconcile.ts`, `resolve.ts`) | IMPLEMENTED | TESTED_LOCAL | TESTED_LOCAL only | **no scheduler invokes it** — PARTIAL (failure matrix E) |
| Read model (`readmodel.ts`) + routes (`/api/v1/payments/*`) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL | HTTP assertions `ENVIRONMENT_LIMITED` locally |
| RBAC scopes (`finance:payments.read/ingest/review/configure`, `finance:settlement.manage`) | IMPLEMENTED | TESTED_LOCAL | VERIFIED_LOCAL | tenant role assignments in a real org `NOT_CONFIGURED` |
| Governed config writer (`config-write.ts` + `scripts/payment-config.ts`) | IMPLEMENTED | TESTED_LOCAL (static scan refuses other writers) | VERIFIED_LOCAL | evidence field is prose: `OPEN` limitation, see research doc §5 |
| Privilege separation for payment controls | IMPLEMENTED (domain-scoped) | TESTED_LOCAL | VERIFIED_LOCAL | **F-01 OPEN**: blanket runtime DML persists; mitigation ≠ closure |
| Fixture reset (`fixture-reset.ts`) | IMPLEMENTED (defect 7 fixed) | TESTED_LOCAL | VERIFIED_LOCAL | must not be run against production data — proposed environment gate `OPEN` |
| DR drill (`scripts/dr-drill.ts --payments`, fixture + replay helpers) | IMPLEMENTED | — | VERIFIED_LOCAL (transcript, exit 0) | **not** a production recovery test; `pg_dump`/`psql` absent in sandbox so the dump path is a `pg`-based substitute, recorded |
| Performance probe (`scripts/payments-perf-probe.ts`) | IMPLEMENTED | — | VERIFIED_LOCAL (artifact committed) | not a capacity statement; pool-bounded at concurrency 25 |
| Demo + self-test (`scripts/payments-demo.ts`, `src/lib/payments/selftest.ts`) | IMPLEMENTED (defect 10 fixed) | — | VERIFIED_LOCAL (13 checks: 11 PASS, `posting-authority` BLOCKED by `CAP_POSTING`, `provider-status` 9 assessed / 0 live claims / 0 violations) | never posts; `ENVIRONMENT_LIMITED` for a real settlement |
| Regulatory research (BoT) | DOCUMENTED | — | primary text read for 2 instruments | `LEGAL_REVIEW_REQUIRED` throughout; 2015-vs-2021 conflict unresolved |
| Provider research (TZ rails) | DOCUMENTED | — | sources labelled PRIMARY/SECONDARY/NOT_ESTABLISHED | no operator confirmed anything; MTN MoMo TZ `NOT_ESTABLISHED`; Tigo Pesa renamed **Mixx by Yas** |
| Payer/customer identity resolution | IMPLEMENTED (registry + SUSPENSE_REVIEW) | TESTED_LOCAL | VERIFIED_LOCAL | no production registry exists; `NOT_CONFIGURED` |
| Multi-currency / FX columns | IMPLEMENTED as storage only (`settlement_currency`, `fx_rate`, `fx_source_kind`) | TESTED_LOCAL | NOT_ESTABLISHED | **no FX source is wired**; posting a non-TZS payment is not supported end-to-end |
| Personal-data treatment (PDPA) | NOT_IMPLEMENTED as a control set | — | — | `LEGAL_REVIEW_REQUIRED`; free-text columns carry payer data; residency rule r.42 unmet by any cloud deployment |

## 3. Findings register touched by this phase

| ID | Title | Priority | State after this phase |
|---|---|---|---|
| **F-01 (P1)** | runtime role holds blanket DML on `public` tables; payment controls protected only by a domain-scoped revocation | P1 | **OPEN** — deliberately not marked resolved |
| **F-P2-12** | retention/deletion of payment records unenforced | P2 | **OPEN, evidence strengthened**: Licensing Regs 2015 r.41 requires ≥10 years and no retention column exists on `payment_transactions` or `payment_webhook_events` (measured 48 and 23 columns) |
| **F-NEW-1a** | the provider ledger double-lists `TIGO_PESA_TZ` and `MIXX_YAS_TZ` as two rails although research establishes one rebranded operator | P2 (new) | **OPEN** — owner: payments lead; not remediated (deleting a code historical rows may reference is worse than the double count) |
| **F-NEW-1b** | the ledger's evidence prose still says no provider documentation was retrieved, which this phase's research has overtaken | P3 (new) | **OPEN** — statuses correctly remain `UNVERIFIED`; only the sentence needs a pointer to `docs/audit/PAYMENT_PROVIDER_RESEARCH_TANZANIA.md` |
| **Defect 10** | the self-test's config-write probe named a column (`updated_at`) that three of the five configuration tables do not have; Postgres reported `42703` undefined_column *before* the privilege check, and the check passed on "refused before any row changed" | P2 → **FIXED in this phase** | probe column now resolved from `information_schema.columns` (prefers `id`), and anything other than `42501` **fails**; all five checks now report genuine privilege denials |
| Defects 1–9 | see `BEYU_OS_2_PAYMENTS_TEST_EVIDENCE.md` §2 | — | **FIXED + regression-covered** in the payment domain; none of them changes a platform finding |
| R1–R4 | regulatory research engineering actions | P2 (R1 proposed P1 before a production tenant) | **OPEN, not implemented** — recorded so they are not mistaken for work done |

## 4. Explicitly not claimed

No provider is supported. No licence is held. No production environment was contacted,
configured or verified. No RPO/RTO exists for this subsystem (the drill measured a local restore,
not a recovery objective). No performance figure here is a capacity number. No platform gate was
closed by payment work, and nothing in this document should be quoted as production readiness.
