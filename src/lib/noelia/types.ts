import type { ZodType } from "zod";
import type { Principal } from "@/lib/authz";
import type {
  Classification,
  NoeliaEpistemicStatus,
  NoeliaHorizon,
  PermissionCode,
} from "@/lib/constants";
import type { PolicyEvaluation } from "@/lib/policy";

/**
 * Canonical Noelia engine catalogue.
 *
 * Every engine maps to a finite, registered tool plan; there is no path by
 * which a question selects an unregistered capability.
 */
export type NoeliaEngine =
  | "FINANCIAL"
  | "RISK"
  | "COMPLIANCE"
  | "GOVERNANCE"
  | "TAX"
  | "LEGAL"
  | "WORKFORCE"
  | "HEALTH"
  | "KNOWLEDGE"
  | "EXECUTIVE"
  | "ANALYTICS"
  | "CROSS_OS";

/**
 * A single finding. `kind` is the coarse legacy class; `status` is the
 * canonical epistemic status every analytical result must carry. Missing data
 * is NEVER represented as zero: use status UNAVAILABLE.
 */
export type NoeliaFinding = {
  label: string;
  value: string;
  kind: "FACT" | "INFERENCE" | "RECOMMENDATION";
  /** Canonical analytic epistemics (OBSERVED/DERIVED/FORECAST/...). */
  status?: NoeliaEpistemicStatus;
  /** Metric code when the finding is a metric view. */
  metricCode?: string | null;
  horizon?: NoeliaHorizon | null;
  confidence?: number | null;
  /** Source reference (kind:ref) when attributable. */
  provenance?: string | null;
};

export type NoeliaSource = {
  kind: string;
  ref: string;
  label: string;
  authority: string;
};

/** Structured metric view with explicit epistemic status. */
export type NoeliaMetricView = {
  code: string;
  label: string;
  value: string;
  status: NoeliaEpistemicStatus;
  confidence: number | null;
  source: string | null;
  period: string | null;
  trend: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
};

/**
 * Structured recommendation contract (section 20 of the Noelia capability
 * target). Every recommendation must carry rationale, evidence, assumptions,
 * uncertainty, limitations, confidence, source provenance and "what would
 * change this recommendation".
 */
export type NoeliaRecommendation = {
  id: string;
  headline: string;
  rationale: string;
  evidence: string[];
  assumptions: string[];
  uncertainty: string[];
  limitations: string[];
  confidence: number;
  sourceProvenance: string[];
  whatWouldChange: string[];
  risks: string[];
  alternatives: string[];
  humanDecisionRequired: boolean;
  horizon: NoeliaHorizon;
  status: "RECOMMENDATION";
};

/**
 * The base governed intelligence answer.
 *
 * Fields are ADDITIVE relative to the Phase 15 contract: existing consumers
 * (console UI, evidence persistence) keep working unchanged; executive and
 * analytics responses enrich the same envelope.
 */
export type NoeliaAnswer = {
  decisionId: string;
  engine: NoeliaEngine;
  outputClass:
    | "FACT"
    | "INFERENCE"
    | "RECOMMENDATION"
    | "PREDICTION"
    | "UNCERTAINTY"
    | "REQUIRES_HUMAN_REVIEW";
  headline: string;
  findings: NoeliaFinding[];
  narrative: string;
  sources: NoeliaSource[];
  confidence: number;
  humanReviewRequired: boolean;
  deniedScopes: string[];
  policyDecision: string;
  toolsUsed: string[];
  latencyMs: number;
  // ---- Executive/analytics structured contract (additive) ----
  analysisId?: string;
  analysisType?: string;
  horizon?: NoeliaHorizon;
  summary?: string;
  metrics?: NoeliaMetricView[];
  recommendations?: NoeliaRecommendation[];
  alternatives?: string[];
  risks?: string[];
  assumptions?: string[];
  uncertainty?: string[];
  limitations?: string[];
  whatWouldChangeRecommendation?: string[];
  observedFacts?: string[];
  derivedConclusions?: string[];
  forecasts?: string[];
  scenarios?: string[];
  whatIsMissing?: string[];
  requiresHumanDecision?: string[];
  deteriorating?: string[];
  improving?: string[];
  managementAttentionRequired?: string[];
  deniedSources?: string[];
  traceId?: string;
  correlationId?: string;
};

/** Executive briefing: the full structured intelligence contract. */
export type NoeliaExecutiveBriefing = NoeliaAnswer & {
  engine: "EXECUTIVE";
  analysisType: "EXECUTIVE_BRIEFING";
  horizon: NoeliaHorizon;
  summary: string;
  metrics: NoeliaMetricView[];
  recommendations: NoeliaRecommendation[];
  observedFacts: string[];
  derivedConclusions: string[];
  forecasts: string[];
  scenarios: string[];
  whatIsMissing: string[];
  requiresHumanDecision: string[];
  deteriorating: string[];
  improving: string[];
  managementAttentionRequired: string[];
  deniedSources: string[];
  traceId: string;
  correlationId: string;
};

export type NoeliaTargetContext = {
  tenantId: string;
  legalEntityId: string | null;
  countryCode: string | null;
};

/** The finite scope resolved by a BEYU service before HIVE may invoke a tool. */
export type NoeliaAuthorizedScope = {
  tenantIds: string[];
  legalEntityIds: string[];
  countryCodes: string[];
  /** Composite scope prevents mixing an allowed entity with the wrong tenant/country. */
  entities: Array<{ id: string; tenantId: string; countryCode: string }>;
  tenantCountries: Array<{ tenantId: string; countryCode: string }>;
  enterprise: boolean;
};

export type HumanApprovalEvidence = {
  approvalId: string;
  approvingHumanId: string;
  actorType: "HUMAN";
  decision: "APPROVED";
};

export type ToolInvocationContext = {
  principal: Principal;
  traceId: string;
  target: NoeliaTargetContext;
  scope: NoeliaAuthorizedScope;
  approval?: HumanApprovalEvidence | null;
};

export type NoeliaToolOutput = {
  findings?: NoeliaFinding[];
  sources?: NoeliaSource[];
  headline?: string;
  narrative?: string;
  confidence?: number;
  humanReviewRequired?: boolean;
  metrics?: NoeliaMetricView[];
  recommendations?: NoeliaRecommendation[];
  alternatives?: string[];
  risks?: string[];
  assumptions?: string[];
  uncertainty?: string[];
  limitations?: string[];
  whatWouldChangeRecommendation?: string[];
  observedFacts?: string[];
  derivedConclusions?: string[];
  forecasts?: string[];
  scenarios?: string[];
  whatIsMissing?: string[];
  requiresHumanDecision?: string[];
  deteriorating?: string[];
  improving?: string[];
  managementAttentionRequired?: string[];
  metadata?: Record<string, unknown>;
};

export type ToolDenialCode =
  | "TOOL_UNKNOWN"
  | "TOOL_UNREGISTERED"
  | "CONTEXT_MISSING"
  | "PERMISSION_DENIED"
  | "CLASSIFICATION_DENIED"
  | "TENANT_DENIED"
  | "ENTITY_DENIED"
  | "COUNTRY_DENIED"
  | "JURISDICTION_DENIED"
  | "HUMAN_APPROVAL_REQUIRED"
  | "HUMAN_APPROVAL_INVALID"
  | "INPUT_INVALID"
  | "OUTPUT_INVALID"
  | "TIMEOUT"
  | "CAPABILITY_NOT_AVAILABLE";

export type ToolDecision =
  | { allowed: true; code: "ALLOWED"; reason: string }
  | { allowed: false; code: ToolDenialCode; reason: string };

/**
 * Governed capability metadata. Every registered capability must carry the
 * full contract so the registry can enforce it mechanically.
 */
export type ToolApprovalRequirement = {
  approverRole: string | null;
  reason: string;
};

export type ToolRetryPolicy = {
  maxRetries: number;
  backoffMs: number;
};

export type ToolMetadata = {
  /** Stable capability id. Never changes across versions. */
  stableId: string;
  version: string;
  ownerRole: string;
  domain: string;
  sideEffects: "NONE" | "AUDIT_ONLY" | "DOMAIN_WRITE";
  idempotent: boolean;
  timeoutMs: number;
  retryPolicy: ToolRetryPolicy | null;
  /** Restricted jurisdiction (country) codes; null = no jurisdiction restriction. */
  jurisdictionRestrictions: string[] | null;
  entityRestrictions: "SCOPED" | "NONE";
  approvalRequirements: ToolApprovalRequirement | null;
  auditRequirements: { event: string; objectType: string };
  /** Zod input contract. When present, handler input is validated before execution. */
  inputSchema?: ZodType;
  /** Zod output contract. When present, handler output is validated after execution. */
  outputSchema?: ZodType;
};

export type RegisteredNoeliaTool = {
  name: string;
  permission: PermissionCode;
  classification?: Classification;
  risk: "LOW" | "HIGH";
  approverRole?: string;
  description: string;
  metadata: ToolMetadata;
  execute: (context: ToolInvocationContext, input: unknown) => Promise<NoeliaToolOutput>;
};

export type DeclaredNoeliaTool = Omit<RegisteredNoeliaTool, "execute">;

export type ToolInvocationResult =
  | { allowed: true; decision: ToolDecision & { allowed: true }; output: NoeliaToolOutput }
  | { allowed: false; decision: ToolDecision & { allowed: false } };

export type NoeliaPolicyPort = {
  evaluate(input: {
    principal: Principal;
    target: NoeliaTargetContext;
    classification?: Classification;
  }): Promise<PolicyEvaluation>;
};

export type NoeliaEvidenceInput = {
  principal: Principal;
  traceId: string;
  question: string;
  engine: NoeliaEngine;
  answer: Omit<NoeliaAnswer, "decisionId" | "latencyMs">;
  policy: PolicyEvaluation;
  target: NoeliaTargetContext;
  latencyMs: number;
};

export type NoeliaEvidencePort = {
  recordDecision(input: NoeliaEvidenceInput): Promise<string>;
};

/** Human decision status for legal/tax/authority-bound outputs. */
export type AuthorityBoundOutputClass =
  | "FACT"
  | "INFERENCE"
  | "RECOMMENDATION"
  | "REQUIRES_AUTHORITY";

/** Analysis kinds supported by the analytics engine. */
export const NOELIA_ANALYSIS_TYPES = [
  "KPI_ANALYSIS",
  "TREND_ANALYSIS",
  "VARIANCE_ANALYSIS",
  "ANOMALY_DETECTION",
  "FORECAST",
  "SENSITIVITY_ANALYSIS",
  "SCENARIO_COMPARISON",
  "STRESS_TEST",
  "CONCENTRATION_ANALYSIS",
  "LIQUIDITY_ANALYSIS",
  "PERFORMANCE_ANALYSIS",
  "WORKFORCE_ANALYSIS",
  "COMPLIANCE_ANALYSIS",
  "RISK_ANALYSIS",
  "CAPITAL_ANALYSIS",
  "CROSS_DOMAIN_CORRELATION",
] as const;
export type NoeliaAnalysisType = (typeof NOELIA_ANALYSIS_TYPES)[number];
