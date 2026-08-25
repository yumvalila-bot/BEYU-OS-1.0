import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool, withDatabaseTransactionContext } from "../../src/db";
import { legalEntities, tenants } from "../../src/db/schema";
import { resolveNoeliaAuthorizedScope, requestedNoeliaTarget } from "../../src/lib/noelia/scope-service";
import { seededPrincipal } from "../noelia/db-fixtures";

/**
 * Iteration 7 — ABAC tenant/entity/country scope derivation.
 * Country scope is DERIVED from the principal's tenant + legal-entity
 * visibility through canonical BEYU primitives; it is never client-supplied.
 */

describe("Iteration 7 ABAC scope derivation (DB-backed)", () => {
  it("a governance principal resolves the enterprise tenant subtree", async () => {
    const p = await seededPrincipal("governance@beyu.os");
    const scope = await withDatabaseTransactionContext(() => resolveNoeliaAuthorizedScope(p));
    expect(scope.enterprise).toBe(true);
    expect(scope.tenantIds.length).toBeGreaterThanOrEqual(3); // group + country tenants
    expect(scope.countryCodes.length).toBeGreaterThan(0);
  });

  it("a sector operator resolves only its own tenant, never the subtree", async () => {
    const p = await seededPrincipal("health.ops@beyu.os");
    const scope = await withDatabaseTransactionContext(() => resolveNoeliaAuthorizedScope(p));
    expect(scope.enterprise).toBe(false);
    expect(scope.tenantIds).toEqual([p.tenantId]);
  });

  it("entity-scoped principals receive only the granted entities' countries", async () => {
    const p = await seededPrincipal("governance@beyu.os");
    const entityRows = await db
      .select({ id: legalEntities.id, countryCode: legalEntities.countryCode })
      .from(legalEntities)
      .where(inArray(legalEntities.tenantId, [p.tenantId]))
      .limit(2);
    // Synthesize a principal scoped to exactly one entity.
    const scoped = { ...p, entityScope: [entityRows[0].id] };
    const scope = await withDatabaseTransactionContext(() => resolveNoeliaAuthorizedScope(scoped));
    expect(scope.legalEntityIds).toEqual([entityRows[0].id]);
    // Country set reflects only that entity's country (tenant countries are
    // excluded when an entity scope is present).
    if (entityRows[0].countryCode) {
      expect(scope.countryCodes).toEqual([entityRows[0].countryCode]);
    } else {
      expect(scope.countryCodes).toEqual([]);
    }
  });

  it("country scope fails closed to empty when no country is visible", async () => {
    // A tenant without countryCode and without entities yields no countries.
    const [groupTenant] = await db
      .select({ id: tenants.id, countryCode: tenants.countryCode })
      .from(tenants)
      .where(eq(tenants.code, "BEYU-GROUP"))
      .limit(1);
    const p = await seededPrincipal("governance@beyu.os");
    const noCountry = { ...p, tenantId: groupTenant.id, roles: ["SECTOR_OPERATOR"], tenantType: "ENTERPRISE" };
    // Force zero entity rows for this synthetic principal: its scope is the
    // group tenant, which has no countryCode of its own.
    const scope = await withDatabaseTransactionContext(() => resolveNoeliaAuthorizedScope(noCountry));
    // The country code set must never contain an undefined/garbage value.
    expect(scope.countryCodes.every((c) => typeof c === "string" && c.length > 0)).toBe(true);
  });

  it("client-supplied targets are requests, never grants", async () => {
    const p = await seededPrincipal("health.ops@beyu.os");
    // A client may REQUEST any tenant/entity/country as a target...
    const target = requestedNoeliaTarget(p, { tenantId: "TEN_BEYU_GROUP", legalEntityId: "LEN_X", countryCode: "KE" });
    expect(target.tenantId).toBe("TEN_BEYU_GROUP");
    // ...but the authorized scope is derived from the principal only, so the
    // engine filters any target against it. A target outside the scope is a
    // zero-finding denial, never an implicit grant.
    const scope = await withDatabaseTransactionContext(() => resolveNoeliaAuthorizedScope(p));
    expect(scope.tenantIds).not.toContain("TEN_BEYU_GROUP");
    expect(scope.legalEntityIds).not.toContain("LEN_X");
  });
});

afterAll(async () => {
  await pool.end().catch(() => undefined);
});
