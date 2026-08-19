import "dotenv/config";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
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

  /**
   * H-NEW-1 regression: the tax page previously enumerated ALL legal entities
   * globally and passed them to the assessment workbench dropdown, exposing entity
   * names outside the principal's tenant. This asserts the page's query path.
   */
  it("H-NEW-1: the tax page entity query cannot leak entities across tenants", async () => {
    const sector = await principalFor("SARA_LEMA");
    const scope = await tenantScopeIds(sector);

    const scoped = await db.select().from(legalEntities).where(inArray(legalEntities.tenantId, scope));
    const all = await db.select().from(legalEntities);

    expect(all.length).toBeGreaterThan(scoped.length);
    expect(scoped.every((e) => e.tenantId === sector.tenantId)).toBe(true);
    const names = scoped.map((e) => e.legalName);
    expect(names).not.toContain("BEYU Family Trust");
    expect(names).not.toContain("BEYU Holdings Ltd");
    expect(names).not.toContain("BEYU Foundation");

    // The page must obtain scope from the canonical helper, not query globally.
    const source = await readFile("src/app/os/tax/page.tsx", "utf8");
    expect(source).toContain("tenantScopeIds");
    expect(source).toContain("inArray(legalEntities.tenantId, scope)");
    expect(source).not.toMatch(/db\.select\(\)\.from\(legalEntities\)\s*,/);
  });

  /**
   * H-NEW-2 regression: the foundation page resolved its tenant and legal entity
   * by hardcoded code, bypassing the principal's scope entirely.
   */
  it("H-NEW-2: the foundation page is tenant-scoped, not code-addressed", async () => {
    const sector = await principalFor("SARA_LEMA");
    const enterprise = await principalFor("AMANI_BEYU");

    const sectorScope = await tenantScopeIds(sector);
    const enterpriseScope = await tenantScopeIds(enterprise);

    const foundationVisibleToSector = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.code, "BEYU-FOUNDATION"), inArray(tenants.id, sectorScope)));
    const foundationVisibleToEnterprise = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.code, "BEYU-FOUNDATION"), inArray(tenants.id, enterpriseScope)));

    // The sector operator is denied; the enterprise governance identity is not.
    expect(foundationVisibleToSector.length).toBe(0);
    expect(foundationVisibleToEnterprise.length).toBe(1);

    const source = await readFile("src/app/os/foundation/page.tsx", "utf8");
    expect(source).toContain("tenantScopeIds");
    expect(source).toContain("inArray(tenants.id, scope)");
    // The legal entity lookup is scoped too, not addressed by bare code.
    expect(source).toContain("inArray(legalEntities.tenantId, foundationScope)");
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
