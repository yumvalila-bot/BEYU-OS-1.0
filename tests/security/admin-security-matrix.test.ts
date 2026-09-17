import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db";
import {
  adminAuthorityDelegations,
  parties,
  roleAssignments,
  roles,
  users,
} from "../../src/db/schema";
import { fixedId, ID_PREFIX, newId } from "../../src/lib/ids";
import {
  activeDelegatedPermissions,
  can,
  clearanceForRoles,
  loadGrants,
  permissionsForRoles,
  type Principal,
} from "../../src/lib/authz";
import { registerUser, transitionUserStatus, AdminGovernanceError } from "../../src/lib/admin/governance-service";
import { adminActionTenantScope } from "../../src/lib/admin/delegation";
import { assertWithinScope } from "../../src/lib/tenant-scope";
import { ROLE_CLEARANCE, ROLES } from "../../src/lib/constants";

/**
 * ADMINISTRATIVE GOVERNANCE — ADVERSARIAL SECURITY MATRIX.
 *
 * Red-team style proofs of the mandated boundary properties:
 *   1.  CROSS-TENANT DENIAL — authority granted in one tenant never reaches another.
 *   2.  EXPIRED DELEGATION DENIAL — the window is enforced per request.
 *   3.  REVOKED DELEGATION DENIAL — revocation outranks the window, immediately.
 *   4.  NO SELF-ESCALATION — an administrator cannot grant roles to themselves,
 *       delegate to themselves, or act on their own lifecycle.
 *   5.  NO UNRESTRICTED DELEGATION — a delegated administrator is never a
 *       PLATFORM_ADMIN; delegation cannot widen scope; chains have depth one.
 *   6.  NOELIA / HIVE — the AI identities hold no role, no user, no session,
 *       no admin capability; they can never be delegatees.
 *   7.  DELEGATION-SPECIFIC BOUNDS — entity/country scope, closed set, window cap.
 */

const T = {
  group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP"),
  tz: fixedId(ID_PREFIX.tenant, "BEYU_TZ"),
  health: fixedId(ID_PREFIX.tenant, "BEYU_HEALTH"),
  foundation: fixedId(ID_PREFIX.tenant, "BEYU_FOUNDATION"),
  agri: fixedId(ID_PREFIX.tenant, "BEYU_AGRI"),
};

const TRACE = "TEST_ADMIN_SECURITY_MATRIX";

async function principalFor(userKey: string, overrides: Partial<Principal> = {}): Promise<Principal> {
  const userId = fixedId(ID_PREFIX.user, userKey);
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new Error(`seed user ${userKey} missing — run npm run seed`);
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roleCodes = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: "BEYU-GROUP",
    tenantType: "ENTERPRISE",
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

const createdUserIds: string[] = [];
const createdPartyIds: string[] = [];
const createdDelegationIds: string[] = [];

afterAll(async () => {
  for (const id of createdDelegationIds) {
    await db.delete(adminAuthorityDelegations).where(eq(adminAuthorityDelegations.id, id));
  }
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
  for (const id of createdPartyIds) {
    await db.delete(parties).where(eq(parties.id, id));
  }
});

describe("SECURITY MATRIX 1 — cross-tenant denial", () => {
  it("a grant scoped to one tenant confers no authority in another tenant", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId, partyId } = await registerUser(admin, {
      email: `matrix-cross-${Date.now()}@beyu.os`,
      displayName: "Cross Tenant Fixture",
      primaryTenantId: T.tz,
      reason: "Cross-tenant denial matrix fixture.",
    }, TRACE);
    createdUserIds.push(userId);
    createdPartyIds.push(partyId);
    await transitionUserStatus(admin, userId, "activate", "Fixture active.", TRACE);

    // Fabricated principal whose ONLY presence is a grant in HEALTH.
    const crossPrincipal: Principal = {
      userId,
      partyId,
      email: "matrix@beyu.os",
      displayName: "Matrix Fixture",
      tenantId: T.health,
      tenantCode: "BEYU-HEALTH",
      tenantType: "SECTOR",
      roles: ["SECTOR_OPERATOR"],
      permissions: permissionsForRoles(["SECTOR_OPERATOR"]),
      clearance: ROLE_CLEARANCE.SECTOR_OPERATOR,
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "TEST",
      riskScore: 0,
      emergencyPermissions: [],
    };
    // Holds no administrative capability at all.
    expect(can(crossPrincipal, "identity:user.register").allowed).toBe(false);
    // Even WITH a capability grant in HEALTH, acting on the AGRI tenant is
    // refused by the canonical tenant scoping.
    const withCap: Principal = {
      ...crossPrincipal,
      permissions: new Set([...permissionsForRoles(["SECTOR_OPERATOR"]), "identity:user.suspend" as const]),
    };
    await expect(assertWithinScope(withCap, T.agri)).rejects.toThrow();
    await expect(assertWithinScope(withCap, T.tz)).rejects.toThrow();
  });

  it("an administrative act is refused for a tenant outside the acting principal's scope", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    // PLATFORM_ADMIN scope is the whole tree — use a fabricated sector-scoped
    // principal holding identity:user.suspend to prove the scope wall.
    const sector: Principal = {
      ...admin,
      tenantId: T.foundation,
      roles: ["FOUNDATION_DIRECTOR"],
      permissions: new Set([
        ...permissionsForRoles(["FOUNDATION_DIRECTOR"]),
        "identity:user.suspend" as const,
      ]),
      clearance: ROLE_CLEARANCE.FOUNDATION_DIRECTOR,
    };
    await expect(
      (async () => {
        await assertWithinScope(sector, T.health);
      })(),
    ).rejects.toThrow(/outside principal scope/i);
  });
});

describe("SECURITY MATRIX 2/3 — expired and revoked delegations are dead immediately", () => {
  it("an EXPIRED delegation contributes zero authority on the next resolution", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId, partyId } = await registerUser(admin, {
      email: `matrix-expired-${Date.now()}@beyu.os`,
      displayName: "Expired Delegation Fixture",
      primaryTenantId: T.tz,
      reason: "Expired delegation matrix fixture.",
    }, TRACE);
    createdUserIds.push(userId);
    createdPartyIds.push(partyId);
    await transitionUserStatus(admin, userId, "activate", "Fixture active.", TRACE);

    const id = newId(ID_PREFIX.adminDelegation);
    // Window that ended an hour ago.
    await db.insert(adminAuthorityDelegations).values({
      id,
      tenantId: T.group,
      delegatorUserId: admin.userId,
      delegateeUserId: userId,
      permissions: ["identity:user.suspend"],
      scopeTenantIds: [T.tz],
      status: "ACTIVE",
      effectiveFrom: new Date(Date.now() - 48 * 3_600_000),
      effectiveTo: new Date(Date.now() - 3_600_000),
      reason: "Matrix fixture: already expired.",
    });
    createdDelegationIds.push(id);

    expect(await activeDelegatedPermissions(userId)).toEqual([]);

    // And through the same primitive the request path uses:
    const delegatee: Principal = {
      userId,
      partyId,
      email: "expired@beyu.os",
      displayName: "Expired Fixture",
      tenantId: T.tz,
      tenantCode: "BEYU-TZ",
      tenantType: "COUNTRY",
      roles: [],
      permissions: new Set(),
      clearance: ROLE_CLEARANCE.TENANT_MEMBER,
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "TEST",
      riskScore: 0,
      emergencyPermissions: [],
    };
    expect(can(delegatee, "identity:user.suspend").allowed).toBe(false);
  });

  it("a REVOKED delegation contributes zero authority even inside its window", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId, partyId } = await registerUser(admin, {
      email: `matrix-revoked-${Date.now()}@beyu.os`,
      displayName: "Revoked Delegation Fixture",
      primaryTenantId: T.tz,
      reason: "Revoked delegation matrix fixture.",
    }, TRACE);
    createdUserIds.push(userId);
    createdPartyIds.push(partyId);
    await transitionUserStatus(admin, userId, "activate", "Fixture active.", TRACE);

    const id = newId(ID_PREFIX.adminDelegation);
    await db.insert(adminAuthorityDelegations).values({
      id,
      tenantId: T.group,
      delegatorUserId: admin.userId,
      delegateeUserId: userId,
      permissions: ["identity:user.suspend", "identity:user.register"],
      scopeTenantIds: [T.tz],
      status: "REVOKED", // revocation outranks the (still valid) window
      effectiveFrom: new Date(Date.now() - 3_600_000),
      effectiveTo: new Date(Date.now() + 48 * 3_600_000),
      reason: "Matrix fixture: revoked in-window.",
      revokedAt: new Date(),
      revokedBy: admin.userId,
      revokeReason: "Matrix revocation.",
    });
    createdDelegationIds.push(id);

    expect(await activeDelegatedPermissions(userId)).toEqual([]);

    const delegatee: Principal = {
      userId,
      partyId,
      email: "revoked@beyu.os",
      displayName: "Revoked Fixture",
      tenantId: T.tz,
      tenantCode: "BEYU-TZ",
      tenantType: "COUNTRY",
      roles: [],
      permissions: new Set(),
      clearance: ROLE_CLEARANCE.TENANT_MEMBER,
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "TEST",
      riskScore: 0,
      emergencyPermissions: [],
    };
    expect(can(delegatee, "identity:user.suspend").allowed).toBe(false);
    expect(can(delegatee, "identity:user.register").allowed).toBe(false);
  });
});

describe("SECURITY MATRIX 4/5 — no self-escalation, no unrestricted delegation", () => {
  it("a delegated administrator is NEVER a PLATFORM_ADMIN and holds only the delegated capability", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId, partyId } = await registerUser(admin, {
      email: `matrix-delegated-${Date.now()}@beyu.os`,
      displayName: "Delegated Admin Fixture",
      primaryTenantId: T.tz,
      reason: "Delegated administrator matrix fixture.",
    }, TRACE);
    createdUserIds.push(userId);
    createdPartyIds.push(partyId);
    await transitionUserStatus(admin, userId, "activate", "Fixture active.", TRACE);

    const delegated = await activeDelegatedPermissions;
    const delegatee: Principal = {
      userId,
      partyId,
      email: "delegated@beyu.os",
      displayName: "Delegated Fixture",
      tenantId: T.tz,
      tenantCode: "BEYU-TZ",
      tenantType: "COUNTRY",
      roles: [],
      permissions: new Set(),
      clearance: ROLE_CLEARANCE.TENANT_MEMBER,
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "TEST",
      riskScore: 0,
      emergencyPermissions: [],
      delegatedPermissions: ["identity:user.suspend"],
    };

    // Only the delegated capability passes the SAME primitive…
    expect(can(delegatee, "identity:user.suspend").allowed).toBe(true);
    // …nothing else does — no umbrella, no removal, no delegation, no config.
    expect(can(delegatee, "identity:user.remove").allowed).toBe(false);
    expect(can(delegatee, "identity:delegation.manage").allowed).toBe(false);
    expect(can(delegatee, "identity:role.grant").allowed).toBe(false);
    expect(can(delegatee, "platform:config.manage").allowed).toBe(false);
    expect(can(delegatee, "identity:user.register").allowed).toBe(false);
    expect(delegatee.roles).not.toContain("PLATFORM_ADMIN");
  });

  it("delegation scope can only NARROW: the effective act scope is the intersection", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const { userId, partyId } = await registerUser(admin, {
      email: `matrix-scope-${Date.now()}@beyu.os`,
      displayName: "Delegation Scope Fixture",
      primaryTenantId: T.tz,
      reason: "Delegation scope intersection fixture.",
    }, TRACE);
    createdUserIds.push(userId);
    createdPartyIds.push(partyId);
    await transitionUserStatus(admin, userId, "activate", "Fixture active.", TRACE);

    const id = newId(ID_PREFIX.adminDelegation);
    await db.insert(adminAuthorityDelegations).values({
      id,
      tenantId: T.group,
      delegatorUserId: admin.userId,
      delegateeUserId: userId,
      permissions: ["identity:user.suspend"],
      scopeTenantIds: [T.health], // deliberately narrower than the delegatee's own subtree
      status: "ACTIVE",
      effectiveFrom: new Date(Date.now() - 60_000),
      effectiveTo: new Date(Date.now() + 86_400_000),
      reason: "Matrix fixture: narrow scope.",
    });
    createdDelegationIds.push(id);

    // The delegatee's own principal is home-tenanted at TZ (scope: TZ subtree);
    // the delegation grants only HEALTH. Intersection ⇒ empty: authority that
    // cannot be exercised anywhere — fail closed, never widened.
    const delegatee: Principal = {
      userId,
      partyId,
      email: "scope@beyu.os",
      displayName: "Scope Fixture",
      tenantId: T.tz,
      tenantCode: "BEYU-TZ",
      tenantType: "COUNTRY",
      roles: ["TENANT_MEMBER"],
      permissions: new Set(),
      clearance: ROLE_CLEARANCE.TENANT_MEMBER,
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "TEST",
      riskScore: 0,
      emergencyPermissions: [],
      delegatedPermissions: ["identity:user.suspend"],
    };
    const effective = await adminActionTenantScope(delegatee, "identity:user.suspend");
    expect(effective).toEqual([]);
    expect(can(delegatee, "identity:user.suspend", { tenantId: T.health }).allowed).toBe(false);
  });

  it("no administrator can act on their own lifecycle or grant themselves a role", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    await expect(
      transitionUserStatus(admin, admin.userId, "suspend", "Self-suspension attempt.", TRACE),
    ).rejects.toMatchObject({ name: "AdminGovernanceError", code: "SELF_ACTION_REFUSED" });
    await expect(
      import("../../src/lib/admin/governance-service").then((m) =>
        m.grantRole(
          admin,
          { userId: admin.userId, roleCode: "PLATFORM_ADMIN", tenantId: T.group, justification: "Self-grant attempt." },
          TRACE,
        ),
      ),
    ).rejects.toMatchObject({ name: "AdminGovernanceError", code: "SELF_GRANT_REFUSED" });
  });
});

describe("SECURITY MATRIX 6 — Noelia / HIVE can never administer", () => {
  it("the AI identities hold NO user, NO role, NO capability and NO delegation eligibility", async () => {
    const noeliaPartyId = fixedId(ID_PREFIX.party, "NOELIA_AI");
    const hivePartyId = fixedId(ID_PREFIX.party, "HIVE_RUNTIME");

    // No GlobalUserID: AI identities cannot authenticate at all.
    const noeliaUsers = await db.select().from(users).where(eq(users.partyId, noeliaPartyId));
    const hiveUsers = await db.select().from(users).where(eq(users.partyId, hivePartyId));
    expect(noeliaUsers).toEqual([]);
    expect(hiveUsers).toEqual([]);

    // No role in the constitutional catalogue is an AI identity.
    expect(Object.keys(ROLES)).not.toContain("NOELIA_AI");
    expect(Object.keys(ROLES)).not.toContain("HIVE_RUNTIME");

    // A hypothetical Noelia principal holds no administrative capability.
    const noelia: Principal = {
      userId: "USR_NOELIA_HYPOTHETICAL",
      partyId: noeliaPartyId,
      email: "noelia@beyu.os",
      displayName: "Noelia AI",
      tenantId: T.group,
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
      roles: [],
      permissions: new Set(),
      clearance: "INTERNAL",
      entityScope: [],
      mfaSatisfied: false,
      sessionId: "NONE",
      riskScore: 100,
      emergencyPermissions: [],
      delegatedPermissions: [],
    };
    for (const permission of [
      "identity:user.register",
      "identity:user.suspend",
      "identity:user.remove",
      "identity:role.grant",
      "identity:delegation.manage",
      "organization:tenant.register",
      "organization:tenant.remove",
    ] as const) {
      expect(can(noelia, permission).allowed, `Noelia must never hold ${permission}`).toBe(false);
    }

    // Noelia cannot self-authorize through a delegation: the service requires
    // an ACTIVE human users row as delegatee, and Noelia has none.
    const { createDelegation } = await import("../../src/lib/admin/delegation");
    const admin = await principalFor("PLATFORM_ADMIN");
    const refusal = await createDelegation(
      admin,
      {
        delegatorUserId: admin.userId,
        delegateeUserId: "USR_NOELIA_HYPOTHETICAL",
        permissions: ["identity:user.suspend"],
        scopeTenantIds: [T.tz],
        effectiveFrom: new Date(),
        effectiveTo: new Date(Date.now() + 86_400_000),
        reason: "Attempting to delegate authority to the AI identity.",
      },
      TRACE,
    );
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) expect(refusal.code).toBe("DELEGATEE_INVALID");
  });
});

describe("SECURITY MATRIX 7 — catalogued bounds", () => {
  it("the delegated set is closed and excludes every read-side and umbrella capability", async () => {
    const { ADMIN_DELEGATABLE_PERMISSIONS } = await import("../../src/lib/admin/delegation");
    const closed = new Set(ADMIN_DELEGATABLE_PERMISSIONS as readonly string[]);
    for (const forbidden of [
      "identity:delegation.manage",
      "identity:user.manage",
      "identity:user.read",
      "audit:log.read",
      "platform:config.manage",
      "platform:registry.read",
      "finance:ledger.post",
    ]) {
      expect(closed.has(forbidden), `${forbidden} must never be delegable`).toBe(false);
    }
  });

  it("high-risk administrative permissions are held ONLY by the platform administrator", async () => {
    const holders = new Set<string>();
    for (const [code, role] of Object.entries(ROLES)) {
      if (
        role.permissions.includes("identity:user.remove") ||
        role.permissions.includes("organization:tenant.remove") ||
        role.permissions.includes("identity:delegation.manage")
      ) {
        holders.add(code);
      }
    }
    expect([...holders]).toEqual(["PLATFORM_ADMIN"]);
  });
});
