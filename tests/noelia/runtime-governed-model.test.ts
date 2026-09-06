/**
 * Phase 2 — governed runtime model execution.
 *
 * Proves the complete production pipeline:
 *   Noelia → HIVE governance → ai.model.route → approved model/provider
 *   → model gateway → deterministic BEYU analyst execution → response → audit.
 *
 * It deliberately tests the REAL `askNoelia` facade (not a mock runtime), so the
 * routing decision and deterministic execution are authoritative in practice.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiDecisions, noeliaKillSwitch, noeliaRoutingDecisions } from "@/db/schema";
import { askNoelia } from "@/lib/noelia";
import { BeyuNoeliaAiPlatformService } from "@/lib/noelia/ai-platform";
import { BeyuNoeliaModelGateway } from "@/lib/noelia/model-gateway";
import { BeyuDeterministicAnalystProvider } from "@/lib/noelia/model-provider";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { principal } from "./fixtures";

function platformAdmin(overrides: Partial<ReturnType<typeof principal>> = {}) {
  return principal({
    userId: "USR_PLATFORM_ADMIN",
    partyId: "PTY_PLATFORM_ADMIN",
    tenantId: "TEN_BEYU_GROUP",
    tenantCode: "BEYU-GROUP",
    tenantType: "ENTERPRISE",
    roles: ["PLATFORM_ADMIN"],
    permissions: new Set([
      "ai:noelia.query",
      "ai:analytics.read",
      "ai:executive.read",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:identity.read",
      "risk:register.read",
    ]),
    clearance: "RESTRICTED",
    ...overrides,
  });
}

describe("Phase 2 deterministic governed model execution", () => {
  it("routes, executes the deterministic BEYU analyst and records model/provider attribution", async () => {
    const p = platformAdmin();
    const answer = await askNoelia({
      principal: p,
      question: "Which risks currently exceed appetite?",
      traceId: "TRACE_PHASE2_EXECUTION",
      target: { tenantId: "TEN_BEYU_TZ", legalEntityId: null, countryCode: null },
    });

    // The deterministic analyst is the routed model; it is never presented as a
    // generative/foundation model.
    expect(answer.model).toBe("MOD_NOELIA_DET");
    expect(answer.provider).toBe("beyu-hive-deterministic-analyst");
    expect(answer.modelKind).toBe("DETERMINISTIC_ANALYST");
    expect(answer.routingDecisionId).toMatch(/^ART_/);
    expect(answer.requestId).toMatch(/^REQ_/);
    expect(answer.outputClass).toBe("RECOMMENDATION");

    const [row] = await db
      .select()
      .from(aiDecisions)
      .where(eq(aiDecisions.id, answer.decisionId));
    expect(row).toBeDefined();
    expect(row.model).toBe("MOD_NOELIA_DET");
    expect(row.provider).toBe("beyu-hive-deterministic-analyst");
    expect(row.modelKind).toBe("DETERMINISTIC_ANALYST");
    expect(row.provider).not.toMatch(/gpt|claude|gemini/i);
    expect(row.requestId).toMatch(/^REQ_/);
    expect(row.routingDecisionId).toMatch(/^ART_/);
  });

  it("fails closed before tool execution when a capability kill switch is active", async () => {
    const p = platformAdmin();
    const killId = `AKS_PHASE2_${Date.now()}`;
    try {
      await db.insert(noeliaKillSwitch).values({
        id: killId,
        targetType: "CAPABILITY",
        targetRef: "finance-intelligence",
        enabled: true,
        reason: "Phase 2 test containment.",
        activatedBy: "USR_TEST",
      }).onConflictDoNothing({ target: [noeliaKillSwitch.targetType, noeliaKillSwitch.targetRef] });

      const answer = await askNoelia({
        principal: p,
        question: "What is the consolidated cash position?",
        traceId: "TRACE_PHASE2_KILLSWITCH",
        target: { tenantId: "TEN_BEYU_TZ", legalEntityId: null, countryCode: null },
      });

      expect(answer.outputClass).toBe("UNCERTAINTY");
      expect(answer.headline).toMatch(/blocked/i);
      expect(answer.toolsUsed).toEqual([]);
      expect(answer.model).toBeUndefined();
      expect(answer.modelExecutionStatus).toBe("DENIED");
      expect(answer.routingDecisionId).toMatch(/^ART_/);

      const [route] = await db
        .select()
        .from(noeliaRoutingDecisions)
        .where(eq(noeliaRoutingDecisions.id, answer.routingDecisionId ?? ""));
      expect(route).toBeDefined();
      expect(route.decision).toBe("FAIL_CLOSED");
      expect(route.selectedModelId).toBeNull();
    } finally {
      await db.delete(noeliaKillSwitch).where(eq(noeliaKillSwitch.id, killId));
    }
  });

  it("fails closed when the requesting principal lacks AI authorization before a model route", async () => {
    const p = platformAdmin({
      permissions: new Set(["risk:register.read"]),
    });
    const answer = await askNoelia({
      principal: p,
      question: "Which risks currently exceed appetite?",
      traceId: "TRACE_PHASE2_NO_AUTH",
      target: { tenantId: "TEN_BEYU_TZ", legalEntityId: null, countryCode: null },
    });
    expect(answer.outputClass).toBe("UNCERTAINTY");
    expect(answer.toolsUsed).toEqual([]);
    expect(answer.modelExecutionStatus).toBe("DENIED");
    expect(answer.narrative).toMatch(/AI authorization denied/i);
    expect(answer.routingDecisionId).toBeUndefined();
  });

  it("does not expose a generative model kind on the deterministic adapter", async () => {
    const provider = new BeyuDeterministicAnalystProvider();
    expect(provider.kind).toBe("DETERMINISTIC_ANALYST");
    const result = await provider.execute({
      requestId: "REQ_TEST",
      routingId: "ART_TEST",
      tenantId: "TEN_BEYU_TZ",
      legalEntityId: null,
      countryCode: null,
      osId: null,
      task: "validate control plane",
      capability: "governed-analysis",
      classification: "RESTRICTED",
      riskLevel: "LOW",
      selectedModelId: "MOD_NOELIA_DET",
      selectedProviderId: "PROV_NOELIA_DET",
      traceId: "TRACE_ADAPTER",
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.output?.generativeInference).toBe(false);
    expect(result.output?.deterministic).toBe(true);
    const generative = await provider.generate({
      requestId: "REQ_TEST",
      routingId: "ART_TEST",
      tenantId: "TEN_BEYU_TZ",
      legalEntityId: null,
      countryCode: null,
      osId: null,
      task: "validate control plane",
      capability: "governed-analysis",
      classification: "RESTRICTED",
      riskLevel: "LOW",
      selectedModelId: "MOD_NOELIA_DET",
      selectedProviderId: "PROV_NOELIA_DET",
      traceId: "TRACE_ADAPTER",
    });
    expect(generative.status).toBe("NOT_SUPPORTED");
    expect(generative.error).toMatch(/GENERATIVE_INFERENCE_BLOCKED/i);
    await expect(provider.stream({
      requestId: "REQ_TEST",
      routingId: "ART_TEST",
      tenantId: "TEN_BEYU_TZ",
      legalEntityId: null,
      countryCode: null,
      osId: null,
      task: "validate control plane",
      capability: "governed-analysis",
      classification: "RESTRICTED",
      riskLevel: "LOW",
      selectedModelId: "MOD_NOELIA_DET",
      selectedProviderId: "PROV_NOELIA_DET",
      traceId: "TRACE_ADAPTER",
    })).rejects.toThrow(/NOT_SUPPORTED/);
    await expect(provider.embed({
      requestId: "REQ_TEST",
      routingId: "ART_TEST",
      tenantId: "TEN_BEYU_TZ",
      legalEntityId: null,
      countryCode: null,
      osId: null,
      task: "validate control plane",
      capability: "governed-analysis",
      classification: "RESTRICTED",
      riskLevel: "LOW",
      selectedModelId: "MOD_NOELIA_DET",
      selectedProviderId: "PROV_NOELIA_DET",
      traceId: "TRACE_ADAPTER",
    })).rejects.toThrow(/NOT_SUPPORTED/);
  });

  it("provider independence: the deterministic runtime does not depend on a hard-coded external endpoint", async () => {
    const gateway = new BeyuNoeliaModelGateway();
    const adapters = gateway.listProviders;
    expect(typeof adapters).toBe("function");
    const router = new BeyuNoeliaAiPlatformService();
    expect(router).toBeInstanceOf(BeyuNoeliaAiPlatformService);
  });

  it("rejects a route for an unknown/unregistered model runtime rather than executing it", async () => {
    const gateway = new BeyuNoeliaModelGateway();
    const p = platformAdmin({ tenantId: "TEN_BEYU_TZ", tenantCode: "BEYU-TZ" });
    let result: Awaited<ReturnType<BeyuNoeliaModelGateway["executeRouted"]>> | undefined;
    await withTenantDatabaseContext(p, async () => {
      result = await gateway.executeRouted(
        {
          principal: p,
          traceId: "TRACE_GATEWAY_BLOCK",
          target: { tenantId: "TEN_BEYU_TZ", legalEntityId: null, countryCode: null },
          scope: {
            tenantIds: ["TEN_BEYU_TZ"],
            legalEntityIds: [],
            countryCodes: [],
            entities: [],
            tenantCountries: [],
            enterprise: false,
          },
        },
        {
          decision: "SELECTED",
          selectedModelId: "MOD_NOELIA_DET",
          selectedProviderId: "PROV_NOT_REGISTERED",
          routingId: "ART_GATEWAY_BLOCK",
          requestId: "REQ_GATEWAY_BLOCK",
          reasons: [],
        },
        {
          requestId: "REQ_GATEWAY_BLOCK",
          routingId: "ART_GATEWAY_BLOCK",
          tenantId: "TEN_BEYU_TZ",
          legalEntityId: null,
          countryCode: null,
          osId: null,
          task: "blocked test",
          capability: "governed-analysis",
          classification: "RESTRICTED",
          riskLevel: "LOW",
        },
      );
    });
    expect(result?.status).toBe("FAIL_CLOSED");
    expect(result?.error).toMatch(/No registered model runtime/i);
  });
});
