import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { hasGlobalGovernanceScope, tenantScopeIds } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import {
  AGRICULTURE_OS_TENANT_CODE,
  UJENZI_OS_TENANT_CODE,
  classificationsAtOrBelow,
  type PermissionCode,
} from "@/lib/constants";

/** Canonical operational Sector OSs with tenant-bound root data services. */
export type CanonicalSectorContext = "AGRICULTURE" | "UJENZI";

const SECTOR_TENANT_CODE: Record<CanonicalSectorContext, string> = {
  AGRICULTURE: AGRICULTURE_OS_TENANT_CODE,
  UJENZI: UJENZI_OS_TENANT_CODE,
};

/**
 * Map a declared server-side permission to its canonical sector context.
 * Request paths, hostnames, query parameters and client tenant IDs are never
 * consulted. Finance, Health, Family Office and NOELIA deliberately have no
 * mapping and retain their existing guards.
 */
export function canonicalSectorForPermission(
  permission: PermissionCode,
): CanonicalSectorContext | null {
  if (permission.startsWith("agriculture:")) return "AGRICULTURE";
  if (permission.startsWith("ujenzi:")) return "UJENZI";
  return null;
}

export type SectorContextResolution =
  | { allowed: true; principal: Principal }
  | { allowed: false; reason: string };

/**
 * Resolve the one tenant in which a sector page/API may operate.
 *
 * A non-global principal must already have selected the canonical sector
 * tenant through the governed session-context workflow. An explicitly global
 * principal keeps its existing sector access, but receives a tenant-pinned
 * derived principal: tenantType becomes SECTOR, so the RLS context is narrowed
 * to this one target rather than inheriting global database scope. No role,
 * permission, assignment or authority tuple is created or modified here.
 */
export async function resolveCanonicalSectorPrincipal(
  principal: Principal,
  sector: CanonicalSectorContext,
): Promise<SectorContextResolution> {
  const tenantCode = SECTOR_TENANT_CODE[sector];
  const explicitlyGlobal = hasGlobalGovernanceScope(principal);

  if (principal.tenantCode !== tenantCode && !explicitlyGlobal) {
    return {
      allowed: false,
      reason: `${sector === "AGRICULTURE" ? "Agriculture" : "Ujenzi"} OS requires the canonical ${tenantCode} session context; a grant in another tenant is not sector data authority.`,
    };
  }

  const [scope, allowedClassifications] = await Promise.all([
    tenantScopeIds(principal),
    Promise.resolve(classificationsAtOrBelow(principal.clearance)),
  ]);
  if (scope.length === 0 || allowedClassifications.length === 0) {
    return {
      allowed: false,
      reason: "The canonical sector tenant is outside the current tenant and classification scope.",
    };
  }

  const [target] = await db
    .select({
      id: tenants.id,
      code: tenants.code,
      type: tenants.type,
      classification: tenants.classification,
    })
    .from(tenants)
    .where(
      and(
        eq(tenants.code, tenantCode),
        eq(tenants.status, "ACTIVE"),
        inArray(tenants.id, scope),
        inArray(tenants.classification, allowedClassifications),
      ),
    )
    .limit(1);

  if (!target) {
    return {
      allowed: false,
      reason: "The canonical sector tenant is inactive, unavailable, or outside the current tenant and classification scope.",
    };
  }

  if (principal.tenantId === target.id && principal.tenantCode === target.code) {
    return { allowed: true, principal };
  }

  return {
    allowed: true,
    principal: {
      ...principal,
      tenantId: target.id,
      tenantCode: target.code,
      tenantType: target.type,
    },
  };
}
