import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db";
import { families, familyMembers, parties, users } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import { buildRegistryGraph, registerParty } from "../../src/lib/admin/registry-service";

/**
 * BEYU Registry — relationship graph integrity.
 *
 * Every edge must be TRUTHFUL: employment only for real employees, user
 * links only where a GlobalUserID exists, family membership only for actual
 * memberships — never fabricated — and edges are fail-closed by capability
 * (no family:member.read → no family edges, whatever the clearance).
 */

type Edge = { from: string; to: string; type: string; meta?: unknown };

const T = { group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP") };
const SEEDED_FAMILY = fixedId(ID_PREFIX.family, `${T.group}_BEYU`);
const E_HOLDINGS = fixedId(ID_PREFIX.legalEntity, "BEYU_HOLDINGS");
const AMANI_PARTY = fixedId(ID_PREFIX.party, "AMANI_BEYU");
const TRACE = "TEST_GRAPH_INTEGRITY";

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

afterAll(async () => {
  if (createdPartyIds.length > 0) {
    await db.delete(familyMembers).where(inArray(familyMembers.partyId, createdPartyIds));
    await db.delete(parties).where(inArray(parties.id, createdPartyIds));
  }
});

describe("relationship graph — truthful edges, fail-closed by capability", () => {
  it("contains real employment, real user links and real memberships — nothing fabricated", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const graph = await buildRegistryGraph(ceo);
    const edges = graph.edges as Edge[];

    // Real employee (seeded): person → employing legal entity with employeeNo.
    const employment = edges.find(
      (e) => e.type === "personWorksFor" && e.from === AMANI_PARTY && e.to === E_HOLDINGS,
    );
    expect(employment, "AMANI is a seeded employee of BEYU Holdings").toBeTruthy();
    expect((employment!.meta as { employeeNo?: string })?.employeeNo).toBe("BEYU-EMP-00001");

    // Real user link: AMANI has a GlobalUserID.
    const userLink = edges.find(
      (e) => e.type === "hasUser" && e.from === AMANI_PARTY && e.to.startsWith("USR_"),
    );
    expect(userLink, "AMANI's GlobalUserID link must exist").toBeTruthy();

    // Real membership: AMANI is a member of the seeded family.
    const memberOf = edges.find(
      (e) => e.type === "memberOf" && e.from === AMANI_PARTY && e.to === SEEDED_FAMILY,
    );
    expect(memberOf, "AMANI's family membership edge must exist").toBeTruthy();

    // Real ownership chain: entity-owner relationships from the ownership
    // register are presented as contains-with-ownership meta.
    const owns = edges.filter((e) => e.type === "contains" && (e.meta as { as?: string })?.as === "ownership");
    expect(owns.length).toBeGreaterThan(0);

    // Fabrication guard: seeded ownership records are entity-owned; NO
    // personOwns edge may be invented from them.
    const personOwns = edges.filter((e) => e.type === "personOwns");
    expect(personOwns).toHaveLength(0);

    // Fabrication guard: every hasUser target exists in the users table.
    const userIds = new Set((await db.select({ id: users.id }).from(users)).map((u) => u.id));
    for (const e of edges.filter((x) => x.type === "hasUser")) {
      expect(userIds.has(e.to), `hasUser edge targets real user ${e.to}`).toBe(true);
    }

    // Fabrication guard: every memberOf target is a real family row.
    const familyIds = new Set((await db.select({ id: families.id }).from(families)).map((f) => f.id));
    for (const e of edges.filter((x) => x.type === "memberOf")) {
      expect(familyIds.has(e.to), `memberOf edge targets real family ${e.to}`).toBe(true);
    }
  });

  it("a freshly registered person gets NO user, NO employment, NO membership edges", async () => {
    const actor = await principalFor("PLATFORM_ADMIN");
    const party = await registerParty(
      actor,
      {
        displayName: `Graph Probe ${Date.now().toString(36)}`,
        primaryTenantId: T.group,
        reason: "Graph integrity probe: registry-only person.",
      },
      TRACE,
    );
    createdPartyIds.push(party.partyId);

    const ceo = await principalFor("AMANI_BEYU");
    const graph = await buildRegistryGraph(ceo);
    const edges = graph.edges.filter((e) => (e as Edge).from === party.partyId) as Edge[];

    expect(edges.find((e) => e.type === "hasUser")).toBeUndefined();
    expect(edges.find((e) => e.type === "personWorksFor")).toBeUndefined();
    expect(edges.find((e) => e.type === "memberOf")).toBeUndefined();
    expect(edges.find((e) => e.type === "personOwns")).toBeUndefined();
  });

  it("edges fail closed by capability: no family:member.read → NO family edges", async () => {
    // HCM_DIRECTOR sits in the SAME tenant as the seeded family — the refusal
    // must come from the capability gate, not from an empty tenant scope.
    const actor = await principalFor("ASHA_NDULU"); // HCM_DIRECTOR: no family:member.read
    expect(actor.permissions.has("family:member.read")).toBe(false);

    const graph = await buildRegistryGraph(actor);
    const edges = graph.edges as Edge[];
    const familyEdges = edges.filter(
      (e) => e.type === "memberOf" || e.type === "ancestorOf" || e.to === SEEDED_FAMILY,
    );
    expect(familyEdges, "family edges must be gated behind family:member.read").toHaveLength(0);
    // Nodes likewise — HIGHLY_RESTRICTED family nodes never leak.
    expect(graph.nodes.some((n) => n.id === SEEDED_FAMILY)).toBe(false);
  });

  it("every family memberOf edge mirrors an actual family_members row", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const graph = await buildRegistryGraph(ceo);
    const memberOf = (graph.edges as Edge[]).filter((e) => e.type === "memberOf");
    expect(memberOf.length).toBeGreaterThan(0);

    const real = await db
      .select({ partyId: familyMembers.partyId, familyId: familyMembers.familyId })
      .from(familyMembers)
      .where(inArray(familyMembers.familyId, (await db.select({ id: families.id }).from(families)).map((f) => f.id)));
    const realKeys = new Set(real.map((r) => `${r.partyId}->${r.familyId}`));
    for (const e of memberOf) {
      expect(realKeys.has(`${e.from}->${e.to}`), `edge ${e.from}->${e.to} must be a real membership`).toBe(true);
    }
  });
});
