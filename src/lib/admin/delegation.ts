/**
 * BEYU OS — Administrative authority delegation (governed administrative
 * program).
 *
 * THE RULE THAT MATTERS MOST: a delegation can never create authority greater
 * than the delegator possesses. Every creation is validated against the
 * delegator's ROLE-DERIVED permission set and their RESOLVED tenant scope; a
 * delegated administrator can never re-delegate (the capability to delegate is
 * itself non-delegable), so delegation chains have depth exactly one.
 *
 * This module contains the pure validation engine (directly unit-testable),
 * the per-request scope resolver used by the governed mutation service, and
 * the delegation lifecycle (create/revoke). Permission resolution itself lives
 * in the canonical path: `activeDelegatedPermissions()` in `lib/authz.ts`,
 * loaded by `resolvePrincipal()` on every request — there is no second
 * authorization engine.
 */
import { and, eq, isNull, lte, gte, or } from "drizzle-orm";
import { db } from "@/db";
import { adminAuthorityDelegations, users } from "@/db/schema";
import {
  ADMIN_DELEGATABLE_PERMISSIONS,
  isDelegablePermission,
  type PermissionCode,
} from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";
import { recordAuditTx, publishEventTx, type Tx } from "@/lib/audit";
import { loadGrants, permissionsForRoles, type Principal } from "@/lib/authz";
import { tenantScopeIds } from "@/lib/tenant-scope";

export const ADMIN_DELEGATION_VERSION = "admin-delegation-1.0.0";

/** Terminal, revocation-first ordering mirrors the governance engine. */
export const DELEGATION_STATUS = ["ACTIVE", "REVOKED"] as const;
export type AdminDelegationStatus = (typeof DELEGATION_STATUS)[number];

export const DELEGATION_DECISION = [
  "VALID",
  "EMPTY_CAPABILITIES",
  "NON_DELEGABLE",
  "SELF_DELEGATION",
  "EXCEEDS_DELEGATOR_AUTHORITY",
  "SCOPE_EXCEEDS_DELEGATOR",
  "EMPTY_SCOPE",
  "INVALID_WINDOW",
  "WINDOW_TOO_LONG",
  "DUPLICATE_LIVE_INSTRUMENT",
  "DELEGATEE_INVALID",
  "NOT_FOUND",
  "ALREADY_REVOKED",
  "EXPIRED",
  "REVOKED",
] as const;
export type DelegationDecision = (typeof DELEGATION_DECISION)[number];

/** Maximum delegation lifetime (constitutional bound; 366 days covers a leap year). */
export const MAX_DELEGATION_DAYS = 90;

export type ProposedAdminDelegation = {
  delegatorUserId: string;
  delegateeUserId: string;
  permissions: string[];
  scopeTenantIds: string[];
  scopeLegalEntityIds?: string[];
  scopeCountryCodes?: string[];
  effectiveFrom: Date;
  effectiveTo: Date;
  reason: string;
};

/** Authority the delegator holds through ROLES ONLY — delegated authority can never be re-delegated. */
export async function roleDerivedPermissions(userId: string, tenantId: string): Promise<Set<PermissionCode>> {
  const grants = await loadGrants(userId, tenantId);
  const roleCodes = [...new Set(grants.map((g) => g.code))];
  return permissionsForRoles(roleCodes);
}

/**
 * Validate a PROPOSED delegation. Pure decision logic over supplied facts; the
 * database facts (delegator's role-derived permissions, delegator's tenant
 * scope) are resolved by the caller and passed in so this function is directly
 * testable. Every failure mode returns a specific decision — no permissive
 * fall-through.
 */
export function validateProposedDelegation(input: {
  proposal: ProposedAdminDelegation;
  delegatorRolePermissions: Set<PermissionCode>;
  delegatorTenantScope: string[];
}): { permitted: boolean; decision: DelegationDecision; reason: string } {
  const { proposal } = input;

  if (proposal.delegatorUserId === proposal.delegateeUserId) {
    return {
      permitted: false,
      decision: "SELF_DELEGATION",
      reason: "An administrator cannot delegate to themselves; that would be self-escalation.",
    };
  }

  if (proposal.permissions.length === 0) {
    return {
      permitted: false,
      decision: "EMPTY_CAPABILITIES",
      reason: "A delegation must name at least one capability.",
    };
  }

  const nonDelegable = proposal.permissions.filter((p) => !isDelegablePermission(p));
  if (nonDelegable.length > 0) {
    return {
      permitted: false,
      decision: "NON_DELEGABLE",
      reason:
        `Capabilities ${nonDelegable.join(", ")} are not delegable. Delegable set: ` +
        `${ADMIN_DELEGATABLE_PERMISSIONS.join(", ")}. (Delegating authority itself is never delegable.)`,
    };
  }

  const unheld = proposal.permissions.filter((p) => !input.delegatorRolePermissions.has(p as PermissionCode));
  if (unheld.length > 0) {
    return {
      permitted: false,
      decision: "EXCEEDS_DELEGATOR_AUTHORITY",
      reason:
        `The delegator does not hold ${unheld.join(", ")} through role grants. Nobody may delegate ` +
        "authority they do not personally possess, and delegated authority may never be re-delegated.",
    };
  }

  if (proposal.scopeTenantIds.length === 0) {
    return {
      permitted: false,
      decision: "EMPTY_SCOPE",
      reason: "A delegation must carry an explicit tenant scope; scopeless authority is refused.",
    };
  }

  const outsideScope = proposal.scopeTenantIds.filter((t) => !input.delegatorTenantScope.includes(t));
  if (outsideScope.length > 0) {
    return {
      permitted: false,
      decision: "SCOPE_EXCEEDS_DELEGATOR",
      reason:
        `Tenant scope ${outsideScope.join(", ")} is outside the delegator's own resolved tenant scope. ` +
        "A delegation cannot widen the delegator's reach.",
    };
  }

  if (!(proposal.effectiveTo > proposal.effectiveFrom)) {
    return {
      permitted: false,
      decision: "INVALID_WINDOW",
      reason: "The delegation's expiration must be after its start.",
    };
  }

  const days = (proposal.effectiveTo.getTime() - proposal.effectiveFrom.getTime()) / 86_400_000;
  if (days > MAX_DELEGATION_DAYS) {
    return {
      permitted: false,
      decision: "WINDOW_TOO_LONG",
      reason: `A delegation may last at most ${MAX_DELEGATION_DAYS} days; requested ${Math.ceil(days)}.`,
    };
  }

  return {
    permitted: true,
    decision: "VALID",
    reason: "The delegation is within the delegator's own authority and scope.",
  };
}

/* ------------------------------------------------------------------ */
/* Scope resolution — the exercise-time boundary                        */
/* ------------------------------------------------------------------ */

export class DelegationScopeError extends Error {
  constructor(
    readonly decision: "OUTSIDE_DELEGATION_SCOPE" | "OUTSIDE_ENTITY_SCOPE" | "OUTSIDE_COUNTRY_SCOPE" | "NO_DELEGATED_AUTHORITY",
    message: string,
  ) {
    super(message);
    this.name = "DelegationScopeError";
  }
}

type ActiveDelegationRow = {
  id: string;
  delegatorUserId: string;
  delegateeUserId: string;
  permissions: string[];
  scopeTenantIds: string[];
  scopeLegalEntityIds: string[];
  scopeCountryCodes: string[];
  effectiveFrom: Date;
  effectiveTo: Date;
  status: string;
  revokedAt: Date | null;
};

/** Active (unrevoked, in-window) delegation instruments received by a user. */
export async function activeDelegationsFor(userId: string, asOf = new Date()): Promise<ActiveDelegationRow[]> {
  const rows = await db
    .select()
    .from(adminAuthorityDelegations)
    .where(
      and(
        eq(adminAuthorityDelegations.delegateeUserId, userId),
        eq(adminAuthorityDelegations.status, "ACTIVE"),
        isNull(adminAuthorityDelegations.revokedAt),
        lte(adminAuthorityDelegations.effectiveFrom, asOf),
        gte(adminAuthorityDelegations.effectiveTo, asOf),
      ),
    );
  return rows as ActiveDelegationRow[];
}

/**
 * The effective tenant scope for an administrative act.
 *
 *   role-derived authority  → the principal's resolved tenant scope (unchanged);
 *   delegation-derived only → the principal's tenant scope ∩ the union of the
 *                             scopes of the live delegations granting that
 *                             permission. A delegation can therefore NARROW a
 *                             delegated administrator's reach below their own
 *                             tenant scope, never widen it.
 *
 * Fails closed: a delegation-derived permission with an empty effective scope
 * returns an empty list (nothing is actable).
 */
export async function adminActionTenantScope(
  principal: Principal,
  permission: PermissionCode,
): Promise<string[]> {
  const own = await tenantScopeIds(principal);
  if (principal.permissions.has(permission)) return own; // role-derived
  const live = await activeDelegationsFor(principal.userId);
  const granting = live.filter((d) => (d.permissions ?? []).includes(permission));
  if (granting.length === 0) return [];
  const delegated = new Set<string>();
  for (const d of granting) for (const t of d.scopeTenantIds ?? []) delegated.add(t);
  return own.filter((t) => delegated.has(t));
}

/**
 * Exercise-time assertion: when the authority for `permission` is
 * delegation-derived, the target tenant (and optional entity/country) must lie
 * inside the granting delegations. Role-derived authority is checked against
 * the principal's ordinary tenant scope by the caller via assertWithinScope().
 */
export async function assertDelegationScope(
  principal: Principal,
  permission: PermissionCode,
  target: { tenantId: string; legalEntityId?: string | null; countryCode?: string | null },
): Promise<void> {
  if (principal.permissions.has(permission)) return; // role-derived: no delegation constraint
  const live = await activeDelegationsFor(principal.userId);
  const granting = live.filter((d) => (d.permissions ?? []).includes(permission));
  if (granting.length === 0) {
    throw new DelegationScopeError(
      "NO_DELEGATED_AUTHORITY",
      `No live delegation grants ${permission} to this principal.`,
    );
  }
  const tenantOk = granting.some((d) => (d.scopeTenantIds ?? []).includes(target.tenantId));
  if (!tenantOk) {
    throw new DelegationScopeError(
      "OUTSIDE_DELEGATION_SCOPE",
      `Tenant ${target.tenantId} is outside every live delegation granting ${permission}.`,
    );
  }
  const constrained = granting.filter((d) => (d.scopeLegalEntityIds ?? []).length > 0);
  if (target.legalEntityId && constrained.length > 0) {
    const entityOk = constrained.some((d) => (d.scopeLegalEntityIds ?? []).includes(target.legalEntityId!));
    if (!entityOk) {
      throw new DelegationScopeError(
        "OUTSIDE_ENTITY_SCOPE",
        `Legal entity ${target.legalEntityId} is outside the entity scope of every live delegation granting ${permission}.`,
      );
    }
  }
  const countryConstrained = granting.filter((d) => (d.scopeCountryCodes ?? []).length > 0);
  if (target.countryCode && countryConstrained.length > 0) {
    const countryOk = countryConstrained.some((d) => (d.scopeCountryCodes ?? []).includes(target.countryCode!));
    if (!countryOk) {
      throw new DelegationScopeError(
        "OUTSIDE_COUNTRY_SCOPE",
        `Country ${target.countryCode} is outside the country scope of every live delegation granting ${permission}.`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

export type DelegationRecord = typeof adminAuthorityDelegations.$inferSelect;

export async function listDelegations(principal: Principal): Promise<DelegationRecord[]> {
  // Governed visibility: instruments you issued or received. The administrative
  // surface separately enforces identity:delegation.manage for the management
  // view; this query is the shared, scope-honest data access.
  return db
    .select()
    .from(adminAuthorityDelegations)
    .where(
      or(
        eq(adminAuthorityDelegations.delegatorUserId, principal.userId),
        eq(adminAuthorityDelegations.delegateeUserId, principal.userId),
      ),
    );
}

/**
 * Create a delegation instrument. The caller has ALREADY enforced
 * `identity:delegation.manage` (including the high-risk MFA step-up) through
 * the canonical guard; this function performs the constitutional delegation
 * validation, writes the instrument and appends the audit record + event in
 * ONE transaction.
 */
export async function createDelegation(
  actor: Principal,
  proposal: ProposedAdminDelegation,
  traceId: string,
): Promise<
  | { ok: false; code: DelegationDecision; message: string }
  | { ok: true; delegation: DelegationRecord }
> {
  // The delegator is ALWAYS the acting principal — an administrator can only
  // delegate their own authority, never a third party's.
  if (proposal.delegatorUserId !== actor.userId) {
    return {
      ok: false,
      code: "EXCEEDS_DELEGATOR_AUTHORITY",
      message: "Only the acting administrator's own authority may be delegated.",
    };
  }

  const [delegatee] = await db
    .select({ id: users.id, status: users.status, isServiceAccount: users.isServiceAccount })
    .from(users)
    .where(eq(users.id, proposal.delegateeUserId))
    .limit(1);
  if (!delegatee || delegatee.status !== "ACTIVE" || delegatee.isServiceAccount) {
    return {
      ok: false,
      code: "DELEGATEE_INVALID",
      message: "The delegatee must be an ACTIVE human user identity (service accounts and AI identities can never receive delegated authority).",
    };
  }

  const delegatorRolePermissions = await roleDerivedPermissions(actor.userId, actor.tenantId);
  const delegatorTenantScope = await tenantScopeIds(actor);
  const verdict = validateProposedDelegation({
    proposal,
    delegatorRolePermissions,
    delegatorTenantScope,
  });
  if (!verdict.permitted) {
    return { ok: false, code: verdict.decision, message: verdict.reason };
  }

  // One live instrument per (delegator, delegatee).
  const existing = await db
    .select({ id: adminAuthorityDelegations.id })
    .from(adminAuthorityDelegations)
    .where(
      and(
        eq(adminAuthorityDelegations.delegatorUserId, actor.userId),
        eq(adminAuthorityDelegations.delegateeUserId, proposal.delegateeUserId),
        eq(adminAuthorityDelegations.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return {
      ok: false,
      code: "DUPLICATE_LIVE_INSTRUMENT",
      message: `A live delegation to this administrator already exists (${existing[0].id}); revoke it before issuing a new one.`,
    };
  }

  const id = newId(ID_PREFIX.adminDelegation);
  await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    await tx.insert(adminAuthorityDelegations).values({
      id,
      tenantId: actor.tenantId,
      delegatorUserId: actor.userId,
      delegateeUserId: proposal.delegateeUserId,
      permissions: proposal.permissions,
      scopeTenantIds: proposal.scopeTenantIds,
      scopeLegalEntityIds: proposal.scopeLegalEntityIds ?? [],
      scopeCountryCodes: proposal.scopeCountryCodes ?? [],
      status: "ACTIVE",
      effectiveFrom: proposal.effectiveFrom,
      effectiveTo: proposal.effectiveTo,
      reason: proposal.reason,
    });
    const auditId = await recordAuditTx(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ADMIN_DELEGATED",
      objectType: "ADMIN_DELEGATION",
      objectId: id,
      outcome: "SUCCESS",
      reason: proposal.reason,
      authority: "identity:delegation.manage",
      newValue: {
        delegatorUserId: actor.userId,
        delegateeUserId: proposal.delegateeUserId,
        permissions: proposal.permissions,
        scopeTenantIds: proposal.scopeTenantIds,
        scopeLegalEntityIds: proposal.scopeLegalEntityIds ?? [],
        scopeCountryCodes: proposal.scopeCountryCodes ?? [],
        effectiveFrom: proposal.effectiveFrom.toISOString(),
        effectiveTo: proposal.effectiveTo.toISOString(),
      },
      traceId,
    });
    await tx
      .update(adminAuthorityDelegations)
      .set({ auditRef: auditId })
      .where(eq(adminAuthorityDelegations.id, id));
    await publishEventTx(tx, {
      type: "ADMIN_DELEGATED",
      source: "beyu-os/admin-governance",
      domain: "IDENTITY",
      operation: "ADMIN_DELEGATE",
      destinationDomain: null,
      tenantId: actor.tenantId,
      legalEntityId: null,
      subjectType: "ADMIN_DELEGATION",
      subjectId: id,
      actorUserId: actor.userId,
      classification: "CONFIDENTIAL",
      payload: {
        delegateeUserId: proposal.delegateeUserId,
        permissions: proposal.permissions,
        scopeTenantIds: proposal.scopeTenantIds,
        effectiveTo: proposal.effectiveTo.toISOString(),
      },
      traceId,
      correlationId: traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "identity:delegation.manage",
        policyVersion: ADMIN_DELEGATION_VERSION,
      },
      policyVersion: ADMIN_DELEGATION_VERSION,
    });
  });

  const [delegation] = await db
    .select()
    .from(adminAuthorityDelegations)
    .where(eq(adminAuthorityDelegations.id, id))
    .limit(1);
  return { ok: true, delegation: delegation! };
}

/** Revoke a delegation. Effective immediately: the next request resolves zero delegated permissions from it. */
export async function revokeDelegation(
  actor: Principal,
  delegationId: string,
  revokeReason: string,
  traceId: string,
): Promise<
  | { ok: false; code: DelegationDecision; message: string }
  | { ok: true; delegation: DelegationRecord }
> {
  const [existing] = await db
    .select()
    .from(adminAuthorityDelegations)
    .where(eq(adminAuthorityDelegations.id, delegationId))
    .limit(1);

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: `Delegation ${delegationId} was not found.` };
  }
  // Only the issuing administrator (or an administrator in the issuing tenant
  // holding the capability — the route guard) may revoke; a delegatee can
  // never revoke their own instrument to re-issue it differently.
  if (existing.status === "REVOKED" || existing.revokedAt) {
    return { ok: false, code: "ALREADY_REVOKED", message: `Delegation ${delegationId} is already revoked.` };
  }

  await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    await tx
      .update(adminAuthorityDelegations)
      .set({
        status: "REVOKED",
        revokedAt: new Date(),
        revokedBy: actor.userId,
        revokeReason,
      })
      .where(eq(adminAuthorityDelegations.id, delegationId));
    await recordAuditTx(tx, {
      tenantId: existing.tenantId,
      actorUserId: actor.userId,
      action: "ADMIN_DELEGATION_REVOKED",
      objectType: "ADMIN_DELEGATION",
      objectId: delegationId,
      outcome: "SUCCESS",
      reason: revokeReason,
      authority: "identity:delegation.manage",
      oldValue: {
        status: existing.status,
        permissions: existing.permissions,
        delegateeUserId: existing.delegateeUserId,
        effectiveTo: existing.effectiveTo.toISOString(),
      },
      newValue: { status: "REVOKED", revokedBy: actor.userId },
      traceId,
    });
    await publishEventTx(tx, {
      type: "ADMIN_DELEGATION_REVOKED",
      source: "beyu-os/admin-governance",
      domain: "IDENTITY",
      operation: "ADMIN_DELEGATION_REVOKE",
      destinationDomain: null,
      tenantId: existing.tenantId,
      legalEntityId: null,
      subjectType: "ADMIN_DELEGATION",
      subjectId: delegationId,
      actorUserId: actor.userId,
      classification: "CONFIDENTIAL",
      payload: { delegateeUserId: existing.delegateeUserId, revokeReason },
      traceId,
      correlationId: traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "identity:delegation.manage",
        policyVersion: ADMIN_DELEGATION_VERSION,
      },
      policyVersion: ADMIN_DELEGATION_VERSION,
    });
  });

  const [delegation] = await db
    .select()
    .from(adminAuthorityDelegations)
    .where(eq(adminAuthorityDelegations.id, delegationId))
    .limit(1);
  return { ok: true, delegation: delegation! };
}

// Re-exported so route/service code imports one canonical symbol set.
export { ADMIN_DELEGATABLE_PERMISSIONS, isDelegablePermission };
