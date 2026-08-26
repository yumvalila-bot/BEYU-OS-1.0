/**
 * BEYU OS — Family Office delegation engine.
 *
 * Delegation is a REFERENCE mechanism: it records that a human transferred
 * a bounded, scoped, time-limited authority to another human. It is NOT
 * authority itself — a delegation record alone proves nothing; the
 * authority framework verifies the full chain (delegator's own authority,
 * period, revocation, scope containment) before any act proceeds.
 *
 * Delegation LIMITS (how much may be delegated, what may not) are policy:
 * until ratified they are UNRESOLVED and any act that would require a
 * limitation resolves to POLICY_DECISION_REQUIRED. This engine never
 * chooses limits.
 */

import { familyError } from "../phase3/errors";
import type { OfficeScope } from "./types";
import { isIsoDate, scopeIsContained } from "./types";
import type { VerifiedDelegation } from "./authority";

export interface FamilyDelegationRecord {
  delegationId: string;
  delegatorUserId: string;
  delegateUserId: string;
  scope: OfficeScope & { actions: readonly string[] };
  effectiveFrom: string;
  effectiveTo: string | null;
  /**
   * Ratified limitations attached to this delegation (e.g. per-act caps).
   * NULL = no ratified limitation policy exists. The engine never invents
   * limitations; `requireLimitation` fails closed when a needed key is
   * absent.
   */
  limitations: Record<string, unknown> | null;
  revokedAt: string | null;
  revokedBy: string | null;
  parentDelegationId: string | null;
  auditRef: string;
}

export function validateDelegationRecord(r: FamilyDelegationRecord): string[] {
  const problems: string[] = [];
  const present = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
  if (!present(r.delegationId)) problems.push("delegationId is required.");
  if (!present(r.delegatorUserId)) problems.push("delegatorUserId is required.");
  if (!present(r.delegateUserId)) problems.push("delegateUserId is required.");
  else if (r.delegateUserId === r.delegatorUserId) {
    problems.push("Self-delegation is refused (canonical delegation rule): a principal does not delegate to itself.");
  }
  if (!isIsoDate(r.effectiveFrom)) problems.push("effectiveFrom must be an ISO date.");
  if (r.effectiveTo !== null && !isIsoDate(r.effectiveTo)) problems.push("effectiveTo must be an ISO date or null.");
  if (r.effectiveTo !== null && r.effectiveTo < r.effectiveFrom) problems.push("effectiveTo must not precede effectiveFrom.");
  if (!Array.isArray(r.scope.actions) || r.scope.actions.length === 0) {
    problems.push("scope.actions must be a non-empty list (a delegation with no scope delegates nothing — and nothing is never delegated).");
  }
  if (!present(r.auditRef)) problems.push("auditRef is required — delegation is audited, never silent.");
  if (r.revokedAt !== null && !present(r.revokedBy)) problems.push("A revocation must name who revoked it.");
  if (r.revokedAt !== null && !isIsoDate(r.revokedAt)) problems.push("revokedAt must be an ISO date when set.");
  return problems;
}

export function assertValidDelegationRecord(r: FamilyDelegationRecord): void {
  const problems = validateDelegationRecord(r);
  if (problems.length > 0) {
    throw familyError("AUTHORITY_UNPROVEN", `Invalid delegation ${r.delegationId}: ${problems.join(" ")}`, [], { delegationId: r.delegationId });
  }
}

export interface DelegationEvaluation {
  permitted: boolean;
  code: "PERMITTED" | "DELEGATION_EXPIRED" | "DELEGATION_REVOKED" | "DELEGATION_SCOPE_MISMATCH" | "DELEGATION_AI_REFUSED" | "POLICY_DECISION_REQUIRED";
  reason: string;
  /** When a ratified limitation was required and applied. */
  appliedLimitation: { key: string; value: unknown } | null;
}

/**
 * Evaluate whether a delegation permits an act at an explicit time.
 * Deterministic; no defaults. A needed-but-missing ratified limitation is
 * POLICY_DECISION_REQUIRED, never "assume unlimited".
 */
export function evaluateDelegation(
  record: FamilyDelegationRecord,
  requested: { action: string; actorUserId: string; asOf: string; entity: string | null; jurisdiction: string | null; requiredLimitationKey?: string },
): DelegationEvaluation {
  assertValidDelegationRecord(record);
  if (!isIsoDate(requested.asOf)) throw new Error("asOf must be an ISO date.");
  if (requested.actorUserId === record.delegatorUserId) {
    return { permitted: false, code: "DELEGATION_SCOPE_MISMATCH", reason: "The delegator acts by their own authority, not by their own delegation.", appliedLimitation: null };
  }
  if (requested.actorUserId !== record.delegateUserId) {
    return { permitted: false, code: "DELEGATION_SCOPE_MISMATCH", reason: "The actor is not the delegate of this delegation.", appliedLimitation: null };
  }
  if (record.revokedAt !== null && record.revokedAt <= requested.asOf) {
    return { permitted: false, code: "DELEGATION_REVOKED", reason: `Delegation revoked ${record.revokedAt} (by ${record.revokedBy}).`, appliedLimitation: null };
  }
  if (requested.asOf < record.effectiveFrom) {
    return { permitted: false, code: "DELEGATION_EXPIRED", reason: `Delegation becomes effective ${record.effectiveFrom}; not yet in force at ${requested.asOf}.`, appliedLimitation: null };
  }
  if (record.effectiveTo !== null && requested.asOf > record.effectiveTo) {
    return { permitted: false, code: "DELEGATION_EXPIRED", reason: `Delegation expired ${record.effectiveTo}.`, appliedLimitation: null };
  }
  if (!record.scope.actions.includes(requested.action)) {
    return { permitted: false, code: "DELEGATION_SCOPE_MISMATCH", reason: `Action "${requested.action}" is not within the delegation's scope.`, appliedLimitation: null };
  }
  const entityScope = { tenantId: record.scope.tenantId, legalEntityId: requested.entity, jurisdictionRef: requested.jurisdiction };
  if (!scopeIsContained(record.scope, entityScope)) {
    return { permitted: false, code: "DELEGATION_SCOPE_MISMATCH", reason: "The requested entity/jurisdiction escapes the delegation's scope (no scope escape).", appliedLimitation: null };
  }
  if (requested.requiredLimitationKey !== undefined) {
    if (record.limitations === null) {
      return {
        permitted: false,
        code: "POLICY_DECISION_REQUIRED",
        reason: `This act requires ratified delegation limitation "${requested.requiredLimitationKey}", which has not been ratified. POLICY DECISION REQUIRED — delegation limits are never assumed (e.g. "assume unlimited").`,
        appliedLimitation: null,
      };
    }
    const value = record.limitations[requested.requiredLimitationKey];
    if (value === undefined || value === null || value === "") {
      return {
        permitted: false,
        code: "POLICY_DECISION_REQUIRED",
        reason: `Ratified limitations for this delegation lack "${requested.requiredLimitationKey}". Missing is not a default.`,
        appliedLimitation: null,
      };
    }
    return { permitted: true, code: "PERMITTED", reason: "Delegation covers the act within its scope and period.", appliedLimitation: { key: requested.requiredLimitationKey, value } };
  }
  return { permitted: true, code: "PERMITTED", reason: "Delegation covers the act within its scope and period.", appliedLimitation: null };
}

/** Read one ratified limitation; missing → POLICY_DECISION_REQUIRED. */
export function requireLimitation<T = unknown>(record: FamilyDelegationRecord, key: string): T {
  if (record.limitations === null || record.limitations[key] === undefined || record.limitations[key] === null) {
    throw familyError(
      "POLICY_DECISION_REQUIRED",
      `Delegation ${record.delegationId} requires ratified limitation "${key}". POLICY DECISION REQUIRED — no limit is assumed.`,
      [],
      { delegationId: record.delegationId, key },
    );
  }
  return record.limitations[key] as T;
}

/**
 * Build the verified-delegation view consumed by the authority framework.
 * `validAt`/`revoked` are evaluated at `asOf` — the authority check then
 * re-verifies actor match and action coverage.
 */
export function toVerifiedDelegation(record: FamilyDelegationRecord, asOf: string): VerifiedDelegation {
  assertValidDelegationRecord(record);
  return {
    delegationId: record.delegationId,
    delegateUserId: record.delegateUserId,
    tenantId: record.scope.tenantId,
    legalEntityId: record.scope.legalEntityId,
    jurisdictionRef: record.scope.jurisdictionRef,
    actions: record.scope.actions,
    validAt: isIsoDate(asOf) && asOf >= record.effectiveFrom && (record.effectiveTo === null || asOf <= record.effectiveTo),
    revoked: record.revokedAt !== null && record.revokedAt <= asOf,
  };
}
