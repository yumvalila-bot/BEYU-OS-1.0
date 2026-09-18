/**
 * BEYU OS — P4 Release Approvals (canonical)
 *
 * WHAT THIS IS
 * ────────────
 * The governed approval instrument for controlled release transitions.
 * A PROMOTED, SWITCHED or CONTRACTED release state must carry attributable
 * approval EVIDENCE from a principal OTHER than the actor performing the
 * transition (four-eyes separation). Deployments and rollbacks carry scoped
 * approvals the same way.
 *
 * WHAT THIS IS NOT
 * ────────────────
 * An approval never *grants* authorization. The acting principal still needs
 * RBAC (`platform:config.manage` via `guarded()`), ABAC and policy still apply,
 * the release state machine still enforces DEPLOYED ≠ VERIFIED ≠ PROMOTED, and
 * PostgreSQL RLS remains the final data-isolation boundary. An approval only
 * satisfies the state machine's evidence requirement; it cannot substitute for
 * any other control.
 *
 * Fail-closed: when no valid approval exists, the transition is denied with an
 * explicit APPROVAL_REQUIRED reason. Expired or revoked approvals never count.
 * The approver MUST NOT be the actor (self-approval is structurally rejected).
 */

import type { ReleaseState } from "./types";

export type ApprovalScope = "DEPLOY" | "PROMOTE" | "ROLLBACK" | "CONTRACT";

export type ApprovalDecision = "APPROVED" | "REVOKED" | "REJECTED";

export interface ReleaseApprovalRecord {
  id: string;
  releaseId: string;
  environment: string;
  scope: ApprovalScope;
  decision: ApprovalDecision;
  approverId: string;
  approverType: "HUMAN" | "SERVICE" | "AI" | "SYSTEM";
  justification: string;
  evidence?: Record<string, unknown> | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Which target states require which approval scope. ONE authoritative map —
 * the API layer and the state machine documentation both derive from this, so
 * they can never disagree.
 *
 * PROMOTED / SWITCHED move production exposure (the governed PROMOTE verb).
 * CONTRACTED removes schema surface (irreversible-adjacent, always gated).
 * DEPLOYED / ROLLED_BACK may be approved in advance via their own scopes but
 * are NOT hard-required by the state machine: deployments are executed by the
 * governed pipeline identity and rollbacks are themselves the safety response.
 */
export const APPROVAL_REQUIRED_STATES: Readonly<Record<string, ApprovalScope>> = {
  PROMOTED: "PROMOTE",
  SWITCHED: "PROMOTE",
  CONTRACTED: "CONTRACT",
};

/** States for which an approval is a hard, blocking requirement. */
export function requiresApproval(nextState: ReleaseState): boolean {
  return nextState in APPROVAL_REQUIRED_STATES;
}

export function requiredApprovalScope(nextState: ReleaseState): ApprovalScope | null {
  return APPROVAL_REQUIRED_STATES[nextState] ?? null;
}

function isExpired(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return true; // unparseable bound fails closed
  return t <= now.getTime();
}

export interface ApprovalEvaluationInput {
  nextState: ReleaseState;
  releaseId: string;
  environment: string;
  /** The principal performing the transition — must differ from the approver. */
  actorId: string;
  /** All approval records known for this release (any decision). */
  approvals: ReleaseApprovalRecord[];
  now?: Date;
}

export type ApprovalEvaluationResult =
  | { satisfied: true; scope: ApprovalScope | null; approvalId: string | null }
  | {
      satisfied: false;
      scope: ApprovalScope | null;
      approvalId: null;
      reason:
        | "APPROVAL_REQUIRED"
        | "NO_ACTIVE_APPROVAL"
        | "SELF_APPROVAL_NOT_PERMITTED"
        | "APPROVAL_EXPIRED"
        | "APPROVAL_REVOKED";
      requiredScope: ApprovalScope | null;
    };

/**
 * Pure, DB-free evaluation of the approval requirement for a transition.
 * Deterministic; used by the API layer and by tests.
 */
export function evaluateApproval(input: ApprovalEvaluationInput): ApprovalEvaluationResult {
  const now = input.now ?? new Date();
  const scope = requiredApprovalScope(input.nextState);

  if (!scope) {
    return { satisfied: true, scope: null, approvalId: null };
  }

  const candidates = input.approvals.filter(
    (a) => a.releaseId === input.releaseId && a.scope === scope,
  );

  // Most recent decision per approver wins (a REVOKED from an approver supersedes
  // that approver's earlier APPROVED); then any surviving APPROVED qualifies.
  const activeApproved = candidates
    .filter((a) => a.decision === "APPROVED")
    .filter((a) => !isExpired(a.expiresAt, now))
    .filter((a) => {
      const laterRevocations = candidates.filter(
        (c) =>
          c.approverId === a.approverId &&
          c.decision === "REVOKED" &&
          Date.parse(c.createdAt) > Date.parse(a.createdAt),
      );
      return laterRevocations.length === 0;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const nonSelf = activeApproved.filter((a) => a.approverId !== input.actorId);

  if (activeApproved.length === 0) {
    // Distinguish plain absence from every-candidate-expired for actionable evidence.
    const anyEver = candidates.length > 0;
    return {
      satisfied: false,
      scope,
      approvalId: null,
      reason: anyEver ? "APPROVAL_EXPIRED" : "NO_ACTIVE_APPROVAL",
      requiredScope: scope,
    };
  }

  if (nonSelf.length === 0) {
    return {
      satisfied: false,
      scope,
      approvalId: null,
      reason: "SELF_APPROVAL_NOT_PERMITTED",
      requiredScope: scope,
    };
  }

  return { satisfied: true, scope, approvalId: nonSelf[0].id };
}

/**
 * Structural validation applied when RECORDING an approval (not when consuming).
 * A rejected/revoked decision requires a justification too — the reason matters
 * for audit.
 */
export function validateApprovalInput(input: {
  releaseId: string;
  environment: string;
  scope: ApprovalScope;
  decision: ApprovalDecision;
  approverId: string;
  justification: string;
  expiresAt?: string | null;
}): { valid: boolean; reason: string | null } {
  if (!input.releaseId) return { valid: false, reason: "releaseId is required" };
  if (!input.environment) return { valid: false, reason: "environment is required" };
  if (!input.approverId) return { valid: false, reason: "approverId is required" };
  if (!input.justification || input.justification.trim().length === 0) {
    return { valid: false, reason: "justification is mandatory for every approval decision" };
  }
  if (!["DEPLOY", "PROMOTE", "ROLLBACK", "CONTRACT"].includes(input.scope)) {
    return { valid: false, reason: `invalid scope: ${input.scope}` };
  }
  if (!["APPROVED", "REVOKED", "REJECTED"].includes(input.decision)) {
    return { valid: false, reason: `invalid decision: ${input.decision}` };
  }
  if (input.expiresAt) {
    const t = Date.parse(input.expiresAt);
    if (Number.isNaN(t)) return { valid: false, reason: "expiresAt is not a valid timestamp" };
    // An approval that is born expired is refused — it would be dead evidence.
    if (t <= Date.now()) return { valid: false, reason: "expiresAt must be in the future" };
  }
  return { valid: true, reason: null };
}
