# NOELIA — Architecture Integrity

**Date:** 2026-08-25 · **Gate: 🟢 GREEN**

## 1. Constitutional invariants (unchanged)

```
AUTHENTICATION → PRINCIPAL → RBAC → ABAC → TENANT → ENTITY → COUNTRY →
CLASSIFICATION → POLICY → SOURCE AUTHORIZATION → CAPABILITY → TOOL →
BEYU SERVICE → CONTEXT-AWARE DATABASE → ANALYSIS/ACTION → OUTPUT
VALIDATION → AUDIT → EVENT
```

Noelia remains **governed intelligence, not sovereign authority**. This audit
extended capabilities **behind** the boundary; nothing was bypassed, weakened,
duplicated or replaced.

## 2. Architecture rules honored

| Rule | Status |
|---|---|
| Drizzle only; never Prisma; no second migration system | ✅ |
| Migrations numbered/additive/RLS-aware/checksummed/snapshot-committed | ✅ 0000–0017 |
| No `drizzle-kit push` on production schema | ✅ (generate → SQL → migrate) |
| No second DB/identity/authz/audit/event system | ✅ |
| Noelia never receives an unrestricted DB handle or arbitrary SQL | ✅ `db` context wrapper + registered adapters |
| Canonical specialist engines reused, never duplicated | ✅ analytics = adapters over treasury/risk/FP&A/forecast |
| HIVE boundary preserved; deterministic internal execution | ✅ external models DENY |
| Tool registry declaration == registration | ✅ contract equality tested |
| RLS on every tenant table | ✅ approvals hardened in 0017; `model_registry` documented global |
| Single source of truth per domain | ✅ memory/RAG are DATA, never truth |
| No dead-end implementations | ✅ audit loop: every declared capability executable or explicitly classified |

## 3. Changes introduced this audit (all additive)

1. **Migration 0017** (additive): `approvals.valid_until/quorum/
   delegated_from`, `model_registry.latency_ms/fallback_model_id/
   effective_from/retired_at`, approvals RLS enablement + policy,
   `enterprise_memory_memory_class_ck` extended with ENTERPRISE.
2. **Workflow runtime**: quorum (distinct approvers, duplicate-approver
   block), approval expiry enforcement at execute, QUORUM_PARTIAL/
   QUORUM_NOT_MET/EXPIRED_APPROVAL codes; authorize route exposes
   validUntil/quorum/delegatedFrom.
3. **Analytics**: GOVERNANCE_ANALYSIS (17th type) over the canonical control
   plane with scope pushdown.
4. **Executive**: §III sections + BOARD/EXECUTIVE/OPERATIONAL structure;
   structured tool recommendations adopted verbatim.
5. **Cross-OS**: 12-domain catalogue; unregistered domains honest UNAVAILABLE.
6. **Memory**: ENTERPRISE class (constraint extended in 0017).
7. **Model gateway**: exposes the full metadata contract.

## 4. Integrity checks

- `git diff --check` clean; no secrets; migrations + snapshots tracked.
- Fresh-install path verified (0000→0017 on a clean database).
- Full regression 1620/1620; tsc/eslint/build clean; live HTTP verified.
- Noelia's authority surface measured: reads from registered adapters only;
  writes only to its own evidence/memory/schedule/workflow tables through the
  governed services; audit+event writes atomic with decisions.

## 5. Known, documented positions

- `authorize()` pins approverRole `CHIEF_GOVERNANCE_OFFICER` (role-granted
  only; documented, not a blocker).
- Local dev DB role is superuser (RLS bypassed locally); production must use
  a non-superuser role — RLS enforcement is proven by the probe test.
- `model_registry` is a global catalogue (no tenant column) — documented.
