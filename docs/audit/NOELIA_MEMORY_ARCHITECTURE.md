# NOELIA — Long-Term Enterprise Memory Architecture

**Status:** IMPLEMENTED (2026-08-25) · Evidence: `tests/noelia/memory-integration.test.ts`,
`tests/noelia/memory-security.test.ts`, `tests/noelia/architecture-boundary.test.ts`.

## Position

**Memory is NOT a source of truth.** Authoritative facts live in Finance OS,
HCM, Health OS, Governance, Legal, Trust, Family Office and other canonical
domain systems. Memory stores contextual knowledge with provenance, and can
never override current authoritative data or policy.

## Storage

`enterprise_memory` (migration 0015): id, tenant, owner_user, memory_class,
content, classification, scope_type, legal_entity, country, provenance,
confidence, retention_code, legal_hold, effective_from, expires_at,
supersedes_id, status, metadata, created_by, created/updated/deleted timestamps.
RLS tenant policy + scope-shape CHECK (GLOBAL/ENTERPRISE/TENANT/ENTITY/COUNTRY
each constrain exactly the required columns).

## Memory classes (10)

`SESSION · WORKING · TASK · USER · ORGANIZATIONAL · TENANT · SECTOR ·
GOVERNANCE · STRATEGIC · INSTITUTIONAL · LONG_TERM_CONTINUITY`

(Section-H TEAM maps to TENANT/ORGANIZATIONAL semantics; LEGACY to
INSTITUTIONAL/LONG_TERM_CONTINUITY — canonical superset retained.)

## Governance per record

- **owner** — created_by + owner_user_id (USER class private to owner unless
  enterprise scope)
- **provenance** — `noelia-memory/principal/<userId>` or knowledge source
- **confidence** — nullable numeric (5,4); never invented
- **classification** — ABAC ceiling enforced at write AND read
- **scope** — tenant/entity/country with composite shape CHECK
- **retention** — retention_code (default STANDARD)
- **expiry** — expires_at; in-window retrieval only
- **supersession** — supersedes_id + status SUPERSEDED (never deleted)
- **deletion policy** — status DELETED + deleted_at (soft)
- **legal hold** — legal_hold flag; held records survive retention expiry
- **access audit** — every write audited (`ai.noelia.memory.write`) + evented
  (`NOELIA_MEMORY_WRITTEN`); reads go through `decideMemoryClassVisibility`

## Retrieval gate

`decideMemoryClassVisibility` (pure): ACTIVE + in-window + classification
clearance + USER-owner rule + tenant + entity + country. Retrieval searches
only visible rows (SQL pushdown for tenant/classification/window + content
regex) then re-applies the pure gate.

## Poisoning resistance

- Memory content is DATA: it cannot modify policy, registry entries, roles,
  or any authority structure (no code path from memory to policy).
- Superseded/expired memory never surfaces as current.
- Writes require `ai:memory.write`; classification above clearance DENIED;
  entity outside scope DENIED.
- Adversarial tests (malicious memory, classification escalation, scope
  escape) PASS.
