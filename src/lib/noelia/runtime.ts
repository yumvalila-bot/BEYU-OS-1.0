import type { Principal } from "@/lib/authz";
import { assessEvidence, resolveOutputClass, type EvidenceRecord } from "./epistemics";
import { NoeliaToolRegistry } from "./tool-registry";
import type {
  NoeliaAnswer,
  NoeliaAnswerUncertainty,
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

function uncertaintyFrom(
  assessment: ReturnType<typeof assessEvidence>,
): NoeliaAnswerUncertainty {
  return {
    classification: assessment.claimedClass,
    confidenceCap: assessment.confidenceCap,
    factors: assessment.factors.map((factor) => `${factor.rule}: ${factor.detail}`),
    missingSources: assessment.flags.missingSources,
    staleSources: assessment.flags.staleSources,
    conflictingSources: assessment.flags.conflictingSources,
    missingProvenance: assessment.flags.missingProvenance,
    unverifiedAuthority: assessment.flags.unverifiedAuthority,
    toolDenials: assessment.flags.toolDenials,
  };
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
    /** The as-of date (YYYY-MM-DD) against which source windows are judged. */
    asOf?: string;
  }): Promise<NoeliaAnswer> {
    const started = Date.now();
    const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
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

    // Deduplicate only *identical* claims. Distinct claims about the same
    // subject (different authority or epistemic class) are contradictory
    // evidence and must survive to be classified — silently collapsing them
    // would hide a conflict the answer is required to surface.
    const claimsBySubject = new Map<string, typeof sources>();
    for (const source of sources) {
      const key = `${source.kind}:${source.ref}`;
      const claims = claimsBySubject.get(key) ?? [];
      if (!claims.some((existing) => existing.authority === source.authority && existing.epistemicClass === source.epistemicClass)) {
        claims.push(source);
      }
      claimsBySubject.set(key, claims);
    }
    const uniqueSources = [...claimsBySubject.values()].flat();
    const domainToolsUsed = toolsUsed.filter((tool) => tool !== "knowledge.rag.search");
    const completelyDenied = policy.effect === "DENY" ||
      (engine === "KNOWLEDGE" ? toolsUsed.length === 0 : domainToolsUsed.length === 0);
    const obligationsRequireHuman = policy.obligations.some((obligation) =>
      obligation.type === "HUMAN_REVIEW" || obligation.type === "APPROVAL");

    // Weakest-link confidence: the answer is never more certain than the
    // best self-reported tool confidence, and never more certain than its
    // evidence deserves (assessEvidence).
    const rawConfidence = outputs.reduce((current, output) => Math.max(current, output.confidence ?? 0), 0.6);
    const evidence: EvidenceRecord[] = uniqueSources.map((source) => ({
      source,
      epistemicClass: source.epistemicClass ?? "DERIVED",
      authorityStatus: source.authorityStatus,
      effectiveFrom: source.effectiveFrom,
      reviewDate: source.reviewDate,
      expiresAt: source.expiresAt,
    }));
    const assessment = assessEvidence({ evidence, toolDenials: deniedScopes, asOf, baseConfidence: rawConfidence });

    let headline = outputs.find((output) => output.headline)?.headline ?? defaultHeadline(engine);
    let narrative = outputs.find((output) => output.narrative)?.narrative ?? defaultNarrative(engine);
    let confidence = Math.min(rawConfidence, assessment.confidenceCap);
    let humanReviewRequired = obligationsRequireHuman || outputs.some((output) => output.humanReviewRequired);

    if (policy.effect === "DENY") {
      headline = "Request blocked by enterprise policy.";
      narrative = policy.denials.map((denial) => `${denial.policyCode}: ${denial.message}`).join(" ") ||
        "The policy engine denied this AI request.";
      confidence = 1;
      humanReviewRequired = true;
    } else if (completelyDenied) {
      headline = "Insufficient authority for this intelligence domain.";
      narrative = "Noelia operates only through registered capabilities within the requesting human's RBAC/ABAC scope.";
      confidence = 1;
      humanReviewRequired = true;
    } else if (assessment.flags.conflictingSources) {
      humanReviewRequired = true;
    }

    const policyDenied = policy.effect === "DENY";
    const outputClass =
      policyDenied || completelyDenied
        ? "REQUIRES_HUMAN_REVIEW"
        : resolveOutputClass({
            engine,
            policyDenied,
            completelyDenied,
            findings,
            assessment,
            confidence,
            obligationsRequireHuman,
          });

    // When the answer claims nothing about the world (denial, denial of
    // scope, or no evidence), its epistemic status is the explicit
    // non-value class, never an implied fact.
    const uncertainty =
      policyDenied || completelyDenied
        ? {
            ...uncertaintyFrom(assessment),
            classification: (policyDenied ? "REQUIRES_AUTHORITY" : "GOVERNANCE_REVIEW_REQUIRED") as NoeliaAnswerUncertainty["classification"],
            confidenceCap: 1,
            factors: [
              ...(policyDenied
                ? ["REQUIRES_AUTHORITY: enterprise policy denied this request."]
                : ["GOVERNANCE_REVIEW_REQUIRED: no authorized capability produced evidence."]),
            ],
          }
        : uncertaintyFrom(assessment);

    const assumptions = [...new Set(outputs.flatMap((output) => output.assumptions ?? []))];
    const limitations = [...new Set(outputs.flatMap((output) => output.limitations ?? []))];

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
      uncertainty,
      assumptions,
      limitations,
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
