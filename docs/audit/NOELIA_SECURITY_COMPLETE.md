# NOELIA — Security Complete

**Date:** 2026-08-25 · **Gate: 🟢 GREEN (implementation) / ⚪ BLOCKED (production deployment)**

**Machine-readable:** `noelia-security-completeness-matrix.json`

## 1. Adversarial control inventory (§XVIII)

Every control below was exercised by an automated test. All fail closed.

| # | Threat | Control | Test evidence |
|---|---|---|---|
| 1 | Tenant breakout | RLS `beyu_tenant_ids()` + app scope predicates | RLS probe (non-superuser role), tenant-isolation suites |
| 2 | Entity breakout | composite entity/tenant/check | tool-registry ENTITY_DENIED |
| 3 | Country breakout | composite country/tenant check | tool-registry COUNTRY_DENIED |
| 4 | Classification escalation | ABAC clearance ceiling | CLASSIFICATION_DENIED |
| 5 | RBAC bypass | per-capability permissions | workflow STOPPED, HTTP 403 |
| 6 | ABAC bypass | policy evaluation on every route/tool | policy suites |
| 7 | Actor spoofing | server-derived principal | HTTP suites |
| 8 | Role spoofing | server-derived grants | authz suites |
| 9 | Tool injection | declaration==registration; unknown/unregistered DENY | TOOL_UNKNOWN/TOOL_UNREGISTERED |
| 10 | Prompt injection | deterministic routing; content is DATA never SYSTEM AUTHORITY | architecture-boundary suite |
| 11 | Memory poisoning | provenance + classification gates; memory ≠ truth | memory-security (16) |
| 12 | Source poisoning | authoritative-in-window filtering; supersession | legal-service; tax window |
| 13 | Model substitution | registry gate; no external wiring | model-gateway |
| 14 | Provider substitution | registry gate; activation REQUIRES_AUTHORITY | model-gateway |
| 15 | SQL injection | no SQL builder to Noelia; Drizzle parameterization | database-security |
| 16 | Arbitrary table access | registered adapters only; scope pushdown | database-security |
| 17 | Replay | idempotency keys + run-once unique | scheduler; API suites |
| 18 | Duplicate execution | run-once index; step resume | scheduler; workflow crash-resume |
| 19 | Approval bypass | execute re-checks authorization | EXECUTION_DENIED |
| 20 | Self-approval | maker/checker server-side | HTTP 403 self-authorize |
| 21 | Maker/checker bypass | requester ≠ approver enforced per approval | action + workflow suites |
| 22 | Quorum bypass | distinct-approver count + duplicate-approver block | completeness-expansion suite |
| 23 | Expired approval replay | validUntil enforcement at execution | EXPIRED_APPROVAL |
| 24 | Audit tampering | hash chain v2, atomic decision+audit+event | audit suites |
| 25 | Event tampering | append-only enterprise_events + watermark | scheduler suites |
| 26 | Scheduler abuse | OUTBOX only; no cron endpoints; tick idempotent | scheduler suites |
| 27 | Workflow crash-recovery abuse | committed steps never re-run | workflow crash-resume |
| 28 | Cross-OS escalation | per-domain independent authorization | cross-OS suite |
| 29 | Cross-tenant inference | scope-bound queries; UNAVAILABLE outside scope | GOVERNANCE_ANALYSIS probe |
| 30 | Unavailable-source fabrication | UNAVAILABLE/REQUIRES_AUTHORITY semantics | health boundary, FX, maturity |
| 31 | Stale-source fabrication | effective window + expiry filters | memory, RAG suites |
| 32 | Secrets exposure | env-only; errors sanitized; `.env` gitignored | HTTP error assertions |

## 2. RLS hardening (this audit)

`approvals` previously had no RLS. Migration 0017 enables RLS with the
canonical `beyu_tenant_ids()` policy and the test suite now proves real
enforcement by connecting as a **non-superuser** role: rows inserted under
one tenant GUC are invisible under another. `model_registry` is a deliberately
GLOBAL governed catalogue (no tenant column) — documented, permission-gated at
the application layer.

## 3. Boundary invariants (unchanged)

Noelia never obtains: unrestricted DB access, arbitrary SQL, arbitrary table
access, arbitrary filesystem access, arbitrary API credentials, policy-
modification authority, audit-modification authority, identity-creation
authority, ownership authority, beneficiary authority, or autonomous
financial/employment/clinical/legal authority.
