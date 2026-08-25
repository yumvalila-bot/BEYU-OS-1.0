import {
  HORIZON_LABELS,
  NOELIA_HORIZONS,
  type NoeliaHorizon,
} from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";
import type { PolicyEvaluation } from "@/lib/policy";
import type { Principal } from "@/lib/authz";
import { explainableConfidence } from "./epistemics";
import type {
  NoeliaAuthorizedScope,
  NoeliaBriefingStructure,
  NoeliaExecutiveBriefing,
  NoeliaFinding,
  NoeliaMetricView,
  NoeliaRecommendation,
  NoeliaSource,
  NoeliaTargetContext,
  NoeliaToolOutput,
} from "./types";

/**
 * Executive Intelligence (section 6 of the Noelia capability target).
 *
 * Briefings are DETERMINISTIC syntheses of registered capability outputs.
 * Noelia never invents a figure: every statement in a briefing either comes
 * from a tool output (which carries its epistemic status) or is explicitly
 * tagged INFERENCE/RECOMMENDATION/REQUIRES_HUMAN_REVIEW. Horizons are
 * intelligence metadata, not authority levels.
 */

export type BriefingInputs = {
  principal: Principal;
  target: NoeliaTargetContext;
  scope: NoeliaAuthorizedScope;
  horizon: NoeliaHorizon;
  /** Presentation structure — metadata only, never an authority level. */
  structure?: NoeliaBriefingStructure;
  policy: PolicyEvaluation;
  toolOutputs: NoeliaToolOutput[];
  toolsUsed: string[];
  deniedScopes: string[];
  traceId: string;
  correlationId: string;
  latencyMs: number;
};

/** §III sections — deterministic derivations, never fabricated. */
function deriveEnterprisePosition(metrics: NoeliaMetricView[]): string[] {
  const observed = metrics.filter((m) => m.status === "OBSERVED");
  if (observed.length === 0) {
    return ["No observed position metrics available; enterprise position cannot be stated (UNAVAILABLE)."];
  }
  return observed.map((m) => `${m.label}: ${m.value} (${m.status}${m.source ? ` · ${m.source}` : ""})`);
}

function deriveStrategicVariance(metrics: NoeliaMetricView[]): string[] {
  const signals = metrics.filter((m) => m.trend !== "UNKNOWN");
  if (signals.length === 0) {
    return ["No variance signal from registered metrics (UNAVAILABLE); variance is not asserted in its absence."];
  }
  return signals.map((m) => `Variance signal — ${m.label}: ${m.value} (trend ${m.trend}, ${m.status})`);
}

function deriveKpiInterpretation(metrics: NoeliaMetricView[]): string[] {
  const kpis = metrics.filter((m) => m.status === "OBSERVED");
  if (kpis.length === 0) {
    return ["No observed KPI from a registered source; interpretation is not fabricated (UNAVAILABLE)."];
  }
  return kpis.map((m) =>
    `KPI ${m.label} = ${m.value} (${m.status}${m.confidence != null ? `; confidence ${m.confidence.toFixed(2)}` : ""}${m.period ? `; ${m.period}` : ""})`,
  );
}

function deriveMaterialItems(deteriorating: string[], risks: string[]): string[] {
  const candidates = [...deteriorating, ...risks].slice(0, 10);
  if (candidates.length === 0) {
    return ["No deterioration/risk signal from registered capabilities; no candidate material item identified."];
  }
  return candidates.map((c) => `Candidate material item — ${c} (derived signal; materiality determination remains a governance decision)`);
}

function deriveRecommendationComparison(recommendations: NoeliaRecommendation[]): NoeliaExecutiveBriefing["recommendationComparison"] {
  return recommendations.flatMap((r) =>
    r.alternatives.length > 0 || r.whatWouldChange.length > 0
      ? [{
          decision: r.headline,
          optionA: r.headline,
          optionB: r.alternatives[0] ?? "(no alternative proposed by the source)",
          tradeOff: r.uncertainty[0] ?? "Trade-off not quantified by the source.",
          condition: r.whatWouldChange[0] ?? "No source-defined condition.",
        }]
      : [],
  );
}

function factText(output: NoeliaToolOutput): string[] {
  return (output.findings ?? [])
    .filter((finding) => finding.kind === "FACT")
    .map((finding) => `${finding.label}: ${finding.value}`);
}

function recommendationText(output: NoeliaToolOutput): string[] {
  return (output.findings ?? [])
    .filter((finding) => finding.kind === "RECOMMENDATION")
    .map((finding) => `${finding.label}: ${finding.value}`);
}

function firstList(outputs: NoeliaToolOutput[], key: keyof NoeliaToolOutput): string[] {
  return outputs.flatMap((output) => (output[key] as string[] | undefined) ?? []);
}

/** What is missing: capabilities denied + authoritative sources that returned UNAVAILABLE. */
function deriveWhatIsMissing(inputs: BriefingInputs): string[] {
  const missing: string[] = [];
  for (const denied of inputs.deniedScopes) {
    missing.push(`Capability ${denied} was denied for this principal/scope.`);
  }
  for (const output of inputs.toolOutputs) {
    for (const finding of output.findings ?? []) {
      if (finding.status === "UNAVAILABLE" || finding.value === "DATA_NOT_AVAILABLE") {
        missing.push(`${finding.label} is not available in the authorized scope — absence is not zero.`);
      }
    }
  }
  return [...new Set(missing)];
}

/** What requires a human decision: review flags + policy obligations. */
function deriveRequiresHumanDecision(inputs: BriefingInputs): string[] {
  const items: string[] = [];
  for (const obligation of inputs.policy.obligations) {
    items.push(`Policy ${obligation.policyCode} requires ${obligation.type}${obligation.approverRole ? ` (${obligation.approverRole})` : ""}.`);
  }
  for (const output of inputs.toolOutputs) {
    if (output.humanReviewRequired) {
      items.push(output.headline ?? "A capability output requires accountable-human review.");
    }
  }
  return [...new Set(items)];
}

/** Structured recommendations derived from evidence, each with the full contract. */
function buildRecommendations(inputs: BriefingInputs): NoeliaRecommendation[] {
  const recommendations: NoeliaRecommendation[] = [];
  const seen = new Set<string>();
  const add = (headline: string, rationale: string, evidence: string[], horizon: NoeliaHorizon, riskLevel: "LOW" | "HIGH") => {
    const key = headline.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const evidenceFor = [...new Set(evidence)].slice(0, 6);
    recommendations.push({
      id: newId(ID_PREFIX.aiDecision).replace("AID_", "REC_"),
      headline,
      rationale,
      evidence: evidenceFor,
      assumptions: [
        "All evidence is drawn from registered BEYU capabilities within the requesting human's RBAC/ABAC scope.",
        "Domain systems remain authoritative for their own data; Noelia's recommendation creates no authority.",
      ],
      uncertainty: [
        "Confidence reflects the strength of sources, not certainty of outcome.",
        "Figures tagged FORECAST or SCENARIO are never actuals.",
      ],
      limitations: [
        "Noelia cannot approve, post, commit, hire, decide or settle.",
        riskLevel === "HIGH" ? "This recommendation has material consequences and requires human decision." : "This recommendation is advisory.",
      ],
      confidence: Math.max(0.55, Math.min(0.92, 0.6 + evidenceFor.length * 0.05)),
      sourceProvenance: evidenceFor.map((item) => item.split(":")[0]),
      whatWouldChange: [
        "A new authoritative observation that contradicts the underlying evidence.",
        "A policy or approval obligation triggered by the recommended action.",
        "A corrected or refreshed source replacing a stale one.",
      ],
      risks: [
        "Acting without accountable-human review where humanReviewRequired is true.",
        "Treating FORECAST/SCENARIO figures as actuals.",
      ],
      alternatives: [
        "Maintain the status quo and monitor at the next review.",
        "Escalate to the accountable governance body for a decision.",
      ],
      humanDecisionRequired: riskLevel === "HIGH",
      horizon,
      status: "RECOMMENDATION",
    });
  };

  for (const output of inputs.toolOutputs) {
    if (output.humanReviewRequired && output.headline) {
      add(
        output.headline,
        "A registered capability flagged this item for accountable-human review.",
        factText(output),
        inputs.horizon,
        "HIGH",
      );
    }
    for (const finding of output.findings ?? []) {
      if (finding.kind === "RECOMMENDATION") {
        add(
          finding.label,
          finding.value,
          factText(output),
          inputs.horizon,
          "HIGH",
        );
      }
    }
    // Structured recommendations emitted by registered capabilities carry the
    // full §20 contract (rationale/evidence/assumptions/uncertainty/...).
    // They are adopted verbatim — Noelia never rewrites a tool's evidence.
    for (const rec of output.recommendations ?? []) {
      const key = rec.headline.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recommendations.push({ ...rec });
    }
  }
  return recommendations;
}

/** Synthesis — pure and deterministic; unit-testable without a database. */
export function synthesizeExecutiveBriefing(inputs: BriefingInputs): Omit<NoeliaExecutiveBriefing, "decisionId" | "latencyMs"> {
  const sources: NoeliaSource[] = inputs.toolOutputs.flatMap((output) => output.sources ?? []);
  const uniqueSources = [...new Map(sources.map((source) => [`${source.kind}:${source.ref}`, source])).values()];
  const metrics = inputs.toolOutputs.flatMap((output) => output.metrics ?? []);
  const confidence = explainableConfidence({ toolOutputs: inputs.toolOutputs, hasSources: uniqueSources.length > 0 });
  const facts = [...new Set(inputs.toolOutputs.flatMap(factText))];
  const recommendations = [...new Set(inputs.toolOutputs.flatMap(recommendationText))];
  const risks = [...new Set(firstList(inputs.toolOutputs, "risks"))];
  const scenarios = [...new Set(firstList(inputs.toolOutputs, "scenarios"))];
  const forecasts = [...new Set(firstList(inputs.toolOutputs, "forecasts"))];
  const whatIsMissing = deriveWhatIsMissing(inputs);
  const requiresHumanDecision = deriveRequiresHumanDecision(inputs);
  const structuredRecommendations = buildRecommendations(inputs);
  const denied = [...new Set(inputs.deniedScopes)];
  const deniedSources = denied.map((scope) => scope);

  const deteriorating = risks.length
    ? risks
    : [];
  const improving = metrics
    .filter((m) => m.trend === "UP")
    .map((m) => `${m.label} improving (${m.value})`);
  const managementAttention = [
    ...risks,
    ...requiresHumanDecision,
  ].slice(0, 10);
  const structure: NoeliaBriefingStructure = inputs.structure ?? "EXECUTIVE";
  const enterprisePosition = deriveEnterprisePosition(metrics);
  const strategicVariance = deriveStrategicVariance(metrics);
  const kpiInterpretation = deriveKpiInterpretation(metrics);
  const materialItems = deriveMaterialItems(deteriorating, risks);
  const opportunities = [...new Set(firstList(inputs.toolOutputs, "opportunities"))];
  const recommendationComparison = deriveRecommendationComparison(structuredRecommendations);

  const policyDenied = inputs.policy.effect === "DENY";
  const headline = policyDenied
    ? "Executive briefing blocked by enterprise policy."
    : `Executive briefing · ${HORIZON_LABELS[inputs.horizon]}`;

  const summary = policyDenied
    ? inputs.policy.denials.map((denial) => `${denial.policyCode}: ${denial.message}`).join(" ")
    : [
        `${facts.length} observed fact(s) from registered BEYU capabilities.`,
        `${structuredRecommendations.length} structured recommendation(s); ${requiresHumanDecision.length} item(s) require human decision.`,
        `${whatIsMissing.length} item(s) are unavailable or denied in the authorized scope.`,
        `Confidence ${confidence.confidence.toFixed(2)} — ${confidence.reason}`,
      ].join(" ");

  const findings: NoeliaFinding[] = [
    ...inputs.toolOutputs.flatMap((output) => output.findings ?? []),
  ];

  return {
    engine: "EXECUTIVE",
    outputClass: policyDenied || requiresHumanDecision.length > 0 || structuredRecommendations.some((r) => r.humanDecisionRequired)
      ? "REQUIRES_HUMAN_REVIEW"
      : "RECOMMENDATION",
    analysisType: "EXECUTIVE_BRIEFING",
    horizon: inputs.horizon,
    structure,
    headline,
    summary,
    findings,
    narrative: summary,
    sources: uniqueSources,
    confidence: policyDenied ? 1 : confidence.confidence,
    humanReviewRequired: policyDenied || requiresHumanDecision.length > 0,
    deniedScopes: denied,
    deniedSources,
    policyDecision: inputs.policy.effect,
    toolsUsed: inputs.toolsUsed,
    metrics,
    recommendations: structuredRecommendations,
    alternatives: structuredRecommendations.flatMap((r) => r.alternatives),
    risks,
    assumptions: structuredRecommendations.flatMap((r) => r.assumptions),
    uncertainty: structuredRecommendations.flatMap((r) => r.uncertainty),
    limitations: structuredRecommendations.flatMap((r) => r.limitations),
    whatWouldChangeRecommendation: structuredRecommendations.flatMap((r) => r.whatWouldChange),
    observedFacts: facts,
    derivedConclusions: [...new Set([...recommendations, ...metrics.map((m) => `${m.label}: ${m.value} (${m.status})`)])],
    forecasts,
    scenarios,
    enterprisePosition,
    strategicVariance,
    kpiInterpretation,
    materialItems,
    opportunities,
    recommendationComparison,
    whatIsMissing,
    requiresHumanDecision,
    deteriorating,
    improving,
    managementAttentionRequired: managementAttention,
    traceId: inputs.traceId,
    correlationId: inputs.correlationId,
  };
}

/** Validate a horizon string against the canonical catalogue. */
export function parseHorizon(value: string | null | undefined): NoeliaHorizon {
  if (value && (NOELIA_HORIZONS as readonly string[]).includes(value)) {
    return value as NoeliaHorizon;
  }
  return "HORIZON_2_NEAR_TERM";
}
