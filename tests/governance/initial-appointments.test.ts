import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db";
import { auditLog, enterpriseEvents, governanceAppointments, governanceBodies, governanceCharters, governanceMembers, governanceCapabilityRegistry, constitutionArticles, roleAssignments, documents, resolutions, resolutionVotes } from "../../src/db/schema";
import { nominateMember, commandAppointment } from "../../src/lib/governance/appointment-service";
import { appointmentInput, appointmentBallot, asAppointmentActor as as } from "../helpers/appointments";
import { initialAppointmentFixture, approveInitialCharter, initialAppointmentContext as ctx } from "../helpers/initial-appointments";
import { cleanupEstablishments } from "../helpers/establishments";
let f: Awaited<ReturnType<typeof initialAppointmentFixture>>;
const create = (p = f.chair, extra = {}) => as(p, () => nominateMember(p, f.childId, appointmentInput(f.candidate.userId, extra), ctx));
const command = (id: string, command: string, expectedRevision: number, p = f.secretary, extra = {}) => as(p, () => commandAppointment(p, f.childId, id, { command, expectedRevision, note: "Review immutable initial appointment evidence", ...extra }, ctx));
beforeAll(async () => { await cleanupEstablishments("INITIAL_APPT"); f = await initialAppointmentFixture("INITIAL_APPT"); });
afterAll(() => cleanupEstablishments("INITIAL_APPT"));
describe("superior-controlled initial appointments are consent, not authority", () => {
 it("derives immutable authority and charter, with no caller-selected scope", async () => {
  const a = await create(); expect(a).toMatchObject({ bodyId: f.childId, authorityBodyId: f.bodyId, initialCharterId: f.initialCharterId, status: "NOMINATED", nominatedByPartyId: f.chair.partyId });
  await expect(create(f.candidate)).rejects.toHaveProperty("code", "FORBIDDEN");
  await expect(create(f.chair, { authorityBodyId: f.childId })).rejects.toThrow();
  await expect(create(f.chair, { initialCharterId: f.initialCharterId })).rejects.toThrow();
 });
 it("requires the exact superior decision, independent approver and nominee-only consent", async () => {
  const a = await create(), resolutionId = await appointmentBallot(a.id, f.chair);
  expect((await db.select().from(resolutions).where(eq(resolutions.id, resolutionId)))[0].bodyId).toBe(f.bodyId);
  await expect(command(a.id, "APPROVE", 1, f.chair, { resolutionId })).rejects.toHaveProperty("code", "FORBIDDEN");
  const b = await create(); await expect(command(b.id, "APPROVE", 1, f.secretary, { resolutionId })).rejects.toHaveProperty("code", "RULE_VIOLATION");
  const roles = await db.select().from(roleAssignments), capabilities = await db.select().from(governanceCapabilityRegistry);
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId });
  await expect(command(a.id, "ACCEPT", 2)).rejects.toHaveProperty("code", "FORBIDDEN");
  const attempts = await Promise.allSettled([command(a.id, "ACCEPT", 2, f.candidate), command(a.id, "ACCEPT", 2, f.candidate)]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(attempts.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
  await expect(command(a.id, "ACTIVATE", 3)).rejects.toMatchObject({ code: "RULE_VIOLATION", message: expect.stringContaining("atomic composition") });
  expect((await db.select().from(governanceBodies).where(eq(governanceBodies.id, f.childId)))[0].status).toBe("DRAFT");
  expect((await db.select().from(governanceCharters).where(eq(governanceCharters.id, f.initialCharterId)))[0].status).toBe("APPROVED");
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, f.childId))).toHaveLength(0);
  expect(await db.select().from(roleAssignments)).toEqual(roles); expect(await db.select().from(governanceCapabilityRegistry)).toEqual(capabilities);
  const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id)); expect(events).toHaveLength(3);
  for (const e of events) { expect(e.correlationId).toBe(ctx.traceId); expect(e.authorityContext?.authorityId).toBe(f.bodyId); }
  expect(events.find((e) => e.type === "GOVERNANCE_APPOINTMENT_APPROVED")?.causationId).toBeTruthy();
  expect(events.some((e) => e.type === "GOVERNANCE_MEMBERSHIP_ACTIVATED")).toBe(false);
 });
 it.each(["expired", "revoked"] as const)("rechecks superior grant %s before approval", async (field) => {
  const a = await create(), resolutionId = await appointmentBallot(a.id, f.chair);
  const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.secretary.userId));
  if (field === "expired") await db.update(roleAssignments).set({ effectiveTo: "2000-01-01" }).where(eq(roleAssignments.userId, f.secretary.userId));
  else await db.delete(roleAssignments).where(eq(roleAssignments.userId, f.secretary.userId));
  try { await expect(command(a.id, "APPROVE", 1, f.secretary, { resolutionId })).rejects.toHaveProperty("code", "FORBIDDEN"); }
  finally { if (field === "revoked") await db.insert(roleAssignments).values(grants); else for (const g of grants) await db.update(roleAssignments).set({ effectiveTo: g.effectiveTo }).where(eq(roleAssignments.id, g.id)); }
 });
 it.each(["entityScope", "jurisdictionCode"] as const)("denies a changed %s on the current instrument", async (field) => {
  const [d] = await db.select().from(documents).where(eq(documents.id, "DOC_D4"));
  await db.update(documents).set({ [field]: "ZZ" }).where(eq(documents.id, d.id));
  try { await expect(create()).rejects.toHaveProperty("code", "RULE_VIOLATION"); }
  finally { await db.update(documents).set({ [field]: d[field] }).where(eq(documents.id, d.id)); }
 });
 it("respects superior presider recusal on the actual appointment decision", async () => {
  const a = await create(), resolutionId = await appointmentBallot(a.id, f.chair, false);
  const [seat] = await db.select().from(governanceMembers).where(and(eq(governanceMembers.bodyId, f.bodyId), eq(governanceMembers.partyId, f.secretary.partyId)));
  await db.update(resolutionVotes).set({ vote: "RECUSED", conflictDeclared: true }).where(and(eq(resolutionVotes.resolutionId, resolutionId), eq(resolutionVotes.memberId, seat.id)));
  const { decideResolutionClosure } = await import("../../src/lib/governance-vote-service");
  await as(f.chair, () => decideResolutionClosure(f.chair, { resolutionId }, ctx));
  await expect(command(a.id, "APPROVE", 1, f.secretary, { resolutionId })).rejects.toHaveProperty("code", "FORBIDDEN");
 });
 it("requires constitutional authority for initial consent as well as nomination", async () => {
  const a = await create(), resolutionId = await appointmentBallot(a.id, f.chair);
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId });
  await expect(db.transaction(async (tx) => {
   await tx.update(constitutionArticles).set({ status: "SUSPENDED" }).where(eq(constitutionArticles.articleNo, 1));
   await command(a.id, "ACCEPT", 2, f.candidate);
  })).rejects.toHaveProperty("code", "POLICY_DENIED");
  expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, a.id)))[0].status).toBe("APPROVED");
 });
 it("rolls back nomination, audit and events together", async () => {
  const before = await db.select().from(governanceAppointments).where(eq(governanceAppointments.bodyId, f.childId));
  const audit = await db.select().from(auditLog), events = await db.select().from(enterpriseEvents);
  await expect(as(f.chair, async () => { await nominateMember(f.chair, f.childId, appointmentInput(f.candidate.userId), ctx); throw Error("abort initial nomination"); })).rejects.toThrow("abort initial nomination");
  expect(await db.select().from(governanceAppointments).where(eq(governanceAppointments.bodyId, f.childId))).toEqual(before);
  expect(await db.select().from(auditLog)).toEqual(audit); expect(await db.select().from(enterpriseEvents)).toEqual(events);
 });
 it("pins consent to the approved charter but allows withdrawal after newer terms", async () => {
  const a = await create(), resolutionId = await appointmentBallot(a.id, f.chair);
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId });
  await approveInitialCharter(f);
  await expect(command(a.id, "ACCEPT", 2, f.candidate)).rejects.toMatchObject({ code: "RULE_VIOLATION", message: expect.stringContaining("changed") });
  expect((await command(a.id, "DECLINE", 2, f.candidate)).status).toBe("DECLINED");
 });
});
