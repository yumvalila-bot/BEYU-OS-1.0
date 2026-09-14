/**
 * BEYU OS — Equity domain error contract (X10THINK Phase 2).
 *
 * Mirrors the canonical GovernanceError pattern: typed codes, a stable
 * code → HTTP status map, domain-safe messages only (no SQL, driver or schema
 * detail ever crosses the boundary).
 */

export type EquityErrorCode =
  | "NOT_FOUND"
  | "TENANT_SCOPE_DENIED"
  | "FORBIDDEN"
  | "CLASSIFICATION_DENIED"
  | "POLICY_DENIED"
  | "RULE_VIOLATION"
  | "CONFLICT"
  /** A governed prerequisite (resolution/approval/legal review) is missing. */
  | "GOVERNANCE_NOT_SATISFIED"
  /** Legal review has not been closed by a human lawyer (§48). */
  | "LEGAL_REVIEW_REQUIRED"
  /** The object cannot accept the requested lifecycle transition. */
  | "INVALID_STATE"
  /** Evidence required by the program was not supplied (§21: no evidence = not proven). */
  | "EVIDENCE_REQUIRED"
  | "MODEL_ERROR";

export const EQUITY_ERROR_STATUS: Record<EquityErrorCode, number> = {
  NOT_FOUND: 404,
  TENANT_SCOPE_DENIED: 403,
  FORBIDDEN: 403,
  CLASSIFICATION_DENIED: 403,
  POLICY_DENIED: 403,
  RULE_VIOLATION: 422,
  CONFLICT: 409,
  GOVERNANCE_NOT_SATISFIED: 422,
  LEGAL_REVIEW_REQUIRED: 422,
  INVALID_STATE: 422,
  EVIDENCE_REQUIRED: 422,
  MODEL_ERROR: 422,
};

export class EquityError extends Error {
  constructor(
    readonly code: EquityErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EquityError";
  }
}
