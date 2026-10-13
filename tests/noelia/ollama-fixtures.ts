import { Buffer } from "node:buffer";
import type { OllamaHttpClient, OllamaHttpRequest, OllamaHttpResponse, OllamaStreamReader } from "@/lib/noelia/ollama-provider";
import { resolveOllamaRuntimeConfig, type OllamaRuntimeConfig } from "@/lib/noelia/ollama-config";

/**
 * Hermetic Ollama test doubles.
 *
 * NO test in this repository requires a real Ollama runtime, the network or the
 * operator's machine. Every provider test injects an HTTP client built here.
 * The opt-in live smoke test (tests/noelia/ollama-live-smoke.test.ts) is the
 * only place a real endpoint may be contacted, and it is skipped by default.
 */

export type RecordedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  signal: AbortSignal | undefined;
};

/** Records every request so a test can prove a denial made NO network call. */
export class RecordingHttpClient {
  readonly requests: RecordedRequest[] = [];

  constructor(private readonly handler: (request: OllamaHttpRequest, index: number) => Promise<OllamaHttpResponse>) {}

  readonly client: OllamaHttpClient = async (request) => {
    this.requests.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body ?? null,
      signal: request.signal,
    });
    return this.handler(request, this.requests.length - 1);
  };

  get callCount(): number {
    return this.requests.length;
  }

  /** Parsed JSON body of the Nth chat request, or null. */
  chatBody(index = 0): Record<string, unknown> | null {
    const chatRequests = this.requests.filter((request) => request.url.endsWith("/api/chat"));
    const target = chatRequests[index];
    if (!target?.body) return null;
    return JSON.parse(target.body) as Record<string, unknown>;
  }
}

/** A response whose body is only available through text() (non-streaming path). */
export function textResponse(body: string, status = 200): OllamaHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    text: async () => body,
  };
}

export function jsonResponse(payload: unknown, status = 200): OllamaHttpResponse {
  return textResponse(JSON.stringify(payload), status);
}

/** A response that exposes a streaming body, so the byte cap is exercised. */
export function streamingResponse(chunks: string[], status = 200): OllamaHttpResponse {
  let index = 0;
  const reader: OllamaStreamReader = {
    read: async () => {
      if (index >= chunks.length) return { done: true };
      const value = Buffer.from(chunks[index], "utf8");
      index += 1;
      return { done: false, value: new Uint8Array(value) };
    },
    cancel: () => undefined,
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    body: { getReader: () => reader },
    text: async () => chunks.join(""),
  };
}

/** A realistic /api/tags payload. */
export function tagsPayload(models: string[], extra: string[] = []) {
  return {
    models: [...models, ...extra].map((name) => ({ name, model: name, size: 397_000_000, details: { family: "qwen2" } })),
  };
}

/** A realistic non-streaming /api/chat payload. */
export function chatPayload(options: {
  content?: string;
  model?: string;
  done?: boolean;
  doneReason?: string;
  promptEvalCount?: number;
  evalCount?: number;
} = {}) {
  return {
    model: options.model ?? "qwen2.5:0.5b",
    created_at: "2026-10-13T00:00:00Z",
    message: { role: "assistant", content: options.content ?? "GOVERNED TEST OUTPUT" },
    done: options.done ?? true,
    done_reason: options.doneReason ?? "stop",
    total_duration: 1_000_000,
    load_duration: 100_000,
    prompt_eval_count: options.promptEvalCount ?? 12,
    eval_count: options.evalCount ?? 7,
  };
}

/** An HTTP client that refuses every connection, like a stopped Ollama service. */
export function refusingClient(code = "ECONNREFUSED"): RecordingHttpClient {
  return new RecordingHttpClient(async () => {
    const error = new Error("connect ECONNREFUSED") as Error & { code?: string };
    error.code = code;
    throw error;
  });
}

export function testEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NOELIA_MODEL_PROVIDER: "OLLAMA",
    NOELIA_OLLAMA_BASE_URL: "http://localhost:11434",
    NOELIA_OLLAMA_MODEL: "qwen2.5:0.5b",
    ...overrides,
  } as unknown as NodeJS.ProcessEnv;
}

export function testConfig(overrides: Record<string, string | undefined> = {}): OllamaRuntimeConfig {
  return resolveOllamaRuntimeConfig(testEnv(overrides));
}
