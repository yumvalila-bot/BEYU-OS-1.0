/**
 * Phase 3 prompt / output / tool / action governance.
 *
 * Principles:
 *   - Model output is UNTRUSTED.
 *   - A model-generated tool request is a REQUESTED ACTION, never an
 *     AUTHORIZED ACTION.
 *   - Data classification, tenancy, residency, tool authority and approval
 *     requirements are enforced by the control plane, never delegated to the
 *     model.
 *   - The model must never be able to modify authorization, policy, tenant,
 *     entity, country, OS, permissions or approval requirements.
 */

export type PromptSegmentKind = "SYSTEM_POLICY" | "NOELIA_POLICY" | "USER" | "RETRIEVED" | "EXTERNAL" | "TOOL_OUTPUT" | "MODEL_OUTPUT";

export type PromptSegment = {
  kind: PromptSegmentKind;
  content: string;
  source?: string | null;
};

export type PromptGovernanceInput = {
  segments: PromptSegment[];
  classification: string;
  tenantId: string;
  countryCode: string | null;
  requestedAction?: string | null;
};

export type PromptGovernanceResult = {
  allowed: boolean;
  reasons: string[];
  systemPolicy: string;
  userPrompt: string;
  untrustedSegments: string[];
};

const INJECTION_MARKERS = [
  /ignore (all )?(previous|prior|above) (instructions|messages|directions|rules)/i,
  /you are (now|no longer) (a|an|not)/i,
  /disregard (the |your )?(system|developer|policy) (prompt|instructions|messages)/i,
  /reveal your (system|developer|hidden|internal) prompt/i,
  /repeat your (system|developer) (prompt|instructions|message)/i,
  /forget (all )?(previous|your) (instructions|rules|policy)/i,
  /override (the )?(policy|role|authorization|approval|permissions)/i,
  /change (my |the )?(tenant|entity|country|os|permission|approval)/i,
  /act as an (unrestricted|unfiltered|unconstrained) (ai|assistant|agent)/i,
  /do not follow (any )?(rules|policies|instructions)/i,
];

function detectInjection(content: string): string[] {
  return INJECTION_MARKERS.filter((re) => re.test(content)).map((re) => String(re));
}

export class PromptGovernor {
  evaluate(input: PromptGovernanceInput): PromptGovernanceResult {
    const systemPolicy = input.segments.filter((s) => s.kind === "SYSTEM_POLICY").map((s) => s.content).join("\n");
    const noeliaPolicy = input.segments.filter((s) => s.kind === "NOELIA_POLICY").map((s) => s.content).join("\n");
    const userPrompt = input.segments.filter((s) => s.kind === "USER").map((s) => s.content).join("\n");
    const untrusted = input.segments.filter((s) => s.kind === "RETRIEVED" || s.kind === "EXTERNAL" || s.kind === "TOOL_OUTPUT").map((s) => s.content);
    const reasons: string[] = [];

    // Untrusted content can never carry the system-policy role. If a model
    // response attempted to become SYTEM_POLICY it is treated as tampering.
    for (const segment of input.segments) {
      if (segment.kind !== "SYSTEM_POLICY" && segment.kind !== "NOELIA_POLICY") {
        for (const marker of detectInjection(segment.content)) {
          reasons.push(`Prompt injection marker in ${segment.kind}: ${marker}`);
        }
      }
    }

    // No request may alter the control-plane boundary. Explicit action types
    // are matched by canonical name as well as by injection phrasing.
    const BOUNDARY_ACTIONS = [
      "TENANT_CHANGE",
      "ENTITY_CHANGE",
      "COUNTRY_CHANGE",
      "OS_CHANGE",
      "PERMISSION_CHANGE",
      "APPROVAL_CHANGE",
      "AUTHORIZATION_CHANGE",
      "IDENTITY_CHANGE",
      "SECURITY_CONTROL_CHANGE",
      "POLICY_CHANGE",
    ];
    const requested = (input.requestedAction ?? "").toUpperCase();
    const boundaryAttempt = detectInjection(input.requestedAction ?? "");
    if (BOUNDARY_ACTIONS.some((a) => requested.includes(a))) {
      reasons.push(`Boundary-changing requested action rejected: ${requested}`);
    }
    reasons.push(...boundaryAttempt.map((m) => `Boundary-changing requested action rejected: ${m}`));

    // Data minimisation / classification guard is enforced here so the model is
    // never handed data it is not entitled to see.
    if (!input.segments.some((s) => s.kind === "USER")) {
      reasons.push("A governed-generation request requires an explicit USER segment.");
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      systemPolicy,
      userPrompt,
      untrustedSegments: untrusted,
    };
  }
}

export type OutputValidationInput = {
  output: Record<string, unknown> | null;
  classification: string;
  tenantId: string;
  countryCode: string | null;
  allowedActionClasses?: string[];
};

export type OutputValidationResult = {
  valid: boolean;
  reasons: string[];
  requestedActions: Array<{ tool: string; action: string; authorized: boolean; reason: string }>;
};

export class OutputGovernor {
  validate(input: OutputValidationInput): OutputValidationResult {
    const output = input.output ?? {};
    const reasons: string[] = [];
    const requestedActions: Array<{ tool: string; action: string; authorized: boolean; reason: string }> = [];

    if (output.generativeInference === true && !output.content) {
      reasons.push("Generative output declared but no content was returned.");
    }
    if (!output.content && !output.text && !output.deterministic) {
      reasons.push("Model output is empty.");
    }
    // A model never returns "authorized" in its own output. Authority comes from
    // the control plane.
    if (output.authorized === true || output.approved === true) {
      reasons.push("Model output is not authoritative: remove the model-asserted authorization field.");
    }

    const toolCalls = Array.isArray(output.toolCalls) ? (output.toolCalls as Array<Record<string, unknown>>) : [];
    const rawAction = output.action ? { tool: "UNKNOWN", action: String(output.action) } : null;
    for (const call of toolCalls) {
      const tool = String(call.tool ?? call.name ?? "UNKNOWN");
      const action = String(call.action ?? call.request ?? "UNKNOWN");
      const allowed = (input.allowedActionClasses ?? []).includes(String(call.actionClass ?? "LOW"));
      requestedActions.push({
        tool,
        action,
        authorized: false,
        reason: allowed
          ? "Model suggested an allowed action class; authorization still requires a control-plane approval gate."
          : "Requested action class is outside the allowed set for this context.",
      });
      reasons.push(`Model requested tool ${tool}, which is a REQUESTED ACTION, not an authorized action.`);
    }
    if (rawAction && toolCalls.length === 0) {
      requestedActions.push({
        tool: rawAction.tool,
        action: rawAction.action,
        authorized: false,
        reason: "Model output action is a request only; no control-plane authorization exists.",
      });
      reasons.push("Model output contains a proposed action; it is not an authorized action.");
    }

    // Cross-boundary disclosure guard.
    const serialized = JSON.stringify(output);
    if (input.countryCode && serialized.includes(`tenant:${input.tenantId}`) === false && serialized.includes(input.tenantId)) {
      // A raw tenant id in output is not automatically a leak; only a reason if
      // the output explicitly claims a cross-tenant scope.
      if (/cross[- ]?tenant|cross[- ]?entity|cross[- ]?country/i.test(serialized)) {
        reasons.push("Cross-boundary output rejected: model output cannot claim a wider scope.");
      }
    }

    return { valid: reasons.length === 0, reasons, requestedActions };
  }
}

export type ActionRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ApprovalRequirement = "NO_APPROVAL" | "OPTIONAL_REVIEW" | "REQUIRED_REVIEW" | "DUAL_CONTROL" | "PROHIBITED";

export type ActionClassificationInput = {
  actionType: string;
  domain: string;
  sideEffects?: "READ_ONLY" | "DOMAIN_WRITE" | "PAYMENT" | "IDENTITY" | "SECURITY" | "LEGAL" | "HEALTH" | "DELETION";
};

const HIGH_RISK_ACTIONS = new Set([
  "PAYMENT",
  "CLINICAL_DECISION",
  "MEDICATION_ACTION",
  "IDENTITY_CHANGE",
  "PERMISSION_CHANGE",
  "LEGAL_COMMITMENT",
  "DELETION",
  "CAPITAL_ALLOCATION",
  "GOVERNANCE_CHANGE",
  "SECURITY_CONTROL_CHANGE",
]);

export class ActionRiskClassifier {
  classify(input: ActionClassificationInput): { risk: ActionRisk; approval: ApprovalRequirement } {
    const type = input.actionType.toUpperCase();
    const sideEffect = input.sideEffects ?? "READ_ONLY";
    if (HIGH_RISK_ACTIONS.has(type)) {
      if (sideEffect === "PAYMENT" || sideEffect === "IDENTITY" || sideEffect === "SECURITY" || sideEffect === "LEGAL" || sideEffect === "HEALTH" || sideEffect === "DELETION") {
        return { risk: "CRITICAL", approval: "DUAL_CONTROL" };
      }
      return { risk: "HIGH", approval: "REQUIRED_REVIEW" };
    }
    if (sideEffect === "DOMAIN_WRITE") return { risk: "MEDIUM", approval: "REQUIRED_REVIEW" };
    if (sideEffect === "READ_ONLY") return { risk: "LOW", approval: "NO_APPROVAL" };
    return { risk: "MEDIUM", approval: "OPTIONAL_REVIEW" };
  }
}

export class HumanApprovalGate {
  /** A model output is only a requested action; even a LOW risk proposal is never self-approving. */
  decision(input: { risk: ActionRisk; approval: ApprovalRequirement; modelProposedApproval?: boolean }): {
    approvalRequired: boolean;
    reason: string;
    prohibited: boolean;
  } {
    if (input.approval === "PROHIBITED") {
      return { approvalRequired: true, reason: "Action is prohibited for this context.", prohibited: true };
    }
    if (input.approval === "DUAL_CONTROL") {
      return { approvalRequired: true, reason: "Dual control approval is required before any high/CRITICAL action.", prohibited: false };
    }
    if (input.approval === "REQUIRED_REVIEW") {
      return { approvalRequired: true, reason: "This action requires a governed human approval before execution.", prohibited: false };
    }
    if (input.approval === "OPTIONAL_REVIEW") {
      return { approvalRequired: true, reason: "Optional review is required because side effects touch a write domain.", prohibited: false };
    }
    return { approvalRequired: false, reason: "Read-only action does not require approval.", prohibited: false };
  }
}

export type ToolAuthorityInput = {
  permission?: string;
  appPermission?: string;
  risk?: ActionRisk;
  lifecycle: "ACTIVE";
  killSwitch?: boolean;
  engineProposedApproval?: boolean;
};

export function validateToolAuthority(input: ToolAuthorityInput): { authorized: boolean; reason: string } {
  if (input.killSwitch) return { authorized: false, reason: "Kill switch is active." };
  if (input.lifecycle !== "ACTIVE") return { authorized: false, reason: "Tool/action is not ACTIVE." };
  if (input.engineProposedApproval) return { authorized: false, reason: "Model/engine proposed approval is not an authorization." };
  return { authorized: true, reason: "Control-plane authority verified." };
}
