# PAYMENT_BANKING_REALITY_AUDIT.md — Phase 0

**Program:** BEYU OS 2.0 — Universal Banking, Mobile Money & Payment Integration
**Phase:** 0 (REALITY AUDIT — no implementation performed in this document)
**Date:** 2026-09-06 · **Branch:** `arena/01a076da-beyu-os-1-0` @ `25744c82` (docs commit) over `main` `0eaa71de`
**Method:** measured, not narrated. Every figure below was re-derived against the live repository and a live PostgreSQL 16.14 instance during this session.

---

## 1. Canonical state re-verified (prompt values were not trusted)

| Prompt claim | Re-measured | Verdict |
|---|---|---|
| `main` = `0eaa71debb38…` | `git rev-parse origin/main` = `0eaa71debb38cb6fc1aa2d9114d5cee0ed85f391`; HEAD = `25744c82` (this program's docs commit, ahead by 1, `main` untouched) | CONFIRMED |
| PR #29 MERGED, 36 commits, 150 files, +109,393/−86 | `gh pr view 29` → `state=MERGED`, `commits=36`, `changedFiles=150`, `+109393/-86`, `mergedAt=2026-09-06T10:01:55Z` | CONFIRMED |
| 125 files / 2,466 tests / 0 failed / 0 skipped | Re-ran: **125 files / 2,466 tests, 0 failed, 0 skipped, 324.81 s, exit 0** (fresh cluster, `BEYU_TEST_BASE_URL` set so the HTTP harness hard-fails instead of skipping) | CONFIRMED |
| Production readiness `BLOCKED`; overall `PARTIAL` | Master report `docs/production/BEYU_OS_2_PRODUCTION_READINESS_MASTER_REPORT.md` §W | CONFIRMED |
| **P1: 1** | F-01 verified again in this pass (see §4) | **OPEN** |
| External certification `NOT_CERTIFIED`; real generative inference `ENVIRONMENT_LIMITED` | Live `/api/v1/ai/noelia/phase5` returns 6 × `NOT_CERTIFIED` and `REAL_GENERATIVE_INFERENCE: ENVIRONMENT_LIMITED` | CONFIRMED |

Database re-measured on a fresh cluster: **118 tables**, 44 RLS / 34 FORCE / 44 policies, **0 `SECURITY DEFINER`** of 197 routines, **0 float** money columns, `btree_gist`+`plpgsql` only, **0 `vector` columns**, 28/28 migrations in `beyu_migrations`, 38 `noelia_*` tables, 60/60 capabilities `activation_status=LOCKED`, `journal_entries` = **0 rows**, `audit_log` = 0 rows post-seed, `audit_chain_heads` = 2.

## 2. The 30 mandated inspections — what actually exists

| # | Subject | Actual, measured state |
|---|---|---|
| 1 | Finance OS architecture | **13 modules** in `src/lib/finance/` (contract, domains, epistemics, fx, intercompany, lineage, period, posting-engine, reconciliation, registry, reporting, truth, workflow) — a mature, deliberate design, not a stub |
| 2 | Ledger | `financial_periods`, `ledger_accounts` (chart of accounts: tenant, code, name, ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE, ifrs_category, parent, active), `journal_entries` (reference UNIQUE, currency, `fx_rate numeric(18,8)`, posted_by, approved_by, **reversal_of_id**, **idempotency_key**, source), `journal_lines` (`debit`/`credit numeric(18,2)`, memo, cost_centre). **Balances are never stored** — derived by `trialBalance()` |
| 3 | `CAP_POSTING` | In `governance_capability_registry` (60 rows, all LOCKED). Enforced as step **1 of 8** in `postJournal()` (`posting-engine.ts:184` → `requireCapability("CAP_POSTING")`), which throws `CapabilityLockedError` **before** RBAC, tenant, entity, structure, account and period checks |
| 4 | Accounting policy model | **No policy table exists.** Policy is represented by: capability lock + `required_decisions [P1,P6,P7,P9]` + `docs/finance/ACCOUNTING_POLICY_*` ratification registers + `financial_periods` state. Chart-of-accounts creation is documented as "an accounting-policy act (P1) and has no writer today" (`truth.ts`) |
| 5 | Transaction model | **No payment transaction exists.** `employment_events`, `enterprise_events`, `internal_event_receipts`, `noelia_*` events are the only event tables |
| 6 | Audit | `audit_log` + `audit_chain_heads`, hash-chained `sha256(prevHash|canonicalAuditPayloadV2)`, GENESIS, append-only via triggers (2 on `audit_log`), `recordAudit`/`recordAuditTx`, and **`withAuditTransaction(operation, audit, event)`** — mutation + audit + domain event in ONE transaction (`audit.ts:322`) |
| 7 | Identity | `GlobalUserID` = `users.id`, one login identity per canonical party via `users_party_uidx` (migration `0011`); `parties` is the master record for "every human, org, service, AI agent or device" |
| 8 | RBAC | `PERMISSIONS` catalogue + `ROLES` with **explicitly enumerated** permission arrays (`src/lib/constants.ts`); `HIGH_RISK_PERMISSIONS` triggers step-up; existing finance codes: `finance:ledger.read/post`, `finance:coa.manage`, `finance:period.manage`, `finance:treasury.read`, `finance:capital.*`, `finance:waterfall.*`, `finance:tax.*`, `finance:openingbalance.post`, `finance:ledger.approve` |
| 9 | ABAC | `can()` = RBAC ∧ ABAC with fail-closed clearance; `filterByClearance`; classification enum on records |
| 10–12 | Tenant / entity / country | GUC helpers `beyu_tenant_ids()`, `beyu_global_scope()`; scope in policy `USING`/`WITH CHECK`; `legal_entities` FORCE-RLS; `journal_lines` scoped through **both** parents with cross-parent tenant equality (`0021:12-28`) |
| 13 | GlobalUserID | as §7; **no second identity system exists or may be created** |
| 14 | Event infrastructure | `enterprise_events` (FORCE RLS, hash-chained, TRUNCATE-guarded), `internal_event_receipts` **inbox with `idempotency_key` PRIMARY KEY + `duplicate_count`** (migration `0019`), `publishEvent`/`publishEventTx` |
| 15 | Webhook infrastructure | **None at the control plane.** No signature-verification module, no webhook table, no `webhooks` route. The nearest analogue is `/api/v1/internal/events` using `guardedInternal()` (HS256 service token) |
| 16 | Queue / worker | Control plane: **none** (no BullMQ/Redis; `noelia_schedules`, `noelia_scheduler_offsets`, `noelia_workflows` are DB-polled tables). Health backend *does* have `sectors/health/backend/src/common/queue` with Bull + a deliberate `QUEUE BOOT BLOCKED: QUEUE_BACKEND=redis but REDIS_URL is not set` fail-closed path (observed in its test log) |
| 17 | API architecture | 45 route modules; `guarded(request,{permission,action,rateLimit,audit,databaseContext},handler)`; `apiOk`/`apiError`; envelope `{data,meta}`; `x-trace-id`/`x-correlation-id`; zod validation → 422; `PermissionCode = keyof typeof PERMISSIONS` |
| 18 | Migration mechanism | `scripts/migrate.ts` only (`drizzle-kit push` forbidden per README); ledger table `beyu_migrations` with `sha256` checksums; drift fingerprint md5 over tables/columns/constraints/indexes/**rls flags**; refuses destructive migrations against non-empty schema; **28 up, 0 down** |
| 19 | RLS | 44 enabled / 34 forced / 44 policies; runtime role is a **non-owner grantee** so ENABLE-only still binds it |
| 20 | Encryption | `scrypt` password hashing + `timingSafeEqual`; `MFA_ENCRYPTION_KEY` for MFA secrets (`decryptSecret`); HS256 service tokens; **no general field-level crypto service for payment credentials** |
| 21 | Secret handling | `.env` gitignored (`:15`); `scan-secrets.mjs` clean over 1,180 tracked files; **credential-reference pattern already used by Noelia**: `NOELIA_GENERATIVE_API_KEY_REF` stores the *name* of an env var, never the value |
| 22 | Observability | 3 `console.*` calls in `src/lib`, one structured (`api.ts:351`); no metrics endpoint, no OTel, no alerting |
| 23 | Reconciliation capability | **`src/lib/finance/reconciliation.ts` exists** — read-only, `RECONCILIATION_VERSION="reconciliation-1.0.0"`, statuses `RECONCILED/RECONCILIATION_REQUIRED/DATA_NOT_AVAILABLE/ATTRIBUTION_CONFLICT/DATA_CONFLICT/REQUIRES_AUTHORITY`, and a **`adjustmentPosted: false` field whose absence is asserted by design**; governing rules: *"NEVER SILENTLY ADJUST"* and *"AN EMPTY SOURCE IS NOT A RECONCILED SOURCE"* |
| 24 | Treasury capability | `treasury_positions` (institution, account_label, account_type OPERATING, currency, `balance`, `base_currency_balance`, as_of, classification) + `src/lib/specialist/treasury`. Classified **OBSERVED, "NOT accounting truth and must be reconciled to the ledger, never posted from"** |
| 25 | Health financial interface | Health `sectors/health/backend/src/modules/billing` + outbox → `/api/v1/internal/events`; exactly-once verified. **Health has no invoice ledger in the control plane** — AR is `canonicalTable: null` |
| 26 | Agriculture financial interface | **None — Agriculture OS does not exist** (0 tables, 0 routes) |
| 27 | Deployment model | Vercel app deploy (Production env exists with **no required reviewers, `deployment_branch_policy: null`**); Supabase = managed PostgreSQL only (no Supabase Auth, per `.env.example`); DB release pipeline `EXTERNAL_BLOCKED` (owner secret absent) |
| 28 | CI/CD | `ci.yml` 7/7 green on `main`; `db-release.yml` fails closed by design; actions pinned to SHAs |
| 29 | Testing infrastructure | Vitest (root, live-PG + live-HTTP harness `tests/helpers/http.ts` with **skip-vs-fail hardening**), Jest+PGlite/real-PG (Health), `scripts/verify.mjs`, `scripts/dr-drill.ts` |
| 30 | Production blockers | From the master report: P1 F-01; gates 9, 12, 21, 22, 23, 25 failed; 19, 20, 24, 26–30 blocked |

## 3. Reusable primitives — implementation MUST compose these, not clone them

| Need in this program | Existing primitive | File |
|---|---|---|
| Trust / evidential quality of a figure | `EPISTEMIC_CLASS` (13 classes) + `canPromote`/**`assertPromotion`** where *"nothing may become POSTED except by genuine posting of an already-factual figure"* | `src/lib/finance/epistemics.ts` |
| Payment lifecycle + separation of duties | `WORKFLOW_STATE` `DRAFT→REVIEW→APPROVAL→AUTHORIZATION→EXECUTION→POSTING→SETTLEMENT→RECONCILIATION→CLOSE` (+`REJECTED/CANCELLED`), default-deny `WORKFLOW_TRANSITIONS`, `EXECUTION_STATES`, `CONTROL_ROLE` MAKER/CHECKER/AUTHORIZER/EXECUTOR, `evaluateWorkflowTransition`, `checkRoleSeparation` | `src/lib/finance/workflow.ts` |
| "Who may write this table" | `FINANCIAL_TRUTH` registry + `soleWriterOf(table)` + `mayWrite(module,table)`; **AR and AP are already domains with `canonicalTable: null`** | `src/lib/finance/truth.ts` |
| Multi-currency / FX | `FX_ENGINE_VERSION`, `FX_SOURCE_KIND`, `CURRENCY_ROLE` TRANSACTION/FUNCTIONAL/REPORTING, `resolveRate`, `convert`, `scanImpliedRates`, and **`deriveRateFromBalances(): never`** — a compile-time prohibition on the exact shortcut this program must also forbid | `src/lib/finance/fx.ts` |
| Provenance / weakest-link | `LINEAGE_STAGE`, `buildLineage`, `assertNotCanonical`, `isCanonicalSource` | `src/lib/finance/lineage.ts` |
| Ledger write | `postJournal(principal, input)` — 8 mandatory enforcement steps, integer minor units, `Number.isSafeInteger` guard, structural invariants, period lock, idempotency check, entry+lines+audit+event in ONE transaction | `src/lib/finance/posting-engine.ts` |
| Atomic audit + event | `withAuditTransaction(operation, audit, event)` | `src/lib/finance/../audit.ts:322` |
| HTTP idempotency | `claimIdempotencyKey` / `completeIdempotencyKey` / `releaseIdempotencyKey`, `idempotencyScope`, `hashRequest`, 24 h TTL | `src/lib/idempotency.ts` |
| Durable inbox dedupe | `internal_event_receipts` pattern: key PK + `duplicate_count` | migration `0019` |
| Capability gating | `requireCapability("CAP_…")` | `src/lib/governance/…` |
| Credential indirection | `*_API_KEY_REF` = the *name* of an env var, value never logged/persisted | `src/lib/noelia/generative-config.ts` |

**Consequence:** this program adds a payment *integration and verification* layer plus the missing **AR/AP substrate**, and must not create a second ledger, a second workflow engine, a second FX engine, a second identity system or a second reconciliation philosophy.

## 4. Pre-existing P1 — preserved, and why it constrains this build

F-01 (from the master report, re-verified this session): `scripts/setup-db-role.ts:109` grants the runtime role `select, insert, update, delete on all tables in schema public` (and `:116` extends it to future tables), so as `beyu_runtime`: `UPDATE governance_capability_registry` → **ALLOWED (60 rows)**; `os_registry`, `users`, `role_assignments` → ALLOWED; `DELETE governance_decision_registry` → ALLOWED; a real `CAP_POSTING → ACTIVATED` flip **succeeded** and was restored (registry re-verified 60/60 `LOCKED`). Those tables have `relrowsecurity=false` and 0 triggers; the only 9 user triggers are on `audit_log`(2), `enterprise_events`(2), `journal_entries`(2), `journal_lines`(3).

**Status: NOT remediated. Preserved as P1. This program does not claim it resolved.**

Three binding constraints follow for payments:
1. **Payment configuration and authority surfaces must not inherit that openness.** Design response: payment *config* tables (`payment_providers`, `provider_connections`, `payment_accounts`, `account_mappings`, `payment_policies`) are granted **SELECT only** to the runtime role — INSERT/UPDATE/DELETE revoked — and written exclusively through a governed CLI using the admin DSN. A test will *prove* the runtime role cannot mutate them, so the payment controls are strictly better-protected than the governance tables they sit next to.
2. **No accounting authority is added.** Posting continues to flow only through `postJournal()` and stays behind `CAP_POSTING = LOCKED`. Payment ingestion therefore reaches `ACCOUNTING_READY` and stops, exactly as the platform's own ratification process requires.
3. **Residual risk is documented, not hidden:** while F-01 stands, "capability lock" is a process control rather than a database control. Any payment-side assurance statement about "no unauthorled posting" is therefore conditioned on F-01. This is stated in the final report rather than smoothed over.

## 5. Gap analysis (what must be built)

| Capability | Today | Required |
|---|---|---|
| Provider registry / connections / credentials indirection | absent | new, config-governed, runtime read-only |
| Webhook ingestion + signature/timestamp/replay verification | absent | new; public endpoint authenticated by provider signature, **never** by session |
| Durable per-connection event inbox with exactly-once semantics | pattern exists for internal events only | new table reusing the `duplicate_count` pattern, unique on (connection, provider_event_id) |
| Canonical payment transaction + trust/state machine | absent | new, composed on `WORKFLOW_STATE` semantics |
| State-transition audit trail | absent | new append-only table + `withAuditTransaction` |
| Party / account / entity resolution from *registration*, not payload | absent | new; tenant/entity/country derived from the connection |
| Invoice / AR / AP substrate | `canonicalTable: null` in `truth.ts` | new minimal AR substrate for matching, without inventing accounting policy |
| Deterministic reconciliation with confidence + explainability | philosophy exists (`reconciliation.ts`) | new matcher that reuses its status vocabulary and its "never silently adjust" rule |
| Exceptions + manual review | approvals table exists | new exception table, review workflow on `CONTROL_ROLE` |
| Accounting bridge | `postJournal` only | new mapping+policy layer that **stops** on missing policy |
| Settlement + clearing | absent | new tables; treasury stays OBSERVED, never posted-from |
| Fees / gross-net separation | absent | new, integer minor units |
| Multi-currency | `fx.ts` exists | reuse; `deriveRateFromBalances()` stays unreachable |
| Risk hooks | absent | deterministic only; no "fraud engine" claim |
| Least privilege for payment authority | — | new revocation + proof test |
| Docs/runbooks for payments | absent | new |

## 6. Explicit prohibitions carried forward into the design

`SMS → ledger` · `webhook → journal entry` · `provider → direct DB mutation` · amount+timestamp+name as sole uniqueness · provider-specific logic inside Finance OS · stored/derived payment balances as truth · sector ledgers · unknown transactions auto-classified as revenue · fuzzy match as unquestioned truth · invented accounting policy · mock verified == production verified · "provider integrated" where only an adapter exists · activation because an adapter exists · AI output as authorization · a second identity or ledger system.

## 7. Provider reality (Tanzania) — asserted only where researched

§12 forbids assuming any provider has a usable public API. Each provider's status is therefore recorded in `docs/audit/PAYMENT_PROVIDER_RESEARCH_TANZANIA.md` (written later in the programme, and the file that now carries this) with its own `API availability / sandbox / auth mechanism / webhook model / settlement model / commercial / regulatory / credential` fields and **cited sources**, and every one is expected to land at `PRODUCTION_ACTIVATION = BLOCKED_EXTERNAL_DEPENDENCY`. `REAL_PROVIDER_INTEGRATION = BLOCKED_EXTERNAL_DEPENDENCY` in this environment: **no credentials exist here and none will be invented.**

## 8. Verdict

The repository has **no payment capability whatsoever** (0 payment tables, 0 webhook routes, 0 provider code) but has an unusually disciplined financial core — 8-step posting, epistemic classes, default-deny workflow, derived-only balances, never-silently-adjust reconciliation, and a canonical-truth registry that already reserves `AR`/`AP` as domains awaiting substrate. The correct program is therefore a **provider-neutral ingestion/verification/reconciliation layer that feeds the existing ledger**, with the missing AR substrate, not a parallel payments stack. Phase 1 may begin.
