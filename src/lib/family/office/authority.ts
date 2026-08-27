/**
 * BEYU OS — Family Office authority framework.
 *
 * Distinguishes, and keeps separate:
 *   identity   — who the actor is (canonical user identity);
 *   role       — a label (NEVER an input to authority — authority is never
 *                inferred from a role name; the context carries no role field);
 *   authority  — a canonical RESOLUTION or DELEGATION reference proving the
 *                actor's authority for THIS act (spec §26.4);
 *   delegation — the instrument by which authority is transferred (separate
 *                from authority itself: a delegation record alone proves
 *                nothing until the full chain verifies);
 *   approval   — a human's approval decision (evidence, see governance);
 *   execution  — a separately-referenced act by the owning system.
 *
 * AI is never an authority (FIR-017). Missing authority never becomes
 * approval. Every check returns a deterministic result with the exact gap
 * named — fail closed.
 */

import { familyError } from "../phase3/errors";
import type { OfficeScope } from "./types";
import { assertScopeShape, scopeIsContained } from "./types";

export const AUTHORITY_TYPES = ["RESOLUTION", "DELEGATION"] as const;
export type AuthorityType = (typeof AUTHORITY_TYPES)[number];

/**
 * The authority context of an actor attempting an office act.
 * Note what is ABSENT: there is no `role` field. Authority comes only from
 * `authorityRef` (and, through it, a verified delegation). Identity without
 * an authority reference is exactly that — identity, not authority.
 */
export interface AuthorityContext {
  actorType: "HUMAN" | "SERVICE" | "AI";
  actorUserId: string;
  tenantId: string;
  legalEntityId: string | null;
  jurisdictionRef: string | null;
  /** The canonical authority reference for THIS act (null = none). */
  authorityRef: { kind: AuthorityType; referenceId: string } | null;
  /** When acting by delegation: the delegation record ID (verified below). */
  delegationRef: string | null;
  /** Optional expiry of the cited authority (explicit; null = none). */
  authorityExpiry: string | null;
  auditRef: string | null;
}

export interface ActScope extends OfficeScope {
  /** The action being attempted, e.g. "approve.capital.instruction". */
  action: string;
  objectId: string | null;
}

export interface AuthorityProof {
  ok: true;
  kind: AuthorityType;
  referenceId: string;
  viaDelegation: boolean;
  scope: ActScope;
}

export type AuthorityFailure = {
  ok: false;
  code:
    | "HUMAN_ACTOR_REQUIRED"
    | "AUTHORITY_REQUIRED"
    | "AUTHORITY_UNPROVEN"
    | "AUTHORITY_EXPIRED"
    | "AUTHORITY_REVOKED"
    | "TENANT_SCOPE_MISMATCH"
    | "ENTITY_SCOPE_MISMATCH"
    | "JURISDICTION_SCOPE_MISMATCH"
    | "DELEGATION_REQUIRED"
    | "DELEGATION_INVALID";
  reason: string;
};

export type AuthorityVerification = AuthorityProof | AuthorityFailure;

/** A verified delegation record as seen by the authority check. */
export interface VerifiedDelegation {
  delegationId: string;
  delegateUserId: string;
  tenantId: string;
  legalEntityId: string | null;
  jurisdictionRef: string | null;
  actions: readonly string[];
  validAt: boolean;
  revoked: boolean;
}

export function verifyAuthority(
  ctx: AuthorityContext,
  act: ActScope,
  delegations: ReadonlyMap<string, VerifiedDelegation> = new Map(),
): AuthorityVerification {
  if (ctx.actorType === "AI") {
    return { ok: false, code: "HUMAN_ACTOR_REQUIRED", reason: "AI is advisory only (FIR-017): it may never hold or exercise authority." };
  }
  assertScopeShape({ tenantId: ctx.tenantId, legalEntityId: ctx.legalEntityId, jurisdictionRef: ctx.jurisdictionRef }, "authority context");
  assertScopeShape(act, "act scope");
  if (ctx.tenantId !== act.tenantId) {
    return { ok: false, code: "TENANT_SCOPE_MISMATCH", reason: `Actor tenant ${ctx.tenantId} does not match act tenant ${act.tenantId} (tenant isolation).` };
  }
  const actorScope: OfficeScope = { tenantId: ctx.tenantId, legalEntityId: ctx.legalEntityId, jurisdictionRef: ctx.jurisdictionRef };
  const actScope: OfficeScope = { tenantId: act.tenantId, legalEntityId: act.legalEntityId, jurisdictionRef: act.jurisdictionRef };
  if (!scopeIsContained(actorScope, actScope)) {
    const which = ctx.legalEntityId !== null && act.legalEntityId !== null && ctx.legalEntityId !== act.legalEntityId
      ? "ENTITY_SCOPE_MISMATCH"
      : "JURISDICTION_SCOPE_MISMATCH";
    return { ok: false, code: which, reason: `The actor's scope does not contain the act's scope (no ${which === "ENTITY_SCOPE_MISMATCH" ? "entity" : "jurisdiction"} escape).` };
  }
  if (ctx.authorityRef === null) {
    return { ok: false, code: "AUTHORITY_REQUIRED", reason: "No authority reference for this act. Identity and role are not authority; missing authority is never approval." };
  }
  if (ctx.authorityExpiry !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.authorityExpiry)) {
      return { ok: false, code: "AUTHORITY_UNPROVEN", reason: "authorityExpiry must be an ISO date." };
    }
  }
  // Expiry is checked by the caller against asOf via `isAuthorityCurrent`;
  // here we verify structural validity and the delegation chain.
  if (ctx.authorityRef.kind === "DELEGATION") {
    if (ctx.delegationRef === null) {
      return { ok: false, code: "DELEGATION_REQUIRED", reason: "Authority by delegation requires the delegation record reference." };
    }
    const d = delegations.get(ctx.delegationRef);
    if (d === undefined) {
      return { ok: false, code: "DELEGATION_INVALID", reason: `Delegation record ${ctx.delegationRef} is not in the verified delegation set.` };
    }
    if (d.delegateUserId !== ctx.actorUserId) {
      return { ok: false, code: "DELEGATION_INVALID", reason: `The actor is not the delegate of delegation ${ctx.delegationRef}.` };
    }
    if (d.revoked) {
      return { ok: false, code: "AUTHORITY_REVOKED", reason: `Delegation ${ctx.delegationRef} has been revoked.` };
    }
    if (!d.validAt) {
      return { ok: false, code: "AUTHORITY_EXPIRED", reason: `Delegation ${ctx.delegationRef} is not valid at the requested time.` };
    }
    if (d.tenantId !== act.tenantId) {
      return { ok: false, code: "TENANT_SCOPE_MISMATCH", reason: `Delegation ${ctx.delegationRef} is tenant-scoped to ${d.tenantId}, not ${act.tenantId}.` };
    }
    if (!d.actions.includes(act.action)) {
      return { ok: false, code: "AUTHORITY_UNPROVEN", reason: `Delegation ${ctx.delegationRef} does not cover action "${act.action}". A delegation proves only what it grants.` };
    }
    return { ok: true, kind: "DELEGATION", referenceId: ctx.authorityRef.referenceId, viaDelegation: true, scope: act };
  }
  // RESOLUTION: the cited resolution is the proof; its governance standing is
  // verified by the governance layer. Here: structural validity only.
  if (ctx.authorityRef.referenceId.trim() === "") {
    return { ok: false, code: "AUTHORITY_UNPROVEN", reason: "The resolution reference is empty." };
  }
  return { ok: true, kind: "RESOLUTION", referenceId: ctx.authorityRef.referenceId, viaDelegation: false, scope: act };
}

/** Expiry check against an explicit point in time (pure). */
export function isAuthorityCurrent(ctx: AuthorityContext, asOf: string): boolean {
  return ctx.authorityExpiry === null || ctx.authorityExpiry >= asOf;
}

/**
 * Closed mapping from the fine-grained result codes of verifyAuthority to
 * the Phase 3A error taxonomy (20 codes). The granular code is preserved
 * in the thrown error's `details` — nothing is lost; the mapping is
 * technical, not policy.
 */
const AUTHORITY_FAILURE_TO_ERROR_CODE = {
  HUMAN_ACTOR_REQUIRED: "HUMAN_ACTOR_REQUIRED",
  AUTHORITY_REQUIRED: "AUTHORITY_UNPROVEN",
  AUTHORITY_UNPROVEN: "AUTHORITY_UNPROVEN",
  AUTHORITY_EXPIRED: "AUTHORITY_UNPROVEN",
  AUTHORITY_REVOKED: "AUTHORITY_UNPROVEN",
  TENANT_SCOPE_MISMATCH: "TENANT_ISOLATION_DENIED",
  ENTITY_SCOPE_MISMATCH: "TENANT_ISOLATION_DENIED",
  JURISDICTION_SCOPE_MISMATCH: "TENANT_ISOLATION_DENIED",
  DELEGATION_REQUIRED: "AUTHORITY_UNPROVEN",
  DELEGATION_INVALID: "AUTHORITY_UNPROVEN",
} as const;

export function toTaxonomyCode(code: AuthorityFailure["code"]): "HUMAN_ACTOR_REQUIRED" | "AUTHORITY_UNPROVEN" | "TENANT_ISOLATION_DENIED" {
  return AUTHORITY_FAILURE_TO_ERROR_CODE[code];
}

/**
 * Asserting form. Throws with the exact failure code named.
 * `asOf` is required: authority is evaluated at an explicit point in time.
 */
export function assertAuthority(
  ctx: AuthorityContext,
  act: ActScope,
  asOf: string,
  delegations: ReadonlyMap<string, VerifiedDelegation> = new Map(),
): AuthorityProof {
  const result = verifyAuthority(ctx, act, delegations);
  if (!result.ok) {
    throw familyError(toTaxonomyCode(result.code), `${result.code}: ${result.reason}`, [], { code: result.code, reason: result.reason });
  }
  if (!isAuthorityCurrent(ctx, asOf)) {
    throw familyError("AUTHORITY_UNPROVEN", `The cited authority expired before ${asOf}.`, [], { expiry: ctx.authorityExpiry });
  }
  return result;
}
