# PAYMENT_IMPLEMENTATION_PLAN.md — Phase 0 deliverable

**Scope:** add a Universal Banking / Mobile Money / Payment integration layer to BEYU OS 2.0 **without replacing or weakening Finance OS**. Phases follow §50's mandated order; nothing was reordered.

## Architecture (one paragraph)

Providers are integrated through capability-gated adapters whose payloads enter a **public, signature-authenticated webhook endpoint**, are verified, deduplicated durably, normalized, and resolved to canonical parties/accounts/tenants/legal entities **from registration data**. That produces a `payment_transactions` row in a default-deny state machine. A deterministic matcher proposes AR/AP reconciliation with confidence and evidence; only a human with a distinct control role can raise trust. A policy-driven accounting bridge converts a fully verified transaction into `PostJournalInput` and calls `postJournal()` — the single accounting door — which remains gated by `CAP_POSTING`. Settlement files, fees, gross/net separation, multi-currency and reversal handling sit on the same spine. Every state change is one `withAuditTransaction`: mutation + audit row + governed domain event atomically.

## Data model (all additive, migration `0028_payment_banking_core.sql`)

**Config — runtime role SELECT-only (INSERT/UPDATE/DELETE revoked), written by `scripts/payment-config.ts` under the admin DSN:**
`payment_providers` (kind, capabilities, status per §58's ten fields) · `payment_provider_connections` (tenant, legal entity, country, base URL, auth scheme, `credential_ref`/`webhook_secret_ref` = **env var names, never values**, sandbox flag, activation state) · `payment_accounts` (institution account / wallet / till / merchant code, currency) · `payment_account_mappings` (account → `ledger_accounts` for RECEIVABLE/CLEARING/FEE/LIABILITY roles — the accounting policy surface) · `payment_policies` (auto-post ceiling, confidence floor, per-transaction and per-day limits, approval requirement, match ruleset version).

**Transactional — runtime writable, RLS ENABLE+FORCE, tenant + entity scoped:**
`payment_webhook_events` (inbox: unique on (connection, provider_event_id), payload digest not payload, verification outcome, attempt count) · `payment_transactions` (canonical; trust/verification, reconciliation, settlement and accounting status are **four separate columns**, never merged; amounts integer minor units in code, `numeric(18,2)` in storage matching `journal_lines`; idempotency key; unique on (connection, provider_transaction_id)) · `payment_transaction_states` (append-only transition trail with actor, reason, correlation, policy version) · `payment_matches` (transaction ↔ AR/AP target, method, confidence, evidence, reviewer) · `payment_exceptions` (code, severity, status, resolution, reviewer) · `payment_settlements` + `payment_settlement_items` · `payment_corrections` (REFUND/REVERSAL/CHARGEBACK/DISPUTE against the original) · `payment_risk_signals` (deterministic findings).

**Deliberately not created:** a balances table (derived, per platform law), a payment ledger (only `journal_entries`), a payment approval table (`approvals` + `CONTROL_ROLE` already exist), a payment queue duplicating `enterprise_events`, a second identity (`GlobalUserID`), provider credential storage (env references only).

## Modules (`src/lib/payments/`)

`money.ts` (integer minor units, currency exponents, safe-integer guard, TZS=0 dp) · `domain.ts` (enums + pure state machine, default deny) · `adapters/adapter.ts` (interface + `PROVIDER_STATUS` ten fields + capability registry) · `adapters/mock-provider.ts` (deterministic sandbox, signs with the fixture secret, **can never be `PRODUCTION_VERIFIED`**) · `adapters/index.ts` (registry; nothing enabled implicitly) · `webhook-verify.ts` (HMAC/Ed25519-ready verification, timestamp tolerance, replay rejection, size limit) · `normalize.ts` (payload → canonical, per-provider parser, unmapped fields preserved as `provider_metadata`) · `resolve.ts` (party/account/entity resolution from registration) · `ingest.ts` (the pipeline, one transaction) · `match.ts` (deterministic rules, confidence, evidence, manual-review ceiling) · `reconcile.ts` (status vocabulary reused from `src/lib/finance/reconciliation.ts`; never silently adjusts) · `accounting.ts` (policy + mapping → `PostJournalInput`; **missing policy ⇒ exception, no posting**) · `settlement.ts` · `risk.ts` · `provider-status.ts` (the per-provider ten-field ledger, populated from research) · `config-store.ts` (read side for config; writes only via CLI).

## API surface

`POST /api/v1/payments/webhook/[provider]` — public, no session; authenticates by provider signature + registered connection; 401/403 on failure; always audits; returns provider-appropriate acknowledgement; never reveals which connection failed.
`GET /api/v1/payments/transactions` · `GET /api/v1/payments/transactions/[id]` (RLS-scoped reads) · `POST /api/v1/payments/transactions/[id]/review` (MAKER/CHECKER) · `POST /api/v1/payments/reconcile` · `POST /api/v1/payments/accounting/prepare` · `GET /api/v1/payments/providers/status` · `GET /api/v1/payments/settlements`.

New permissions (added to `PERMISSIONS`, granted explicitly — `ROLES` arrays are enumerated, so **no auto-grant**, per the A-06-1 finding): `finance:payments.read`, `finance:payments.ingest`, `finance:payments.review`, `finance:payments.authorize`, `finance:payments.configure`, `finance:settlement.manage`. Payout authorization is added to `HIGH_RISK_PERMISSIONS` and therefore must be held by at least one role or `tests/authorization/rbac-audit.test.ts` fails by design.

## Phase plan (order fixed by §50)

1. **Foundation** — migration, money/type layer, trust model, config store, revocations, `truth.ts` + `FINANCE_DOMAIN` registration.
2. **Ingestion** — webhook endpoint, verification, dedupe, normalization, resolution, state machine, audit+event.
3. **Reconciliation** — AR/AP substrate, deterministic matcher, confidence, exceptions, manual review, multi-currency, fee/gross-net.
4. **Accounting** — policy + account mappings → `postJournal()`; CAP-gated; reversal support; period-close interaction.
5. **Adapters** — mock/sandbox provider, contract test suite for the interface, per-provider spec docs. **No adapter is enabled by code presence.**
6. **Settlement** — settlement ingestion, clearing reconciliation, treasury OBSERVED-only, settlement fees.
7. **Initiation** (payout) — design + state machine + approval chain; **execution blocked** without credentials and without `CAP_POSTING`; nothing is faked.
8. **Risk** — deterministic signal set, limits, velocity, duplicate-amount detection.
9. **Assurance** — full regression, adversarial matrix, forensic citation pass, evidence files.

## Test strategy

Per-phase unit + integration (`vitest`, live PG under the runtime role so RLS/revocations are actually exercised) + HTTP tests through `tests/helpers/http.ts` (so `BEYU_TEST_BASE_URL` unset ⇒ hard fail, never a silent skip) + the §51 adversarial matrix + deterministic end-to-end demo (`TZS 250,000` receipt) + 20 failure/edge demos. The P1-related proof test asserts the runtime role **cannot** mutate payment config.

## Regression and safety

Additive only; `npm test`, `npm run typecheck`, `npm run lint`, `node scripts/verify.mjs`, 28→29 migration idempotency/drift, and the Health suite stay green. `CAP_POSTING` is never activated to make a test pass (grant-then-restore only, and only where an existing test already does that). Commits are scoped to this program's files so the prior program's uncommitted work is neither committed nor reverted.
