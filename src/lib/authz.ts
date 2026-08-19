import { and, eq, isNull, or, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { emergencyAccessGrants, roleAssignments, roles, tenants } from "@/db/schema";
import {
  classificationRank,
  HIGH_RISK_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  ROLE_CLEARANCE,
  type Classification,
  type PermissionCode,
} from "./constants";

/**
 * Zero-trust authorization.
 * Every request resolves: IDENTITY → TENANT → ENTITY → ROLE → PERMISSION → DATA SCOPE.
 * RBAC (role grants) and ABAC (classification, tenant, entity, risk) must BOTH pass.
 */

export type Principal = {
  userId: string;
  partyId: string;
  email: string;
  displayName: string;
  tenantId: string;
  tenantCode: string;
  tenantType: string;
  roles: string[];
  permissions: Set<PermissionCode>;
  clearance: Classification;
  entityScope: string[]; // legal entity ids, empty = all within tenant subtree
  mfaSatisfied: boolean;
  sessionId: string;
  riskScore: number;
  emergencyPermissions: PermissionCode[];
};

export type AccessDecision = {
  allowed: boolean;
  reason: string;
  requiresMfa: boolean;
  highRisk: boolean;
};

export async function loadGrants(userId: string, tenantId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ code: roles.code, entityId: roleAssignments.legalEntityId, tenantId: roleAssignments.tenantId })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(
      and(
        eq(roleAssignments.userId, userId),
        lte(roleAssignments.effectiveFrom, today),
        or(isNull(roleAssignments.effectiveTo), gte(roleAssignments.effectiveTo, today)),
      ),
    );
  // Tenant isolation: grants apply only in the granted tenant or its ancestors.
  const tenantChain = await tenantAncestry(tenantId);
  return rows.filter((r) => tenantChain.includes(r.tenantId));
}

export async function tenantAncestry(tenantId: string): Promise<string[]> {
  const chain: string[] = [];
  let current: string | null = tenantId;
  let guard = 0;
  while (current && guard < 12) {
    chain.push(current);
    const [row] = await db
      .select({ parent: tenants.parentTenantId })
      .from(tenants)
      .where(eq(tenants.id, current))
      .limit(1);
    current = row?.parent ?? null;
    guard += 1;
  }
  return chain;
}

export async function activeEmergencyPermissions(userId: string): Promise<PermissionCode[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(emergencyAccessGrants)
    .where(and(eq(emergencyAccessGrants.userId, userId), gte(emergencyAccessGrants.expiresAt, now), isNull(emergencyAccessGrants.revokedAt)));
  return rows.flatMap((r) => r.permissionCodes as PermissionCode[]);
}

export function permissionsForRoles(roleCodes: string[]): Set<PermissionCode> {
  const set = new Set<PermissionCode>();
  for (const code of roleCodes) {
    for (const p of ROLES[code]?.permissions ?? []) set.add(p);
  }
  return set;
}

export function clearanceForRoles(roleCodes: string[]): Classification {
  let best: Classification = "PUBLIC";
  for (const code of roleCodes) {
    const c = ROLE_CLEARANCE[code] ?? "INTERNAL";
    if (classificationRank(c) > classificationRank(best)) best = c;
  }
  return best;
}

/** RBAC + ABAC decision for a single permission in a data context. */
export function can(
  principal: Principal,
  permission: PermissionCode,
  context?: { classification?: Classification; tenantId?: string; entityId?: string },
): AccessDecision {
  const highRisk = HIGH_RISK_PERMISSIONS.includes(permission);
  const hasRbac =
    principal.permissions.has(permission) || principal.emergencyPermissions.includes(permission);

  if (!hasRbac) {
    return {
      allowed: false,
      reason: `RBAC: no active grant for ${permission} (${PERMISSIONS[permission] ?? "unknown permission"})`,
      requiresMfa: false,
      highRisk,
    };
  }
  if (context?.classification) {
    if (classificationRank(context.classification) > classificationRank(principal.clearance)) {
      return {
        allowed: false,
        reason: `ABAC: clearance ${principal.clearance} is below data classification ${context.classification}`,
        requiresMfa: false,
        highRisk,
      };
    }
  }
  if (context?.tenantId && context.tenantId !== principal.tenantId) {
    return {
      allowed: false,
      reason: "Tenant isolation: cross-tenant access requires explicit authorization",
      requiresMfa: false,
      highRisk,
    };
  }
  if (context?.entityId && principal.entityScope.length > 0 && !principal.entityScope.includes(context.entityId)) {
    return {
      allowed: false,
      reason: "ABAC: legal entity outside the principal's data scope",
      requiresMfa: false,
      highRisk,
    };
  }
  if (highRisk && !principal.mfaSatisfied) {
    return {
      allowed: false,
      reason: "Step-up authentication required for a high-risk operation",
      requiresMfa: true,
      highRisk,
    };
  }
  return { allowed: true, reason: "Authorized", requiresMfa: false, highRisk };
}

/** Filter a result set down to what the principal may actually see. */
export function filterByClearance<T extends { classification?: string | null }>(
  principal: Principal,
  rows: T[],
): T[] {
  return rows.filter(
    (r) => !r.classification || classificationRank(r.classification) <= classificationRank(principal.clearance),
  );
}
