import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { BeyuOllamaProvider } from "@/lib/noelia/ollama-provider";
import { resolveOllamaRuntimeConfig } from "@/lib/noelia/ollama-config";

/**
 * Real-HTTP integration for the DEFAULT Ollama HTTP client.
 *
 * The unit suite injects an HTTP client; this suite exercises the production
 * `fetch` path — request construction, a real streaming response body, the byte
 * cap, the timeout/abort path and header handling — against a loopback server
 * that speaks the Ollama wire format. No external network, no Ollama install
 * and no operator machine is required, so it is safe for normal CI.
 */

let server: Server;
let baseUrl: string;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    request.on("data", (chunk) => {
      data += String(chunk);
    });
    request.on("end", () => resolve(data));
  });
}

const installedModels = ["qwen2.5:0.5b", "gpt-oss:latest"];

beforeAll(async () => {
  server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = request.url ?? "/";

    if (url === "/api/tags") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ models: installedModels.map((name) => ({ name, model: name })) }));
      return;
    }

    if (url === "/api/chat") {
      const body = JSON.parse(await readBody(request)) as { model?: string; messages?: Array<{ content: string }> };
      const prompt = body.messages?.at(-1)?.content ?? "";

      // A deliberate slow path so the timeout/abort behaviour is exercised.
      if (prompt.includes("SLOW")) {
        await new Promise((resolve) => setTimeout(resolve, 2_500));
      }
      // A deliberately oversized body so the byte cap is exercised for real.
      if (prompt.includes("OVERSIZE")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.write('{"model":"qwen2.5:0.5b","message":{"role":"assistant","content":"');
        for (let i = 0; i < 40; i += 1) response.write("X".repeat(50_000));
        response.end('"},"done":true,"done_reason":"stop","prompt_eval_count":1,"eval_count":1}');
        return;
      }
      if (prompt.includes("HTTP500")) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "internal failure with /private/path/leak" }));
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          model: body.model ?? "qwen2.5:0.5b",
          message: { role: "assistant", content: "HELLO FROM LOOPBACK OLLAMA" },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 9,
          eval_count: 5,
        }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function provider(envOverrides: Record<string, string | undefined> = {}, dependencies: { now?: () => Date } = {}) {
  const config = resolveOllamaRuntimeConfig({
    NOELIA_MODEL_PROVIDER: "OLLAMA",
    NOELIA_OLLAMA_BASE_URL: baseUrl,
    NOELIA_OLLAMA_MODEL: "qwen2.5:0.5b",
    ...envOverrides,
  } as unknown as NodeJS.ProcessEnv);
  expect(config.valid).toBe(true);
  // No injected client: this is the real fetch implementation.
  return new BeyuOllamaProvider(config, dependencies);
}

function request(prompt: string) {
  return {
    requestId: "REQ_OLLAMA_HTTP",
    routingId: "ART_OLLAMA_HTTP",
    tenantId: "TEN_LOCAL",
    legalEntityId: null,
    countryCode: null,
    osId: null,
    task: "http-integration",
    capability: "governed-analysis",
    classification: "INTERNAL" as const,
    riskLevel: "LOW" as const,
    selectedModelId: "MOD_OLLAMA_LOCAL",
    selectedProviderId: "PROV_OLLAMA_LOCAL",
    traceId: "TRACE_OLLAMA_HTTP",
    prompt,
  };
}

describe("Ollama adapter over real HTTP (loopback)", () => {
  it("proves connectivity and reaches VERIFIED against a real HTTP endpoint", async () => {
    const instance = provider();
    const health = await instance.health({} as never);
    expect(health.status).toBe("CONNECTED");
    expect(health.reachable).toBe(true);

    const verification = await instance.verifyInference();
    expect(verification.status).toBe("VERIFIED");
    expect(verification.evidence.join(" ")).toMatch(/inference-completed/);
  });

  it("completes a governed generation through the default fetch client", async () => {
    const response = await provider().run(request("Say hello."));
    expect(response.status).toBe("COMPLETED");
    expect(response.output?.content).toBe("HELLO FROM LOOPBACK OLLAMA");
    expect(response.usage).toEqual({ inputTokens: 9, outputTokens: 5, totalTokens: 14, inferenceCount: 1 });
    expect(response.metadata.runtimeModelId).toBeUndefined();
    expect(response.metadata.modelMatchesSelection).toBe(true);
  });

  it("aborts at the configured timeout instead of hanging", async () => {
    // 1000 ms is the documented minimum accepted timeout; the endpoint stalls
    // for 2500 ms, so the request MUST abort rather than hang.
    const response = await provider({ NOELIA_OLLAMA_TIMEOUT_MS: "1000" }).run(request("SLOW request please"));
    expect(response.status).toBe("FAIL_CLOSED");
    expect(response.error).toMatch(/OLLAMA_TIMEOUT/);
  }, 15_000);

  it("applies the byte cap to a real streaming body", async () => {
    const response = await provider().run(request("OVERSIZE response please"));
    expect(response.status).toBe("FAIL_CLOSED");
    expect(response.error).toMatch(/OLLAMA_OVERSIZED_RESPONSE/);
  }, 15_000);

  it("never surfaces the upstream error body", async () => {
    const response = await provider().run(request("HTTP500 please"));
    expect(response.status).toBe("FAIL_CLOSED");
    expect(response.error).toMatch(/OLLAMA_HTTP_ERROR_500/);
    expect(JSON.stringify(response)).not.toContain("/private/path/leak");
  });
});
