import { describe, expect, it } from "vitest";
import type { AIModelRequest, AIModelResponse } from "@/lib/noelia/model-provider";
import { AI_PROVIDER_STATUSES } from "@/lib/noelia/model-provider";
import { BeyuOllamaProvider } from "@/lib/noelia/ollama-provider";
import {
  ENV_MODEL_PROVIDER,
  ENV_OLLAMA_ALLOWED_HOSTS,
  ENV_OLLAMA_BASE_URL,
  ENV_OLLAMA_MAX_ATTEMPTS,
  ENV_OLLAMA_MAX_CLASSIFICATION,
  ENV_OLLAMA_MODEL,
  ENV_OLLAMA_TIMEOUT_MS,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_MODEL,
  resolveOllamaRuntimeConfig,
} from "@/lib/noelia/ollama-config";
import type { ToolInvocationContext } from "@/lib/noelia/types";
import { principal } from "./fixtures";
import {
  RecordingHttpClient,
  chatPayload,
  jsonResponse,
  refusingClient,
  streamingResponse,
  tagsPayload,
  testConfig,
  testEnv,
  textResponse,
} from "./ollama-fixtures";

/**
 * Hermetic unit tests for the governed Ollama adapter.
 *
 * These run with no Ollama runtime, no network access and no database. Real
 * connectivity is proven only by the opt-in live smoke test.
 */

function context(): ToolInvocationContext {
  return {
    principal: principal(),
    traceId: "TRACE_OLLAMA_UNIT",
    target: { tenantId: "TEN_A", legalEntityId: null, countryCode: null },
    scope: {
      tenantIds: ["TEN_A"],
      legalEntityIds: [],
      countryCodes: [],
      entities: [],
      tenantCountries: [],
      enterprise: false,
    },
    approval: null,
  };
}

function request(overrides: Partial<AIModelRequest> = {}): AIModelRequest {
  return {
    requestId: "REQ_OLLAMA_UNIT",
    routingId: "ART_OLLAMA_UNIT",
    tenantId: "TEN_A",
    legalEntityId: null,
    countryCode: null,
    osId: null,
    task: "governed-unit-test",
    capability: "governed-analysis",
    classification: "INTERNAL",
    riskLevel: "LOW",
    selectedModelId: "MOD_OLLAMA_QWEN",
    selectedProviderId: "PROV_OLLAMA_LOCAL",
    traceId: "TRACE_OLLAMA_UNIT",
    prompt: "Summarise the governance posture.",
    ...overrides,
  };
}

function providerWith(client: RecordingHttpClient, envOverrides: Record<string, string | undefined> = {}) {
  const config = testConfig(envOverrides);
  return { provider: new BeyuOllamaProvider(config, { httpClient: client.client }), config };
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

describe("Ollama runtime configuration", () => {
  it("is disabled unless NOELIA_MODEL_PROVIDER explicitly selects OLLAMA", () => {
    const off = resolveOllamaRuntimeConfig({} as unknown as NodeJS.ProcessEnv);
    expect(off.enabled).toBe(false);
    expect(off.valid).toBe(true);
    // The loopback default exists for local development only; it is not usable
    // until the runtime is explicitly selected.
    expect(off.baseUrl).toBe(OLLAMA_DEFAULT_BASE_URL);
    expect(off.model).toBe(OLLAMA_DEFAULT_MODEL);

    const on = resolveOllamaRuntimeConfig(testEnv());
    expect(on.enabled).toBe(true);
    expect(on.valid).toBe(true);
    expect(on.endpointScope).toBe("LOCAL_PROCESS");
    expect(on.maxClassification).toBe("INTERNAL");
    expect(on.timeoutMs).toBe(60_000);
  });

  it("accepts only http(s) endpoints and rejects embedded credentials, queries and invalid URLs", () => {
    const cases: Array<[Record<string, string | undefined>, RegExp]> = [
      [{ [ENV_OLLAMA_BASE_URL]: "ftp://localhost:11434" }, /http: or https:/],
      [{ [ENV_OLLAMA_BASE_URL]: "http://user:secret@localhost:11434" }, /credentials/],
      [{ [ENV_OLLAMA_BASE_URL]: "http://localhost:11434/api?token=abc" }, /query string or fragment/],
      [{ [ENV_OLLAMA_BASE_URL]: "localhost:11434" }, /http: or https:/],
    ];
    for (const [overrides, expected] of cases) {
      const config = resolveOllamaRuntimeConfig(testEnv(overrides));
      expect(config.valid).toBe(false);
      expect(config.invalidReasons.join(" ")).toMatch(expected);
    }
  });

  it("allows loopback hosts and only explicitly allowlisted non-loopback hosts", () => {
    for (const host of ["http://localhost:11434", "http://127.0.0.1:11434", "http://127.0.0.7:11434", "http://[::1]:11434"]) {
      const config = resolveOllamaRuntimeConfig(testEnv({ [ENV_OLLAMA_BASE_URL]: host }));
      expect(config.valid).toBe(true);
      expect(config.endpointScope).toBe("LOCAL_PROCESS");
    }

    const rejected = resolveOllamaRuntimeConfig(testEnv({ [ENV_OLLAMA_BASE_URL]: "http://10.0.0.5:11434" }));
    expect(rejected.valid).toBe(false);
    expect(rejected.invalidReasons.join(" ")).toMatch(/not allowlisted/);

    const allowlisted = resolveOllamaRuntimeConfig(
      testEnv({ [ENV_OLLAMA_BASE_URL]: "http://10.0.0.5:11434", [ENV_OLLAMA_ALLOWED_HOSTS]: "10.0.0.5" }),
    );
    expect(allowlisted.valid).toBe(true);
    expect(allowlisted.endpointScope).toBe("CONFIGURED_REMOTE_HOST");

    const wildcard = resolveOllamaRuntimeConfig(
      testEnv({ [ENV_OLLAMA_BASE_URL]: "http://10.0.0.5:11434", [ENV_OLLAMA_ALLOWED_HOSTS]: "*.example.internal" }),
    );
    expect(wildcard.valid).toBe(false);
    expect(wildcard.invalidReasons.join(" ")).toMatch(/wildcard/);
  });

  it("rejects unsafe model identifiers, timeouts, attempt counts and unknown classifications", () => {
    const badModel = resolveOllamaRuntimeConfig(testEnv({ [ENV_OLLAMA_MODEL]: "../../etc/passwd" }));
    expect(badModel.valid).toBe(false);
    expect(badModel.invalidReasons.join(" ")).toMatch(/valid Ollama model identifier/);

    const badTimeout = resolveOllamaRuntimeConfig(testEnv({ [ENV_OLLAMA_TIMEOUT_MS]: "10" }));
    expect(badTimeout.valid).toBe(false);
    expect(badTimeout.invalidReasons.join(" ")).toMatch(/TIMEOUT_MS/);

    const badAttempts = resolveOllamaRuntimeConfig(testEnv({ [ENV_OLLAMA_MAX_ATTEMPTS]: "99" }));
    expect(badAttempts.valid).toBe(false);
    expect(badAttempts.invalidReasons.join(" ")).toMatch(/MAX_ATTEMPTS/);

    const badClassification = resolveOllamaRuntimeConfig(testEnv({ [ENV_OLLAMA_MAX_CLASSIFICATION]: "TOP_SECRET" }));
    expect(badClassification.valid).toBe(false);
    expect(badClassification.invalidReasons.join(" ")).toMatch(/MAX_CLASSIFICATION/);
  });
});

/* -------------------------------------------------------------------------- */
/* Status vocabulary                                                          */
/* -------------------------------------------------------------------------- */

describe("Ollama provider status transitions", () => {
  it("uses only the repository's accepted provider statuses and never ACTIVE", () => {
    expect([...AI_PROVIDER_STATUSES]).toEqual([
      "CONFIGURED",
      "CONNECTED",
      "VERIFIED",
      "DEGRADED",
      "FAILED",
      "NOT_CONNECTED",
      "SIMULATED",
    ]);
    expect(AI_PROVIDER_STATUSES as readonly string[]).not.toContain("ACTIVE");
  });

  it("reports NOT_CONNECTED and makes NO call when the runtime is not selected", async () => {
    const client = refusingClient();
    const provider = new BeyuOllamaProvider(resolveOllamaRuntimeConfig({} as unknown as NodeJS.ProcessEnv), { httpClient: client.client });
    expect(provider.mode).toBe("NOT_CONFIGURED");
    const status = await provider.providerStatus(context());
    expect(status.status).toBe("NOT_CONNECTED");
    const health = await provider.health(context());
    expect(health.ok).toBe(false);
    expect(health.reachable).toBeNull();
    expect(client.callCount).toBe(0);
  });

  it("reports NOT_CONNECTED and makes NO call when the configuration is invalid", async () => {
    const client = refusingClient();
    const config = resolveOllamaRuntimeConfig(testEnv({ [ENV_OLLAMA_BASE_URL]: "http://10.0.0.5:11434" }));
    const provider = new BeyuOllamaProvider(config, { httpClient: client.client });
    const status = await provider.providerStatus(context());
    expect(status.status).toBe("NOT_CONNECTED");
    expect(status.evidence.join(" ")).toMatch(/not allowlisted/);
    expect(client.callCount).toBe(0);
  });

  it("starts at CONFIGURED: configuration alone never proves connectivity", async () => {
    const { provider } = providerWith(refusingClient());
    const status = await provider.providerStatus(context());
    expect(status.status).toBe("CONFIGURED");
    expect(status.checkedAt).toBeNull();
    expect(provider.getCapabilities()).not.toContain("not-configured");
  });

  it("reaches CONNECTED only after a real connectivity check finds the configured model", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(tagsPayload(["qwen2.5:0.5b"])));
    const { provider } = providerWith(client);
    const health = await provider.health(context());
    expect(health.status).toBe("CONNECTED");
    expect(health.ok).toBe(true);
    expect(health.reachable).toBe(true);
    expect(client.requests[0].url).toBe("http://localhost:11434/api/tags");
    expect(client.requests[0].method).toBe("GET");
    // Connectivity is NOT verification.
    expect((await provider.providerStatus(context())).status).toBe("CONNECTED");
  });

  it("reports DEGRADED when the runtime is reachable but the configured model is not installed", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(tagsPayload(["llama3:8b"])));
    const { provider } = providerWith(client);
    const health = await provider.health(context());
    expect(health.status).toBe("DEGRADED");
    expect(health.ok).toBe(false);
    expect(health.reachable).toBe(true);
    expect(health.detail).toMatch(/model is not installed/i);
  });

  it("reports FAILED for an unreachable runtime, a non-success status and a non-Ollama endpoint", async () => {
    const unreachable = providerWith(refusingClient()).provider;
    const refused = await unreachable.health(context());
    expect(refused.status).toBe("FAILED");
    expect(refused.reachable).toBe(false);

    const badStatus = providerWith(new RecordingHttpClient(async () => textResponse("upstream exploded", 500))).provider;
    const failed = await badStatus.health(context());
    expect(failed.status).toBe("FAILED");

    const badShape = providerWith(new RecordingHttpClient(async () => jsonResponse({ hello: "world" }))).provider;
    const malformed = await badShape.health(context());
    expect(malformed.status).toBe("FAILED");
    expect(malformed.detail).toMatch(/did not return an Ollama model list/);
  });
});

/* -------------------------------------------------------------------------- */
/* Verification (real inference round-trip)                                   */
/* -------------------------------------------------------------------------- */

describe("Ollama inference verification", () => {
  it("reaches VERIFIED only after a real inference round-trip succeeds", async () => {
    const client = new RecordingHttpClient(async (req) =>
      req.url.endsWith("/api/tags") ? jsonResponse(tagsPayload(["qwen2.5:0.5b"])) : jsonResponse(chatPayload({ content: "OK" })),
    );
    const { provider } = providerWith(client);
    const verification = await provider.verifyInference();
    expect(verification.ok).toBe(true);
    expect(verification.status).toBe("VERIFIED");
    expect((await provider.providerStatus(context())).status).toBe("VERIFIED");
    expect(client.callCount).toBe(2);
    // The verification probe is fixed, bounded and non-sensitive.
    const body = client.chatBody();
    expect(body?.stream).toBe(false);
    expect(JSON.stringify(body?.options)).toContain("num_predict");
  });

  it("does NOT reach VERIFIED when the inference round-trip fails or is malformed", async () => {
    const inferenceFails = new RecordingHttpClient(async (req) =>
      req.url.endsWith("/api/tags") ? jsonResponse(tagsPayload(["qwen2.5:0.5b"])) : textResponse("boom", 503),
    );
    const degraded = await providerWith(inferenceFails).provider.verifyInference();
    expect(degraded.status).toBe("DEGRADED");
    expect(degraded.ok).toBe(false);

    const malformed = new RecordingHttpClient(async (req) =>
      req.url.endsWith("/api/tags") ? jsonResponse(tagsPayload(["qwen2.5:0.5b"])) : jsonResponse({ message: {} }),
    );
    const stillDegraded = await providerWith(malformed).provider.verifyInference();
    expect(stillDegraded.status).toBe("DEGRADED");
    expect(stillDegraded.ok).toBe(false);
  });

  it("stays FAILED when the runtime is unreachable", async () => {
    const { provider } = providerWith(refusingClient());
    const verification = await provider.verifyInference();
    expect(verification.status).toBe("FAILED");
    expect(verification.detail).toMatch(/not attempted/);
  });
});

/* -------------------------------------------------------------------------- */
/* Governed generation                                                        */
/* -------------------------------------------------------------------------- */

describe("Ollama governed generation", () => {
  it("maps a governed request/response pair onto the normalized contract", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(chatPayload()));
    const { provider } = providerWith(client);
    const response = await provider.run(request({ systemPolicy: "PANEL POLICY", temperature: 0.1, maxTokens: 64 }));

    expect(response.status).toBe("COMPLETED");
    expect(response.providerId).toBe("PROV_OLLAMA_LOCAL");
    expect(response.output?.content).toBe("GOVERNED TEST OUTPUT");
    expect(response.output?.generativeInference).toBe(true);
    expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 7, totalTokens: 19, inferenceCount: 1 });
    expect(response.finishReason).toBe("STOP");
    // Request ids survive the round-trip.
    expect(response.requestId).toBe("REQ_OLLAMA_UNIT");
    expect(response.routingId).toBe("ART_OLLAMA_UNIT");

    const body = client.chatBody();
    expect(body?.model).toBe("qwen2.5:0.5b");
    expect(body?.stream).toBe(false);
    expect(body?.messages).toEqual([
      { role: "system", content: "PANEL POLICY" },
      { role: "user", content: "Summarise the governance posture." },
    ]);
    expect((body?.options as Record<string, unknown>).num_predict).toBe(64);
  });

  it("uses the configured model and endpoint (both are env-driven, not hard-coded)", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(chatPayload({ model: "some-other-model:1b" })));
    const { provider } = providerWith(client, {
      [ENV_OLLAMA_MODEL]: "custom:7b",
      [ENV_OLLAMA_BASE_URL]: "http://127.0.0.1:11500",
    });
    const response = await provider.run(request());
    expect(response.status).toBe("COMPLETED");
    expect(client.requests[0].url).toBe("http://127.0.0.1:11500/api/chat");
    expect(client.chatBody()?.model).toBe("custom:7b");
    // A runtime that reports a different model is recorded, never silently accepted.
    expect(response.metadata.modelMatchesSelection).toBe(false);
  });

  it("defaults the system policy to the governed control-plane policy", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(chatPayload()));
    const { provider } = providerWith(client);
    await provider.run(request());
    const messages = client.chatBody()?.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toMatch(/hold no authority/i);
    expect(messages[1]).toEqual({ role: "user", content: "Summarise the governance posture." });
  });

  it("DENIES above the classification ceiling and makes NO network call", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(chatPayload()));
    const { provider } = providerWith(client, { [ENV_OLLAMA_MAX_CLASSIFICATION]: "INTERNAL" });
    const response = await provider.run(request({ classification: "RESTRICTED" }));
    expect(response.status).toBe("DENIED");
    expect(response.safety.blocked).toBe(true);
    expect(response.error).toMatch(/OLLAMA_CLASSIFICATION_LIMIT_EXCEEDED/);
    expect(response.usage).toBeNull();
    expect(client.callCount).toBe(0);
    // A policy denial is not a runtime fault.
    expect((await provider.providerStatus(context())).status).toBe("CONFIGURED");
  });

  it("proceeds at exactly the configured ceiling", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(chatPayload()));
    const { provider } = providerWith(client, { [ENV_OLLAMA_MAX_CLASSIFICATION]: "INTERNAL" });
    const response = await provider.run(request({ classification: "INTERNAL" }));
    expect(response.status).toBe("COMPLETED");
    expect(client.callCount).toBe(1);
  });

  it("DENIES an oversized prompt and makes NO network call", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(chatPayload()));
    const { provider } = providerWith(client);
    const response = await provider.run(request({ prompt: "x".repeat(20_000) }));
    expect(response.status).toBe("DENIED");
    expect(response.error).toMatch(/OLLAMA_PROMPT_SIZE_LIMIT_EXCEEDED/);
    expect(client.callCount).toBe(0);
  });

  it("fails closed with NO retry on connection refusal, and never substitutes a provider", async () => {
    const client = refusingClient();
    const { provider } = providerWith(client, { [ENV_OLLAMA_MAX_ATTEMPTS]: "3" });
    const response = await provider.run(request());
    expect(response.status).toBe("FAIL_CLOSED");
    expect(response.safety?.blocked).toBe(true);
    expect(response.error).toMatch(/OLLAMA_UNREACHABLE/);
    expect(response.providerId).toBe("PROV_OLLAMA_LOCAL");
    expect(client.callCount).toBe(1);
  });

  it("fails closed with NO retry on timeout and reports a TIMEOUT code", async () => {
    const client = new RecordingHttpClient(async () => {
      const error = new Error("aborted") as Error & { name: string };
      error.name = "AbortError";
      throw error;
    });
    const { provider } = providerWith(client, { [ENV_OLLAMA_MAX_ATTEMPTS]: "3" });
    const response = await provider.run(request());
    expect(response.status).toBe("FAIL_CLOSED");
    expect(response.error).toMatch(/OLLAMA_TIMEOUT/);
    expect(client.callCount).toBe(1);
  });

  it("fails closed on a non-success HTTP status without leaking the upstream body", async () => {
    const client = new RecordingHttpClient(async () => textResponse("traceback: /opt/secret/path.py", 404));
    const { provider } = providerWith(client);
    const response = await provider.run(request());
    expect(response.status).toBe("FAIL_CLOSED");
    expect(response.error).toMatch(/OLLAMA_HTTP_ERROR_404/);
    expect(JSON.stringify(response)).not.toContain("/opt/secret/path.py");
    expect(client.callCount).toBe(1);
  });

  it("retries ONLY transient 5xx statuses within the bounded attempt budget", async () => {
    const flaky = new RecordingHttpClient(async (_req, index) =>
      index === 0 ? textResponse("starting", 503) : jsonResponse(chatPayload()),
    );
    const { provider } = providerWith(flaky, { [ENV_OLLAMA_MAX_ATTEMPTS]: "2" });
    const recovered = await provider.run(request());
    expect(recovered.status).toBe("COMPLETED");
    expect(flaky.callCount).toBe(2);

    const persistent = new RecordingHttpClient(async () => textResponse("down", 503));
    const { provider: failing } = providerWith(persistent, { [ENV_OLLAMA_MAX_ATTEMPTS]: "2" });
    const exhausted = await failing.run(request());
    expect(exhausted.status).toBe("FAIL_CLOSED");
    expect(exhausted.error).toMatch(/OLLAMA_HTTP_ERROR_503/);
    expect(persistent.callCount).toBe(2);
  });

  it("fails closed on malformed JSON and on an unexpected response shape, without retrying", async () => {
    const malformedJson = new RecordingHttpClient(async () => textResponse("not json at all", 200));
    const jsonCase = await providerWith(malformedJson, { [ENV_OLLAMA_MAX_ATTEMPTS]: "3" }).provider.run(request());
    expect(jsonCase.status).toBe("FAIL_CLOSED");
    expect(jsonCase.error).toMatch(/OLLAMA_MALFORMED_RESPONSE/);
    expect(malformedJson.callCount).toBe(1);

    const shapes = [
      { message: {} },
      { message: { role: "assistant", content: "hi" }, done: false },
      { message: { role: "assistant", content: "   " }, done: true },
      { done: true },
    ];
    for (const shape of shapes) {
      const client = new RecordingHttpClient(async () => jsonResponse(shape));
      const response = await providerWith(client).provider.run(request());
      expect(response.status).toBe("FAIL_CLOSED");
      expect(response.error).toMatch(/OLLAMA_MALFORMED_RESPONSE/);
      expect(response.output).toBeNull();
      expect(client.callCount).toBe(1);
    }
  });

  it("bounds an oversized response and refuses to parse it", async () => {
    // Two chunks that together exceed the default 1 MiB accepted-response cap:
    // the reader must stop at the cap and never parse the payload.
    const chunk = "A".repeat(600_000);
    const client = new RecordingHttpClient(async () => streamingResponse([chunk, chunk]));
    const { provider, config } = providerWith(client);
    const response = await provider.run(request());
    expect(config.responseByteLimit).toBe(1_048_576);
    expect(response.status).toBe("FAIL_CLOSED");
    expect(response.error).toMatch(/OLLAMA_OVERSIZED_RESPONSE/);
    expect(response.output).toBeNull();
  });

  it("never echoes the governed prompt or response body in errors or metadata", async () => {
    const marker = "PROMPT_MARKER_SHOULD_NOT_ECHO";
    const client = new RecordingHttpClient(async () => textResponse(`upstream failed while handling ${marker}`, 500));
    const { provider } = providerWith(client);
    const response = await provider.run(request({ prompt: marker }));
    expect(response.status).toBe("FAIL_CLOSED");
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain("localhost:11434");
  });

  it("does not claim generative support on non-generative surfaces", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(chatPayload()));
    const { provider } = providerWith(client);

    const generated = await provider.generate(request());
    expect(generated.status).toBe("NOT_SUPPORTED");
    expect(generated.error).toMatch(/OLLAMA_GOVERNED_PROMPT_REQUIRED/);

    const executed = await provider.execute(request());
    expect(executed.status).toBe("NOT_SUPPORTED");
    expect(executed.error).toMatch(/NO_DETERMINISTIC_EXECUTE_PATH/);

    await expect(provider.stream(request())).rejects.toThrow(/NOT_SUPPORTED/);
    await expect(provider.embed(request())).rejects.toThrow(/NOT_SUPPORTED/);
    expect(client.callCount).toBe(0);
  });

  it("refuses to run at all when disabled or misconfigured (fail closed, no call)", async () => {
    const disabledClient = refusingClient();
    const disabled = new BeyuOllamaProvider(resolveOllamaRuntimeConfig({} as unknown as NodeJS.ProcessEnv), { httpClient: disabledClient.client });
    const disabledResponse = await disabled.run(request());
    expect(disabledResponse.status).toBe("NOT_SUPPORTED");
    expect(disabledResponse.error).toMatch(/OLLAMA_RUNTIME_DISABLED/);

    const invalidClient = refusingClient();
    const invalid = new BeyuOllamaProvider(
      resolveOllamaRuntimeConfig(testEnv({ [ENV_OLLAMA_BASE_URL]: "http://evil.internal:11434" })),
      { httpClient: invalidClient.client },
    );
    const invalidResponse = await invalid.run(request());
    expect(invalidResponse.status).toBe("NOT_SUPPORTED");
    expect(invalidResponse.error).toMatch(/OLLAMA_RUNTIME_CONFIGURATION_INVALID/);

    expect(disabledClient.callCount + invalidClient.callCount).toBe(0);
  });

  it("normalizes metadata without claiming BEYU residency for a remote host", async () => {
    const local = providerWith(new RecordingHttpClient(async () => jsonResponse(tagsPayload(["qwen2.5:0.5b"])))).provider;
    const localMeta = await local.normalizedMetadata(context());
    expect(localMeta.dataResidency).toBe("BEYU_CONTROLLED");
    expect(localMeta.generativeInference).toBe(true);

    const remoteConfig = testConfig({
      [ENV_OLLAMA_BASE_URL]: "https://inference.example.internal:11434",
      [ENV_OLLAMA_ALLOWED_HOSTS]: "inference.example.internal",
    });
    const remote = new BeyuOllamaProvider(remoteConfig, { httpClient: refusingClient().client });
    const remoteMeta = await remote.normalizedMetadata(context());
    expect(remoteMeta.dataResidency).toBe("CONFIGURED_REMOTE_HOST");
    expect(remoteMeta.deploymentType).toBe("SELF_HOSTED_REMOTE_HOST");
    // The module name used by the runtime-role audit is unaffected by configuration.
    expect(ENV_MODEL_PROVIDER).toBe("NOELIA_MODEL_PROVIDER");
  });
});

/* -------------------------------------------------------------------------- */
/* Response parsing helpers                                                   */
/* -------------------------------------------------------------------------- */

describe("Ollama response parsing helpers", () => {
  it("maps finish reasons and usage honestly, including length truncation", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(chatPayload({ doneReason: "length", promptEvalCount: 0, evalCount: 0 })));
    const { provider } = providerWith(client);
    const response: AIModelResponse = await provider.run(request());
    expect(response.finishReason).toBe("LENGTH");
    expect(response.usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0, inferenceCount: 1 });
  });

  it("accepts an untagged configured model against a :latest install", async () => {
    const client = new RecordingHttpClient(async (req) =>
      req.url.endsWith("/api/tags") ? jsonResponse(tagsPayload(["qwen2.5:latest"])) : jsonResponse(chatPayload()),
    );
    const { provider } = providerWith(client, { [ENV_OLLAMA_MODEL]: "qwen2.5" });
    const health = await provider.health(context());
    expect(health.status).toBe("CONNECTED");
  });
});
