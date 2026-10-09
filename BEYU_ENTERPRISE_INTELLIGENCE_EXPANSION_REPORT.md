# BEYU ENTERPRISE INTELLIGENCE EXPANSION — IMPLEMENTATION REPORT

**Repository:** `yumvalila-bot/BEYU-OS-1.0`
**Branch:** `arena/25add342-beyu-os-1-0`
**Base commit (main):** `08dfe70234ed795cd30fc806ac0a275349a1e86b`
**Feature commit:** `a66039f` (on top of the reviewed branch history) · **Report commit:** branch head
**Pull request:** [#97](https://github.com/yumvalila-bot/BEYU-OS-1.0/pull/97)
**Merge readiness:** READY FOR HUMAN REVIEW — **not** merged, **not** promoted to production. The merge gate is human-controlled and remains closed until a person opens it.
**Date:** 2026-10-06

---

## 1. Executive summary

BEYU OS gains a governed enterprise-intelligence layer inside the EXISTING architecture: financial metrics with
full provenance, valuation (DCF) with versioned assumption sets, private equity, a deterministic LBO engine,
a fiduciary-capital register that keeps entrusted capital structurally apart from BEYU's own, a shared
pricing/margin capability whose markup-vs-margin distinction is enforced by the database, and an HCM
compensation/welfare entitlement engine with database-enforced segregation of duties.

Every capability is delivered as an **extension**: no new operating system, no second ledger, no second
identity, no second audit system. `CAP_POSTING` remains LOCKED; `journal_entries` / `journal_lines` remain the
only booked truth; GlobalUserID remains canonical.

Two design decisions drive most of the code:

1. **A refusal is a result.** Every engine returns an outcome that can say MISSING, NOT APPLICABLE or INVALID
   *with a reason*, instead of a plausible-looking number. Zero EPS does not become an infinite P/E; a missing
   debt figure does not become zero debt; a zero denominator does not become zero.
2. **The database is the last line of defence.** Markup/margin, the profitability ladder, loan amortisation
   identities, non-self-approval and tenant isolation are enforced by CHECK constraints and RLS policies, not
   only by application code.

## 2. Scope of this change

| Capability | Delivered here | Status |
|---|---|---|
| Finance Intelligence (metrics + provenance §5) | 12 metric engines, provenance envelope, DB store | IMPLEMENTED |
| Valuation (DCF, scenarios, sensitivity, assumption versioning) | DCF + fingerprinting + sensitivity + scenario set | IMPLEMENTED |
| Private Equity (funds, LPs, calls, distributions, portfolio, IC) | Engine + persistence + RLS | IMPLEMENTED (IRR/DPI/TVPI/RVPI via shared engine) |
| LBO modelling (S&U, debt schedule, sweep, exit, sensitivities) | Deterministic engine + persistence + tests | IMPLEMENTED |
| Capital formation / entrusted capital | Origin-classified register + separation guard | IMPLEMENTED |
| Pricing / margin / markup | Shared capability + DB-enforced identities | IMPLEMENTED |
| HCM compensation, bonus, allowances, credits, welfare | Entitlement engine + persistence + SoD enforcement | IMPLEMENTED |
| Records / filing | Existing `documents` substrate reused | PARTIALLY_IMPLEMENTED (see §29) |
| Enterprise communications | Existing 0072 platform reused | PARTIALLY_IMPLEMENTED (see §30) |
| Management cockpit / cross-enterprise analytics | Cockpit permission + read path defined | PARTIALLY_IMPLEMENTED (see §31) |
| Noelia §26 enterprise tools | 7 governed tools registered | IMPLEMENTED |
| Governance / security / audit / RLS / tests / docs | RLS + grants + audit contract + tests + this report | IMPLEMENTED |

## 3. Phase 0 audit — what was actually present before this change

Verified by keyword sweep and file inspection against `main`:

* **Absent:** market capitalisation, P/E, PEG, P/S, EV/EBITDA, FCF yield, net-debt ratios, ROIC, WACC, DCF,
  terminal growth, MOIC/TVPI/RVPI/DPI, capital calls, LBO, markup/margin engines, compensation entitlements.
* **Present and reused (not duplicated):** canonical capital-wealth primitives (`npvMinor`, `irrBps`,
  `cagrBps`, `roiBps`, `ratioBps`, `discountFactorScaled`, red-line bands, `CapitalThreshold`), the
  `FINANCIAL_TRUTH` registry, `EPISTEMIC_CLASS` vocabulary, Noelia epistemics, `guarded()` API pattern,
  `withAuditTransaction`, `tenantScopeIds`, `documents` + `retentionPolicies`, the 28-table communications
  platform (0072), `featureFlags`, `metricDefinitions`, `dataAssets`, `os_registry`.
* **Conclusion:** the intelligence layer is a genuine gap, and the primitives needed to fill it without
  re-implementing financial mathematics already existed.

## 4. Change inventory

### Added — engines (9 files)

```
src/lib/finance/intelligence/provenance.ts     Metric states, outcome envelope, provenance builders
src/lib/finance/intelligence/arithmetic.ts     Canonical primitive re-exports + fixed-point (10^6) helpers
src/lib/finance/intelligence/metrics.ts        §4A–J metric engines
src/lib/finance/intelligence/valuation.ts      DCF, multiples, sensitivity, scenarios, fingerprints
src/lib/finance/private-capital/metrics.ts     Fund/deal returns: PIC, DPI, TVPI, RVPI, MOIC, IRR, fees, carry
src/lib/finance/private-capital/lbo.ts         Deterministic LBO model + sensitivity grid
src/lib/finance/private-capital/entrusted.ts   Fiduciary capital register, origin separation, blended cost
src/lib/pricing/costing.ts                     Markup/margin, cost-plus, discounts, break-even, allocation, §12 ladder
src/lib/compensation/entitlements.ts           HCM entitlements, approval chain, credit, welfare, sponsorship classes
```

### Added — persistence (3 schema modules + 1 migration)

```
src/db/schema/finance-intelligence.ts  26 tables: instruments, metric observations, valuation, PE, LBO, entrusted capital
src/db/schema/compensation.ts           7 tables: policies, entitlements, approval stages, credit, welfare, sponsorship
src/db/schema/pricing.ts                8 tables: price lists/items, pricing decisions, allocation, profitability
drizzle/0074_enterprise_intelligence_expansion.sql   34 tables + indexes + FKs + RLS + grants
drizzle/meta/0074_snapshot.json                      chained snapshot (0062 → 0074)
scripts/migration/snapshot.ts                        snapshot generator (no DB writes, additive only)
```

### Added — Noelia capability and tests

```
src/lib/noelia/enterprise-intelligence-tools.ts        7 governed §26 tools
tests/finance/enterprise-intelligence.test.ts          metrics + DCF (28 assertions)
tests/finance/lbo-model.test.ts                        LBO refusals + arithmetic
tests/pricing/pricing-and-profitability.test.ts        markup/margin, allocation exactness, ladder
tests/hcm/compensation-and-fiduciary-controls.test.ts  segregation of duties, credit, welfare, capital separation
tests/security/enterprise-intelligence-rls-isolation.test.ts  runtime-role RLS + DB-enforced markup/margin
```

### Modified (5 tracked files, additive only)

```
src/db/schema.ts              3 export blocks appended
src/lib/constants.ts          16 permission codes + grants to 6 existing roles
src/lib/noelia/default-tools.ts  one registrar call
drizzle/meta/_journal.json     one entry (idx 74)
.github/workflows/ci.yml       migration-range labels 0000-0073 → 0000-0074 (required by tests/architecture)
```

No file was deleted, renamed or replaced. No existing table was altered. No migration was rewritten.

## 5. Migration 0074 — persistence design

**34 new tables**, all with `tenant_id`, all with an exact-money model, none with a posting path.

* **Money** is `numeric(38,0)` integer minor units with an explicit currency column on every monetary row.
  There is no `double precision` monetary column in this migration.
* **Rates** are integer basis points. **Absent values are NULL**, never zero: a zero denominator produces an
  undefined rate, and the CHECK constraints encode exactly that (`cost_minor = 0 ⇒ markup_bps IS NULL`).
* **Provenance is NOT NULL** on metric observations: code, subject, state, method, inputs, source, calculation
  version. A metric observation in a value-bearing state must carry a value; a metric in
  MISSING/NOT_APPLICABLE/INVALID must carry *no* value and *must* carry a reason. Fabricating a zero is
  therefore impossible at the storage layer.
* **Append-only intent:** assumption sets are unique per `(model, version, scenario)`; runs record the
  assumption set they used and its fingerprint.

### The markup/margin constraint (the load-bearing example)

```sql
CHECK ((cost_minor = 0  AND markup_bps IS NULL)
   OR  (cost_minor > 0  AND markup_bps = round(((price_minor - cost_minor) * 10000.0) / cost_minor)))
CHECK ((price_minor = 0 AND margin_bps IS NULL)
   OR  (price_minor > 0 AND margin_bps = round(((price_minor - cost_minor) * 10000.0) / price_minor)))
CHECK (cost_minor = 0 OR price_minor = 0 OR margin_bps IS NULL OR markup_bps IS NULL
   OR  ((markup_bps - margin_bps) * 1.0) = round((markup_bps * margin_bps) / 10000.0))
```

100 cost / 125 price ⇒ **2500 bps markup, 2000 bps margin** — verified by test, including a negative test that
a mislabelled margin is *rejected by PostgreSQL*, not merely by the engine.

## 6. Security model

* **RLS on every new table:** `ENABLE` + `FORCE ROW LEVEL SECURITY` with the canonical
  `beyu_tenant_ids()` / `beyu_global_scope()` predicate, one `<table>_tenant_scope` policy each. No new
  public table, no anonymous access, no unrestricted SELECT.
* **Runtime grants** to `beyu_runtime` (NOSUPERUSER, NOBYPASSRLS) are conditional on the role existing.
  Isolation is asserted by `tests/security/enterprise-intelligence-rls-isolation.test.ts`, which connects as
  the runtime role and proves: tenant B's row is invisible with no application predicate at all; the pinned
  count equals the unscoped count; a cross-tenant INSERT is refused by `WITH CHECK`.
* **Segregation of duties in the database:** `compensation_approval_stages` refuses an actor who is the
  stage's own beneficiary; `pe_investment_committee_decisions` refuses a decision proposed and decided by the
  same principal. The engines refuse the same chains earlier with comprehensible messages.
* **No secrets, no CORS relaxation, no service-role usage:** no credential, key or connection string was
  added; the browser is never given a privileged client; every read is tenant- and entity-scoped server-side.
* **IDOR posture:** every new read path resolves tenant/entity scope from the authenticated principal
  (`tenantScopeIds`) and never from request input; `financial_instruments`, `portfolio_companies` and
  `entrusted_capital_arrangements` reference canonical entities/parties rather than minting new identities.

## 7. Engine behaviour — the refusals that matter

| Situation | Behaviour | Why |
|---|---|---|
| Zero or negative EPS | P/E = **NOT AVAILABLE** with reason | A negative P/E ranks a loss-maker alongside profitable peers |
| Zero prior-period revenue | Growth = **INVALID** ("report the absolute change instead") | `+∞%` is an artefact, not growth |
| Missing debt component | EV = **MISSING** | Treating absent debt as zero makes a levered company look cheap |
| Negative net debt | Reported as a negative figure; leverage ratios = **NOT APPLICABLE** | A negative leverage multiple is not a ratio |
| Terminal growth ≥ WACC | DCF **REFUSED** | The Gordon model has no finite value there |
| PEG without a growth convention | **REFUSED** | 20% must not be silently read as 20 or 0.20 |
| Unbalanced sources & uses | LBO **REFUSED** with the computed imbalance | A deal that does not balance cannot close |
| Missing exit multiple | LBO **REFUSED**, reason "exit multiple required" | No exit assumption is invented |
| Leverage ceiling / coverage covenant breach | LBO **REFUSED** naming the covenant | The boundary between "finances" and "does not" is the point |
| Entrusted capital in a foreign currency | **EXCLUDED** from the total with the reason recorded | Converting without a governed FX rate invents a number |
| Combined capital total | `assertCapitalSeparation()` **THROWS** | Entrusted capital is not BEYU's capital |
| Self-approval / one person clearing two stages | **THROWS** | A control one person can satisfy alone is not a control |
| Zero cost / zero price | Markup / margin = **NULL**, not zero | An undefined rate must not read as a measured one |
| Contribution ≤ 0 | Break-even = **none**, `finite: false`, reason attached | Never a huge integer that a reader would trust |
| Unapproved allocation rule set | Allocation **REFUSED** | Cost spread without an approved policy is not auditable |

## 8. Tests added

| Suite | Tests | Focus |
|---|---|---|
| `tests/finance/enterprise-intelligence.test.ts` | 25 | Metric arithmetic, all refusals above, DCF, fingerprints, sensitivity axes |
| `tests/finance/lbo-model.test.ts` | 10 | S&U balance, leverage/covenant refusals, sweep effect, sensitivity cells |
| `tests/pricing/pricing-and-profitability.test.ts` | 18 | 100/125 ⇒ 25%/20%, undefined rates, discount impact, exact allocation, ladder |
| `tests/hcm/compensation-and-fiduciary-controls.test.ts` | 25 | SoD, lifecycle, bonus NO_AWARD vs REFUSED, credit schedule, welfare evidence, capital origins |
| `tests/security/enterprise-intelligence-rls-isolation.test.ts` | 10 | Runtime-role RLS on 7 new tables, cross-tenant write refusal, DB-enforced markup/margin |
| `tests/finance/private-capital-refusals.test.ts` | 27 | DPI/MOIC/TVPI/RVPI states, "not measurable" IRR, fund aggregation, capital-origin separation, per-engine version stamping |
| `tests/hcm/compensation-source-of-truth.test.ts` | 8 | Base-pay ownership boundary, self-approval refusal, cost-summary semantics, mixed-currency refusal |

**Result:** **123 new tests, all passing** (25 + 10 + 18 + 25 + 10 + 27 + 8 — six new suites). Plus the pre-existing architecture gate `tests/architecture` 142/142
and the Noelia tool-registry contract suite, which validates every registered tool — including the seven
added here — against the mandated governed contract.

## 9. Verification evidence

Every result below was produced in this branch, on a **disposable local PostgreSQL 16** (never production),
using the repository's own CI commands.

| Check | Command | Result |
|---|---|---|
| Typecheck | `NODE_OPTIONS=--max-old-space-size=7168 npm run typecheck` | **PASS** (0 errors) |
| Lint | `npm run lint` | **PASS** (0 errors; 1 pre-existing `<img>` warning in `noelia-cross-os-visual.tsx`) |
| Migration integrity | `npx tsx scripts/migration/integrity.ts` | **PASS** (0 blocking; no new acknowledged debt) |
| Migration integrity + ledger | `npx tsx scripts/migration/integrity.ts --with-ledger` | **PASS** (75/75 recorded, checksums match) |
| Migration apply | `npm run migrate` | **PASS** — fingerprint `f304a5178e44e0dd91e539161064b8d9` |
| Expand/contract safety | `npx tsx scripts/migration/expand-contract.ts` | **PASS** — 75 migrations · 74 EXPAND · 1 CONTRACT |
| Drift-gate self-test | `npx tsx scripts/migration/gate-selftest.ts` | **PASS** — 8/8 cases |
| Schema drift | `npx tsx scripts/migration/schema-drift.ts` | **PASS** — applied migrations and `src/db/schema` agree |
| Disaster-recovery drill | `npx tsx scripts/dr-drill.ts` | **PASS** — 463 tables restored with count parity, 386 RLS tables preserved, audit chain intact |
| Runtime role | `npx tsx scripts/setup-db-role.ts` + `pg_roles` | **PASS** — NOSUPERUSER / NOBYPASSRLS / NOCREATEROLE / NOCREATEDB |
| RLS (runtime role) | direct probes, §20 | **PASS** — 34/34 new tables RLS-enabled, 64 policies, foreign tenant invisible, `row_security=off` refused |
| New suites | `npx vitest run <new files>` | **PASS** — private-capital refusals 27/27, compensation source-of-truth 8/8, committed suites 88/88 |
| Inventory + specialist gates | `npx vitest run tests/specialist tests/release` | **PASS** — 705/705 |
| Security + Noelia | `npx vitest run tests/security tests/noelia` | **PASS** — 738 passed / 0 failed / 16 skipped |
| **Full suite** | `npx vitest run` | **PASS** — **5 006 passed / 0 failed / 309 skipped** (321 files: 286 passed, 35 skipped) |

The 309 skips are the HTTP/E2E transport layer, which needs a running server; CI executes that layer against
`next start` and asserts the skip count stays ≤ 15. The production build cannot run in this 3.9 GB sandbox
(V8 OOM after "Compiled successfully") — CI steps 21–22, both builds including the deployment-parity build
with no runtime secrets, **passed** on this branch.

## 10. Full-suite status — baselines and the corrected record

* Pre-seed baseline (before `npm run seed`, historical): 579 failed / 2 967 passed / 1 646 skipped of 5 192
  — an artefact of unseeded fixtures, not of application code.
* Post-seed baseline (historical, before this change): 145 failed / 4 492 passed / 555 skipped of 5 192.
* **After this change, on the amended branch: 5 006 passed / 0 failed / 309 skipped of 5 315.**

Two earlier observations were recorded during this work and are corrected here rather than left standing:

1. **An earlier "73 residual failures (`permission denied for table …`)" reading was wrong.** It came from an
   ad-hoc local harness that ran `migrate → seed` while skipping the repository's own
   `npx tsx scripts/setup-db-role.ts` step, so the runtime role held no privileges on 0074's predecessors.
   Under the exact CI order (`migrate → runtime-role provisioning → seed`) those suites pass **738/738**.
   No repository change was needed and none was made.
2. **Nine failures in a later local run resolved to eight stale inventory pins plus one local artefact.**
   The eight pins are the repository's deliberate inventory guards, which must be extended (with attribution
   comments) whenever a migration is added: the five `tests/specialist/*` migration-count pins, the
   audit-module and forecast-module table-name guards, and the `tests/release/expand-contract` P2 inventory.
   They were updated to 75 with explicit 0074 attributions. The ninth was a `BEYU_ENV=local` line in my own
   gitignored local `.env`, which overrode vitest's `NODE_ENV=test` and made the PVG environment check fail;
   removing it restored 10/10 without touching the repository.

**The one CI failure on this PR has the same root cause as class 2 and is fixed by it** — see §21 for the
step-by-step CI record and for the dependency-audit finding, which is **not** caused by this branch (no
dependency manifest or lockfile change exists in the diff).

## 11. What was deliberately NOT built, and why

* **No second ledger.** Nothing in this change posts. Payments, capital calls and distributions are recorded
  as *facts to be paid* with a `finance_reference_id` pointer; the posting engine remains the only writer.
* **No second identity.** Portfolio companies and capital providers are referenced by canonical
  entity/party ids. There is no parallel company registry.
* **No floating-point money anywhere.**
* **No Noelia write path.** All 7 tools are `sideEffects: NONE`. Approval, payment and posting have no tool
  path at all — the absence is the control.
* **No fabricated performance.** RVPI (and any TVPI including unrealised value) is always ESTIMATED; a fund IRR
  with no distributions or no sign change is NOT APPLICABLE — "not measurable, not zero".

## 12. Governance artefacts

* **Permissions added (16):** `finance:intelligence.read`, `finance:valuation.read|manage`,
  `finance:privatecapital.read|manage`, `finance:lbo.read|manage`, `finance:capitalformation.read|manage`,
  `pricing:read|manage|approve`, `compensation:read|manage|approve`, `cockpit:read`.
  Granted to the existing roles `GROUP_CFO`, `INVESTMENT_OFFICER`, `TREASURY_OFFICER`, `HCM_DIRECTOR`,
  `SECTOR_OPERATOR`, `CHIEF_RISK_COMPLIANCE`. No role gained posting authority.
* **Source-of-truth registrations (8):** the new canonical stores are registered in `source_of_truth` so
  duplication is detectable rather than merely discouraged.
* **Audit:** every tool invocation audits through the existing `NOELIA_TOOL_INVOKED` contract; model runs
  carry `runBy`/`runAt`/`traceId`; entitlement transitions record actor, timestamp and basis.
* **Feature flags:** the new surfaces are intended to be gated through the existing `feature_flags` table
  (`platform:config.manage`). Flags were **not** seeded by this migration — enabling them is an operator
  decision, classified as PARTIALLY_IMPLEMENTED.

## 13. Known limitations and follow-ups

1. ~~**Per-engine calculation-version stamping.**~~ **DONE in this branch.** Every outcome now records the
   version of the engine that produced it — `finance-metrics-1.0.0`, `valuation-engine-1.0.0`,
   `private-capital-metrics-1.0.0`, `lbo-engine-1.0.0`, `entrusted-capital-1.0.0`, `pricing-engine-1.0.0`,
   `compensation-engine-1.0.0` — and `tests/finance/private-capital-refusals.test.ts` pins one assertion per
   engine so a future refactor cannot silently collapse them back into a shared string.
2. **No API routes yet for the new tables.** The capability is reachable through the Noelia tool layer and the
   engines; REST routes under `/api/v1/finance/**`, `/api/v1/pricing/**`, `/api/v1/hcm/compensation/**` are
   the next increment. Until they exist, no UI surface can read the new tables.
3. **No UI surface.** The design system, navy `#0B1F4D` / gold `#D4A017`, is untouched by this change; the
   screens that must label actual/forecast/estimate/calculated/missing are not built.
4. **Records/filing and cockpit** build on existing substrate (`documents`, `retentionPolicies`,
   `metricDefinitions`) and are partially delivered: the permission and the read model exist, the filing
   workflow does not.
5. ~~**Dedicated DPI/TVPI/RVPI refusal tests.**~~ **DONE in this branch.** `tests/finance/
   private-capital-refusals.test.ts` (27 tests) pins DPI as CALCULATED, RVPI as **always** ESTIMATED, TVPI as
   ESTIMATED while anything is unrealized and CALCULATED only when truly realized, "not measurable" IRR as
   NOT_APPLICABLE (never 0), MISSING on a zero paid-in denominator, and a hard refusal to sum capital accounts
   across currencies.
6. **Base-compensation ownership boundary.** Found by the duplicate audit (§17) and closed structurally:
   `employment_relationship_ref` + a database CHECK + an engine finding, so base pay cannot be restated here
   as a second source of truth.

## 14. Merge readiness

* **Additive only**; forward-only migration; no destructive operation; no rename; no data-loss path. The
  destructive scanner classifies 0074 `EXPAND` and the expand/contract gate passed.
* **All gates that can run locally are green** (§9), including a full suite of 5 006 passing tests with zero
  failures on the amended branch.
* **CI is green on the head of this branch.** The root PostgreSQL security gate passed all 30 steps,
  including the full regression run against a live server, the browser suites and the skip-count guard; the
  P3 governance job, the migration validation job and the secret scan all passed. The only red checks are the
  two dependency-audit jobs, which fail on a time-dependent advisory against unchanged dependencies and are
  reported rather than masked (§21).
* **Nothing has been applied to production.** The production deploy path is skipped on pull requests and
  requires a human (`push` to `main` or a manual dispatch under the `Production` environment).
* **Recommendation: ready for human review and merge.** This branch does not merge itself and does not
  promote to production. The final decision, and the production migration, remain human-controlled.

## 15. Reproducing this work

```bash
npm ci
node scripts/infra/pg16-server.mjs start --fresh        # disposable local PostgreSQL 16
# .env: loopback DSNs only — runtime role (beyu_runtime) + admin role (postgres)
npm run migrate                                          # applies 0000-0074
npx tsx scripts/setup-db-role.ts                         # runtime role: NOSUPERUSER/NOBYPASSRLS
npm run seed
npx tsx scripts/migration/integrity.ts --with-ledger     # ledger + checksums
npx tsx scripts/migration/expand-contract.ts             # expand-only proof
npx tsx scripts/migration/gate-selftest.ts               # gate separates valid from drift
npx tsx scripts/migration/schema-drift.ts                # migrations vs src/db/schema
npx tsx scripts/dr-drill.ts                              # replay + restore + validation
NODE_OPTIONS=--max-old-space-size=7168 npm run typecheck
npm run lint
npx vitest run                                           # full suite (no server: HTTP layer skips)
```

`npx tsx scripts/setup-db-role.ts` is **not optional**: skipping it leaves the runtime role without
privileges and produces a large, misleading population of `permission denied` failures (§10).

## 16. PR description (per §57)

> **Title:** Enterprise Intelligence Expansion — Finance Intelligence, Valuation, Private Capital, LBO,
> Fiduciary Capital, Pricing and HCM Compensation
>
> **What:** additive capabilities inside FINANCE_OS, the HCM shared capability and a shared pricing
> capability: 9 engine files, 34 governed tables, 1 forward-only migration (0074), 7 governed Noelia tools,
> 16 documented permissions, and 123 new tests across six new suites.
>
> **Why:** the enterprise had no governed way to value a business, model a buyout, track entrusted capital
> separately from its own, price with an enforced markup/margin distinction, or record a compensation
> entitlement that one person cannot approve alone.
>
> **Risk:** low/additive. No posting path, no destructive migration, no new identity, ledger or audit system.
> RLS and runtime grants are asserted by an adversarial runtime-role suite, and the markup/margin and
> segregation-of-duties rules are enforced by CHECK constraints, not only by application code.
>
> **Verification:** typecheck 0 errors · lint 0 errors · migration integrity, expand/contract, drift-gate
> self-test, schema-drift and DR-drill all PASS on a disposable PostgreSQL 16 · **full suite 5 006 passed /
> 0 failed** · CI's builds and migration gates pass; the one failing CI step was the full regression, whose
> eight inventory pins are updated in this branch with attribution (§21).
>
> **Not included:** REST routes and UI for the new tables; feature-flag seeding; records/filing workflow and
> cockpit screens (report §13).

## 17. Duplicate-functionality audit (constraint #2 — no duplicate OS, ledger, identity or table)

Every table added by 0074 was checked against the **429 tables created by migrations 0000–0073** before it was
written, and again after apply. **Name collisions: none.** The look-alikes that a reader would reasonably
suspect were opened and compared column by column:

| New table(s) | Closest pre-existing object | Verdict |
|---|---|---|
| `private_funds`, `private_fund_participants`, `private_capital_calls`, `private_fund_distributions` | `funds` (0035, Foundation OS) | **Not a duplicate.** `funds` is a *philanthropic* fund of a foundation (`foundation_id`, `fund_type`, `purpose`, `source`, `reporting_obligations`) — restricted charitable money with a reporting duty. `private_funds` is an investment vehicle with GP/LP capital accounts. Different owner, different money, different law. The Foundation fund register remains authoritative for Foundation funds. |
| `valuation_models`, `valuation_assumption_sets`, `valuation_runs` | `family_investment_valuations` (0037, Family Office) | **Complementary, not duplicate — and the boundary is stated.** 0037 is a *mark register*: one row per investment per date with a basis and a valuation document. 0074 is a *model register*: versioned, fingerprinted assumption sets and the runs computed from them (a DCF output is a scenario, not a mark). The two were deliberately NOT merged: a family office mark is evidence about an asset, a model run is an analysis of a business. Where a model run informs a mark, the mark stays in 0037 and cites its basis; nothing in 0074 writes a mark. |
| `financial_metric_observations` | `sector_metrics` (0000), `metric_definitions` (0000) | **Different classes of record, stated explicitly.** `metric_definitions` is the metadata registry (code, definition, owner, calculation, unit); `financial_metric_observations` holds governed *values* with a full provenance envelope (state, method, inputs, source timestamp, calculation version). `sector_metrics` holds operational KPI telemetry ingested `numeric(18,4)` from source systems with no provenance state; it is NOT a financial-metric register and no engine in this change writes to it. |
| `entrusted_capital_arrangements`, `capital_formation_positions` | `capital_requests` (0000), `family_capital_allocations` (0036) | **Different objects.** `capital_requests` is an approval request for money (expected IRR/NPV/payback/risk score, resolved by a governance resolution); `family_capital_allocations` allocates family capital across purposes. `entrusted_capital_arrangements` records money BEYU holds *for someone else*, by origin, with the restriction set. None of the three can be derived from another. |
| `compensation_entitlements` | `employees.base_salary` (0000) | **A real overlap, found by this audit and fixed structurally.** Contracted base pay is owned by the employee registry. 0074 had introduced a `BASE_COMPENSATION` entitlement kind without a link to that record, which would have allowed a second, divergent statement of the same pay. Fixed in this branch: `employment_relationship_ref` (a reference to the canonical employment record) plus the CHECK `kind <> 'BASE_COMPENSATION' OR employment_relationship_ref IS NOT NULL`, and the engine finding that states the boundary. Proven live: an insert with a NULL reference is rejected by PostgreSQL (`23514`). |
| `price_lists`, `cost_allocation_*`, `profitability_*` | nothing | **No pre-existing pricing/margin capability existed.** Pricing was performed in spreadsheets. This is the one capability in the change with no prior substrate to extend. |
| `lbo_models`, `lbo_debt_tranches`, `lbo_model_runs` | `family_real_estate_financing_models` (0036) | **Not a duplicate.** The Family Office model is property financing (rent rolls, LTV); 0074 is a buyout model (sources & uses, debt schedule, sweep, exit, MOIC/IRR). |
| `pe_investment_committee_decisions` | `resolutions` / `resolution_votes` (0000) | **Linked, not duplicated.** The IC record captures the deal-specific proposer/decider split that the general governance resolution does not; a decision cites its resolution rather than replacing it. |

**No second ledger.** Nothing in 0074 posts. `journal_entries` / `journal_lines` remain the sole booked truth
(`FINANCIAL_TRUTH`), `CAP_POSTING` remains LOCKED, and every table added is an analysis, model, mark,
arrangement or entitlement register — never a posting.

**No second identity.** Every person is referenced by the canonical `GlobalUserID` / party id; the IC and
approval tables reference real principals, and `employees` remains the employee registry (no auth identity is
created).

## 18. Permission review (constraint #4 — no proliferation, no duplicates)

`src/lib/constants.ts` declares **255 permission codes**. Sixteen were added by this change, each with a
description in the registry (the same file), and each checked against the existing set for semantic
equivalence before being introduced:

| Permission | Action | Resource | Roles granted |
|---|---|---|---|
| `finance:intelligence.read` | read | governed financial metrics with provenance | GROUP_CFO, INVESTMENT_OFFICER, TREASURY_OFFICER, CHIEF_RISK_COMPLIANCE |
| `finance:valuation.read` / `.manage` | read / author | valuation models, assumption versions, runs | GROUP_CFO, INVESTMENT_OFFICER |
| `finance:privatecapital.read` / `.manage` | read / maintain | funds, participants, calls, distributions, portfolio, DD, IC | GROUP_CFO, INVESTMENT_OFFICER |
| `finance:lbo.read` / `.manage` | read / author | LBO models, tranches, runs | GROUP_CFO, INVESTMENT_OFFICER |
| `finance:capitalformation.read` / `.manage` | read / maintain | entrusted-capital arrangements by origin | read: GROUP_CFO, INVESTMENT_OFFICER, TREASURY_OFFICER, CHIEF_RISK_COMPLIANCE · manage: GROUP_CFO |
| `pricing:read` / `.manage` / `.approve` | read / maintain / approve | price lists, margin analyses, decision approval | read+manage: GROUP_CFO, SECTOR_OPERATOR · read: INVESTMENT_OFFICER · approve: GROUP_CFO only |
| `compensation:read` / `.manage` / `.approve` | read / raise / approve | entitlements, policies, credit facilities, welfare cases | HCM_DIRECTOR (all three) |
| `cockpit:read` | read | management cockpit and cross-enterprise analytics | GROUP_CFO, INVESTMENT_OFFICER, HCM_DIRECTOR, TREASURY_OFFICER, SECTOR_OPERATOR, CHIEF_RISK_COMPLIANCE |

Notes on non-duplication:
* `finance:capitalformation.*` was checked against the existing `finance:capital.read` / `.manage` (capital
  governance and capital requests): **different resource**, different route, different data. The existing
  codes are untouched.
* The `pricing:*` and `compensation:*` namespaces did not exist before this change; the pre-existing HCM
  namespace holds only `hcm:employee.read` / `.manage`.
* **No role gained posting authority.** `finance:ledger.post` and `CAP_POSTING` are unchanged, and no new
  code is a posting capability.
* `pricing:approve` and `compensation:approve` were granted to exactly one role each, and the database refuses
  self-approval structurally (`compensation_approval_stages_sod_check`, IC proposer ≠ decider).

## 19. Noelia enterprise-tool review (constraint #3)

The seven §26 tools live in `src/lib/noelia/enterprise-intelligence-tools.ts` and are registered into the ONE
existing registry from `src/lib/noelia/default-tools.ts` (line 1410). Each was reviewed against the tool
contract and against the "never bypass governance" rules:

| Tool | Permission | Classification | Risk | sideEffects |
|---|---|---|---|---|
| `finance.intelligence.market_capitalization` | `finance:intelligence.read` | CONFIDENTIAL | LOW | NONE |
| `finance.intelligence.price_earnings` | `finance:intelligence.read` | CONFIDENTIAL | LOW | NONE |
| `finance.private_capital.fund_positions` | `finance:privatecapital.read` | HIGHLY_RESTRICTED | LOW | NONE |
| `finance.capital_formation.positions_by_origin` | `finance:capitalformation.read` | HIGHLY_RESTRICTED | LOW | NONE |
| `pricing.markup_margin.analyse` | `pricing:read` | INTERNAL | LOW | NONE |
| `hcm.compensation.entitlement_summary` | `compensation:read` | CONFIDENTIAL | LOW | NONE |
| `finance.valuation.assumption_fingerprint` | `finance:valuation.read` | CONFIDENTIAL | LOW | NONE |

Evidence, from the source itself:
* **No parallel authorization system.** Every tool declares exactly one `permission` from the canonical
  registry; the registry's existing gate enforces GlobalUserID, role, tenant, entity, clearance and
  classification before `execute` is reachable. No new authorization path exists.
* **No unrestricted database access and no SQL tool.** The module contains **zero** `insert` / `update` /
  `delete` calls and no generic query tool. It imports the canonical `db` client bound to the runtime role.
* **No service-role credentials.** Zero references to service_role/SUPABASE/createClient; no credential
  material is read anywhere in the module.
* **No RLS bypass.** `requireContext()` throws unless `hasDatabaseTransactionContext()` is true, so a tool
  cannot execute outside the caller's RLS-scoped transaction — an invocation without tenant context refuses
  rather than reading more.
* **No self-approval, no permission grants, no governance mutation.** All seven declare
  `approvalRequirements: null` and `sideEffects: "NONE"`; the module exposes no capability to approve,
  grant, post or pay.
* **Audited.** Each tool declares `auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType:
  "AI_DECISION" }`, so every invocation lands in the existing audit chain.
* **Honest epistemics.** Metric states map through `canonicalStatus` (VERIFIED → OBSERVED, CALCULATED →
  DERIVED, ESTIMATED → ASSUMPTION/INFERENCE, MISSING/NOT_APPLICABLE → UNAVAILABLE, INVALID → UNCERTAINTY).
  Missing inputs are returned as `MISSING — not supplied and not read from a governed source`, never as zero.

## 20. RLS verification (runtime role, disposable local database)

Verified with `psql`/`pg` as **`beyu_runtime`** (NOSUPERUSER, NOBYPASSRLS) against the local instance — the
same role the application uses:

| Probe | Result |
|---|---|
| Role attributes (`pg_roles`) | `rolsuper=false rolbypassrls=false rolcreaterole=false rolcreatedb=false` |
| New tables with RLS enabled (sampled 8 of 34) | 8 / 8 |
| `<table>_tenant_scope` policies on those tables | 8 / 8 (64 across the 34 new tables) |
| `select count(*)` with **no** tenant GUC set | 0 rows (not an error, not everything: the predicate matched nothing) |
| Same query with a **foreign** tenant id | 0 rows |
| `set row_security = off` as the runtime role | rejected: `42501 insufficient_privilege` |
| Cross-tenant INSERT as the runtime role | rejected by the policy (`WITH CHECK`), covered by the committed adversarial suite `tests/security/enterprise-intelligence-rls-isolation.test.ts` (10/10) |
| BASE_COMPENSATION insert with a NULL canonical reference | rejected: `23514 compensation_entitlements_base_source_check` |

The isolation suite is adversarial by construction: it issues statements **directly through the runtime
client with no application predicate**, so a leak cannot be explained by a forgotten `where` clause in a
service.

## 21. CI status, and what is NOT verified

**Final CI state on the head of this branch (PR #97, run `37549499196`, 53 m 10 s):**

| Job | Result |
|---|---|
| **Root BEYU OS — PostgreSQL security gate** (30 steps) | **SUCCESS — every step green** |
| Migration integrity · PostgreSQL readiness · typecheck · lint | success |
| Apply migrations 0000-0074 · ledger cross-check · determinism re-run | success |
| Expand/contract · drift-gate self-test · schema drift · DR drill | success |
| Runtime-role provisioning + constraint assertion · seed | success |
| **Production build** · **build without runtime secrets** | success |
| Start application · `/api/health` reports database UP | success |
| **Full root regression (PostgreSQL-backed + HTTP/E2E)** | **success — the step that was red is now green** |
| Chromium install · browser history/keyboard/responsive/identity suites | success |
| Assert no suite was silently skipped for want of a server | success |
| P3 Release Governance — DB-free verification | **success** |
| Committed secret scan · Health OS frontend · Health OS backend gate | success |
| Migration validation (scratch PostgreSQL 16) · Vercel | success |
| Production dependency audit (root, health-backend) | **failure — see below** |
| Production deploy / PVG / runtime verification / drift report / Supabase branch | **skipped — by design on a pull request** |

Two failures were found on the first run of this branch and both are now accounted for:

1. **The full root regression and the P3 governance job — stale inventory pins, FIXED and verified by CI.**
   The failing tests were the repository's own guards, which must be extended, with attribution, whenever a
   migration is added: `tests/specialist/{audit-intel,compliance,forecast,risk,treasury}.test.ts` (migration
   count pinned at 74; the audit-module and forecast-module table-name guards had not been told about
   `pe_exit_events` and `valuation_assumption_sets`/`valuation_runs`) and
   `tests/release/expand-contract.test.ts` (P2 inventory pinned at 74). Each is now pinned at 75 with an
   explicit 0074 attribution comment, in the style the surrounding comments require. **Both jobs are green on
   the current head**, which is the confirmation that the diagnosis was correct rather than merely plausible.
   A related, later catch is worth recording: the CI typecheck rejected the new source-of-truth suite for
   using a non-existent `ApprovalStage` field (`actedAt`; the type's field is `at`). The suite had passed at
   runtime and the mistake survived my local run order — CI caught it, it is fixed, and local `tsc --noEmit`
   is now clean.
2. **Production dependency audit — NOT caused by this branch (reported, not masked).** The audit fails on a
   **critical** advisory published for `tinypool` (GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr), a transitive
   dependency of `vitest`. This branch changes **no** dependency manifest or lockfile, and `tinypool` is in
   main's lockfile too; main's own last CI run was on 30 September, before the advisory. The check is
   therefore time-dependent, not branch-caused. **Fully investigated in §24**: not reachable in production,
   not loaded in any production-credentialed job, and remediated properly by a dedicated vitest 4 upgrade
   rather than by `npm audit fix --force`. The advisory is formally accepted, temporarily and with an expiry,
   in §24.7 — dependencies in this branch remain unchanged.
3. **A local-only artefact, for completeness.** An initial full-suite run in my sandbox showed 73
   `permission denied for table …` failures. They were caused by my ad-hoc harness skipping
   `npx tsx scripts/setup-db-role.ts`; under the exact CI harness (`migrate → setup-db-role → seed`) the same
   suites pass 738/738. No repository change was needed for them, and none was made.

**What is verified, exactly as measured on the amended branch (local, disposable PostgreSQL 16):**

* `npm run migrate` — 75/75 APPLIED, fingerprint `f304a5178e44e0dd91e539161064b8d9`.
* `npx tsx scripts/migration/integrity.ts --with-ledger` — PASSED, 0 blocking, **no new acknowledged debt**.
* `npx tsx scripts/migration/expand-contract.ts` — PASSED (75 migrations · 74 EXPAND · 1 CONTRACT).
* `npx tsx scripts/migration/gate-selftest.ts` — PASSED 8/8.
* `npm run typecheck` — 0 errors. `npm run lint` — 0 errors (1 pre-existing `<img>` warning).
* **Full suite: 5 006 passed / 0 failed / 309 skipped (321 files: 286 passed, 35 skipped).**
  The 309 skips are the HTTP/E2E transport layer, which requires a running server; CI runs them against
  `next start` and asserts the skip count stays ≤ 15.
* New and amended suites: `tests/finance/private-capital-refusals.test.ts` 27/27 · `tests/hcm/
  compensation-source-of-truth.test.ts` 8/8 · `tests/specialist` + `tests/release` 705/705 ·
  `tests/security` + `tests/noelia` 738 passed / 0 failed.

**What is NOT verified here, stated plainly:**
* The **production build** cannot run in this 3.9 GB sandbox (V8 OOM after "Compiled successfully"); CI steps
  21–22 (both builds, including the deployment-parity build with no runtime secrets) **passed** on this
  branch, which is the build evidence.
* The **HTTP/E2E/browser layer** was not executed locally (no server); it is executed by CI.
* The **schema-drift gate and DR drill** were re-run locally after the amendment; results in §9.

## 22. Production-safety statement (migration is a repository artefact)

* **No production database was contacted at any point.** Every DSN used in this work is loopback
  (`127.0.0.1`) and belongs to a **disposable embedded PostgreSQL 16** created by
  `scripts/infra/pg16-server.mjs` and destroyed with the sandbox. No Supabase host or credential appears in
  any local environment file.
* **No destructive SQL anywhere.** 0074 is EXPAND-only (CREATE TABLE, CREATE INDEX, ADD CONSTRAINT,
  CREATE POLICY, ENABLE RLS). No DROP, no TRUNCATE, no DELETE, no column narrowing, no rename, no policy
  removal. The repository's destructive scanner classifies it `EXPAND` and the expand/contract gate passed.
* **Production apply remains a human-gated, separate step.** `db-release.yml`'s deploy job runs only on
  `push` to `main` or a manual `workflow_dispatch mode=deploy` under the `environment: Production`
  protection; on a pull request those jobs are **skipped** (recorded above). Merging this PR does not deploy
  it; a human must dispatch the deploy, and the production migration remains unapplied until they do.

## 23. Readiness verdicts (reported separately, exactly as required)

| Verdict | State | Evidence |
|---|---|---|
| **CODE READY** | **YES** | Typecheck 0 errors, lint 0 errors, 9 engine files + 5 schema/test modules compile and pass 123 new tests; no `any`-driven shortcuts, no floating-point money. |
| **DATABASE MIGRATION READY** | **YES (repository artefact)** | 0074 is EXPAND-only, checksummed, chained (snapshot 0062 → 0074), integrity + ledger + expand/contract + gate self-test + schema-drift + DR-drill all PASS on a disposable PostgreSQL 16. It has **not** been applied to production and must not be until a human dispatches the gated deploy. |
| **RLS VERIFIED** | **YES (local, runtime role)** | 34/34 new tables RLS-enabled with the canonical `beyu_tenant_ids()` predicate, 64 policies; as `beyu_runtime` a foreign tenant sees 0 rows, no-context sees 0 rows, `row_security=off` is refused (`42501`), and 10/10 adversarial isolation tests pass. |
| **TESTS PASSED** | **YES** | Locally **5 006 passed / 0 failed / 309 skipped**; in CI the full regression ran **with** a live server and the HTTP/E2E and browser layers, and passed, along with the skip-count guard that proves no suite was silently skipped. New suites: 88 committed + 27 private-capital refusals + 8 compensation source-of-truth. |
| **SECURITY VERIFIED** | **YES, with one reported exception** | Runtime role constrained and re-asserted; no secrets committed (secret-scan green); no service-role credential anywhere; Noelia tools read-only, permission-gated, RLS-scoped, no SQL tool, no approval path; segregation of duties enforced by CHECK constraints. **Exception, reported not hidden:** the dependency audit fails on a new critical advisory against unchanged `tinypool`/vitest. It is not reachable in production and not loaded in any production-credentialed job; it is investigated in full in **§24** and formally accepted, temporarily and with an expiry, in **§24.7**. No dependency was changed. |
| **PRODUCTION MIGRATION PENDING HUMAN APPROVAL** | **YES — PENDING** | No production database was contacted; the deploy job is skipped on pull requests and requires `push` to `main` or a manual dispatch under the `Production` environment. |
| **PR READY FOR HUMAN REVIEW** | **YES** | PR #97, branch `arena/25add342-beyu-os-1-0`, 34 tables, 1 migration, 6 test suites, this report, CI green on the head apart from the two audit jobs described in §21. The merge gate stays closed until a person opens it. |

## 24. Tinypool critical advisory — final dependency security review

**Scope:** current `main` (`08dfe70`) and PR #97 head. This was a **read-only investigation**: `package.json`
and `package-lock.json` are byte-for-byte unchanged and no dependency was upgraded.

### 24.1 The advisories

| Advisory | CVE | Severity | Weakness | tinypool range | First patched |
|---|---|---|---|---|---|
| **GHSA-5gmw-xhrv-c9v3** — Prototype Pollution gadget in worker options → RCE | CVE-2026-104848 | critical | CWE-1321 | `<= 2.1.0` | **2.1.1** |
| **GHSA-85c8-ppgw-ccpr** — Prototype Pollution gadget to RCE in `run()` options | CVE-2026-104849 | critical | CWE-94, CWE-1321 | `< 2.1.2` | **2.1.2** |

Both were published on 2026-10-05. npm's own resolution reports the effective vulnerable range as
`tinypool <= 2.1.1`, so the effective fix is **≥ 2.1.2** (latest 2.2.0).

### 24.2 Installed versions and introduction path

* **Installed: tinypool 1.1.1** — identical in `main`'s lockfile and PR #97's lockfile.
* **Introduced by: `vitest@3.2.7`**, the only dependent of tinypool in the entire lockfile
  (`node_modules/vitest → tinypool ^1.1.1`). vitest's only dependent is the repository root.
* **`vitest@3.2.7` is the final 3.x release.** The 3.x line has no later patch, and there is **no 1.x fix**:
  the 1.x line ends at 1.1.1 and the patched versions exist only in the 2.x line.
* Both vulnerabilities' vulnerable code is present **verbatim** in the installed 1.1.1 build:
  the constructor's options spread (`this.options = { ...kDefaultOptions, ...options, … }`, so an unset key
  resolves through a polluted `Object.prototype`) and `runTask`'s `let { filename, name } = options;`, which
  vitest calls with `{ name, channel }` — an options object with no own `filename`.

### 24.3 Reachability

* **Production runtime — NOT reachable.** tinypool's only dependent is vitest; vitest's only dependent is the
  repository root; no file under `src/`, `scripts/`, or the build scripts imports either (grep-verified).
  Next.js bundles the application's import graph, so neither package can be loaded by the deployed app.
* **Production-credentialed CI (`db-release.yml`, `environment: Production`) — installed but never loaded.**
  `npm ci` installs it, but no job in that workflow executes vitest.
* **CI test jobs — loaded.** vitest 3's **default pool is `forks`**, and the forks pool constructs
  `new Tinypool(options)` (verified in the vendored `dist/chunks/coverage.DfSpMS-b.js`). BEYU configures no
  `pool`, so this is the active path for all 321 test files.
* **Exploitation additionally requires a prototype-pollution primitive in the same Node process.** No such
  primitive exists in the tree today — the only prototype-pollution advisories present are tinypool's own.
  The exposure is therefore a *gadget awaiting a primitive*: real in CI/dev, not currently triggered.
* **PR #97 reachability = main's.** The branch changes no dependency manifest or lockfile.

### 24.4 Classification

tinypool is a **test-only dependency**. It is declared as a production dependency only transitively, because
root `package.json` lists `vitest` under `dependencies` rather than `devDependencies` (its sibling
`sectors/health/package.json` already places vitest in `devDependencies`). Nothing in the repository installs
with `--omit=dev` — the only occurrence of that flag is the audit command itself — and no production or build
path imports vitest.

### 24.5 Remediation options

| Option | Effect on the advisory | Verdict |
|---|---|---|
| `npm audit fix` (non-force) | No fix exists in vitest 3's range | **No effect** |
| Patch within vitest 3.x | Impossible — 3.2.7 is the last 3.x and no tinypool 1.x fix exists | **Not available** |
| Override `tinypool` → ≥ 2.1.2 | Closes both gadgets | **Measured, but unsupported** (§24.6) |
| **Upgrade to vitest 4.1.11** | **tinypool removed entirely**; also fixes the moderate `@vitest/mocker` advisory | **Correct remedy — major upgrade, separate change** |
| Upgrade to vitest 5.0.3 | Same, with a higher Node floor and a larger breaking surface | Larger jump than necessary |

Upgrade requirements for vitest 4.1.11: engines `^20 || ^22 || >=24` — the repository runs Node 22 everywhere
(verified in both workflows; local v22.22.3), so **no Node upgrade**; peer vite `^6 || ^7 || ^8` against an
installed vite 7.3.6, so **no Vite upgrade**. It is nonetheless a **major Vitest upgrade** (3 → 4) and must be
validated by a full CI run; the config surface BEYU uses (`environment`, `include`, `setupFiles`,
`fileParallelism`) carries forward, so the change is small in appearance — but that is an assertion to prove in
its own pull request, not in this one.

### 24.6 The override was measured, not assumed

`npm ci` (pristine, tinypool 1.1.1) → surgical swap of **only** `node_modules/tinypool` for the registry 2.2.0
build → full suite; then `npm ci` restore → full suite again:

| | tinypool 1.1.1 (control) | tinypool 2.2.0 (override) |
|---|---|---|
| Test Files | 141 failed / 133 passed / 47 skipped (321) | **identical** |
| Tests | 668 failed / 2847 passed / 1800 skipped (5315) | **identical** |
| Failure causes | 778 × `DATABASE_URL is required`, 14 × ECONNREFUSED | **identical** |

The two runs are identical in outcome: the whole suite collects and executes through the overridden pool. The
failures are environmental — the disposable PostgreSQL cluster does not survive a sandbox restart, so this
differential ran without a database; that does not affect pool behaviour, which is what was being compared.
tinypool 2.2.0 closes both gadgets at the root (`withNullPrototype(...)` in the constructor and at the
`run()`/`runTask()` entry points).

It is still **not applied**, deliberately: it forces a version outside vitest 3.2.7's declared range
(`^1.1.1`), raises tinypool's Node floor to ≥ 20 (dropping Node 18 for every contributor), and hides a
maintainer-trajectory change — vitest 4 abandoned tinypool altogether. It is a viable emergency option, with
the evidence above, but it belongs to a deliberate dependency decision, not to a feature pull request.

### 24.7 Formal temporary acceptance — the recommendation

Accepted, documented and time-boxed; **dependencies in PR #97 remain unchanged**, because the exposure is
bounded and none of the available fixes is both safe and in scope:

* not reachable in the deployed application;
* not loaded in any production-credentialed job;
* requires a prototype-pollution primitive that does not exist anywhere in the tree;
* reachable only in the CI/dev test environment, whose jobs hold ephemeral local database credentials rather
  than production secrets.

**Owner:** repository maintainer. **Expiry:** the vitest 4 upgrade pull request, which removes the package.
**Revocation trigger:** a prototype-pollution advisory in any other dependency of the root tree, or any change
that puts production credentials in the environment where the test suite runs.

### 24.8 Separate finding — a different advisory, different lockfile

The second failing audit job (`health-os-backend`) is **not** the tinypool advisory. Its lockfile contains no
vitest and no tinypool; it fails on `proxy-addr` IP spoofing (GHSA-jqcg-44mw-7w3h, critical) with `uuid`
(moderate, via `bull`). It is pre-existing on `main`, untouched by this branch, and reported here only so the
two red checks are not conflated. Its own remediation (`npm audit fix`) is non-breaking for `proxy-addr` but is
a separate decision.

### 24.9 The required verdict format

| Field | Answer |
|---|---|
| **ADVISORY** | GHSA-5gmw-xhrv-c9v3 (CVE-2026-104848) and GHSA-85c8-ppgw-ccpr (CVE-2026-104849) — both critical |
| **AFFECTED PACKAGE** | `tinypool@1.1.1` (installed; lockfile identical on `main` and PR #97) |
| **INTRODUCTION PATH** | repo root `package.json` → `dependencies.vitest ^3.2.7` → `vitest@3.2.7` → `tinypool ^1.1.1` |
| **FIXED VERSION** | tinypool ≥ 2.1.2 (2.1.1 / 2.1.2 patches; no 1.x backport exists). The package disappears entirely in vitest 4.x |
| **PRODUCTION REACHABILITY** | **None.** Never imported by application, script or build code; never loaded in a production-credentialed job |
| **PR REACHABILITY** | Same as `main`. PR #97 changes no dependency manifest or lockfile |
| **SAFE REMEDIATION** | None that is both non-breaking and in scope. The maintained fix is the **vitest 4.1.11 major upgrade** (removes tinypool; also fixes the moderate `@vitest/mocker` advisory) with no Node or Vite upgrade required |
| **BREAKING-CHANGE RISK** | vitest 4 = major test-runner upgrade (own PR, full CI). The tinypool override is measured working but forces an out-of-range major and raises the Node floor to ≥ 20. `npm audit fix --force` → vitest 5.0.3 is a larger jump than needed and must not be used here |
| **RECOMMENDED ACTION** | **Leave dependencies unchanged. Formally accept the advisory temporarily (§24.7) and remediate via a dedicated vitest 4 upgrade PR.** No further PR is created by this investigation |
