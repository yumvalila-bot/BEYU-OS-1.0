# NOELIA MEMORY GOVERNANCE

## Position

**Memory is NOT a source of truth.** Authoritative facts live in Finance OS,
HCM, Health OS, Governance, Legal, Trust, Family Office and other canonical
domain systems. Memory stores contextual knowledge with provenance, and can
never override current authoritative data or policy.

## Storage

Table: `enterprise_memory` (migration 0015). Columns include:

- `id`, `tenant`, `owner_user`, `memory_class`, `content`, `classification`
- `scope_type`, `legal_entity`, `country`
- `provenance`, `confidence`, `retention_code`
- `legal_hold`, `effective_from`, `expires_at`
- `supersedes_id`, `status`, `metadata`
- `created_by`, `created_at`, `updated_at`, `deleted_at`

Row-level security: `FORCE ROW LEVEL SECURITY` through canonical
`beyu_tenant_ids()` / `beyu_global_scope()` helpers.

## Memory Classes

| Class | Description | Isolation |
|---|---|---|
| `SESSION` | Current conversation context | Session scope |
| `USER_PREFERENCE` | User preference data | User + tenant |
| `WORKFLOW_PREFERENCE` | Preferred workflow patterns | User + tenant + entity |
| `PROFESSIONAL_CONTEXT` | Professional profile context | User + entity |
| `ORGANIZATIONAL_CONTEXT` | Organization-level context | Tenant + entity |
| `OS_CONTEXT` | Operating-system context | OS + tenant |
| `APPROVED_LONG_TERM_MEMORY` | Authorized persistent memory | User + tenant + classification |
| `SYSTEM_CONTEXT` | System-level context | System scope |

## Governance Per Record

Every persistent memory item must have:

- `owner` — `created_by` + `owner_user_id` (`USER` class private to owner unless enterprise scope)
- `scope` — `GLOBAL` / `ENTERPRISE` / `TENANT` / `ENTITY` / `COUNTRY` (composite shape CHECK enforces column constraints)
- `source` — provenance reference (`noelia-memory/principal/<userId>` or knowledge source)
- `created_at` / `updated_at` — timestamp metadata
- `consent` — consent status (`GRANTED` / `REVOKED` / `PENDING`)
- `classification` — ABAC ceiling (`PUBLIC` / `INTERNAL` / `CONFIDENTIAL` / `RESTRICTED` / `HIGHLY_RESTRICTED`)
- `retention` — retention code (`STANDARD` / `EXTENDED` / `PERMANENT`)
- `provenance` — provenance record linking memory to authoritative source
- `legal_hold` — boolean flag for legal hold
- `status` — `ACTIVE` / `SUPERSEDED` / `DELETED` (soft deletion; superseded records never surface)

## Retrieval Gate

`decideMemoryVisibility` (pure function) applies:

1. `ACTIVE` status
2. In-window retrieval (`effective_from` ≤ now < `expires_at`)
3. Classification clearance (`classification_rank(memory.classification)` ≤ `classification_rank(principal.clearance)`)
4. User-owner rule (`USER` class: owner must match; `ORGANIZATIONAL` / `TENANT`: tenant scope; `ENTERPRISE`: enterprise scope with subtree tenant check)
5. Tenant isolation (`memory.tenant` in `principal.tenantScope`)
6. Entity isolation (`memory.legal_entity` in `principal.entityScope` or null)
7. Country isolation (`memory.country` in `principal.countryScope` or null)
8. OS authorization (`OS_CONTEXT` requires `osId` match)
9. Classification ceiling (`principal.clearance` must cover `memory.classification`)

Retrieval uses SQL pushdown for tenant/classification/window, then re-applies
the pure gate on returned rows.

## Poisoning Resistance

- Memory content is DATA: it cannot modify policy, registry entries, roles,
  or any authority structure. No code path exists from memory to policy.
- Superseded (`status = SUPERSEDED`) or expired (`now >= expires_at`)
  memory never surfaces as current.
- Writes require `ai:memory.write`. Classification above clearance = DENIED.
  Entity outside scope = DENIED. Country outside scope = DENIED.
- Deletion is soft (`status = DELETED` + `deleted_at`); supersession is
  preferred (`status = SUPERSEDED` + `supersedes_id`) to preserve audit chain.

## Source of Truth

- Schema: `src/db/schema/ai.ts` (`enterprise_memory` — referenced through `db/schema/core.ts` or equivalent; see `docs/audit/NOELIA_MEMORY_ARCHITECTURE.md`)
- Implementation: `src/lib/noelia/memory.ts` (`decideMemoryVisibility`, `retrieveGovernedMemory`)
- Tests: `tests/noelia/memory-integration.test.ts`, `tests/noelia/memory-security.test.ts`, `tests/noelia/architecture-boundary.test.ts`
