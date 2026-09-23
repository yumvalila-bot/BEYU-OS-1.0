/**
 * BEYU OS — Shared Search capability: canonical searchable-resource registry.
 *
 * Search is ONE shared BEYU OS capability (kind SHARED_CAPABILITY in
 * os_registry). It is NOT a Search OS, Knowledge OS or Documents OS, and each
 * Sector OS keeps its own records — search only reads across the boundary
 * that already exists.
 *
 * This registry is the single declaration of WHAT may be searched. For each
 * resource it pins:
 *
 *   type            — the stable result type (e.g. TENANT, UJENZI_BOQ).
 *   os              — the canonical source OS code. Result groups in the UI
 *                     are derived from this via the one OS catalogue, never
 *                     hard-coded per group.
 *   permission      — the EXISTING read permission that must be held for this
 *                     source to be searched. Search surfaces only what the
 *                     principal may already read through the normal API; it
 *                     grants no new capability (CAP_POSTING stays LOCKED).
 *   entityBound     — whether the row carries a legal_entity_id the principal's
 *                     entity scope can be enforced on. Sources WITHOUT an
 *                     entity key are skipped (fail-closed, refused rather than
 *                     widened) for entity-scoped principals — the same rule the
 *                     guarded() boundary applies to sector capabilities.
 *   deepLink        — the canonical route for the record. The destination page
 *                     re-runs its own server-side guard: the link is
 *                     navigation, never authorization.
 *
 * Snippets are built with `ts_headline` from the EXACT text expression that
 * migration 0066 indexes (the trigger-maintained search_tsv column's display
 * fields), so a restricted field can never leak through a snippet. For KNOWLEDGE the
 * headline is built from title/code/domain only — content is matched for
 * findability but its text never crosses the search boundary, and every row
 * is additionally gated by the existing Noelia knowledge visibility rule
 * (`decideMemoryVisibility`), which is the existing governance boundary, not
 * a parallel one.
 *
 * The v1 registry contains only resources that exist in the current schema and
 * are already RLS-protected. Adding a resource later is a reviewed edit here
 * plus (where the table lacks the column) an additive migration — never a new
 * search service.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  documents,
  foundations,
  knowledgeSources,
  legalEntities,
  resolutions,
  tenants,
  ujenziBoqs,
  ujenziProjects,
} from "@/db/schema";
import { farms as agricultureFarms, projects as agricultureProjects } from "@/db/schema";
import { decideMemoryVisibility, type MemoryVisibilityRecord } from "@/lib/noelia/memory";
import type { NoeliaAuthorizedScope } from "@/lib/noelia/types";
import type { Principal } from "@/lib/authz";
import type { Classification, PermissionCode } from "@/lib/constants";

export const SEARCH_OS_CODES = ["BEYU", "FINANCE", "HEALTH", "AGRICULTURE", "FOUNDATION", "UJENZI"] as const;
export type SearchOsCode = (typeof SEARCH_OS_CODES)[number];

/**
 * Bounded per-source fetch input.
 *  - `entityIds` null = the principal is not entity-scoped (all within tenant subtree).
 *  - `knowledgeScope` is the resolved Noelia authorized scope (tenant / entity /
 *    country / enterprise) plus the as-of date; only the KNOWLEDGE source
 *    consumes it, and the existing `decideMemoryVisibility` gate remains the
 *    final authority on every knowledge row.
 */
export type SourceQueryInput = {
  principal: Principal;
  query: string;
  tenantIds: string[];
  /** Classifications visible at the principal's clearance (enum values only). */
  classifications: Classification[];
  entityIds: string[] | null;
  maxPerSource: number;
  /**
   * The canonical Noelia authorized scope, resolved by the existing
   * `resolveNoeliaAuthorizedScope` (tenant / entity / country / enterprise),
   * plus the as-of date. Only the KNOWLEDGE source consumes it, and the
   * existing `decideMemoryVisibility` gate remains the final authority on
   * every knowledge row.
   */
  knowledgeScope: (NoeliaAuthorizedScope & { asOf: string }) | null;
};

export type SearchHit = {
  type: string;
  os: SearchOsCode;
  id: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  classification: string | null;
  deepLink: string;
  rank: number;
};

export type SearchSource = {
  type: string;
  os: SearchOsCode;
  permission: PermissionCode;
  entityBound: boolean;
  deepLink: string;
  /** Fetch up to `maxPerSource` matching rows, ranked. */
  fetch: (input: SourceQueryInput) => Promise<SearchHit[]>;
  /** Total matching rows under the same predicates (drives `total`). */
  count: (input: SourceQueryInput) => Promise<number>;
};

/* -------------------------------------------------------------------------- */
/* v1 registry                                                                 */
/* -------------------------------------------------------------------------- */

export const SEARCH_SOURCES: SearchSource[] = [
  /* ----------------------------- BEYU OS ----------------------------- */
  {
    type: "TENANT",
    os: "BEYU",
    permission: "organization:entity.read",
    entityBound: false,
    deepLink: "/os/administration/tenants",
    fetch: async (input) => {
      const rows = await db
        .select({
          id: tenants.id,
          title: tenants.name,
          subtitle: sql<string>`${tenants.code} || ' · ' || ${tenants.type}::text || ' · ' || ${tenants.status}::text || ${sql`(case when ${tenants.countryCode} is null then '' else ' · ' || ${tenants.countryCode} end)`}`,
          snippet: sql<string>`left(ts_headline('english', coalesce(${tenants.name}, '') || ' ' || coalesce(${tenants.code}, ''), websearch_to_tsquery('english', ${input.query})), 160)`,
          classification: tenants.classification,
          rank: sql<number>`ts_rank(${tenants.searchTsv}, websearch_to_tsquery('english', ${input.query}))`,
        })
        .from(tenants)
        .where(
          and(
            sql`${tenants.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(tenants.id, input.tenantIds),
            inArray(tenants.classification, input.classifications),
          ),
        )
        .orderBy(desc(sql`ts_rank(${tenants.searchTsv}, websearch_to_tsquery('english', ${input.query}))`))
        .limit(input.maxPerSource);
      return rows.map((r) => ({
        type: "TENANT",
        os: "BEYU",
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        snippet: r.snippet,
        classification: r.classification,
        deepLink: "/os/administration/tenants",
        rank: Number(r.rank),
      }));
    },
    count: async (input) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(tenants)
        .where(
          and(
            sql`${tenants.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(tenants.id, input.tenantIds),
            inArray(tenants.classification, input.classifications),
          ),
        );
      return r?.n ?? 0;
    },
  },
  {
    type: "LEGAL_ENTITY",
    os: "BEYU",
    permission: "organization:entity.read",
    // The row IS the entity: the principal's entity scope applies to its id.
    entityBound: true,
    deepLink: "/os/organization",
    fetch: async (input) => {
      const rows = await db
        .select({
          id: legalEntities.id,
          title: legalEntities.legalName,
          subtitle: sql<string>`${legalEntities.code} || ' · ' || ${legalEntities.entityType}::text || ' · ' || ${legalEntities.countryCode}`,
          snippet: sql<string>`left(ts_headline('english', coalesce(${legalEntities.legalName}, '') || ' ' || coalesce(${legalEntities.tradingName}, '') || ' ' || coalesce(${legalEntities.code}, ''), websearch_to_tsquery('english', ${input.query})), 160)`,
          classification: legalEntities.classification,
          rank: sql<number>`ts_rank(${legalEntities.searchTsv}, websearch_to_tsquery('english', ${input.query}))`,
        })
        .from(legalEntities)
        .where(
          and(
            sql`${legalEntities.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(legalEntities.tenantId, input.tenantIds),
            inArray(legalEntities.classification, input.classifications),
            input.entityIds ? inArray(legalEntities.id, input.entityIds) : undefined,
          ),
        )
        .orderBy(desc(sql`ts_rank(${legalEntities.searchTsv}, websearch_to_tsquery('english', ${input.query}))`))
        .limit(input.maxPerSource);
      return rows.map((r) => ({
        type: "LEGAL_ENTITY",
        os: "BEYU",
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        snippet: r.snippet,
        classification: r.classification,
        deepLink: "/os/organization",
        rank: Number(r.rank),
      }));
    },
    count: async (input) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(legalEntities)
        .where(
          and(
            sql`${legalEntities.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(legalEntities.tenantId, input.tenantIds),
            inArray(legalEntities.classification, input.classifications),
            input.entityIds ? inArray(legalEntities.id, input.entityIds) : undefined,
          ),
        );
      return r?.n ?? 0;
    },
  },
  {
    type: "DOCUMENT",
    os: "BEYU",
    permission: "documents:registry.read",
    // documents.entity_scope is free text, not a legal-entity key: an
    // entity-scoped principal is refused this source (fail-closed).
    entityBound: false,
    deepLink: "/os/documents",
    fetch: async (input) => {
      const rows = await db
        .select({
          id: documents.id,
          title: documents.fileName,
          subtitle: sql<string>`${documents.category} || ' · v' || ${documents.version}`,
          snippet: sql<string>`left(ts_headline('english', coalesce(${documents.fileName}, '') || ' ' || coalesce(${documents.description}, '') || ' ' || coalesce(${documents.category}, '') || ' ' || coalesce(${documents.version}, '') || ' ' || coalesce(${documents.source}, ''), websearch_to_tsquery('english', ${input.query})), 160)`,
          classification: documents.classification,
          rank: sql<number>`ts_rank(${documents.searchTsv}, websearch_to_tsquery('english', ${input.query}))`,
        })
        .from(documents)
        .where(
          and(
            sql`${documents.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(documents.tenantId, input.tenantIds),
            inArray(documents.classification, input.classifications),
          ),
        )
        .orderBy(desc(sql`ts_rank(${documents.searchTsv}, websearch_to_tsquery('english', ${input.query}))`))
        .limit(input.maxPerSource);
      return rows.map((r) => ({
        type: "DOCUMENT",
        os: "BEYU",
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        snippet: r.snippet,
        classification: r.classification,
        deepLink: "/os/documents",
        rank: Number(r.rank),
      }));
    },
    count: async (input) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(documents)
        .where(
          and(
            sql`${documents.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(documents.tenantId, input.tenantIds),
            inArray(documents.classification, input.classifications),
          ),
        );
      return r?.n ?? 0;
    },
  },
  {
    type: "GOVERNANCE_RESOLUTION",
    os: "BEYU",
    permission: "governance:resolution.read",
    entityBound: false,
    deepLink: "/os/governance",
    fetch: async (input) => {
      const rows = await db
        .select({
          id: resolutions.id,
          title: resolutions.title,
          subtitle: sql<string>`${resolutions.reference} || ' · ' || ${resolutions.category} || ' · ' || ${resolutions.status}::text`,
          snippet: sql<string>`left(ts_headline('english', coalesce(${resolutions.title}, '') || ' ' || coalesce(${resolutions.reference}, '') || ' ' || coalesce(${resolutions.summary}, '') || ' ' || coalesce(${resolutions.category}, ''), websearch_to_tsquery('english', ${input.query})), 160)`,
          classification: resolutions.classification,
          rank: sql<number>`ts_rank(${resolutions.searchTsv}, websearch_to_tsquery('english', ${input.query}))`,
        })
        .from(resolutions)
        .where(
          and(
            sql`${resolutions.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(resolutions.tenantId, input.tenantIds),
            inArray(resolutions.classification, input.classifications),
          ),
        )
        .orderBy(desc(sql`ts_rank(${resolutions.searchTsv}, websearch_to_tsquery('english', ${input.query}))`))
        .limit(input.maxPerSource);
      return rows.map((r) => ({
        type: "GOVERNANCE_RESOLUTION",
        os: "BEYU",
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        snippet: r.snippet,
        classification: r.classification,
        deepLink: "/os/governance",
        rank: Number(r.rank),
      }));
    },
    count: async (input) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(resolutions)
        .where(
          and(
            sql`${resolutions.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(resolutions.tenantId, input.tenantIds),
            inArray(resolutions.classification, input.classifications),
          ),
        );
      return r?.n ?? 0;
    },
  },
  {
    type: "KNOWLEDGE",
    os: "BEYU",
    permission: "ai:noelia.query",
    // The row carries legal_entity_id; the entity scope is enforced both at
    // query level (pushdown) and by the final decideMemoryVisibility gate.
    entityBound: true,
    deepLink: "/os/noelia",
    fetch: async (input) => {
      const scope = input.knowledgeScope;
      if (!scope) return [];
      // Query-level pushdown mirrors the existing Noelia scope predicates
      // (GLOBAL always; TENANT/ENTERPRISE/ENTITY/COUNTRY by resolved scope).
      // The final gate below remains the authority — pushdown is an
      // optimization, never the authorization.
      // OR of the scope branches — each branch is mutually exclusive by
      // scope_type, and the final decideMemoryVisibility gate re-decides
      // every row (pushdown is an optimization, never the authorization).
      const scopePushdown = or(
        eq(knowledgeSources.scopeType, "GLOBAL"),
        ...(scope.tenantIds.length > 0
          ? [
              and(
                eq(knowledgeSources.scopeType, "TENANT"),
                inArray(knowledgeSources.tenantId, scope.tenantIds),
              )!,
              ...(scope.enterprise
                ? [
                    and(
                      eq(knowledgeSources.scopeType, "ENTERPRISE"),
                      inArray(knowledgeSources.tenantId, scope.tenantIds),
                    )!,
                  ]
                : []),
            ]
          : []),
        ...(scope.tenantIds.length > 0 && scope.legalEntityIds.length > 0
          ? [
              and(
                eq(knowledgeSources.scopeType, "ENTITY"),
                inArray(knowledgeSources.tenantId, scope.tenantIds),
                inArray(knowledgeSources.legalEntityId, scope.legalEntityIds),
              )!,
            ]
          : []),
        ...(scope.tenantIds.length > 0 && scope.countryCodes.length > 0
          ? [
              and(
                eq(knowledgeSources.scopeType, "COUNTRY"),
                inArray(knowledgeSources.tenantId, scope.tenantIds),
                inArray(knowledgeSources.countryCode, scope.countryCodes),
              )!,
            ]
          : []),
      );
      const rows = await db
        .select({
          id: knowledgeSources.id,
          title: knowledgeSources.title,
          subtitle: sql<string>`${knowledgeSources.code} || ' · ' || ${knowledgeSources.domain} || ' · ' || ${knowledgeSources.scopeType}`,
          snippet: sql<string>`left(ts_headline('english', coalesce(${knowledgeSources.title}, '') || ' ' || coalesce(${knowledgeSources.code}, '') || ' ' || coalesce(${knowledgeSources.domain}, ''), websearch_to_tsquery('english', ${input.query})), 160)`,
          classification: knowledgeSources.classification,
          scopeType: knowledgeSources.scopeType,
          tenantId: knowledgeSources.tenantId,
          legalEntityId: knowledgeSources.legalEntityId,
          countryCode: knowledgeSources.countryCode,
          authorityStatus: knowledgeSources.authorityStatus,
          effectiveFrom: knowledgeSources.effectiveFrom,
          reviewDate: knowledgeSources.reviewDate,
          expiresAt: knowledgeSources.expiresAt,
          rank: sql<number>`ts_rank(${knowledgeSources.searchTsv}, websearch_to_tsquery('english', ${input.query}))`,
        })
        .from(knowledgeSources)
        .where(
          and(
            sql`${knowledgeSources.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            eq(knowledgeSources.authorityStatus, "AUTHORITATIVE"),
            inArray(knowledgeSources.classification, input.classifications),
            scopePushdown,
          ),
        )
        .orderBy(desc(sql`ts_rank(${knowledgeSources.searchTsv}, websearch_to_tsquery('english', ${input.query}))`))
        .limit(input.maxPerSource);
      // Final row-level gate: the EXISTING Noelia knowledge visibility rule
      // (authority, validity window, classification, scope). Rows that do not
      // pass are dropped — never returned, even if the pushdown missed one.
      const visible = rows.filter((r) => {
        const record: MemoryVisibilityRecord = {
          scopeType: r.scopeType,
          tenantId: r.tenantId,
          legalEntityId: r.legalEntityId,
          countryCode: r.countryCode,
          classification: r.classification,
          authorityStatus: r.authorityStatus,
          effectiveFrom: r.effectiveFrom,
          reviewDate: r.reviewDate,
          expiresAt: r.expiresAt,
        };
        const decision = decideMemoryVisibility(input.principal, scope, record, scope.asOf);
        return decision.allowed;
      });
      return visible.map((r) => ({
        type: "KNOWLEDGE",
        os: "BEYU",
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        snippet: r.snippet,
        classification: r.classification,
        deepLink: "/os/noelia",
        rank: Number(r.rank),
      }));
    },
    count: async (input) => {
      const scope = input.knowledgeScope;
      if (!scope) return 0;
      // OR of the scope branches — each branch is mutually exclusive by
      // scope_type, and the final decideMemoryVisibility gate re-decides
      // every row (pushdown is an optimization, never the authorization).
      const scopePushdown = or(
        eq(knowledgeSources.scopeType, "GLOBAL"),
        ...(scope.tenantIds.length > 0
          ? [
              and(
                eq(knowledgeSources.scopeType, "TENANT"),
                inArray(knowledgeSources.tenantId, scope.tenantIds),
              )!,
              ...(scope.enterprise
                ? [
                    and(
                      eq(knowledgeSources.scopeType, "ENTERPRISE"),
                      inArray(knowledgeSources.tenantId, scope.tenantIds),
                    )!,
                  ]
                : []),
            ]
          : []),
        ...(scope.tenantIds.length > 0 && scope.legalEntityIds.length > 0
          ? [
              and(
                eq(knowledgeSources.scopeType, "ENTITY"),
                inArray(knowledgeSources.tenantId, scope.tenantIds),
                inArray(knowledgeSources.legalEntityId, scope.legalEntityIds),
              )!,
            ]
          : []),
        ...(scope.tenantIds.length > 0 && scope.countryCodes.length > 0
          ? [
              and(
                eq(knowledgeSources.scopeType, "COUNTRY"),
                inArray(knowledgeSources.tenantId, scope.tenantIds),
                inArray(knowledgeSources.countryCode, scope.countryCodes),
              )!,
            ]
          : []),
      );
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(knowledgeSources)
        .where(
          and(
            sql`${knowledgeSources.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            eq(knowledgeSources.authorityStatus, "AUTHORITATIVE"),
            inArray(knowledgeSources.classification, input.classifications),
            scopePushdown,
          ),
        );
      // The count is an upper bound; the fetch applies the final row gate.
      return r?.n ?? 0;
    },
  },
  /* ---------------------------- Ujenzi OS ---------------------------- */
  {
    type: "UJENZI_PROJECT",
    os: "UJENZI",
    permission: "ujenzi:data.read",
    entityBound: true,
    deepLink: "/os/ujenzi/projects",
    fetch: async (input) => {
      const rows = await db
        .select({
          id: ujenziProjects.id,
          title: ujenziProjects.name,
          subtitle: sql<string>`${ujenziProjects.code} || ' · ' || ${ujenziProjects.status} || ' · ' || ${ujenziProjects.countryCode}`,
          snippet: sql<string>`left(ts_headline('english', coalesce(${ujenziProjects.name}, '') || ' ' || coalesce(${ujenziProjects.code}, '') || ' ' || coalesce(${ujenziProjects.client}, '') || ' ' || coalesce(${ujenziProjects.status}, '') || ' ' || coalesce(${ujenziProjects.location}, '') || ' ' || coalesce(${ujenziProjects.region}, ''), websearch_to_tsquery('english', ${input.query})), 160)`,
          classification: ujenziProjects.classification,
          rank: sql<number>`ts_rank(${ujenziProjects.searchTsv}, websearch_to_tsquery('english', ${input.query}))`,
        })
        .from(ujenziProjects)
        .where(
          and(
            sql`${ujenziProjects.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(ujenziProjects.tenantId, input.tenantIds),
            inArray(ujenziProjects.classification, input.classifications),
            input.entityIds ? inArray(ujenziProjects.legalEntityId, input.entityIds) : undefined,
          ),
        )
        .orderBy(desc(sql`ts_rank(${ujenziProjects.searchTsv}, websearch_to_tsquery('english', ${input.query}))`))
        .limit(input.maxPerSource);
      return rows.map((r) => ({
        type: "UJENZI_PROJECT",
        os: "UJENZI",
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        snippet: r.snippet,
        classification: r.classification,
        deepLink: "/os/ujenzi/projects",
        rank: Number(r.rank),
      }));
    },
    count: async (input) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(ujenziProjects)
        .where(
          and(
            sql`${ujenziProjects.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(ujenziProjects.tenantId, input.tenantIds),
            inArray(ujenziProjects.classification, input.classifications),
            input.entityIds ? inArray(ujenziProjects.legalEntityId, input.entityIds) : undefined,
          ),
        );
      return r?.n ?? 0;
    },
  },
  {
    type: "UJENZI_BOQ",
    os: "UJENZI",
    permission: "ujenzi:data.read",
    entityBound: true,
    // The BOQ row has no name: the title is composed from the parent project,
    // and the entity boundary is enforced through the project's legal_entity_id.
    deepLink: "/os/ujenzi/boq-cost",
    fetch: async (input) => {
      const rows = await db
        .select({
          id: ujenziBoqs.id,
          title: sql<string>`'BOQ v' || ${ujenziBoqs.version} || ' — ' || coalesce(${ujenziProjects.name}, 'Project ' || ${ujenziProjects.code})`,
          subtitle: sql<string>`${ujenziProjects.code} || ' · ' || ${ujenziBoqs.status} || ' · ' || ${ujenziBoqs.currency}`,
          snippet: sql<string>`left(ts_headline('english', coalesce(${ujenziBoqs.status}, '') || ' ' || coalesce(${ujenziBoqs.currency}, '') || ' ' || coalesce(${ujenziBoqs.notes}, ''), websearch_to_tsquery('english', ${input.query})), 160)`,
          classification: ujenziBoqs.classification,
          rank: sql<number>`ts_rank(${ujenziBoqs.searchTsv}, websearch_to_tsquery('english', ${input.query}))`,
        })
        .from(ujenziBoqs)
        .innerJoin(ujenziProjects, eq(ujenziBoqs.projectId, ujenziProjects.id))
        .where(
          and(
            sql`${ujenziBoqs.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(ujenziBoqs.tenantId, input.tenantIds),
            inArray(ujenziBoqs.classification, input.classifications),
            input.entityIds ? inArray(ujenziProjects.legalEntityId, input.entityIds) : undefined,
          ),
        )
        .orderBy(desc(sql`ts_rank(${ujenziBoqs.searchTsv}, websearch_to_tsquery('english', ${input.query}))`))
        .limit(input.maxPerSource);
      return rows.map((r) => ({
        type: "UJENZI_BOQ",
        os: "UJENZI",
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        snippet: r.snippet,
        classification: r.classification,
        deepLink: "/os/ujenzi/boq-cost",
        rank: Number(r.rank),
      }));
    },
    count: async (input) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(ujenziBoqs)
        .innerJoin(ujenziProjects, eq(ujenziBoqs.projectId, ujenziProjects.id))
        .where(
          and(
            sql`${ujenziBoqs.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(ujenziBoqs.tenantId, input.tenantIds),
            inArray(ujenziBoqs.classification, input.classifications),
            input.entityIds ? inArray(ujenziProjects.legalEntityId, input.entityIds) : undefined,
          ),
        );
      return r?.n ?? 0;
    },
  },
  /* -------------------------- Agriculture OS -------------------------- */
  {
    type: "AGRICULTURE_FARM",
    os: "AGRICULTURE",
    permission: "agriculture:data.read",
    entityBound: true,
    deepLink: "/os/agriculture",
    fetch: async (input) => {
      const rows = await db
        .select({
          id: agricultureFarms.id,
          title: agricultureFarms.name,
          subtitle: sql<string>`${agricultureFarms.code} || ' · ' || ${agricultureFarms.status} || ' · ' || ${agricultureFarms.countryCode}`,
          snippet: sql<string>`left(ts_headline('english', coalesce(${agricultureFarms.name}, '') || ' ' || coalesce(${agricultureFarms.code}, '') || ' ' || coalesce(${agricultureFarms.region}, '') || ' ' || coalesce(${agricultureFarms.soilType}, '') || ' ' || coalesce(${agricultureFarms.status}, ''), websearch_to_tsquery('english', ${input.query})), 160)`,
          classification: agricultureFarms.classification,
          rank: sql<number>`ts_rank(${agricultureFarms.searchTsv}, websearch_to_tsquery('english', ${input.query}))`,
        })
        .from(agricultureFarms)
        .where(
          and(
            sql`${agricultureFarms.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(agricultureFarms.tenantId, input.tenantIds),
            inArray(agricultureFarms.classification, input.classifications),
            input.entityIds ? inArray(agricultureFarms.legalEntityId, input.entityIds) : undefined,
          ),
        )
        .orderBy(desc(sql`ts_rank(${agricultureFarms.searchTsv}, websearch_to_tsquery('english', ${input.query}))`))
        .limit(input.maxPerSource);
      return rows.map((r) => ({
        type: "AGRICULTURE_FARM",
        os: "AGRICULTURE",
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        snippet: r.snippet,
        classification: r.classification,
        deepLink: "/os/agriculture",
        rank: Number(r.rank),
      }));
    },
    count: async (input) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(agricultureFarms)
        .where(
          and(
            sql`${agricultureFarms.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(agricultureFarms.tenantId, input.tenantIds),
            inArray(agricultureFarms.classification, input.classifications),
            input.entityIds ? inArray(agricultureFarms.legalEntityId, input.entityIds) : undefined,
          ),
        );
      return r?.n ?? 0;
    },
  },
  {
    type: "AGRICULTURE_PROJECT",
    os: "AGRICULTURE",
    permission: "agriculture:data.read",
    entityBound: true,
    deepLink: "/os/agriculture",
    fetch: async (input) => {
      const rows = await db
        .select({
          id: agricultureProjects.id,
          title: agricultureProjects.name,
          subtitle: sql<string>`${agricultureProjects.code} || ' · ' || ${agricultureProjects.status}`,
          snippet: sql<string>`left(ts_headline('english', coalesce(${agricultureProjects.name}, '') || ' ' || coalesce(${agricultureProjects.code}, '') || ' ' || coalesce(${agricultureProjects.status}, ''), websearch_to_tsquery('english', ${input.query})), 160)`,
          classification: agricultureProjects.classification,
          rank: sql<number>`ts_rank(${agricultureProjects.searchTsv}, websearch_to_tsquery('english', ${input.query}))`,
        })
        .from(agricultureProjects)
        .where(
          and(
            sql`${agricultureProjects.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(agricultureProjects.tenantId, input.tenantIds),
            inArray(agricultureProjects.classification, input.classifications),
            input.entityIds ? inArray(agricultureProjects.legalEntityId, input.entityIds) : undefined,
          ),
        )
        .orderBy(desc(sql`ts_rank(${agricultureProjects.searchTsv}, websearch_to_tsquery('english', ${input.query}))`))
        .limit(input.maxPerSource);
      return rows.map((r) => ({
        type: "AGRICULTURE_PROJECT",
        os: "AGRICULTURE",
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        snippet: r.snippet,
        classification: r.classification,
        deepLink: "/os/agriculture",
        rank: Number(r.rank),
      }));
    },
    count: async (input) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(agricultureProjects)
        .where(
          and(
            sql`${agricultureProjects.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(agricultureProjects.tenantId, input.tenantIds),
            inArray(agricultureProjects.classification, input.classifications),
            input.entityIds ? inArray(agricultureProjects.legalEntityId, input.entityIds) : undefined,
          ),
        );
      return r?.n ?? 0;
    },
  },
  /* -------------------------- Foundation OS -------------------------- */
  {
    type: "FOUNDATION",
    os: "FOUNDATION",
    permission: "foundation:registry.read",
    entityBound: true,
    deepLink: "/os/foundation/registry",
    fetch: async (input) => {
      const rows = await db
        .select({
          id: foundations.id,
          title: sql<string>`coalesce(nullif(${foundations.operatingName}, ''), ${foundations.legalName})`,
          subtitle: sql<string>`${foundations.code} || ' · ' || ${foundations.status} || ' · ' || ${foundations.countryCode}`,
          snippet: sql<string>`left(ts_headline('english', coalesce(${foundations.legalName}, '') || ' ' || coalesce(${foundations.operatingName}, '') || ' ' || coalesce(${foundations.code}, '') || ' ' || coalesce(${foundations.legalVehicle}, '') || ' ' || coalesce(${foundations.status}, '') || ' ' || coalesce(${foundations.mission}, '') || ' ' || coalesce(${foundations.purpose}, ''), websearch_to_tsquery('english', ${input.query})), 160)`,
          classification: foundations.classification,
          rank: sql<number>`ts_rank(${foundations.searchTsv}, websearch_to_tsquery('english', ${input.query}))`,
        })
        .from(foundations)
        .where(
          and(
            sql`${foundations.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(foundations.tenantId, input.tenantIds),
            inArray(foundations.classification, input.classifications),
            input.entityIds ? inArray(foundations.legalEntityId, input.entityIds) : undefined,
          ),
        )
        .orderBy(desc(sql`ts_rank(${foundations.searchTsv}, websearch_to_tsquery('english', ${input.query}))`))
        .limit(input.maxPerSource);
      return rows.map((r) => ({
        type: "FOUNDATION",
        os: "FOUNDATION",
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        snippet: r.snippet,
        classification: r.classification,
        deepLink: "/os/foundation/registry",
        rank: Number(r.rank),
      }));
    },
    count: async (input) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(foundations)
        .where(
          and(
            sql`${foundations.searchTsv} @@ websearch_to_tsquery('english', ${input.query})`,
            inArray(foundations.tenantId, input.tenantIds),
            inArray(foundations.classification, input.classifications),
            input.entityIds ? inArray(foundations.legalEntityId, input.entityIds) : undefined,
          ),
        );
      return r?.n ?? 0;
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export const SOURCE_BY_TYPE = new Map(SEARCH_SOURCES.map((s) => [s.type, s]));
