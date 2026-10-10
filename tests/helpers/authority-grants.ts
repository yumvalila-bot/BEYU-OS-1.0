import type { AuthorityGrant } from "../../src/lib/authz";
import { ROLES, type PermissionCode } from "../../src/lib/constants";

/**
 * Build canonical role-assignment tuples for an explicitly stated test scope.
 *
 * This helper deliberately accepts one tenant/entity/country tuple. It never
 * derives authority from a Principal's flattened permissions, entityScope, or
 * countryScope summaries and never cross-joins independent dimension arrays.
 */
export function testRoleAuthorityGrants(input: {
  roles: readonly string[];
  tenantId: string | null;
  legalEntityId?: string | null;
  countryCode?: string | null;
  sourceIdPrefix?: string;
}): AuthorityGrant[] {
  const legalEntityId = input.legalEntityId ?? null;
  const countryCode = input.countryCode ?? null;
  const sourceIdPrefix = input.sourceIdPrefix ?? "TEST_ROLE_ASSIGNMENT";

  return input.roles.flatMap((role, roleIndex) =>
    ((ROLES as Record<string, { permissions?: readonly PermissionCode[] }>)[role]?.permissions ?? []).map((permission) => ({
      sourceId: `${sourceIdPrefix}_${roleIndex}_${role}`,
      source: "ROLE_ASSIGNMENT" as const,
      role,
      permission,
      tenantId: input.tenantId,
      legalEntityId,
      countryCode,
      validFrom: null,
      validTo: null,
    })),
  );
}

/**
 * Build explicit test-system authority tuples for a deliberately synthetic
 * permission set. Use this only where a test is modelling a resolved system or
 * delegated grant rather than one of the canonical role definitions.
 */
export function testPermissionAuthorityGrants(input: {
  permissions: readonly PermissionCode[];
  tenantId: string | null;
  legalEntityId?: string | null;
  countryCode?: string | null;
  sourceIdPrefix?: string;
}): AuthorityGrant[] {
  const legalEntityId = input.legalEntityId ?? null;
  const countryCode = input.countryCode ?? null;
  const sourceIdPrefix = input.sourceIdPrefix ?? "TEST_SYSTEM_AUTHORITY";

  return input.permissions.map((permission, index) => ({
    sourceId: `${sourceIdPrefix}_${index}_${permission}`,
    source: "SYSTEM" as const,
    role: "TEST_SYSTEM",
    permission,
    tenantId: input.tenantId,
    legalEntityId,
    countryCode,
    validFrom: null,
    validTo: null,
  }));
}
