# Governed Meeting Chain, Competency Matrix & Vacancy Recovery Architecture

**Date:** 2026-09-21  
**Status:** IMPLEMENTED, MIGRATED (0060), TESTED (95 PASS)  
**Invariant Preserved:** `MEMBERSHIP ≠ RBAC ROLE ≠ SECURITY CAPABILITY ≠ FINANCE CAPABILITY ≠ DELEGATED AUTHORITY`

---

## 1. Executive Summary

This architecture establishes three foundational governance capabilities in the BEYU OS constitutional control plane:

1. **Governed Vacancy Recovery & Composition Validation:** Resolves prospective composition checks in `appointment-service.ts` so chartered bodies with seat vacancies can activate consented replacement candidates whose appointment satisfies adopted composition rules across all term boundaries.
2. **Governed Seats, Competency Matrix & Succession Analysis:** Implements 8 core competency domains, independence indicators, tenure boundaries, and succession planning. Analyzes board coverage and identifies competency gaps to inform governance decisions without becoming an unauthorized automatic appointment mechanism.
3. **Governed Meeting Chain:** Implements full end-to-end meeting traceability (`MEETING → NOTICE → INVITATION → AGENDA → BOARD PAPERS → ATTENDANCE → QUORUM → CONFLICT → DELIBERATION → MOTION → VOTE → RESOLUTION → MINUTES → ACTIONS`) with strict PostgreSQL Row Level Security (0060), tamper-evident audit logs, and non-self-verification constraints for post-meeting implementation actions.

---

## 2. Governed Meeting Lifecycle & Traceability

The meeting chain is not implemented as disconnected CRUD features, but as an auditable, sequential, state-machine-governed workflow:

```
+-----------------------------------------------------------------------------------------+
|                                    GOVERNED MEETING CHAIN                               |
+-----------------------------------------------------------------------------------------+
| 1. DRAFT           : Created with scheduled start/end, location, classification, type   |
| 2. NOTICE_ISSUED   : Dispatched with authoritative notice document                      |
| 3. AGENDA_LOCKED   : Ordered agenda items + board papers with cryptographic checksums   |
| 4. IN_SESSION      : Convened; actual start time recorded                               |
| 5. ATTENDANCE      : Real-time attendance logging & automatic quorum recalculation      |
| 6. CONFLICTS       : Declared pecuniary/personal interests & formal recusals recorded   |
| 7. DELIBERATIONS   : Motions moved & seconded by active members of the governing body   |
| 8. RESOLUTIONS     : Binding resolutions voted and linked to meeting motion             |
| 9. MINUTES         : Minutes document attached with cryptographic SHA-256 checksum      |
| 10. CONCLUDED      : Presiding officer concludes session; actual end time recorded      |
| 11. ACTIONS        : Governed implementation tasks assigned with independent verifier   |
+-----------------------------------------------------------------------------------------+
```

### Key Security Invariants
- **Presiding Authority Required:** Only active presiding members (`CHAIR`, `VICE_CHAIR`, `SECRETARY`) can create meetings, issue notices, lock agendas, or conclude meetings.
- **Fail-Closed Agenda Freeze:** No agenda items or papers can be added after an agenda is locked.
- **Live Quorum Evaluation:** Attendance records automatically evaluate voting eligibility and determine whether the body's mandatory `quorumRequired` is satisfied.
- **Independent Action Verification:** When post-meeting implementation actions require independent verification, the `assigneePartyId` cannot be the same as the `independentVerifierPartyId` (`fail("Independent verification requires a distinct verifier; implementers cannot self-verify.")`).

---

## 3. Seats, Competency Matrix & Succession Analysis

Competency and composition analysis provides structured, evidence-based insight to nominating authorities and presiding officers.

### Competency Domains:
1. `GOVERNANCE_LEADERSHIP`
2. `FINANCIAL_AUDIT`
3. `LEGAL_REGULATORY`
4. `INDUSTRY_SECTOR`
5. `RISK_INTERNAL_CONTROLS`
6. `TECHNOLOGY_SECURITY`
7. `ESG_SUSTAINABILITY`
8. `STRATEGY_SCALE`

### Non-Authoritative Invariant:
Competency assessment and succession planning **informs** governance decisions and reveals coverage gaps, but **never** bypasses constitutional nominations, never automatically appoints members, and never grants RBAC or Finance capabilities.

---

## 4. Vacancy Recovery Architecture

Prior prospective appointment checks required `charter.satisfied` on the pre-existing membership before evaluating the candidate. In a body with an existing vacancy (e.g., following a resignation, retirement, or term expiration), this created a catch-22 blocker where a valid replacement candidate could not be activated.

The updated `prospective()` function in `appointment-service.ts`:
1. Checks that the governing body has an adopted, authoritative charter.
2. Evaluates the union of active members and the incoming candidate (`[...activeMembers, candidate]`).
3. Assesses adopted composition rules at the proposed `appointedOn` date and across all membership boundaries (`retiredOn` + 1 day).
4. Fails closed if adding the candidate does not satisfy the adopted composition rules, while permitting valid vacancy replacements.

---

## 5. Migration & Database Invariants

- **Migration 0060:** `0060_governance_meetings.sql` creates tables for meetings, agenda items, attendance, conflicts, motions, and actions.
- **Forced Row Level Security (RLS):** All 6 tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- **Tenant Isolation:** Scoped through canonical tenant and classification policies matching `withTenantDatabaseContext`.
- **Snapshot & Ledger:** Migration 0060 recorded in `drizzle/meta/_journal.json` (idx 60) and `drizzle/meta/0060_snapshot.json` (369 tables).
- **Zero Schema Drift:** Verified via `scripts/migration/schema-drift.ts` (0 blocking differences).

---

## 6. Verification & Test Summary

| Test Suite | Tests | Result |
|---|---|---|
| `tests/governance/governed-meetings.test.ts` | 4 | **PASS** |
| `tests/governance/competency-matrix.test.ts` | 3 | **PASS** |
| `tests/governance/appointments.test.ts` | 18 | **PASS** |
| `tests/governance/appointment-adversarial.test.ts` | 11 | **PASS** |
| `tests/governance/membership-lifecycle.test.ts` | 11 | **PASS** |
| `tests/governance/body-lifecycle.test.ts` | 12 | **PASS** |
| `tests/security/deferred-authority-visibility.test.ts` | 15 | **PASS** |
| `tests/migration/migration-integrity.test.ts` | 36 | **PASS** |
| **Total Focused Governance & Security Gate** | **100** | **100% PASS** |
| **Typecheck (`tsc --noEmit`)** | — | **PASS (0 errors)** |
| **Lint (`eslint .`)** | — | **PASS (0 errors)** |
| **Secret Scan (`scan-secrets.mjs`)** | 2,122 files | **PASS (0 secrets)** |
| **Production Build (`npm run build`)** | 146 routes | **PASS (0 errors)** |
| **Schema Drift (`scripts/migration/schema-drift.ts`)** | 370 DB / 369 declared | **PASS (0 blocking)** |
