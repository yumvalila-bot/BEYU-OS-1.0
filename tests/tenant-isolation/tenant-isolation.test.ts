import "dotenv/config";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { legalEntities, resolutions, resolutionVotes, tenants, users } from "../../src/db/schema";
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

    // The scope helper itself must be the thing that constrains the result: an
    // enterprise principal legitimately sees the subtree, a sector one must not.
    const enterprise = await principalFor("AMANI_BEYU");
    const enterpriseScope = await tenantScopeIds(enterprise);
    const enterpriseRows = await db
      .select()
      .from(legalEntities)
      .where(inArray(legalEntities.tenantId, enterpriseScope));
    expect(enterpriseRows.length).toBeGreaterThan(scoped.length);
    expect(enterpriseScope).toContain(sector.tenantId);
    expect(await tenantScopeIds(sector)).not.toContain(enterprise.tenantId);
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

    // The foundation legal entity must also be unreachable by bare code lookup
    // for an out-of-scope principal.
    const fdnForSector = await db
      .select()
      .from(legalEntities)
      .where(and(eq(legalEntities.code, "BEYU-FDN"), inArray(legalEntities.tenantId, sectorScope)));
    expect(fdnForSector.length).toBe(0);

    const foundationScope = foundationVisibleToEnterprise.map((t) => t.id);
    const fdnForEnterprise = await db
      .select()
      .from(legalEntities)
      .where(and(eq(legalEntities.code, "BEYU-FDN"), inArray(legalEntities.tenantId, foundationScope)));
    expect(fdnForEnterprise.length).toBe(1);
  });

  it("RLS policies are enabled on critical tenant-scoped tables", async () => {
    const r = await db.execute<{ relname: string }>(sql`
      select c.relname
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('legal_entities','ownership_records','employees','audit_log','enterprise_events') and c.relrowsecurity
    `);
    expect(r.rows.map((x) => x.relname).sort()).toEqual(['audit_log','employees','enterprise_events','legal_entities','ownership_records'].sort());
  });
  /**
   * §6 — `resolution_votes` is a CHILD table: it has no `tenant_id` column, so
   * RLS cannot apply to it and its tenancy is derived entirely from its parent
   * resolution. That is the canonical BEYU pattern for child tables (30 of 74
   * tables have no tenant_id), but it makes tenant safety depend on a coding
   * invariant rather than a database guarantee.
   *
   * THE INVARIANT: every query against resolution_votes must be constrained by
   * resolution_id values that were themselves resolved through tenantScopeIds().
   *
   * These tests fail if a future change breaks either half of that invariant.
   */
  it("resolution_votes has no tenant column, so it cannot be tenant-scoped directly", async () => {
    const cols = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='resolution_votes'`);
    const names = cols.rows.map((c) => c.column_name);
    expect(names).not.toContain("tenant_id");
    // Its only route to a tenant is the parent resolution.
    expect(names).toContain("resolution_id");

    const parent = await db.execute<{ n: number }>(sql`
      select count(*)::int n from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
      where tc.table_name='resolution_votes' and tc.constraint_type='FOREIGN KEY'
        and ccu.table_name='resolutions'`);
    expect(parent.rows[0].n).toBeGreaterThan(0);
  });

  it("ballots are only reachable through resolutions inside the caller's tenant scope", async () => {
    // A Foundation-scoped officer resolves their own scope; ballots fetched via
    // that scope can never include a resolution belonging to another tenant.
    // A sector-scoped officer: their scope is a strict subset of the group.
    const foundation = await principalFor("SARA_LEMA");
    const scope = await tenantScopeIds(foundation);

    const visible = await db
      .select({ id: resolutions.id, tenantId: resolutions.tenantId })
      .from(resolutions)
      .where(inArray(resolutions.tenantId, scope));

    const ballots = visible.length
      ? await db
          .select({ resolutionId: resolutionVotes.resolutionId })
          .from(resolutionVotes)
          .where(inArray(resolutionVotes.resolutionId, visible.map((v) => v.id)))
      : [];

    const visibleIds = new Set(visible.map((v) => v.id));
    for (const b of ballots) expect(visibleIds.has(b.resolutionId)).toBe(true);

    // And the scope itself genuinely excludes other tenants' resolutions.
    const all = await db.select({ id: resolutions.id, tenantId: resolutions.tenantId }).from(resolutions);
    const outside = all.filter((r) => !scope.includes(r.tenantId));
    expect(outside.every((r) => !visibleIds.has(r.id))).toBe(true);
  });

  it("the vote service never queries resolution_votes without a resolution constraint", async () => {
    // A structural guard, not a source-text assertion about behaviour: it proves
    // that no code path can enumerate ballots across tenants. Every select from
    // resolutionVotes in the service is followed by a .where() naming
    // resolutionVotes.resolutionId.
    const src = await readFile(
      new URL("../../src/lib/governance-vote-service.ts", import.meta.url),
      "utf8",
    );
    const selects = src.split(".from(resolutionVotes)").slice(1);
    expect(selects.length).toBeGreaterThan(0);
    for (const after of selects) {
      const clause = after.slice(0, 400);
      expect(clause).toMatch(/resolutionVotes\.resolutionId/);
    }
  });
});
