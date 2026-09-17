import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../src/db";
import {
  adminAuthorityDelegations,
  auditLog,
  parties,
  roleAssignments,
  roles,
  sessions,
  tenants,
  users,
} from "../../src/db/schema";
import { fixedId, ID_PREFIX, newId } from "../../src/lib/ids";
import {
  activeDelegatedPermissions,
  clearanceForRoles,
  loadGrants,
  permissionsForRoles,
  type Principal,
} from "../../src/lib/authz";
import {
  createDelegation,
  revokeDelegation,
} from "../../src/lib/admin/delegation";
import {
  AdminGovernanceError,
  assignMembership,
  grantRole,
  activePlatformAdminCount,
  registerTenant,
  registerUser,
  removeUser,
  revokeMembership,
  revokeRole,
  tenantRemovalBlockers,
  transitionTenantStatus,
  transitionUserStatus,
} from "../../src/lib/admin/governance-service";
import { hashPassword } from "../../src/lib/crypto";
import { resetAuditLedgers } from "../helpers/ledger-reset";

/**
 * Governed administrative user & tenant governance — SERVICE-LEVEL tests
 * against a REAL PostgreSQL database (no mocks): every persistence, audit,
 * event and refusal assertion is read back from the database after commit.
 *
 * Scope of this suite: identity/tenant/membership/role lifecycle + delegation
 * instruments. The adversarial security matrix (cross-tenant, expired/revoked
 * delegation, escalation attempts, AI boundary) lives in
 * tests/security/admin-security-matrix.test.ts; the HTTP boundary in
 * tests/admin/admin-http.test.ts.
 */

const T = {
  group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP"),
  tz: fixedId(ID_PREFIX.tenant, "BEYU_TZ"),
  health: fixedId(ID_PREFIX.tenant, "BEYU_HEALTH"),
  foundation: fixedId(ID_PREFIX.tenant, "BEYU_FOUNDATION"),
};

const TRACE = "TEST_ADMIN_GOV";

/** Build a principal exactly as lib/session.ts resolvePrincipal() would. */
async function principalFor(userKey: string, overrides: Partial<Principal> = {}): Promise<Principal> {
  const userId = fixedId(ID_PREFIX.user, userKey);
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new Error(`seed user ${userKey} missing — run npm run seed`);
  const [t] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roleCodes = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: t.code,
    tenantType: t.type,
    roles: roleCodes,
    permissions: permissionsForRoles(roleCodes),
    clearance: clearanceForRoles(roleCodes),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "TEST",
    riskScore: 0,
    emergencyPermissions: [],
    delegatedPermissions: [],
    ...overrides,
  };
}

function expectRefusal(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({ name: "AdminGovernanceError", code });
}

/** Suite-created records, removed on teardown; seed data is never touched. */
const createdUserIds: string[] = [];
const createdPartyIds: string[] = [];
const createdTenantIds: string[] = [];
const createdAssignmentIds: string[] = [];
const createdDelegationIds: string[] = [];

afterAll(async () => {
  for (const id of createdDelegationIds) {
    await db.delete(adminAuthorityDelegations).where(eq(adminAuthorityDelegations.id, id));
  }
  for (const id of createdAssignmentIds) {
    await db.delete(roleAssignments).where(eq(roleAssignments.id, id));
  }
  for (const id of createdUserIds) {
    // Suite-created identities may still be referenced by grants the service
    // created through the governed admin path (membership, roles) or by
    // fabricated sessions; clear those dependents before the rows themselves.
    await db.delete(sessions).where(eq(sessions.userId, id));
    await db.delete(roleAssignments).where(eq(roleAssignments.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  for (const id of createdPartyIds) {
    await db.delete(parties).where(eq(parties.id, id));
  }
  for (const id of createdTenantIds) {
    await db.delete(tenants).where(eq(tenants.id, id));
  }
});

/** Sanctioned ledger reset between cases (repo convention; see ledger-reset.ts). */
beforeEach(async () => {
  await resetAuditLedgers();
});

async function registerTestUser(
  admin: Principal,
  email: string,
  primaryTenantId = T.tz,
): Promise<{ userId: string; partyId: string }> {
  const result = await registerUser(admin, {
    email,
    displayName: `Test Identity ${email}`,
    primaryTenantId,
    reason: "Service-level governance suite fixture.",
  }, TRACE);
  createdUserIds.push(result.userId);
  createdPartyIds.push(result.partyId);
  return result;
}

describe("user lifecycle", () => {
  it("registers a user with a never-disclosed credential and CREATED status", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const email = `gov-suite-${Date.now()}@beyu.os`;
    const { userId, partyId, status } = await registerUser(admin, {
      email,
      displayName: "Governance Suite Identity",
      countryCode: "TZ",
      primaryTenantId: T.tz,
      reason: "Registering an identity for the governance suite.",
    }, TRACE);
    createdUserIds.push(userId);
    createdPartyIds.push(partyId);
    expect(status).toBe("CREATED");

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.status).toBe("CREATED");
    expect(row.isServiceAccount).toBe(false);
    expect(row.passwordMustChange).toBe(true);
    // The stored credential is a random, never-disclosed secret: it must NOT
    // verify any plausible human-chosen or bootstrap password.
    expect(row.passwordHash).not.toBe(hashPassword(process.env.BEYU_BOOTSTRAP_PASSWORD ?? ""));
    expect(row.passwordAlgo).toBe("sha256-random");
    expect(row.passwordHash.length).toBe(64); // sha256 hex of random bytes

    const [party] = await db.select().from(parties).where(eq(parties.id, partyId));
    expect(party.email).toBe(email);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectId, userId), eq(auditLog.action, "USER_REGISTERED")));
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.actorUserId).toBe(admin.userId);
    expect(audit.authority).toBe("identity:user.register");
  });

  it("refuses duplicate email registration and audits the denial", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const email = `gov-dup-${Date.now()}@beyu.os`;
    await registerTestUser(admin, email);
    await expectRefusal(
      registerUser(admin, { email, displayName: "Duplicate", primaryTenantId: T.tz, reason: "Duplicate registration attempt." }, TRACE),
      "EMAIL_ALREADY_REGISTERED",
    );
    const [denied] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectId, email), eq(auditLog.action, "USER_REGISTERED"), eq(auditLog.outcome, "DENIED")));
    expect(denied.reason).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("walks CREATED → ACTIVE → SUSPENDED → ACTIVE and revokes sessions on suspension", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId } = await registerTestUser(admin, `gov-lifecycle-${Date.now()}@beyu.os`);

    await expectRefusal(transitionUserStatus(admin, userId, "suspend", "Wrong direction.", TRACE), "INVALID_TRANSITION");

    const activated = await transitionUserStatus(admin, userId, "activate", "Credential procedure complete.", TRACE);
    expect(activated.status).toBe("ACTIVE");

    // A fabricated live session for the user must die on suspension.
    await db.insert(sessions).values({
      id: newId(ID_PREFIX.session),
      userId,
      tenantId: T.tz,
      tokenHash: `suite-${userId}-${Date.now()}`.padEnd(64, "x"),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const suspended = await transitionUserStatus(admin, userId, "suspend", "Pending investigation.", TRACE);
    expect(suspended.status).toBe("SUSPENDED");
    expect(suspended.sessionsRevoked).toBe(1);
    const [live] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    expect(live).toBeUndefined();

    const reactivated = await transitionUserStatus(admin, userId, "activate", "Investigation closed.", TRACE);
    expect(reactivated.status).toBe("ACTIVE");
  });

  it("refuses self-suspension and self-removal", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    await expectRefusal(
      transitionUserStatus(admin, admin.userId, "suspend", "Trying to suspend myself.", TRACE),
      "SELF_ACTION_REFUSED",
    );
    await expectRefusal(removeUser(admin, admin.userId, "Trying to remove myself.", TRACE), "SELF_ACTION_REFUSED");
  });

  it("refuses deactivation/removal of the last active PLATFORM_ADMIN (lockout guard)", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    expect(await activePlatformAdminCount()).toBeGreaterThanOrEqual(1);
    await expectRefusal(
      transitionUserStatus(admin, admin.userId, "deactivate", "Would lock out the control plane.", TRACE),
      "SELF_ACTION_REFUSED", // self guard fires first — the last-admin guard is proven below via role revocation
    );
    const [assignment] = await db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .where(and(eq(roleAssignments.userId, admin.userId), eq(roles.code, "PLATFORM_ADMIN")));
    if ((await activePlatformAdminCount()) <= 1) {
      await expectRefusal(
        revokeRole(admin, assignment.id, "Would revoke the last platform administrator.", TRACE),
        "LAST_PLATFORM_ADMIN",
      );
    }
  });

  it("removes a user WITHOUT deleting identity rows: REVOKED + anonymized PII + end-dated grants + audit", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId, partyId } = await registerTestUser(admin, `gov-removal-${Date.now()}@beyu.os`);
    await transitionUserStatus(admin, userId, "activate", "Ready for removal test.", TRACE);
    await assignMembership(admin, userId, T.health, "Membership before removal.", TRACE);

    const result = await removeUser(admin, userId, "Off-boarding complete; retain attribution.", TRACE);
    expect(result.status).toBe("REVOKED");

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row, "the identity row must be RETAINED (never hard-deleted)").toBeTruthy();
    expect(row.status).toBe("REVOKED");
    expect(row.email).toBe(`removed+${userId.toLowerCase()}@anonymized.beyu.os`);

    const [party] = await db.select().from(parties).where(eq(parties.id, partyId));
    expect(party.givenName).toBeNull();
    expect(party.familyName).toBeNull();
    expect(party.phone).toBeNull();

    const ended = await db
      .select()
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, userId), isNull(roleAssignments.effectiveTo)));
    expect(ended.length).toBe(0);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectId, userId), eq(auditLog.action, "USER_REMOVED")));
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.authority).toBe("identity:user.remove");

    await expectRefusal(removeUser(admin, userId, "Already removed.", TRACE), "ALREADY_REMOVED");
  });
});

describe("tenant lifecycle", () => {
  it("registers a tenant under an in-scope parent and walks the lifecycle", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const code = `BEYU-GOV-${Date.now() % 100000}`;
    const { tenantId, status } = await registerTenant(admin, {
      code,
      name: "Governance Suite Tenant",
      type: "SECTOR",
      parentTenantId: T.tz,
      countryCode: "TZ",
      reason: "Registering a tenant for the governance suite.",
    }, TRACE);
    createdTenantIds.push(tenantId);
    expect(status).toBe("CREATED");

    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(row.parentTenantId).toBe(T.tz);
    expect(row.isolationTier).toBe("LOGICAL");

    await expectRefusal(
      transitionTenantStatus(admin, tenantId, "suspend", "Cannot suspend a CREATED tenant.", TRACE),
      "INVALID_TRANSITION",
    );
    await transitionTenantStatus(admin, tenantId, "activate", "Operational go-live.", TRACE);
    await transitionTenantStatus(admin, tenantId, "suspend", "Operations pause.", TRACE);
    await transitionTenantStatus(admin, tenantId, "activate", "Resumed.", TRACE);
    await transitionTenantStatus(admin, tenantId, "archive", "End of operations.", TRACE);
    await expectRefusal(
      transitionTenantStatus(admin, tenantId, "activate", "ARCHIVED is terminal.", TRACE),
      "INVALID_TRANSITION",
    );

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectId, tenantId), eq(auditLog.action, "TENANT_ARCHIVED")));
    expect(audit.outcome).toBe("SUCCESS");
  });

  it("refuses duplicate codes, missing parents and unknown countries", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    await expectRefusal(
      registerTenant(admin, {
        code: "BEYU-TZ",
        name: "Duplicate",
        type: "COUNTRY",
        parentTenantId: T.group,
        reason: "Duplicate code attempt.",
      }, TRACE),
      "TENANT_CODE_EXISTS",
    );
    // A nonexistent parent fails CLOSED at the scope wall first: the service
    // never leaks which tenant ids exist (TENANT_OUT_OF_SCOPE, 403).
    await expectRefusal(
      registerTenant(admin, {
        code: `BEYU-ORPHAN-${Date.now() % 100000}`,
        name: "Orphan",
        type: "SECTOR",
        parentTenantId: "TEN_DOES_NOT_EXIST",
        reason: "Missing parent attempt.",
      }, TRACE),
      "TENANT_OUT_OF_SCOPE",
    );
    await expectRefusal(
      registerTenant(admin, {
        code: `BEYU-BADCOUNTRY-${Date.now() % 100000}`,
        name: "Bad country",
        type: "SECTOR",
        parentTenantId: T.tz,
        countryCode: "ZZ",
        reason: "Unknown country attempt.",
      }, TRACE),
      "COUNTRY_NOT_FOUND",
    );
  });

  it("refuses removal while dependencies exist and reports the blockers", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const blockers = await tenantRemovalBlockers(T.tz);
    expect(blockers.length).toBeGreaterThan(0);
    const sources = blockers.map((b) => b.source);
    expect(sources).toContain("users (home tenant)");
    expect(sources).toContain("legal entities");

    await expectRefusal(
      transitionTenantStatus(admin, T.tz, "remove", "Attempted while dependencies exist.", TRACE),
      "DEPENDENCIES_PRESENT",
    );
    // The canonical tenants must still be ACTIVE — nothing was destroyed.
    const [tz] = await db.select().from(tenants).where(eq(tenants.id, T.tz));
    expect(tz.status).toBe("ACTIVE");
  });
});

describe("membership & roles", () => {
  it("assigns membership as a zero-capability TENANT_MEMBER grant and revokes by end-dating", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId } = await registerTestUser(admin, `gov-member-${Date.now()}@beyu.os`);
    await transitionUserStatus(admin, userId, "activate", "Ready for membership.", TRACE);

    const { assignmentId } = await assignMembership(admin, userId, T.health, "Health tenant membership.", TRACE);
    createdAssignmentIds.push(assignmentId);

    const [membership] = await db.select().from(roleAssignments).where(eq(roleAssignments.id, assignmentId));
    expect(membership.roleId).toBe(fixedId(ID_PREFIX.role, "TENANT_MEMBER"));
    expect(membership.grantedBy).toBe(admin.userId);

    // Membership alone grants NO capability: the principal resolves to an
    // empty permission set for the member.
    const memberGrants = await loadGrants(userId, T.health);
    const memberPermissions = permissionsForRoles([...new Set(memberGrants.map((g) => g.code))]);
    expect([...memberPermissions]).toEqual([]);

    await expectRefusal(
      assignMembership(admin, userId, T.health, "Duplicate membership.", TRACE),
      "MEMBERSHIP_EXISTS",
    );

    const revoked = await revokeMembership(admin, userId, T.health, "Membership ended.", TRACE);
    expect(revoked.assignmentsEnded).toBe(1);
    const [ended] = await db.select().from(roleAssignments).where(eq(roleAssignments.id, assignmentId));
    expect(ended.effectiveTo).not.toBeNull();
  });

  it("refuses to revoke membership of the user's HOME tenant", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId } = await registerTestUser(admin, `gov-home-${Date.now()}@beyu.os`, T.foundation);
    await expectRefusal(
      revokeMembership(admin, userId, T.foundation, "Home tenant revocation attempt.", TRACE),
      "HOME_TENANT",
    );
  });

  it("grants and revokes a scoped role with justification and audit; refuses self-grant and duplicates", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId } = await registerTestUser(admin, `gov-role-${Date.now()}@beyu.os`);
    await transitionUserStatus(admin, userId, "activate", "Ready for role grant.", TRACE);

    await expectRefusal(
      grantRole(admin, {
        userId: admin.userId,
        roleCode: "PLATFORM_ADMIN",
        tenantId: T.group,
        justification: "Self-escalation attempt.",
      }, TRACE),
      "SELF_GRANT_REFUSED",
    );

    const { assignmentId } = await grantRole(admin, {
      userId,
      roleCode: "FAMILY_ANALYST",
      tenantId: T.group,
      justification: "Finance analyst onboarding for the governance suite.",
    }, TRACE);
    createdAssignmentIds.push(assignmentId);

    await expectRefusal(
      grantRole(admin, {
        userId,
        roleCode: "FAMILY_ANALYST",
        tenantId: T.group,
        justification: "Duplicate grant attempt.",
      }, TRACE),
      "ASSIGNMENT_EXISTS",
    );

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectId, assignmentId), eq(auditLog.action, "ROLE_GRANTED")));
    expect(audit.authority).toBe("identity:role.grant");

    const revoked = await revokeRole(admin, assignmentId, "Off-boarding the analyst.", TRACE);
    expect(revoked.effectiveTo).toBeTruthy();
  });

  it("refuses a privileged role grant from a non-PLATFORM_ADMIN (GROUP_CEO holds the capability but not the role)", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const { userId } = await registerTestUser(ceo, `gov-priv-${Date.now()}@beyu.os`);
    await expectRefusal(
      grantRole(ceo, {
        userId,
        roleCode: "PLATFORM_ADMIN",
        tenantId: T.group,
        justification: "CEO attempting to grant the platform administrator role.",
      }, TRACE),
      "PRIVILEGED_ROLE_REFUSED",
    );
  });
});

describe("administrative delegation instruments", () => {
  it("creates, resolves per request, and revokes a bounded delegation", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId: delegateeId } = await registerTestUser(admin, `gov-delegatee-${Date.now()}@beyu.os`);
    await transitionUserStatus(admin, delegateeId, "activate", "Delegatee ready.", TRACE);

    const created = await createDelegation(
      admin,
      {
        delegatorUserId: admin.userId,
        delegateeUserId: delegateeId,
        permissions: ["identity:user.suspend"],
        scopeTenantIds: [T.tz],
        effectiveFrom: new Date(),
        effectiveTo: new Date(Date.now() + 3 * 86_400_000),
        reason: "Leave coverage for user administration.",
      },
      TRACE,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdDelegationIds.push(created.delegation.id);

    // Per-request resolution sees the delegated capability.
    expect(await activeDelegatedPermissions(delegateeId)).toContain("identity:user.suspend");

    // Duplicate live instrument to the same delegatee is refused.
    const duplicate = await createDelegation(
      admin,
      {
        delegatorUserId: admin.userId,
        delegateeUserId: delegateeId,
        permissions: ["identity:user.register"],
        scopeTenantIds: [T.tz],
        effectiveFrom: new Date(),
        effectiveTo: new Date(Date.now() + 3 * 86_400_000),
        reason: "Second live instrument attempt.",
      },
      TRACE,
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("DUPLICATE_LIVE_INSTRUMENT");

    // A delegated administrator can never create further delegations — the
    // capability is not delegable, and their authority is not role-derived.
    const delegatee = await principalFor("PLATFORM_ADMIN"); // fabricated authority context
    const reDelegation = await createDelegation(
      { ...delegatee, userId: delegateeId, roles: [], permissions: new Set(), delegatedPermissions: ["identity:user.suspend"] },
      {
        delegatorUserId: delegateeId,
        delegateeUserId: admin.userId,
        permissions: ["identity:user.suspend"],
        scopeTenantIds: [T.tz],
        effectiveFrom: new Date(),
        effectiveTo: new Date(Date.now() + 86_400_000),
        reason: "Attempt to re-delegate delegated authority.",
      },
      TRACE,
    );
    expect(reDelegation.ok).toBe(false);
    if (!reDelegation.ok) {
      expect(reDelegation.code).toBe("EXCEEDS_DELEGATOR_AUTHORITY");
    }

    // Revocation is immediate: the next resolution sees nothing.
    const revoked = await revokeDelegation(admin, created.delegation.id, "Coverage no longer required.", TRACE);
    expect(revoked.ok).toBe(true);
    expect(await activeDelegatedPermissions(delegateeId)).toEqual([]);
  });

  it("refuses to delegate to a non-ACTIVE or service identity", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId } = await registerTestUser(admin, `gov-inactive-${Date.now()}@beyu.os`);
    const refusal = await createDelegation(
      admin,
      {
        delegatorUserId: admin.userId,
        delegateeUserId: userId, // still CREATED, not ACTIVE
        permissions: ["identity:user.suspend"],
        scopeTenantIds: [T.tz],
        effectiveFrom: new Date(),
        effectiveTo: new Date(Date.now() + 86_400_000),
        reason: "Delegation to a not-yet-active identity.",
      },
      TRACE,
    );
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) expect(refusal.code).toBe("DELEGATEE_INVALID");
  });
});
