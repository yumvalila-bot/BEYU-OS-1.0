import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { tenants, users } from "../../src/db/schema";
import {
  activeEmergencyPermissions,
  clearanceForRoles,
  loadGrants,
  permissionsForRoles,
  type Principal,
} from "../../src/lib/authz";

export async function seededPrincipal(email: string): Promise<Principal> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`Missing seeded user ${email}`);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.primaryTenantId)).limit(1);
  if (!tenant) throw new Error(`Missing tenant for ${email}`);
  const grants = await loadGrants(user.id, user.primaryTenantId);
  const roles = [...new Set(grants.map((grant) => grant.code))];
  return {
    userId: user.id,
    partyId: user.partyId,
    email: user.email,
    displayName: user.email,
    tenantId: user.primaryTenantId,
    tenantCode: tenant.code,
    tenantType: tenant.type,
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [...new Set(grants.map((grant) => grant.entityId).filter((id): id is string => Boolean(id)))],
    mfaSatisfied: true,
    sessionId: "SES_NOELIA_TEST",
    riskScore: 0,
    emergencyPermissions: await activeEmergencyPermissions(user.id, user.primaryTenantId),
  };
}
