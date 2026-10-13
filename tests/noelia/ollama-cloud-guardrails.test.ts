import { describe, expect, it } from "vitest";
import { BeyuOllamaProvider } from "@/lib/noelia/ollama-provider";
import {
  ENV_MODEL_PROVIDER,
  ENV_OLLAMA_ALLOWED_HOSTS,
  ENV_OLLAMA_API_KEY,
  ENV_OLLAMA_BASE_URL,
  ENV_OLLAMA_CLOUD_OPT_IN,
  ENV_OLLAMA_MODEL,
  describeOllamaRuntimeConfig,
  isOllamaCloudHost,
  resolveOllamaRuntimeConfig,
} from "@/lib/noelia/ollama-config";
import { AI_PROVIDER_STATUSES } from "@/lib/noelia/model-provider";
import { RecordingHttpClient, chatPayload, jsonResponse, refusingClient, tagsPayload } from "./ollama-fixtures";

/**
 * OLLAMA CLOUD — GUARDRAILS ONLY.
 *
 * NOTHING in this file contacts ollama.com, or any network at all: every case
 * injects a recording HTTP client. The suite exists to prove the ZERO-COST and
 * NO-PAID-FALLBACK rules that the operator asked for:
 *
 *   1. Cloud is DISABLED unless explicitly opted in, allowlisted, https and
 *      given a credential.
 *   2. The credential is attached ONLY to an authorised non-loopback request —
 *      never to a loopback one, and never recorded in configuration/status.
 *   3. A billing/quota response (402/429) is terminal, sanitized and NEVER
 *      retried, NEVER converted into a paid request, and NEVER followed by a
 *      fallback to another provider or model.
 *   4. Configuration alone never reports CONNECTED/VERIFIED.
 *
 * The real cloud path is NOT implemented and NOT verified: see
 * docs/noelia/NOELIA_OLLAMA_LOCAL_DEVELOPMENT.md for the pending operator checks.
 */

const CLOUD_URL = "https://ollama.com";
const FAKE_KEY = "local-test-key-not-a-real-credential-0123456789";

function cloudEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    [ENV_MODEL_PROVIDER]: "OLLAMA",
    [ENV_OLLAMA_BASE_URL]: CLOUD_URL,
    [ENV_OLLAMA_MODEL]: "qwen2.5:0.5b",
    [ENV_OLLAMA_ALLOWED_HOSTS]: "ollama.com",
    [ENV_OLLAMA_CLOUD_OPT_IN]: "1",
    [ENV_OLLAMA_API_KEY]: FAKE_KEY,
    ...overrides,
  } as unknown as NodeJS.ProcessEnv;
}

describe("Ollama Cloud is disabled by default (zero-cost policy)", () => {
  it("recognises the cloud host and its subdomains only", () => {
    expect(isOllamaCloudHost("ollama.com")).toBe(true);
    expect(isOllamaCloudHost("OLLAMA.COM")).toBe(true);
    expect(isOllamaCloudHost("api.ollama.com")).toBe(true);
    expect(isOllamaCloudHost("ollama.com.evil.internal")).toBe(false);
    expect(isOllamaCloudHost("notollama.com")).toBe(false);
    expect(isOllamaCloudHost("localhost")).toBe(false);
  });

  it("refuses a cloud endpoint with no explicit opt-in", () => {
    const config = resolveOllamaRuntimeConfig(
      cloudEnv({ [ENV_OLLAMA_CLOUD_OPT_IN]: undefined }),
    );
    expect(config.valid).toBe(false);
    expect(config.invalidReasons.join(" ")).toMatch(/disabled by default/);
    // A refused configuration cannot call anything: the adapter is not even
    // usable in a generative mode.
    const provider = new BeyuOllamaProvider(config, { httpClient: refusingClient().client });
    expect(provider.mode).toBe("NOT_CONFIGURED");
  });

  it("refuses a cloud endpoint that is not explicitly allowlisted", () => {
    const config = resolveOllamaRuntimeConfig(cloudEnv({ [ENV_OLLAMA_ALLOWED_HOSTS]: "" }));
    expect(config.valid).toBe(false);
    expect(config.invalidReasons.join(" ")).toMatch(/not allowlisted/);
    expect(config.runtimeKind).toBe("OLLAMA_CLOUD");
  });

  it("refuses plaintext http to a cloud host", () => {
    const config = resolveOllamaRuntimeConfig(cloudEnv({ [ENV_OLLAMA_BASE_URL]: "http://ollama.com" }));
    expect(config.valid).toBe(false);
    expect(config.invalidReasons.join(" ")).toMatch(/must use https: for a non-loopback endpoint/);
  });

  it("requires a plausible credential and never echoes its value", () => {
    const missing = resolveOllamaRuntimeConfig(cloudEnv({ [ENV_OLLAMA_API_KEY]: undefined }));
    expect(missing.valid).toBe(false);
    expect(missing.invalidReasons.join(" ")).toMatch(/NOELIA_OLLAMA_API_KEY is required/);

    const tooShort = resolveOllamaRuntimeConfig(cloudEnv({ [ENV_OLLAMA_API_KEY]: "short" }));
    expect(tooShort.valid).toBe(false);
    expect(tooShort.invalidReasons.join(" ")).toMatch(/not a plausible Ollama API key/);

    // A rejected key must never appear in the diagnostic surface.
    for (const config of [tooShort, missing]) {
      const described = JSON.stringify(describeOllamaRuntimeConfig(config));
      expect(described).not.toContain("short");
      expect(described).not.toContain(FAKE_KEY);
    }
  });

  it("accepts an explicitly opted-in, allowlisted, keyed cloud endpoint as CONFIGURED only", () => {
    const config = resolveOllamaRuntimeConfig(cloudEnv());
    expect(config.valid).toBe(true);
    expect(config.enabled).toBe(true);
    expect(config.cloudMode).toBe(true);
    expect(config.runtimeKind).toBe("OLLAMA_CLOUD");
    expect(config.endpointScope).toBe("CONFIGURED_REMOTE_HOST");
    // The credential VALUE is not part of the configuration object at all.
    expect(JSON.stringify(config)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(describeOllamaRuntimeConfig(config))).not.toContain(FAKE_KEY);

    const provider = new BeyuOllamaProvider(config, { httpClient: refusingClient().client, env: cloudEnv() });
    // Configuration is never connectivity.
    expect(provider.mode).toBe("GENERATIVE");
    return provider.providerStatus({} as never).then((report) => {
      expect(AI_PROVIDER_STATUSES).toContain(report.status);
      expect(["CONFIGURED", "FAILED", "NOT_CONNECTED"]).toContain(report.status);
      expect(report.status).not.toBe("CONNECTED");
      expect(report.status).not.toBe("VERIFIED");
      expect(JSON.stringify(report)).not.toContain(FAKE_KEY);
    });
  });

  it("rejects a credential on a loopback endpoint (a local runtime has none)", () => {
    const config = resolveOllamaRuntimeConfig(
      cloudEnv({ [ENV_OLLAMA_BASE_URL]: "http://127.0.0.1:11434", [ENV_OLLAMA_ALLOWED_HOSTS]: "", [ENV_OLLAMA_CLOUD_OPT_IN]: undefined }),
    );
    expect(config.valid).toBe(false);
    expect(config.invalidReasons.join(" ")).toMatch(/must not be set for a loopback endpoint/);
  });

  it("rejects a credential aimed at a host that is not an authorised https remote", () => {
    const config = resolveOllamaRuntimeConfig(
      cloudEnv({ [ENV_OLLAMA_BASE_URL]: "https://inference.example.internal:11434", [ENV_OLLAMA_ALLOWED_HOSTS]: "" }),
    );
    expect(config.valid).toBe(false);
    expect(config.invalidReasons.join(" ")).toMatch(/not an allowlisted https remote host/);
  });
});

describe("Cloud credential handling (mock only — no real cloud request)", () => {
  it("never attaches a credential to a loopback request", async () => {
    // Even a hostile environment (a stray key) must not leak onto a local call.
    const client = new RecordingHttpClient(async () => jsonResponse(tagsPayload(["qwen2.5:0.5b"])));
    const config = resolveOllamaRuntimeConfig({
      [ENV_MODEL_PROVIDER]: "OLLAMA",
      [ENV_OLLAMA_BASE_URL]: "http://127.0.0.1:11434",
      [ENV_OLLAMA_MODEL]: "qwen2.5:0.5b",
    } as unknown as NodeJS.ProcessEnv);
    const provider = new BeyuOllamaProvider(config, { httpClient: client.client, env: { [ENV_OLLAMA_API_KEY]: FAKE_KEY } as unknown as NodeJS.ProcessEnv });

    const health = await provider.health({} as never);
    expect(health.status).toBe("CONNECTED");
    expect(client.callCount).toBe(1);
    const headers = client.requests[0].headers;
    expect(headers.authorization).toBeUndefined();
    expect(JSON.stringify(client.requests)).not.toContain(FAKE_KEY);
  });

  it("attaches the credential to an authorised non-loopback request and to nothing else", async () => {
    const client = new RecordingHttpClient(async (request) =>
      request.url.endsWith("/api/tags") ? jsonResponse(tagsPayload(["qwen2.5:0.5b"])) : jsonResponse(chatPayload()),
    );
    const env = cloudEnv();
    const provider = new BeyuOllamaProvider(resolveOllamaRuntimeConfig(env), { httpClient: client.client, env });

    const health = await provider.health({} as never);
    expect(health.status).toBe("CONNECTED");
    expect(client.requests[0].headers.authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(client.requests[0].url).toBe("https://ollama.com/api/tags");

    // The credential must not appear in any returned diagnostic surface.
    expect(JSON.stringify(health)).not.toContain(FAKE_KEY);
    const status = await provider.providerStatus({} as never);
    expect(JSON.stringify(status)).not.toContain(FAKE_KEY);
  });

  it("reports VERIFIED only after a real round-trip that the mock proves happened", async () => {
    const client = new RecordingHttpClient(async (request) =>
      request.url.endsWith("/api/tags") ? jsonResponse(tagsPayload(["qwen2.5:0.5b"])) : jsonResponse(chatPayload()),
    );
    const provider = new BeyuOllamaProvider(resolveOllamaRuntimeConfig(cloudEnv()), {
      httpClient: client.client,
      env: cloudEnv(),
    });
    const verification = await provider.verifyInference();
    expect(verification.status).toBe("VERIFIED");
    expect(verification.evidence).toContain("verify:inference-completed");
    expect(client.callCount).toBe(2);
    expect(JSON.stringify(verification)).not.toContain(FAKE_KEY);
  });
});

describe("Quota, billing and rate limits fail closed with no paid fallback", () => {
  const billingCases: Array<[number, RegExp, string]> = [
    [402, /OLLAMA_HTTP_ERROR_402/, "payment required"],
    [429, /OLLAMA_HTTP_ERROR_429/, "rate limited"],
    [401, /OLLAMA_HTTP_ERROR_401/, "unauthenticated"],
  ];

  for (const [status, codePattern, label] of billingCases) {
    it(`treats HTTP ${status} (${label}) as a terminal, sanitized, non-retried failure`, async () => {
      const client = new RecordingHttpClient(async () => jsonResponse({ error: "upstream internal detail that must not leak" }, status));
      const provider = new BeyuOllamaProvider(resolveOllamaRuntimeConfig(cloudEnv()), { httpClient: client.client, env: cloudEnv() });

      const response = await provider.run({
        requestId: "REQ_CLOUD",
        routingId: "ART_CLOUD",
        tenantId: "TEN_CLOUD",
        legalEntityId: null,
        countryCode: null,
        osId: null,
        task: "cloud-quota",
        capability: "governed-analysis",
        classification: "INTERNAL",
        riskLevel: "LOW",
        selectedModelId: "qwen2.5:0.5b",
        selectedProviderId: "PROV_OLLAMA_LOCAL",
        traceId: "TRACE_CLOUD",
        prompt: "Summarise the governed request.",
        systemPolicy: undefined,
        temperature: 0,
        maxTokens: 32,
      });

      expect(["FAIL_CLOSED", "DENIED"]).toContain(response.status);
      expect(response.error).toMatch(codePattern);
      // Sanitized: no upstream body, no credential, no prompt echo.
      expect(response.error).not.toMatch(/upstream internal detail/);
      expect(JSON.stringify(response)).not.toContain(FAKE_KEY);
      expect(JSON.stringify(response)).not.toContain("upstream internal detail");
      // Bounded: a billing/quota/auth signal is never retried.
      expect(client.callCount).toBe(1);
      expect(response.metadata?.retryable).toBe(false);
      // No output was produced, so no consumer can mistake this for a result.
      expect(response.output).toBeNull();
      expect(response.safety?.blocked).toBe(true);
    });
  }

  it("never switches to another provider or model after a cloud failure", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse({ error: "quota" }, 429));
    const provider = new BeyuOllamaProvider(resolveOllamaRuntimeConfig(cloudEnv()), { httpClient: client.client, env: cloudEnv() });
    const response = await provider.run({
      requestId: "REQ_CLOUD_2",
      routingId: "ART_CLOUD_2",
      tenantId: "TEN_CLOUD",
      legalEntityId: null,
      countryCode: null,
      osId: null,
      task: "cloud-quota",
      capability: "governed-analysis",
      classification: "INTERNAL",
      riskLevel: "LOW",
      selectedModelId: "qwen2.5:0.5b",
      selectedProviderId: "PROV_OLLAMA_LOCAL",
      traceId: "TRACE_CLOUD_2",
      prompt: "Summarise the governed request.",
      systemPolicy: undefined,
      temperature: 0,
      maxTokens: 32,
    });
    // The selected model/provider identity is preserved exactly: a failure does
    // not silently substitute a different model or a different provider.
    expect(response.modelId).toBe("qwen2.5:0.5b");
    expect(response.providerId).toBe("PROV_OLLAMA_LOCAL");
    expect(response.output).toBeNull();
    expect(client.requests.every((request) => request.url.startsWith(CLOUD_URL))).toBe(true);
    expect(client.requests.every((request) => JSON.parse(request.body ?? "{}").model === "qwen2.5:0.5b")).toBe(true);
  });

  it("blocks above the classification ceiling before any cloud transmission", async () => {
    const client = new RecordingHttpClient(async () => jsonResponse(chatPayload()));
    const provider = new BeyuOllamaProvider(resolveOllamaRuntimeConfig(cloudEnv()), { httpClient: client.client, env: cloudEnv() });
    const response = await provider.run({
      requestId: "REQ_CLOUD_3",
      routingId: "ART_CLOUD_3",
      tenantId: "TEN_CLOUD",
      legalEntityId: null,
      countryCode: null,
      osId: null,
      task: "cloud-restricted",
      capability: "governed-analysis",
      // The default cloud ceiling is INTERNAL: a restricted request must never
      // leave the process for an external endpoint.
      classification: "HIGHLY_RESTRICTED",
      riskLevel: "HIGH",
      selectedModelId: "qwen2.5:0.5b",
      selectedProviderId: "PROV_OLLAMA_LOCAL",
      traceId: "TRACE_CLOUD_3",
      prompt: "Restricted content that must never leave the boundary.",
      systemPolicy: undefined,
      temperature: 0,
      maxTokens: 32,
    });
    expect(response.status).toBe("DENIED");
    expect(response.error).toMatch(/OLLAMA_CLASSIFICATION_LIMIT_EXCEEDED/);
    expect(client.callCount).toBe(0);
  });
});
