import { describe, expect, it } from "vitest";
import { BeyuOllamaProvider } from "@/lib/noelia/ollama-provider";
import { describeOllamaRuntimeConfig, resolveOllamaRuntimeConfig } from "@/lib/noelia/ollama-config";
import { AI_PROVIDER_STATUSES } from "@/lib/noelia/model-provider";

/**
 * OPT-IN live smoke test against a REAL Ollama runtime.
 *
 * Normal CI never runs this: it is skipped unless the operator explicitly sets
 *
 *   NOELIA_OLLAMA_LIVE_TEST=1
 *   NOELIA_MODEL_PROVIDER=OLLAMA
 *   NOELIA_OLLAMA_BASE_URL=http://localhost:11434   (default when unset)
 *   NOELIA_OLLAMA_MODEL=qwen2.5:0.5b                (default when unset)
 *
 * Run it from Windows PowerShell with:
 *   .\scripts\noelia\ollama-smoke.ps1
 *
 * It performs REAL inference, so the reported status is evidence, not a claim:
 * VERIFIED is only reachable when a real round-trip to the configured model
 * completed. Nothing here prints a prompt, a response body or a credential.
 */
const LIVE = process.env.NOELIA_OLLAMA_LIVE_TEST === "1";

describe.skipIf(!LIVE)("Ollama live smoke test (opt-in: NOELIA_OLLAMA_LIVE_TEST=1)", () => {
  const config = resolveOllamaRuntimeConfig();

  it("has a valid local-development configuration", () => {
    // Safe to print: no secret is ever part of this configuration.
    console.info("[ollama-smoke] configuration", describeOllamaRuntimeConfig(config));
    expect(config.enabled).toBe(true);
    expect(config.valid).toBe(true);
    expect(config.endpointScope).toBe("LOCAL_PROCESS");
  });

  it("proves connectivity and then inference against the configured model", async () => {
    const provider = new BeyuOllamaProvider(config);
    const health = await provider.health({} as never);
    console.info(`[ollama-smoke] connectivity status: ${health.status}`);
    expect(AI_PROVIDER_STATUSES).toContain(health.status);
    expect(health.status).toBe("CONNECTED");

    const verification = await provider.verifyInference();
    console.info(`[ollama-smoke] verification status: ${verification.status}`);
    expect(verification.status).toBe("VERIFIED");
    expect(verification.ok).toBe(true);
  });

  it("completes one governed generation through the adapter", async () => {
    const provider = new BeyuOllamaProvider(config);
    const response = await provider.run({
      requestId: "REQ_OLLAMA_SMOKE",
      routingId: "ART_OLLAMA_SMOKE",
      tenantId: "TEN_LOCAL_SMOKE",
      legalEntityId: null,
      countryCode: null,
      osId: null,
      task: "local-smoke",
      capability: "governed-analysis",
      classification: "INTERNAL",
      riskLevel: "LOW",
      selectedModelId: config.model,
      selectedProviderId: config.providerId,
      traceId: "TRACE_OLLAMA_SMOKE",
      prompt: "Reply with exactly: NOELIA LOCAL API TEST PASSED",
      systemPolicy: "Answer with the requested literal text only.",
      temperature: 0,
      maxTokens: 32,
    });

    console.info(`[ollama-smoke] governed generation status: ${response.status}`);
    expect(response.status).toBe("COMPLETED");
    expect(response.output?.generativeInference).toBe(true);
    expect(typeof response.output?.content).toBe("string");
    expect(response.usage?.inferenceCount).toBe(1);
    // Provider identity is preserved; the text itself is not asserted, because a
    // 0.5B local model is a development runtime, not a production-quality one.
    expect(response.providerId).toBe(config.providerId);
  });

  it("reports FAILED (never CONNECTED) for an endpoint that is not serving Ollama", async () => {
    const unreachable = new BeyuOllamaProvider(
      resolveOllamaRuntimeConfig({
        NOELIA_MODEL_PROVIDER: "OLLAMA",
        NOELIA_OLLAMA_BASE_URL: "http://127.0.0.1:1",
        NOELIA_OLLAMA_MODEL: config.model,
        NOELIA_OLLAMA_TIMEOUT_MS: "2000",
      } as unknown as NodeJS.ProcessEnv),
    );
    const health = await unreachable.health({} as never);
    console.info(`[ollama-smoke] unavailable-endpoint status: ${health.status}`);
    expect(health.status).toBe("FAILED");
    expect(health.reachable).toBe(false);
  });
});
