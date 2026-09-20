import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { auditLog, resolutions, resolutionVotes, constitutionArticles, governanceBodies, governanceCharters, governanceMembers, governanceCapabilityRegistry, roleAssignments, enterpriseEvents, documents } from "../../src/db/schema";
import { createBodyCharter, commandBodyCharter } from "../../src/lib/governance/charter-service";
import { currentCharterComposition } from "../../src/lib/governance/charter-rules";
import { nominateMember } from "../../src/lib/governance/appointment-service";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
import { initialCharterFixture, initialCharterContext as ctx } from "../helpers/initial-charters";
import { cleanupEstablishments, asEstablishmentActor as as } from "../helpers/establishments";
import { charterFixtureRules, concludedCharterBallot } from "../helpers/charters";
import { appointmentInput } from "../helpers/appointments";
const prefix = "INITIAL_CHARTER";
let f: Awaited<ReturnType<typeof initialCharterFixture>>;
const input = { documentId: "DOC_D4", purpose: "Initial committee charter approved by its superior, not yet effective", rules: charterFixtureRules };
beforeAll(async () => { await cleanupEstablishments(prefix); f = await initialCharterFixture(prefix); });
afterAll(() => cleanupEstablishments(prefix));
const create = (p = f.chair, extra = {}) => as(p, () => createBodyCharter(p, f.childId, { ...input, ...extra }, ctx));
const command = (id: string, command: string, expectedRevision: number, extra = {}, p = f.secretary) => as(p, () => commandBodyCharter(p, f.childId, id, { command, expectedRevision, note: "Independent review of initial charter authority", ...extra }, ctx));
async function reviewed() { const c = await create(); await command(c.id, "SUBMIT", 1); const resolutionId = await concludedCharterBallot(c.id); await as(f.chair, () => decideResolutionClosure(f.chair, { resolutionId }, ctx)); return { c, resolutionId }; }
describe("initial charters use superior authority, never empty-body authority", () => {
 it("derives and freezes superior and original author identity", async () => {
  const c = await create(); expect(c).toMatchObject({ status: "DRAFT", bodyId: f.childId, authorityBodyId: f.bodyId, createdByPartyId: f.chair.partyId });
  await expect(create(f.candidate)).rejects.toHaveProperty("code", "FORBIDDEN");
  await expect(create(f.chair, { authorityBodyId: f.childId })).rejects.toThrow();
 });
 it("requires the exact superior POLICY decision and independent human approval", async () => {
  const { c, resolutionId } = await reviewed();
  await expect(command(c.id, "ADOPT", 2, { resolutionId }, f.chair)).rejects.toHaveProperty("code", "FORBIDDEN");
  const other = await create(); await command(other.id, "SUBMIT", 1);
  await expect(command(other.id, "ADOPT", 2, { resolutionId })).rejects.toHaveProperty("code", "RULE_VIOLATION");
  const wrong = await concludedCharterBallot(other.id, "GOV_GROUP_BOARD");
  await as(f.chair, () => decideResolutionClosure(f.chair, { resolutionId: wrong }, ctx));
  try { await expect(command(other.id, "ADOPT", 2, { resolutionId: wrong })).rejects.toHaveProperty("code", "RULE_VIOLATION"); }
  finally { await db.execute(sql`delete from resolution_votes where resolution_id=${wrong}`); await db.execute(sql`delete from resolutions where id=${wrong}`); }
 });
 it.each(["jurisdictionCode", "entityScope"] as const)("rechecks %s on the actual instrument", async (field) => {
  const { c, resolutionId } = await reviewed(); const [doc] = await db.select().from(documents).where(eq(documents.id, input.documentId));
  await db.update(documents).set({ [field]: "ZZ" }).where(eq(documents.id, doc.id));
  try { await expect(command(c.id, "ADOPT", 2, { resolutionId })).rejects.toHaveProperty("code", "RULE_VIOLATION"); }
  finally { await db.update(documents).set({ [field]: doc[field] }).where(eq(documents.id, doc.id)); }
 });
 it("rejects expired superior grants and absent constitution", async () => {
  const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.chair.userId));
  await db.update(roleAssignments).set({ effectiveTo: "2000-01-01" }).where(eq(roleAssignments.userId, f.chair.userId));
  try { await expect(create()).rejects.toHaveProperty("code", "FORBIDDEN"); }
  finally { for (const g of grants) await db.update(roleAssignments).set({ effectiveTo: g.effectiveTo }).where(eq(roleAssignments.id, g.id)); }
  await expect(db.transaction(async (tx) => { await tx.update(constitutionArticles).set({ status: "SUSPENDED" }).where(eq(constitutionArticles.articleNo, 1)); await create(); })).rejects.toHaveProperty("code", "POLICY_DENIED");
 });
 it("approves once without becoming effective, activating a body, or granting membership/RBAC/Finance", async () => {
  const { c, resolutionId } = await reviewed();
  const roles = await db.select().from(roleAssignments), capabilities = await db.select().from(governanceCapabilityRegistry);
  const results = await Promise.allSettled([command(c.id, "ADOPT", 2, { resolutionId }), command(c.id, "ADOPT", 2, { resolutionId })]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await db.select().from(governanceCharters).where(eq(governanceCharters.id, c.id)))[0]).toMatchObject({ status: "APPROVED", revision: 3, authorityBodyId: f.bodyId, resolutionId });
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, f.childId)); expect(body.status).toBe("DRAFT");
  expect(await as(f.chair, () => currentCharterComposition(body))).toMatchObject({ satisfied: false, coverage: "APPROVED_PENDING_ACTIVATION" });
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, f.childId))).toHaveLength(0);
  expect(await db.select().from(roleAssignments)).toEqual(roles); expect(await db.select().from(governanceCapabilityRegistry)).toEqual(capabilities);
  await expect(as(f.secretary, () => nominateMember(f.secretary, f.childId, appointmentInput(f.candidate.userId), ctx))).rejects.toHaveProperty("code", "FORBIDDEN");
  await expect(command(c.id, "SUBMIT", 3)).rejects.toHaveProperty("code", "RULE_VIOLATION");
  const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, c.id)); expect(events).toHaveLength(3);
  const event = events.find((e) => e.type === "GOVERNANCE_CHARTER_APPROVED")!;
  expect(event.correlationId).toBe(ctx.traceId); expect(event.causationId).toBeTruthy(); expect(event.authorityContext?.authorityId).toBe(f.bodyId);
  expect(events.some((e) => e.type === "GOVERNANCE_CHARTER_ADOPTED")).toBe(false);
 });
 it("respects superior presider recusal", async () => {
  const c = await create(); await command(c.id, "SUBMIT", 1); const resolutionId = await concludedCharterBallot(c.id);
  const [member] = await db.select().from(governanceMembers).where(and(eq(governanceMembers.bodyId, f.bodyId), eq(governanceMembers.partyId, f.secretary.partyId)));
  await db.update(resolutionVotes).set({ vote: "RECUSED", conflictDeclared: true }).where(and(eq(resolutionVotes.resolutionId, resolutionId), eq(resolutionVotes.memberId, member.id)));
  await as(f.chair, () => decideResolutionClosure(f.chair, { resolutionId }, ctx));
  expect((await db.select().from(resolutions).where(eq(resolutions.id, resolutionId)))[0].status).toBe("APPROVED");
  await expect(command(c.id, "ADOPT", 2, { resolutionId })).rejects.toHaveProperty("code", "FORBIDDEN");
 });
 it("rolls back the header, audit and events together", async () => {
  const audits = await db.select().from(auditLog), events = await db.select().from(enterpriseEvents);
  const before = await db.select().from(governanceCharters).where(eq(governanceCharters.bodyId, f.childId));
  await expect(db.transaction(async () => { await create(); throw Error("rollback initial charter"); })).rejects.toThrow("rollback initial charter");
  expect(await db.select().from(governanceCharters).where(eq(governanceCharters.bodyId, f.childId))).toEqual(before);
  expect(await db.select().from(auditLog)).toEqual(audits); expect(await db.select().from(enterpriseEvents)).toEqual(events);
 });
});
