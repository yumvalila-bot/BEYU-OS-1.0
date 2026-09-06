import { createHash } from "node:crypto";
import type { Classification } from "@/lib/constants";
import type { NoeliaRouteVerdict } from "./ai-platform";
import type { NoeliaTargetContext, ToolInvocationContext } from "./types";

/**
 * Provider-independent AI model runtime contract.
 *
 * Architectural rule: AI PLATFORM, MODEL, MODEL RUNTIME and PROVIDER are
 * separate concepts. A provider row is registry metadata; a model runtime is
 * the implementation that actually executes a governed request. No adapter
 * here hard-codes an external provider.
 */

/* --------------------------------------------------------------------------
 * Normalized, provider-neutral AI contracts (Phase 3, prompt section 7).
 * These are the only types the model gateway and runtime are allowed to use.
 * ------------------------------------------------------------------------ */

export type AIFinishReason = "STOP" | "LENGTH" | "CONTENT_FILTER" | "TOOL_CALL" | "ABORTED" | "BLOCKED" | "UNKNOWN";

export type AIUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inferenceCount: number;
  estimatedCostMicroUsd?: number;
};

export type AIError = {
  code: string;
  message: string;
  retryable: boolean;
  category: "AUTHENTICATION" | "RATE_LIMIT" | "NETWORK" | "TIMEOUT" | "MALFORMED_RESPONSE" | "POLICY" | "MODEL" | "INTERNAL" | "UNKNOWN";
};

export type AIProviderHealth = {
  ok: boolean;
  detail: string;
  mode: AIConfiguredMode;
  configured: boolean;
  reachable: boolean | null;
  checkedAt: string;
};

export type AIModelCapabilities = {
  capabilities: string[];
  modalities: string[];
  supportsStreaming: boolean;
  supportsEmbeddings: boolean;
  supportsToolCalls: boolean;
  contextWindow: number | null;
};

export type AIModelMetadata = AIModelCapabilities & {
  modelId: string;
  modelVersion: string;
  providerId: string;
  providerName: string;
  kind: AIModelKind;
  mode: AIConfiguredMode;
  generativeInference: boolean;
  deploymentType: string;
  dataResidency: string;
  version: string;
};

export type AIModelRequest = ModelExecutionRequest & {
  prompt: string;
  systemPolicy?: string;
  temperature?: number | null;
  maxTokens?: number | null;
  streaming?: boolean;
};

export type AIModelResponse = {
  requestId: string;
  routingId: string;
  modelId: string;
  modelVersion: string;
  providerId: string | null;
  providerName: string | null;
  modelKind: AIModelKind;
  status: "COMPLETED" | "DENIED" | "FAIL_CLOSED" | "BLOCKED" | "NOT_SUPPORTED";
  output: Record<string, unknown> | null;
  error: string | null;
  usage: AIUsage | null;
  finishReason: AIFinishReason;
  safety: { blocked: boolean; reasons: string[] };
  metadata: Record<string, unknown>;
  executedAt: string;
};

export type AIModelStreamChunk = {
  requestId: string;
  routingId: string;
  modelId: string;
  modelVersion: string;
  delta: string;
  finishReason: AIFinishReason | null;
  usage: AIUsage | null;
  error: AIError | null;
};

export type AIEmbeddingRequest = {
  requestId: string;
  routingId: string;
  modelId: string;
  providerId: string;
  inputs: string[];
  classification: Classification;
  countryCode: string | null;
  tenantId: string;
};

export type AIEmbeddingResponse = {
  requestId: string;
  routingId: string;
  modelId: string;
  modelVersion: string;
  providerId: string;
  providerName: string;
  vectors: Array<{ index: number; vector: number[] }>;
  dimensions: number;
  usage: AIUsage | null;
  status: "COMPLETED" | "DENIED" | "FAIL_CLOSED" | "BLOCKED" | "NOT_SUPPORTED";
  error: string | null;
};

/** How a runtime is actually configured for the current environment. */
export type AIConfiguredMode = "DETERMINISTIC" | "GENERATIVE" | "MIXED" | "NOT_CONFIGURED";

/** The intentionally distinguished model runtime kinds. */
export type AIModelKind =
  | "DETERMINISTIC_ANALYST"
  | "FOUNDATION_MODEL"
  | "GENERATIVE_MODEL"
  | "OPEN_WEIGHT"
  | "SELF_HOSTED"
  | "EXTERNAL"
  | "UNKNOWN";

export type ModelExecutionStatus =
  | "COMPLETED"
  | "DENIED"
  | "FAIL_CLOSED"
  | "BLOCKED"
  | "NOT_SUPPORTED";

export type ModelExecutionRequest = {
  requestId: string;
  routingId: string;
  tenantId: string;
  legalEntityId: string | null;
  countryCode: string | null;
  osId: string | null;
  task: string;
  capability: string;
  classification: Classification;
  riskLevel: string;
  selectedModelId: string;
  selectedProviderId: string | null;
  traceId: string;
};

export type ModelExecutionResult = {
  requestId: string;
  routingId: string;
  modelId: string;
  modelVersion: string;
  providerId: string | null;
  providerName: string | null;
  modelKind: AIModelKind;
  status: ModelExecutionStatus;
  output: Record<string, unknown> | null;
  error: string | null;
  /** Normalized token/cost attribution where the runtime can report it. */
  usage?: AIUsage | null;
  finishReason?: AIFinishReason;
  safety?: { blocked: boolean; reasons: string[] };
  metadata: Record<string, unknown>;
  executedAt: string;
};

/** The canonical provider-neutral adapter surface. */
export interface AIModelProvider {
  readonly id: string;
  readonly providerName: string;
  readonly kind: AIModelKind;
  /** The real configured mode of this adapter in this environment. */
  readonly mode: AIConfiguredMode;
  getCapabilities(): string[];
  getMetadata(context: ToolInvocationContext): Promise<Record<string, unknown>>;
  /** Normalized provider health report. */
  health(context: ToolInvocationContext): Promise<AIProviderHealth>;
  /** Normalized capability reflection. */
  capabilities(context: ToolInvocationContext): Promise<AIModelCapabilities>;
  /** Normalized fully-attributed metadata. */
  normalizedMetadata(context: ToolInvocationContext): Promise<AIModelMetadata>;
  /** Legacy health alias kept for existing call sites. */
  healthCheck(context: ToolInvocationContext): Promise<{ ok: boolean; detail: string }>;
  /** Generative execution surface (BLOCKED until a real runtime is available). */
  generate(request: ModelExecutionRequest): Promise<ModelExecutionResult>;
  /** Deterministic/governed execution surface used by the first real adapter. */
  execute(request: ModelExecutionRequest): Promise<ModelExecutionResult>;
  /** Normalized generative execution used by a real configured runtime. */
  run(request: AIModelRequest): Promise<AIModelResponse>;
  stream(_request: ModelExecutionRequest): Promise<never>;
  embed(_request: ModelExecutionRequest): Promise<never>;
}

/**
 * First real governed adapter: the BEYU deterministic analyst.
 *
 * This is explicitly NOT a foundation model, generative model or LLM. It is a
 * deterministic control-plane runtime used to validate the complete
 * Noelia → HIVE → routing → gateway → model → response → audit pipeline. Its
 * "output" is an honest deterministic attestation over the governed request
 * metadata; it never fabricates generative inference.
 */
export class BeyuDeterministicAnalystProvider implements AIModelProvider {
  readonly id = "PROV_NOELIA_DET";
  readonly providerName = "beyu-hive-deterministic-analyst";
  readonly kind: AIModelKind = "DETERMINISTIC_ANALYST";
  readonly mode: AIConfiguredMode = "DETERMINISTIC";
  readonly modelId = "MOD_NOELIA_DET";
  readonly modelVersion = "2026.09";

  getCapabilities(): string[] {
    return ["governed-analysis", "control-plane-attestation", "deterministic-validation"];
  }

  async getMetadata(_context: ToolInvocationContext): Promise<Record<string, unknown>> {
    return {
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      providerId: this.id,
      providerName: this.providerName,
      kind: this.kind,
      mode: this.mode,
      generativeInference: false,
      supported: false,
    };
  }

  async health(_context: ToolInvocationContext): Promise<AIProviderHealth> {
    return {
      ok: true,
      detail: "Deterministic BEYU analyst available inside the HIVE boundary; no external runtime dependency.",
      mode: this.mode,
      configured: true,
      reachable: null,
      checkedAt: new Date().toISOString(),
    };
  }

  async capabilities(_context: ToolInvocationContext): Promise<AIModelCapabilities> {
    return {
      capabilities: this.getCapabilities(),
      modalities: ["TEXT"],
      supportsStreaming: false,
      supportsEmbeddings: false,
      supportsToolCalls: false,
      contextWindow: null,
    };
  }

  async normalizedMetadata(context: ToolInvocationContext): Promise<AIModelMetadata> {
    const capabilities = await this.capabilities(context);
    return {
      ...capabilities,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      providerId: this.id,
      providerName: this.providerName,
      kind: this.kind,
      mode: this.mode,
      generativeInference: false,
      deploymentType: "SELF_HOSTED",
      dataResidency: "BEYU_CONTROLLED",
      version: this.modelVersion,
    };
  }

  async healthCheck(_context: ToolInvocationContext): Promise<{ ok: boolean; detail: string }> {
    return {
      ok: true,
      detail: "Deterministic BEYU analyst available inside the HIVE boundary; no external runtime dependency.",
    };
  }

  /**
   * Generative inference is intentionally BLOCKED on this adapter: the
   * deterministic analyst is not a foundation/generative model.
   */
  async generate(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    return {
      requestId: request.requestId,
      routingId: request.routingId,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      providerId: this.id,
      providerName: this.providerName,
      modelKind: this.kind,
      status: "NOT_SUPPORTED",
      output: null,
      error: "GENERATIVE_INFERENCE_BLOCKED: real generative inference is not available in this environment.",
      metadata: { generativeInference: false, mode: this.mode, required: GENERATIVE_MODEL_RUNTIME_REQUIREMENT },
      executedAt: new Date().toISOString(),
    };
  }

  async run(request: AIModelRequest): Promise<AIModelResponse> {
    // The deterministic analyst is not a generative runtime. This is the
    // honest, fail-closed response to an attempt to use a generative path on
    // an adapter that cannot provide generative inference.
    return {
      requestId: request.requestId,
      routingId: request.routingId,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      providerId: this.id,
      providerName: this.providerName,
      modelKind: this.kind,
      status: "NOT_SUPPORTED",
      output: null,
      error: "GENERATIVE_INFERENCE_BLOCKED: real generative inference is not available in this environment.",
      usage: null,
      finishReason: "BLOCKED",
      safety: { blocked: true, reasons: ["Deterministic analyst is not a generative runtime."] },
      metadata: { generativeInference: false, mode: this.mode, deterministic: true },
      executedAt: new Date().toISOString(),
    };
  }

  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const attestation = [
      `request:${request.requestId}`,
      `routing:${request.routingId}`,
      `model:${request.selectedModelId}@${this.modelVersion}`,
      `provider:${request.selectedProviderId ?? "none"}`,
      `tenant:${request.tenantId}`,
      `entity:${request.legalEntityId ?? "none"}`,
      `country:${request.countryCode ?? "none"}`,
      `os:${request.osId ?? "none"}`,
      `capability:${request.capability}`,
      `classification:${request.classification}`,
      `risk:${request.riskLevel}`,
      `trace:${request.traceId}`,
    ].join("|");
    const digest = createHash("sha256").update(attestation).digest("hex");

    return {
      requestId: request.requestId,
      routingId: request.routingId,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      providerId: this.id,
      providerName: this.providerName,
      modelKind: this.kind,
      status: "COMPLETED",
      output: {
        execution: "DETERMINISTIC_VALIDATION",
        verified: true,
        deterministic: true,
        generativeInference: false,
        attestationDigest: digest,
      },
      error: null,
      metadata: {
        deterministic: true,
        generativeInference: false,
        pipelineStage: "controlled-model-execution",
      },
      executedAt: new Date().toISOString(),
    };
  }

  async stream(_request: ModelExecutionRequest): Promise<never> {
    throw new Error("NOT_SUPPORTED: deterministic analyst has no streaming mode.");
  }

  async embed(_request: ModelExecutionRequest): Promise<never> {
    throw new Error("NOT_SUPPORTED: deterministic analyst has no embedding mode.");
  }
}

/**
 * Real generative adapter scaffolding (Phase 3, prompt section 8).
 *
 * This adapter is REAL code for an OpenAI-compatible chat runtime. It is inert
 * and fail-closed by default: it never reads a credential from source, seed,
 * database, tests or documentation, and it never claims inference is available.
 *
 * A runtime is only usable when BOTH are present in the environment:
 *   1. NOELIA_GENERATIVE_ENDPOINT  (the real inference endpoint URL)
 *   2. NOELIA_GENERATIVE_API_KEY_REF  (the environment variable NAME holding
 *      the credential; the value is never referenced or logged here)
 *
 * If either is absent the adapter reports BLOCKED / NOT_CONFIGURED. This is
 * the honest state for BEYU OS today and is never converted to PASS.
 */
export type OpenAICompatibleAdapterConfig = {
  id: string;
  providerName: string;
  modelId: string;
  modelVersion: string;
  /** Optional explicit endpoint; falls back to NOELIA_GENERATIVE_ENDPOINT. */
  endpoint?: string | null;
  /** Environment variable NAME that holds the credential (never the value). */
  credentialEnvVar?: string | null;
  authScheme?: "bearer" | "api-key-header" | "none";
  capabilities?: string[];
  modality?: string;
  contextWindow?: number | null;
  deploymentType?: string;
  dataResidency?: string;
};

export class OpenAICompatibleAdapter implements AIModelProvider {
  readonly id: string;
  readonly providerName: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly kind: AIModelKind = "GENERATIVE_MODEL";
  readonly mode: AIConfiguredMode;
  private readonly endpoint: string | null;
  private readonly credentialEnvVar: string;
  private readonly authScheme: "bearer" | "api-key-header" | "none";
  private readonly caps: string[];
  private readonly modality: string;
  private readonly contextWindow: number | null;
  private readonly deploymentType: string;
  private readonly dataResidency: string;

  constructor(config: OpenAICompatibleAdapterConfig) {
    this.id = config.id;
    this.providerName = config.providerName;
    this.modelId = config.modelId;
    this.modelVersion = config.modelVersion;
    this.endpoint = config.endpoint || process.env.NOELIA_GENERATIVE_ENDPOINT || null;
    this.credentialEnvVar = config.credentialEnvVar || "NOELIA_GENERATIVE_API_KEY_REF";
    this.authScheme = config.authScheme ?? "bearer";
    this.caps = config.capabilities ?? ["chat", "instruction-following", "generative-text"];
    this.modality = config.modality ?? "TEXT";
    this.contextWindow = config.contextWindow ?? null;
    this.deploymentType = config.deploymentType ?? "EXTERNAL";
    this.dataResidency = config.dataResidency ?? "UNKNOWN";
    this.mode = this.endpoint && this.credentialPresent() ? "GENERATIVE" : "NOT_CONFIGURED";
  }

  private credentialPresent(): boolean {
    if (this.authScheme === "none") return true;
    return Boolean(process.env[this.credentialEnvVar]);
  }

  private configured(): boolean {
    return Boolean(this.endpoint) && this.credentialPresent();
  }

  getCapabilities(): string[] {
    return [...this.caps, ...(this.configured() ? [] : ["not-configured"])];
  }

  async getMetadata(_context: ToolInvocationContext): Promise<Record<string, unknown>> {
    return {
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      providerId: this.id,
      providerName: this.providerName,
      kind: this.kind,
      mode: this.mode,
      configured: this.configured(),
      credentialSource: `env:${this.credentialEnvVar}`,
      generativeInference: this.configured(),
    };
  }

  async health(_context: ToolInvocationContext): Promise<AIProviderHealth> {
    return {
      ok: this.configured(),
      detail: this.configured()
        ? "Generative adapter is configured. Reachability must be proven by a non-sensitive smoke test."
        : "Generative adapter is NOT_CONFIGURED: endpoint/credential absent. Fail-closed.",
      mode: this.mode,
      configured: this.configured(),
      reachable: null,
      checkedAt: new Date().toISOString(),
    };
  }

  async capabilities(_context: ToolInvocationContext): Promise<AIModelCapabilities> {
    return {
      capabilities: this.getCapabilities(),
      modalities: [this.modality],
      supportsStreaming: false,
      supportsEmbeddings: false,
      supportsToolCalls: false,
      contextWindow: this.contextWindow,
    };
  }

  async normalizedMetadata(context: ToolInvocationContext): Promise<AIModelMetadata> {
    const capabilities = await this.capabilities(context);
    return {
      ...capabilities,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      providerId: this.id,
      providerName: this.providerName,
      kind: this.kind,
      mode: this.mode,
      generativeInference: this.configured(),
      deploymentType: this.deploymentType,
      dataResidency: this.dataResidency,
      version: this.modelVersion,
    };
  }

  async healthCheck(context: ToolInvocationContext): Promise<{ ok: boolean; detail: string }> {
    const report = await this.health(context);
    return { ok: report.ok, detail: report.detail };
  }

  async generate(_request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    // Always fail closed when not configured; even when configured, the
    // gateway must also verify registry approval, so this never fabricates.
    return {
      requestId: _request.requestId,
      routingId: _request.routingId,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      providerId: this.id,
      providerName: this.providerName,
      modelKind: this.kind,
      status: this.configured() ? "BLOCKED" : "NOT_SUPPORTED",
      output: null,
      error: this.configured()
        ? "GENERATIVE_ADAPTER_CONFIGURED_BUT_NOT_REGISTERED_APPROVED: approve the model/provider in the registry and activate it before use."
        : "GENERATIVE_INFERENCE_BLOCKED: endpoint/credential are not configured in this environment.",
      metadata: { configured: this.configured(), credentialSource: `env:${this.credentialEnvVar}` },
      executedAt: new Date().toISOString(),
    };
  }

  async execute(_request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    // A generative adapter does not implement the deterministic execute path.
    return {
      requestId: _request.requestId,
      routingId: _request.routingId,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      providerId: this.id,
      providerName: this.providerName,
      modelKind: this.kind,
      status: "NOT_SUPPORTED",
      output: null,
      error: "GENERATIVE_ADAPTER_HAS_NO_DETERMINISTIC_EXECUTE_PATH.",
      metadata: {},
      executedAt: new Date().toISOString(),
    };
  }

  async run(request: AIModelRequest): Promise<AIModelResponse> {
    if (!this.configured()) {
      return {
        requestId: request.requestId,
        routingId: request.routingId,
        modelId: this.modelId,
        modelVersion: this.modelVersion,
        providerId: this.id,
        providerName: this.providerName,
        modelKind: this.kind,
        status: "NOT_SUPPORTED",
        output: null,
        error: "GENERATIVE_INFERENCE_BLOCKED: endpoint/credential are not configured in this environment.",
        usage: null,
        finishReason: "BLOCKED",
        safety: { blocked: true, reasons: ["Generative runtime not configured."] },
        metadata: { configured: false },
        executedAt: new Date().toISOString(),
      };
    }
    // When a real endpoint + credential are mounted, this is the real path.
    // The endpoint is not a secret; the credential is only resolved here from
    // the environment at call time and is never logged or persisted.
    const endpointUrl = `${this.endpoint!.replace(/\/$/, "")}/chat/completions`;
    const credential = process.env[this.credentialEnvVar];
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.authScheme === "bearer" && credential) headers.authorization = `Bearer ${credential}`;
    if (this.authScheme === "api-key-header" && credential) headers["x-api-key"] = credential;
    try {
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.modelId,
          messages: [{ role: "system", content: request.systemPolicy ?? "You are a governed enterprise assistant." }, { role: "user", content: request.prompt }],
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 1024,
          stream: request.streaming ?? false,
        }),
      });
      if (!response.ok) {
        return {
          ...this.blockedFrom(request, `Provider returned HTTP ${response.status}.`),
          finishReason: "BLOCKED",
          safety: { blocked: true, reasons: [`HTTP ${response.status}`] },
        };
      }
      const body = (await response.json()) as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      return {
        requestId: request.requestId,
        routingId: request.routingId,
        modelId: this.modelId,
        modelVersion: this.modelVersion,
        providerId: this.id,
        providerName: this.providerName,
        modelKind: this.kind,
        status: "COMPLETED",
        output: { text, content: text, generativeInference: true },
        error: null,
        usage: {
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
          totalTokens: body.usage?.total_tokens ?? 0,
          inferenceCount: 1,
        },
        finishReason: (body.choices?.[0]?.finish_reason as AIFinishReason | undefined) ?? "UNKNOWN",
        safety: { blocked: false, reasons: [] },
        metadata: { generativeInference: true, configured: true },
        executedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        ...this.blockedFrom(request, `Provider unreachable or malformed: ${String((err as Error)?.message ?? err)}`),
        finishReason: "BLOCKED",
        safety: { blocked: true, reasons: ["Provider unreachable."] },
      };
    }
  }

  private blockedFrom(request: AIModelRequest, message: string): AIModelResponse {
    return {
      requestId: request.requestId,
      routingId: request.routingId,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      providerId: this.id,
      providerName: this.providerName,
      modelKind: this.kind,
      status: "FAIL_CLOSED",
      output: null,
      error: message,
      usage: null,
      finishReason: "BLOCKED",
      safety: { blocked: true, reasons: [message] },
      metadata: { configured: true },
      executedAt: new Date().toISOString(),
    };
  }

  async stream(_request: ModelExecutionRequest): Promise<never> {
    throw new Error("NOT_SUPPORTED: streaming is not enabled for this adapter yet.");
  }

  async embed(_request: ModelExecutionRequest): Promise<never> {
    throw new Error("NOT_SUPPORTED: embeddings are not enabled for this adapter yet.");
  }
}

/**
 * The model-runtime plan passed from the runtime to the gateway.
 * Keeping this as a small immutable object makes the "routing decision is
 * authoritative" property explicit at the execution boundary.
 */
export type GovernedModelRoute = {
  decision: "SELECTED" | "DENIED" | "FAIL_CLOSED";
  selectedModelId: string | null;
  selectedProviderId: string | null;
  routingId: string;
  requestId: string;
  reasons: string[];
};

export function toGovernedRoute(verdict: NoeliaRouteVerdict): GovernedModelRoute {
  return {
    decision: verdict.decision,
    selectedModelId: verdict.selectedModelId,
    selectedProviderId: verdict.selectedProviderId,
    routingId: verdict.routingId,
    requestId: verdict.requestId,
    reasons: verdict.reasons,
  };
}

export type NoeliaTargetedRouteRequest = {
  requestId: string;
  tenantId: string;
  legalEntityId: NoeliaTargetContext["legalEntityId"];
  countryCode: NoeliaTargetContext["countryCode"];
  osId: string | null;
  task: string;
  capability: string;
  classification: Classification;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

export const GENERATIVE_MODEL_RUNTIME_REQUIREMENT =
  "A BEYU-owned, self-hosted, approved open-weight or activated external model runtime with a real inference endpoint, hardened model card, evaluation evidence and accountable activation.";
