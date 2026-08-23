import type { Principal } from "@/lib/authz";
import { NoeliaToolRegistry } from "./tool-registry";
import type {
  NoeliaAnswer,
  NoeliaAuthorizedScope,
  NoeliaEngine,
  NoeliaEvidencePort,
  NoeliaPolicyPort,
  NoeliaTargetContext,
  NoeliaToolOutput,
  ToolInvocationContext,
} from "./types";

const ENGINE_TOOLS: Record<NoeliaEngine, readonly string[]> = {
  FINANCIAL: ["finance.treasury.aggregate", "finance.capital.pipeline", "finance.waterfall.latest"],
  RISK: ["risk.register.query"],
  COMPLIANCE: ["compliance.obligation.query"],
  GOVERNANCE: ["governance.resolution.query"],
  TAX: ["tax.knowledge.query"],
  WORKFORCE: ["hcm.employee.aggregate"],
  KNOWLEDGE: ["knowledge.rag.search"],
};

/** Intent routing is deterministic, inspectable and cannot select an arbitrary tool. */
export function routeEngine(question: string): NoeliaEngine {
  const value = question.toLowerCase();
  if (/tax|vat|withhold|tra |deduction|capital allowance/.test(value)) return "TAX";
  if (/risk|threat|exposure|incident/.test(value)) return "RISK";
  if (/complian|regulat|gdpr|obligation|audit finding/.test(value)) return "COMPLIANCE";
  if (/resolution|board|governance|approval|policy/.test(value)) return "GOVERNANCE";
  if (/employee|workforce|headcount|hcm|staff|payroll/.test(value)) return "WORKFORCE";
  if (/cash|revenue|capital|treasury|waterfall|liquidity|financ|distribut/.test(value)) return "FINANCIAL";
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
    case "WORKFORCE":
      return "HCM remains the only workforce master; Noelia cannot create employment consequences.";
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
    WORKFORCE: "Authorized HCM evidence assembled.",
    KNOWLEDGE: "Governed enterprise knowledge searched.",
  };
  return labels[engine];
}

function outputClassFor(engine: NoeliaEngine, hasSources: boolean): NoeliaAnswer["outputClass"] {
  if (engine === "TAX") return "REQUIRES_HUMAN_REVIEW";
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

  async ask(input: {
    principal: Principal;
    question: string;
    traceId: string;
    target: NoeliaTargetContext;
    scope: NoeliaAuthorizedScope;
  }): Promise<NoeliaAnswer> {
    const started = Date.now();
    const engine = routeEngine(input.question);
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
      const plannedTools = [...ENGINE_TOOLS[engine]];
      if (engine !== "KNOWLEDGE") plannedTools.push("knowledge.rag.search");

      for (const toolName of plannedTools) {
        const result = await this.tools.invoke(toolName, invocationContext, { question: input.question });
        if (!result.allowed) {
          deniedScopes.push(`${toolName}:${result.decision.code}`);
          continue;
        }
        toolsUsed.push(toolName);
        outputs.push(result.output);
        findings.push(...(result.output.findings ?? []));
        sources.push(...(result.output.sources ?? []));
      }
    }

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
}
