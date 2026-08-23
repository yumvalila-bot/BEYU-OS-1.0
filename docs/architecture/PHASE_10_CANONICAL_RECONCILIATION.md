# PHASE 10 — BEYU OS CANONICAL ARCHITECTURE RECONCILIATION

**Branch:** `arena/01a02c78-beyu-os-1-0` · **Date:** 2026-08-23
**Parent:** Phase 9 `cb4b786` · **main:** `94f6bf9` (PR #1)
**Mandate:** RECONCILE · DO NOT REBUILD · DO NOT INVENT THE LAW
**Final gate:** 🟡 **YELLOW — CANONICALS RECONCILED, AUTHORITY NOT RATIFIED**

---

## 1. Baseline

LOCAL HEAD = `origin/arena/01a02c78-beyu-os-1-0` = `cb4b786`.
`origin/main` = `94f6bf9`. PR #2 open, mergeable. Working tree clean.

Audit/event counts initially read 7/8. Diagnosed as leftover `CAPGOV_TEST` rows
(capital-governance suite does not truncate ledgers in `afterAll`). Domain tables
were seed-identical. Recovered with the existing `resetAuditLedgers()` helper.
Triggers re-enabled (0 disabled). Not a production financial mutation.

| Check | BEFORE |
|---|---|
| Fingerprint | `611865f1aca2f81eeb72a6c418b49732` |
| Migrations / tables / triggers | 11 / 76 / 9 (0 disabled) |
| Decisions PENDING / capabilities LOCKED | 16/16 · 60/60 |
| Ledger / periods / funded | 0 / 0 / 0 |
| Treasury `tsum` | `11783000.00` |
| Policies unprovenanced | 5/5 |
| Full suite | **1399/1399, 0 skipped** |

---

## 2. Existing architecture

The Phase 9 control plane is real:

- Constitutional control plane: constitution engine, reserved matters, governance lifecycle
- Enterprise kernel: identity, tenant, entity, RBAC/ABAC, audit, events, trace, workflow, lineage
- Finance OS: posting engine (locked), truth registry, epistemics, financeGate, specialists
- HCM: one employee master + consumption API
- Intelligence: Noelia on HIVE, inherits principal

No second governance, ledger, event, or employee system was found.

---

## 3. Genuine gaps

| Gap | Existing primitive | Decision |
|---|---|---|
| No reusable employee → GlobalUserID graph | parties / users / employees joined ad hoc | **CLOSED** — `lib/identity.ts` |
| HCM API did not expose GlobalUserID | `listWorkforce` | **CLOSED** — attaches `users.id` |
| Dual permission catalogue (H-01) | `ROLES` runtime + `role_permissions` seed | **DETECTED, not migrated** — parity check |
| Phase 10 matrices | finance/domains + architecture/completeness | **CLOSED** — `architecture/phase10.ts` |
| 18 architectural invariants not locked as a suite | scattered tests | **CLOSED** — `tests/architecture/invariants.test.ts` |
| Legal consumption service | `legal_matters` schema + UI | **LEFT** — inventing legal interpretation is forbidden |
| AR/AP/FA/Inventory | none | **LEFT** — REQUIRES_AUTHORITY / NOT_APPLICABLE |
| Permission runtime → DB (H-01) | constants.ts | **LEFT** — would change the security SoT |

---

## 4. Changes made

**EXISTING PRIMITIVE → GAP → MINIMUM CHANGE**

1. `parties` + `users` + `employees` → no graph resolver → `src/lib/identity.ts`
   (reads only; names GlobalUserID = `users.id`; fails closed on duplicates / tenant mismatch).
2. `listWorkforce` → no GlobalUserID on the consumption contract → attach via `globalUserIdsForParties`.
3. `ROLES` vs `role_permissions` → silent dual truth → `assertPermissionCatalogParity()`.
   Runtime still reads `constants.ts`.
4. Completeness registries → Phase 10 asked for three matrices → `architecture/phase10.ts` maps them.
5. Invariant proofs scattered → one suite that fails if a second users/ledger/event/workflow appears.

---

## 5. Changes deliberately NOT made

- No Sector OS, no AR/AP/FA/Inventory, no legal engine
- No P1–P11 activation, no posting, no FX/tax/valuation invention
- No permission-runtime migration (H-01)
- No unique-index migration on `users.party_id` (no write path exists; resolver fails closed)
- No Docker / Supabase / CI workflow move
- Finance OS, Governance, Authority, Audit **not rebuilt**

---

## 6. Identity integration

ONE GlobalUserID = `users.id`. ONE party MDM. ONE employee master (unique on `party_id`).

Live data: 9 users, 7 employees, 0 duplicate logins per party. Two users have no employee
(platform admin, family principal) — PERSON ≠ EMPLOYEE, correctly.

Finance does not insert employees. Posting consumes `Principal.userId`.

---

## 7. Governance integration

Finance consumes `checkScopedCapability` / `financeGate` / capital governance authorization.
Finance does not define reserved matters, constitution, or decisions.

---

## 8. Finance OS completeness

See `financeOsMatrix()`. Accounting/ledger engines COMPLETE but REQUIRES_AUTHORITY.
AR/AP/FA/Inventory NOT_APPLICABLE. Tax REQUIRES_AUTHORITY. Risk/Compliance/Audit COMPLETE.

---

## 9. HCM integration

`GET /api/v1/hcm/employees` now returns `globalUserId`. Compensation still RESTRICTED-gated.
CFO without `hcm:employee.read` is denied. Finance cannot obtain pay via the identity graph.

---

## 10. Tax integration

Unchanged. Candidates only. `computedLiability` structurally null. CAP_VAT locked.

---

## 11. Legal integration

`legal_matters` exists. No consumption service. Status PARTIAL. Building one would require
deciding how Finance interprets legal constraints — that is legal judgement.

---

## 12. Event architecture

ONE writer: `publishEventTx`. Specialists and Finance publish through it. No competing bus.

---

## 13. Lineage architecture

ONE primitive: `finance/lineage.ts`. `canonical` is structurally false for derivations.

---

## 14. Workflow architecture

ONE engine: `finance/workflow.ts` (121 pairs, default deny, SoD).
`governance.workflows` is definition storage, not a second engine.

---

## 15. Cross-domain contracts

See `crossDomainMatrix()`. Legal is the only PARTIAL integration. Tax/Treasury blocked on
authority or data, not missing links.

---

## 16. Security findings

Hostile review of the 20 Phase-10 questions: all fail closed on existing controls.
No new defect required a production data change.

Identity graph: missing → NOT_FOUND; wrong tenant → TENANT_SCOPE_MISMATCH with ids stripped;
two GlobalUserIDs → DATA_CONFLICT.

---

## 17. Fault injection

| Fault | Result |
|---|---|
| Two GlobalUserIDs for one party | `assertSingleGlobalUser` throws |
| Tenant mismatch on resolve | ids null, TENANT_SCOPE_MISMATCH |
| Forecast/scenario/assumption → POSTED | `canPromote` false |
| Non-canonical writer of journal | `mayWrite` false |
| Second `users` table / second `postJournal` | invariant suite |

---

## 18. Architectural invariants

INVARIANTS 1–18 are asserted in `tests/architecture/invariants.test.ts`.
All pass against the live repository and database.

---

## 19. Maturity matrices

### A. BEYU OS common platform

Derived from `commonPlatformMatrix()`. Identity, Security, HCM, events, workflow, domain
registry: COMPLETE. CI/DR/backup/deployment: BLOCKED (external infrastructure).
Cross-sector: PARTIAL (no Sector OS).

### B. Finance OS

Derived from `financeOsMatrix()`. Risk, Compliance, Audit, Workflow, Lineage: COMPLETE.
Accounting/Ledger/Capital/Tax/Close: REQUIRES_AUTHORITY. Treasury: DATA_NOT_AVAILABLE.
AR/AP/FA/Inventory: NOT_APPLICABLE.

### C. Cross-domain integration

Derived from `crossDomainMatrix()`. Legal PARTIAL. Tax REQUIRES_AUTHORITY.
Treasury DATA_NOT_AVAILABLE. All other listed contracts COMPLETE as *links*.

---

## 20. BEFORE → AFTER

Fingerprint, migrations, triggers, decisions, capabilities, ledger, treasury, capital,
policies: **identical**. No new migration.

---

## 21. Validation

typecheck · lint · build · full suite (HTTP server) · identity · HCM · finance ·
governance · lineage · workflow · invariants · hostile / FI.

ZERO skipped. No capability or authority activation.

---

## 22. Remaining blockers

1. 16/16 decisions PENDING, 60/60 capabilities LOCKED
2. C-1: 5/5 policies unprovenanced
3. Empty ledger / 0 periods
4. 3 treasury attribution conflicts (governance-owned)
5. H-01: runtime permissions still from `constants.ts`
6. No Sector OS; Legal service unbuilt (must not invent law)
7. CI execution unverified

---

## 23. Recommended next build

Not engineering: **C-1 / a single ratified decision** enacted through the governed
vote/decision path so provenance becomes GOVERNED. Until then every execution gate
is correctly locked.

Engineering that remains safe: H-01 (make `role_permissions` the runtime source)
as a dedicated, tested cutover — not mixed with architecture work.

---

## 24. Final gate — 🟡 YELLOW

The canonical BEYU OS equation holds in code:

**Constitutional control plane + enterprise kernel + governed intelligence**,
with one identity, one governance, one authority, one event, one lineage, one
workflow, and Finance OS as the only financial truth.

GREEN is unavailable: nothing is ratified, the ledger is empty, CI is unexecuted.
RED is not warranted: no unresolved security or integrity defect, invariants locked,
financial state unmoved.
