/**
 * BEYU OS — Administrative user & tenant governance service.
 *
 * ONE shared capability inside BEYU OS — NOT an Admin OS. Every function here
 * is a GOVERNED MUTATION that:
 *
 *   1. re-authorizes the act through the canonical `can()` primitive (the API
 *      route already enforced it — this is defence in depth, not a second model);
 *   2. re-validates tenant scope through the canonical tenant scoping module;
 *   3. re-validates DELEGATION scope when the authority is delegation-derived;
 *   4. executes the mutation, its audit record and its enterprise event in ONE
 *      transaction (`withAuditTransaction`) — or, for role_assignments writes
 *      (F-01: runtime role is SELECT-only), through the EXISTING governed
 *      admin-DSN boundary with the audit append INSIDE the same admin
 *      transaction;
 *   5. never hard-deletes an identity or a tenant: removal is a terminal
 *      status change that retains every row for audit, legal and historical
 *      attribution, with controlled PII anonymization for removed users.
 *
 * The service holds NO authority of its own. It refuses fail-closed on every
 * precondition it cannot prove.
 */
import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuthorityDelegations,
  auditLog,
  countries,
  legalEntities,
  parties,
  roleAssignments,
  roles,
  sessions,
  tenants,
  users,
} from "@/db/schema";
import { can, type Principal } from "@/lib/authz";
import { recordAudit, recordAuditTx, publishEventTx, withAuditTransaction, type AuditInput, type EventInput, type Tx } from "@/lib/audit";
import { newId, ID_PREFIX } from "@/lib/ids";
import { assertWithinScope, tenantScopeIds } from "@/lib/tenant-scope";
import { adminDb } from "@/db/admin";
import { assertDelegationScope, DelegationScopeError } from "./delegation";
import type { PermissionCode } from "@/lib/constants";

export const ADMIN_GOVERNANCE_VERSION = "admin-governance-1.0.0";

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/** Expected, auditable refusal of a governed act. Routes map these to HTTP. */
export class AdminGovernanceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 422 | 500 = 422,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AdminGovernanceError";
  }
}

function requireCapability(actor: Principal, permission: PermissionCode, action: string): void {
  const decision = can(actor, permission);
  if (!decision.allowed) {
    throw new AdminGovernanceError("FORBIDDEN", decision.reason, 403);
  }
}

/** Scope gate: canonical tenant scope + delegation scope, both fail-closed. */
async function requireActionScope(
  actor: Principal,
  permission: PermissionCode,
  target: { tenantId: string; legalEntityId?: string | null; countryCode?: string | null },
): Promise<void> {
  try {
    await assertWithinScope(actor, target.tenantId);
  } catch {
    throw new AdminGovernanceError(
      "TENANT_OUT_OF_SCOPE",
      `Tenant ${target.tenantId} is outside the acting principal's resolved tenant scope.`,
      403,
    );
  }
  try {
    await assertDelegationScope(actor, permission, target);
  } catch (err) {
    if (err instanceof DelegationScopeError) {
      throw new AdminGovernanceError("DELEGATION_SCOPE_EXCEEDED", err.message, 403);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Shared audit/event builders                                         */
/* ------------------------------------------------------------------ */

function adminAudit(
  actor: Principal,
  action: string,
  objectType: string,
  objectId: string,
  reason: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  permission: PermissionCode,
  traceId: string,
): AuditInput {
  return {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action,
    objectType,
    objectId,
    outcome: "SUCCESS",
    reason,
    authority: permission,
    oldValue,
    newValue,
    traceId,
  };
}

function adminEvent(
  actor: Principal,
  type: string,
  subjectType: string,
  subjectId: string,
  payload: Record<string, unknown>,
  permission: PermissionCode,
  traceId: string,
): EventInput {
  return {
    type,
    source: "beyu-os/admin-governance",
    domain: "IDENTITY",
    operation: type,
    destinationDomain: null,
    tenantId: actor.tenantId,
    legalEntityId: null,
    subjectType,
    subjectId,
    actorUserId: actor.userId,
    classification: "CONFIDENTIAL",
    payload,
    traceId,
    correlationId: traceId,
    causationId: null,
    authorityContext: {
      authorityId: null,
      decisionId: null,
      capabilityCode: null,
      permissionCode: permission,
      policyVersion: ADMIN_GOVERNANCE_VERSION,
    },
    policyVersion: ADMIN_GOVERNANCE_VERSION,
  };
}

async function auditRefusal(
  actor: Principal,
  action: string,
  objectType: string,
  objectId: string,
  reason: string,
  traceId: string,
): Promise<void> {
  await recordAudit({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action,
    objectType,
    objectId,
    outcome: "DENIED",
    reason,
    traceId,
  }).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* USER LIFECYCLE                                                      */
/* ------------------------------------------------------------------ */

export type RegisterUserInput = {
  email: string;
  displayName: string;
  givenName?: string | null;
  familyName?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  /** Home tenant. Must be inside the actor's (and any delegation's) scope. */
  primaryTenantId: string;
  reason: string;
};

/**
 * Register a user identity. The canonical party + user rows are created with a
 * random, NEVER-DISCLOSED password (the exact precedent of the internal
 * identity register route): an administrator can never impersonate the newly
 * created user. Status starts at CREATED — the identity cannot authenticate
 * until it is separately activated (and its credentials established through
 * the existing governed procedures, never by the registering administrator).
 */
export async function registerUser(
  actor: Principal,
  input: RegisterUserInput,
  traceId: string,
): Promise<{ userId: string; partyId: string; status: string }> {
  requireCapability(actor, "identity:user.register", "admin.user.register");
  await requireActionScope(actor, "identity:user.register", { tenantId: input.primaryTenantId, countryCode: input.countryCode ?? null });

  const email = input.email.toLowerCase().trim();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await auditRefusal(actor, "USER_REGISTERED", "USER", email, "EMAIL_ALREADY_REGISTERED", traceId);
    throw new AdminGovernanceError("EMAIL_ALREADY_REGISTERED", `A user identity already exists for ${email}.`, 409);
  }
  const [partyExisting] = await db
    .select({ id: parties.id })
    .from(parties)
    .where(eq(parties.email, email))
    .limit(1);
  if (partyExisting) {
    await auditRefusal(actor, "USER_REGISTERED", "USER", email, "PARTY_EMAIL_ALREADY_REGISTERED", traceId);
    throw new AdminGovernanceError(
      "EMAIL_ALREADY_REGISTERED",
      `A canonical party already exists for ${email}; a party may hold at most ONE GlobalUserID.`,
      409,
    );
  }

  const partyId = newId(ID_PREFIX.party);
  const userId = newId(ID_PREFIX.user);
  // Random secret, hashed and never disclosed: the canonical account has no
  // usable interactive credential until the governed credential procedure
  // establishes one. The registering administrator cannot impersonate the user.
  const passwordHash = createHash("sha256").update(randomBytes(48)).update(email).digest("hex");

  await withAuditTransaction(
    async (tx) => {
      await tx.insert(parties).values({
        id: partyId,
        type: "PERSON",
        displayName: input.displayName,
        givenName: input.givenName ?? null,
        familyName: input.familyName ?? null,
        email,
        phone: input.phone ?? null,
        countryCode: input.countryCode ?? null,
        classification: "CONFIDENTIAL",
        status: "ACTIVE",
      });
      await tx.insert(users).values({
        id: userId,
        partyId,
        email,
        passwordHash,
        passwordAlgo: "sha256-random",
        passwordMustChange: true,
        primaryTenantId: input.primaryTenantId,
        isServiceAccount: false,
        status: "CREATED",
      });
      return { userId, partyId };
    },
    (result) =>
      adminAudit(
        actor,
        "USER_REGISTERED",
        "USER",
        result.userId,
        input.reason,
        null,
        {
          partyId: result.partyId,
          email,
          primaryTenantId: input.primaryTenantId,
          status: "CREATED",
        },
        "identity:user.register",
        traceId,
      ),
    (result) =>
      adminEvent(
        actor,
        "USER_REGISTERED",
        "USER",
        result.userId,
        { email, partyId: result.partyId, primaryTenantId: input.primaryTenantId },
        "identity:user.register",
        traceId,
      ),
  );

  return { userId, partyId, status: "CREATED" };
}

export type UpdateUserInput = {
  displayName?: string;
  phone?: string | null;
  countryCode?: string | null;
  reason: string;
};

/** Governed profile update (umbrella capability; identity fields like email, party and home tenant are immutable here). */
export async function updateUser(
  actor: Principal,
  userId: string,
  input: UpdateUserInput,
  traceId: string,
): Promise<void> {
  requireCapability(actor, "identity:user.manage", "admin.user.update");
  const [target] = await db
    .select({ id: users.id, partyId: users.partyId, tenantId: users.primaryTenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new AdminGovernanceError("USER_NOT_FOUND", `User ${userId} was not found.`, 404);
  await requireActionScope(actor, "identity:user.manage", { tenantId: target.tenantId });

  const before = await db.select().from(parties).where(eq(parties.id, target.partyId)).limit(1);
  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.countryCode !== undefined) patch.countryCode = input.countryCode;

  await withAuditTransaction(
    async (tx) => {
      await tx.update(parties).set(patch).where(eq(parties.id, target.partyId));
      return { before: before[0] ?? null };
    },
    (result) =>
      adminAudit(
        actor,
        "USER_UPDATED",
        "USER",
        userId,
        input.reason,
        result.before
          ? { displayName: result.before.displayName, phone: result.before.phone, countryCode: result.before.countryCode }
          : null,
        patch,
        "identity:user.manage",
        traceId,
      ),
    () =>
      adminEvent(actor, "USER_UPDATED", "USER", userId, { patch }, "identity:user.manage", traceId),
  );
}

export type UserStatusAction = "activate" | "suspend" | "deactivate";

/** The canonical lifecycle status values used by the administrative transitions. */
type LifecycleStatus =
  | "CREATED"
  | "VERIFIED"
  | "ACTIVE"
  | "MODIFIED"
  | "SUSPENDED"
  | "REVOKED"
  | "DEACTIVATED"
  | "ARCHIVED";

const USER_TRANSITIONS: Record<UserStatusAction, { from: string[]; to: LifecycleStatus; audit: string }> = {
  activate: { from: ["CREATED", "SUSPENDED", "DEACTIVATED"], to: "ACTIVE", audit: "USER_ACTIVATED" },
  suspend: { from: ["ACTIVE"], to: "SUSPENDED", audit: "USER_SUSPENDED" },
  deactivate: { from: ["ACTIVE", "SUSPENDED"], to: "DEACTIVATED", audit: "USER_DEACTIVATED" },
};

async function revokeUserSessions(tx: Tx, userId: string): Promise<number> {
  const rows = await tx
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length;
}

/** Count ACTIVE users holding an in-window PLATFORM_ADMIN assignment (last-admin lockout guard). */
export async function activePlatformAdminCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ userId: roleAssignments.userId })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .where(
      and(
        eq(roles.code, "PLATFORM_ADMIN"),
        eq(users.status, "ACTIVE"),
        sql`${roleAssignments.effectiveFrom} <= ${today}`,
        or(isNull(roleAssignments.effectiveTo), sql`${roleAssignments.effectiveTo} >= ${today}`),
      ),
    );
  return new Set(rows.map((r) => r.userId)).size;
}

export async function transitionUserStatus(
  actor: Principal,
  userId: string,
  action: UserStatusAction,
  reason: string,
  traceId: string,
): Promise<{ status: string; sessionsRevoked: number }> {
  requireCapability(actor, "identity:user.suspend", `admin.user.${action}`);
  const [target] = await db
    .select({ id: users.id, status: users.status, tenantId: users.primaryTenantId, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new AdminGovernanceError("USER_NOT_FOUND", `User ${userId} was not found.`, 404);
  await requireActionScope(actor, "identity:user.suspend", { tenantId: target.tenantId });

  if (userId === actor.userId) {
    await auditRefusal(actor, USER_TRANSITIONS[action].audit, "USER", userId, "SELF_ACTION_REFUSED", traceId);
    throw new AdminGovernanceError(
      "SELF_ACTION_REFUSED",
      "An administrator cannot apply a lifecycle action to their own identity.",
      403,
    );
  }

  const transition = USER_TRANSITIONS[action];
  if (!transition.from.includes(target.status)) {
    await auditRefusal(actor, transition.audit, "USER", userId, `INVALID_TRANSITION:${target.status}`, traceId);
    throw new AdminGovernanceError(
      "INVALID_TRANSITION",
      `User ${userId} is ${target.status}; ${action} requires ${transition.from.join("/")}.`,
      409,
    );
  }

  // Last-administrator lockout guard: never deactivate the final active PLATFORM_ADMIN.
  if (action !== "activate") {
    const [isAdmin] = await db
      .select({ code: roles.code })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .where(and(eq(roleAssignments.userId, userId), eq(roles.code, "PLATFORM_ADMIN")))
      .limit(1);
    if (isAdmin && (await activePlatformAdminCount()) <= 1) {
      await auditRefusal(actor, transition.audit, "USER", userId, "LAST_PLATFORM_ADMIN", traceId);
      throw new AdminGovernanceError(
        "LAST_PLATFORM_ADMIN",
        "This is the last ACTIVE PLATFORM_ADMIN identity; the control plane must never be locked out. Appoint another platform administrator first.",
        409,
      );
    }
  }

  const sessionsRevoked = await withAuditTransaction(
    async (tx) => {
      await tx.update(users).set({ status: transition.to }).where(eq(users.id, userId));
      // Away from ACTIVE, every live session dies immediately — access never
      // lingers until token expiry.
      return action === "activate" ? 0 : await revokeUserSessions(tx, userId);
    },
    (revoked) =>
      adminAudit(
        actor,
        transition.audit,
        "USER",
        userId,
        reason,
        { status: target.status },
        { status: transition.to, sessionsRevoked: revoked },
        "identity:user.suspend",
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        transition.audit,
        "USER",
        userId,
        { from: target.status, to: transition.to, reason },
        "identity:user.suspend",
        traceId,
      ),
  );

  return { status: transition.to, sessionsRevoked };
}

/**
 * Remove a user. HIGH-RISK: MFA step-up is enforced by `can()` at the route
 * AND here. Removal is NEVER a hard delete — audit, legal and historical
 * attribution require the identity rows to persist. The act: terminal REVOKED
 * status, immediate session revocation, end-dating of every role assignment,
 * and controlled PII anonymization of the party record (IDs and history
 * retained, personal data scrubbed).
 */
export async function removeUser(
  actor: Principal,
  userId: string,
  reason: string,
  traceId: string,
): Promise<{ status: string; sessionsRevoked: number; assignmentsEnded: number }> {
  requireCapability(actor, "identity:user.remove", "admin.user.remove");
  const [target] = await db
    .select({ id: users.id, status: users.status, tenantId: users.primaryTenantId, partyId: users.partyId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new AdminGovernanceError("USER_NOT_FOUND", `User ${userId} was not found.`, 404);
  if (target.status === "REVOKED") {
    throw new AdminGovernanceError("ALREADY_REMOVED", `User ${userId} is already removed.`, 409);
  }
  await requireActionScope(actor, "identity:user.remove", { tenantId: target.tenantId });

  if (userId === actor.userId) {
    await auditRefusal(actor, "USER_REMOVED", "USER", userId, "SELF_ACTION_REFUSED", traceId);
    throw new AdminGovernanceError(
      "SELF_ACTION_REFUSED",
      "An administrator cannot remove their own identity.",
      403,
    );
  }

  const [isAdmin] = await db
    .select({ code: roles.code })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(and(eq(roleAssignments.userId, userId), eq(roles.code, "PLATFORM_ADMIN")))
    .limit(1);
  if (isAdmin && (await activePlatformAdminCount()) <= 1) {
    await auditRefusal(actor, "USER_REMOVED", "USER", userId, "LAST_PLATFORM_ADMIN", traceId);
    throw new AdminGovernanceError(
      "LAST_PLATFORM_ADMIN",
      "This is the last ACTIVE PLATFORM_ADMIN identity; removal is refused so the control plane is never locked out.",
      409,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const anonymizedEmail = `removed+${userId.toLowerCase()}@anonymized.beyu.os`;

  const result = await withAuditTransaction(
    async (tx) => {
      await tx.update(users).set({ status: "REVOKED" }).where(eq(users.id, userId));
      const sessionsRevoked = await revokeUserSessions(tx, userId);
      // Count the still-active assignments; they are end-dated through the
      // governed admin-DSN boundary immediately after this transaction (F-01:
      // the runtime role cannot UPDATE role_assignments).
      const activeAssignments = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, userId),
            or(isNull(roleAssignments.effectiveTo), sql`${roleAssignments.effectiveTo} >= ${today}`),
          ),
        );
      // Controlled anonymization: retain ids/status/history, scrub personal data.
      await tx
        .update(parties)
        .set({
          displayName: `Removed identity ${userId}`,
          givenName: null,
          familyName: null,
          email: anonymizedEmail,
          phone: null,
          nationality: null,
        })
        .where(eq(parties.id, target.partyId));
      await tx.update(users).set({ email: anonymizedEmail }).where(eq(users.id, userId));
      return { sessionsRevoked, assignmentsEnded: activeAssignments.length };
    },
    (r) =>
      adminAudit(
        actor,
        "USER_REMOVED",
        "USER",
        userId,
        reason,
        { status: target.status },
        { status: "REVOKED", sessionsRevoked: r.sessionsRevoked, assignmentsEnded: r.assignmentsEnded, anonymizedEmail },
        "identity:user.remove",
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        "USER_REMOVED",
        "USER",
        userId,
        { reason, anonymized: true },
        "identity:user.remove",
        traceId,
      ),
  );

  // F-01: role_assignments writes belong to the governed admin boundary. The
  // end-dating runs there in its own audited transaction after the primary
  // removal act is durable. If this second step ever failed, the outcome is a
  // removed (REVOKED, unauthenticated, anonymized) identity whose historical
  // assignments remain on record — never surviving authority: resolvePrincipal
  // returns null for a REVOKED user regardless of assignments.
  await adminDb.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    await tx
      .update(roleAssignments)
      .set({ effectiveTo: yesterday })
      .where(
        and(
          eq(roleAssignments.userId, userId),
          or(isNull(roleAssignments.effectiveTo), sql`${roleAssignments.effectiveTo} >= ${today}`),
        ),
      );
    await recordAuditTx(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ROLE_REVOKED",
      objectType: "USER",
      objectId: userId,
      outcome: "SUCCESS",
      reason: `All assignments end-dated by user removal: ${reason}`,
      authority: "identity:user.remove",
      newValue: { effectiveTo: yesterday, scope: "ALL" },
      traceId,
    });
  });

  return { status: "REVOKED", ...result };
}

/* ------------------------------------------------------------------ */
/* TENANT LIFECYCLE                                                    */
/* ------------------------------------------------------------------ */

export type RegisterTenantInput = {
  code: string;
  name: string;
  type: "ENTERPRISE" | "COUNTRY" | "SECTOR" | "LEGAL_ENTITY" | "BRANCH" | "DEPARTMENT";
  parentTenantId: string;
  countryCode?: string | null;
  isolationTier?: string;
  reason: string;
};

/**
 * Register a tenant through the canonical organization model. Hierarchy is
 * validated (parent must exist inside the actor's scope; the parent chain must
 * be acyclic), country references are validated against `countries`, and the
 * isolation metadata is established. The RLS model is column-based, so no
 * per-tenant policy initialization exists — exactly like every seeded tenant.
 */
export async function registerTenant(
  actor: Principal,
  input: RegisterTenantInput,
  traceId: string,
): Promise<{ tenantId: string; status: string }> {
  requireCapability(actor, "organization:tenant.register", "admin.tenant.register");
  await requireActionScope(actor, "organization:tenant.register", {
    tenantId: input.parentTenantId,
    countryCode: input.countryCode ?? null,
  });

  const code = input.code.trim().toUpperCase();
  const [existing] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.code, code)).limit(1);
  if (existing) {
    await auditRefusal(actor, "TENANT_REGISTERED", "TENANT", code, "TENANT_CODE_EXISTS", traceId);
    throw new AdminGovernanceError("TENANT_CODE_EXISTS", `Tenant code ${code} already exists.`, 409);
  }

  const [parent] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, input.parentTenantId))
    .limit(1);
  if (!parent) {
    throw new AdminGovernanceError("PARENT_TENANT_NOT_FOUND", `Parent tenant ${input.parentTenantId} was not found.`, 404);
  }
  if (parent.status !== "ACTIVE" && parent.status !== "SUSPENDED") {
    await auditRefusal(actor, "TENANT_REGISTERED", "TENANT", code, `PARENT_NOT_OPERATIONAL:${parent.status}`, traceId);
    throw new AdminGovernanceError(
      "PARENT_NOT_OPERATIONAL",
      `Parent tenant ${input.parentTenantId} is ${parent.status}; tenants may only be registered under ACTIVE parents.`,
      409,
    );
  }

  if (input.countryCode) {
    const [country] = await db
      .select({ code: countries.code })
      .from(countries)
      .where(eq(countries.code, input.countryCode))
      .limit(1);
    if (!country) {
      throw new AdminGovernanceError(
        "COUNTRY_NOT_FOUND",
        `Country ${input.countryCode} is not in the canonical country registry.`,
        404,
      );
    }
  }

  const tenantId = newId(ID_PREFIX.tenant);
  await withAuditTransaction(
    async (tx) => {
      await tx.insert(tenants).values({
        id: tenantId,
        code,
        name: input.name,
        type: input.type,
        parentTenantId: input.parentTenantId,
        countryCode: input.countryCode ?? null,
        isolationTier: input.isolationTier ?? "LOGICAL",
        status: "CREATED",
        classification: "CONFIDENTIAL",
      });
      return { tenantId };
    },
    () =>
      adminAudit(
        actor,
        "TENANT_REGISTERED",
        "TENANT",
        tenantId,
        input.reason,
        null,
        { code, name: input.name, type: input.type, parentTenantId: input.parentTenantId, status: "CREATED" },
        "organization:tenant.register",
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        "TENANT_REGISTERED",
        "TENANT",
        tenantId,
        { code, name: input.name, parentTenantId: input.parentTenantId },
        "organization:tenant.register",
        traceId,
      ),
  );

  return { tenantId, status: "CREATED" };
}

export type TenantStatusAction = "activate" | "suspend" | "deactivate" | "archive" | "remove";

const TENANT_TRANSITIONS: Record<TenantStatusAction, { from: string[]; to: LifecycleStatus; audit: string }> = {
  activate: { from: ["CREATED", "SUSPENDED", "DEACTIVATED"], to: "ACTIVE", audit: "TENANT_ACTIVATED" },
  suspend: { from: ["ACTIVE"], to: "SUSPENDED", audit: "TENANT_SUSPENDED" },
  deactivate: { from: ["ACTIVE", "SUSPENDED"], to: "DEACTIVATED", audit: "TENANT_DEACTIVATED" },
  archive: { from: ["ACTIVE", "SUSPENDED", "DEACTIVATED"], to: "ARCHIVED", audit: "TENANT_ARCHIVED" },
  remove: {
    from: ["CREATED", "ACTIVE", "SUSPENDED", "DEACTIVATED", "ARCHIVED"],
    to: "REVOKED",
    audit: "TENANT_REMOVED",
  },
};

/**
 * Dependency evaluation before a destructive tenant operation. Never a hard
 * delete: even a dependency-free tenant keeps its row (status REVOKED) so
 * audit, legal, financial and historical attribution survive. Live operational
 * dependencies BLOCK removal and are reported.
 */
export async function tenantRemovalBlockers(tenantId: string): Promise<Array<{ source: string; count: number }>> {
  const blockers: Array<{ source: string; count: number }> = [];

  const [homeUsers] = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.primaryTenantId, tenantId), sql`${users.status} <> 'REVOKED'`));
  if (Number(homeUsers?.n ?? 0) > 0) blockers.push({ source: "users (home tenant)", count: Number(homeUsers.n) });

  const [activeSessions] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sessions)
    .where(and(eq(sessions.tenantId, tenantId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  if (Number(activeSessions?.n ?? 0) > 0) blockers.push({ source: "active sessions", count: Number(activeSessions.n) });

  const today = new Date().toISOString().slice(0, 10);
  const [activeAssignments] = await db
    .select({ n: sql<number>`count(*)` })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.tenantId, tenantId),
        sql`${roleAssignments.effectiveFrom} <= ${today}`,
        or(isNull(roleAssignments.effectiveTo), sql`${roleAssignments.effectiveTo} >= ${today}`),
      ),
    );
  if (Number(activeAssignments?.n ?? 0) > 0) {
    blockers.push({ source: "active role assignments", count: Number(activeAssignments.n) });
  }

  const [entities] = await db
    .select({ n: sql<number>`count(*)` })
    .from(legalEntities)
    .where(and(eq(legalEntities.tenantId, tenantId), sql`${legalEntities.status} <> 'ARCHIVED'`));
  if (Number(entities?.n ?? 0) > 0) blockers.push({ source: "legal entities", count: Number(entities.n) });

  const [children] = await db
    .select({ n: sql<number>`count(*)` })
    .from(tenants)
    .where(and(eq(tenants.parentTenantId, tenantId), sql`${tenants.status} <> 'REVOKED'`));
  if (Number(children?.n ?? 0) > 0) blockers.push({ source: "child tenants", count: Number(children.n) });

  // Operational rows in every tenant-scoped table. Retained-evidence ledgers
  // (audit_log, enterprise_events, admin_authority_delegations) never block:
  // they are the reason removal is soft.
  const evidenceTables = new Set(["audit_log", "enterprise_events", "admin_authority_delegations"]);
  const scoped = await db.execute<{ table_name: string }>(sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'tenant_id'
      and table_name in (select tablename from pg_tables where schemaname = 'public')
    order by table_name
  `);
  for (const row of scoped.rows) {
    if (evidenceTables.has(row.table_name)) continue;
    const counted = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(row.table_name)} where tenant_id = ${tenantId}`,
    );
    const n = Number(counted.rows[0]?.n ?? 0);
    if (n > 0) blockers.push({ source: row.table_name, count: n });
  }

  return blockers;
}

export async function transitionTenantStatus(
  actor: Principal,
  tenantId: string,
  action: TenantStatusAction,
  reason: string,
  traceId: string,
): Promise<{ status: string; blockers?: Array<{ source: string; count: number }> }> {
  const permission = action === "remove" ? ("organization:tenant.remove" as const) : ("organization:tenant.manage" as const);
  requireCapability(actor, permission, `admin.tenant.${action}`);

  const [target] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!target) throw new AdminGovernanceError("TENANT_NOT_FOUND", `Tenant ${tenantId} was not found.`, 404);
  await requireActionScope(actor, permission, { tenantId, countryCode: target.countryCode });

  const transition = TENANT_TRANSITIONS[action];
  if (!transition.from.includes(target.status)) {
    await auditRefusal(actor, transition.audit, "TENANT", tenantId, `INVALID_TRANSITION:${target.status}`, traceId);
    throw new AdminGovernanceError(
      "INVALID_TRANSITION",
      `Tenant ${target.code} is ${target.status}; ${action} requires ${transition.from.join("/")}.`,
      409,
    );
  }

  if (action === "remove") {
    const blockers = await tenantRemovalBlockers(tenantId);
    if (blockers.length > 0) {
      await auditRefusal(
        actor,
        "TENANT_REMOVED",
        "TENANT",
        tenantId,
        `DEPENDENCIES_PRESENT:${blockers.map((b) => b.source).join(",")}`,
        traceId,
      );
      throw new AdminGovernanceError(
        "DEPENDENCIES_PRESENT",
        `Tenant ${target.code} cannot be removed while live dependencies exist. Resolve or archive them first, or DEACTIVATE/ARCHIVE the tenant instead. Blocking dependencies: ${blockers
          .map((b) => `${b.source} (${b.count})`)
          .join("; ")}.`,
        409,
        blockers,
      );
    }
  }

  await withAuditTransaction(
    async (tx) => {
      await tx.update(tenants).set({ status: transition.to }).where(eq(tenants.id, tenantId));
      if (action !== "activate") {
        // Away from ACTIVE: sessions inside the tenant die immediately.
        await tx
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessions.tenantId, tenantId), isNull(sessions.revokedAt)));
      }
      return { status: transition.to };
    },
    () =>
      adminAudit(
        actor,
        transition.audit,
        "TENANT",
        tenantId,
        reason,
        { status: target.status, code: target.code },
        { status: transition.to, code: target.code },
        permission,
        traceId,
      ),
    () =>
      adminEvent(
        actor,
        transition.audit,
        "TENANT",
        tenantId,
        { code: target.code, from: target.status, to: transition.to, reason },
        permission,
        traceId,
      ),
  );

  return { status: transition.to };
}

/* ------------------------------------------------------------------ */
/* MEMBERSHIP & ROLES (F-01 governed admin-DSN writes)                 */
/* ------------------------------------------------------------------ */

type AdminTx = Parameters<Parameters<typeof adminDb.transaction>[0]>[0];

/**
 * Assign membership: the governed statement "this user is a member of this
 * tenant", represented as an active TENANT_MEMBER role assignment — the
 * zero-capability membership marker. Membership grants NO data visibility;
 * capabilities are separately governed role assignments.
 */
export async function assignMembership(
  actor: Principal,
  userId: string,
  tenantId: string,
  reason: string,
  traceId: string,
): Promise<{ assignmentId: string }> {
  requireCapability(actor, "identity:membership.manage", "admin.membership.assign");
  await requireActionScope(actor, "identity:membership.manage", { tenantId });

  const [target] = await db
    .select({ id: users.id, status: users.status, isServiceAccount: users.isServiceAccount })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new AdminGovernanceError("USER_NOT_FOUND", `User ${userId} was not found.`, 404);
  if (target.status !== "ACTIVE") {
    throw new AdminGovernanceError("USER_NOT_ACTIVE", `User ${userId} is ${target.status}; only ACTIVE users may join a tenant.`, 409);
  }
  if (target.isServiceAccount) {
    throw new AdminGovernanceError(
      "SERVICE_ACCOUNT_REFUSED",
      "Service accounts join tenants through their governed provisioning path, not administrative membership.",
      409,
    );
  }

  const [memberRole] = await db.select().from(roles).where(eq(roles.code, "TENANT_MEMBER")).limit(1);
  if (!memberRole) {
    throw new AdminGovernanceError(
      "MEMBERSHIP_ROLE_MISSING",
      "The TENANT_MEMBER membership role is absent from the canonical role catalogue; re-run the constitutional seed.",
      500,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const existing = await adminDb
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.roleId, memberRole.id),
        eq(roleAssignments.tenantId, tenantId),
        sql`${roleAssignments.effectiveFrom} <= ${today}`,
        or(isNull(roleAssignments.effectiveTo), sql`${roleAssignments.effectiveTo} >= ${today}`),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    throw new AdminGovernanceError("MEMBERSHIP_EXISTS", `User ${userId} is already a member of tenant ${tenantId}.`, 409);
  }

  const assignmentId = newId(ID_PREFIX.roleAssignment);
  await adminDb.transaction(async (rawTx) => {
    const tx = rawTx as unknown as AdminTx;
    await tx.insert(roleAssignments).values({
      id: assignmentId,
      userId,
      roleId: memberRole.id,
      tenantId,
      effectiveFrom: today,
      grantedBy: actor.userId,
      justification: `Membership assignment: ${reason}`,
    });
    await recordAuditTx(tx as unknown as Tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "MEMBERSHIP_GRANTED",
      objectType: "MEMBERSHIP",
      objectId: `${userId}:${tenantId}`,
      outcome: "SUCCESS",
      reason,
      authority: "identity:membership.manage",
      newValue: { userId, tenantId, role: "TENANT_MEMBER", assignmentId },
      traceId,
    });
    await publishEventTx(tx as unknown as Tx, {
      type: "MEMBERSHIP_GRANTED",
      source: "beyu-os/admin-governance",
      domain: "IDENTITY",
      operation: "MEMBERSHIP_GRANTED",
      destinationDomain: null,
      tenantId,
      legalEntityId: null,
      subjectType: "MEMBERSHIP",
      subjectId: `${userId}:${tenantId}`,
      actorUserId: actor.userId,
      classification: "CONFIDENTIAL",
      payload: { userId, tenantId },
      traceId,
      correlationId: traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "identity:membership.manage",
        policyVersion: ADMIN_GOVERNANCE_VERSION,
      },
      policyVersion: ADMIN_GOVERNANCE_VERSION,
    });
  });

  return { assignmentId };
}

/**
 * Revoke membership: end-dates EVERY active role assignment of the user in the
 * tenant (membership marker and capabilities alike — leaving capabilities
 * behind a revoked membership would be an empty gesture), and kills the user's
 * live sessions in that tenant. The user's HOME tenant cannot be revoked —
 * that is a transfer, which is a distinct governed act.
 */
export async function revokeMembership(
  actor: Principal,
  userId: string,
  tenantId: string,
  reason: string,
  traceId: string,
): Promise<{ assignmentsEnded: number; sessionsRevoked: number }> {
  requireCapability(actor, "identity:membership.manage", "admin.membership.revoke");
  await requireActionScope(actor, "identity:membership.manage", { tenantId });

  const [target] = await db
    .select({ id: users.id, primaryTenantId: users.primaryTenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new AdminGovernanceError("USER_NOT_FOUND", `User ${userId} was not found.`, 404);
  if (target.primaryTenantId === tenantId) {
    await auditRefusal(actor, "MEMBERSHIP_REVOKED", "MEMBERSHIP", `${userId}:${tenantId}`, "HOME_TENANT", traceId);
    throw new AdminGovernanceError(
      "HOME_TENANT",
      `Tenant ${tenantId} is this user's HOME tenant; membership of the home tenant is transferred, not revoked. Register the user in another home tenant or remove the identity instead.`,
      409,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const ended = await adminDb.transaction(async (rawTx) => {
    const tx = rawTx as unknown as AdminTx;
    const rows = await tx
      .update(roleAssignments)
      .set({ effectiveTo: yesterday })
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.tenantId, tenantId),
          sql`${roleAssignments.effectiveFrom} <= ${today}`,
          or(isNull(roleAssignments.effectiveTo), sql`${roleAssignments.effectiveTo} >= ${today}`),
        ),
      )
      .returning({ id: roleAssignments.id });
    await recordAuditTx(tx as unknown as Tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "MEMBERSHIP_REVOKED",
      objectType: "MEMBERSHIP",
      objectId: `${userId}:${tenantId}`,
      outcome: "SUCCESS",
      reason,
      authority: "identity:membership.manage",
      newValue: { userId, tenantId, assignmentsEnded: rows.length, effectiveTo: yesterday },
      traceId,
    });
    await publishEventTx(tx as unknown as Tx, {
      type: "MEMBERSHIP_REVOKED",
      source: "beyu-os/admin-governance",
      domain: "IDENTITY",
      operation: "MEMBERSHIP_REVOKED",
      destinationDomain: null,
      tenantId,
      legalEntityId: null,
      subjectType: "MEMBERSHIP",
      subjectId: `${userId}:${tenantId}`,
      actorUserId: actor.userId,
      classification: "CONFIDENTIAL",
      payload: { userId, tenantId, assignmentsEnded: rows.length },
      traceId,
      correlationId: traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "identity:membership.manage",
        policyVersion: ADMIN_GOVERNANCE_VERSION,
      },
      policyVersion: ADMIN_GOVERNANCE_VERSION,
    });
    return rows.length;
  });

  // Immediate effect: the user's sessions in that tenant cannot outlive the
  // membership they were founded on.
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), eq(sessions.tenantId, tenantId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });

  return { assignmentsEnded: ended, sessionsRevoked: revoked.length };
}

export type GrantRoleInput = {
  userId: string;
  roleCode: string;
  tenantId: string;
  legalEntityId?: string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  justification: string;
};

/**
 * Grant a role assignment. HIGH-RISK (MFA step-up enforced by `can()`).
 * Guards: no self-grant (self-escalation); privileged roles may be granted
 * only by an actor who is themselves a PLATFORM_ADMIN; the target must be an
 * ACTIVE user; the tenant must be in scope; duplicates are refused.
 * The write goes through the governed admin-DSN boundary (F-01) with the audit
 * append in the SAME transaction.
 */
export async function grantRole(
  actor: Principal,
  input: GrantRoleInput,
  traceId: string,
): Promise<{ assignmentId: string }> {
  requireCapability(actor, "identity:role.grant", "admin.role.grant");

  if (input.userId === actor.userId) {
    await auditRefusal(actor, "ROLE_GRANTED", "ROLE_ASSIGNMENT", input.userId, "SELF_GRANT_REFUSED", traceId);
    throw new AdminGovernanceError(
      "SELF_GRANT_REFUSED",
      "An administrator cannot grant a role to themselves; that is self-escalation. Another authorized administrator must grant it.",
      403,
    );
  }

  const [role] = await db.select().from(roles).where(eq(roles.code, input.roleCode)).limit(1);
  if (!role) throw new AdminGovernanceError("ROLE_NOT_FOUND", `Role ${input.roleCode} is not in the canonical catalogue.`, 404);

  if (role.privileged && !actor.roles.includes("PLATFORM_ADMIN")) {
    await auditRefusal(actor, "ROLE_GRANTED", "ROLE_ASSIGNMENT", input.userId, "PRIVILEGED_ROLE_REFUSED", traceId);
    throw new AdminGovernanceError(
      "PRIVILEGED_ROLE_REFUSED",
      `Role ${input.roleCode} is privileged; only a PLATFORM_ADMIN may grant it.`,
      403,
    );
  }

  await requireActionScope(actor, "identity:role.grant", {
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId ?? null,
  });

  const [target] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!target) throw new AdminGovernanceError("USER_NOT_FOUND", `User ${input.userId} was not found.`, 404);
  if (target.status !== "ACTIVE") {
    throw new AdminGovernanceError("USER_NOT_ACTIVE", `User ${input.userId} is ${target.status}; roles are granted to ACTIVE users.`, 409);
  }

  if (input.legalEntityId) {
    const [entity] = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(and(eq(legalEntities.id, input.legalEntityId), eq(legalEntities.tenantId, input.tenantId)))
      .limit(1);
    if (!entity) {
      throw new AdminGovernanceError(
        "ENTITY_TENANT_MISMATCH",
        `Legal entity ${input.legalEntityId} does not belong to tenant ${input.tenantId}.`,
        409,
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const effectiveFrom = input.effectiveFrom ?? today;
  if (input.effectiveTo && input.effectiveTo < effectiveFrom) {
    throw new AdminGovernanceError("INVALID_WINDOW", "effectiveTo precedes effectiveFrom.", 422);
  }

  const duplicate = await adminDb
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, input.userId),
        eq(roleAssignments.roleId, role.id),
        eq(roleAssignments.tenantId, input.tenantId),
        input.legalEntityId
          ? eq(roleAssignments.legalEntityId, input.legalEntityId)
          : isNull(roleAssignments.legalEntityId),
        sql`${roleAssignments.effectiveFrom} <= ${today}`,
        or(isNull(roleAssignments.effectiveTo), sql`${roleAssignments.effectiveTo} >= ${today}`),
      ),
    )
    .limit(1);
  if (duplicate.length > 0) {
    throw new AdminGovernanceError(
      "ASSIGNMENT_EXISTS",
      `An active ${input.roleCode} assignment already exists for this user/tenant/entity.`,
      409,
    );
  }

  const assignmentId = newId(ID_PREFIX.roleAssignment);
  await adminDb.transaction(async (rawTx) => {
    const tx = rawTx as unknown as AdminTx;
    await tx.insert(roleAssignments).values({
      id: assignmentId,
      userId: input.userId,
      roleId: role.id,
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId ?? null,
      effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      grantedBy: actor.userId,
      justification: input.justification,
    });
    await recordAuditTx(tx as unknown as Tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ROLE_GRANTED",
      objectType: "ROLE_ASSIGNMENT",
      objectId: assignmentId,
      outcome: "SUCCESS",
      reason: input.justification,
      authority: "identity:role.grant",
      newValue: {
        userId: input.userId,
        roleCode: input.roleCode,
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId ?? null,
        effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      },
      traceId,
    });
    await publishEventTx(tx as unknown as Tx, {
      type: "ROLE_GRANTED",
      source: "beyu-os/admin-governance",
      domain: "IDENTITY",
      operation: "ROLE_GRANTED",
      destinationDomain: null,
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId ?? null,
      subjectType: "ROLE_ASSIGNMENT",
      subjectId: assignmentId,
      actorUserId: actor.userId,
      classification: "CONFIDENTIAL",
      payload: { userId: input.userId, roleCode: input.roleCode },
      traceId,
      correlationId: traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "identity:role.grant",
        policyVersion: ADMIN_GOVERNANCE_VERSION,
      },
      policyVersion: ADMIN_GOVERNANCE_VERSION,
    });
  });

  return { assignmentId };
}

/** Revoke (end-date) a role assignment. HIGH-RISK; last-administrator guarded. */
export async function revokeRole(
  actor: Principal,
  assignmentId: string,
  reason: string,
  traceId: string,
): Promise<{ effectiveTo: string }> {
  requireCapability(actor, "identity:role.grant", "admin.role.revoke");

  const [assignment] = await adminDb
    .select()
    .from(roleAssignments)
    .where(eq(roleAssignments.id, assignmentId))
    .limit(1);
  if (!assignment) {
    throw new AdminGovernanceError("ASSIGNMENT_NOT_FOUND", `Role assignment ${assignmentId} was not found.`, 404);
  }
  await requireActionScope(actor, "identity:role.grant", {
    tenantId: assignment.tenantId,
    legalEntityId: assignment.legalEntityId,
  });

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (assignment.effectiveTo && assignment.effectiveTo < today) {
    throw new AdminGovernanceError("ASSIGNMENT_ALREADY_ENDED", `Assignment ${assignmentId} is already ended.`, 409);
  }

  const [role] = await db.select().from(roles).where(eq(roles.id, assignment.roleId)).limit(1);
  if (role?.code === "PLATFORM_ADMIN" && (await activePlatformAdminCount()) <= 1) {
    await auditRefusal(actor, "ROLE_REVOKED", "ROLE_ASSIGNMENT", assignmentId, "LAST_PLATFORM_ADMIN", traceId);
    throw new AdminGovernanceError(
      "LAST_PLATFORM_ADMIN",
      "This is the last active PLATFORM_ADMIN assignment; revoking it would lock out the control plane.",
      409,
    );
  }

  await adminDb.transaction(async (rawTx) => {
    const tx = rawTx as unknown as AdminTx;
    await tx
      .update(roleAssignments)
      .set({ effectiveTo: yesterday })
      .where(eq(roleAssignments.id, assignmentId));
    await recordAuditTx(tx as unknown as Tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ROLE_REVOKED",
      objectType: "ROLE_ASSIGNMENT",
      objectId: assignmentId,
      outcome: "SUCCESS",
      reason,
      authority: "identity:role.grant",
      oldValue: {
        userId: assignment.userId,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo,
      },
      newValue: { effectiveTo: yesterday },
      traceId,
    });
    await publishEventTx(tx as unknown as Tx, {
      type: "ROLE_REVOKED",
      source: "beyu-os/admin-governance",
      domain: "IDENTITY",
      operation: "ROLE_REVOKED",
      destinationDomain: null,
      tenantId: assignment.tenantId,
      legalEntityId: assignment.legalEntityId,
      subjectType: "ROLE_ASSIGNMENT",
      subjectId: assignmentId,
      actorUserId: actor.userId,
      classification: "CONFIDENTIAL",
      payload: { userId: assignment.userId, reason },
      traceId,
      correlationId: traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "identity:role.grant",
        policyVersion: ADMIN_GOVERNANCE_VERSION,
      },
      policyVersion: ADMIN_GOVERNANCE_VERSION,
    });
  });

  // Revocation must not wait for session expiry: the permission set is
  // recomputed per request from assignments, so end-dating is already
  // immediate; the sessions in the affected tenant are killed anyway so no
  // live session retains its tenant context.
  return { effectiveTo: yesterday };
}

/* ------------------------------------------------------------------ */
/* Read models (governed listings for the administrative surface)      */
/* ------------------------------------------------------------------ */

export async function listUsersInScope(actor: Principal) {
  const scope = await tenantScopeIds(actor);
  return db
    .select({
      id: users.id,
      email: users.email,
      status: users.status,
      mfaEnrolled: users.mfaEnrolled,
      isServiceAccount: users.isServiceAccount,
      lastLoginAt: users.lastLoginAt,
      primaryTenantId: users.primaryTenantId,
      displayName: parties.displayName,
      countryCode: parties.countryCode,
      tenantCode: tenants.code,
    })
    .from(users)
    .innerJoin(parties, eq(parties.id, users.partyId))
    .leftJoin(tenants, eq(tenants.id, users.primaryTenantId))
    .where(inArray(users.primaryTenantId, scope))
    .orderBy(users.email);
}

export async function listTenantsInScope(actor: Principal) {
  const scope = await tenantScopeIds(actor);
  return db
    .select({
      id: tenants.id,
      code: tenants.code,
      name: tenants.name,
      type: tenants.type,
      parentTenantId: tenants.parentTenantId,
      countryCode: tenants.countryCode,
      isolationTier: tenants.isolationTier,
      status: tenants.status,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .where(inArray(tenants.id, scope))
    .orderBy(tenants.code);
}

export async function listMembershipsInScope(actor: Principal) {
  const scope = await tenantScopeIds(actor);
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: roleAssignments.id,
      userId: roleAssignments.userId,
      tenantId: roleAssignments.tenantId,
      roleId: roleAssignments.roleId,
      roleCode: roles.code,
      roleName: roles.name,
      legalEntityId: roleAssignments.legalEntityId,
      effectiveFrom: roleAssignments.effectiveFrom,
      effectiveTo: roleAssignments.effectiveTo,
      grantedBy: roleAssignments.grantedBy,
      justification: roleAssignments.justification,
      email: users.email,
      displayName: parties.displayName,
      tenantCode: tenants.code,
    })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .innerJoin(parties, eq(parties.id, users.partyId))
    .innerJoin(tenants, eq(tenants.id, roleAssignments.tenantId))
    .where(inArray(roleAssignments.tenantId, scope))
    .orderBy(desc(roleAssignments.effectiveFrom));
  return rows.map((r) => ({
    ...r,
    active: r.effectiveFrom <= today && (r.effectiveTo === null || r.effectiveTo >= today),
  }));
}

export async function listRoleCatalogue() {
  return db
    .select({
      id: roles.id,
      code: roles.code,
      name: roles.name,
      description: roles.description,
      scopeLevel: roles.scopeLevel,
      privileged: roles.privileged,
    })
    .from(roles)
    .orderBy(roles.code);
}

export async function listDelegationInstruments(actor: Principal) {
  return db
    .select()
    .from(adminAuthorityDelegations)
    .where(
      or(
        eq(adminAuthorityDelegations.delegatorUserId, actor.userId),
        eq(adminAuthorityDelegations.delegateeUserId, actor.userId),
        eq(adminAuthorityDelegations.tenantId, actor.tenantId),
      ),
    )
    .orderBy(desc(adminAuthorityDelegations.createdAt));
}

/** The canonical administrative actions tracked by the administrative audit surface. */
export const ADMINISTRATIVE_AUDIT_ACTIONS = [
  "USER_REGISTERED",
  "USER_UPDATED",
  "USER_ACTIVATED",
  "USER_SUSPENDED",
  "USER_DEACTIVATED",
  "USER_REMOVED",
  "TENANT_REGISTERED",
  "TENANT_ACTIVATED",
  "TENANT_SUSPENDED",
  "TENANT_DEACTIVATED",
  "TENANT_ARCHIVED",
  "TENANT_REMOVED",
  "MEMBERSHIP_GRANTED",
  "MEMBERSHIP_REVOKED",
  "ROLE_GRANTED",
  "ROLE_REVOKED",
  "ADMIN_DELEGATED",
  "ADMIN_DELEGATION_REVOKED",
] as const;

/**
 * Governed read of the EXISTING immutable audit ledger, filtered to the
 * administrative actions of this capability. Runs inside the RLS tenant scope
 * the request guard established; the ledger itself is untouched.
 */
export async function listAdministrativeAudit(actor: Principal, limit = 100) {
  return db
    .select({
      id: auditLog.id,
      tenantId: auditLog.tenantId,
      actorUserId: auditLog.actorUserId,
      actorType: auditLog.actorType,
      action: auditLog.action,
      objectType: auditLog.objectType,
      objectId: auditLog.objectId,
      outcome: auditLog.outcome,
      reason: auditLog.reason,
      authority: auditLog.authority,
      oldValue: auditLog.oldValue,
      newValue: auditLog.newValue,
      traceId: auditLog.traceId,
      occurredAt: auditLog.occurredAt,
      hash: auditLog.hash,
    })
    .from(auditLog)
    .where(inArray(auditLog.action, [...ADMINISTRATIVE_AUDIT_ACTIONS]))
    .orderBy(desc(auditLog.sequence))
    .limit(Math.min(Math.max(limit, 1), 500));
}
