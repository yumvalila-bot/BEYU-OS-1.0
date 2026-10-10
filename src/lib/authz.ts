import { and, eq, inArray, isNull, or, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { adminAuthorityDelegations, emergencyAccessGrants, legalEntities, roleAssignments, roles, tenants, users } from "@/db/schema";
import {
  AGRICULTURE_OS_TENANT_CODE,
  UJENZI_OS_TENANT_CODE,
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

export type AuthorityGrant = {
  /** Stable identifier of the canonical grant instrument. */
  sourceId: string;
  source: "ROLE_ASSIGNMENT" | "EMERGENCY" | "DELEGATION" | "SYSTEM";
  role: string;
  permission: PermissionCode;
  /** null is an explicitly unscoped dimension on this same grant. */
  tenantId: string | null;
  legalEntityId: string | null;
  countryCode: string | null;
  validFrom: Date | null;
  validTo: Date | null;
};

export type Principal = {
  userId: string;
  partyId: string;
  email: string;
  displayName: string;
  tenantId: string;
  tenantCode: string;
  tenantType: string;
  roles: string[];
  /** Compatibility summary for presentation only; can() never authorizes from it. */
  permissions: Set<PermissionCode>;
  clearance: Classification;
  /** Compatibility summaries for presentation/query shaping only. */
  entityScope: string[];
  countryScope?: string[];
  mfaSatisfied: boolean;
  sessionId: string;
  riskScore: number;
  emergencyPermissions: PermissionCode[];
  delegatedPermissions?: PermissionCode[];
  /**
   * Canonical inseparable authority tuples. Each permission must match all
   * dimensions on one live tuple; dimensions from different grants are never
   * unioned or recombined.
   */
  authorityGrants?: readonly AuthorityGrant[];
  accountStatus?: string;
  isServiceAccount?: boolean;
};

export const GLOBAL_AUTHORITY_ROLES = new Set([
  "GROUP_CEO",
  "GROUP_CFO",
  "CHIEF_GOVERNANCE_OFFICER",
  "CHIEF_RISK_COMPLIANCE",
  "FAMILY_OFFICE_PRINCIPAL",
  "HCM_DIRECTOR",
  "PLATFORM_ADMIN",
  "AUDITOR",
]);

export type AccessDecision = {
  allowed: boolean;
  reason: string;
  requiresMfa: boolean;
  highRisk: boolean;
};

export async function loadGrants(userId: string, tenantId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: roleAssignments.id,
      code: roles.code,
      entityId: roleAssignments.legalEntityId,
      tenantId: roleAssignments.tenantId,
      globalScope: roleAssignments.globalScope,
      assignmentTenantType: tenants.type,
      effectiveFrom: roleAssignments.effectiveFrom,
      effectiveTo: roleAssignments.effectiveTo,
    })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .innerJoin(tenants, eq(tenants.id, roleAssignments.tenantId))
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

export async function activeEmergencyAuthorityGrants(
  userId: string,
  tenantId: string,
): Promise<AuthorityGrant[]> {
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
  return rows.flatMap((row) =>
    (row.permissionCodes as PermissionCode[]).map((permission) => ({
      sourceId: row.id,
      source: "EMERGENCY" as const,
      role: "EMERGENCY_ACCESS",
      permission,
      tenantId: row.tenantId,
      legalEntityId: null,
      countryCode: null,
      validFrom: row.activatedAt,
      validTo: row.expiresAt,
    })),
  );
}

export async function activeEmergencyPermissions(userId: string, tenantId: string): Promise<PermissionCode[]> {
  return [...new Set((await activeEmergencyAuthorityGrants(userId, tenantId)).map((grant) => grant.permission))];
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
export async function activeDelegatedAuthorityGrants(userId: string): Promise<AuthorityGrant[]> {
  const now = new Date();
  const [delegatee] = await db.select({ primaryTenantId: users.primaryTenantId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!delegatee) return [];
  const rows = await db
    .select({
      id: adminAuthorityDelegations.id,
      permissions: adminAuthorityDelegations.permissions,
      tenantIds: adminAuthorityDelegations.scopeTenantIds,
      legalEntityIds: adminAuthorityDelegations.scopeLegalEntityIds,
      countryCodes: adminAuthorityDelegations.scopeCountryCodes,
      effectiveFrom: adminAuthorityDelegations.effectiveFrom,
      effectiveTo: adminAuthorityDelegations.effectiveTo,
    })
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
  const requestedEntityIds = [...new Set(rows.flatMap((row) => row.legalEntityIds ?? []))];
  const entityRows = requestedEntityIds.length > 0
    ? await db.select({ id: legalEntities.id, tenantId: legalEntities.tenantId, countryCode: legalEntities.countryCode })
        .from(legalEntities)
        .where(inArray(legalEntities.id, requestedEntityIds))
    : [];
  const entityById = new Map(entityRows.map((entity) => [entity.id, entity]));
  const grants: AuthorityGrant[] = [];
  for (const row of rows) {
    // An empty tenant list is malformed delegation authority, never global.
    if (!row.tenantIds?.length) continue;
    for (const rawPermission of row.permissions ?? []) {
      if (!(ADMIN_DELEGATABLE_PERMISSIONS as readonly string[]).includes(rawPermission)) continue;
      for (const tenantId of row.tenantIds) {
        // Delegation can narrow the delegatee's canonical home scope, never
        // widen it into another tenant merely because the delegator is global.
        if (tenantId !== delegatee.primaryTenantId) continue;
        if (row.legalEntityIds?.length) {
          // Entity identifiers are resolved back to their canonical tenant and
          // country. Independent arrays are never cross-joined into authority
          // tuples that do not exist in the organization model.
          for (const legalEntityId of row.legalEntityIds) {
            const entity = entityById.get(legalEntityId);
            if (!entity || entity.tenantId !== tenantId) continue;
            if (row.countryCodes?.length && (!entity.countryCode || !row.countryCodes.includes(entity.countryCode))) continue;
            grants.push({
              sourceId: row.id,
              source: "DELEGATION",
              role: "DELEGATED_AUTHORITY",
              permission: rawPermission as PermissionCode,
              tenantId,
              legalEntityId,
              // An entity's canonical country closes the tuple even if the
              // proposal omitted a country array; callers must resolve it.
              countryCode: entity.countryCode,
              validFrom: row.effectiveFrom,
              validTo: row.effectiveTo,
            });
          }
          continue;
        }
        const countries = row.countryCodes?.length ? row.countryCodes : [null];
        for (const countryCode of countries) {
          grants.push({
            sourceId: row.id,
            source: "DELEGATION",
            role: "DELEGATED_AUTHORITY",
            permission: rawPermission as PermissionCode,
            tenantId,
            legalEntityId: null,
            countryCode,
            validFrom: row.effectiveFrom,
            validTo: row.effectiveTo,
          });
        }
      }
    }
  }
  return grants;
}

export async function activeDelegatedPermissions(userId: string): Promise<PermissionCode[]> {
  return [...new Set((await activeDelegatedAuthorityGrants(userId)).map((grant) => grant.permission))];
}

export function roleAuthorityGrants(
  grants: Awaited<ReturnType<typeof loadGrants>>,
): AuthorityGrant[] {
  return grants.flatMap((grant) => {
    const globallyUnscoped =
      grant.globalScope === true &&
      grant.assignmentTenantType === "ENTERPRISE" &&
      grant.entityId === null &&
      GLOBAL_AUTHORITY_ROLES.has(grant.code);
    return (ROLES[grant.code]?.permissions ?? []).map((permission) => ({
      sourceId: grant.id,
      source: "ROLE_ASSIGNMENT" as const,
      role: grant.code,
      permission,
      tenantId: globallyUnscoped ? null : grant.tenantId,
      legalEntityId: grant.entityId,
      countryCode: null,
      validFrom: new Date(`${grant.effectiveFrom}T00:00:00.000Z`),
      validTo: grant.effectiveTo ? new Date(`${grant.effectiveTo}T23:59:59.999Z`) : null,
    }));
  });
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

/**
 * Return grants that satisfy every requested dimension on one inseparable
 * authority tuple. A constrained dimension omitted by the caller cannot match.
 */
export function matchingAuthorityGrants(
  principal: Principal,
  permission: PermissionCode,
  context?: { tenantId?: string | null; entityId?: string | null; countryCode?: string | null },
): readonly AuthorityGrant[] {
  const now = Date.now();
  const targetTenant = context && Object.prototype.hasOwnProperty.call(context, "tenantId")
    ? context.tenantId ?? null
    : principal.tenantId;
  const targetEntity = context && Object.prototype.hasOwnProperty.call(context, "entityId")
    ? context.entityId ?? null
    : null;
  const targetCountry = context && Object.prototype.hasOwnProperty.call(context, "countryCode")
    ? context.countryCode ?? null
    : null;

  return (principal.authorityGrants ?? []).filter((grant) => {
    if (grant.permission !== permission) return false;
    if (grant.validFrom && grant.validFrom.getTime() > now) return false;
    if (grant.validTo && grant.validTo.getTime() < now) return false;
    if (grant.tenantId !== null && grant.tenantId !== targetTenant) return false;
    if (grant.legalEntityId !== null && grant.legalEntityId !== targetEntity) return false;
    if (grant.countryCode !== null && grant.countryCode !== targetCountry) return false;
    return true;
  });
}

/** RBAC + ABAC decision for a single permission in a data context. */
export function can(
  principal: Principal,
  permission: PermissionCode,
  context?: { classification?: Classification; tenantId?: string | null; entityId?: string | null; countryCode?: string | null },
): AccessDecision {
  const highRisk = HIGH_RISK_PERMISSIONS.includes(permission);
  const matchingGrants = matchingAuthorityGrants(principal, permission, context);

  if (matchingGrants.length === 0) {
    return {
      allowed: false,
      reason: `RBAC/ABAC: no single active authority grant for ${permission} matches the requested tenant, entity and country (${PERMISSIONS[permission] ?? "unknown permission"})`,
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
  // Ujenzi writes are tenant-bound to the Ujenzi OS tenant, by the same rule as
  // Agriculture (audit H-2). A sector operator of another tenant must not create or
  // amend construction records in its own tenant namespace. Reads are unchanged.
  if (permission === "ujenzi:data.manage" && principal.tenantCode !== UJENZI_OS_TENANT_CODE) {
    return {
      allowed: false,
      reason: "ABAC: ujenzi writes require the Ujenzi OS tenant",
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
