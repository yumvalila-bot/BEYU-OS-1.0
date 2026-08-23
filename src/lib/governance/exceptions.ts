/**
 * BEYU OS — Governance exception framework (Governance Phase 10).
 *
 * THE GAP THIS CLOSES. Grep for "exception" across `src/lib/` before this module and the only hits
 * are in the compliance specialist, where an "exception" means a failed control finding. There was
 * no way to express "this policy does not apply here, for this reason, until this date, approved
 * by this authority" — so any real-world deviation would have to be handled by changing the policy
 * itself, which destroys the record that the policy ever said otherwise.
 *
 * THE TWO PROPERTIES THAT MATTER:
 *
 *   1. AN EXCEPTION NEVER MODIFIES THE UNDERLYING POLICY. It sits alongside it. `applyException()`
 *      returns the policy unchanged plus a separate, dated, attributed carve-out. The policy text
 *      is returned byte-identical, and a test asserts it.
 *
 *   2. AN EXPIRED EXCEPTION AUTOMATICALLY CEASES TO APPLY. No job, no sweep, no manual step —
 *      applicability is evaluated from the dates at read time. An exception that needed to be
 *      revoked to stop working would be a permanent backdoor with a reminder attached.
 *
 * EMERGENCY OVERRIDE IS DELIBERATELY THE MOST CONSTRAINED KIND. It requires a hard expiry (no
 * open-ended emergency), is capped at MAX_EMERGENCY_DAYS, and is refused if a prior emergency for
 * the same policy has already been used — which is how "emergency" becomes "normal".
 *
 * NO TABLE. Exceptions are evaluated from values passed in. Persisting them belongs to a ratified
 * governance process; creating the store now would imply an approval workflow nobody authorised.
 */
import { checksumOf } from "@/lib/crypto";

export const EXCEPTION_VERSION = "exceptions-1.0.0";

/**
 * The kinds of deviation, ordered by how much they weaken the control.
 * They are NOT interchangeable: a WAIVER forgives a past breach, an EXCEPTION permits a future
 * deviation, and a POLICY_CHANGE is not an exception at all.
 */
export const EXCEPTION_KIND = [
  /** Time-boxed deviation from an otherwise applicable policy. */
  "TEMPORARY_EXCEPTION",
  /** Forgiveness of a specific past breach. Does not permit future deviation. */
  "WAIVER",
  /** Immediate deviation under urgency. Hardest constraints. */
  "EMERGENCY_OVERRIDE",
  /** A recorded breach awaiting remediation. Permits nothing. */
  "BREACH",
  /** Not an exception: a permanent change requires amending the policy under authority. */
  "PERMANENT_POLICY_CHANGE",
] as const;
export type ExceptionKind = (typeof EXCEPTION_KIND)[number];

export const EXCEPTION_DECISION = [
  "APPLIES",
  "NOT_APPLICABLE",
  "EXPIRED",
  "NOT_YET_EFFECTIVE",
  "REVOKED",
  "REQUIRES_AUTHORITY",
  "MISSING_EVIDENCE",
  "MISSING_RATIONALE",
  "EMERGENCY_LIMIT_EXCEEDED",
  "EMERGENCY_REQUIRES_EXPIRY",
  "NOT_AN_EXCEPTION",
  "SCOPE_MISMATCH",
] as const;
export type ExceptionDecision = (typeof EXCEPTION_DECISION)[number];

/** Maximum life of an emergency override. Beyond this it is a policy change, not an emergency. */
export const MAX_EMERGENCY_DAYS = 30;

export type GovernanceException = {
  exceptionId: string;
  kind: ExceptionKind;
  /** The policy this deviates from. Never modified. */
  policyId: string;
  policyVersion: string | null;
  ownerUserId: string;
  /** The governance record authorising the deviation. */
  approvedByResolutionId: string | null;
  approvedByBody: string | null;
  rationale: string;
  evidenceReference: string | null;
  tenantId: string | null;
  legalEntityId: string | null;
  effectiveFrom: string;
  /** Null means open-ended, which is refused for EMERGENCY_OVERRIDE. */
  effectiveTo: string | null;
  revokedAt: string | null;
  traceId: string | null;
};

export type ExceptionVerdict = {
  applies: boolean;
  decision: ExceptionDecision;
  exceptionId: string | null;
  kind: ExceptionKind | null;
  /** Deterministic identity of the exception's terms. */
  checksum: string | null;
  expiresOn: string | null;
  daysRemaining: number | null;
  reason: string;
  /** Always false. An exception never edits the policy it deviates from. */
  policyModified: false;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/**
 * Evaluates whether an exception applies right now.
 *
 * Order is deliberate: structural validity, then revocation, then dates, then scope. A revoked
 * exception inside its window must not apply, so revocation is checked before the window.
 */
export function evaluateException(
  ex: GovernanceException | null,
  request: {
    asOf: string;
    policyId: string;
    tenantId: string | null;
    legalEntityId: string | null;
    priorEmergenciesForPolicy?: number;
  },
): ExceptionVerdict {
  const fail = (decision: ExceptionDecision, reason: string): ExceptionVerdict => ({
    applies: false,
    decision,
    exceptionId: ex?.exceptionId ?? null,
    kind: ex?.kind ?? null,
    checksum: ex ? checksumOf([ex.exceptionId, ex.kind, ex.policyId, ex.effectiveFrom, ex.effectiveTo]) : null,
    expiresOn: ex?.effectiveTo ?? null,
    daysRemaining: null,
    reason,
    policyModified: false,
  });

  if (!ex) return fail("NOT_APPLICABLE", "No exception record was supplied.");

  if (!ISO_DATE.test(request.asOf) || !ISO_DATE.test(ex.effectiveFrom)) {
    return fail("NOT_APPLICABLE", "Dates must be ISO (YYYY-MM-DD); a malformed date is not coerced.");
  }

  // A permanent change is not an exception. Treating it as one would let a policy be permanently
  // altered without amending it.
  if (ex.kind === "PERMANENT_POLICY_CHANGE") {
    return fail(
      "NOT_AN_EXCEPTION",
      "A permanent policy change is not an exception. It requires amending the policy under " +
        "authority, so the change is versioned and visible rather than hidden in a carve-out.",
    );
  }

  // A breach records that something went wrong. It never permits anything.
  if (ex.kind === "BREACH") {
    return fail(
      "NOT_APPLICABLE",
      "A BREACH records a violation awaiting remediation; it does not permit the deviation.",
    );
  }

  if (!ex.rationale || ex.rationale.trim().length < 10) {
    return fail("MISSING_RATIONALE", "An exception requires a substantive recorded rationale.");
  }

  if (!ex.approvedByResolutionId && !ex.approvedByBody) {
    return fail(
      "REQUIRES_AUTHORITY",
      "The exception records no approving resolution or body. An unapproved exception is simply " +
        "a policy breach with better paperwork.",
    );
  }

  if (ex.kind === "EMERGENCY_OVERRIDE") {
    if (ex.effectiveTo === null) {
      return fail(
        "EMERGENCY_REQUIRES_EXPIRY",
        "An emergency override must have a hard expiry. An open-ended emergency is a permanent backdoor.",
      );
    }
    const span = daysBetween(ex.effectiveFrom, ex.effectiveTo);
    if (span > MAX_EMERGENCY_DAYS) {
      return fail(
        "EMERGENCY_LIMIT_EXCEEDED",
        `The override spans ${span} days, beyond the ${MAX_EMERGENCY_DAYS}-day emergency limit. ` +
          "A deviation lasting longer than that is a policy change and must be governed as one.",
      );
    }
    if ((request.priorEmergenciesForPolicy ?? 0) > 0) {
      return fail(
        "EMERGENCY_LIMIT_EXCEEDED",
        `${request.priorEmergenciesForPolicy} prior emergency override(s) already exist for ` +
          `${ex.policyId}. A repeated emergency is not an emergency; it is an unacknowledged ` +
          "policy gap and must be resolved by amending the policy.",
      );
    }
  }

  if (ex.revokedAt) {
    return fail("REVOKED", `The exception was revoked on ${ex.revokedAt} and no longer applies.`);
  }

  if (ex.policyId !== request.policyId) {
    return fail("NOT_APPLICABLE", `The exception is for ${ex.policyId}, not ${request.policyId}.`);
  }

  if (ex.effectiveFrom > request.asOf) {
    return fail("NOT_YET_EFFECTIVE", `The exception begins ${ex.effectiveFrom}, after ${request.asOf}.`);
  }

  // Automatic expiry: no revocation step is needed for a lapsed exception to stop applying.
  if (ex.effectiveTo !== null && ex.effectiveTo < request.asOf) {
    return fail(
      "EXPIRED",
      `The exception expired on ${ex.effectiveTo}. It ceased to apply automatically on that date; ` +
        "no revocation was required.",
    );
  }

  if (ex.tenantId !== null && request.tenantId !== null && ex.tenantId !== request.tenantId) {
    return fail("SCOPE_MISMATCH", `The exception is scoped to tenant ${ex.tenantId}.`);
  }
  if (ex.legalEntityId !== null && request.legalEntityId !== null && ex.legalEntityId !== request.legalEntityId) {
    return fail("SCOPE_MISMATCH", `The exception is scoped to entity ${ex.legalEntityId}.`);
  }

  if (ex.kind === "WAIVER") {
    return fail(
      "NOT_APPLICABLE",
      "A WAIVER forgives a specific past breach and does not authorise future deviation.",
    );
  }

  return {
    applies: true,
    decision: "APPLIES",
    exceptionId: ex.exceptionId,
    kind: ex.kind,
    checksum: checksumOf([ex.exceptionId, ex.kind, ex.policyId, ex.effectiveFrom, ex.effectiveTo]),
    expiresOn: ex.effectiveTo,
    daysRemaining: ex.effectiveTo ? daysBetween(request.asOf, ex.effectiveTo) : null,
    reason:
      `${ex.kind} ${ex.exceptionId} applies to ${ex.policyId} at ${request.asOf}` +
      `${ex.effectiveTo ? `, expiring ${ex.effectiveTo}` : " with no expiry"}.`,
    policyModified: false,
  };
}

/**
 * THE CORE INVARIANT: an exception must never alter the policy it deviates from.
 *
 * EXPORTED FOR DIRECT TESTING. Fault injection (FI-17) disabled this check inside
 * `applyException()` and no test failed — because nothing in that function mutates the policy, the
 * guard can never fire there. It is a tripwire for a mutation that does not yet exist, which makes
 * it vacuous by construction and untestable in place.
 *
 * Extracting it means the invariant is asserted on its own terms: given two differing checksums it
 * MUST throw. The tripwire then remains meaningful for the day someone adds mutation to the
 * apply path.
 */
export function assertPolicyUnmodified(before: string, after: string, policyId: string): void {
  if (before !== after) {
    throw new Error(
      `An exception modified policy ${policyId} (checksum ${before.slice(0, 12)} -> ` +
        `${after.slice(0, 12)}). An exception sits alongside a policy and never edits it, so the ` +
        "policy's own terms remain visible and auditable. This must never happen.",
    );
  }
}

/**
 * Applies an exception to a policy WITHOUT modifying it.
 *
 * Returns the original policy object by reference-equal content plus a separate carve-out record.
 * The test asserts the policy is byte-identical, so a future change that mutates it fails.
 */
export function applyException<T extends { id: string; body: string }>(
  policy: T,
  ex: GovernanceException | null,
  request: { asOf: string; tenantId: string | null; legalEntityId: string | null },
): {
  policy: T;
  policyChecksum: string;
  exception: ExceptionVerdict;
  effectiveRule: "POLICY_AS_WRITTEN" | "POLICY_WITH_EXCEPTION";
  explanation: string[];
} {
  const before = checksumOf([policy.id, policy.body]);

  const verdict = evaluateException(ex, {
    asOf: request.asOf,
    policyId: policy.id,
    tenantId: request.tenantId,
    legalEntityId: request.legalEntityId,
  });

  const after = checksumOf([policy.id, policy.body]);
  assertPolicyUnmodified(before, after, policy.id);

  return {
    policy,
    policyChecksum: after,
    exception: verdict,
    effectiveRule: verdict.applies ? "POLICY_WITH_EXCEPTION" : "POLICY_AS_WRITTEN",
    explanation: [
      `Policy ${policy.id} is unchanged (checksum ${after.slice(0, 12)}).`,
      verdict.applies
        ? `A ${verdict.kind} carve-out applies until ${verdict.expiresOn ?? "no expiry"}.`
        : `No exception applies: ${verdict.reason}`,
      "The exception sits alongside the policy and never edits it, so the policy's own terms " +
        "remain visible and auditable.",
    ],
  };
}

/** Exceptions that have lapsed, for reporting. They already stopped applying automatically. */
export function lapsedExceptions(
  exceptions: GovernanceException[],
  asOf: string,
): Array<{ exceptionId: string; expiredOn: string; daysLapsed: number }> {
  return exceptions
    .filter((e) => e.effectiveTo !== null && e.effectiveTo < asOf && !e.revokedAt)
    .map((e) => ({
      exceptionId: e.exceptionId,
      expiredOn: e.effectiveTo as string,
      daysLapsed: daysBetween(e.effectiveTo as string, asOf),
    }))
    .sort((a, b) => b.daysLapsed - a.daysLapsed);
}

/** Detects emergency overrides being used as routine policy. */
export function detectEmergencyAbuse(
  exceptions: GovernanceException[],
): Array<{ policyId: string; count: number; detail: string }> {
  const byPolicy = new Map<string, number>();
  for (const e of exceptions) {
    if (e.kind === "EMERGENCY_OVERRIDE") {
      byPolicy.set(e.policyId, (byPolicy.get(e.policyId) ?? 0) + 1);
    }
  }
  return [...byPolicy.entries()]
    .filter(([, n]) => n > 1)
    .map(([policyId, count]) => ({
      policyId,
      count,
      detail:
        `${count} emergency overrides were issued for ${policyId}. A repeated emergency is an ` +
        "unacknowledged policy gap; it must be resolved by amending the policy under authority.",
    }))
    .sort((a, b) => b.count - a.count);
}
