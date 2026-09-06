import { describe, expect, it } from "vitest";
import type { ToolInvocationContext } from "@/lib/noelia/types";
import { BeyuDeterministicAnalystProvider, OpenAICompatibleAdapter } from "@/lib/noelia/model-provider";
import { verifyArtifactDigest } from "@/lib/noelia/model-lifecycle";
import { principal } from "./fixtures";

function context(): ToolInvocationContext {
  return {
    principal: principal(),
    traceId: "TRACE_PROVIDER_CONTRACT",
    target: { tenantId: "TEN_BEYU_TZ", legalEntityId: null, countryCode: null },
    scope: {
      tenantIds: ["TEN_BEYU_TZ"],
      legalEntityIds: [],
      countryCodes: [],
      entities: [],
      tenantCountries: [],
      enterprise: false,
    },
    approval: null,
  };
}

describe("Phase 3 normalized provider contract", () => {
  it("deterministic analyst reports DETERMINISTIC mode and no generative capability", async () => {
    const provider = new BeyuDeterministicAnalystProvider();
    expect(provider.mode).toBe("DETERMINISTIC");
    const caps = await provider.capabilities(context());
    expect(caps.supportsStreaming).toBe(false);
    expect(caps.supportsEmbeddings).toBe(false);
    const meta = await provider.normalizedMetadata(context());
    expect(meta.kind).toBe("DETERMINISTIC_ANALYST");
    expect(meta.generativeInference).toBe(false);
    expect(meta.dataResidency).toBe("BEYU_CONTROLLED");
  });

  it("deterministic analyst run() is honest BLOCKED and never claims generative inference", async () => {
    const provider = new BeyuDeterministicAnalystProvider();
    const response = await provider.run({
      requestId: "REQ_CONTRACT",
      routingId: "ART_CONTRACT",
      tenantId: "TEN_BEYU_TZ",
      legalEntityId: null,
      countryCode: null,
      osId: null,
      task: "contract",
      capability: "governed-analysis",
      classification: "RESTRICTED",
      riskLevel: "LOW",
      selectedModelId: "MOD_NOELIA_DET",
      selectedProviderId: "PROV_NOELIA_DET",
      traceId: "TRACE_CONTRACT",
      prompt: "test prompt",
    });
    expect(response.status).toBe("NOT_SUPPORTED");
    expect(response.error).toMatch(/GENERATIVE_INFERENCE_BLOCKED/i);
    expect(response.safety.blocked).toBe(true);
    expect(response.usage).toBeNull();
  });

  it("unconfigured generative adapter fails closed and never emits a credential value", async () => {
    const adapter = new OpenAICompatibleAdapter({
      id: "PROV_GEN_TEST",
      providerName: "openai-compatible-test",
      modelId: "MOD_GEN_TEST",
      modelVersion: "1.0.0",
    });
    expect(adapter.mode).toBe("NOT_CONFIGURED");
    const health = await adapter.health(context());
    expect(health.configured).toBe(false);
    expect(health.reachable).toBeNull();
    const result = await adapter.run({
      requestId: "REQ_GEN_TEST",
      routingId: "ART_GEN_TEST",
      tenantId: "TEN_BEYU_TZ",
      legalEntityId: null,
      countryCode: null,
      osId: null,
      task: "test",
      capability: "governed-analysis",
      classification: "RESTRICTED",
      riskLevel: "LOW",
      selectedModelId: "MOD_GEN_TEST",
      selectedProviderId: "PROV_GEN_TEST",
      traceId: "TRACE_GEN_TEST",
      prompt: "non-sensitive probe",
    });
    expect(result.status).toBe("NOT_SUPPORTED");
    expect(result.safety.blocked).toBe(true);
    const metadata = await adapter.getMetadata(context());
    const credentialSource = String(metadata.credentialSource);
    expect(credentialSource).toMatch(/^env:/);
    // The adapter must only expose the environment variable NAME (the suffix
    // _REF), never a secret value.
    expect(credentialSource.endsWith("_REF")).toBe(true);
    expect(credentialSource).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
    expect(credentialSource).not.toContain("=");
  });

  it("verifies artifact digests and does not silently accept a mismatch", () => {
    const checksum = "deadbeef".padEnd(64, "0");
    expect(verifyArtifactDigest(checksum, "deadbeef".padEnd(64, "0")).ok).toBe(true);
    expect(verifyArtifactDigest(checksum, "0000000000000000000000000000000000000000000000000000000000000000").ok).toBe(false);
    expect(verifyArtifactDigest("", "anything").ok).toBe(false);
  });
});
