/**
 * BEYU OS — Delegation and escalation engine (Governance Phase 7, 11).
 *
 * THE GAP THIS CLOSES. The `delegations` table exists — id, tenant_id, from_user_id, to_user_id,
 * scope, monetary_limit, effective_from, effective_to, authorized_by, revoked_at — and holds ZERO
 * rows. No code reads it. So the schema anticipates delegated authority while the system has no
 * way to evaluate one, and no test can prove a bad delegation is refused.
 *
 * THE RULE THAT MATTERS MOST. **A delegation can never exceed the issuer's own authority.** This
 * is the escalation vector: if U1 may approve up to 100k and delegates "up to 500k" to U2, then U2
 * approving 400k means U1 granted authority U1 never held. `checkDelegationBounds()` enforces it,
 * and it is tested in both directions.
 *
 * NON-DELEGABLE POWERS. Reserved matters are decided by a BODY under quorum, not by an individual.
 * An individual cannot delegate away a collective power they do not personally hold, so any
 * delegation touching a reserved matter is refused. That is structural, not invented: it follows
 * from the reserved matter being vested in the body.
 *
 * NO THRESHOLDS ARE INVENTED. The engine compares a delegation against the issuer's stated limit;
 * it never decides what any principal's limit should be. Where no issuer limit is recorded, the
 * delegation cannot be bounded and is refused — absence of a limit is not an unlimited licence.
 *
 * NO NEW TABLE. Reads the existing one.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { delegations } from "@/db/schema";

export const DELEGATION_VERSION = "delegation-1.0.0";

export const DELEGATION_DECISION = [
  "VALID",
  "NOT_FOUND",
  "NOT_YET_EFFECTIVE",
  "EXPIRED",
  "REVOKED",
  "SCOPE_EXCEEDED",
  "EXCEEDS_ISSUER_AUTHORITY",
  "NON_DELEGABLE",
  "CROSS_TENANT",
  "SELF_DELEGATION",
  "NO_ISSUER_LIMIT",
  "CHAIN_TOO_DEEP",
] as const;
export type DelegationDecision = (typeof DELEGATION_DECISION)[number];

export type DelegationVerdict = {
  valid: boolean;
  decision: DelegationDecision;
  delegationId: string | null;
  fromUserId: string | null;
  toUserId: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  monetaryLimit: string | null;
  reason: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return null;
}

/**
 * Scopes that may never be delegated by an individual.
 *
 * These correspond to powers vested in a governance BODY under quorum. Delegating them would let
 * one person hand away a collective decision right they do not personally hold.
 */
export const NON_DELEGABLE_SCOPES: readonly string[] = [
  "RESERVED_MATTER",
  "CONSTITUTION",
  "POLICY_CONSTITUTION",
  "OWNERSHIP_CHANGE",
  "SUCCESSION",
  "TRUST_AMENDMENT",
  "AUTHORITY_DELEGATION",
];

/** Maximum delegation chain depth. Beyond this, provenance becomes unverifiable in practice. */
export const MAX_DELEGATION_DEPTH = 2;

/**
 * Can a delegation of `requestedLimit` be issued by a principal whose own limit is `issuerLimit`?
 *
 * Pure and exported. This is the escalation control and must be assertable directly, not only
 * through a database path.
 */
export function checkDelegationBounds(input: {
  issuerLimit: string | null;
  requestedLimit: string | null;
}): { permitted: boolean; decision: "PERMITTED" | "EXCEEDS_ISSUER_AUTHORITY" | "NO_ISSUER_LIMIT"; reason: string } {
  if (input.issuerLimit === null) {
    return {
      permitted: false,
      decision: "NO_ISSUER_LIMIT",
      reason:
        "The issuer has no recorded authority limit, so a delegation cannot be bounded against it. " +
        "An absent limit is not an unlimited licence.",
    };
  }

  // A delegation with no stated limit is unbounded, and unbounded always exceeds a bounded issuer.
  if (input.requestedLimit === null) {
    return {
      permitted: false,
      decision: "EXCEEDS_ISSUER_AUTHORITY",
      reason:
        `The delegation states no limit while the issuer is bounded at ${input.issuerLimit}. ` +
        "An unbounded delegation from a bounded issuer grants authority the issuer never held.",
    };
  }

  if (Number(input.requestedLimit) > Number(input.issuerLimit)) {
    return {
      permitted: false,
      decision: "EXCEEDS_ISSUER_AUTHORITY",
      reason:
        `The delegation of ${input.requestedLimit} exceeds the issuer's own limit of ` +
        `${input.issuerLimit}. Nobody may delegate authority they do not hold.`,
    };
  }

  return {
    permitted: true,
    decision: "PERMITTED",
    reason: `${input.requestedLimit} is within the issuer's limit of ${input.issuerLimit}.`,
  };
}

/** Is this scope delegable at all? */
export function checkDelegable(scope: string): {
  delegable: boolean;
  decision: "PERMITTED" | "NON_DELEGABLE";
  reason: string;
} {
  const upper = scope.toUpperCase();
  const hit = NON_DELEGABLE_SCOPES.find((s) => upper === s || upper.includes(s));
  if (hit) {
    return {
      delegable: false,
      decision: "NON_DELEGABLE",
      reason:
        `'${scope}' engages ${hit}, which is vested in a governance body under quorum. An ` +
        "individual cannot delegate a collective power they do not personally hold.",
    };
  }
  return { delegable: true, decision: "PERMITTED", reason: `'${scope}' is delegable.` };
}

/**
 * Validates a PROPOSED delegation before it is issued.
 *
 * Every check fails closed and returns a specific code; there is no permissive fall-through.
 */
export function validateProposedDelegation(input: {
  fromUserId: string;
  toUserId: string;
  fromTenantId: string;
  toTenantId: string;
  scope: string;
  issuerLimit: string | null;
  requestedLimit: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  existingChainDepth?: number;
}): { permitted: boolean; decision: DelegationDecision; reason: string } {
  if (!ISO_DATE.test(input.effectiveFrom)) {
    return { permitted: false, decision: "NOT_FOUND", reason: "effectiveFrom must be an ISO date." };
  }

  if (input.fromUserId === input.toUserId) {
    return {
      permitted: false,
      decision: "SELF_DELEGATION",
      reason: `${input.fromUserId} cannot delegate to themselves; that creates authority from nothing.`,
    };
  }

  if (input.fromTenantId !== input.toTenantId) {
    return {
      permitted: false,
      decision: "CROSS_TENANT",
      reason:
        `Delegation from tenant ${input.fromTenantId} to ${input.toTenantId} crosses a tenant ` +
        "boundary. Authority is tenant-scoped and does not travel across it by delegation.",
    };
  }

  const delegable = checkDelegable(input.scope);
  if (!delegable.delegable) {
    return { permitted: false, decision: "NON_DELEGABLE", reason: delegable.reason };
  }

  const bounds = checkDelegationBounds({
    issuerLimit: input.issuerLimit,
    requestedLimit: input.requestedLimit,
  });
  if (!bounds.permitted) {
    return { permitted: false, decision: bounds.decision as DelegationDecision, reason: bounds.reason };
  }

  if ((input.existingChainDepth ?? 0) >= MAX_DELEGATION_DEPTH) {
    return {
      permitted: false,
      decision: "CHAIN_TOO_DEEP",
      reason:
        `The delegation chain already has depth ${input.existingChainDepth}. Beyond ` +
        `${MAX_DELEGATION_DEPTH}, the provenance of the original authority is not practically verifiable.`,
    };
  }

  if (input.effectiveTo !== null && input.effectiveTo < input.effectiveFrom) {
    return {
      permitted: false,
      decision: "EXPIRED",
      reason: `effectiveTo (${input.effectiveTo}) precedes effectiveFrom (${input.effectiveFrom}).`,
    };
  }

  return {
    permitted: true,
    decision: "VALID",
    reason: `Delegation from ${input.fromUserId} to ${input.toUserId} is within issuer authority and scope.`,
  };
}

/**
 * Evaluates an EXISTING delegation at a point in time.
 *
 * Terminal conditions (revocation) are checked before dates, so a revoked delegation inside its
 * window still cannot act.
 */
export function evaluateDelegationRecord(
  record: {
    id: string;
    fromUserId: string;
    toUserId: string;
    tenantId: string;
    scope: string;
    monetaryLimit: string | null;
    effectiveFrom: unknown;
    effectiveTo: unknown;
    revokedAt: unknown;
  } | null,
  request: { asOf: string; tenantId: string; amount?: number | null },
): DelegationVerdict {
  const base = {
    delegationId: record?.id ?? null,
    fromUserId: record?.fromUserId ?? null,
    toUserId: record?.toUserId ?? null,
    effectiveFrom: record ? isoDate(record.effectiveFrom) : null,
    effectiveTo: record ? isoDate(record.effectiveTo) : null,
    monetaryLimit: record?.monetaryLimit ?? null,
  };

  if (!record) {
    return { ...base, valid: false, decision: "NOT_FOUND", reason: "No delegation record found." };
  }

  // Revocation is terminal and outranks the effective window.
  if (record.revokedAt) {
    return {
      ...base,
      valid: false,
      decision: "REVOKED",
      reason: `Delegation ${record.id} was revoked and cannot act, even inside its effective window.`,
    };
  }

  if (record.tenantId !== request.tenantId) {
    return {
      ...base,
      valid: false,
      decision: "CROSS_TENANT",
      reason: `Delegation ${record.id} is scoped to tenant ${record.tenantId}, not ${request.tenantId}.`,
    };
  }

  const from = isoDate(record.effectiveFrom);
  const to = isoDate(record.effectiveTo);

  if (!from || from > request.asOf) {
    return {
      ...base,
      valid: false,
      decision: "NOT_YET_EFFECTIVE",
      reason: `Delegation ${record.id} becomes effective ${from ?? "(no date)"}, after ${request.asOf}.`,
    };
  }

  if (to && to < request.asOf) {
    return {
      ...base,
      valid: false,
      decision: "EXPIRED",
      reason: `Delegation ${record.id} expired on ${to}.`,
    };
  }

  const delegable = checkDelegable(record.scope);
  if (!delegable.delegable) {
    return { ...base, valid: false, decision: "NON_DELEGABLE", reason: delegable.reason };
  }

  if (request.amount !== null && request.amount !== undefined) {
    if (record.monetaryLimit === null) {
      return {
        ...base,
        valid: false,
        decision: "SCOPE_EXCEEDED",
        reason:
          `Delegation ${record.id} states no monetary limit, so an amount of ${request.amount} ` +
          "cannot be shown to fall within it.",
      };
    }
    if (request.amount > Number(record.monetaryLimit)) {
      return {
        ...base,
        valid: false,
        decision: "SCOPE_EXCEEDED",
        reason: `Amount ${request.amount} exceeds the delegated limit of ${record.monetaryLimit}.`,
      };
    }
  }

  return {
    ...base,
    valid: true,
    decision: "VALID",
    reason: `Delegation ${record.id} is effective at ${request.asOf} and within scope.`,
  };
}

/** Looks up and evaluates an active delegation for a principal. */
export async function resolveDelegation(input: {
  toUserId: string;
  tenantId: string;
  asOf: string;
  amount?: number | null;
}): Promise<DelegationVerdict> {
  const rows = await db
    .select()
    .from(delegations)
    .where(
      and(
        eq(delegations.toUserId, input.toUserId),
        eq(delegations.tenantId, input.tenantId),
        or(isNull(delegations.revokedAt), isNull(delegations.revokedAt)),
      ),
    )
    .limit(50);

  if (rows.length === 0) {
    return {
      valid: false,
      decision: "NOT_FOUND",
      delegationId: null,
      fromUserId: null,
      toUserId: input.toUserId,
      effectiveFrom: null,
      effectiveTo: null,
      monetaryLimit: null,
      reason:
        `No delegation exists for ${input.toUserId} in ${input.tenantId}. The delegations table ` +
        "is empty, so no principal currently holds delegated authority.",
    };
  }

  const evaluated = rows.map((r) =>
    evaluateDelegationRecord(
      {
        id: r.id, fromUserId: r.fromUserId, toUserId: r.toUserId, tenantId: r.tenantId,
        scope: String(r.scope), monetaryLimit: r.monetaryLimit, effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo, revokedAt: r.revokedAt,
      },
      { asOf: input.asOf, tenantId: input.tenantId, amount: input.amount },
    ),
  );

  return evaluated.find((e) => e.valid) ?? evaluated[0];
}

// ===========================================================================
// ESCALATION (Phase 11)
// ===========================================================================

export const ESCALATION_STATE = [
  "NO_ESCALATION",
  "MISSING_AUTHORITY",
  "POLICY_CONFLICT",
  "SOD_CONFLICT",
  "EVIDENCE_INSUFFICIENT",
  "SCOPE_CONFLICT",
  "EXPIRED_AUTHORITY",
  "UNRESOLVED_EXCEPTION",
  "COMPLIANCE_CONFLICT",
  "RESERVED_MATTER_BYPASS",
  "DELEGATION_INVALID",
] as const;
export type EscalationState = (typeof ESCALATION_STATE)[number];

export type Escalation = {
  state: EscalationState;
  escalated: boolean;
  /** Who must resolve it. Null when no competent body is identifiable. */
  escalateTo: string | null;
  blockers: string[];
  reason: string;
  /** Always false. Escalation never approves. */
  autoApproved: false;
};

/**
 * Determines the escalation state of a blocked governance operation.
 *
 * Returns the FIRST and most fundamental blocker, in a deliberate order: an operation blocked by
 * both a missing authority and an SoD conflict is a missing-authority problem first.
 */
export function determineEscalation(input: {
  authorityPresent: boolean;
  authorityExpired?: boolean;
  policyConflicts?: number;
  sodConflict?: boolean;
  evidencePresent?: boolean;
  scopeValid?: boolean;
  unresolvedExceptions?: number;
  complianceConflict?: boolean;
  reservedMatterBypass?: boolean;
  delegationValid?: boolean | null;
  competentBody?: string | null;
}): Escalation {
  const blockers: string[] = [];
  const mk = (state: EscalationState, reason: string): Escalation => ({
    state,
    escalated: state !== "NO_ESCALATION",
    escalateTo: input.competentBody ?? null,
    blockers,
    reason,
    autoApproved: false,
  });

  if (input.reservedMatterBypass) {
    blockers.push("RESERVED_MATTER_BYPASS");
    return mk("RESERVED_MATTER_BYPASS",
      "The operation engages a reserved matter held by another body. It must be decided there.");
  }
  if (!input.authorityPresent) {
    blockers.push("MISSING_AUTHORITY");
    return mk("MISSING_AUTHORITY", "No authority record supports this operation.");
  }
  if (input.authorityExpired) {
    blockers.push("EXPIRED_AUTHORITY");
    return mk("EXPIRED_AUTHORITY", "The supporting authority has expired.");
  }
  if (input.delegationValid === false) {
    blockers.push("DELEGATION_INVALID");
    return mk("DELEGATION_INVALID", "The delegated authority relied upon is not valid.");
  }
  if ((input.policyConflicts ?? 0) > 0) {
    blockers.push("POLICY_CONFLICT");
    return mk("POLICY_CONFLICT",
      `${input.policyConflicts} unresolved policy conflict(s). No precedence is ratified, so none is selected.`);
  }
  if (input.sodConflict) {
    blockers.push("SOD_CONFLICT");
    return mk("SOD_CONFLICT", "A segregation-of-duties conflict blocks this operation.");
  }
  if (input.scopeValid === false) {
    blockers.push("SCOPE_CONFLICT");
    return mk("SCOPE_CONFLICT", "The operation falls outside the authority's tenant or entity scope.");
  }
  if (input.evidencePresent === false) {
    blockers.push("EVIDENCE_INSUFFICIENT");
    return mk("EVIDENCE_INSUFFICIENT", "Required evidence is absent; missing evidence stays missing.");
  }
  if ((input.unresolvedExceptions ?? 0) > 0) {
    blockers.push("UNRESOLVED_EXCEPTION");
    return mk("UNRESOLVED_EXCEPTION", `${input.unresolvedExceptions} unresolved exception(s) apply.`);
  }
  if (input.complianceConflict) {
    blockers.push("COMPLIANCE_CONFLICT");
    return mk("COMPLIANCE_CONFLICT", "A compliance obligation conflicts with this operation.");
  }

  return mk("NO_ESCALATION", "No escalation condition is present.");
}
