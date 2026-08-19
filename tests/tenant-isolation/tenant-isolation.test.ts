import "dotenv/config";
import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { legalEntities, tenants, users } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { loadGrants, permissionsForRoles, clearanceForRoles, type Principal } from "../../src/lib/authz";
import { tenantScopeIds } from "../../src/lib/tenant-scope";

async function principalFor(userKey: string): Promise<Principal> {
  const userId = fixedId(ID_PREFIX.user, userKey);
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const [t] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roles = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: t.code,
    tenantType: t.type,
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "TEST",
    riskScore: 0,
    emergencyPermissions: [],
  };
}

describe("C-02 tenant isolation", () => {
  it("lowest-privileged sector operator cannot enumerate group topology through canonical scope", async () => {
    const p = await principalFor("SARA_LEMA");
    expect(p.tenantCode).toBe("BEYU-HEALTH");
    const scope = await tenantScopeIds(p);
    expect(scope).toEqual([p.tenantId]);
    const rows = await db.select({ name: legalEntities.legalName, tenantId: legalEntities.tenantId }).from(legalEntities).where(inArray(legalEntities.tenantId, scope));
    expect(rows.every((r) => r.tenantId === p.tenantId)).toBe(true);
    expect(rows.map((r) => r.name)).not.toContain("BEYU Family Trust");
    expect(rows.map((r) => r.name)).not.toContain("BEYU Holdings Ltd");
  });

  it("enterprise governance identity receives the explicit enterprise tenant subtree", async () => {
    const p = await principalFor("AMANI_BEYU");
    const scope = await tenantScopeIds(p);
    expect(scope.length).toBeGreaterThan(1);
    const rows = await db.select().from(legalEntities).where(inArray(legalEntities.tenantId, scope));
    expect(rows.some((r) => r.legalName === "BEYU Family Trust")).toBe(true);
  });

  it("RLS policies are enabled on critical tenant-scoped tables", async () => {
    const r = await db.execute<{ relname: string }>(sql`
      select c.relname
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('legal_entities','ownership_records','employees','audit_log','enterprise_events') and c.relrowsecurity
    `);
    expect(r.rows.map((x) => x.relname).sort()).toEqual(['audit_log','employees','enterprise_events','legal_entities','ownership_records'].sort());
  });
});
