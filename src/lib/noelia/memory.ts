import { and, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { knowledgeSources } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import {
  CLASSIFICATION_ORDER,
  classificationRank,
  isKnownClassification,
  type Classification,
} from "@/lib/constants";
import type { NoeliaAuthorizedScope, NoeliaSource } from "./types";

/**
 * Canonical memory scope classes. Unknown values fail closed everywhere:
 * ORGANIZATIONAL is org-wide memory for one tenant (no enterprise flag
 * needed); LONG_TERM_CONTINUITY is continuity memory — enterprise-only and
 * never expires (enforced by the DB CHECK as well).
 */
export const KNOWLEDGE_SCOPE_TYPES = [
  "GLOBAL",
  "ENTERPRISE",
  "TENANT",
  "ENTITY",
  "COUNTRY",
  "ORGANIZATIONAL",
  "LONG_TERM_CONTINUITY",
] as const;
export type KnowledgeScopeType = (typeof KNOWLEDGE_SCOPE_TYPES)[number];

export type MemoryVisibilityRecord = {
  scopeType: string;
  tenantId: string | null;
  legalEntityId: string | null;
  countryCode: string | null;
  classification: string;
  authorityStatus: string;
  effectiveFrom: string;
  reviewDate: string;
  expiresAt: string | null;
};

export type MemoryVisibilityDecision = {
  allowed: boolean;
  code:
    | "ALLOWED"
    | "AUTHORITY_DENIED"
    | "WINDOW_DENIED"
    | "CLASSIFICATION_DENIED"
    | "SCOPE_UNKNOWN"
    | "TENANT_DENIED"
    | "ENTERPRISE_DENIED"
    | "ENTITY_DENIED"
    | "COUNTRY_DENIED"
    | "ORGANIZATIONAL_DENIED"
    | "CONTINUITY_DENIED";
  reason: string;
};

/** Pure, deterministic final gate applied after query-level pushdown. */
export function decideMemoryVisibility(
  principal: Pick<Principal, "clearance">,
  scope: NoeliaAuthorizedScope,
  record: MemoryVisibilityRecord,
  asOf: string,
): MemoryVisibilityDecision {
  if (record.authorityStatus !== "AUTHORITATIVE") {
    return { allowed: false, code: "AUTHORITY_DENIED", reason: "Source is not authoritative." };
  }
  if (record.effectiveFrom > asOf || record.reviewDate < asOf || (record.expiresAt && record.expiresAt < asOf)) {
    return { allowed: false, code: "WINDOW_DENIED", reason: "Source is outside its governed validity window." };
  }
  if (
    !isKnownClassification(principal.clearance) ||
    !isKnownClassification(record.classification) ||
    classificationRank(record.classification) > classificationRank(principal.clearance)
  ) {
    return { allowed: false, code: "CLASSIFICATION_DENIED", reason: "Source exceeds the principal's clearance." };
  }

  switch (record.scopeType) {
    case "GLOBAL":
      return { allowed: true, code: "ALLOWED", reason: "Authorized global knowledge." };
    case "ENTERPRISE":
      return scope.enterprise && Boolean(record.tenantId && scope.tenantIds.includes(record.tenantId))
        ? { allowed: true, code: "ALLOWED", reason: "Authorized enterprise knowledge." }
        : { allowed: false, code: "ENTERPRISE_DENIED", reason: "Enterprise memory is not global memory." };
    case "TENANT":
      return record.tenantId && scope.tenantIds.includes(record.tenantId)
        ? { allowed: true, code: "ALLOWED", reason: "Authorized tenant knowledge." }
        : { allowed: false, code: "TENANT_DENIED", reason: "Tenant memory is outside the resolved scope." };
    case "ENTITY":
      return record.tenantId &&
        scope.tenantIds.includes(record.tenantId) &&
        Boolean(record.legalEntityId && scope.legalEntityIds.includes(record.legalEntityId))
        ? { allowed: true, code: "ALLOWED", reason: "Authorized entity knowledge." }
        : { allowed: false, code: "ENTITY_DENIED", reason: "Entity memory is outside the resolved scope." };
    case "COUNTRY":
      return record.tenantId &&
        scope.tenantIds.includes(record.tenantId) &&
        Boolean(record.countryCode && scope.countryCodes.includes(record.countryCode))
        ? { allowed: true, code: "ALLOWED", reason: "Authorized country knowledge." }
        : { allowed: false, code: "COUNTRY_DENIED", reason: "Country memory is outside the resolved scope." };
    case "ORGANIZATIONAL":
      // Org-wide memory for one tenant: visible to any principal within that
      // tenant's subtree — it is organizational, not global and not
      // enterprise-restricted.
      return record.tenantId && scope.tenantIds.includes(record.tenantId)
        ? { allowed: true, code: "ALLOWED", reason: "Authorized organizational memory." }
        : { allowed: false, code: "ORGANIZATIONAL_DENIED", reason: "Organizational memory is outside the resolved tenant scope." };
    case "LONG_TERM_CONTINUITY":
      // Continuity memory is the most sensitive tenant-level class:
      // enterprise principals only, in-window, and it never expires.
      return scope.enterprise && record.tenantId && scope.tenantIds.includes(record.tenantId) && !record.expiresAt
        ? { allowed: true, code: "ALLOWED", reason: "Authorized long-term continuity memory." }
        : { allowed: false, code: "CONTINUITY_DENIED", reason: "Long-term continuity memory requires an enterprise principal and no expiry." };
    default:
      return { allowed: false, code: "SCOPE_UNKNOWN", reason: "Unknown memory scope is denied by default." };
  }
}

export type RetrievedMemory = {
  source: NoeliaSource;
  excerpt: string;
  classification: Classification;
  scopeType: KnowledgeScopeType;
};

function termsFor(question: string): string[] {
  return [...new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 3)
      .slice(0, 8),
  )];
}

function scopePredicates(scope: NoeliaAuthorizedScope): SQL[] {
  const predicates: SQL[] = [eq(knowledgeSources.scopeType, "GLOBAL")];
  if (scope.tenantIds.length > 0) {
    predicates.push(and(
      eq(knowledgeSources.scopeType, "TENANT"),
      inArray(knowledgeSources.tenantId, scope.tenantIds),
    )!);
    // Organizational memory is visible to any principal in the tenant subtree.
    predicates.push(and(
      eq(knowledgeSources.scopeType, "ORGANIZATIONAL"),
      inArray(knowledgeSources.tenantId, scope.tenantIds),
    )!);
    if (scope.enterprise) {
      predicates.push(and(
        eq(knowledgeSources.scopeType, "ENTERPRISE"),
        inArray(knowledgeSources.tenantId, scope.tenantIds),
      )!);
      // Long-term continuity memory: enterprise-only, and never expires.
      predicates.push(and(
        eq(knowledgeSources.scopeType, "LONG_TERM_CONTINUITY"),
        inArray(knowledgeSources.tenantId, scope.tenantIds),
        isNull(knowledgeSources.expiresAt),
      )!);
    }
  }
  if (scope.tenantIds.length > 0 && scope.legalEntityIds.length > 0) {
    predicates.push(and(
      eq(knowledgeSources.scopeType, "ENTITY"),
      inArray(knowledgeSources.tenantId, scope.tenantIds),
      inArray(knowledgeSources.legalEntityId, scope.legalEntityIds),
    )!);
  }
  if (scope.tenantIds.length > 0 && scope.countryCodes.length > 0) {
    predicates.push(and(
      eq(knowledgeSources.scopeType, "COUNTRY"),
      inArray(knowledgeSources.tenantId, scope.tenantIds),
      inArray(knowledgeSources.countryCode, scope.countryCodes),
    )!);
  }
  return predicates;
}

async function queryGovernedMemory(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  asOf: string;
  limit: number;
  terms?: string[];
}): Promise<RetrievedMemory[]> {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia memory requires canonical transaction-scoped tenant context");
  }
  if (!isKnownClassification(input.principal.clearance)) return [];
  const classifications = CLASSIFICATION_ORDER.filter(
    (classification) => classificationRank(classification) <= classificationRank(input.principal.clearance),
  );
  const textPredicate = input.terms
    ? sql`lower(${knowledgeSources.title} || ' ' || ${knowledgeSources.content}) ~ ${input.terms.join("|")}`
    : sql`true`;
  const rows = await db
    .select()
    .from(knowledgeSources)
    .where(and(
      eq(knowledgeSources.authorityStatus, "AUTHORITATIVE"),
      inArray(knowledgeSources.classification, classifications),
      lte(knowledgeSources.effectiveFrom, input.asOf),
      gte(knowledgeSources.reviewDate, input.asOf),
      sql`(${knowledgeSources.expiresAt} is null or ${knowledgeSources.expiresAt} >= ${input.asOf})`,
      or(...scopePredicates(input.scope)),
      textPredicate,
    ))
    .limit(Math.min(Math.max(input.limit, 1), 100));

  return rows.flatMap((row): RetrievedMemory[] => {
    const visibility = decideMemoryVisibility(input.principal, input.scope, {
      scopeType: row.scopeType,
      tenantId: row.tenantId,
      legalEntityId: row.legalEntityId,
      countryCode: row.countryCode,
      classification: row.classification,
      authorityStatus: row.authorityStatus,
      effectiveFrom: row.effectiveFrom,
      reviewDate: row.reviewDate,
      expiresAt: row.expiresAt,
    }, input.asOf);
    if (!visibility.allowed || !(KNOWLEDGE_SCOPE_TYPES as readonly string[]).includes(row.scopeType)) return [];
    return [{
      source: {
        kind: "KNOWLEDGE_SOURCE",
        ref: row.code,
        label: row.title,
        authority: row.authorityStatus,
        // Governed, in-window knowledge is a direct observation of the
        // canonical record; the validity window is carried for staleness
        // checks (STALE_IS_NOT_CURRENT) even though the query pre-filters it.
        epistemicClass: "OBSERVED",
        authorityStatus: row.authorityStatus,
        effectiveFrom: row.effectiveFrom,
        reviewDate: row.reviewDate,
        expiresAt: row.expiresAt,
      },
      excerpt: row.content.slice(0, 500),
      classification: row.classification,
      scopeType: row.scopeType as KnowledgeScopeType,
    }];
  });
}

/**
 * Canonical BEYU knowledge service used by the RAG tool. Scope and
 * classification are pushed into SQL so unauthorized content never enters the
 * HIVE retrieval working set; the pure gate remains defence in depth.
 */
export async function retrieveGovernedMemory(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  question: string;
  asOf?: string;
  limit?: number;
}): Promise<RetrievedMemory[]> {
  const terms = termsFor(input.question);
  if (terms.length === 0) return [];
  return queryGovernedMemory({
    principal: input.principal,
    scope: input.scope,
    asOf: input.asOf ?? new Date().toISOString().slice(0, 10),
    limit: input.limit ?? 4,
    terms,
  });
}

/** Authorized corpus catalogue for the Noelia UI; content remains internal. */
export async function listGovernedMemoryCatalog(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  asOf?: string;
  limit?: number;
}): Promise<Array<Omit<RetrievedMemory, "excerpt">>> {
  const rows = await queryGovernedMemory({
    principal: input.principal,
    scope: input.scope,
    asOf: input.asOf ?? new Date().toISOString().slice(0, 10),
    limit: input.limit ?? 50,
  });
  return rows.map(({ excerpt: _excerpt, ...row }) => row);
}
