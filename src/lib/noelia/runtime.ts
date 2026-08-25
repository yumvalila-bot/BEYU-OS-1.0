import type { Principal } from "@/lib/authz";
import { parseHorizon, synthesizeExecutiveBriefing, type BriefingInputs } from "./executive";
import { NoeliaToolRegistry } from "./tool-registry";
import type {
  NoeliaAnalysisType,
  NoeliaAnswer,
  NoeliaAuthorizedScope,
  NoeliaEngine,
  NoeliaEvidencePort,
  NoeliaExecutiveBriefing,
  NoeliaPolicyPort,
  NoeliaTargetContext,
  NoeliaToolOutput,
  ToolInvocationContext,
} from "./types";

const ENGINE_TOOLS: Record<NoeliaEngine, readonly string[]> = {
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

export class NoeliaRuntime {
  constructor(
    private readonly tools: NoeliaToolRegistry,
    private readonly policy: NoeliaPolicyPort,
    private readonly evidence: NoeliaEvidencePort,
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
  }): Promise<NoeliaExecutiveBriefing> {
    const started = Date.now();
    const horizon = parseHorizon(input.horizon);
    const { policy, findings, sources, outputs, toolsUsed, deniedScopes } = await this.executePlan(input, "EXECUTIVE", ENGINE_TOOLS.EXECUTIVE);

    const briefingInputs: BriefingInputs = {
      principal: input.principal,
      target: input.target,
      scope: input.scope,
      horizon,
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

    const answerWithoutIds: Omit<NoeliaAnswer, "decisionId" | "latencyMs"> = { ...synthesized };
    const decisionId = await this.evidence.recordDecision({
      principal: input.principal,
      traceId: input.traceId,
      question: input.question || "Executive briefing",
      engine: "EXECUTIVE",
      answer: answerWithoutIds,
      policy,
      target: input.target,
      latencyMs,
    });

    return {
      decisionId,
      latencyMs,
      ...synthesized,
      findings,
      sources,
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
    });
    return { decisionId, latencyMs, ...answerWithoutIds };
  }
}
