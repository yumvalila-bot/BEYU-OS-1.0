import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { auditLog, enterpriseEvents, governanceBodies, governanceMembers, roleAssignments, resolutions, resolutionVotes } from "../../src/db/schema";
import { simulateResolution, SimulationSchema } from "../../src/lib/governance/simulation";
import { executionPrincipal } from "../helpers/governance-execution";
import type { Principal } from "../../src/lib/authz";
const id = "RES_SIMULATION_TEST", bodyId = "GOV_GROUP_BOARD";
let p: Principal; let ids: string[];
async function simulate(raw: unknown, principal = p) {
 return db.transaction(async (tx) => {
  await tx.execute(sql`set local role beyu_runtime`);
  expect((await tx.execute(sql`select rolsuper,rolbypassrls from pg_roles where rolname=current_user`)).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  return simulateResolution(principal, id, raw);
 }, { accessMode: "read only", isolationLevel: "repeatable read" });
}
beforeAll(async () => {
 p = await executionPrincipal();
 const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId));
 ids = (await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, bodyId))).map((m) => m.id);
 await db.insert(resolutions).values({ id, reference: id, tenantId: body.tenantId, bodyId, title: "Non-mutating preflight test", category: "POLICY", summary: "Fixture", rationale: "Fixture", dataBasis: "Fixture", consequences: "No authority", proposedBy: p.userId, requiredMajority: body.majorityRule, status: "TABLED", classification: "RESTRICTED", votingClosesAt: new Date(1) });
});
afterAll(async () => { await db.delete(resolutionVotes).where(eq(resolutionVotes.resolutionId, id)); await db.delete(resolutions).where(eq(resolutions.id, id)); });
describe("database-enforced read-only governance simulation", () => {
 it("calculates hypothetical approval without changing state, ballots, audit or events", async () => {
  const before = { resolution: await db.select().from(resolutions).where(eq(resolutions.id, id)), ballots: await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, id)), audits: (await db.select().from(auditLog)).length, events: (await db.select().from(enterpriseEvents)).length };
  const result = await simulate({ ballots: ids.map((memberId) => ({ memberId, vote: "FOR" })) });
  expect(result).toMatchObject({ mode: "READ_ONLY_SIMULATION", authorityGranted: false, approvalGranted: false, executionPermitted: false, hypothetical: { outcome: "APPROVED", quorum: { required: 4, participated: 5 } } });
  expect(result.source.status).toBe("TABLED"); expect(result.checks.reservedMatters.coverage).toBe("NOT_EVALUATED");
  expect(await db.select().from(resolutions).where(eq(resolutions.id, id))).toEqual(before.resolution);
  expect(await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, id))).toEqual(before.ballots);
  expect((await db.select().from(auditLog)).length).toBe(before.audits); expect((await db.select().from(enterpriseEvents)).length).toBe(before.events);
 });
 it("retains the absolute quorum after hypothetical recusals", async () => {
  const result = await simulate({ additionalRecusals: ids.slice(0, 3), ballots: ids.slice(3).map((memberId) => ({ memberId, vote: "FOR" })), assumeVotingConcluded: true });
  expect(result.hypothetical).toMatchObject({ outcome: "DEFERRED", quorum: { required: 4, eligibleCount: 2, met: false } });
 });
 it("never accepts a made-up member, duplicate vote, status, authority or amount", async () => {
  expect(SimulationSchema.safeParse({ status: "APPROVED", amount: 1 }).success).toBe(false);
  await expect(simulate({ ballots: [{ memberId: "UNKNOWN", vote: "FOR" }] })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
  await expect(simulate({ ballots: [{ memberId: ids[0], vote: "FOR" }, { memberId: ids[0], vote: "FOR" }] })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
 });
 it("does not erase a persisted conflict to simulate a vote", async () => {
  await db.insert(resolutionVotes).values({ id: "VOT_SIM_CONFLICT", resolutionId: id, memberId: ids[0], vote: "RECUSED", conflictDeclared: true });
  try { await expect(simulate({ ballots: [{ memberId: ids[0], vote: "FOR" }] })).rejects.toMatchObject({ code: "RULE_VIOLATION" }); }
  finally { await db.delete(resolutionVotes).where(eq(resolutionVotes.id, "VOT_SIM_CONFLICT")); }
 });
 it.each(["entity", "classification", "tenant", "permission"])("denies %s scope even though the result would not mutate", async (kind) => {
  const principal = { ...p, ...(kind === "entity" ? { entityScope: ["WRONG_ENTITY"] } : kind === "classification" ? { clearance: "PUBLIC" as const } : kind === "tenant" ? { tenantId: "TEN_BEYU_FINTECH", tenantType: "SECTOR" } : { permissions: new Set<never>() }) };
  await expect(simulate({}, principal)).rejects.toMatchObject({ code: "NOT_FOUND" });
 });
 it("refuses execution inside a writable ambient transaction", async () => {
  await expect(db.transaction(() => simulateResolution(p, id, {}))).rejects.toMatchObject({ code: "RULE_VIOLATION" });
 });
 it("fails closed on an unknown persisted category", async () => {
  await db.update(resolutions).set({ category: "UNKNOWN" }).where(eq(resolutions.id, id));
  try { await expect(simulate({})).rejects.toMatchObject({ code: "RULE_VIOLATION" }); }
  finally { await db.update(resolutions).set({ category: "POLICY" }).where(eq(resolutions.id, id)); }
 });
 it("does not misreport unobservable capital reservation as satisfied", async () => {
  await db.update(resolutions).set({ category: "CAPITAL" }).where(eq(resolutions.id, id));
  try { expect((await simulate({})).checks.reservedMatters.coverage).toBe("NOT_EVALUATED"); }
  finally { await db.update(resolutions).set({ category: "POLICY" }).where(eq(resolutions.id, id)); }
 });
 it("keeps the inherited transaction read-only after the calculation", async () => {
  await db.transaction(async (tx) => {
   await tx.execute(sql`set local role beyu_runtime`);
   await simulateResolution(p, id, {});
   await expect(tx.execute(sql`update resolutions set title='FORGED' where id=${id}`)).rejects.toMatchObject({ cause: { code: "25006" } });
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
 });
 it("rejects an inherited READ COMMITTED transaction even if read-only", async () => {
  await expect(db.transaction(() => simulateResolution(p, id, {}), { accessMode: "read only" })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
 });
 it("does not reuse expired grants supplied by an older principal", async () => {
  const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, p.userId));
  await db.update(roleAssignments).set({ effectiveTo: "2000-01-01" }).where(eq(roleAssignments.userId, p.userId));
  try { await expect(simulate({})).rejects.toMatchObject({ code: "NOT_FOUND" }); }
  finally { for (const grant of grants) await db.update(roleAssignments).set({ effectiveTo: grant.effectiveTo }).where(eq(roleAssignments.id, grant.id)); }
 });
 it("isolates concurrent hypothetical outcomes and never changes the source", async () => {
  const [yes, no] = await Promise.all([simulate({ ballots: ids.map((memberId) => ({ memberId, vote: "FOR" })) }), simulate({ ballots: ids.map((memberId) => ({ memberId, vote: "AGAINST" })) })]);
  expect(yes.hypothetical.outcome).toBe("APPROVED"); expect(no.hypothetical.outcome).toBe("REJECTED");
  expect((await db.select().from(resolutions).where(eq(resolutions.id, id)))[0].status).toBe("TABLED");
 });
 it("can establish its own READ ONLY transaction without a parallel database connection", async () => {
  const result = await simulateResolution(p, id, {}); expect(result.authorityGranted).toBe(false);
  expect(result.checks.delegation).toContain("NOT_EVALUATED"); expect(result.checks.countryGrants).toContain("NOT_MODELLED");
 });
});
