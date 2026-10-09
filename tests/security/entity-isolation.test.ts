/**
 * C-02 remediation — legal-entity isolation (application layer).
 *
 * Database-level RLS in BEYU OS is TENANT-scoped (every tenant table is scoped
 * by `tenant_id`). Legal-entity isolation is enforced at the APPLICATION layer
 * (ABAC `entityScope` and the Noelia tool registry `ENTITY_DENIED`), because
 * legal-entity authorization is derived from a principal's grants and cannot be
 * expressed purely as a fixed DB column on every table. This test proves that
 * application-level entity isolation holds: a principal granted entity A in a
 * tenant cannot read or operate on entity B in the SAME tenant, and cannot reach
 * entity A of ANOTHER tenant.
 */
import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db, withDatabaseTransactionContext } from "../../src/db";
import { legalEntities } from "../../src/db/schema";
import { can, type Principal } from "../../src/lib/authz";
import { classificationsAtOrBelow } from "../../src/lib/constants";
import { resolveNoeliaAuthorizedScope, requestedNoeliaTarget } from "../../src/lib/noelia/scope-service";
import { createDefaultNoeliaToolRegistry } from "../../src/lib/noelia/default-tools";
import { tenantScopeIds } from "../../src/lib/tenant-scope";
import { seededPrincipal } from "../noelia/db-fixtures";

function principalScopedToEntity(principal: Principal, entity: { id: string; tenantId: string }): Principal {
  return {
    ...principal,
    // A scoped assignment is evaluated in its target tenant context; keeping
    // the principal's unrelated home tenant would intentionally fail the tenant
    // dimension before this test reached the entity boundary.
    tenantId: entity.tenantId,
    entityScope: [entity.id],
    authorityGrants: (principal.authorityGrants ?? []).map((grant) => ({
      ...grant,
      tenantId: entity.tenantId,
      legalEntityId: entity.id,
    })),
  };
}

describe("C-02 legal-entity isolation (application layer)", () => {
  it("tenant authorization does not imply unrestricted legal-entity access (ABAC)", async () => {
    const p = await seededPrincipal("cfo@beyu.os");
    const entities = await withDatabaseTransactionContext(() =>
      db
        .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
        .from(legalEntities)
        .where(eq(legalEntities.tenantId, p.tenantId))
        .limit(2),
    );
    expect(entities.length).toBeGreaterThanOrEqual(2);
    const [entityA, entityB] = entities;

    // Principal scoped to ONLY entity A.
    const scoped = principalScopedToEntity(p, entityA);

    // Allowed on entity A ...
    const allowA = can(scoped, "finance:ledger.read", { tenantId: p.tenantId, entityId: entityA.id });
    expect(allowA.allowed).toBe(true);

    // ... denied on entity B in the SAME tenant.
    const denyB = can(scoped, "finance:ledger.read", { tenantId: p.tenantId, entityId: entityB.id });
    expect(denyB.allowed).toBe(false);
    expect(denyB.reason).toMatch(/no single active authority grant/i);
  });

  it("Noelia tool registry denies a target legal entity outside the principal's scope", async () => {
    const p = await seededPrincipal("cfo@beyu.os");
    const [entityA, entityB] = await withDatabaseTransactionContext(async () => {
      const authorizedTenantIds = await tenantScopeIds(p);
      const entities = await db
        .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
        .from(legalEntities)
        .where(
          and(
            inArray(legalEntities.tenantId, authorizedTenantIds),
            inArray(
              legalEntities.classification,
              classificationsAtOrBelow(p.clearance),
            ),
          ),
        )
        .orderBy(legalEntities.tenantId, legalEntities.id);

      // Choose two clearance-visible entities in one tenant. The Group CFO's
      // primary tenant also contains the HIGHLY_RESTRICTED family trust, so
      // blindly taking its first two rows would make the supposed positive
      // control a classification denial rather than an entity-scope test.
      const byTenant = new Map<string, typeof entities>();
      for (const entity of entities) {
        const group = byTenant.get(entity.tenantId) ?? [];
        group.push(entity);
        byTenant.set(entity.tenantId, group);
      }
      const pair = [...byTenant.values()].find((group) => group.length >= 2);
      if (!pair) throw new Error("Missing two clearance-visible legal entities in one authorized tenant");
      return [pair[0], pair[1]] as const;
    });
    const scoped = principalScopedToEntity(p, entityA);

    const registry = createDefaultNoeliaToolRegistry();
    const scope = await withDatabaseTransactionContext(() => resolveNoeliaAuthorizedScope(scoped));

    // Target entity A (in scope) → allowed.
    const targetA = requestedNoeliaTarget(scoped, {
      tenantId: entityA.tenantId,
      legalEntityId: entityA.id,
    });
    const decisionA = registry.authorize("finance.cash.position", {
      principal: scoped,
      traceId: "ENTITY_TEST_A",
      target: targetA,
      scope,
      approval: null,
    });
    expect(decisionA.allowed).toBe(true);

    // Target entity B (same tenant, out of scope) is denied by the finite,
    // server-resolved composite scope before any capability execution or
    // compatibility scope summary can broaden it. This does not query or
    // confirm the requested entity's existence.
    const targetB = requestedNoeliaTarget(scoped, {
      tenantId: entityB.tenantId,
      legalEntityId: entityB.id,
    });
    const decisionB = registry.authorize("finance.cash.position", {
      principal: scoped,
      traceId: "ENTITY_TEST_B",
      target: targetB,
      scope,
      approval: null,
    });
    expect(decisionB.allowed).toBe(false);
    expect(decisionB.code).toBe("ENTITY_DENIED");
    expect(decisionB.reason).toMatch(/outside .* resolved BEYU scope/i);
  });

  it("an entity of ANOTHER tenant is outside the resolved scope (cross-tenant entity)", async () => {
    const p = await seededPrincipal("cfo@beyu.os"); // FINTECH tenant
    const scope = await withDatabaseTransactionContext(() => resolveNoeliaAuthorizedScope(p));
    const otherTenantEntity = await withDatabaseTransactionContext(() =>
      db
        .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
        .from(legalEntities)
        .where(and(eq(legalEntities.tenantId, "TEN_BEYU_AGRI"), ...([] as [])))
        .limit(1),
    );
    if (otherTenantEntity.length === 0) return; // no cross-tenant entity to probe
    const target = requestedNoeliaTarget(p, { legalEntityId: otherTenantEntity[0].id });
    const registry = createDefaultNoeliaToolRegistry();
    const decision = registry.authorize("finance.cash.position", {
      principal: p,
      traceId: "ENTITY_TEST_X",
      target,
      scope,
      approval: null,
    });
    expect(decision.allowed).toBe(false);
    // Either ENTITY_DENIED (entity not in tenant scope) or TENANT_DENIED (target
    // tenant out of scope) — both are denials.
    expect(["ENTITY_DENIED", "TENANT_DENIED"]).toContain(decision.code);
  });
});
