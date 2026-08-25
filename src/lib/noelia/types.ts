import type { Principal } from "@/lib/authz";
import type { Classification, PermissionCode } from "@/lib/constants";
import type { PolicyEvaluation } from "@/lib/policy";
import type { EpistemicClass } from "./epistemics";

export type NoeliaEngine =
  | "FINANCIAL"
  | "RISK"
  | "COMPLIANCE"
  | "GOVERNANCE"
  | "TAX"
  | "WORKFORCE"
  | "KNOWLEDGE";

export type NoeliaFinding = {
  label: string;
  value: string;
  kind: "FACT" | "INFERENCE" | "RECOMMENDATION";
};

export type NoeliaSource = {
  kind: string;
  ref: string;
  label: string;
  authority: string;
  /**
   * Epistemic class of the underlying datum (canonical model). Omitted values
   * are treated conservatively as DERIVED, never as direct observation.
   */
  epistemicClass?: EpistemicClass;
  /** Governing authority status of the source; anything but AUTHORITATIVE downgrades the answer. */
  authorityStatus?: string;
  /** Validity window (YYYY-MM-DD). Used for STALE_IS_NOT_CURRENT checks. */
  effectiveFrom?: string;
  reviewDate?: string;
  expiresAt?: string | null;
};

/** The answer's explicit uncertainty classification (Iteration 10). */
export type NoeliaAnswerUncertainty = {
  /** Weakest epistemic class the answer may claim. */
  classification: EpistemicClass;
  /** Confidence above this cap would be fabricated certainty. */
  confidenceCap: number;
  /** Ordered, human-readable list of applied downgrades. */
  factors: string[];
  missingSources: boolean;
  staleSources: boolean;
  conflictingSources: boolean;
  missingProvenance: boolean;
  unverifiedAuthority: boolean;
  toolDenials: boolean;
};

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
  /** Explicit epistemic uncertainty — never implied, always stated. */
  uncertainty: NoeliaAnswerUncertainty;
  /** Explicit assumptions behind the answer. */
  assumptions: string[];
  /** Explicit limitations of the answer. */
  limitations: string[];
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
  metadata?: Record<string, unknown>;
  /** Explicit assumptions behind this tool's output. */
  assumptions?: string[];
  /** Explicit limitations of this tool's output. */
  limitations?: string[];
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
  | "HUMAN_APPROVAL_REQUIRED"
  | "HUMAN_APPROVAL_INVALID";

export type ToolDecision =
  | { allowed: true; code: "ALLOWED"; reason: string }
  | { allowed: false; code: ToolDenialCode; reason: string };

export type RegisteredNoeliaTool = {
  name: string;
  permission: PermissionCode;
  classification?: Classification;
  risk: "LOW" | "HIGH";
  approverRole?: string;
  description: string;
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
