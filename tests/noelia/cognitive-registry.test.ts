import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../src/db";
import { createDefaultNoeliaToolRegistry } from "../../src/lib/noelia/default-tools";
import { resolveNoeliaAuthorizedScope } from "../../src/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import { NOELIA_BRAINS } from "../../src/lib/noelia/cognitive/brain-contracts";
import { seededPrincipal } from "./db-fixtures";

/**
 * Acceptance evidence that the cognitive core is wired into the ONE registry and
 * the ONE authorization gate — not a parallel dispatch path.
 *
 * Covers: TEST 01 (single identity), TEST 02 (eight brain participation),
 * TEST 12 (tool authorization), TEST 13 (financial safety).
 */

const COGNITIVE_CAPABILITIES = [
  "noelia.world_model.query",
  "noelia.knowledge_graph.query",
  "noelia.decision_memory.query",
  "noelia.council.deliberate",
  "noelia.scenario.simulate",
  "noelia.evaluation.status",
  "noelia.personal_context.read",
  "noelia.operations.status",
] as const;

afterAll(async () => {
  await pool.end().catch(() => undefined);
});

describe("cognitive capabilities are registered in the one HIVE registry", () => {
  it("registers every cognitive capability with a full governed contract", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const listed = new Map(registry.list().map((tool) => [tool.name, tool]));
    for (const name of COGNITIVE_CAPABILITIES) {
      const tool = listed.get(name);
      expect(tool, `${name} must be declared`).toBeDefined();
      expect(tool!.registered, `${name} must have a handler`).toBe(true);
      expect(tool!.metadata.stableId).toMatch(/^cap-noelia-/);
      expect(tool!.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(tool!.metadata.auditRequirements.event).toBe("NOELIA_TOOL_INVOKED");
      // The cognitive core is read-only. No capability here may claim a write.
      expect(tool!.metadata.sideEffects).toBe("NONE");
      expect(tool!.metadata.idempotent).toBe(true);
    }
  });

  it("never grants a cognitive capability a high-risk write path", () => {
    const registry = createDefaultNoeliaToolRegistry();
    for (const name of COGNITIVE_CAPABILITIES) {
      const definition = registry.definition(name)!;
      // A read-only observer cannot be a HIGH-risk mutating capability.
      expect(definition.risk).toBe("LOW");
      expect(definition.approverRole).toBeUndefined();
    }
  });

  it("every brain's declared reach names a capability that is ACTUALLY registered", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const names = new Set(registry.list().map((tool) => tool.name));
    for (const brain of NOELIA_BRAINS) {
      for (const capability of brain.capabilityReach) {
        expect(names.has(capability), `${brain.id} declares unregistered capability '${capability}'`).toBe(true);
      }
    }
  });

  it("denies an unknown or unregistered capability by default", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const unknown = registry.authorize("noelia.nonexistent.tool", null);
    expect(unknown.allowed).toBe(false);
    if (!unknown.allowed) expect(unknown.code).toBe("TOOL_UNKNOWN");

    const noContext = registry.authorize("noelia.world_model.query", null);
    expect(noContext.allowed).toBe(false);
  });
});

describe("cognitive capabilities respect authority at invocation", () => {
  it("authorizes the world model for a governance principal and denies an ungranted one", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    const registry = createDefaultNoeliaToolRegistry();

    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const target = {
        tenantId: principal.tenantId,
        legalEntityId: null,
        countryCode: null,
      };

      const allowed = registry.authorize("noelia.world_model.query", {
        principal,
        traceId: "REG_TEST_1",
        target,
        scope,
      });
      expect(allowed.allowed).toBe(true);

      const ungranted = {
        ...principal,
        authorityGrants: [],
        delegatedPermissions: [],
        emergencyPermissions: [],
      };
      const denied = registry.authorize("noelia.world_model.query", {
        principal: ungranted as typeof principal,
        traceId: "REG_TEST_2",
        target,
        scope,
      });
      expect(denied.allowed).toBe(false);
      if (!denied.allowed) {
        expect(["PERMISSION_DENIED", "CONTEXT_MISSING", "TENANT_DENIED", "CLASSIFICATION_DENIED"]).toContain(
          denied.code,
        );
      }
    });
  });

  it("denies a cross-tenant target before any institution row is read", async () => {
    const principal = await seededPrincipal("health.ops@beyu.os");
    const registry = createDefaultNoeliaToolRegistry();
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const crossTenant = scope.tenantIds.length > 0 ? `${scope.tenantIds[0]}_OTHER` : "TEN_UNKNOWN";
      const decision = registry.authorize("noelia.world_model.query", {
        principal,
        traceId: "REG_TEST_3",
        target: { tenantId: crossTenant, legalEntityId: null, countryCode: null },
        scope,
      });
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.code).toBe("TENANT_DENIED");
    });
  });

  it("executes the world model through the registry and returns a governed envelope", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    const registry = createDefaultNoeliaToolRegistry();
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const result = await registry.invoke(
        "noelia.world_model.query",
        {
          principal,
          traceId: "REG_TEST_4",
          target: { tenantId: principal.tenantId, legalEntityId: null, countryCode: null },
          scope,
        },
        { limit: 10 },
      );
      expect(result.allowed).toBe(true);
      if (!result.allowed) return;
      expect(result.output.findings).toBeDefined();
      expect(result.output.whatIsMissing?.join(" ")).toMatch(/FINANCIAL_VALUES/);
      // No financial magnitude is asserted by the world model.
      expect(JSON.stringify(result.output)).not.toMatch(/"revenue":/i);
    });
  });

  it("refuses malformed input at the contract boundary", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    const registry = createDefaultNoeliaToolRegistry();
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const result = await registry.invoke(
        "noelia.knowledge_graph.query",
        {
          principal,
          traceId: "REG_TEST_5",
          target: { tenantId: principal.tenantId, legalEntityId: null, countryCode: null },
          scope,
        },
        { subjectType: "ENTITY", subjectRef: "x", extraField: "not allowed" },
      );
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.decision.code).toBe("INPUT_INVALID");
    });
  });

  it("runs a simulation through the registry and labels it SIMULATION", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    const registry = createDefaultNoeliaToolRegistry();
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const result = await registry.invoke(
        "noelia.scenario.simulate",
        {
          principal,
          traceId: "REG_TEST_6",
          target: { tenantId: principal.tenantId, legalEntityId: null, countryCode: null },
          scope,
        },
        {
          objective: "Model hospital expansion capital",
          scenarioKind: "CAPITAL_PLANNING",
          method: "LINEAR_COMBINATION",
          variables: [
            {
              key: "CAPEX",
              label: "Capital expenditure",
              optimistic: 100,
              baseline: 150,
              adverse: 220,
              unit: "USD_M",
              provenance: "ESTIMATE",
            },
          ],
          assumptions: ["Cost per bed is stable"],
        },
      );
      expect(result.allowed).toBe(true);
      if (!result.allowed) return;
      expect(result.output.headline).toMatch(/^Simulated \(not a record\):/);
      expect(result.output.metadata?.resultClass).toBe("SIMULATION");
      // The scenario values appear only as SCENARIO metrics, never as facts.
      for (const metric of result.output.metrics ?? []) {
        expect(metric.status).toBe("SCENARIO");
      }
    });
  });
});
