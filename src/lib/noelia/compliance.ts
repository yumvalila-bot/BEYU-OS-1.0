/**
 * Phase 3 machine-readable compliance evidence architecture.
 *
 * This is a CONTROL REGISTER, not a certification. Every entry references real
 * source/test/evidence paths where available; where evidence does not exist it
 * is marked EVIDENCE_REQUIRED or BLOCKED. Nothing in this file claims that BEYU
 * OS is ISO/IEC 42001 certified, EU AI Act conformant or NIST AI RMF certified.
 */

export type ComplianceStatus =
  | "IMPLEMENTED"
  | "VERIFIED"
  | "PARTIALLY_IMPLEMENTED"
  | "ENVIRONMENT_LIMITED"
  | "BLOCKED"
  | "EVIDENCE_REQUIRED"
  | "NOT_APPLICABLE"
  | "EXTERNAL_ASSESSMENT_REQUIRED";

export type FrameworkId = "EU_AI_ACT" | "ISO_42001" | "NIST_AI_RMF" | "ISO_23894" | "ISO_27001" | "ISO_27701" | "ISO_22989" | "ISO_23053";

export type NoeliaControl = {
  controlId: string;
  requirement: string;
  objective: string;
  implementation: string;
  sourceCode: string;
  databaseControl: string;
  test: string;
  evidence: string;
  owner: string;
  status: ComplianceStatus;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reviewDate: string;
  assessmentRequirement: "INTERNAL" | "EXTERNAL" | "NONE";
  frameworks: FrameworkId[];
};

export const NOELIA_CONTROLS: NoeliaControl[] = [
  {
    controlId: "NOELIA-AI-CTRL-001",
    requirement: "Provider-independent AI model abstraction",
    objective: "Noelia must not depend on one provider or model kind.",
    implementation: "AIModelProvider contract + normalized AIModelRequest/Response/usage/stream/embed types.",
    sourceCode: "src/lib/noelia/model-provider.ts",
    databaseControl: "noelia_providers / model_registry with providerId",
    test: "tests/noelia/provider-contract.test.ts",
    evidence: "Provider-neutral contracts used by gateway; deterministic analyst is DETERMINISTIC_ANALYST.",
    owner: "AI PLATFORM ENGINEERING",
    status: "IMPLEMENTED",
    risk: "LOW",
    reviewDate: "2026-12-31",
    assessmentRequirement: "INTERNAL",
    frameworks: ["ISO_42001", "ISO_22989", "ISO_23053", "NIST_AI_RMF"],
  },
  {
    controlId: "NOELIA-AI-CTRL-002",
    requirement: "No fabricated credentials or endpoints",
    objective: "Generative adapter is inert and fail-closed when no real runtime is mounted.",
    implementation: "OpenAICompatibleAdapter reads endpoint + credential env-var NAME only; never logs secrets.",
    sourceCode: "src/lib/noelia/model-provider.ts",
    databaseControl: "No credential/auth column in AI tables.",
    test: "tests/noelia/provider-contract.test.ts",
    evidence: "Unconfigured adapter returns NOT_CONFIGURED / FAIL_CLOSED, never PASS.",
    owner: "AI SECURITY",
    status: "IMPLEMENTED",
    risk: "HIGH",
    reviewDate: "2026-12-31",
    assessmentRequirement: "INTERNAL",
    frameworks: ["EU_AI_ACT", "ISO_42001", "ISO_27001", "NIST_AI_RMF"],
  },
  {
    controlId: "NOELIA-AI-CTRL-003",
    requirement: "Real generative inference honest status",
    objective: "Never present an adapter as real inference.",
    implementation: "AIConfiguredMode + GENERATIVE_INFERENCE_BLOCKED semantics.",
    sourceCode: "src/lib/noelia/model-provider.ts",
    databaseControl: "model_registry.model_type stays DETERMINISTIC_ANALYST for the deterministic runtime.",
    test: "tests/noelia/provider-contract.test.ts, tests/noelia/runtime-governed-model.test.ts",
    evidence: "REAL_GENERATIVE_INFERENCE = BLOCKED_BY_ENVIRONMENT.",
    owner: "AI PLATFORM ENGINEERING",
    status: "BLOCKED",
    risk: "MEDIUM",
    reviewDate: "2026-12-31",
    assessmentRequirement: "EXTERNAL",
    frameworks: ["EU_AI_ACT", "ISO_42001", "NIST_AI_RMF"],
  },
  {
    controlId: "NOELIA-AI-CTRL-004",
    requirement: "Model lifecycle is append-only and governed",
    objective: "No REGISTERED -> ACTIVE jump without a recorded chain.",
    implementation: "Model lifecycle event table + legal transition map + executable gate.",
    sourceCode: "src/lib/noelia/model-lifecycle.ts",
    databaseControl: "noelia_model_lifecycle_events, model_registry.lifecycle_status",
    test: "tests/noelia/model-lifecycle.test.ts",
    evidence: "Illegal transitions rejected; ACTIVE only after APPROVE/CANARY/ACTIVE + registry approval.",
    owner: "AI GOVERNANCE",
    status: "IMPLEMENTED",
    risk: "MEDIUM",
    reviewDate: "2026-12-31",
    assessmentRequirement: "INTERNAL",
    frameworks: ["EU_AI_ACT", "ISO_42001", "ISO_23894", "NIST_AI_RMF"],
  },
  {
    controlId: "NOELIA-AI-CTRL-005",
    requirement: "Provider lifecycle treated as supplier onboarding",
    objective: "External providers are never automatically approved.",
    implementation: "Provider lifecycle event table + legal transition chain.",
    sourceCode: "src/lib/noelia/model-lifecycle.ts",
    databaseControl: "noelia_provider_lifecycle_events, noelia_providers.lifecycle_status",
    test: "tests/noelia/model-lifecycle.test.ts",
    evidence: "Illegal ACTIVATED transition rejected.",
    owner: "AI GOVERNANCE",
    status: "IMPLEMENTED",
    risk: "MEDIUM",
    reviewDate: "2026-12-31",
    assessmentRequirement: "INTERNAL",
    frameworks: ["EU_AI_ACT", "ISO_42001", "ISO_23894", "NIST_AI_RMF"],
  },
  {
    controlId: "NOELIA-AI-CTRL-006",
    requirement: "Model provenance and supply chain evidence",
    objective: "Origin, publisher, checksum, license and transformation must be explicit.",
    implementation: "noelia_model_provenance + artifact digest verification.",
    sourceCode: "src/lib/noelia/model-lifecycle.ts",
    databaseControl: "noelia_model_provenance, noelia_model_artifacts",
    test: "tests/noelia/model-lifecycle.test.ts",
    evidence: "BEYU ownership is never claimed without explicit origin/publisher.",
    owner: "AI GOVERNANCE",
    status: "IMPLEMENTED",
    risk: "MEDIUM",
    reviewDate: "2026-12-31",
    assessmentRequirement: "EXTERNAL",
    frameworks: ["EU_AI_ACT", "ISO_42001", "NIST_AI_RMF"],
  },
  {
    controlId: "NOELIA-AI-CTRL-007",
    requirement: "Prompt governance blocks injection and boundary changes",
    objective: "Model cannot alter authorization, policy, tenant, entity, country or OS.",
    implementation: "PromptGovernor untrusted-segment detection + boundary-changing action rejection.",
    sourceCode: "src/lib/noelia/governance.ts",
    databaseControl: "No model-writable authorization table exposed.",
    test: "tests/noelia/governance.test.ts, tests/noelia/adversarial-ai-security.test.ts",
    evidence: "Prompt-injection attempt fails closed before model execution.",
    owner: "AI SECURITY",
    status: "IMPLEMENTED",
    risk: "HIGH",
    reviewDate: "2026-12-31",
    assessmentRequirement: "EXTERNAL",
    frameworks: ["EU_AI_ACT", "ISO_42001", "ISO_27001", "NIST_AI_RMF"],
  },
  {
    controlId: "NOELIA-AI-CTRL-008",
    requirement: "Output governance treats model output as untrusted",
    objective: "Model output cannot self-authorize and tool calls are requests only.",
    implementation: "OutputGovernor + valid tool-call authority gate.",
    sourceCode: "src/lib/noelia/governance.ts",
    databaseControl: "No model-asserted authorization column consumed by control plane.",
    test: "tests/noelia/governance.test.ts",
    evidence: "Output with authorized=true is rejected; tool call becomes requested-not-authorized.",
    owner: "AI SECURITY",
    status: "IMPLEMENTED",
    risk: "HIGH",
    reviewDate: "2026-12-31",
    assessmentRequirement: "EXTERNAL",
    frameworks: ["EU_AI_ACT", "ISO_42001", "NIST_AI_RMF"],
  },
  {
    controlId: "NOELIA-AI-CTRL-009",
    requirement: "High-risk action human oversight",
    objective: "HIGH/CRITICAL actions require human or dual-control approval.",
    implementation: "ActionRiskClassifier + HumanApprovalGate + validateToolAuthority.",
    sourceCode: "src/lib/noelia/governance.ts",
    databaseControl: "Approval remains in approvals registry; model cannot approve.",
    test: "tests/noelia/governance.test.ts",
    evidence: "DUAL_CONTROL for payments/identity/security; engine-proposed approval rejected.",
    owner: "AI GOVERNANCE",
    status: "IMPLEMENTED",
    risk: "HIGH",
    reviewDate: "2026-12-31",
    assessmentRequirement: "EXTERNAL",
    frameworks: ["EU_AI_ACT", "ISO_42001", "NIST_AI_RMF"],
  },
  {
    controlId: "NOELIA-AI-CTRL-010",
    requirement: "Tenant isolation verified through runtime role",
    objective: "Cross-tenant AI routing/incident records must not be visible to another tenant.",
    implementation: "RLS on noelia_routing_decisions/noelia_incidents via beyu_tenant_ids()/beyu_global_scope().",
    sourceCode: "drizzle/0023_noelia_ai_platform.sql, src/db/schema/ai.ts",
    databaseControl: "RLS policies + FORCE RLS + runtime role NOSUPERUSER NOBYPASSRLS.",
    test: "tests/noelia/ai-platform.test.ts, tests/noelia/adversarial-ai-security.test.ts",
    evidence: "Runtime-role query with tenant scope cannot see another tenant's routing/incident rows.",
    owner: "DATABASE SECURITY",
    status: "VERIFIED",
    risk: "CRITICAL",
    reviewDate: "2026-12-31",
    assessmentRequirement: "EXTERNAL",
    frameworks: ["ISO_27001", "NIST_AI_RMF", "EU_AI_ACT"],
  },
  {
    controlId: "NOELIA-AI-CTRL-011",
    requirement: "Cross-OS AI authorization boundary",
    objective: "Possession of an OS/enterprise role must not imply AI analytics access.",
    implementation: "Runtime routeAndExecuteModel checks ai:noelia.query/ai:analytics.read/ai:executive.read per engine.",
    sourceCode: "src/lib/noelia/runtime.ts",
    databaseControl: "Permissions come from grants/roles, not tenant rows.",
    test: "tests/noelia/adversarial-ai-security.test.ts",
    evidence: "Family Office principal without ai:analytics.read is denied.",
    owner: "AI SECURITY",
    status: "VERIFIED",
    risk: "CRITICAL",
    reviewDate: "2026-12-31",
    assessmentRequirement: "EXTERNAL",
    frameworks: ["ISO_27001", "NIST_AI_RMF", "EU_AI_ACT"],
  },
  {
    controlId: "NOELIA-AI-CTRL-012",
    requirement: "Model routing is deterministic and fail-closed",
    objective: "Best authorized model only after policy, residency, security, evaluation.",
    implementation: "BeyuNoeliaAiPlatformService route() + gateway executeRouted.",
    sourceCode: "src/lib/noelia/ai-platform.ts, src/lib/noelia/model-gateway.ts",
    databaseControl: "noelia_routing_decisions persists every decision.",
    test: "tests/noelia/ai-platform.test.ts, tests/noelia/runtime-governed-model.test.ts",
    evidence: "Kill switch, inactive provider, unapproved model and restricted->external all fail closed.",
    owner: "AI PLATFORM ENGINEERING",
    status: "IMPLEMENTED",
    risk: "HIGH",
    reviewDate: "2026-12-31",
    assessmentRequirement: "INTERNAL",
    frameworks: ["ISO_42001", "NIST_AI_RMF", "EU_AI_ACT"],
  },
  {
    controlId: "NOELIA-AI-CTRL-013",
    requirement: "Replay protection for routing/request idempotency",
    objective: "A replayed requestId must not duplicate routing decisions or actions.",
    implementation: "router reuses prior routing decision for a requestId; gateway requires requestId.",
    sourceCode: "src/lib/noelia/ai-platform.ts, src/lib/noelia/model-gateway.ts",
    databaseControl: "noelia_routing_decisions.request_id index/unique behavior.",
    test: "tests/noelia/ai-platform.test.ts",
    evidence: "Second route with same requestId returns the same routing id; only one row.",
    owner: "AI PLATFORM ENGINEERING",
    status: "IMPLEMENTED",
    risk: "MEDIUM",
    reviewDate: "2026-12-31",
    assessmentRequirement: "INTERNAL",
    frameworks: ["ISO_27001", "NIST_AI_RMF"],
  },
  {
    controlId: "NOELIA-AI-CTRL-014",
    requirement: "AI decision attribution and audit trail",
    objective: "Every AI decision attributes model, version, provider, routing and request ids.",
    implementation: "ai_decisions attribution columns + model lifecycle event audit + NoeliaAnswer fields.",
    sourceCode: "src/db/schema/platform.ts, src/lib/noelia/platform-services.ts, src/lib/noelia/runtime.ts",
    databaseControl: "ai_decisions.provider/model_kind/request_id/routing_decision_id.",
    test: "tests/noelia/runtime-governed-model.test.ts",
    evidence: "Route -> deterministic execution -> evidence -> audit pipeline records attribution.",
    owner: "AI GOVERNANCE",
    status: "IMPLEMENTED",
    risk: "MEDIUM",
    reviewDate: "2026-12-31",
    assessmentRequirement: "INTERNAL",
    frameworks: ["EU_AI_ACT", "ISO_42001", "NIST_AI_RMF"],
  },
];

export type StandardsRow = {
  framework: FrameworkId;
  requirement: string;
  applicability: string;
  beyuControl: string;
  implementation: string;
  test: string;
  evidence: string;
  status: ComplianceStatus;
  owner: string;
  residualRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  externalAssessment: "REQUIRED" | "NOT_REQUIRED";
  notes: string;
};

export const NOELIA_STANDARDS_MATRIX: StandardsRow[] = [
  {
    framework: "EU_AI_ACT",
    requirement: "AI system inventory and intended purpose",
    applicability: "Potentially applicable to a controlled enterprise AI platform; exact classification requires legal analysis.",
    beyuControl: "NOELIA-AI-CTRL-001/012/014",
    implementation: "Noelia identity, provider/model registry, routing decisions.",
    test: "tests/noelia/runtime-governed-model.test.ts",
    evidence: "AI identity + model/provider inventory exist; no legal classification is asserted.",
    status: "PARTIALLY_IMPLEMENTED",
    owner: "AI GOVERNANCE",
    residualRisk: "HIGH",
    externalAssessment: "REQUIRED",
    notes: "Actual EU AI Act applicability depends on a legal applicability assessment, which is not claimed here.",
  },
  {
    framework: "ISO_42001",
    requirement: "AI management system controls and evidence",
    applicability: "Relevant once an AI MS is formally established.",
    beyuControl: "NOELIA-AI-CTRL-004/005/007/012",
    implementation: "Lifecycle, provenance, governance, audit controls are implementable and testable.",
    test: "tests/noelia/model-lifecycle.test.ts",
    evidence: "Control register + source/tests/evidence mapping exists; certification is NOT claimed.",
    status: "PARTIALLY_IMPLEMENTED",
    owner: "AI GOVERNANCE",
    residualRisk: "MEDIUM",
    externalAssessment: "REQUIRED",
    notes: "Independent ISO/IEC 42001 certification has not been performed.",
  },
  {
    framework: "NIST_AI_RMF",
    requirement: "GOVERN / MAP / MEASURE / MANAGE",
    applicability: "Applicable as a risk-management alignment model.",
    beyuControl: "NOELIA-AI-CTRL-002/007/010/012",
    implementation: "AI risk register, routing policy, output governance, tenant isolation evidence.",
    test: "tests/noelia/ai-platform.test.ts, tests/noelia/adversarial-ai-security.test.ts",
    evidence: "Controls align to RMF functions; this is ALIGNED/IMPLEMENTED, not certification.",
    status: "PARTIALLY_IMPLEMENTED",
    owner: "AI SECURITY",
    residualRisk: "MEDIUM",
    externalAssessment: "REQUIRED",
    notes: "NIST AI RMF is not a certification.",
  },
  {
    framework: "ISO_23894",
    requirement: "AI risk management terminology and process",
    applicability: "Relevant to the AI risk register and risk assessment process.",
    beyuControl: "NOELIA-AI-CTRL-004/005/006",
    implementation: "AI risk register, lifecycle risk status, provenance risk status.",
    test: "tests/noelia/ai-platform.test.ts",
    evidence: "Risk register records are honest and evidence-focused.",
    status: "PARTIALLY_IMPLEMENTED",
    owner: "AI GOVERNANCE",
    residualRisk: "MEDIUM",
    externalAssessment: "REQUIRED",
    notes: "Not certified; alignment is internal.",
  },
  {
    framework: "ISO_27001",
    requirement: "Information security controls where AI processes data",
    applicability: "Where AI handles protected enterprise data.",
    beyuControl: "NOELIA-AI-CTRL-010/011/013",
    implementation: "Runtime-role RLS, cross-OS authorization, replay protection.",
    test: "tests/noelia/adversarial-ai-security.test.ts",
    evidence: "Tenant isolation and cross-OS authorization proven at the database boundary.",
    status: "PARTIALLY_IMPLEMENTED",
    owner: "DATABASE SECURITY",
    residualRisk: "MEDIUM",
    externalAssessment: "REQUIRED",
    notes: "ISO/IEC 27001 certification is independent and not claimed.",
  },
  {
    framework: "ISO_22989",
    requirement: "AI concepts and terminology consistency",
    applicability: "Supporting standard for accurate AI identity/terminology.",
    beyuControl: "NOELIA-AI-CTRL-001/003",
    implementation: "AIModelKind distinguishes DETERMINISTIC_ANALYST vs GENERATIVE_MODEL.",
    test: "tests/noelia/provider-contract.test.ts",
    evidence: "Deterministic analyst is never classified as a foundation/generative model.",
    status: "IMPLEMENTED",
    owner: "AI GOVERNANCE",
    residualRisk: "LOW",
    externalAssessment: "NOT_REQUIRED",
    notes: "Terminology alignment is internal.",
  },
];

export const NOELIA_COMPLIANCE_STATUS = {
  eu_ai_act_readiness: "PARTIAL",
  iso_42001_readiness: "PARTIAL",
  nist_ai_rmf_alignment: "PARTIAL",
  international_standards_readiness: "PARTIAL",
  external_assessment_status: "NOT_STARTED",
  actual_certification_status: "NOT_CERTIFIED",
} as const;

export type ComplianceSummary = {
  totalControls: number;
  implemented: number;
  verified: number;
  partial: number;
  blocked: number;
  evidenceMissing: number;
  assessmentRequired: number;
  status: typeof NOELIA_COMPLIANCE_STATUS;
};

export function complianceSummary(): ComplianceSummary {
  const controls = NOELIA_CONTROLS;
  return {
    totalControls: controls.length,
    implemented: controls.filter((c) => c.status === "IMPLEMENTED").length,
    verified: controls.filter((c) => c.status === "VERIFIED").length,
    partial: controls.filter((c) => c.status === "PARTIALLY_IMPLEMENTED").length,
    blocked: controls.filter((c) => c.status === "BLOCKED").length,
    evidenceMissing: controls.filter((c) => c.status === "EVIDENCE_REQUIRED" || c.status === "EXTERNAL_ASSESSMENT_REQUIRED").length,
    assessmentRequired: controls.filter((c) => c.assessmentRequirement === "EXTERNAL").length,
    status: NOELIA_COMPLIANCE_STATUS,
  };
}
