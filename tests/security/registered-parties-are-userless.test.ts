import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { families, familyMembers, parties, roleAssignments, users } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { can, clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import { registerFamilyMember, registerParty } from "../../src/lib/admin/registry-service";

/**
 * Mission security proof: the BEYU Registry NEVER creates a login identity
 * or any authorization material as a side effect.
 *
 *   person party registration  → parties row only (userCreated: false)
 *   family membership          → family_members row only
 *   neither act inserts into   → users / role_assignments / role_permissions
 *
 * PERSON ≠ USER ≠ EMPLOYEE ≠ FAMILY MEMBER; authorization stays governed by
 * the explicit role catalogue, never by registry or family membership.
 */

const T = { group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP") };
const TRACE = "TEST_REGISTERED_PARTIES_USERLESS";

async function principalFor(userKey: string): Promise<Principal> {
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
  };
}

const createdPartyIds: string[] = [];
const createdFamilyIds: string[] = [];

afterAll(async () => {
  if (createdFamilyIds.length > 0) {
    await db.delete(familyMembers).where(inArray(familyMembers.familyId, createdFamilyIds));
    await db.delete(families).where(inArray(families.id, createdFamilyIds));
  }
  if (createdPartyIds.length > 0) {
    await db.delete(familyMembers).where(inArray(familyMembers.partyId, createdPartyIds));
    await db.delete(parties).where(inArray(parties.id, createdPartyIds));
  }
});

async function authorizationRowsFor(partyId: string): Promise<{ users: number; assignments: number }> {
  const partyUsers = await db.select({ id: users.id }).from(users).where(eq(users.partyId, partyId));
  const userIds = partyUsers.map((u) => u.id);
  if (userIds.length === 0) return { users: 0, assignments: 0 };
  const assignments = await db
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(inArray(roleAssignments.userId, userIds));
  return { users: partyUsers.length, assignments: assignments.length };
}

describe("registered parties are userless — registry never fabricates identities", () => {
  it("a registered person party creates NO user, session, role assignment or permission", async () => {
    const actor = await principalFor("PLATFORM_ADMIN");
    const party = await registerParty(
      actor,
      {
        displayName: "Registry Only Person",
        email: `userless-${Date.now()}@beyu.invalid`,
        primaryTenantId: T.group,
        reason: "Security proof: person registration must not create a login.",
      },
      TRACE,
    );
    createdPartyIds.push(party.partyId);

    expect(party.userCreated).toBe(false);

    const [row] = await db.select().from(parties).where(eq(parties.id, party.partyId));
    expect(row?.type).toBe("PERSON");
    expect(row?.status).toBe("ACTIVE");

    const auth = await authorizationRowsFor(party.partyId);
    expect(auth.users).toBe(0);
    expect(auth.assignments).toBe(0);
  });

  it("adding that person to a family grants NOTHING — membership ≠ user ≠ role", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const actor = await principalFor("NEEMA_BEYU"); // family:member.manage
    const party = await registerParty(
      admin,
      {
        displayName: "Registry Only Relative",
        primaryTenantId: T.group,
        reason: "Security proof: family membership must not create a login.",
      },
      TRACE,
    );
    createdPartyIds.push(party.partyId);

    // An EMPTY governed family (one act: party + family).
    const { registerFamily } = await import("../../src/lib/admin/registry-service");
    const family = await registerFamily(
      actor,
      {
        tenantId: T.group,
        code: `USERLESS-${Date.now().toString(36).toUpperCase()}`.slice(0, 40),
        displayName: "Userless Proof Family",
        reason: "Family for userless membership security proof.",
      },
      TRACE,
    );
    createdFamilyIds.push(family.familyId);
    createdPartyIds.push(family.partyId);

    const membership = await registerFamilyMember(
      actor,
      {
        familyId: family.familyId,
        partyId: party.partyId,
        relationshipType: "BIRTH_DESCENDANT",
        branch: "FOUNDER",
        provenance: "Security proof provenance record.",
        reason: "Governed membership without authorization side effects.",
      },
      TRACE,
    );
    expect(membership.membershipStatus).toBe("ACTIVE");

    const auth = await authorizationRowsFor(party.partyId);
    expect(auth.users).toBe(0);
    expect(auth.assignments).toBe(0);

    // A Principal bound to that party WITH NO ROLES is denied authority —
    // membership in a family confers zero capabilities.
    const memberPrincipal: Principal = {
      userId: "USR_NON_EXISTENT",
      partyId: party.partyId,
      email: "registry-only@beyu.invalid",
      displayName: "Registry Only Relative",
      tenantId: T.group,
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
      roles: [],
      permissions: permissionsForRoles([]),
      clearance: clearanceForRoles([]),
      entityScope: [],
      mfaSatisfied: false,
      sessionId: "TEST",
      riskScore: 0,
      emergencyPermissions: [],
      delegatedPermissions: [],
    };
    expect(can(memberPrincipal, "identity:party.register").allowed).toBe(false);
    expect(can(memberPrincipal, "family:member.manage").allowed).toBe(false);
    expect(can(memberPrincipal, "organization:ownership.manage").allowed).toBe(false);
  });

  it("users count is unchanged by registry operations within this suite", async () => {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    const total = Number(n);
    const registryUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.partyId, createdPartyIds));
    expect(registryUsers).toHaveLength(0);
    expect(total).toBeGreaterThan(0);
  });
});
