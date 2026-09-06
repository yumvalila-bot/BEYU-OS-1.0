# BEYU OS 2.0 ADVERSARIAL TEST REPORT

Date: 2026-09-05
This report is **honest**: it is a report of what can and cannot be executed in this environment.

---

## 1. Executed in this session

- **No** live-server adversarial attacks were executed because no PostgreSQL service, no seeded database and no Flutter SDK are available, and the API requires real DB-backed state for the adversarial workflows.
- **What was executed** was the existing destination adversarial *unit/integration suites that run without a database* plus static inspection. The DB-bound adversarial suites remain intact but did **not** run.

## 2. Existing adversarial coverage (present in repo, not executed here)

The destination repo contains adversarial suites, for example:

- `tests/security/` — `full-spectrum-chaos`, `ledger-rls-isolation`, `rls-isolation`, `entity-isolation`, `activation-gate`, `runtime-privilege-audit`, `audit-truncate-and-policy-window`, `policy-provenance-scope`, `governance-provenance-integrity`, `idempotency`, `mfa`, `login-rate-limit`, `authority-firewall`.
- `tests/finance/` — `ledger-integrity`, `ledger-write-authority`, `ledger-control-durability`, `journal-scope-integrity`, `accounting-substrate-boundary`.
- `tests/authorization/` — `abac-decision`, `abac-scope-country`, `rbac-audit`.
- `tests/identity/` — `identity-adversarial-http`.
- `tests/tenant-isolation/` — `tenant-isolation`.
- `sectors/health/backend` — `rls-adversarial`, `rls-isolation`, `consent-guard.adversarial`, `csrf-adversarial`, `rate-limit-adversarial`, `mfa-phase12`, `security-adversarial`, `transaction-interceptor`, `endpoint-tier-independence`, `clinical-safety`, `beyu-bridge`, `service-token`, `transaction-envelope-matrix`.

These are **claim-ready**, not **result-ready** until run against real PostgreSQL in the repo's CI.

## 3. Target adversarial matrix (must be run before certification)

| Attack | Expected | Current |
|---|---|---|
| Cross-tenant access | denied | BLOCKED (DB) |
| Cross-entity access | denied | BLOCKED (DB) |
| Cross-country access | denied | BLOCKED (DB) |
| Cross-OS access | denied | BLOCKED (DB) |
| Role escalation | denied | BLOCKED (DB) |
| Permission escalation | denied | BLOCKED (DB) |
| Stale token usage | rejected | BLOCKED (DB) |
| MFA bypass | rejected | BLOCKED (DB) |
| Direct database access | blocked | BLOCKED (DB) |
| Audit tampering | detected | BLOCKED (DB) |
| Ledger mutation | rejected | BLOCKED (DB) |
| CAP_POSTING bypass | rejected | BLOCKED (DB) |
| AI authorization bypass | rejected | BLOCKED (DB/provider) |
| Classification bypass | rejected | BLOCKED (DB) |
| Emergency-access abuse | detected/audited | BLOCKED (DB) |
| Delegation abuse | re/checked | BLOCKED (DB) |

## 4. Result

| Metric | Value |
|---|---|
| P0 discoveries this session | 0 |
| P0 verified clean | **NOT VERIFIED** (DB-backed suites not run) |
| Adversarial certification | **NOT CERTIFIED** |

## 5. Recommended next action

Provision a disposable PostgreSQL 16 (the CI already does this via postgres:16 service container) and run the full destination root + Health real-PostgreSQL adversarial suite. Only then can adversarial results be certified.
