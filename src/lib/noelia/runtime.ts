import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { type Classification, isKnownClassification } from "@/lib/constants";
import { parseHorizon, synthesizeExecutiveBriefing, type BriefingInputs } from "./executive";
import { NoeliaToolRegistry } from "./tool-registry";
import { BeyuNoeliaAiPlatformService, type NoeliaRouteVerdict } from "./ai-platform";
import { type ModelExecutionResult, toGovernedRoute, type NoeliaTargetedRouteRequest } from "./model-provider";
import { BeyuNoeliaModelGateway } from "./model-gateway";
import type {
  NoeliaAnalysisType,
  NoeliaAnswer,
  NoeliaAuthorizedScope,
  NoeliaBriefingStructure,
  NoeliaEngine,
  NoeliaEvidencePort,
  NoeliaExecutiveBriefing,
  NoeliaPolicyPort,
  NoeliaTargetContext,
  NoeliaToolOutput,
  ToolInvocationContext,
} from "./types";

export const ENGINE_TOOLS: Record<NoeliaEngine, readonly string[]> = {
  FINANCIAL: [
    "finance.treasury.aggregate",
    "finance.capital.pipeline",
    "finance.waterfall.latest",
    "finance.cash.position",
    "finance.reconciliation.status",
  ],
  RISK: ["risk.register.query", "risk.analysis"],
  COMPLIANCE: ["compliance.obligation.query", "compliance.analysis"],
  GOVERNANCE: ["governance.resolution.query"],
  TAX: ["tax.knowledge.query"],
  LEGAL: ["legal.knowledge.query", "legal.authority.status"],
  WORKFORCE: ["hcm.employee.aggregate", "hcm.workforce.observe", "hcm.organization.structure"],
  HEALTH: ["health.runtime.status"],
  KNOWLEDGE: ["knowledge.rag.search"],
  EXECUTIVE: [
    "finance.treasury.aggregate",
    "finance.capital.pipeline",
    "finance.waterfall.latest",
    "finance.cash.position",
    "risk.register.query",
    "compliance.obligation.query",
    "governance.resolution.query",
    "governance.strategic.objectives",
    "hcm.workforce.observe",
    "health.runtime.status",
    "knowledge.rag.search",
  ],
  ANALYTICS: ["analytics.run"],
  CROSS_OS: ["cross.os.intelligence"],
};

/** Intent routing is deterministic, inspectable and cannot select an arbitrary tool. */
export function routeEngine(question: string): NoeliaEngine {
  const value = question.toLowerCase();
  if (/tax|vat|withhold|tra |deduction|capital allowance/.test(value)) return "TAX";
  if (/legal|statute|statutory|regulation s\.|authority status|citation|court/.test(value)) return "LEGAL";
  if (/risk|threat|exposure|incident/.test(value)) return "RISK";
  if (/complian|regulat|gdpr|obligation|audit finding/.test(value)) return "COMPLIANCE";
  if (/resolution|board|governance|approval|policy/.test(value)) return "GOVERNANCE";
  if (/employee|workforce|headcount|hcm|staff|payroll|turnover/.test(value)) return "WORKFORCE";
  if (/health|clinical|patient|medical/.test(value)) return "HEALTH";
  if (/cash|revenue|capital|treasury|waterfall|liquidity|financ|distribut/.test(value)) return "FINANCIAL";
  if (/cross[- ]os|across (the )?(group|enterprise)|correlation/.test(value)) return "CROSS_OS";
  return "KNOWLEDGE";
}

function defaultNarrative(engine: NoeliaEngine): string {
  switch (engine) {
    case "FINANCIAL":
      return "Finance OS remains authoritative for every financial consequence; intelligence does not authorize posting, allocation or settlement.";
    case "RISK":
      return "Risk acceptance, closure and treatment changes remain accountable-human decisions.";
    case "COMPLIANCE":
      return "Compliance is not inferred without confirmed evidence and jurisdiction-specific review.";
    case "GOVERNANCE":
      return "Noelia can summarize evidence but cannot vote, approve or record a governance outcome.";
    case "TAX":
      return "Tax intelligence is jurisdiction-bound and requires accountable Tax Governance review.";
    case "LEGAL":
      return "Legal intelligence is jurisdiction-bound; unknown authority fails closed and advice remains with counsel.";
    case "WORKFORCE":
      return "HCM remains the only workforce master; Noelia cannot create employment consequences.";
    case "HEALTH":
      return "Noelia never diagnoses, prescribes, orders treatment or makes binding clinical decisions.";
    default:
      return "Only authoritative, in-window knowledge within the principal's scope and clearance is eligible for retrieval.";
  }
}

function defaultHeadline(engine: NoeliaEngine): string {
  const labels: Record<NoeliaEngine, string> = {
    FINANCIAL: "Authorized Finance OS evidence assembled.",
    RISK: "Authorized risk evidence assembled.",
    COMPLIANCE: "Authorized compliance evidence assembled.",
    GOVERNANCE: "Authorized governance evidence assembled.",
    TAX: "Authorized tax intelligence assembled.",
    LEGAL: "Authorized legal intelligence assembled.",
    WORKFORCE: "Authorized HCM evidence assembled.",
    HEALTH: "Health OS integration status.",
    KNOWLEDGE: "Governed enterprise knowledge searched.",
    EXECUTIVE: "Executive briefing assembled.",
    ANALYTICS: "Governed analytics assembled.",
    CROSS_OS: "Cross-OS intelligence assembled.",
  };
  return labels[engine];
}

function outputClassFor(engine: NoeliaEngine, hasSources: boolean): NoeliaAnswer["outputClass"] {
  if (engine === "TAX" || engine === "LEGAL" || engine === "HEALTH") return "REQUIRES_HUMAN_REVIEW";
  if (engine === "RISK") return "RECOMMENDATION";
  if (engine === "FINANCIAL") return "INFERENCE";
  if (engine === "KNOWLEDGE" && !hasSources) return "UNCERTAINTY";
  return "FACT";
}

export type NoeliaModelPorts = {
  router: BeyuNoeliaAiPlatformService;
  gateway: BeyuNoeliaModelGateway;
};

export class NoeliaRuntime {
  constructor(
    private readonly tools: NoeliaToolRegistry,
    private readonly policy: NoeliaPolicyPort,
    private readonly evidence: NoeliaEvidencePort,
    private readonly modelPorts?: NoeliaModelPorts,
  ) {}

  /** Shared tool plan execution for a given engine. */
  private async executePlan(
    input: {
      principal: Principal;
      question: string;
      traceId: string;
      target: NoeliaTargetContext;
      scope: NoeliaAuthorizedScope;
    },
    engine: NoeliaEngine,
    plan: readonly string[],
  ): Promise<{
    policy: Awaited<ReturnType<NoeliaPolicyPort["evaluate"]>>;
    findings: NoeliaAnswer["findings"];
    sources: NoeliaAnswer["sources"];
    outputs: NoeliaToolOutput[];
    toolsUsed: string[];
    deniedScopes: string[];
  }> {
    const policy = await this.policy.evaluate({ principal: input.principal, target: input.target });
    const findings: NoeliaAnswer["findings"] = [];
    const sources: NoeliaAnswer["sources"] = [];
    const deniedScopes: string[] = [];
    const toolsUsed: string[] = [];
    const outputs: NoeliaToolOutput[] = [];

    if (policy.effect !== "DENY") {
      const invocationContext: ToolInvocationContext = {
        principal: input.principal,
        traceId: input.traceId,
        target: input.target,
        scope: input.scope,
        approval: null,
      };
      const plannedTools = [...plan];
      if (engine !== "KNOWLEDGE") plannedTools.push("knowledge.rag.search");

      for (const toolName of plannedTools) {
        try {
          const result = await this.tools.invoke(toolName, invocationContext, { question: input.question });
          if (!result.allowed) {
            deniedScopes.push(`${toolName}:${result.decision.code}`);
            continue;
          }
          toolsUsed.push(toolName);
          outputs.push(result.output);
          findings.push(...(result.output.findings ?? []));
          sources.push(...(result.output.sources ?? []));
        } catch (err) {
          const timeout = err instanceof Error && err.name === "NoeliaToolTimeoutError";
          deniedScopes.push(`${toolName}:${timeout ? "TIMEOUT" : "ERROR"}`);
        }
      }
    }
    return { policy, findings, sources, outputs, toolsUsed, deniedScopes };
  }

  private opt(value: string | null | undefined): string | undefined {
    return value ?? undefined;
  }

  private capabilityFor(engine: NoeliaEngine): string {
    switch (engine) {
      case "FINANCIAL": return "finance-intelligence";
      case "RISK": return "risk-intelligence";
      case "COMPLIANCE": return "compliance-intelligence";
      case "GOVERNANCE": return "governance-intelligence";
      case "TAX": return "tax-intelligence";
      case "LEGAL": return "legal-intelligence";
      case "WORKFORCE": return "workforce-intelligence";
      case "HEALTH": return "health-intelligence";
      case "KNOWLEDGE": return "knowledge-intelligence";
      case "EXECUTIVE": return "executive-intelligence";
      case "ANALYTICS": return "analytics-intelligence";
      case "CROSS_OS": return "cross-os-intelligence";
      default: return "noelia-governed-analysis";
    }
  }

  private classificationFor(principal: Principal): Classification {
    return isKnownClassification(principal.clearance) ? principal.clearance : "INTERNAL";
  }

  private riskLevelFor(engine: NoeliaEngine): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (engine === "LEGAL" || engine === "TAX" || engine === "HEALTH") return "MEDIUM";
    if (engine === "RISK" || engine === "COMPLIANCE" || engine === "GOVERNANCE") return "MEDIUM";
    return "LOW";
  }

  /**
   * Phase 2: the routing decision is authoritative before any governed model
   * execution. If no model ports are injected (unit-test construction), the
   * runtime remains backward compatible and executes through tools only.
   */
  private async routeAndExecuteModel(
    input: {
      principal: Principal;
      traceId: string;
      target: NoeliaTargetContext;
      scope: NoeliaAuthorizedScope;
    },
    engine: NoeliaEngine,
    task: string,
    requestId?: string,
  ): Promise<{
    ok: boolean;
    route: NoeliaRouteVerdict | null;
    execution: ModelExecutionResult | null;
    denial: string | null;
    model: string | null;
    modelVersion: string | null;
    provider: string | null;
    modelKind: string | null;
    routingId: string | null;
  }> {
    if (!this.modelPorts) {
      return {
        ok: true,
        route: null,
        execution: null,
        denial: null,
        model: null,
        modelVersion: null,
        provider: null,
        modelKind: null,
        routingId: null,
      };
    }

    const context: ToolInvocationContext = {
      principal: input.principal,
      traceId: input.traceId,
      target: input.target,
      scope: input.scope,
      approval: null,
    };

    // AI authorization is evaluated BEFORE routing: a principal that cannot ask
    // Noelia for this intelligence domain never reaches the model router.
    const permissionForEngine: Record<NoeliaEngine, string> = {
      FINANCIAL: "ai:noelia.query",
      RISK: "ai:noelia.query",
      COMPLIANCE: "ai:noelia.query",
      GOVERNANCE: "ai:noelia.query",
      TAX: "ai:noelia.query",
      LEGAL: "ai:noelia.query",
      WORKFORCE: "ai:noelia.query",
      HEALTH: "ai:noelia.query",
      KNOWLEDGE: "ai:noelia.query",
      EXECUTIVE: "ai:executive.read",
      ANALYTICS: "ai:analytics.read",
      CROSS_OS: "ai:analytics.read",
    };
    const permission = permissionForEngine[engine] as Parameters<typeof can>[1];
    const authz = can(input.principal, permission);
    if (!authz.allowed) {
      return {
        ok: false,
        route: null,
        execution: null,
        denial: `AI authorization denied for ${permission}: ${authz.reason}`,
        model: null,
        modelVersion: null,
        provider: null,
        modelKind: null,
        routingId: null,
      };
    }

    const classification = this.classificationFor(input.principal);
    const routeRequest: NoeliaTargetedRouteRequest = {
      requestId: requestId ?? `REQ_${input.traceId}`,
      tenantId: input.target.tenantId,
      legalEntityId: input.target.legalEntityId,
      countryCode: input.target.countryCode,
      osId: null,
      task: task.slice(0, 200),
      capability: this.capabilityFor(engine),
      classification,
      riskLevel: this.riskLevelFor(engine),
    };

    const route = await this.modelPorts.router.route(context, routeRequest);
    if (route.decision !== "SELECTED") {
      return {
        ok: false,
        route,
        execution: null,
        denial: `Governed model route ${route.decision}: ${route.reasons.join(" ")}`,
        model: null,
        modelVersion: null,
        provider: null,
        modelKind: null,
        routingId: route.routingId,
      };
    }

    const governedRoute = toGovernedRoute(route);
    const execution = await this.modelPorts.gateway.executeRouted(context, governedRoute, {
      requestId: route.requestId,
      routingId: route.routingId,
      tenantId: input.target.tenantId,
      legalEntityId: input.target.legalEntityId,
      countryCode: input.target.countryCode,
      osId: null,
      task: task.slice(0, 200),
      capability: this.capabilityFor(engine),
      classification,
      riskLevel: this.riskLevelFor(engine),
    });

    if (execution.status !== "COMPLETED") {
      return {
        ok: false,
        route,
        execution,
        denial: `Governed model execution ${execution.status}: ${execution.error ?? "unknown runtime failure."}`,
        model: execution.modelId,
        modelVersion: execution.modelVersion,
        provider: execution.providerName,
        modelKind: execution.modelKind,
        routingId: execution.routingId,
      };
    }

    return {
      ok: true,
      route,
      execution,
      denial: null,
      model: execution.modelId,
      modelVersion: execution.modelVersion,
      provider: execution.providerName,
      modelKind: execution.modelKind,
      routingId: execution.routingId,
    };
  }

  private modelDeniedAnswer(
    engine: NoeliaEngine,
    denial: string,
    modelExecution: Awaited<ReturnType<NoeliaRuntime["routeAndExecuteModel"]>>,
  ): Omit<NoeliaAnswer, "decisionId" | "latencyMs"> {
    return {
      engine,
      outputClass: "UNCERTAINTY",
      headline: "Governed model execution blocked before the request could run.",
      findings: [],
      narrative: denial,
      sources: modelExecution.routingId ? [{
        kind: "AI_ROUTING_DECISION",
        ref: modelExecution.routingId,
        label: "blocked model route",
        authority: "NOELIA_AI_PLATFORM",
      }] : [],
      confidence: 1,
      humanReviewRequired: true,
      deniedScopes: [`model.route:${modelExecution.route?.decision ?? "BLOCKED"}`],
      policyDecision: "MODEL_ROUTE_DENIED",
      toolsUsed: [],
      requestId: this.opt(modelExecution.route?.requestId),
      model: this.opt(modelExecution.model),
      modelVersion: this.opt(modelExecution.modelVersion),
      provider: this.opt(modelExecution.provider),
      modelKind: this.opt(modelExecution.modelKind),
      routingDecisionId: this.opt(modelExecution.routingId),
      modelExecutionStatus: "DENIED",
      modelExecutionReason: denial,
    };
  }

  /** The governed query path (Phase 15 contract, preserved). */
  async ask(input: {
    principal: Principal;
    question: string;
    traceId: string;
    target: NoeliaTargetContext;
    scope: NoeliaAuthorizedScope;
  }): Promise<NoeliaAnswer> {
    const started = Date.now();
    const engine = routeEngine(input.question);
    const modelExecution = await this.routeAndExecuteModel(input, engine, input.question);
    if (!modelExecution.ok) {
      const answerWithoutIds = this.modelDeniedAnswer(engine, modelExecution.denial ?? "Model execution blocked.", modelExecution);
      const latencyMs = Date.now() - started;
      const decisionId = await this.evidence.recordDecision({
        principal: input.principal,
        traceId: input.traceId,
        question: input.question,
        engine,
        answer: answerWithoutIds,
        policy: {
          effect: "DENY",
          obligations: [],
          denials: [{
            policyCode: "MODEL_ROUTE",
            message: modelExecution.denial ?? "Model execution blocked.",
          }],
          appliedPolicies: [{ code: "MODEL_ROUTE", version: "2026.09", level: "PLATFORM" }],
        },
        target: input.target,
        latencyMs,
        requestId: answerWithoutIds.requestId,
        model: answerWithoutIds.model ?? undefined,
        modelVersion: answerWithoutIds.modelVersion ?? undefined,
        provider: answerWithoutIds.provider ?? undefined,
        modelKind: answerWithoutIds.modelKind ?? undefined,
        routingDecisionId: answerWithoutIds.routingDecisionId ?? undefined,
      });
      return { decisionId, latencyMs, ...answerWithoutIds };
    }

    const { policy, findings, sources, outputs, toolsUsed, deniedScopes } = await this.executePlan(input, engine, ENGINE_TOOLS[engine]);

    const uniqueSources = [...new Map(sources.map((source) => [`${source.kind}:${source.ref}`, source])).values()];
    const domainToolsUsed = toolsUsed.filter((tool) => tool !== "knowledge.rag.search");
    const completelyDenied = policy.effect === "DENY" ||
      (engine === "KNOWLEDGE" ? toolsUsed.length === 0 : domainToolsUsed.length === 0);
    const obligationsRequireHuman = policy.obligations.some((obligation) =>
      obligation.type === "HUMAN_REVIEW" || obligation.type === "APPROVAL");

    let headline = outputs.find((output) => output.headline)?.headline ?? defaultHeadline(engine);
    let narrative = outputs.find((output) => output.narrative)?.narrative ?? defaultNarrative(engine);
    let outputClass = outputClassFor(engine, uniqueSources.length > 0);
    let confidence = outputs.reduce((current, output) => Math.max(current, output.confidence ?? 0), 0.6);
    let humanReviewRequired = obligationsRequireHuman || outputs.some((output) => output.humanReviewRequired);

    if (policy.effect === "DENY") {
      headline = "Request blocked by enterprise policy.";
      narrative = policy.denials.map((denial) => `${denial.policyCode}: ${denial.message}`).join(" ") ||
        "The policy engine denied this AI request.";
      outputClass = "REQUIRES_HUMAN_REVIEW";
      confidence = 1;
      humanReviewRequired = true;
    } else if (completelyDenied) {
      headline = "Insufficient authority for this intelligence domain.";
      narrative = "Noelia operates only through registered capabilities within the requesting human's RBAC/ABAC scope.";
      outputClass = "REQUIRES_HUMAN_REVIEW";
      confidence = 1;
      humanReviewRequired = true;
    } else if (engine === "KNOWLEDGE" && uniqueSources.length === 0) {
      confidence = Math.min(confidence, 0.55);
    }

    const answerWithoutIds: Omit<NoeliaAnswer, "decisionId" | "latencyMs"> = {
      engine,
      outputClass,
      headline,
      findings,
      narrative,
      sources: uniqueSources,
      confidence,
      humanReviewRequired,
      deniedScopes,
      policyDecision: policy.effect,
      toolsUsed,
      requestId: this.opt(modelExecution.route?.requestId),
      model: this.opt(modelExecution.model),
      modelVersion: this.opt(modelExecution.modelVersion),
      provider: this.opt(modelExecution.provider),
      modelKind: this.opt(modelExecution.modelKind),
      routingDecisionId: this.opt(modelExecution.routingId),
    };
    const latencyMs = Date.now() - started;
    const decisionId = await this.evidence.recordDecision({
      principal: input.principal,
      traceId: input.traceId,
      question: input.question,
      engine,
      answer: answerWithoutIds,
      policy,
      target: input.target,
      latencyMs,
      requestId: answerWithoutIds.requestId,
      model: answerWithoutIds.model ?? undefined,
      modelVersion: answerWithoutIds.modelVersion ?? undefined,
      provider: answerWithoutIds.provider ?? undefined,
      modelKind: answerWithoutIds.modelKind ?? undefined,
      routingDecisionId: answerWithoutIds.routingDecisionId ?? undefined,
    });

    return { decisionId, latencyMs, ...answerWithoutIds };
  }

  /** Executive briefing path (section 6 + section 20 contract). */
  async brief(input: {
    principal: Principal;
    question: string;
    traceId: string;
    correlationId: string;
    target: NoeliaTargetContext;
    scope: NoeliaAuthorizedScope;
    horizon?: string | null;
    focus?: string | null;
    structure?: NoeliaBriefingStructure;
  }): Promise<NoeliaExecutiveBriefing> {
    const started = Date.now();
    const horizon = parseHorizon(input.horizon);
    const modelExecution = await this.routeAndExecuteModel(input, "EXECUTIVE", input.question);
    if (!modelExecution.ok) {
      const base = this.modelDeniedAnswer("EXECUTIVE", modelExecution.denial ?? "Model execution blocked.", modelExecution);
      const deniedBriefing: NoeliaExecutiveBriefing = {
        decisionId: "",
        latencyMs: 0,
        ...base,
        engine: "EXECUTIVE",
        analysisType: "EXECUTIVE_BRIEFING",
        horizon,
        structure: input.structure ?? "EXECUTIVE",
        summary: "",
        metrics: [],
        recommendations: [],
        observedFacts: [],
        derivedConclusions: [],
        forecasts: [],
        scenarios: [],
        enterprisePosition: [],
        strategicVariance: [],
        kpiInterpretation: [],
        materialItems: [],
        opportunities: [],
        recommendationComparison: [],
        whatIsMissing: [],
        requiresHumanDecision: [],
        deteriorating: [],
        improving: [],
        managementAttentionRequired: [],
        deniedSources: [],
        sources: base.sources ?? [],
        findings: [],
        traceId: input.traceId,
        correlationId: input.correlationId,
      };
      const latencyMs = Date.now() - started;
      const decisionId = await this.evidence.recordDecision({
        principal: input.principal,
        traceId: input.traceId,
        question: input.question || "Executive briefing",
        engine: "EXECUTIVE",
        answer: deniedBriefing,
        policy: {
          effect: "DENY",
          obligations: [],
          denials: [{ policyCode: "MODEL_ROUTE", message: modelExecution.denial ?? "Model execution blocked." }],
          appliedPolicies: [{ code: "MODEL_ROUTE", version: "2026.09", level: "PLATFORM" }],
        },
        target: input.target,
        latencyMs,
        requestId: deniedBriefing.requestId,
        model: deniedBriefing.model ?? undefined,
        modelVersion: deniedBriefing.modelVersion ?? undefined,
        provider: deniedBriefing.provider ?? undefined,
        modelKind: deniedBriefing.modelKind ?? undefined,
        routingDecisionId: deniedBriefing.routingDecisionId ?? undefined,
      });
      return { ...deniedBriefing, decisionId, latencyMs };
    }

    const { policy, findings, sources, outputs, toolsUsed, deniedScopes } = await this.executePlan(input, "EXECUTIVE", ENGINE_TOOLS.EXECUTIVE);

    const briefingInputs: BriefingInputs = {
      principal: input.principal,
      target: input.target,
      scope: input.scope,
      horizon,
      structure: input.structure,
      policy,
      toolOutputs: outputs,
      toolsUsed,
      deniedScopes,
      traceId: input.traceId,
      correlationId: input.correlationId,
      latencyMs: 0,
    };
    const synthesized = synthesizeExecutiveBriefing(briefingInputs);
    const latencyMs = Date.now() - started;

    const answerWithoutIds: Omit<NoeliaAnswer, "decisionId" | "latencyMs"> = {
      ...synthesized,
      requestId: this.opt(modelExecution.route?.requestId),
      model: this.opt(modelExecution.model),
      modelVersion: this.opt(modelExecution.modelVersion),
      provider: this.opt(modelExecution.provider),
      modelKind: this.opt(modelExecution.modelKind),
      routingDecisionId: this.opt(modelExecution.routingId),
    };
    const decisionId = await this.evidence.recordDecision({
      principal: input.principal,
      traceId: input.traceId,
      question: input.question || "Executive briefing",
      engine: "EXECUTIVE",
      answer: answerWithoutIds,
      policy,
      target: input.target,
      latencyMs,
      requestId: answerWithoutIds.requestId,
      model: answerWithoutIds.model ?? undefined,
      modelVersion: answerWithoutIds.modelVersion ?? undefined,
      provider: answerWithoutIds.provider ?? undefined,
      modelKind: answerWithoutIds.modelKind ?? undefined,
      routingDecisionId: answerWithoutIds.routingDecisionId ?? undefined,
    });

    return {
      decisionId,
      latencyMs,
      ...synthesized,
      findings,
      sources,
      requestId: answerWithoutIds.requestId,
      model: answerWithoutIds.model,
      modelVersion: answerWithoutIds.modelVersion,
      provider: answerWithoutIds.provider,
      modelKind: answerWithoutIds.modelKind,
      routingDecisionId: answerWithoutIds.routingDecisionId,
    };
  }

  /** Analytics path (sections 7–8). */
  async analyze(input: {
    principal: Principal;
    analysisType: NoeliaAnalysisType;
    traceId: string;
    correlationId: string;
    target: NoeliaTargetContext;
    scope: NoeliaAuthorizedScope;
    options?: Record<string, unknown>;
  }): Promise<NoeliaAnswer> {
    const started = Date.now();
    const policy = await this.policy.evaluate({ principal: input.principal, target: input.target });
    const modelExecution = await this.routeAndExecuteModel(input, "ANALYTICS", `analytics:${input.analysisType}`);
    if (!modelExecution.ok) {
      const base = this.modelDeniedAnswer("ANALYTICS", modelExecution.denial ?? "Model execution blocked.", modelExecution);
      const denied: NoeliaAnswer = {
        decisionId: "",
        latencyMs: Date.now() - started,
        ...base,
        analysisType: input.analysisType,
        analysisId: "",
        traceId: input.traceId,
        correlationId: input.correlationId,
      };
      denied.decisionId = await this.evidence.recordDecision({
        principal: input.principal,
        traceId: input.traceId,
        question: `analytics:${input.analysisType}`,
        engine: "ANALYTICS",
        answer: denied,
        policy: {
          effect: "DENY",
          obligations: [],
          denials: [{ policyCode: "MODEL_ROUTE", message: modelExecution.denial ?? "Model execution blocked." }],
          appliedPolicies: [{ code: "MODEL_ROUTE", version: "2026.09", level: "PLATFORM" }],
        },
        target: input.target,
        latencyMs: denied.latencyMs,
        requestId: denied.requestId,
        model: denied.model ?? undefined,
        modelVersion: denied.modelVersion ?? undefined,
        provider: denied.provider ?? undefined,
        modelKind: denied.modelKind ?? undefined,
        routingDecisionId: denied.routingDecisionId ?? undefined,
      });
      return denied;
    }

    const findings: NoeliaAnswer["findings"] = [];
    const sources: NoeliaAnswer["sources"] = [];
    const deniedScopes: string[] = [];
    const toolsUsed: string[] = [];
    const outputs: NoeliaToolOutput[] = [];

    if (policy.effect === "DENY") {
      const latencyMs = Date.now() - started;
      const denied: NoeliaAnswer = {
        decisionId: await this.evidence.recordDecision({
          principal: input.principal,
          traceId: input.traceId,
          question: `analytics:${input.analysisType}`,
          engine: "ANALYTICS",
          answer: {
            engine: "ANALYTICS",
            outputClass: "REQUIRES_HUMAN_REVIEW",
            headline: "Analytics request blocked by enterprise policy.",
            findings: [],
            narrative: policy.denials.map((d) => `${d.policyCode}: ${d.message}`).join(" ") || "The policy engine denied this analytics request.",
            sources: [],
            confidence: 1,
            humanReviewRequired: true,
            deniedScopes: [],
            policyDecision: "DENY",
            toolsUsed: [],
            analysisType: input.analysisType,
            analysisId: "",
          },
          policy,
          target: input.target,
          latencyMs,
        }),
        latencyMs,
        engine: "ANALYTICS",
        outputClass: "REQUIRES_HUMAN_REVIEW",
        headline: "Analytics request blocked by enterprise policy.",
        findings: [],
        narrative: policy.denials.map((d) => `${d.policyCode}: ${d.message}`).join(" ") || "The policy engine denied this analytics request.",
        sources: [],
        confidence: 1,
        humanReviewRequired: true,
        deniedScopes: [],
        policyDecision: "DENY",
        toolsUsed: [],
        analysisType: input.analysisType,
        analysisId: "",
      };
      return denied;
    }

    const context: ToolInvocationContext = {
      principal: input.principal,
      traceId: input.traceId,
      target: input.target,
      scope: input.scope,
      approval: null,
    };
    try {
      const result = await this.tools.invoke("analytics.run", context, {
        analysisType: input.analysisType,
        ...(input.options ?? {}),
      });
      if (!result.allowed) {
        deniedScopes.push(`analytics.run:${result.decision.code}`);
      } else {
        toolsUsed.push("analytics.run");
        outputs.push(result.output);
        findings.push(...(result.output.findings ?? []));
        sources.push(...(result.output.sources ?? []));
      }
    } catch {
      deniedScopes.push("analytics.run:ERROR");
    }

    const uniqueSources = [...new Map(sources.map((source) => [`${source.kind}:${source.ref}`, source])).values()];
    const completelyDenied = toolsUsed.length === 0;
    const latencyMs = Date.now() - started;
    const analysisId = `ANL_${latencyMs}_${input.analysisType}`;
    const answerWithoutIds: Omit<NoeliaAnswer, "decisionId" | "latencyMs"> = {
      engine: "ANALYTICS",
      outputClass: completelyDenied ? "REQUIRES_HUMAN_REVIEW" : "INFERENCE",
      headline: outputs.find((output) => output.headline)?.headline ?? defaultHeadline("ANALYTICS"),
      findings,
      narrative: outputs.find((output) => output.narrative)?.narrative ?? defaultNarrative("ANALYTICS"),
      sources: uniqueSources,
      confidence: outputs.reduce((current, output) => Math.max(current, output.confidence ?? 0), completelyDenied ? 1 : 0.6),
      humanReviewRequired: completelyDenied || outputs.some((output) => output.humanReviewRequired),
      deniedScopes,
      policyDecision: policy.effect,
      toolsUsed,
      analysisType: input.analysisType,
      analysisId,
      metrics: outputs.flatMap((output) => output.metrics ?? []),
      risks: outputs.flatMap((output) => output.risks ?? []),
      forecasts: outputs.flatMap((output) => output.forecasts ?? []),
      scenarios: outputs.flatMap((output) => output.scenarios ?? []),
      traceId: input.traceId,
      correlationId: input.correlationId,
      requestId: this.opt(modelExecution.route?.requestId),
      model: this.opt(modelExecution.model),
      modelVersion: this.opt(modelExecution.modelVersion),
      provider: this.opt(modelExecution.provider),
      modelKind: this.opt(modelExecution.modelKind),
      routingDecisionId: this.opt(modelExecution.routingId),
    };
    const decisionId = await this.evidence.recordDecision({
      principal: input.principal,
      traceId: input.traceId,
      question: `analytics:${input.analysisType}`,
      engine: "ANALYTICS",
      answer: answerWithoutIds,
      policy,
      target: input.target,
      latencyMs,
      requestId: answerWithoutIds.requestId,
      model: answerWithoutIds.model ?? undefined,
      modelVersion: answerWithoutIds.modelVersion ?? undefined,
      provider: answerWithoutIds.provider ?? undefined,
      modelKind: answerWithoutIds.modelKind ?? undefined,
      routingDecisionId: answerWithoutIds.routingDecisionId ?? undefined,
    });
    return { decisionId, latencyMs, ...answerWithoutIds };
  }
}
