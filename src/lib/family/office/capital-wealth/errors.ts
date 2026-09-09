/**
 * BEYU OS — Family Office capital & wealth error taxonomy.
 *
 * This layer owns its own error type deliberately. It must NOT import the Phase 3A
 * Family Institution error module: that layer is DORMANT and unratified, and the
 * architecture guard in the Phase 3A boundary suite ("no non-test src file imports
 * Phase 3A infrastructure") forbids any production-surface file from depending on
 * it — including by path reference in prose, which is why this comment names the
 * layer by description rather than by path.
 *
 * A production domain importing dormant infrastructure would activate code that has
 * not been ratified. So the capital domain declares the refusals it needs here, in
 * its own namespace, with codes that mean the same things.
 *
 * These are not validation errors on user input. They are refusals of
 * architecturally forbidden operations — no amount of correct input makes them
 * permitted.
 */

export type FamilyCapitalErrorCode =
  /** An AI actor attempted to clear a step that requires human authority (§24, FIR-017). */
  | "AI_AUTHORITY_DENIED"
  /** A step required an authority reference and none was supplied. Missing authority is never approval (§42). */
  | "AUTHORITY_UNPROVEN"
  /** The actor lacks the permission or violates segregation of duties (§39/§40). */
  | "PERMISSION_DENIED"
  /** A rationale rested on doctrine or metaphor instead of matter-specific evidence (§5, §6, §44). */
  | "EVIDENCE_INSUFFICIENT"
  /** A closed catalogue was given an unknown value; extending it is an architecture decision. */
  | "ARCHITECTURE_DECISION_REQUIRED";

export class FamilyCapitalGovernanceError extends Error {
  constructor(
    readonly code: FamilyCapitalErrorCode,
    message: string,
    /** The doctrine principles the refusal rests on, where it rests on any. */
    readonly principleRefs: readonly string[] = [],
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "FamilyCapitalGovernanceError";
  }
}

/**
 * Build a capital-domain governance refusal.
 *
 * Signature-compatible with the refusals this layer previously borrowed, so the
 * call sites read the same and the boundary is enforced by the type system rather
 * than by a reviewer remembering not to import the dormant layer.
 */
export function capitalGovernanceError(
  code: FamilyCapitalErrorCode,
  message: string,
  principleRefs: readonly string[] = [],
  detail?: Record<string, unknown>,
): FamilyCapitalGovernanceError {
  return new FamilyCapitalGovernanceError(code, message, principleRefs, detail);
}

export function isFamilyCapitalGovernanceError(value: unknown): value is FamilyCapitalGovernanceError {
  return value instanceof FamilyCapitalGovernanceError;
}
