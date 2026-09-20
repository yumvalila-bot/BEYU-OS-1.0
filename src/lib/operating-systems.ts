import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { can, type Principal } from "@/lib/authz";
import { classificationsAtOrBelow, type Classification, type PermissionCode } from "@/lib/constants";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";
import { checkBeyuOSAuthorization } from "@/lib/os-authorization";
import { tenantScopeIds } from "@/lib/tenant-scope";

// Re-export the same canonical catalogue; keep it usable by UI without DB imports.
import { BEYU_CONTROL_PLANE, SECTOR_OPERATING_SYSTEMS, type OperatingSystemDestination } from "./operating-system-catalog";
export { BEYU_CONTROL_PLANE, SECTOR_OPERATING_SYSTEMS, type OperatingSystemDestination } from "./operating-system-catalog";

export const FINANCE_OS_READ_PERMISSIONS: PermissionCode[] = [
  "finance:ledger.read",
  "finance:treasury.read",
  "finance:capital.read",
  "finance:waterfall.read",
  "finance:tax.read",
  "finance:payments.read",
];

export const FOUNDATION_OS_READ_PERMISSIONS: PermissionCode[] = [
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

export type OperatingSystemTenantCode = "BEYU-AGRI" | "BEYU-FOUNDATION" | "BEYU-UJENZI";

export type ResolvedOperatingSystemTenant = {
  id: string;
  code: string;
  classification: Classification;
};

/**
 * Canonical Sector OS target resolution.
 *
 * Resolves the one tenant-backed Sector OS tenant that the principal may act
 * on, from governed facts only: the tenant must be ACTIVE, inside the
 * principal's resolved tenant subtree (`tenantScopeIds`) and no higher than the
 * principal's classification ceiling. Unknown/malformed principal clearance
 * yields an empty allow-list and therefore resolves nothing (fail closed).
 *
 * This is the single resolver. The deep-link layouts use the boolean wrapper
 * below; the Foundation API boundary and Foundation services call it directly so
 * the UI boundary and the API boundary cannot diverge.
 */
export async function resolveOperatingSystemTenant(
  principal: Principal,
  tenantCode: OperatingSystemTenantCode,
): Promise<ResolvedOperatingSystemTenant | null> {
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
  return (target as ResolvedOperatingSystemTenant | undefined) ?? null;
}

/**
 * Prove that a tenant-backed Sector OS belongs to the principal's resolved
 * tenant subtree and classification ceiling. A generic sector permission is
 * not enough to make another sector's OS reachable.
 */
export async function operatingSystemTenantInScope(
  principal: Principal,
  tenantCode: OperatingSystemTenantCode,
): Promise<boolean> {
  return (await resolveOperatingSystemTenant(principal, tenantCode)) !== null;
}

/**
 * Resolve launchable operating systems from governed authorization facts.
 *
 * BEYU is the one constitutional control plane. Finance, Health, Agriculture
 * and Foundation are Sector OSs beneath it. A destination returned here is a
 * discoverable launch target, never an authorization token: its route performs
 * the same server-side check again, and every nested capability retains its own
 * RBAC/ABAC/RLS boundary.
 */
export async function authorizedOperatingSystems(
  principal: Principal,
): Promise<OperatingSystemDestination[]> {
  // Keep these lookups ordered. This resolver is also called inside the
  // connection-pinned BEYU request transaction; concurrent optional-schema and
  // tenant queries on that one PostgreSQL connection can let an expected Health
  // lookup failure poison an unrelated in-flight query before its savepoint is
  // rolled back.
  const agricultureInScope = await operatingSystemTenantInScope(
    principal,
    "BEYU-AGRI",
  );
  const foundationInScope = await operatingSystemTenantInScope(
    principal,
    "BEYU-FOUNDATION",
  );
  const ujenziInScope = await operatingSystemTenantInScope(
    principal,
    "BEYU-UJENZI",
  );
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
  if (
    foundationInScope &&
    FOUNDATION_OS_READ_PERMISSIONS.some((permission) => can(principal, permission).allowed)
  ) {
    allowed.add("FOUNDATION");
  }
  if (ujenziInScope && UJENZI_OS_READ_PERMISSIONS.some((permission) => can(principal, permission).allowed)) {
    allowed.add("UJENZI");
  }

  return [BEYU_CONTROL_PLANE, ...SECTOR_OPERATING_SYSTEMS].filter((destination) =>
    allowed.has(destination.code),
  );
}
