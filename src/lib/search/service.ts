/**
 * BEYU OS — Shared Search capability: governed execution engine.
 *
 * ONE shared BEYU OS capability (kind SHARED_CAPABILITY in os_registry). It is
 * not a Search OS and it owns no data: every result is a live read of an
 * already-existing, already-RLS-protected table inside the canonical
 * transaction-scoped tenant context that `guarded()` establishes for every
 * request.
 *
 * Authorization flow (existing architecture, nothing parallel):
 *
 *   session → resolvePrincipal()          (IDENTITY)
 *   → can(principal, "platform:search.read")  (RBAC — the search key itself)
 *   → withTenantDatabaseContext(principal) (transaction-local RLS GUCs)
 *   → per source: can(principal, source.permission)   (per-source RBAC)
 *   → tenantScopeIds / entityScope / classificationsAtOrBelow   (ABAC)
 *   → PostgreSQL RLS on every searched table           (database backstop)
 *
 * Consequences:
 *   - a search can only surface what the principal may already read through
 *     the normal governed API (each source keeps its own read permission);
 *   - no request parameter can widen scope (tenant/entity/country/clearance
 *     are resolved from the principal only);
 *   - search has no write path: it never posts, mutates, approves or grants —
 *     CAP_POSTING stays LOCKED;
 *   - a source whose permission the principal lacks is skipped (fail-closed);
 *     an entity-scoped principal is refused sources without an entity key.
 */
import { inArray } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { legalEntities } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import {
  classificationsAtOrBelow,
  isKnownClassification,
} from "@/lib/constants";
import { can } from "@/lib/authz";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import { SEARCH_SOURCES, type SearchHit, type SourceQueryInput } from "./resources";
import type { ParsedSearchQuery } from "./query";

export type SearchPublicResult = {
  type: string;
  os: string;
  id: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  classification: string | null;
  deepLink: string;
  rank: number;
};

export type GovernedSearchResult = {
  query: string;
  results: SearchPublicResult[];
  total: number;
  limit: number;
  offset: number;
  /** The result types actually searched (permission- and filter-eligible). */
  sourcesSearched: string[];
};

/**
 * Execute the governed search for the resolved principal.
 *
 * Must run inside the canonical transaction-scoped tenant context
 * (`withTenantDatabaseContext`), exactly like every other read service — the
 * RLS GUCs are what make the searched tables enforce tenant/entity isolation
 * at the database layer.
 */
export async function runGovernedSearch(
  principal: Principal,
  input: ParsedSearchQuery,
): Promise<GovernedSearchResult> {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Shared search requires canonical transaction-scoped tenant context");
  }

  // Fail-closed on unknown clearance: no allow-list, no results (the same rule
  // every BEYU read service applies — an unknown clearance ranks as the
  // highest classification and would authorize everything).
  const classifications = classificationsAtOrBelow(principal.clearance);
  const empty: GovernedSearchResult = {
    query: input.query,
    results: [],
    total: 0,
    limit: input.limit,
    offset: input.offset,
    sourcesSearched: [],
  };
  if (!isKnownClassification(principal.clearance) || classifications.length === 0) return empty;

  const tenantIds = await tenantScopeIds(principal);
  if (tenantIds.length === 0) return empty;

  // Resolve every requested entity back to its canonical tuple once. The
  // entityScope array only narrows the requested result set; it never grants
  // access. Each source permission must match the entity's tenant/entity/
  // country on one live authority tuple below.
  const requestedEntityIds = principal.entityScope.length > 0
    ? [...new Set(principal.entityScope)]
    : [];
  const scopedEntities = requestedEntityIds.length > 0
    ? await db
        .select({
          id: legalEntities.id,
          tenantId: legalEntities.tenantId,
          countryCode: legalEntities.countryCode,
        })
        .from(legalEntities)
        .where(inArray(legalEntities.id, requestedEntityIds))
    : [];

  // The canonical Noelia scope — reused only when a knowledge search is
  // actually happening, so a search without ai:noelia.query never pays for it.
  let knowledgeScope: SourceQueryInput["knowledgeScope"] = null;

  const sourcesSearched: string[] = [];
  const merged: SearchHit[] = [];
  let total = 0;

  // Sequential, on the one pinned request connection: bounded (per-source cap
  // + limit), deterministic ordering, no concurrency on the RLS transaction.
  for (const source of SEARCH_SOURCES) {
    if (input.os && source.os !== input.os) continue;
    if (input.type && source.type !== input.type) continue;
    // Per-source RBAC+ABAC: search surfaces only what one canonical authority
    // tuple already permits. For entity-scoped principals, validate each
    // requested entity against its persisted tenant/country tuple; never
    // authorize from flattened entityScope or permission summaries.
    let entityIds: string[] | null = null;
    if (requestedEntityIds.length > 0) {
      if (!source.entityBound) continue;
      entityIds = scopedEntities
        .filter((entity) => tenantIds.includes(entity.tenantId))
        .filter((entity) => can(principal, source.permission, {
          tenantId: entity.tenantId,
          entityId: entity.id,
          countryCode: entity.countryCode,
        }).allowed)
        .map((entity) => entity.id);
      if (entityIds.length === 0) continue;
    } else if (!can(principal, source.permission).allowed) {
      continue;
    }
    // Knowledge source: resolve the existing Noelia scope once, lazily.
    if (source.type === "KNOWLEDGE" && knowledgeScope === null) {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      knowledgeScope = { ...scope, asOf: new Date().toISOString().slice(0, 10) };
    }

    const queryInput: SourceQueryInput = {
      principal,
      query: input.query,
      tenantIds,
      classifications,
      entityIds,
      maxPerSource: 25,
      knowledgeScope,
    };

    const [hits, count] = await Promise.all([source.fetch(queryInput), source.count(queryInput)]);
    sourcesSearched.push(source.type);
    merged.push(...hits);
    total += Math.min(count, 25); // per-source cap is the honest bound
  }

  // Deterministic global ordering: relevance, then type, then title.
  merged.sort((a, b) => (b.rank - a.rank) || a.type.localeCompare(b.type) || a.title.localeCompare(b.title));

  const page = merged.slice(input.offset, input.offset + input.limit);

  return {
    query: input.query,
    results: page.map((r) => ({
      type: r.type,
      os: r.os,
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      snippet: r.snippet,
      classification: r.classification,
      deepLink: r.deepLink,
      rank: Number(r.rank.toFixed(6)),
    })),
    total,
    limit: input.limit,
    offset: input.offset,
    sourcesSearched,
  };
}
