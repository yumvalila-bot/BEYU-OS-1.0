import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db";
import { auditLog, documents, enterpriseEvents, governanceCapabilityRegistry, governanceAppointments, governanceMembers, resolutions, resolutionVotes, roleAssignments } from "../../src/db/schema";
import { nominateMember, commandAppointment } from "../../src/lib/governance/appointment-service";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
import { appointmentFixture, appointmentInput, appointmentBallot, cleanupAppointments, asAppointmentActor as as } from "../helpers/appointments";

const prefix = "APPT_ADVERSARIAL", ctx = { traceId: "APPOINTMENT_ADVERSARIAL" };
let f: Awaited<ReturnType<typeof appointmentFixture>>;
beforeEach(async () => { await cleanupAppointments(prefix); f = await appointmentFixture(prefix); });
afterEach(async () => { vi.useRealTimers(); await cleanupAppointments(prefix); });
const create = () => as(f.chair, () => nominateMember(f.chair, f.bodyId, appointmentInput(f.candidate.userId), ctx));
const command = (id: string, command: string, expectedRevision: number, p = f.secretary, extra = {}) => as(p, () => commandAppointment(p, f.bodyId, id, { command, expectedRevision, note: "Independent adversarial evidence review", ...extra }, ctx));
async function prepared(accept = true) {
 const a = await create(), resolutionId = await appointmentBallot(a.id, f.chair);
 await command(a.id, "APPROVE", 1, f.secretary, { resolutionId });
 if (accept) await command(a.id, "ACCEPT", 2, f.candidate);
 return { a, resolutionId };
}
async function row(id: string) { return (await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, id)))[0]; }

describe("appointment adversarial acceptance matrix", () => {
 it("serializes competing activation, rejects duplicates and preserves unrelated authority/history", async () => {
  const { a } = await prepared();
  const prior = await row(a.id), members = await db.select().from(governanceMembers), roles = await db.select().from(roleAssignments);
  const capabilities = await db.select().from(governanceCapabilityRegistry);
  const attempts = await Promise.allSettled([command(a.id, "ACTIVATE", 3), command(a.id, "ACTIVATE", 3)]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(attempts.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
  const active = await row(a.id);
  await expect(command(a.id, "ACTIVATE", 4)).rejects.toHaveProperty("code", "RULE_VIOLATION");
  expect((await db.select().from(governanceMembers)).filter((m) => m.id !== active.memberId)).toEqual(members);
  expect(await db.select().from(roleAssignments)).toEqual(roles);
  expect(await db.select().from(governanceCapabilityRegistry)).toEqual(capabilities);
  for (const key of ["partyId", "nomineeUserId", "appointedOn", "retiredOn", "documentChecksum", "documentVersion", "rationale", "resolutionId", "acceptedAt"] as const) expect(active[key]).toEqual(prior[key]);
  const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id));
  expect(events).toHaveLength(4);
  expect(events.every((e) => e.correlationId === ctx.traceId && e.traceId === ctx.traceId && e.legalEntityId === "LEN_BEYU_HOLDINGS")).toBe(true);
  const activation = events.filter((e) => e.type === "GOVERNANCE_MEMBERSHIP_ACTIVATED"); expect(activation).toHaveLength(1);
  const [cause] = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.id, activation[0].causationId!));
  expect(cause.type).toBe("GOVERNANCE_RESOLUTION_DECIDED"); expect(cause.subjectId).toBe(prior.resolutionId);
  expect(await db.select().from(auditLog).where(and(eq(auditLog.objectId, a.id), eq(auditLog.action, "governance.appointment.activate")))).toHaveLength(1);
 });
 it.each(["APPROVE", "ACTIVATE"] as const)("rechecks revoked grants before %s despite a previously authenticated Principal", async (stage) => {
  const a = await create(), resolutionId = await appointmentBallot(a.id, f.chair);
  if (stage === "ACTIVATE") { await command(a.id, "APPROVE", 1, f.secretary, { resolutionId }); await command(a.id, "ACCEPT", 2, f.candidate); }
  const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.secretary.userId));
  await db.delete(roleAssignments).where(eq(roleAssignments.userId, f.secretary.userId));
  try { await expect(command(a.id, stage, stage === "APPROVE" ? 1 : 3, f.secretary, stage === "APPROVE" ? { resolutionId } : {})).rejects.toHaveProperty("code", "FORBIDDEN"); }
  finally { await db.insert(roleAssignments).values(grants); }
  expect((await row(a.id)).status).toBe(stage === "APPROVE" ? "NOMINATED" : "ACCEPTED");
 });
 it("rejects an expired presiding membership even with live RBAC roles", async () => {
  const { a } = await prepared();
  const [seat] = await db.select().from(governanceMembers).where(and(eq(governanceMembers.bodyId, f.bodyId), eq(governanceMembers.partyId, f.secretary.partyId)));
  await db.update(governanceMembers).set({ retiredOn: "2000-01-01" }).where(eq(governanceMembers.id, seat.id));
  try { await expect(command(a.id, "ACTIVATE", 3)).rejects.toHaveProperty("code", "FORBIDDEN"); }
  finally { await db.update(governanceMembers).set({ retiredOn: seat.retiredOn }).where(eq(governanceMembers.id, seat.id)); }
 });
 it.each(["entityScope", "jurisdictionCode"] as const)("rejects a wrong-country/entity instrument at nomination and activation: %s", async (field) => {
  const { a } = await prepared();
  const [doc] = await db.select().from(documents).where(eq(documents.id, a.documentId));
  await db.update(documents).set({ [field]: field === "entityScope" ? "OTHER_ENTITY" : "ZZ" }).where(eq(documents.id, doc.id));
  try {
   await expect(create()).rejects.toHaveProperty("code", "RULE_VIOLATION");
   await expect(command(a.id, "ACTIVATE", 3)).rejects.toHaveProperty("code", "RULE_VIOLATION");
  } finally { await db.update(documents).set({ [field]: doc[field] }).where(eq(documents.id, doc.id)); }
  expect((await row(a.id)).status).toBe("ACCEPTED");
 });
 it("cannot command an appointment through a different governing body", async () => {
  const { a } = await prepared();
  await expect(as(f.secretary, () => commandAppointment(f.secretary, "GOV_GROUP_BOARD", a.id, { command: "ACTIVATE", expectedRevision: 3, note: "Attempt to substitute a different governing body" }, ctx))).rejects.toHaveProperty("code", "NOT_FOUND");
 });
 it("rejects a reference row with fabricated approval but no decision event", async () => {
  const a = await create(), resolutionId = await appointmentBallot(a.id, f.chair, false);
  const [seat] = await db.select().from(governanceMembers).where(and(eq(governanceMembers.bodyId, f.bodyId), eq(governanceMembers.partyId, f.chair.partyId)));
  // Administrator fixture only, deliberately not the canonical decision service.
  await db.update(resolutions).set({ status: "APPROVED", quorumMet: true, decisionDate: new Date(), decidedByMemberId: seat.id }).where(eq(resolutions.id, resolutionId));
  await expect(command(a.id, "APPROVE", 1, f.secretary, { resolutionId })).rejects.toMatchObject({ code: "GOVERNANCE_NOT_SATISFIED", message: expect.stringContaining("provenance") });
 });
 it("does not substitute insufficient ballots for a genuine approval", async () => {
  const a = await create(), resolutionId = await appointmentBallot(a.id, f.chair, false);
  await db.update(resolutionVotes).set({ vote: "AGAINST" }).where(eq(resolutionVotes.resolutionId, resolutionId));
  await as(f.chair, () => decideResolutionClosure(f.chair, { resolutionId }, ctx));
  await expect(command(a.id, "APPROVE", 1, f.secretary, { resolutionId })).rejects.toHaveProperty("code", "GOVERNANCE_NOT_SATISFIED");
 });
 it("cannot use a recused presider to record appointment approval", async () => {
  const a = await create(), resolutionId = await appointmentBallot(a.id, f.chair, false);
  const [seat] = await db.select().from(governanceMembers).where(and(eq(governanceMembers.bodyId, f.bodyId), eq(governanceMembers.partyId, f.secretary.partyId)));
  await db.update(resolutionVotes).set({ vote: "RECUSED", conflictDeclared: true }).where(and(eq(resolutionVotes.resolutionId, resolutionId), eq(resolutionVotes.memberId, seat.id)));
  await as(f.chair, () => decideResolutionClosure(f.chair, { resolutionId }, ctx));
  await expect(command(a.id, "APPROVE", 1, f.secretary, { resolutionId })).rejects.toHaveProperty("code", "FORBIDDEN");
 });
 it("does not record new acceptance after the entire appointment term has expired", async () => {
  const { a } = await prepared(false);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2031-01-01T12:00:00Z"));
  try { await expect(command(a.id, "ACCEPT", 2, f.candidate)).rejects.toHaveProperty("code", "RULE_VIOLATION"); }
  finally { vi.useRealTimers(); }
  expect((await row(a.id)).status).toBe("APPROVED");
 });
});
