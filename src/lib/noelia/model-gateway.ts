import { asc, eq } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { modelRegistry } from "@/db/schema";
import { BeyuDeterministicAnalystProvider, type AIModelProvider, type GovernedModelRoute, type ModelExecutionRequest, type ModelExecutionResult } from "./model-provider";
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
 */
export class BeyuNoeliaModelGateway {
  private readonly providers: Map<string, AIModelProvider>;

  constructor(providers?: AIModelProvider[]) {
    this.providers = new Map((providers ?? [new BeyuDeterministicAnalystProvider()]).map((provider) => [provider.id, provider]));
  }

  private requireContext(): void {
    if (!hasDatabaseTransactionContext()) {
      throw new Error("Noelia model gateway requires canonical transaction-scoped tenant context");
    }
  }

  /** Provider-neutral surface: list the registered model runtimes. */
  async listProviders(_context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const rows = [...this.providers.values()];
    return {
      headline: `${rows.length} model runtime adapter(s) registered.`,
      findings: rows.map((provider) => ({
        label: provider.providerName,
        value: `${provider.kind} · ${provider.getCapabilities().join(", ")}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((provider) => ({
        kind: "MODEL_RUNTIME",
        ref: provider.id,
        label: provider.providerName,
        authority: "MODEL_GATEWAY",
      })),
      narrative:
        "Adapters are implementations, not activations. Generative runtimes remain BLOCKED until a real runtime is available; the deterministic BEYU analyst is the first governed adapter.",
      confidence: 0.95,
      metadata: {
        adapters: rows.map((provider) => ({
          id: provider.id,
          providerName: provider.providerName,
          kind: provider.kind,
          capabilities: provider.getCapabilities(),
          generativeInference: provider.kind !== "DETERMINISTIC_ANALYST",
        })),
      },
    };
  }

  /**
   * Explicit execution of a governed, already-routed model.
   *
   * The routing decision is authoritative at this boundary. If the route was
   * not SELECTED, the gateway returns BLOCKED and never invokes a runtime.
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

    try {
      const result = await provider.execute(executionRequest);
      return {
        ...result,
        modelKind: provider.kind,
      };
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
