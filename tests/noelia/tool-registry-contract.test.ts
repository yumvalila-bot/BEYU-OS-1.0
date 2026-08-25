import { describe, expect, it } from "vitest";
import {
  createDefaultNoeliaToolRegistry,
  noeliaToolOutputSchema,
} from "../../src/lib/noelia/default-tools";
import { ENGINE_TOOLS } from "../../src/lib/noelia/runtime";

/**
 * Tool Registry full-contract regression (mandate: stableId, name, version,
 * owner, domain, permission, classification, risk, approver-role, Zod IO,
 * side-effects, idempotency, timeout, retry, jurisdiction, entity, audit;
 * unknown tools always DENY).
 *
 * Every registered capability must declare the complete governed contract so
 * the registry can enforce it mechanically. This test fails the moment any
 * capability is registered without a mandated contract field.
 */
describe("Noelia tool registry full contract", () => {
  it("every registered capability declares the complete governed contract", async () => {
    const registry = createDefaultNoeliaToolRegistry();
    const tools = registry.list().filter((tool) => tool.registered);
    expect(tools.length).toBeGreaterThanOrEqual(30);

    for (const tool of tools) {
      const ctx = `tool ${tool.name}`;
      // RBAC / ABAC surface
      expect(tool.permission, ctx).toBeTruthy();
      expect(["LOW", "HIGH"].includes(tool.risk), ctx).toBe(true);
      expect(tool.classification, `${ctx} classification`).toBeTruthy();
      // structural metadata
      expect(tool.metadata.stableId, ctx).toMatch(/^cap-/);
      expect(tool.metadata.version, ctx).toMatch(/^\d+\.\d+\.\d+$/);
      expect(tool.metadata.ownerRole, ctx).toBeTruthy();
      expect(tool.metadata.domain, ctx).toBeTruthy();
      expect(["NONE", "AUDIT_ONLY", "DOMAIN_WRITE"].includes(tool.metadata.sideEffects), ctx).toBe(true);
      expect(typeof tool.metadata.idempotent, ctx).toBe("boolean");
      expect(tool.metadata.timeoutMs, ctx).toBeGreaterThan(0);
      expect(tool.metadata.entityRestrictions, ctx).toBeTruthy();
      expect(tool.metadata.auditRequirements?.event, ctx).toBeTruthy();
      expect(tool.metadata.auditRequirements?.objectType, ctx).toBeTruthy();
      // declared-but-possibly-null contract fields must be present
      expect("approvalRequirements" in tool.metadata, `${ctx} approvalRequirements`).toBe(true);
      expect("retryPolicy" in tool.metadata, `${ctx} retryPolicy`).toBe(true);
      expect("jurisdictionRestrictions" in tool.metadata, `${ctx} jurisdictionRestrictions`).toBe(true);
      // Zod IO contracts: handler input validated before, output validated after
      expect(tool.metadata.inputSchema, `${ctx} inputSchema`).toBeDefined();
      expect(tool.metadata.outputSchema, `${ctx} outputSchema`).toBeDefined();
      expect(tool.metadata.outputSchema, `${ctx} outputSchema shared`).toBe(noeliaToolOutputSchema);
    }
  });

  it("every engine-declared capability is registered (no dead ends)", async () => {
    const registry = createDefaultNoeliaToolRegistry();
    const names = new Set(
      registry.list().filter((tool) => tool.registered).map((tool) => tool.name),
    );
    const declared = [...new Set(Object.values(ENGINE_TOOLS).flat())];
    expect(declared.length).toBeGreaterThan(0);
    for (const toolName of declared) {
      expect(names.has(toolName), `engine tool ${toolName}`).toBe(true);
    }
  });

  it("the shared output contract accepts conforming output and fails closed on corruption", () => {
    const valid = noeliaToolOutputSchema.safeParse({
      headline: "Test headline",
      confidence: 0.9,
      humanReviewRequired: false,
      findings: [
        {
          label: "L", value: "V", kind: "FACT", status: "OBSERVED",
          metricCode: "M", horizon: "HORIZON_2_NEAR_TERM", confidence: 0.9, provenance: "X:1",
        },
        { label: "L2", value: "V2", kind: "RECOMMENDATION", status: "DERIVED" },
      ],
      sources: [{ kind: "RISK", ref: "R1", label: "Risk register", authority: "Risk OS" }],
      metrics: [{
        code: "LIQ", label: "Liquidity", value: "1.8", status: "OBSERVED",
        confidence: 0.9, source: "TREASURY", period: "2026-08", trend: "UP",
      }],
      recommendations: [{ id: "REC-1", title: "T" }],
      alternatives: ["A"],
      metadata: { key: "value" },
    });
    expect(valid.success).toBe(true);

    const corrupted = noeliaToolOutputSchema.safeParse({ headline: 42, findings: "not-an-array" });
    expect(corrupted.success).toBe(false);

    const wrongKind = noeliaToolOutputSchema.safeParse({
      findings: [{ label: "L", value: "V", kind: "FABRICATED" }],
    });
    expect(wrongKind.success).toBe(false);
  });
});
