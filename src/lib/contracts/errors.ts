/**
 * BEYU OS — Governed contracting domain error contract.
 *
 * Mirrors the canonical EquityError/GovernanceError pattern: typed codes, a
 * stable code → HTTP status map, and domain-safe messages only. No SQL, driver
 * or schema detail ever crosses the HTTP boundary; the pure engine's structured
 * detail is passed through unchanged because it is domain vocabulary, not
 * infrastructure.
 */

export type ContractErrorCode =
  | "NOT_FOUND"
  | "TENANT_SCOPE_DENIED"
  | "FORBIDDEN"
  | "CLASSIFICATION_DENIED"
  | "POLICY_DENIED"
  | "RULE_VIOLATION"
  | "CONFLICT"
  /** A governed prerequisite (resolution, approval, closed review gate) is missing. */
  | "GOVERNANCE_NOT_SATISFIED"
  /** Legal review has not been closed by a human lawyer (§23, §74). */
  | "LEGAL_REVIEW_REQUIRED"
  /** The record cannot accept the requested lifecycle transition. */
  | "INVALID_STATE"
  /** Evidence required by the program was not supplied (§51: no evidence = not proven). */
  | "EVIDENCE_REQUIRED"
  /** Authority determinations are blocked (thresholds, restrictions, conflicts). */
  | "AUTHORITY_BLOCKED"
  /** An on-chain or oracle input was refused (unverified registry, stale feed, dispute pause). */
  | "EXECUTION_BLOCKED"
  | "MODEL_ERROR";

export const CONTRACT_ERROR_STATUS: Record<ContractErrorCode, number> = {
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
  AUTHORITY_BLOCKED: 422,
  EXECUTION_BLOCKED: 422,
  MODEL_ERROR: 422,
};

export class ContractError extends Error {
  constructor(
    readonly code: ContractErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ContractError";
  }
}
