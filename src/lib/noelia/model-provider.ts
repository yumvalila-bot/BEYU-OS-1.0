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
  metadata: Record<string, unknown>;
  executedAt: string;
};

/** The canonical provider-neutral adapter surface. */
export interface AIModelProvider {
  readonly id: string;
  readonly providerName: string;
  readonly kind: AIModelKind;
  getCapabilities(): string[];
  getMetadata(context: ToolInvocationContext): Promise<Record<string, unknown>>;
  healthCheck(context: ToolInvocationContext): Promise<{ ok: boolean; detail: string }>;
  /** Generative execution surface (BLOCKED until a real runtime is available). */
  generate(request: ModelExecutionRequest): Promise<ModelExecutionResult>;
  /** Deterministic/governed execution surface used by the first real adapter. */
  execute(request: ModelExecutionRequest): Promise<ModelExecutionResult>;
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
      generativeInference: false,
      supported: false,
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
      metadata: { generativeInference: false, required: GENERATIVE_MODEL_RUNTIME_REQUIREMENT },
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
