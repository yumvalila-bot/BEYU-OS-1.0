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
import { and, eq } from "drizzle-orm";
import { db, withDatabaseTransactionContext } from "../../src/db";
import { legalEntities } from "../../src/db/schema";
import { can, type Principal } from "../../src/lib/authz";
import { resolveNoeliaAuthorizedScope, requestedNoeliaTarget } from "../../src/lib/noelia/scope-service";
import { createDefaultNoeliaToolRegistry } from "../../src/lib/noelia/default-tools";
import { seededPrincipal } from "../noelia/db-fixtures";

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
    const scoped: Principal = { ...p, entityScope: [entityA.id] };

    // Allowed on entity A ...
    const allowA = can(scoped, "finance:ledger.read", { tenantId: p.tenantId, entityId: entityA.id });
    expect(allowA.allowed).toBe(true);

    // ... denied on entity B in the SAME tenant.
    const denyB = can(scoped, "finance:ledger.read", { tenantId: p.tenantId, entityId: entityB.id });
    expect(denyB.allowed).toBe(false);
    expect(denyB.reason).toMatch(/legal entity outside/i);
  });

  it("Noelia tool registry denies a target legal entity outside the principal's scope", async () => {
    const p = await seededPrincipal("cfo@beyu.os");
    const entities = await withDatabaseTransactionContext(() =>
      db
        .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
        .from(legalEntities)
        .where(eq(legalEntities.tenantId, p.tenantId))
        .limit(2),
    );
    const [entityA, entityB] = entities;
    const scoped: Principal = { ...p, entityScope: [entityA.id] };

    const registry = createDefaultNoeliaToolRegistry();
    const scope = await withDatabaseTransactionContext(() => resolveNoeliaAuthorizedScope(scoped));

    // Target entity A (in scope) → allowed.
    const targetA = requestedNoeliaTarget(scoped, { legalEntityId: entityA.id });
    const decisionA = registry.authorize("finance.cash.position", {
      principal: scoped,
      traceId: "ENTITY_TEST_A",
      target: targetA,
      scope,
      approval: null,
    });
    expect(decisionA.allowed).toBe(true);

    // Target entity B (same tenant, out of scope) → ENTITY_DENIED.
    const targetB = requestedNoeliaTarget(scoped, { legalEntityId: entityB.id });
    const decisionB = registry.authorize("finance.cash.position", {
      principal: scoped,
      traceId: "ENTITY_TEST_B",
      target: targetB,
      scope,
      approval: null,
    });
    expect(decisionB.allowed).toBe(false);
    expect(decisionB.code).toBe("ENTITY_DENIED");
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
