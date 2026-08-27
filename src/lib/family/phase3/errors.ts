/**
 * BEYU OS — Family Institution Phase 3A error taxonomy.
 *
 * Phase 3A technical architecture specification §37. Technical error names and
 * transport metadata only. This module encodes NO policy value: every code is
 * a technical outcome of a boundary, a gate, or a structural invariant.
 *
 * Policy-dependent codes (e.g. POLICY_DECISION_REQUIRED) carry the FIR
 * reference(s) that must ratify — they never carry a default answer.
 */

export type FamilyErrorCode =
  | "UNAUTHENTICATED"
  | "PERMISSION_DENIED"
  | "TENANT_ISOLATION_DENIED"
  | "CLASSIFICATION_DENIED"
  | "STEP_UP_REQUIRED"
  | "HUMAN_ACTOR_REQUIRED"
  | "POLICY_DECISION_REQUIRED"
  | "ARCHITECTURE_DECISION_REQUIRED"
  | "AUTHORITY_UNPROVEN"
  | "EVIDENCE_INSUFFICIENT"
  | "DUPLICATE_IDENTITY_DENIED"
  | "LINEAGE_GRAPH_INVALID"
  | "SUPERIOR_INSTRUMENT_CONFLICT"
  | "TRUSTEE_RESERVED_MATTER_DENIED"
  | "AI_AUTHORITY_DENIED"
  | "POLICY_INVENTION_REFUSED"
  | "FINANCE_BOUNDARY_VIOLATION"
  | "EFFECTIVE_PERIOD_CONFLICT"
  | "IDEMPOTENCY_REPLAY"
  | "INSTRUCTION_SUBMISSION_REJECTED";

export type FamilyErrorRetryAfter =
  | "NEVER"
  | "AFTER_STEP_UP"
  | "AFTER_RATIFICATION"
  | "AFTER_INPUT_FIX"
  | "PER_REJECTING_OWNER";

export interface FamilyErrorMeta {
  httpStatus: number;
  retryable: boolean;
  retryAfter: FamilyErrorRetryAfter;
  /** Denial-class errors must always be auditable (spec §37.2). */
  audited: boolean;
  description: string;
}

export const FAMILY_ERROR_TAXONOMY: Record<FamilyErrorCode, FamilyErrorMeta> = {
  UNAUTHENTICATED: {
    httpStatus: 401,
    retryable: false,
    retryAfter: "NEVER",
    audited: false,
    description: "No valid session.",
  },
  PERMISSION_DENIED: {
    httpStatus: 403,
    retryable: false,
    retryAfter: "NEVER",
    audited: false,
    description: "Permission or clearance failure.",
  },
  TENANT_ISOLATION_DENIED: {
    httpStatus: 403,
    retryable: false,
    retryAfter: "NEVER",
    audited: true,
    description: "Cross-tenant scope violation; cross-tenant semantics remain POLICY DECISION REQUIRED (FIR-002).",
  },
  CLASSIFICATION_DENIED: {
    httpStatus: 403,
    retryable: false,
    retryAfter: "NEVER",
    audited: false,
    description: "Clearance below row classification.",
  },
  STEP_UP_REQUIRED: {
    httpStatus: 428,
    retryable: true,
    retryAfter: "AFTER_STEP_UP",
    audited: false,
    description: "MFA/step-up pending.",
  },
  HUMAN_ACTOR_REQUIRED: {
    httpStatus: 409,
    retryable: false,
    retryAfter: "NEVER",
    audited: true,
    description: "A human-only act was attempted by a non-human actor.",
  },
  POLICY_DECISION_REQUIRED: {
    httpStatus: 422,
    retryable: true,
    retryAfter: "AFTER_RATIFICATION",
    audited: true,
    description: "A required policy value is unratified; fail closed (FC-1). Carries the FIR reference(s).",
  },
  ARCHITECTURE_DECISION_REQUIRED: {
    httpStatus: 500,
    retryable: false,
    retryAfter: "NEVER",
    audited: true,
    description: "A technical invariant is undetermined; design defect, never a production expectation.",
  },
  AUTHORITY_UNPROVEN: {
    httpStatus: 409,
    retryable: true,
    retryAfter: "AFTER_INPUT_FIX",
    audited: true,
    description: "Missing or invalid resolution/delegation/instrument reference.",
  },
  EVIDENCE_INSUFFICIENT: {
    httpStatus: 409,
    retryable: true,
    retryAfter: "AFTER_INPUT_FIX",
    audited: true,
    description: "Evidence standard not met, or unassessable before ratification.",
  },
  DUPLICATE_IDENTITY_DENIED: {
    httpStatus: 409,
    retryable: false,
    retryAfter: "NEVER",
    audited: true,
    description: "Party is already a family member or duplicates a canonical party.",
  },
  LINEAGE_GRAPH_INVALID: {
    httpStatus: 409,
    retryable: true,
    retryAfter: "AFTER_INPUT_FIX",
    audited: false,
    description: "Cycle, depth, or duplicate-parent violation in descent input.",
  },
  SUPERIOR_INSTRUMENT_CONFLICT: {
    httpStatus: 409,
    retryable: false,
    retryAfter: "NEVER",
    audited: true,
    description: "Provision or amendment conflicts with a superior instrument (I-08).",
  },
  TRUSTEE_RESERVED_MATTER_DENIED: {
    httpStatus: 409,
    retryable: false,
    retryAfter: "NEVER",
    audited: true,
    description: "A family body attempted a matter reserved to trustees (I-08).",
  },
  AI_AUTHORITY_DENIED: {
    httpStatus: 409,
    retryable: false,
    retryAfter: "NEVER",
    audited: true,
    description: "An AI actor attempted an authority action (FIR-017 boundary).",
  },
  POLICY_INVENTION_REFUSED: {
    httpStatus: 409,
    retryable: false,
    retryAfter: "NEVER",
    audited: true,
    description: "Code or AI attempted to supply a policy value that is not ratified (I-12).",
  },
  FINANCE_BOUNDARY_VIOLATION: {
    httpStatus: 409,
    retryable: false,
    retryAfter: "NEVER",
    audited: true,
    description: "A family-side write attempted financial state (FIR-018 boundary).",
  },
  EFFECTIVE_PERIOD_CONFLICT: {
    httpStatus: 409,
    retryable: true,
    retryAfter: "AFTER_INPUT_FIX",
    audited: false,
    description: "Effective-period overlap; pre-ratification overlaps are recorded, not policy-enforced (FIR-010).",
  },
  IDEMPOTENCY_REPLAY: {
    httpStatus: 200,
    retryable: false,
    retryAfter: "NEVER",
    audited: true,
    description: "Replay of a submitted instruction; the original reference is returned.",
  },
  INSTRUCTION_SUBMISSION_REJECTED: {
    httpStatus: 409,
    retryable: true,
    retryAfter: "PER_REJECTING_OWNER",
    audited: true,
    description: "Finance/legal hand-off rejected; the rejecting owner's reason governs.",
  },
};

export const FAMILY_ERROR_CODES = Object.keys(FAMILY_ERROR_TAXONOMY) as FamilyErrorCode[];

export function isFamilyErrorCode(value: string): value is FamilyErrorCode {
  return (FAMILY_ERROR_CODES as string[]).includes(value);
}

/**
 * Base error for the Family Institution domain. Carries the taxonomy code,
 * the HTTP mapping, and — for policy-gated failures — the FIR reference(s).
 */
export class FamilyError extends Error {
  constructor(
    readonly code: FamilyErrorCode,
    message: string,
    readonly firRefs: readonly string[] = [],
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FamilyError";
  }

  get httpStatus(): number {
    return FAMILY_ERROR_TAXONOMY[this.code].httpStatus;
  }

  get meta(): FamilyErrorMeta {
    return FAMILY_ERROR_TAXONOMY[this.code];
  }
}

/**
 * The standard fail-closed error (spec §36 FC-1). Thrown whenever a required
 * policy value is unratified. The message and `firRefs` name exactly what
 * must be ratified — never a default answer.
 */
export class PolicyDecisionRequiredError extends FamilyError {
  constructor(firRefs: readonly string[], message?: string) {
    super(
      "POLICY_DECISION_REQUIRED",
      message ??
        `POLICY DECISION REQUIRED. Ratification is required for: ${firRefs.join(", ")}. ` +
          "No write, no approval, no execution, no financial consequence, no legal-status change.",
      firRefs,
    );
    this.name = "PolicyDecisionRequiredError";
  }
}

export function familyError(
  code: FamilyErrorCode,
  message: string,
  firRefs: readonly string[] = [],
  detail?: Record<string, unknown>,
): FamilyError {
  return new FamilyError(code, message, firRefs, detail);
}

export function isFamilyError(value: unknown): value is FamilyError {
  return value instanceof FamilyError;
}
