# PHASE 12 — HCM COMPLETENESS & CANONICAL COMPLIANCE

**Branch:** `arena/01a02c78-beyu-os-1-0` · **Date:** 2026-08-23
**Parent:** Phase 11 `8bfe7f5`
**Mandate:** VERIFY THE EXISTING HCM. BUILD ONLY GENUINE GAPS.
**Final gate:** 🟡 **YELLOW — HCM KERNEL SATISFIES CANONICAL READ/CONSUMPTION SCOPE; WRITES REQUIRE AUTHORITY**

---

## 1. Baseline

LOCAL HEAD = REMOTE HEAD = Phase 11 `8bfe7f5679fc114807fbb11be139e56f358b8c8b`.
Working tree was clean. PR #2 head matched.

| Check | BEFORE |
|---|---|
| Fingerprint | `611865f1aca2f81eeb72a6c418b49732` |
| Migrations / tables / triggers | 11 / 76 / 9 (0 disabled) |
| Decisions / capabilities | 16/16 PENDING · 60/60 LOCKED |
| Ledger / periods / funded | 0 / 0 / 0 |
| Treasury | `tsum = 11783000.00` |
| Users / employees | 9 / 7 |
| GlobalUserID | `users.id` (no new column) |

Independently reproduced. No recovery required.

---

## 2. Existing HCM architecture

Already present before this phase:

- `people.employees` — ONE employee master, unique on `party_id` and `employee_no`
- `people.positions`, `people.employment_events`, `people.workforce_requests`
- `core.org_units` (org master) and `core.legal_entities` (ownership) — not confused
- `src/lib/hcm.ts` read service + `GET /api/v1/hcm/employees`
- Identity graph attaches GlobalUserID
- Source-of-truth: Employees → SHARED_HCM → `people.employees`
- No Sector OS employee table
- No application writer of `employees` outside seed

HCM was already a first-class shared enterprise capability. It was not rebuilt.

---

## 3. GlobalUserID / identity integration

ONE GlobalUserID = `users.id`. PERSON ≠ USER ≠ EMPLOYEE ≠ PRINCIPAL.

Verified:

- Users without employees remain valid (`admin@beyu.os`, `family@beyu.os`)
- Every employee party has exactly one login
- `assertSingleGlobalUser()` still load-bearing (`users.party_id` is not unique in schema)
- No second identity primitive was added

---

## 4. Employee master

Canonical record already had employee ID, party, tenant, legal entity, position,
manager column, hire/end dates, status, type, country, classification, pay.

Phase 12 **extended the existing consumption record** (not a new API) with:

- employing-entity tenant
- position grade / job family / org unit
- manager id
- end date
- temporal class
- GlobalUserID (already present from Phase 10)

---

## 5. Employment lifecycle

Schema already recorded HIRE / PROMOTION / TRANSFER / LEAVE / SUSPENSION / TERMINATION.

Genuine gap: no reusable lifecycle *mechanism* — only a table.

Minimum primitive added:

- structural transition table (schema comments, not labour law)
- unknown statuses fail closed
- TERMINATED → ACTIVE requires event type REHIRE
- `recordEmploymentChange()` evaluates then returns **REQUIRES_AUTHORITY**, `mutated: false`

No second workflow engine. Finance `evaluateWorkflowTransition` was not forked.

---

## 6. Organization & position architecture

`legal_entities` ≠ `org_units`. Positions may reference an org unit. Seed has no
org-unit rows — that is DATA_NOT_AVAILABLE for a populated tree, not a missing
second org master. `listEstablishment()` is the existing-position read path.

---

## 7. Workforce data governance

Classification catalogue is PUBLIC → HIGHLY_RESTRICTED.

Pay is RESTRICTED. Stripped below that ceiling.

**Genuine common-platform defect:** `classificationRank()` ranks an unknown
*principal* clearance above HIGHLY_RESTRICTED. Specialists already failed closed
locally. `filterByClearance()` now fails closed in the common primitive.

---

## 8. Tenant / entity / RBAC / ABAC

Before: `listWorkforce` filtered `employees.tenant_id` only and ignored `entityScope`.

All seeded employees live on the group tenant while Sara Lema is employed by
Health Ltd (health tenant). A sector operator with `hcm:employee.read` therefore
saw **zero** workforce — a broken consumption path, not a feature.

After (same function, no new API):

- visible if `employees.tenant_id` **or** employing `legal_entities.tenant_id` is in `tenantScopeIds`
- then `entityScope` (empty = all in reach)
- then clearance

CFO still has no `hcm:employee.read`. Unknown clearance returns no rows.

---

## 9. Sector-OS consumption

`GET /api/v1/hcm/employees` remains the declared API. Noelia now calls
`listWorkforce` instead of querying `employees` directly. Sector OSs are not
implemented and were not built here.

---

## 10. Compensation boundary

HCM may expose authorised base pay. It does not post journals, settle payroll,
calculate tax, or create liabilities. `mayWrite("lib/hcm", journal)` remains false.

---

## 11. Audit / events

GET is `guarded()` (authenticated, permissioned, traced). Writes do not exist, so
no EMPLOYEE_CREATED / EMPLOYMENT_CHANGED is published. That is honest PARTIAL,
not a second event bus.

---

## 12. Temporal governance

Classifier distinguishes CURRENT / FUTURE / EXPIRED / TERMINATED on the master
row. Employment events are HISTORICAL / CURRENT / FUTURE facts. Historical
events are not rewritten as current. Assignment history is the event table —
ONE employee row per party is preserved.

---

## 13. Data integrity

Schema: unique employee_no, unique party_id, party FK.

Application (same class as `assertSingleGlobalUser`):

- no self-manager
- no manager cycle
- no cross-tenant / cross-entity manager
- endDate ≥ hireDate

No manager FK migration (would be a new migration without a write path).

---

## 14. API audit

| Endpoint | Method | Permission | Mutation |
|---|---|---|---|
| `/api/v1/hcm/employees` | GET | `hcm:employee.read` | none |

No duplicate API was added. UI now uses the same service.

---

## 15. Fault injection

| Fault | Result |
|---|---|
| Missing `hcm:employee.read` | DENIED |
| Unknown clearance `SUPER_ADMIN` | empty set; pay suppressed |
| Forged entity scope on sector operator | empty set |
| Future hire / early asOf | FUTURE, not CURRENT |
| TERMINATED → ACTIVE without REHIRE | REQUIRES_REHIRE |
| Lifecycle write by HCM director | REQUIRES_AUTHORITY, mutated false |
| Circular / cross-scope manager | `HcmIntegrityError` |
| HCM journal insert | none exists |

---

## 16. Completeness matrix

Derived from `hcmCompletenessMatrix()`:

| HCM Capability | Status | Evidence | Blocker |
|---|---|---|---|
| GlobalUserID integration | COMPLETE | identity graph + consumption attach | — |
| Employee master | COMPLETE | ONE `people.employees`; no app writer | — |
| Employment lifecycle | REQUIRES_AUTHORITY | evaluator exists; write refused | no ratified HCM write |
| Organization structure | PARTIAL | `org_units` master; seed empty | not a second master |
| Position management | PARTIAL | schema + `listEstablishment` | write unratified |
| Job architecture | PARTIAL | grade / job family on positions | no separate job catalogue (not required) |
| Manager hierarchy | PARTIAL | columns + integrity asserts | seed uses position reports-to |
| Workforce data governance | COMPLETE | classification + fail-closed clearance | — |
| Tenant isolation | COMPLETE | employee tenant ∨ entity tenant | — |
| Entity isolation | COMPLETE | `entityScope` on read | — |
| RBAC | COMPLETE | `hcm:employee.read` / `.manage` | — |
| ABAC | COMPLETE | clearance + entity + tenant | — |
| Compensation boundary | COMPLETE | no financial execution | — |
| Audit | PARTIAL | guarded GET | no ratified mutation |
| Events | PARTIAL | registry names only | unratified write |
| Temporal history | PARTIAL | classifier + events | one row per party |
| Sector-OS consumption | PARTIAL | API + Noelia consume HCM | Sector OSs not built |
| Reporting | PARTIAL | KPI-HEADCOUNT definition | not a kernel primitive |
| Data integrity | PARTIAL | unique party/employeeNo + asserts | manager FK left (no write path) |
| API layer | COMPLETE | one GET; UI/Noelia reuse it | — |

---

## 17. Canonical compliance

1. BEYU OS remains the control plane.
2. HCM remains a shared enterprise capability.
3. HCM remains the workforce source of truth.
4. ONE GlobalUserID.
5. Identity is not duplicated.
6. Finance OS remains financial truth.
7. Sector OSs do not own workforce truth.
8. Governance remains above execution (writes REQUIRES_AUTHORITY).
9. Authority is not invented.
10. No accounting policy invented.
11–12. Tenant and entity isolation mandatory on the read path.
13–15. Audit, event, workflow primitives were reused, not forked.
16–17. No second control plane or second employee master.

---

## 18. Genuine gaps found

1. `listWorkforce` ignored `entityScope`.
2. Sector consumption used `employees.tenant_id` only (always group).
3. Unknown principal clearance failed *open* in `filterByClearance`.
4. UI and Noelia bypassed the HCM service (second read path; UI events unscoped).
5. No temporal classifier and no refuse-to-write lifecycle primitive.
6. Manager integrity existed only as unconstrained text columns.

Not gaps (left):

- Payroll, ATS, benefits, skills, documents
- H-01 runtime permission cutover
- Unique index on `users.party_id`
- Sector OS runtimes
- Ratifying an HCM write capability

---

## 19. Remediation performed

EXISTING PRIMITIVE → VERIFIED GAP → MINIMUM CHANGE.

No new employee table. No new identity. No new API. No financial mutation.

---

## 20. BEFORE → AFTER

Fingerprint, migrations, triggers, decisions, capabilities, ledger, treasury,
capital, policies, users, employees: **identical**.

Audit/events grew only from HTTP login and specialist ANALYSIS (append-only).
No employee row, journal, period, capability or decision changed.

Code-only: consumption contract, common clearance fail-closed, docs, tests.

If asked whether the *implementation of the employee master* already satisfied
the canonical kernel: **yes, as a master**. The gaps were isolation, fail-closed
clearance, consumption reuse, and a refuse-to-write lifecycle — not a missing HCM.

---

## 21. Validation

typecheck · lint · build · full suite · identity · HCM · tenant · entity ·
temporal · lifecycle · integrity · HTTP · architecture matrix.

**1486/1486, 0 skipped** (52 files) with `BEYU_TEST_BASE_URL=http://127.0.0.1:3100`.
No activation. Fingerprint unchanged.

---

## 22. Remaining blockers

1. 16/16 PENDING, 60/60 LOCKED
2. C-1 provenance (5/5)
3. Empty ledger / 0 periods
4. 3 treasury attribution conflicts (do not repair)
5. H-01 runtime permissions
6. `users.party_id` not unique in schema
7. No Sector OS
8. HCM writes remain REQUIRES_AUTHORITY

---

## 23. Final gate — 🟡 YELLOW

HCM is the employee master. Sector OSs cannot create a competing one from this
codebase. Compensation does not leak below clearance. Cross-tenant / cross-entity
reads fail closed. Future employment does not become current early. Historical
events are not overwritten. HCM cannot post or settle.

GREEN is unavailable until a real GOVERNED write authority exists — and that is
a governance act, not an engineering one.

RED is not warranted: the kernel HCM contract holds.

**HCM IMPLEMENTATION ALREADY SATISFIED THE VERIFIED CANONICAL MASTER REQUIREMENTS.**
Phase 12 closed isolation, fail-closed clearance, consumption reuse, and the
refuse-to-write lifecycle seam. It did not create a second HCM.
