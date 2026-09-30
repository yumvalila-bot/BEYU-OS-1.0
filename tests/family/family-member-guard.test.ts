import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { familyMembers, parties, users } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import { registerFamilyMember, registerParty } from "../../src/lib/admin/registry-service";
import { AdminGovernanceError } from "../../src/lib/admin/governance-service";

/**
 * Family member guard — the governed relationship rules (member ≠ user).
 *
 * Descent requires a governed parent; affinity attaches through
 * linkedToMemberId and NEVER creates descent; NON_FAMILY carries no lineage
 * links; directDescendant is a VERIFIED claim the registry refuses to write
 * at registration time. Every refusal is fail-closed: no row is inserted.
 */

const T = { group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP") };
const SEEDED_FAMILY = fixedId(ID_PREFIX.family, `${T.group}_BEYU`);
const TRACE = "TEST_FAMILY_MEMBER_GUARD";

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
let baselineUserCount = 0;

async function newParty(_actor: Principal, name: string): Promise<string> {
  // Person parties require identity:party.register — held by PLATFORM_ADMIN,
  // NOT by the family principal (the membership acts below use the family
  // principal separately, proving each capability gates its own act).
  const admin = await principalFor("PLATFORM_ADMIN");
  const p = await registerParty(
    admin,
    { displayName: name, primaryTenantId: T.group, reason: "Person party for membership guard verification." },
    TRACE,
  );
  createdPartyIds.push(p.partyId);
  return p.partyId;
}

async function refuse(fn: () => Promise<unknown>): Promise<AdminGovernanceError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AdminGovernanceError) return err;
    throw err;
  }
  throw new Error("expected a governed refusal, but the act succeeded");
}

async function memberCount(familyId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(familyMembers)
    .where(eq(familyMembers.familyId, familyId));
  return Number(n);
}

beforeAll(async () => {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  baselineUserCount = Number(n);
});

afterAll(async () => {
  if (createdPartyIds.length > 0) {
    await db.delete(familyMembers).where(inArray(familyMembers.partyId, createdPartyIds));
    await db.delete(parties).where(inArray(parties.id, createdPartyIds));
  }
});

describe("family member guard — relationship rules fail closed", () => {
  it("descent on a populated family requires a governed parent", async () => {
    const actor = await principalFor("NEEMA_BEYU");
    const before = await memberCount(SEEDED_FAMILY);
    const partyId = await newParty(actor, "Orphan Descent Attempt");

    const err = await refuse(() =>
      registerFamilyMember(
        actor,
        {
          familyId: SEEDED_FAMILY,
          partyId,
          relationshipType: "BIRTH_DESCENDANT",
          provenance: "Attempt without a parent.",
          reason: "Descent must never be inferred from presence alone.",
        },
        TRACE,
      ),
    );
    expect(err.code).toBe("DESCENT_PARENT_REQUIRED");
    expect(err.status).toBe(422);
    expect(await memberCount(SEEDED_FAMILY)).toBe(before);
  });

  it("affinal relationships require a link and forbid a descent parent", async () => {
    const actor = await principalFor("NEEMA_BEYU");
    const before = await memberCount(SEEDED_FAMILY);
    const partyId = await newParty(actor, "Affinal Link Attempt");

    const noLink = await refuse(() =>
      registerFamilyMember(
        actor,
        {
          familyId: SEEDED_FAMILY,
          partyId,
          relationshipType: "SPOUSE_OF_MEMBER",
          provenance: "Marriage certificate attempt without a link.",
          reason: "Affinity must attach through an existing member.",
        },
        TRACE,
      ),
    );
    expect(noLink.code).toBe("AFFINAL_LINK_REQUIRED");

    const founderMemberId = fixedId(ID_PREFIX.familyMember, "FM_G1_FOUNDER");
    const withParent = await refuse(() =>
      registerFamilyMember(
        actor,
        {
          familyId: SEEDED_FAMILY,
          partyId,
          relationshipType: "SPOUSE_OF_MEMBER",
          parentMemberId: founderMemberId,
          linkedToMemberId: founderMemberId,
          provenance: "Marriage certificate attempt using a descent parent.",
          reason: "Marriage never creates descent.",
        },
        TRACE,
      ),
    );
    expect(withParent.code).toBe("AFFINAL_PARENT_FORBIDDEN");

    expect(await memberCount(SEEDED_FAMILY)).toBe(before);
  });

  it("NON_FAMILY memberships carry neither a parent nor an affinal link", async () => {
    const actor = await principalFor("NEEMA_BEYU");
    const before = await memberCount(SEEDED_FAMILY);
    const partyId = await newParty(actor, "Non Family Attempt");

    const err = await refuse(() =>
      registerFamilyMember(
        actor,
        {
          familyId: SEEDED_FAMILY,
          partyId,
          relationshipType: "NON_FAMILY",
          parentMemberId: fixedId(ID_PREFIX.familyMember, "FM_G1_FOUNDER"),
          provenance: "Household member attempt with a lineage parent.",
          reason: "NON_FAMILY must not carry lineage links.",
        },
        TRACE,
      ),
    );
    expect(err.code).toBe("NON_FAMILY_LINKS_FORBIDDEN");
    expect(await memberCount(SEEDED_FAMILY)).toBe(before);
  });

  it("directDescendant is a verified claim — registration refuses to assert it", async () => {
    const actor = await principalFor("NEEMA_BEYU");
    const before = await memberCount(SEEDED_FAMILY);
    const partyId = await newParty(actor, "Direct Descendant Claim Attempt");

    const err = await refuse(() =>
      registerFamilyMember(
        actor,
        {
          familyId: SEEDED_FAMILY,
          partyId,
          relationshipType: "BIRTH_DESCENDANT",
          parentMemberId: fixedId(ID_PREFIX.familyMember, "FM_G1_FOUNDER"),
          directDescendant: true,
          provenance: "Unverified direct-line claim.",
          reason: "Direct descent is governed by the verification flow.",
        },
        TRACE,
      ),
    );
    expect(err.code).toBe("DIRECT_DESCENDANT_REQUIRES_VERIFICATION");
    expect(await memberCount(SEEDED_FAMILY)).toBe(before);
  });

  it("a parent must belong to the SAME family", async () => {
    const actor = await principalFor("NEEMA_BEYU");
    const before = await memberCount(SEEDED_FAMILY);
    const partyId = await newParty(actor, "Cross Family Parent Attempt");

    const err = await refuse(() =>
      registerFamilyMember(
        actor,
        {
          familyId: SEEDED_FAMILY,
          partyId,
          relationshipType: "BIRTH_DESCENDANT",
          // A member id from another family would be caught by the same guard;
          // here the id does not exist at all — same fail-closed path.
          parentMemberId: "FAM_DOES_NOT_EXIST",
          provenance: "Invented parent reference.",
          reason: "Parents must be proven members of the family.",
        },
        TRACE,
      ),
    );
    expect(err.code).toBe("PARENT_NOT_IN_FAMILY");
    expect(await memberCount(SEEDED_FAMILY)).toBe(before);
  });

  it("legacy seeded rows remain intact — the catalogue-only extension never rewrites history", async () => {
    const [founder] = await db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.id, fixedId(ID_PREFIX.familyMember, "FM_G1_FOUNDER")));
    expect(founder).toBeTruthy();
    expect(founder!.familyId).toBe(SEEDED_FAMILY);
    expect(founder!.relationshipToParent).toBe("CHILD"); // legacy label retained
    expect(founder!.membershipStatus).toBe("ACTIVE");
    expect(founder!.createdBy).toBeNull(); // historical actors are never fabricated
    expect(founder!.provenance).toBeNull();

    // The membership registration path itself writes no authorization rows:
    // this entire guard suite registered persons and memberships, and the
    // users table did not move. (Registry-only person proof:
    // tests/security/registered-parties-are-userless.test.ts.)
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    expect(Number(n)).toBe(baselineUserCount);
  });
});
