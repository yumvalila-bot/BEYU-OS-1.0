import { and, eq, isNull, or, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { adminAuthorityDelegations, emergencyAccessGrants, roleAssignments, roles, tenants } from "@/db/schema";
import {
  AGRICULTURE_OS_TENANT_CODE,
  ADMIN_DELEGATABLE_PERMISSIONS,
  classificationRank,
  isKnownClassification,
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
 *
 * A permission may be held three ways, all evaluated by the SAME `can()`:
 *   1. ROLE-derived        — role_assignments → ROLES catalogue (the default).
 *   2. EMERGENCY-derived   — an active break-glass grant (A-06-2: unactivatable today).
 *   3. DELEGATION-derived  — an active administrative delegation instrument
 *                            (governed admin program): bounded capability +
 *                            tenant/entity/country scope + time window, loaded
 *                            per request so revocation and expiry are immediate.
 * Delegation NEVER bypasses the ABAC chain: classification, tenant isolation,
 * entity scope and the high-risk MFA step-up all still apply.
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
  /**
   * Permission codes held through ACTIVE administrative delegations. Optional
   * so existing Principal constructions (tests, fixtures) remain valid; absent
   * means "none". Never a fourth authorization path — `can()` treats it exactly
   * like emergency grants, and every ABAC rule still applies.
   */
  delegatedPermissions?: PermissionCode[];
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

export async function activeEmergencyPermissions(
  userId: string,
  tenantId: string,
): Promise<PermissionCode[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(emergencyAccessGrants)
    .where(
      and(
        eq(emergencyAccessGrants.userId, userId),
        eq(emergencyAccessGrants.tenantId, tenantId),
        lte(emergencyAccessGrants.activatedAt, now),
        gte(emergencyAccessGrants.expiresAt, now),
        isNull(emergencyAccessGrants.revokedAt),
      ),
    );
  return rows.flatMap((r) => r.permissionCodes as PermissionCode[]);
}

/**
 * Permission codes held through ACTIVE administrative delegation instruments:
 * status ACTIVE (never revoked — REVOKED is terminal and outranks the window),
 * inside the effective window, and still inside the closed delegable set. The
 * closed-set intersection is defense in depth: even a tampered row granting a
 * non-delegable permission contributes nothing here.
 *
 * Like `activeEmergencyPermissions`, this reads the non-RLS control-plane
 * authorization tables (see src/db/schema/admin-governance.ts for why), so it
 * can be evaluated inside resolvePrincipal() before any tenant context exists.
 */
export async function activeDelegatedPermissions(userId: string): Promise<PermissionCode[]> {
  const now = new Date();
  const rows = await db
    .select({ permissions: adminAuthorityDelegations.permissions })
    .from(adminAuthorityDelegations)
    .where(
      and(
        eq(adminAuthorityDelegations.delegateeUserId, userId),
        eq(adminAuthorityDelegations.status, "ACTIVE"),
        isNull(adminAuthorityDelegations.revokedAt),
        lte(adminAuthorityDelegations.effectiveFrom, now),
        gte(adminAuthorityDelegations.effectiveTo, now),
      ),
    );
  const held = new Set<PermissionCode>();
  for (const row of rows) {
    for (const code of row.permissions ?? []) {
      // Closed-set intersection (defense in depth): even a tampered row naming a
      // non-delegable permission contributes nothing here.
      if ((ADMIN_DELEGATABLE_PERMISSIONS as readonly string[]).includes(code)) {
        held.add(code as PermissionCode);
      }
    }
  }
  return [...held];
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
  const delegated = principal.delegatedPermissions ?? [];
  const hasRbac =
    principal.permissions.has(permission) ||
    principal.emergencyPermissions.includes(permission) ||
    delegated.includes(permission);

  if (!hasRbac) {
    return {
      allowed: false,
      reason: `RBAC: no active grant for ${permission} (${PERMISSIONS[permission] ?? "unknown permission"})`,
      requiresMfa: false,
      highRisk,
    };
  }
  if (!isKnownClassification(principal.clearance)) {
    return {
      allowed: false,
      reason: "ABAC: principal clearance is not recognized",
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
  // Agriculture writes are tenant-bound to the Agriculture OS tenant.
  // SECTOR_OPERATOR is a generic role; Health (and other sector) identities
  // must not inherit Agriculture mutations from the role catalogue.
  if (permission === "agriculture:data.manage" && principal.tenantCode !== AGRICULTURE_OS_TENANT_CODE) {
    return {
      allowed: false,
      reason: "ABAC: agriculture writes require the Agriculture OS tenant",
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
  // Unknown principal clearance is a privilege-escalation vector: classificationRank()
  // ranks unknown DATA high (deny) but would rank an unknown PRINCIPAL above
  // HIGHLY_RESTRICTED (allow). Fail closed in the common primitive.
  if (!isKnownClassification(principal.clearance)) return [];
  return rows.filter(
    (r) => !r.classification || classificationRank(r.classification) <= classificationRank(principal.clearance),
  );
}
