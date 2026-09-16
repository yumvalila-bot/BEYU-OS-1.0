import { and, inArray } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { legalEntities, tenants } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { hasGlobalGovernanceScope, tenantScopeIds } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import type { NoeliaAuthorizedScope, NoeliaTargetContext } from "./types";

/** Resolve finite tenant/entity/country scope through canonical BEYU primitives. */
export async function resolveNoeliaAuthorizedScope(principal: Principal): Promise<NoeliaAuthorizedScope> {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia scope resolution requires canonical transaction-scoped tenant context");
  }

  const tenantIds = await tenantScopeIds(principal);
  const allowedClassifications = classificationsAtOrBelow(principal.clearance);
  const entityPredicate =
    principal.entityScope.length > 0
      ? and(
          inArray(legalEntities.tenantId, tenantIds),
          inArray(legalEntities.id, principal.entityScope),
          inArray(legalEntities.classification, allowedClassifications),
        )
      : and(
          inArray(legalEntities.tenantId, tenantIds),
          inArray(legalEntities.classification, allowedClassifications),
        );
  const scopedEntities = tenantIds.length
    ? await db
        .select({ id: legalEntities.id, tenantId: legalEntities.tenantId, countryCode: legalEntities.countryCode })
        .from(legalEntities)
        .where(entityPredicate)
    : [];

  const tenantCountries = principal.entityScope.length === 0 && tenantIds.length > 0
    ? await db
        .select({ tenantId: tenants.id, countryCode: tenants.countryCode })
        .from(tenants)
        .where(
          and(
            inArray(tenants.id, tenantIds),
            inArray(tenants.classification, allowedClassifications),
          ),
        )
    : [];

  return {
    tenantIds,
    legalEntityIds: scopedEntities.map((entity) => entity.id),
    countryCodes: [...new Set([
      ...scopedEntities.map((entity) => entity.countryCode),
      ...tenantCountries.map((tenant) => tenant.countryCode),
    ].filter((code): code is string => Boolean(code)))],
    entities: scopedEntities,
    tenantCountries: [
      ...new Map([
        ...scopedEntities.map((entity) => ({ tenantId: entity.tenantId, countryCode: entity.countryCode })),
        ...tenantCountries.flatMap((tenant) => tenant.countryCode
          ? [{ tenantId: tenant.tenantId, countryCode: tenant.countryCode }]
          : []),
      ].map((item) => [`${item.tenantId}:${item.countryCode}`, item])).values(),
    ],
    enterprise: hasGlobalGovernanceScope(principal),
  };
}

/** Client context is a requested target, never a grant. */
export function requestedNoeliaTarget(
  principal: Principal,
  requested?: Partial<NoeliaTargetContext> | null,
): NoeliaTargetContext {
  return {
    tenantId: requested?.tenantId ?? principal.tenantId,
    legalEntityId: requested?.legalEntityId ?? null,
    countryCode: requested?.countryCode ?? null,
  };
}
