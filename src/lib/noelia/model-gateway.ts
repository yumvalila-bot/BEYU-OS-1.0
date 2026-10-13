import { asc, eq } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { modelRegistry, noeliaKillSwitch } from "@/db/schema";
import { classificationRank } from "@/lib/constants";
import {
  BeyuDeterministicAnalystProvider,
  type AIModelProvider,
  type AIModelResponse,
  type GovernedModelRoute,
  type ModelExecutionRequest,
  type ModelExecutionResult,
} from "./model-provider";
import { BeyuOllamaProvider } from "./ollama-provider";
import { resolveOllamaRuntimeConfig, type OllamaRuntimeConfig } from "./ollama-config";
import type { NoeliaRouteRequest } from "./ai-platform";
import type { NoeliaToolOutput, ToolInvocationContext } from "./types";

/**
 * Governed Model Gateway (section 19 of the Noelia capability target).
 *
 * HIVE remains the governed runtime boundary. No uncontrolled external LLM
 * provider is invoked: the gateway only exposes APPROVED models from the
 * governed registry, each with capability metadata, data-classification
 * limits, jurisdiction restrictions, timeout, retry policy, circuit breaker
 * and cost/token accounting fields.
 *
 * Until an external provider is registered AND activated by an accountable
 * human, execution remains deterministic/internal (the HIVE analyst
 * "beyu-hive-deterministic-analyst"). Retrieval of the registry is read-only;
 * provider activation is a governed write that requires authority.
 *
 * MOUNTING AN ADAPTER IS NOT AN ACTIVATION. The Ollama adapter is only mounted
 * when NOELIA_MODEL_PROVIDER=OLLAMA is explicitly configured server-side, and
 * even then it is unreachable unless the routing decision (which reads the
 * governed registry) selects it for an ACTIVE/APPROVED model. The existing
 * deterministic analyst remains the default runtime.
 */

/**
 * The default governed runtime adapter set.
 *
 * The deterministic analyst is always mounted. The Ollama adapter is mounted
 * ONLY when the operator explicitly selected it, so listing/health surfaces can
 * report its real status (CONFIGURED/NOT_CONNECTED/…) instead of hiding it.
 */
export function defaultGovernedModelProviders(env: NodeJS.ProcessEnv = process.env): AIModelProvider[] {
  const providers: AIModelProvider[] = [new BeyuDeterministicAnalystProvider()];
  const ollamaConfig = resolveOllamaRuntimeConfig(env);
  if (ollamaConfig.enabled) providers.push(new BeyuOllamaProvider(ollamaConfig));
  return providers;
}

/** A governed prompt for a generative runtime. Never derived from a route label. */
export type GovernedGenerativePrompt = {
  /** Fixed control-plane policy text. Defaulted by the adapter when absent. */
  systemPolicy?: string | null;
  /** The requesting human's own authorised request. Untrusted DATA, not policy. */
  userPrompt: string;
  temperature?: number | null;
  maxTokens?: number | null;
};

export type GovernedGatewayOptions = {
  providers?: AIModelProvider[];
  /** Configuration for the mounted Ollama runtime (defaults to the environment). */
  ollamaConfig?: OllamaRuntimeConfig | null;
};

export class BeyuNoeliaModelGateway {
  private readonly providers: Map<string, AIModelProvider>;
  private readonly ollamaConfig: OllamaRuntimeConfig | null;

  constructor(options?: AIModelProvider[] | GovernedGatewayOptions) {
    // Backwards compatible: the original constructor took an optional provider array.
    const resolved: GovernedGatewayOptions = Array.isArray(options) ? { providers: options } : options ?? {};
    this.providers = new Map((resolved.providers ?? defaultGovernedModelProviders()).map((provider) => [provider.id, provider]));
    this.ollamaConfig = resolved.ollamaConfig ?? resolveOllamaRuntimeConfig();
  }

  private requireContext(): void {
    if (!hasDatabaseTransactionContext()) {
      throw new Error("Noelia model gateway requires canonical transaction-scoped tenant context");
    }
  }

  /** Whether an explicitly-configured Ollama runtime is mounted (NOT an activation). */
  ollamaRuntimeMounted(): boolean {
    return [...this.providers.values()].some((provider) => provider instanceof BeyuOllamaProvider);
  }

  /** Provider-neutral surface: list the registered model runtimes. */
  async listProviders(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const rows = [...this.providers.values()];
    const statuses = await Promise.all(
      rows.map(async (provider) => {
        if (typeof provider.providerStatus !== "function") return null;
        try {
          return await provider.providerStatus(context);
        } catch {
          return null;
        }
      }),
    );
    return {
      headline: `${rows.length} model runtime adapter(s) registered.`,
      findings: rows.map((provider, index) => ({
        label: provider.providerName,
        value: `${provider.kind} · ${provider.getCapabilities().join(", ")}${statuses[index] ? ` · ${statuses[index]!.status}` : ""}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((provider) => ({
        kind: "MODEL_RUNTIME",
        ref: provider.id,
        label: provider.providerName,
        authority: "MODEL_GATEWAY",
      })),
      narrative:
        "Adapters are implementations, not activations. Generative runtimes remain BLOCKED until a real runtime is available; the deterministic BEYU analyst is the first governed adapter. A reported provider status is evidence-based: configuration alone is CONFIGURED, never CONNECTED or VERIFIED.",
      confidence: 0.95,
      metadata: {
        adapters: rows.map((provider, index) => ({
          id: provider.id,
          providerName: provider.providerName,
          kind: provider.kind,
          mode: provider.mode,
          capabilities: provider.getCapabilities(),
          generativeInference: provider.kind !== "DETERMINISTIC_ANALYST",
          // Present only for adapters that report evidence-based status.
          providerStatus: statuses[index]?.status ?? null,
          providerStatusDetail: statuses[index]?.detail ?? null,
          providerStatusCheckedAt: statuses[index]?.checkedAt ?? null,
        })),
      },
    };
  }

  /**
   * Explicit execution of a governed, already-routed model.
   *
   * The routing decision is authoritative at this boundary. If the route was
   * not SELECTED, the gateway returns BLOCKED and never invokes a runtime.
   *
   * This is the deterministic surface: it is preserved exactly as-is so that a
   * deployment that has not selected a generative runtime behaves identically
   * to before. Generative execution goes through executeGoverned() with an
   * explicit governed prompt.
   */
  async executeRouted(
    context: ToolInvocationContext,
    route: GovernedModelRoute,
    request: Omit<NoeliaRouteRequest, "task" | "capability" | "classification" | "riskLevel"> & {
      task: string;
      capability: string;
      classification: NoeliaRouteRequest["classification"];
      riskLevel: NoeliaRouteRequest["riskLevel"];
      requestId: string;
      routingId: string;
    },
  ): Promise<ModelExecutionResult> {
    return this.executeGoverned(context, route, request, null);
  }

  /**
   * Governed execution with an optional generative prompt.
   *
   * When `generative` is supplied AND the routed provider is a real generative
   * runtime (configured, non-deterministic), the gateway invokes the provider's
   * normalized generative surface. Otherwise the deterministic surface runs
   * exactly as before. There is NO provider substitution and NO model fallback:
   * a failure returns FAIL_CLOSED for the routed provider only.
   */
  async executeGoverned(
    context: ToolInvocationContext,
    route: GovernedModelRoute,
    request: Omit<NoeliaRouteRequest, "task" | "capability" | "classification" | "riskLevel"> & {
      task: string;
      capability: string;
      classification: NoeliaRouteRequest["classification"];
      riskLevel: NoeliaRouteRequest["riskLevel"];
      requestId: string;
      routingId: string;
    },
    generative: GovernedGenerativePrompt | null,
  ): Promise<ModelExecutionResult> {
    this.requireContext();

    if (route.decision !== "SELECTED" || !route.selectedModelId) {
      return {
        requestId: request.requestId,
        routingId: request.routingId,
        modelId: "none",
        modelVersion: "none",
        providerId: null,
        providerName: null,
        modelKind: "UNKNOWN",
        status: "BLOCKED",
        output: null,
        error: route.reasons.join(" "),
        metadata: { blockedBy: "MODEL_ROUTE", reasons: route.reasons },
        executedAt: new Date().toISOString(),
      };
    }

    const providerId = route.selectedProviderId ?? null;
    const provider = providerId ? this.providers.get(providerId) : undefined;
    if (!provider) {
      return this.unavailable({ ...request, selectedModelId: route.selectedModelId ?? "none" }, route, providerId, `No registered model runtime for provider ${providerId ?? "none"}.`);
    }

    const [modelRow] = await db.select().from(modelRegistry).where(eq(modelRegistry.id, route.selectedModelId)).limit(1);
    if (!modelRow) {
      return this.unavailable({ ...request, selectedModelId: route.selectedModelId ?? "none" }, route, providerId, `Routed model ${route.selectedModelId} is not present in the governed registry.`);
    }
    if (modelRow.status !== "ACTIVE" || modelRow.approvalStatus !== "APPROVED" || modelRow.evaluationStatus !== "APPROVED") {
      return this.unavailable({ ...request, selectedModelId: route.selectedModelId ?? "none" }, route, providerId, `Routed model ${route.selectedModelId} is not ACTIVE/APPROVED/APPROVED.`);
    }

    const executionRequest: ModelExecutionRequest = {
      requestId: request.requestId,
      routingId: request.routingId,
      tenantId: request.tenantId,
      legalEntityId: request.legalEntityId,
      countryCode: request.countryCode,
      osId: request.osId ?? null,
      task: request.task,
      capability: request.capability,
      classification: request.classification,
      riskLevel: request.riskLevel,
      selectedModelId: route.selectedModelId,
      selectedProviderId: providerId,
      traceId: context.traceId,
    };

    const useGenerative = Boolean(generative) && provider.kind !== "DETERMINISTIC_ANALYST" && provider.mode !== "DETERMINISTIC" && provider.mode !== "NOT_CONFIGURED";

    if (!useGenerative) {
      // Backwards-compatible deterministic surface.
      try {
        const result = await provider.execute(executionRequest);
        return { ...result, modelKind: provider.kind };
      } catch (err) {
        return {
          requestId: request.requestId,
          routingId: request.routingId,
          modelId: modelRow.id,
          modelVersion: modelRow.version,
          providerId,
          providerName: provider.providerName,
          modelKind: provider.kind,
          status: "FAIL_CLOSED",
          output: null,
          error: String((err as Error)?.message ?? err),
          metadata: { blockedBy: "MODEL_RUNTIME_ERROR" },
          executedAt: new Date().toISOString(),
        };
      }
    }

    // ---- Governed generative surface -------------------------------------
    // Kill switch: an inference runtime that is switched off is never called.
    // `ai-platform.route()` honours ALL/AI_IDENTITY/TENANT/CAPABILITY switches;
    // the generative path additionally honours MODEL/PROVIDER/TASK switches at
    // this boundary, using the established blocking semantics of
    // model-operations.resolveGovernedFallback(). A kill switch stops
    // capability; it never deletes or rewrites evidence.
    const killSwitches = await db.select().from(noeliaKillSwitch).where(eq(noeliaKillSwitch.enabled, true));
    const blockedRefs = new Set(killSwitches.map((entry) => `${entry.targetType}:${entry.targetRef}`));
    const killSwitchHits: string[] = [];
    const refs: Array<[string, string | null | undefined]> = [
      ["MODEL", route.selectedModelId],
      ["PROVIDER", providerId],
      ["CAPABILITY", request.capability],
      ["TASK", request.task],
    ];
    for (const [type, ref] of refs) {
      if (!ref) continue;
      if (blockedRefs.has(`ALL:*`) || blockedRefs.has(`ALL:${ref}`) || blockedRefs.has(`${type}:${ref}`) || blockedRefs.has(`${type}:*`)) {
        killSwitchHits.push(`${type}:${ref}`);
      }
    }
    if (killSwitchHits.length > 0) {
      return {
        requestId: request.requestId,
        routingId: request.routingId,
        modelId: modelRow.id,
        modelVersion: modelRow.version,
        providerId,
        providerName: provider.providerName,
        modelKind: provider.kind,
        status: "FAIL_CLOSED",
        output: null,
        error: `GOVERNED_MODEL_KILL_SWITCH: ${killSwitchHits.join(", ")}.`,
        safety: { blocked: true, reasons: killSwitchHits },
        metadata: { blockedBy: "KILL_SWITCH", killSwitchHits },
        executedAt: new Date().toISOString(),
      };
    }

    // Defence in depth: the classification ceiling is re-checked here, before
    // the adapter is invoked, so a misconfigured adapter can never widen it.
    if (this.ollamaConfig && classificationRank(request.classification) > classificationRank(this.ollamaConfig.maxClassification)) {
      return {
        requestId: request.requestId,
        routingId: request.routingId,
        modelId: modelRow.id,
        modelVersion: modelRow.version,
        providerId,
        providerName: provider.providerName,
        modelKind: provider.kind,
        status: "DENIED",
        output: null,
        error: `GOVERNED_MODEL_CLASSIFICATION_LIMIT: ${request.classification} exceeds the configured runtime ceiling ${this.ollamaConfig.maxClassification}.`,
        safety: { blocked: true, reasons: ["classification-limit"] },
        metadata: { blockedBy: "MODEL_GATEWAY", ceiling: this.ollamaConfig.maxClassification },
        executedAt: new Date().toISOString(),
      };
    }

    try {
      const response = await provider.run({
        ...executionRequest,
        prompt: generative!.userPrompt,
        systemPolicy: generative!.systemPolicy ?? undefined,
        temperature: generative!.temperature ?? null,
        maxTokens: generative!.maxTokens ?? null,
        streaming: false,
      });
      return this.fromGenerativeResponse(response, provider, { modelId: modelRow.id, modelVersion: modelRow.version });
    } catch (err) {
      return {
        requestId: request.requestId,
        routingId: request.routingId,
        modelId: modelRow.id,
        modelVersion: modelRow.version,
        providerId,
        providerName: provider.providerName,
        modelKind: provider.kind,
        status: "FAIL_CLOSED",
        output: null,
        // A runtime exception is reported as a stable code, never as raw text
        // that could carry internal detail to an end user.
        error: "GOVERNED_MODEL_RUNTIME_ERROR: the generative runtime failed.",
        safety: { blocked: true, reasons: ["runtime-error"] },
        metadata: { blockedBy: "MODEL_RUNTIME_ERROR", errorName: (err as Error)?.name ?? "Error" },
        executedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Map the normalized generative response onto the execution result contract.
   *
   * `modelId`/`modelVersion` are the GOVERNED REGISTRY identity that was routed
   * and approved — the same identity the routing ledger and the AI decision
   * evidence record. The runtime's own reported tag is retained in metadata as
   * `runtimeModelId`, so a runtime that reports a different artifact is visible
   * in evidence instead of being silently accepted as the approved model.
   */
  private fromGenerativeResponse(
    response: AIModelResponse,
    provider: AIModelProvider,
    governedModel: { modelId: string; modelVersion: string },
  ): ModelExecutionResult {
    return {
      requestId: response.requestId,
      routingId: response.routingId,
      modelId: governedModel.modelId,
      modelVersion: governedModel.modelVersion,
      providerId: response.providerId,
      providerName: response.providerName,
      modelKind: provider.kind,
      status: response.status,
      output: response.output,
      error: response.error,
      usage: response.usage,
      finishReason: response.finishReason,
      safety: response.safety,
      metadata: {
        ...response.metadata,
        governedGenerativePath: true,
        runtimeModelId: response.modelId,
        runtimeModelVersion: response.modelVersion,
      },
      executedAt: response.executedAt,
    };
  }


  private unavailable(
    request: {
      requestId: string;
      routingId: string;
      selectedModelId: string;
    },
    _route: GovernedModelRoute,
    providerId: string | null,
    error: string,
  ): ModelExecutionResult {
    return {
      requestId: request.requestId,
      routingId: request.routingId,
      modelId: request.selectedModelId,
      modelVersion: "unknown",
      providerId,
      providerName: null,
      modelKind: "UNKNOWN",
      status: "FAIL_CLOSED",
      output: null,
      error,
      metadata: { blockedBy: "MODEL_GATEWAY" },
      executedAt: new Date().toISOString(),
    };
  }


  async registry(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const rows = await db
      .select()
      .from(modelRegistry)
      .orderBy(asc(modelRegistry.provider), asc(modelRegistry.model));

    if (rows.length === 0) {
      return {
        headline: "Model registry is EMPTY: only the deterministic internal HIVE analyst is available.",
        findings: [{
          label: "Approved models",
          value: "beyu-hive-deterministic-analyst (internal, deterministic)",
          kind: "FACT",
          status: "OBSERVED",
        }],
        narrative:
          "No external model provider is registered or activated. Noelia executes deterministically inside the HIVE boundary; no BEYU data leaves the approved execution boundary.",
        confidence: 0.95,
        metadata: {
          externalProviders: [],
          deterministicOnly: true,
        },
      };
    }

    return {
      headline: `${rows.length} model registry record(s).`,
      findings: rows.map((row) => ({
        label: `${row.provider} · ${row.model}@${row.version}`,
        value: `status ${row.status} · max classification ${row.maxClassification}${row.jurisdictionRestrictions.length ? ` · jurisdictions ${row.jurisdictionRestrictions.join(",")}` : ""}`,
        kind: "FACT",
        status: "OBSERVED",
      })),
      sources: rows.map((row) => ({
        kind: "MODEL_REGISTRY",
        ref: row.id,
        label: `${row.provider}/${row.model}@${row.version}`,
        authority: "MODEL_GATEWAY",
      })),
      metadata: {
        models: rows.map((row) => ({
          id: row.id,
          provider: row.provider,
          model: row.model,
          version: row.version,
          status: row.status,
          maxClassification: row.maxClassification,
          jurisdictionRestrictions: row.jurisdictionRestrictions,
          timeoutMs: row.timeoutMs,
          costPerToken: row.costPerToken,
          latencyMs: row.latencyMs,
          fallbackModelId: row.fallbackModelId,
          effectiveFrom: row.effectiveFrom,
          retiredAt: row.retiredAt,
        })),
      },
      narrative:
        "The registry lists approved models; activation of an external provider remains a governed human decision. Until then execution is deterministic and internal.",
      confidence: 0.9,
    };
  }
}
