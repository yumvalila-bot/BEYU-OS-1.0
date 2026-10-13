import { describe, expect, it, vi } from "vitest";

// Trusted-system fixtures, exactly as the other noelia runtime suites do.
vi.mock("@/lib/noelia/execution-control", () => ({
  assertNoeliaExecutionAllowed: vi.fn(async () => undefined),
  ExecutionStoppedError: class ExecutionStoppedError extends Error {},
}));

import { eq } from "drizzle-orm";
import { db, withDatabaseTransactionContext } from "@/db";
import { modelRegistry, noeliaProviders } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { BeyuNoeliaAiPlatformService } from "@/lib/noelia/ai-platform";
import { BeyuNoeliaModelGateway } from "@/lib/noelia/model-gateway";
import { BeyuOllamaProvider } from "@/lib/noelia/ollama-provider";
import { resolveOllamaRuntimeConfig } from "@/lib/noelia/ollama-config";
import { NoeliaRuntime } from "@/lib/noelia/runtime";
import { NoeliaToolRegistry } from "@/lib/noelia/tool-registry";
import type { NoeliaEvidencePort, NoeliaPolicyPort, ToolInvocationContext } from "@/lib/noelia/types";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { principal } from "./fixtures";
import { RecordingHttpClient, chatPayload, jsonResponse, tagsPayload, testConfig } from "./ollama-fixtures";

/**
 * DISCLOSURE GUARD: an adapter must not be able to reflect arbitrary text into a
 * governed answer.
 *
 * Provenance labels on `NoeliaAnswer.modelOutput` reach a human. Before this
 * guard, whatever string an adapter put in `metadata.runtime` /
 * `metadata.endpointScope` was copied verbatim, so a buggy or compromised
 * adapter could echo a prompt, a credential fragment or a filesystem path into
 * the answer. Provenance is now clamped to a closed vocabulary in runtime.ts.
 */

const ROLLBACK = "__ROLLBACK__";
const OLLAMA_PROVIDER_ID = "PROV_OLLAMA_LOCAL";
const OLLAMA_MODEL_ID = "MOD_OLLAMA_QWEN_TEST";
const LEAK_MARKER = "SENSITIVE_PROMPT_MARKER_9F3";
const PATH_MARKER = "/srv/beyu/internal/config/keys.txt";

function adminPrincipal(): Principal {
  const permissions = [
    "ai:noelia.query",
    "ai:executive.read",
    "ai:analytics.read",
    "ai:model.registry.read",
    "risk:register.read",
  ] as const;
  return principal({
    userId: "USR_PROVENANCE_TEST",
    partyId: "PTY_PROVENANCE_TEST",
    tenantId: "TEN_BEYU",
    tenantCode: "BEYU",
    tenantType: "ENTERPRISE",
    roles: ["PLATFORM_ADMIN"],
    permissions: new Set(permissions),
    // Mirrors the governed-gateway fixture: a single active ENTERPRISE grant per
    // permission (an unscoped grant is the only shape `can()` accepts across the
    // TEN_BEYU_TZ request target).
    authorityGrants: permissions.map((permission) => ({
      sourceId: "RAS_TEST_PROVENANCE_PLATFORM_ADMIN",
      source: "ROLE_ASSIGNMENT" as const,
      role: "PLATFORM_ADMIN",
      permission,
      tenantId: null,
      legalEntityId: null,
      countryCode: null,
      validFrom: null,
      validTo: null,
    })),
    clearance: "RESTRICTED",
  });
}

function contextFor(p: Principal): ToolInvocationContext {
  return {
    principal: p,
    traceId: "TRACE_PROVENANCE",
    target: { tenantId: "TEN_BEYU_TZ", legalEntityId: null, countryCode: null },
    scope: {
      tenantIds: ["TEN_BEYU_TZ"],
      legalEntityIds: [],
      countryCodes: [],
      entities: [],
      tenantCountries: [],
      enterprise: true,
    },
    approval: null,
  };
}

async function inRollbackedScope<T>(p: Principal, fn: () => Promise<T>): Promise<void> {
  try {
    await withDatabaseTransactionContext(async () => {
      await withTenantDatabaseContext(p, async () => {
        await fn();
        throw new Error(ROLLBACK);
      });
    });
  } catch (err) {
    if (String((err as Error).message) !== ROLLBACK) throw err;
  }
}

async function registerOllamaGovernedModel(): Promise<void> {
  await db
    .insert(noeliaProviders)
    .values({
      id: OLLAMA_PROVIDER_ID,
      providerName: "ollama-self-hosted-runtime",
      providerType: "SELF_HOSTED",
      ownership: "BEYU",
      endpoint: null,
      region: null,
      dataResidency: "BEYU_CONTROLLED",
      authenticationMethod: "NONE",
      securityStatus: "ASSESSED",
      complianceStatus: "ASSESSED",
      lifecycleStatus: "ACTIVATED",
      active: true,
      assessment: {},
      createdBy: "USR_PROVENANCE_TEST",
    })
    .onConflictDoNothing({ target: noeliaProviders.id });

  await db
    .insert(modelRegistry)
    .values({
      id: OLLAMA_MODEL_ID,
      provider: "ollama-self-hosted-runtime",
      model: "qwen2.5:0.5b",
      version: "0.5b",
      status: "ACTIVE",
      maxClassification: "RESTRICTED",
      jurisdictionRestrictions: [],
      capabilityMetadata: {},
      timeoutMs: 30_000,
      approvedBy: "USR_PROVENANCE_TEST",
      providerId: OLLAMA_PROVIDER_ID,
      modelFamily: "QWEN",
      modelType: "SELF_HOSTED",
      deploymentType: "SELF_HOSTED",
      dataResidency: "BEYU_CONTROLLED",
      riskLevel: "LOW",
      approvalStatus: "APPROVED",
      evaluationStatus: "APPROVED",
      lifecycleStatus: "ACTIVE",
      securityStatus: "ASSESSED",
      createdBy: "USR_PROVENANCE_TEST",
    })
    .onConflictDoNothing({ target: modelRegistry.id });
}

/**
 * The real adapter with ONE behaviour replaced: it reports hostile provenance
 * labels. Subclassing the production class (instead of hand-writing a double)
 * keeps every other contract obligation exactly as production defines it, so the
 * only thing under test is whether that metadata can reach a governed answer.
 */
class HostileProvenanceProvider extends BeyuOllamaProvider {
  constructor() {
    super(testConfig({ NOELIA_OLLAMA_MAX_CLASSIFICATION: "RESTRICTED" }), {
      httpClient: async (request) =>
        request.url.endsWith("/api/tags")
          ? jsonResponse(tagsPayload(["qwen2.5:0.5b"]))
          : jsonResponse(chatPayload({ content: "HOSTILE OUTPUT" })),
      env: { NOELIA_MODEL_PROVIDER: "OLLAMA", NOELIA_OLLAMA_MODEL: "qwen2.5:0.5b" } as unknown as NodeJS.ProcessEnv,
    });
  }

  override async run(request: Parameters<BeyuOllamaProvider["run"]>[0]): Promise<Awaited<ReturnType<BeyuOllamaProvider["run"]>>> {
    const response = await super.run(request);
    return {
      ...response,
      output: { text: "HOSTILE OUTPUT", content: "HOSTILE OUTPUT", generativeInference: true, runtime: "OLLAMA" },
      metadata: {
        ...response.metadata,
        // The hostile part: labels that would leak a prompt marker, a path and a
        // credential-shaped token if provenance were trusted verbatim.
        runtime: `${LEAK_MARKER} ${PATH_MARKER} bearer-abcdef0123456789`,
        endpointScope: PATH_MARKER,
        runtimeKind: "definitely-not-a-kind",
      },
    };
  }
}

function registry(): NoeliaToolRegistry {
  const value = new NoeliaToolRegistry();
  value.register({
    name: "risk.register.query",
    permission: "risk:register.read",
    risk: "LOW",
    description: "risk register fixture",
    metadata: {
      stableId: "cap-risk-register-query",
      version: "1.0.0",
      ownerRole: "CHIEF_RISK_COMPLIANCE",
      domain: "RISK",
      sideEffects: "NONE" as const,
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED" as const,
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
    },
    execute: async () => ({
      headline: "Authoritative risk evidence assembled.",
      findings: [{ label: "RISK-1", value: "16", kind: "FACT" as const }],
      sources: [{ kind: "RISK", ref: "RISK-1", label: "Risk one", authority: "RISK_ENGINE" }],
      confidence: 0.9,
    }),
  });
  return value;
}

describe("Provenance labels are clamped to a closed vocabulary", () => {
  const allowPolicy: NoeliaPolicyPort = { evaluate: vi.fn(async () => ({ effect: "ALLOW" as const, obligations: [], denials: [], appliedPolicies: [] })) };
  const evidence = (): NoeliaEvidencePort => ({ recordDecision: vi.fn(async () => "AID_PROVENANCE_TEST") });

  it("never lets a hostile adapter reflect a prompt, a path or a token into an answer", async () => {
    const p = adminPrincipal();
    await inRollbackedScope(p, async () => {
      await registerOllamaGovernedModel();
      await db.update(modelRegistry).set({ status: "SUSPENDED" }).where(eq(modelRegistry.id, "MOD_NOELIA_DET"));

      const config = testConfig({ NOELIA_OLLAMA_MAX_CLASSIFICATION: "RESTRICTED" });
      const gateway = new BeyuNoeliaModelGateway({ providers: [new HostileProvenanceProvider()], ollamaConfig: config });
      const runtime = new NoeliaRuntime(registry(), allowPolicy, evidence(), {
        router: new BeyuNoeliaAiPlatformService(),
        gateway,
      });

      const answer = await runtime.ask({
        principal: p,
        question: "Which risks currently exceed appetite?",
        traceId: "TRACE_PROVENANCE_HOSTILE",
        target: { tenantId: "TEN_BEYU_TZ", legalEntityId: null, countryCode: null },
        scope: {
          tenantIds: ["TEN_BEYU_TZ"],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: true,
        },
      });

      expect(answer.modelExecutionStatus).toBe("COMPLETED");
      expect(answer.modelOutput?.text).toBe("HOSTILE OUTPUT");

      const provenance = answer.modelOutput!.provenance;
      // Every hostile label collapsed to its neutral placeholder.
      expect(provenance.runtime).toBe("GENERATIVE_RUNTIME");
      expect(provenance.endpointScope).toBe("UNKNOWN");
      expect(provenance.runtimeKind).toBe("UNKNOWN_RUNTIME_KIND");

      const serialized = JSON.stringify(answer);
      expect(serialized).not.toContain(LEAK_MARKER);
      expect(serialized).not.toContain(PATH_MARKER);
      expect(serialized).not.toContain("bearer-abcdef0123456789");
      // The governed narrative and evidence remain tool-derived, not model text.
      expect(answer.narrative).not.toContain("HOSTILE OUTPUT");
      expect(answer.headline).not.toContain("HOSTILE OUTPUT");
    });
  });

  it("keeps the real adapter's honest labels intact", async () => {
    const p = adminPrincipal();
    await inRollbackedScope(p, async () => {
      await registerOllamaGovernedModel();
      await db.update(modelRegistry).set({ status: "SUSPENDED" }).where(eq(modelRegistry.id, "MOD_NOELIA_DET"));

      const client = new RecordingHttpClient(async (request) =>
        request.url.endsWith("/api/tags") ? jsonResponse(tagsPayload(["qwen2.5:0.5b"])) : jsonResponse(chatPayload({ content: "REAL ADAPTER OUTPUT" })),
      );
      const config = testConfig({ NOELIA_OLLAMA_MAX_CLASSIFICATION: "RESTRICTED" });
      const gateway = new BeyuNoeliaModelGateway({
        providers: [new BeyuOllamaProvider(config, { httpClient: client.client })],
        ollamaConfig: config,
      });
      const runtime = new NoeliaRuntime(registry(), allowPolicy, evidence(), {
        router: new BeyuNoeliaAiPlatformService(),
        gateway,
      });

      const answer = await runtime.ask({
        principal: p,
        question: "Which risks currently exceed appetite?",
        traceId: "TRACE_PROVENANCE_HONEST",
        target: { tenantId: "TEN_BEYU_TZ", legalEntityId: null, countryCode: null },
        scope: {
          tenantIds: ["TEN_BEYU_TZ"],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: true,
        },
      });

      expect(answer.modelOutput?.provenance.runtime).toBe("OLLAMA");
      expect(answer.modelOutput?.provenance.endpointScope).toBe("LOCAL_PROCESS");
      expect(answer.modelOutput?.provenance.runtimeKind).toBe("LOCAL_LOOPBACK");
      expect(answer.modelOutput?.untrusted).toBe(true);
      expect(client.callCount).toBeGreaterThan(0);
    });
  });
});
