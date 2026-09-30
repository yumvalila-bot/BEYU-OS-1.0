import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { families, familyMembers, parties, roleAssignments, users } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import {
  getRegistryFamily,
  listRegistryFamilyMembers,
  listRegistryFamilies,
  registerFamily,
  registerFamilyMember,
  registerParty,
} from "../../src/lib/admin/registry-service";
import { AdminGovernanceError } from "../../src/lib/admin/governance-service";

/**
 * BEYU REGISTRY — canonical family registration.
 *
 * Proves the governed family entity path: ONE act creates the family's MDM
 * identity (parties · ORGANIZATION) plus the families domain row; duplicate
 * codes are controlled conflicts; membership registration is a relationship
 * over an existing party — never a User, never a role, never a permission.
 */

const T = { group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP") };
const TRACE = "TEST_REGISTRY_FAMILY_REGISTRATION";

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

async function refuse(fn: () => Promise<unknown>): Promise<AdminGovernanceError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AdminGovernanceError) return err;
    throw err;
  }
  throw new Error("expected a governed refusal, but the act succeeded");
}

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

describe("BEYU Registry — canonical family registration", () => {
  it("registers a family with its ORGANIZATION party identity in ONE governed act", async () => {
    const actor = await principalFor("NEEMA_BEYU");
    const code = `RGT-${Date.now().toString(36).toUpperCase()}`;
    const result = await registerFamily(
      actor,
      {
        tenantId: T.group,
        code,
        displayName: "Registry Test Family",
        countryCode: "TZ",
        reason: "Mission-verified governed family registration.",
      },
      TRACE,
    );
    createdFamilyIds.push(result.familyId);
    createdPartyIds.push(result.partyId);

    expect(result.familyId.startsWith("FML_")).toBe(true);
    expect(result.partyId.startsWith("PTY_")).toBe(true);
    expect(result.status).toBe("ACTIVE");

    const [family] = await db.select().from(families).where(eq(families.id, result.familyId));
    expect(family?.code).toBe(code);
    expect(family?.tenantId).toBe(T.group);
    expect(family?.classification).toBe("HIGHLY_RESTRICTED");
    expect(family?.partyId).toBe(result.partyId);

    // ONE identity model: the family's canonical identity is a parties row.
    const [party] = await db.select().from(parties).where(eq(parties.id, result.partyId));
    expect(party?.type).toBe("ORGANIZATION");
    expect(party?.displayName).toBe("Registry Test Family");
  });

  it("refuses a duplicate family code as a controlled conflict, never a silent merge", async () => {
    const actor = await principalFor("NEEMA_BEYU");
    const [existing] = await db
      .select({ code: families.code })
      .from(families)
      .where(eq(families.id, createdFamilyIds[0]!))
      .limit(1);
    const err = await refuse(() =>
      registerFamily(
        actor,
        {
          tenantId: T.group,
          code: existing!.code,
          displayName: "Duplicate Attempt",
          reason: "Attempt to re-register an existing family code.",
        },
        TRACE,
      ),
    );
    expect(err.code).toBe("FAMILY_CODE_EXISTS");
    expect(err.status).toBe(409);
    expect(err.details).toBeTruthy();
  });

  it("lists the family with truthful member flags (no fabricated user or employment edges)", async () => {
    const actor = await principalFor("NEEMA_BEYU");
    const familyId = createdFamilyIds[0]!;
    const family = await getRegistryFamily(actor, familyId);
    expect(family.id).toBe(familyId);

    const listed = await listRegistryFamilies(actor);
    expect(listed.some((f) => f.id === familyId)).toBe(true);

    const { items } = await listRegistryFamilyMembers(actor, familyId);
    for (const m of items) {
      // These parties are registry-only persons: the API must NOT fabricate a
      // GlobalUserID or an employment relationship for them.
      expect(m.globalUserId).toBeNull();
      expect(m.employed).toBe(false);
    }
  });

  it("registers a founder and a governed descent, then refuses a second membership for one party", async () => {
    const actor = await principalFor("NEEMA_BEYU"); // family:member.manage
    const admin = await principalFor("PLATFORM_ADMIN"); // identity:party.register
    const familyId = createdFamilyIds[0]!;

    // Person party — person ≠ user.
    const person = await registerParty(
      admin,
      {
        displayName: "Registry Founder",
        primaryTenantId: T.group,
        reason: "Person party for governed family registration verification.",
      },
      TRACE,
    );
    createdPartyIds.push(person.partyId);
    expect(person.userCreated).toBe(false);

    // Empty family → founder position: no parent, generation 1.
    const founder = await registerFamilyMember(
      actor,
      {
        familyId,
        partyId: person.partyId,
        relationshipType: "BIRTH_DESCENDANT",
        branch: "FOUNDER",
        provenance: "Founding council resolution FR-1.",
        reason: "Founder position of the newly registered family.",
      },
      TRACE,
    );
    expect(founder.generation).toBe(1);
    expect(founder.branch).toBe("FOUNDER");
    expect(founder.membershipStatus).toBe("ACTIVE");

    // Second person, descent under the founder — branch inherited, gen 2.
    const child = await registerParty(
      admin,
      {
        displayName: "Registry Descendant",
        primaryTenantId: T.group,
        reason: "Person party for governed descent verification.",
      },
      TRACE,
    );
    createdPartyIds.push(child.partyId);

    const descendant = await registerFamilyMember(
      actor,
      {
        familyId,
        partyId: child.partyId,
        relationshipType: "BIRTH_DESCENDANT",
        parentMemberId: founder.memberId,
        provenance: "Birth certificate BC-77.",
        reason: "Governed descent registration under the founder.",
      },
      TRACE,
    );
    expect(descendant.generation).toBe(2);
    expect(descendant.branch).toBe("FOUNDER");

    // One person, one canonical membership — duplicates are controlled.
    const err = await refuse(() =>
      registerFamilyMember(
        actor,
        {
          familyId,
          partyId: person.partyId,
          relationshipType: "NON_FAMILY",
          provenance: "Duplicate attempt.",
          reason: "Attempt to re-register an existing member.",
        },
        TRACE,
      ),
    );
    expect(err.code).toBe("ALREADY_FAMILY_MEMBER");
    expect(err.status).toBe(409);

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(familyMembers)
      .where(eq(familyMembers.familyId, familyId));
    expect(Number(n)).toBe(2);
  });
});
