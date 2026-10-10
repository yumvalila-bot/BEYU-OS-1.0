import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { can, type Principal } from "@/lib/authz";
import { classificationsAtOrBelow, type Classification, type PermissionCode } from "@/lib/constants";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";
import { checkBeyuOSAuthorization } from "@/lib/os-authorization";
import { tenantScopeIds } from "@/lib/tenant-scope";

// Re-export the same canonical catalogue; keep it usable by UI without DB imports.
import {
  BEYU_CONTROL_PLANE,
  FOUNDATION_ORGANIZATION,
  SECTOR_OPERATING_SYSTEMS,
  type GovernedDestination,
  type OperatingSystemDestination,
} from "./operating-system-catalog";
export {
  BEYU_CONTROL_PLANE,
  FOUNDATION_ORGANIZATION,
  SECTOR_OPERATING_SYSTEMS,
  type GovernedDestination,
  type OperatingSystemDestination,
} from "./operating-system-catalog";

export const FINANCE_OS_READ_PERMISSIONS: PermissionCode[] = [
  "finance:ledger.read",
  "finance:treasury.read",
  "finance:capital.read",
  "finance:waterfall.read",
  "finance:tax.read",
  "finance:payments.read",
];

export const FOUNDATION_READ_PERMISSIONS: PermissionCode[] = [
  "foundation:registry.read",
  "foundation:formation.read",
  "foundation:structure.read",
  "foundation:governance.read",
  "foundation:tax.read",
  "foundation:compliance.read",
  "foundation:donor.read",
  "foundation:fund.read",
  "foundation:grant.read",
  "foundation:program.read",
  "foundation:beneficiary.read",
  "foundation:procurement.read",
  "foundation:asset.read",
  "foundation:investment.read",
  "foundation:safeguarding.read",
  "foundation:impact.read",
  "foundation:assignment.read",
];

export const UJENZI_OS_READ_PERMISSIONS: PermissionCode[] = [
  "ujenzi:data.read",
];

export type GovernedTenantCode = "BEYU-AGRI" | "BEYU-FOUNDATION" | "BEYU-UJENZI";

export type ResolvedGovernedTenant = {
  id: string;
  code: string;
  classification: Classification;
};

/**
 * Canonical target-tenant resolution for tenant-backed governed domains.
 *
 * The resolver deliberately does not classify the target as an operating
 * system: Agriculture and Ujenzi are Sector OS tenants, while BEYU Foundation
 * is a separate nonprofit legal-entity tenant. In every case, the tenant must
 * be ACTIVE, inside the principal's live tenant scope and no higher than the
 * principal's classification ceiling. Missing/malformed facts fail closed.
 */
export async function resolveGovernedTenant(
  principal: Principal,
  tenantCode: GovernedTenantCode,
): Promise<ResolvedGovernedTenant | null> {
  const tenantIds = await tenantScopeIds(principal);
  const classifications = classificationsAtOrBelow(principal.clearance);
  if (tenantIds.length === 0 || classifications.length === 0) return null;

  const [target] = await db
    .select({ id: tenants.id, code: tenants.code, classification: tenants.classification })
    .from(tenants)
    .where(
      and(
        eq(tenants.code, tenantCode),
        eq(tenants.status, "ACTIVE"),
        inArray(tenants.id, tenantIds),
        inArray(tenants.classification, classifications),
      ),
    )
    .limit(1);
  return (target as ResolvedGovernedTenant | undefined) ?? null;
}

/** Prove a governed tenant is inside the principal's live scope. */
export async function governedTenantInScope(
  principal: Principal,
  tenantCode: GovernedTenantCode,
): Promise<boolean> {
  return (await resolveGovernedTenant(principal, tenantCode)) !== null;
}

/** Foundation access is the conjunction of sister-organization scope and grant. */
export async function foundationOrganizationAuthorized(
  principal: Principal,
): Promise<boolean> {
  return (
    (await governedTenantInScope(principal, "BEYU-FOUNDATION")) &&
    FOUNDATION_READ_PERMISSIONS.some((permission) => can(principal, permission).allowed)
  );
}

/**
 * Resolve launchable operating systems from governed authorization facts.
 *
 * BEYU is the one constitutional control plane. Exactly Finance, Health,
 * Agriculture and Ujenzi are Sector OSs beneath it. A destination returned here
 * is discoverable, never an authorization token; every route rechecks its own
 * RBAC/ABAC, tenant/entity scope and RLS boundary.
 */
export async function authorizedOperatingSystems(
  principal: Principal,
): Promise<OperatingSystemDestination[]> {
  // Keep these lookups ordered. This resolver is also called inside a
  // connection-pinned request transaction; parallel optional-schema and tenant
  // queries on one PostgreSQL connection can poison an unrelated in-flight
  // query before its savepoint is rolled back.
  const agricultureInScope = await governedTenantInScope(principal, "BEYU-AGRI");
  const ujenziInScope = await governedTenantInScope(principal, "BEYU-UJENZI");
  const health = await checkHealthOSAuthorization(principal.userId);
  const allowed = new Set<OperatingSystemDestination["code"]>();

  if (checkBeyuOSAuthorization(principal).authorized) allowed.add("BEYU");
  if (FINANCE_OS_READ_PERMISSIONS.some((permission) => can(principal, permission).allowed)) {
    allowed.add("FINANCE");
  }
  if (health.authorized) allowed.add("HEALTH");
  if (agricultureInScope && can(principal, "agriculture:data.read").allowed) {
    allowed.add("AGRICULTURE");
  }
  if (ujenziInScope && UJENZI_OS_READ_PERMISSIONS.some((permission) => can(principal, permission).allowed)) {
    allowed.add("UJENZI");
  }

  return [BEYU_CONTROL_PLANE, ...SECTOR_OPERATING_SYSTEMS].filter((destination) =>
    allowed.has(destination.code),
  );
}

/**
 * Resolve every launchable governed destination without promoting Foundation
 * into the OS hierarchy. This is presentation routing only; destination routes
 * remain the authority boundaries.
 */
export async function authorizedGovernedDestinations(
  principal: Principal,
): Promise<GovernedDestination[]> {
  const operatingSystems = await authorizedOperatingSystems(principal);
  if (!(await foundationOrganizationAuthorized(principal))) return operatingSystems;
  return [...operatingSystems, FOUNDATION_ORGANIZATION];
}
