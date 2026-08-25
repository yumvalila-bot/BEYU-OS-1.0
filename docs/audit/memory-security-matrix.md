# NOELIA — Memory Security Matrix (Iteration 11)

**Status: 🟢 IMPLEMENTED / VERIFIED**
**Store:** `knowledge_sources` (single canonical memory table).
**Write service:** `src/lib/noelia/memory-write.ts` (this iteration).
**Read/visibility:** `src/lib/noelia/memory.ts` (SQL pushdown + pure gate).
**Migration:** `drizzle/0015_memory_governance.sql` (new; no existing migration modified).
**Tests:** `tests/noelia/memory-write.test.ts` (15 adversarial), `tests/noelia/memory-integration.test.ts`, `tests/noelia/memory-security.test.ts`.

---

## 1. Canonical memory classes

| Class | Visibility rule | Notes |
|-------|-----------------|-------|
| `GLOBAL` | Any authorized principal | enterprise-only at write time |
| `ENTERPRISE` | enterprise principal, tenant in subtree | never treated as global |
| `TENANT` | principal within the tenant | |
| `ENTITY` | principal within tenant + entity | |
| `COUNTRY` | principal within tenant + country | |
| `ORGANIZATIONAL` *(new)* | any principal within the tenant subtree | org-wide for one tenant; no enterprise flag required |
| `LONG_TERM_CONTINUITY` *(new)* | enterprise principal only; `expires_at IS NULL` enforced by DB CHECK | continuity memory never expires |

Unknown scope classes fail closed at three layers: the SQL `CHECK`
(`knowledge_sources_scope_shape_ck`), the write-service validation
(`UNKNOWN_SCOPE`/`SCOPE_SHAPE_INVALID`), and the read-time visibility gate
(`SCOPE_UNKNOWN` denial).

## 2. Class registration / schema / ownership / retention

- **Registration:** scope classes are a closed vocabulary
  (`KNOWLEDGE_SCOPE_TYPES`), mirrored in the DB CHECK.
- **Schema:** code (unique), title, domain, provenance (required),
  classification, authorityStatus (AUTHORITATIVE/UNDER_REVIEW/SUPERSEDED/
  EXPIRED/REJECTED), validity window (effectiveFrom/reviewDate/expiresAt),
  content, keywords, version.
- **Ownership/provenance (new):** `created_by_user_id`, `updated_by_user_id`
  (FK → users), `created_at`, `updated_at`, `content_checksum` (SHA-256 of
  content, application-computed; NULL = UNVERIFIED_LEGACY and fails closed on
  integrity verification).
- **Retention/deletion policy:** memory is evidence. The only sanctioned
  removal is **decommission** (`authorityStatus=REJECTED`,
  `decommissioned_at` set). There is no hard-delete path in application code;
  decommissioned records remain queryable by assurance roles.

## 3. Write path (WRITE → VALIDATE → CLASSIFY → AUTHORIZE → STORE → INDEX)

Every mutation goes through `upsertMemorySource` / `decommissionMemorySource`:

| # | Control | Denial code |
|---|---------|-------------|
| 1 | Canonical transaction context required | `CONTEXT_MISSING` |
| 2 | RBAC: `knowledge:source.write` (granted to PLATFORM_ADMIN, CHIEF_GOVERNANCE_OFFICER, GROUP_CEO) | `PERMISSION_DENIED` |
| 3 | Scope shape valid; unknown class denied | `UNKNOWN_SCOPE`, `SCOPE_SHAPE_INVALID` |
| 4 | Target tenant inside the writer's tenant subtree (enterprise = full subtree; sector = own tenant) | `TENANT_OUT_OF_SCOPE` |
| 5 | GLOBAL memory enterprise-only | `GLOBAL_REQUIRES_ENTERPRISE` |
| 6 | Classification ≤ writer clearance | `CLASSIFICATION_ESCALATION` |
| 7 | **AI/SERVICE actors are forced to `UNDER_REVIEW`** — AI-originated memory can never be authoritative (poisoning resistance) | n/a (forced) |
| 8 | Substantive provenance required (≥ 8 chars) | `PROVENANCE_MISSING` |
| 9 | Window: effectiveFrom ≤ reviewDate; expiresAt > reviewDate; new record current at creation | `WINDOW_INVALID` |
| 10 | LONG_TERM_CONTINUITY never expires | `CONTINUITY_EXPIRES_INVALID` |
| 11 | Idempotent replay: same code+content+version → no-op, attempt audited | n/a (replay-safe) |
| 12 | Content change → minor version bump + new checksum | n/a |
| 13 | Atomic: mutation + audit + event in one transaction | n/a |

## 4. Read path (RETRIEVE → VERIFY → PRESENT)

- SQL pushdown: scope predicates per class + `authorityStatus =
  'AUTHORITATIVE'` + validity window + classification ceiling, inside the
  transaction-local RLS context (`SET LOCAL beyu.current_tenant_ids`).
- Defence in depth: `decideMemoryVisibility` re-checks every row
  (authority, window, clearance, composite scope) before presentation.
- RLS policy `knowledge_sources_scope_isolation` blocks cross-tenant rows at
  the database level (tested by existing tenant-isolation suites).
- Retrieved sources carry epistemic provenance (Iteration 10):
  `epistemicClass`, `authorityStatus`, validity window → feed the answer's
  uncertainty assessment.
- **Integrity verification:** `verifyMemoryIntegrity` recomputes the SHA-256
  of every visible record's content; MISMATCH = tampering detected,
  UNVERIFIED_LEGACY = fail-closed (never silently OK).

## 5. Adversarial coverage (15 tests)

| Attack | Result |
|--------|--------|
| Unauthorized memory write (no permission) | `PERMISSION_DENIED` |
| Cross-tenant write (outside subtree) | `TENANT_OUT_OF_SCOPE` |
| Global-write escape from sector writer | `GLOBAL_REQUIRES_ENTERPRISE` |
| Classification escalation | `CLASSIFICATION_ESCALATION` |
| Provenance loss | `PROVENANCE_MISSING` |
| Stale window at creation | `WINDOW_INVALID` |
| Unknown scope class / bad shape | `UNKNOWN_SCOPE` / `SCOPE_SHAPE_INVALID` |
| **Memory poisoning via AI actor** | forced `UNDER_REVIEW`; content never retrievable |
| **Memory poisoning after the fact (tamper)** | integrity `MISMATCH` |
| Replay (identical re-submission) | idempotent no-op, version unchanged, audited |
| Content mutation | version bump 1.0.0 → 1.1.0 + checksum update, integrity OK |
| **Deletion bypass** | only decommission exists; record retained as evidence, not retrievable |
| ORGANIZATIONAL cross-tenant read | denied to other tenants; visible inside tenant (incl. non-enterprise) |
| LONG_TERM_CONTINUITY visibility | enterprise-only; expiry structurally impossible |

## 6. "No memory is authoritative merely because it exists"

Authority is a governed property: `authorityStatus` defaults to
AUTHORITATIVE only in the bootstrap seed; runtime AI writes are forced to
UNDER_REVIEW; retrieval admits only in-window AUTHORITATIVE records; the
checksum makes silent content substitution detectable; every mutation is
attributed (user id), versioned, and audited with an event.

## 7. Residuals

- Physical deletion / retention expiration is an operator procedure (DBA),
  deliberately absent from the application surface.
- No API route exposes memory writes yet — the service is available to
  governed workflows; an HTTP surface (with the standard validation/audit
  envelope) is in scope for the Iteration 13 API workstream if required.
