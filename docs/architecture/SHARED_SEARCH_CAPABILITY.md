# BEYU OS — Shared Search capability (SHARED_SEARCH)

**Status:** implemented. Search is a **shared BEYU OS capability** — registered in
`os_registry` with kind `SHARED_CAPABILITY` (`SHARED_SEARCH`). It is **not an OS**:
no Search OS, Knowledge OS or Documents OS was created, and no Sector OS duplicate
search engine exists or is permitted.

---

## 1. What it is

One governed, cross-OS full-text search over records the principal can **already**
read. A single endpoint (`GET /api/v1/search`), a single registry of searchable
resources, a single execution service, one UI control in the existing OS shell
header.

## 2. Why this architecture (reuse decisions)

Precedence applied, per the architecture brief: existing shared search → none
found in `main` → **PostgreSQL full-text search** on the existing database,
inside the existing guarded/RLS stack. No Elasticsearch/OpenSearch/Meilisearch/
Typesense/Algolia, no vector DB, no new dependency, no new event bus, no second
tenant/authorization/audit/RLS/frontend-search mechanism.

- **Index:** one regular `search_tsv tsvector` column (migration `0066`) per
  searched table + GIN index. A BEFORE INSERT OR UPDATE trigger
  (`beyu_search_tsv_<table>`, SECURITY INVOKER — the repository deliberately
  avoids SECURITY DEFINER) recomputes it from the display fields on every row
  write, so the vector can never drift from the data: no separate index store,
  no event bus, no stale-index failure mode.
- **Why NOT a generated column (tested decision):** the first design used
  `GENERATED ALWAYS AS (…) STORED`. The repository's row-copy fixture idiom —
  `insert into <t> select (jsonb_populate_record(null::<t>, to_jsonb(r)||
  overrides).* ) from <t> r …`, used by 16 existing test fixtures across 9
  suites — explicitly inserts every column, and PostgreSQL rejects explicit
  values for generated columns (SQLSTATE 428C9). That silently broke five
  existing security (RLS) suites. The repository has **no** generated-column
  convention and an established trigger convention for row-derived state
  (0056/0057 maintain derived columns the same way). 0066 was converted to a
  trigger-maintained regular column; the generated-column attempt was rejected
  and the existing fixtures were NOT modified to fit it.
- **Query parsing:** `websearch_to_tsquery` (pathologically safe: operators and
  wildcards degrade to literal tokens; parameterized — no injection).
- **Authorization:** the existing chain, untouched:
  `session → resolvePrincipal → can(platform:search.read) → withTenantDatabaseContext
  (transaction-local RLS GUCs) → per-source can(source.permission) →
  tenantScopeIds / entityScope / classificationsAtOrBelow → PostgreSQL RLS`.
- **Noelia knowledge:** the KNOWLEDGE source reuses the **existing**
  `resolveNoeliaAuthorizedScope` + `decideMemoryVisibility` gate — the Noelia
  governance boundary, not a parallel one. Noelia and HIVE are otherwise
  unchanged (no auto-connect).

## 3. Searchable-resource registry

`src/lib/search/resources.ts` declares, per resource: result `type`, canonical
`os`, the **existing** read `permission`, `entityBound`, `deepLink`, and the
`fetch`/`count` queries. v1 registry (only resources that exist and are
RLS-protected):

| type | OS | existing read permission | entityBound |
|---|---|---|---|
| TENANT | BEYU | organization:entity.read | no (row IS the tenant; subtree-filtered) |
| LEGAL_ENTITY | BEYU | organization:entity.read | yes (its own id) |
| DOCUMENT | BEYU | documents:registry.read | no (free-text entity scope → refused for entity-scoped principals) |
| GOVERNANCE_RESOLUTION | BEYU | governance:resolution.read | no |
| KNOWLEDGE | BEYU | ai:noelia.query | yes |
| UJENZI_PROJECT | UJENZI | ujenzi:data.read | yes |
| UJENZI_BOQ | UJENZI | ujenzi:data.read | yes (via project's legal_entity_id) |
| AGRICULTURE_FARM | AGRICULTURE | agriculture:data.read | yes |
| AGRICULTURE_PROJECT | AGRICULTURE | agriculture:data.read | yes |
| FOUNDATION | FOUNDATION | foundation:registry.read | yes |

Finance and Health have **no v1 sources** (documented limitation, §10).

### Sensitive-field review (per resource)

- **DOCUMENT:** snippet from file_name/description/category/version/source only —
  no checksum, storage_uri, access policy or retention internals in results.
- **KNOWLEDGE (Noelia):** content is MATCHED for findability but the snippet is
  title/code/domain only — content excerpts never cross the search boundary;
  every row additionally passes `decideMemoryVisibility` as the final gate.
- **GOVERNANCE_RESOLUTION:** title/reference/summary/category only — no vote
  tallies, rationale or data_basis in the result payload.
- **FOUNDATION:** legal/operating name, code, vehicle, status, mission, purpose —
  no donor/fund/beneficiary data (those are separate, separately-governed
  registries not in the search surface).
- **UJENZI / AGRICULTURE:** display fields only; no cost values, no GPS
  coordinates, no HSE/claim detail.
- Every result carries `classification` (never above the principal's ceiling);
  the raw record is never returned — the result is governed metadata + a
  canonical deep link.

## 4. API contract

`GET /api/v1/search?q=…[&os=…][&type=…][&limit=…][&offset=…]` via `guarded()`:

- permission `platform:search.read` (granted to 11 read roles; **not**
  TENANT_MEMBER), action `search.query`, rate limit 60/60 s.
- `q` required, trimmed, 2..200 chars; `os`/`type` are **narrowers only**
  (never authorization inputs); `limit` 1..50 (default 20); `offset` 0..500.
- There is **no** tenant/entity/country/clearance parameter: scope comes
  exclusively from the principal.
- Result shape: `{ type, os, id, title, subtitle, snippet, classification,
  deepLink, rank }` — governed metadata only. `total` is the honest
  per-source-capped bound; `sourcesSearched` lists the types actually searched.
- Read-only: non-GET methods → 405.
- Every hit carries `classification` (never above the principal's ceiling) and
  a `deepLink` whose destination **re-runs its own server-side guard** — the
  URL is navigation, never authorization.

## 5. Security model

1. **RBAC:** search requires `platform:search.read`; each source additionally
   requires its own existing read permission — search surfaces nothing the
   principal cannot already read and grants no new capability.
2. **Classification ceiling:** unknown clearance fails closed (empty allow-list);
   every row is filtered `classification <= clearance` and RLS-backed.
3. **Tenant isolation:** `tenantScopeIds(principal)` (canonical resolver) + RLS
   on every searched table. The `tenants` table (no row RLS) is explicitly
   subtree-filtered.
4. **Entity scope (fail-closed):** a principal scoped to legal entities is
   filtered to `legal_entity_id IN scope` on entity-bound sources, and is
   **refused** sources without an entity key — never widened to tenant level.
5. **No sensitive fields:** snippets come from `ts_headline` over the exact
   free-text display expression the trigger indexes; the KNOWLEDGE snippet is
   title/code/domain only (content is matched for findability, never rendered),
   and every knowledge row passes `decideMemoryVisibility` as the final gate.
6. **CAP_POSTING intact:** search has no write path; nothing in the search
   chain posts, mutates, approves or grants. The search endpoint is read-only
   (405 on all mutation verbs).
7. **Audit:** success audits record `objectId = search:sha256(q)[:32]` — the raw
   query is **never** stored or logged; denials are audited by `guarded()`.
8. **Pathological input:** `websearch_to_tsquery` + bounded length/limit/offset
   + per-source cap (25) + GIN indexes; no wildcard/regex amplification.
9. **Trigger is not an authorization surface:** the 0066 triggers read only the
   row's own NEW display fields and write only NEW.search_tsv. They grant no
   access, read no other row, cannot bypass RLS or the authorization chain, and
   are SECURITY INVOKER (no privilege escalation). The vector changes what a row
   MATCHES, never who may see it.

## 6. Permission model — why `platform:search.read`

The repository's permission taxonomy already distinguishes *facility* read
permissions on the control plane (`platform:dashboard.read`,
`platform:registry.read`) from domain read permissions on capability owners
(`hcm:employee.read`, `familyoffice:*.read`, `agriculture:data.read`,
`foundation:registry.read`, `ai:noelia.query`).

- Search is a **control-plane facility** (a SHARED_CAPABILITY of BEYU OS), not a
  domain with its own data — so `platform:search.read` follows the
  `platform:*.read` precedent, not a new domain prefix.
- A dedicated permission is required (not reusing an existing domain read)
  because `guarded()` binds exactly one permission per route, and the facility
  must be grantable **without** implying any single domain's read. Reusing,
  say, `organization:entity.read` would conflate "may read entities" with
  "may use the cross-OS search facility".
- **Facility permission ≠ result visibility.** `platform:search.read` grants
  nothing of its own: for every source the service additionally requires the
  source's own read permission (`can(principal, source.permission)`), plus the
  tenant/entity/classification scope. A principal holding only
  `platform:search.read` sees exactly the sources they can already read — a
  principal without `documents:registry.read` gets zero DOCUMENT hits, and an
  entity-scoped principal is refused entity-key-less sources entirely.
- Role grants (11 roles: PLATFORM_ADMIN, GROUP_CEO, GROUP_CFO,
  CHIEF_GOVERNANCE_OFFICER, CHIEF_RISK_COMPLIANCE, FAMILY_OFFICE_PRINCIPAL,
  HCM_DIRECTOR, SECTOR_OPERATOR, FOUNDATION_DIRECTOR, FOUNDATION_OFFICER,
  AUDITOR) are intentional enterprise read roles. TENANT_MEMBER is
  deliberately NOT granted the facility (tenant-scoped members have no
  cross-OS search requirement; the 403 boundary is covered by a test).

## 7. Frontend

`src/components/global-search.tsx` — the single search control, EXTENDING the
existing `/os` shell header right cluster (no duplicate search bar). Client
combobox: 300 ms debounce, AbortController, relative fetch (session cookie
only), ARIA combobox/listbox semantics with keyboard navigation, loading /
error / empty states, responsive width. Result groups are derived from the
`os` of each authorized hit; display names come from the canonical OS
catalogue (`operating-system-catalog.ts`) — no hardcoded OS group list. The
control renders only for principals holding the grant (presentation only);
authorization is server-enforced — the UI never acts as the authorization
boundary. Existing light enterprise UI and BEYU branding preserved.

## 8. Noelia / HIVE

Noelia is integrated **through the existing governance boundary only**: the
KNOWLEDGE source resolves `resolveNoeliaAuthorizedScope(principal)` and applies
`decideMemoryVisibility` to every row. No auto-connect, no new Noelia
endpoint, no change to the HIVE runtime or Noelia self-service. Noelia stays
governed, RBAC/ABAC-scoped, tenant-isolated, RLS-protected, auditable,
non-self-authorizing. **Search does not expand Noelia authority**: it reads
knowledge_sources through the same scope rules Noelia's own query path uses,
adds no grant, and renders no content beyond title/code/domain.

## 9. Auditability

- `search.query` SUCCESS audits: actor, tenant, IP/UA, trace, and a
  fingerprint (`search:sha256…`) sufficient to correlate/attribute searches
  without exposing terms.
- DENIED audits: emitted by `guarded()` (permission, clearance or rate-limit
  failures) with the standard reason fields.
- No sensitive search terms, contents, secrets or credentials in any log.

## 10. Performance & data

GIN-indexed FTS (`@@ websearch_to_tsquery`), bounded per-source fetch (25) and
page size (50), offset window (500), sequential execution on the one pinned
request connection, headline/rank computed in SQL. No premature optimization;
no caching layer (the corpus is bounded and the queries are indexed).

### Migration (0066)

Additive only: per table — `ADD COLUMN IF NOT EXISTS search_tsv tsvector`,
`CREATE OR REPLACE FUNCTION beyu_search_tsv_<table>` (SECURITY INVOKER
plpgsql), `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER … BEFORE INSERT OR UPDATE`,
`DROP INDEX IF EXISTS` + `CREATE INDEX … USING gin`, and an idempotent
deterministic backfill `UPDATE` for pre-existing rows. Re-running is a no-op.
Nothing pre-existing is dropped, narrowed or rewritten; RLS untouched; no
destructive data changes. Display expressions index free-text fields only
(enum casts are banned in generated expressions on PG16 — `enum_out` is STABLE;
the trigger keeps the same free-text surface, and status/type remain
post-match metadata).

The `os_registry` seed row `SHARED_SEARCH` (kind `SHARED_CAPABILITY`,
dependencies `["BEYU_OS"]`, apis `["/api/v1/search"]`) is idempotent
(`onConflictDoNothing`).

## 11. Tests

- `tests/search/governed-search.service.test.ts` — service-level: auth
  exclusions, facility-permission-without-source-read (no results),
  classification ceilings, tenant isolation, entity fail-closed, per-source
  permission narrowing, knowledge visibility gate, index maintenance
  (INSERT/UPDATE/DELETE/backfill), pagination, empty/malformed/pathological
  queries, CAP_POSTING/405 read-only boundary.
- `tests/search/search-api.test.ts` — HTTP API: 401/403/422/429, read-only
  405, audit fingerprint (raw query never stored), response shape.
- `tests/security/search-rls-isolation.test.ts` — adversarial: direct
  `set_config` tenant-GUC manipulation cannot widen search scope; RLS backstop
  holds for every searched table.
- `tests/frontend/global-search.test.ts` — component renders the single
  control, respects the `visible` grant, issues a relative cookie-only
  request, suppresses unauthorized results (server-authoritative).

## 12. Known limitations

- Finance and Health OS have no v1 searchable sources (their record sets are
  not part of the v1 registry); add via a reviewed registry edit + (if needed)
  an additive FTS column.
- Search returns at most 25 ranked rows per source and 50 per page: a corpus
  with >25 matches in one source truncates (`total` reflects the capped bound).
- Snippets are English-language FTS; the corpus is English-first.
- Deep links point to the canonical collection route (e.g. `/os/documents`),
  not a per-record URL — the destination page re-applies all guards.
