import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { auditLog, enterpriseEvents, governanceBodies, governanceMembers, constitutionArticles, legalEntities, capitalRequests, policies, resolutions, resolutionVotes, tenants, users } from "../../src/db/schema";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import { declareRecusal, castVote, decideResolutionClosure, tableResolution, votingSnapshots } from "../../src/lib/governance-vote-service";
import { proposeResolution, inferMatterTrigger } from "../../src/lib/governance";
import { mattersTriggeredBy } from "../../src/lib/governance/reserved-matters";
import { verifyAuditChain, verifyEventChain } from "../../src/lib/audit";
import { resetAuditLedgers } from "../helpers/ledger-reset";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";

const bodyId = fixedId(ID_PREFIX.body, "GROUP_BOARD");
const ctx = { traceId: "GOVERNANCE_HARDENING" };
let chair: Principal;
let secretary: Principal;


async function principal(key: string): Promise<Principal> {
  const [u] = await db.select().from(users).where(eq(users.id, fixedId(ID_PREFIX.user, key)));
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const roles = (await loadGrants(u.id, u.primaryTenantId)).map((g) => g.code);
  return { userId: u.id, partyId: u.partyId, email: u.email, displayName: u.email, tenantId: tenant.id,
    tenantCode: tenant.code, tenantType: tenant.type, roles, permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles), entityScope: [], mfaSatisfied: true, sessionId: "TEST",
    riskScore: 0, emergencyPermissions: [] };
}
async function make(status: "DRAFT" | "TABLED" = "DRAFT") {
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId));
  const id = `RES_HARDEN_${randomUUID()}`;
  const [r] = await db.insert(resolutions).values({ id, tenantId: body.tenantId, bodyId, reference: id,
    title: "Governance hardening probe", category: "OTHER", summary: "Probe", rationale: "Probe",
    dataBasis: "Test evidence", consequences: "None", proposedBy: "TEST", status,
    requiredMajority: body.majorityRule, classification: "RESTRICTED",
    votingOpensAt: new Date(Date.now() - 3600000), votingClosesAt: new Date(Date.now() + 3600000) }).returning();
  return r;
}
async function seat(p: Principal) {
  const [m] = await db.select().from(governanceMembers).where(and(eq(governanceMembers.bodyId, bodyId), eq(governanceMembers.partyId, p.partyId)));
  return m;
}
async function cleanup() {
  await db.execute(sql`delete from resolution_votes where resolution_id like 'RES_HARDEN_%'`);
  await db.execute(sql`delete from resolutions where id like 'RES_HARDEN_%'`);
}
beforeAll(async () => { await cleanup(); await resetAuditLedgers(); chair = await principal("AMANI_BEYU"); secretary = await principal("GRACE_KILELE"); });
afterAll(cleanup);

describe("governance authority hardening — PostgreSQL", () => {
  it.each(["1900-01-01", "2999-01-01"])("rejects an inactive presiding appointment (%s)", async (date) => {
    const r = await make(); const m = await seat(chair);
    try {
      await db.update(governanceMembers).set(date.startsWith("19") ? { retiredOn: date } : { appointedOn: date }).where(eq(governanceMembers.id, m.id));
      await expect(tableResolution(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await db.update(resolutions).set({ status: "TABLED", votingClosesAt: new Date(0) }).where(eq(resolutions.id, r.id));
      await expect(decideResolutionClosure(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally { await db.update(governanceMembers).set({ appointedOn: m.appointedOn, retiredOn: m.retiredOn }).where(eq(governanceMembers.id, m.id)); }
  });
  it("blocks a conflicted presiding officer from tabling, voting and closing", async () => {
    const r = await make(); const m = await seat(chair);
    await db.insert(resolutionVotes).values({ id: `VOT_${r.id}`, resolutionId: r.id, memberId: m.id, vote: "FOR", conflictDeclared: true });
    await expect(tableResolution(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.update(resolutions).set({ status: "TABLED" }).where(eq(resolutions.id, r.id));
    await expect(castVote(chair, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideResolutionClosure(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("does not count retired members in the final tally", async () => {
    const r = await make("TABLED"); const m = await seat(chair);
    await castVote(chair, { resolutionId: r.id, vote: "FOR" }, ctx);
    try {
      await db.update(governanceMembers).set({ retiredOn: "1900-01-01" }).where(eq(governanceMembers.id, m.id));
      await db.update(resolutions).set({ votingClosesAt: new Date(0) }).where(eq(resolutions.id, r.id));
      const result = await decideResolutionClosure(secretary, { resolutionId: r.id }, ctx);
      expect(result.tally.for).toBe(0); expect(result.outcome).toBe("DEFERRED");
    } finally { await db.update(governanceMembers).set({ retiredOn: m.retiredOn }).where(eq(governanceMembers.id, m.id)); }
  });
  it("fails closed on unknown or changed rules and forged vote vocabulary", async () => {
    const r = await make();
    const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId));
    try {
      for (const majorityRule of ["UNKNOWN", "TWO_THIRDS"]) {
        await db.update(governanceBodies).set({ majorityRule }).where(eq(governanceBodies.id, bodyId));
        await expect(tableResolution(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({ code: "RULE_VIOLATION" });
      }
    } finally { await db.update(governanceBodies).set({ majorityRule: body.majorityRule }).where(eq(governanceBodies.id, bodyId)); }
    await expect(castVote(chair, { resolutionId: r.id, vote: "APPROVED" as never }, ctx)).rejects.toMatchObject({ code: "RULE_VIOLATION" });
  });
  it("blocks an undischarged policy approval rather than treating an obligation as ALLOW", async () => {
    const r = await make();
    await db.insert(policies).values({ id: "POL_HARDEN", code: "HARDEN-APPROVAL", title: "Probe", level: "ENTERPRISE", domain: "GOVERNANCE", effectiveFrom: "2000-01-01", body: "Probe", ownerRole: "CHIEF_GOVERNANCE_OFFICER", rules: [{ id: "approval", action: "governance:resolution.approve", effect: "REQUIRE_APPROVAL", message: "Requires separate approval" }] });
    try { await expect(tableResolution(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({ code: "POLICY_DENIED" }); }
    finally { await db.delete(policies).where(eq(policies.id, "POL_HARDEN")); }
  });
  it("filters classified and entity-scoped voting read models", async () => {
    const r = await make("TABLED");
    expect((await votingSnapshots({ ...chair, clearance: "PUBLIC" }, [r.id])).size).toBe(0);
    expect((await votingSnapshots({ ...chair, entityScope: ["WRONG_ENTITY"] }, [r.id])).size).toBe(0);
  });
  it("executes the actual service with RLS enabled as the non-owner runtime role", async () => {
    const r = await make();
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local role beyu_runtime`);
      await withTenantDatabaseContext(chair, async () => {
        const result = await tableResolution(chair, { resolutionId: r.id }, ctx);
        expect(result.status).toBe("TABLED");
        const vote = await castVote(chair, { resolutionId: r.id, vote: "FOR" }, ctx);
        expect(vote.tally.for).toBe(1);
      });
    });
  });
});


describe("self-recusal — persisted restriction and shared events", () => {
  it("replaces a substantive vote, records evidence, and prevents subsequent participation", async () => {
    const r = await make("TABLED");
    await castVote(chair, { resolutionId: r.id, vote: "FOR" }, ctx);
    await declareRecusal(chair, { resolutionId: r.id, reason: "Related-party interest in the proposal" }, ctx);
    const [updated] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(updated.votesFor).toBe(0);
    expect(updated.quorumMet).toBe(false);
    await expect(castVote(chair, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideResolutionClosure(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, r.id));
    expect(events.filter((e) => e.type === "GOVERNANCE_RESOLUTION_RECUSAL_DECLARED")).toHaveLength(1);
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.objectId, r.id), eq(auditLog.action, "governance.resolution.recuse")));
    expect(audits).toHaveLength(1);
    expect((await verifyAuditChain()).verified).toBe(true);
    expect((await verifyEventChain()).verified).toBe(true);
  });
  it("serializes a recusal racing a vote without losing the restriction", async () => {
    const r = await make("TABLED");
    const results = await Promise.allSettled([
      declareRecusal(chair, { resolutionId: r.id, reason: "Conflicting interest requires withdrawal" }, ctx),
      castVote(chair, { resolutionId: r.id, vote: "FOR" }, ctx),
    ]);
    expect(results[0].status).toBe("fulfilled");
    const [ballot] = await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, r.id));
    expect(ballot.vote).toBe("RECUSED"); expect(ballot.conflictDeclared).toBe(true);
    const [updated] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(updated.votesFor).toBe(0);
  });
  it("does not silently change a finalized decision", async () => {
    const r = await make();
    await db.update(resolutions).set({ status: "APPROVED" }).where(eq(resolutions.id, r.id));
    await expect(declareRecusal(chair, { resolutionId: r.id, reason: "Late discovered related-party interest" }, ctx)).rejects.toMatchObject({ code: "RULE_VIOLATION" });
  });
});


describe("constitutional and reserved-matter preconditions", () => {
  it("requires a live effective constitutional apex", async () => {
    const r = await make();
    const [article] = await db.select().from(constitutionArticles).where(eq(constitutionArticles.articleNo, 1));
    try {
      await db.update(constitutionArticles).set({ status: "DRAFT" }).where(eq(constitutionArticles.id, article.id));
      await expect(tableResolution(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({ code: "POLICY_DENIED" });
    } finally { await db.update(constitutionArticles).set({ status: article.status }).where(eq(constitutionArticles.id, article.id)); }
  });
  it("applies entity/country-scoped policy at execution time", async () => {
    const r = await make();
    const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId));
    const [entity] = await db.select().from(legalEntities).where(eq(legalEntities.id, body.legalEntityId!));
    await db.insert(policies).values({ id: "POL_HARDEN_COUNTRY", code: "HARDEN-COUNTRY", title: "Probe", level: "ENTITY", domain: "GOVERNANCE", effectiveFrom: "2000-01-01", body: "Probe", ownerRole: "CHIEF_GOVERNANCE_OFFICER", entityScope: entity.code, jurisdictionCode: entity.countryCode, rules: [{ id: "deny", action: "governance:resolution.approve", effect: "DENY", message: "Jurisdiction restriction" }] });
    try { await expect(tableResolution(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({ code: "POLICY_DENIED" }); }
    finally { await db.delete(policies).where(eq(policies.id, "POL_HARDEN_COUNTRY")); }
  });
  it("does not let a client override a persisted capital amount", async () => {
    const [request] = await db.select().from(capitalRequests).limit(1);
    await expect(proposeResolution(chair, { bodyId, title: "Capital request probe", category: "CAPITAL",
      summary: "Capital request probe summary", rationale: "Test authoritative amount binding",
      dataBasis: "Persisted request", consequences: "No execution", classification: "RESTRICTED",
      linkedObjectType: "CAPITAL_REQUEST", linkedObjectId: request.id, amount: Number(request.amount) + 1 }, ctx))
      .rejects.toMatchObject({ code: "RULE_VIOLATION" });
  });
  it("cannot spoof a different trigger or invalid amount to escape reservation", () => {
    expect(() => inferMatterTrigger("CAPITAL", "SUCCESSION")).toThrow();
    for (const amount of [NaN, Infinity, -1]) {
      expect(mattersTriggeredBy({ reservedMatters: ["CAPITAL>1M"], trigger: "CAPITAL_ALLOCATION", amount }).triggered).toHaveLength(1);
    }
  });
});


it("preserves decision-time quorum when membership later changes", async () => {
  const r = await make("TABLED");
  await db.update(resolutions).set({ votingClosesAt: new Date(0) }).where(eq(resolutions.id, r.id));
  const decision = await decideResolutionClosure(chair, { resolutionId: r.id }, ctx);
  const m = await seat(secretary);
  try {
    await db.update(governanceMembers).set({ retiredOn: "1900-01-01" }).where(eq(governanceMembers.id, m.id));
    const snapshot = (await votingSnapshots(chair, [r.id])).get(r.id)!;
    expect(snapshot.quorumBasis).toBe("DECISION_RECORD");
    expect(snapshot.quorum).toEqual(decision.quorum);
  } finally { await db.update(governanceMembers).set({ retiredOn: m.retiredOn }).where(eq(governanceMembers.id, m.id)); }
});
