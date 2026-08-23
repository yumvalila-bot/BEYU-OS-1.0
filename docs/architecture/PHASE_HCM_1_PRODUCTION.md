# BEYU HCM — PRODUCTION COMPLETENESS & CANONICAL ARCHITECTURE REPORT

**Phase:** HCM-1 · **Date:** 2026-08-23
**Parent:** Phase 12 `98a3933`
**Verdict:** **HCM COMPLETE — AUTHORITY-BLOCKED WRITES**

---

## 1. Baseline

LOCAL = REMOTE = `98a3933` before this phase. Working tree clean.

| Check | BEFORE |
|---|---|
| Fingerprint | `611865f1aca2f81eeb72a6c418b49732` |
| Migrations / tables / triggers | 11 / 76 / 9 (0 disabled) |
| Decisions / capabilities | 16/16 PENDING · 60/60 LOCKED |
| Users / employees | 9 / 7 |
| Ledger / treasury | 0 journals · `tsum = 11783000.00` |
| Org units | 0 |
| Positions / employment events | 5 / 7 |

Independently reproduced. No recovery required.

---

## 2. Existing HCM architecture

Phase 9–12 already provided: ONE `people.employees` master, positions, employment events,
identity graph, `listWorkforce`, tenant/entity isolation, compensation gate, refuse-to-write
lifecycle, UI/Noelia consumption.

This phase **did not rebuild** that kernel.

---

## 3–6. Employee master, GlobalUserID, person/user/employee, employment

GlobalUserID remains `users.id`. PERSON (`parties`) ≠ USER (`users`) ≠ EMPLOYEE (`employees`).
Users without employees remain valid (`admin@beyu.os`, `family@beyu.os`).

Employment is a **derived view** (`getEmployment`) over the master + `employment_events`.
A second employment table would have been a second master. It was not created.

---

## 7–9. Organization, job/position, legal entity / tenant

`core.org_units` is the org master. Seed is empty → `listOrganizations` returns
`DATA_NOT_AVAILABLE`, not a fabricated tree. Cycle check is independent.

Jobs remain `job_family` on positions. No fake job catalogue.

Tenant reach = employee tenant ∨ employing-entity tenant. Entity scope filters `legalEntityId`.

---

## 10–12. Temporal, compensation, RBAC/ABAC

Temporal classifier unchanged (CURRENT / FUTURE / EXPIRED / TERMINATED).
Pay still RESTRICTED; identity consumable at sector clearance.
Unknown clearance fails closed.

---

## 13–16. Isolation, API, lifecycle, write boundary

`GET /api/v1/hcm/employees/:id` is the same master, same gates. Forged and missing
ids are both `NOT_FOUND`.

`proposeEmploymentChange` is classified **SIMULATION**, `mutated: false`, and ends
`AUTHORITY_CHAIN_INCOMPLETE`. Finance workflow was not forked.

---

## 17–22. Governance, authority, SoD, audit, events, lineage

No new reserved matters, delegation engine, SoD table, audit log, or event bus.
Writes never reach those stages because authority is absent. That is honest, not a stub.

---

## 23–25. Finance, Sector OS, Noelia

Finance has no employee table. Sector OSs are not built; they have a consumption API.
Noelia still calls `listWorkforce` and cannot write.

---

## 26–28. Analytics, quality, import

`observeWorkforce`: OBSERVED counts; empty scope is **not** zero.
No turnover targets or compensation benchmarks.

`assessWorkforceQuality`: advisory findings only. Does not repair.

Import/payroll: **NOT_APPLICABLE**. Not invented.

---

## 29–31. Security, hostile audit, fault injection

Covered independently: missing permission, unknown clearance, forged entity, forged
employee id, illegal transition, missing principal, org cycle, empty-scope analytics.

---

## 32–33. Genuine gaps and changes

| Existing | Gap | Action |
|---|---|---|
| listWorkforce | no get-by-id | CLOSED — `getEmployee` + GET :id |
| employee + events | no employment view | CLOSED — derived `getEmployment` |
| KPI-HEADCOUNT definition | no observation with epistemics | CLOSED — `observeWorkforce` |
| integrity asserts | no scan report | CLOSED — `assessWorkforceQuality` |
| org_units table | no read; empty seed | CLOSED — `listOrganizations` (DNA) |
| recordEmploymentChange | no staged write chain | CLOSED — `proposeEmploymentChange` SIMULATION |
| jobs / payroll / ATS | not kernel | LEFT — NOT_APPLICABLE |
| HCM writes | unratified | LEFT — REQUIRES_AUTHORITY |

---

## 34. BEFORE → AFTER

Fingerprint, migrations, employees, users, decisions, capabilities, journals,
treasury: **identical**. Code and tests only.

---

## 35. Validation

typecheck · lint · build · **1499/1499 twice, 0 skipped**. No financial mutation.

---

## 36. Completeness matrix

Derived from `hcmCompletenessMatrix()` — see that module. Kernel identity/master/isolation/
compensation/API/Noelia/Finance consumption: COMPLETE. Writes: REQUIRES_AUTHORITY.
Org tree: DATA_NOT_AVAILABLE. Payroll/import: NOT_APPLICABLE.

---

## 37. Remaining authority blockers

16/16 PENDING · 60/60 LOCKED · no ratified HCM write capability · C-1 provenance.

---

## 38. Remaining engineering blockers

Sector OS runtimes (do not build here). Org-unit seed (do not fabricate).
Employee-level manager edges (seed uses position reports-to).
`users.party_id` unique index (left; same class as H-01).

---

## 39. Final architectural verdict

**HCM COMPLETE — AUTHORITY-BLOCKED WRITES**

HCM is the only employee master. GlobalUserID is canonical. Sector/Finance/Noelia
consume; they do not own workforce truth. Writes evaluate and refuse. Historical
truth is not overwritten. Financial state did not move.
