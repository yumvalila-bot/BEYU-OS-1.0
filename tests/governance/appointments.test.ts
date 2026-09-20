import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceAppointments, governanceMembers, roleAssignments, documents, enterpriseEvents, notifications, users, governanceCharters, governanceCharterTerms, resolutions } from "../../src/db/schema";
import { nominateMember, commandAppointment } from "../../src/lib/governance/appointment-service";
import { createBodyCharter, commandBodyCharter } from "../../src/lib/governance/charter-service";
import { charterFixtureRules, concludedCharterBallot, cleanupCharters } from "../helpers/charters";
import { decideResolutionClosure, tableResolution } from "../../src/lib/governance-vote-service";
import { NominateMemberSchema } from "../../src/lib/governance/appointment-contract";
import { appointmentFixture, appointmentInput, appointmentBallot, cleanupAppointments, asAppointmentActor as as } from "../helpers/appointments";
import { executionPrincipal } from "../helpers/governance-execution";
import { verifyAuditChain, verifyEventChain } from "../../src/lib/audit";
let f: Awaited<ReturnType<typeof appointmentFixture>>;
const ctx = { traceId: "APPOINTMENT_TEST" }, prefix = "APPT_TEST";
const create = (extra = {}, p = f.chair) => as(p, () => nominateMember(p, f.bodyId, appointmentInput(f.candidate.userId, extra), ctx));
const command = (id: string, command: string, expectedRevision: number, p = f.secretary, extra = {}) => as(p, () => commandAppointment(p, f.bodyId, id, { command, expectedRevision, note: "Independently reviewed appointment evidence", ...extra }, ctx));
beforeAll(async () => { await cleanupAppointments(prefix); f = await appointmentFixture(prefix); });
afterAll(() => cleanupAppointments(prefix));
describe("governed appointment → consent → canonical membership", () => {
 it("rejects unknown roles, invalid dates, voting observers and forged state", () => {
  for (const extra of [{ seatRole: "KING" }, { appointedOn: "2026-02-30" }, { status: "ACTIVE" }, { seatRole: "OBSERVER", votingRights: true }, { retiredOn: "1900-01-01" }]) expect(NominateMemberSchema.safeParse(appointmentInput("USER", extra)).success).toBe(false);
 });
 it.each(["mfa", "scope", "permission"])("requires current %s presiding authority", async (kind) => {
  const p = { ...f.chair, ...(kind === "mfa" ? { mfaSatisfied: false } : kind === "scope" ? { entityScope: ["WRONG"] } : { permissions: new Set<never>() }) };
  await expect(create({}, p)).rejects.toHaveProperty("code");
 });
 it("does not combine another entity's approval grant with a local read grant", async () => {
  const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.secretary.userId));
  await db.update(roleAssignments).set({ legalEntityId: "LEN_BEYU_FAMILY_TRUST" }).where(eq(roleAssignments.userId, f.secretary.userId));
  await db.insert(roleAssignments).values({ ...grants[0], id: "RAS_APPT_LOCAL_READ", roleId: "ROL_AUDITOR", legalEntityId: "LEN_BEYU_HOLDINGS" });
  try { await expect(create({}, f.secretary)).rejects.toHaveProperty("code", "FORBIDDEN"); }
  finally {
   await db.delete(roleAssignments).where(eq(roleAssignments.id, "RAS_APPT_LOCAL_READ"));
   for (const g of grants) await db.update(roleAssignments).set({ legalEntityId: g.legalEntityId }).where(eq(roleAssignments.id, g.id));
  }
 });
 it("also rejects cross-entity grant mixing at canonical resolution tabling", async () => {
  const id = "RES_APPT_SCOPE_PROBE";
  await db.insert(resolutions).values({ id, reference: id, bodyId: f.bodyId, tenantId: f.chair.tenantId, title: "Entity authority probe", category: "POLICY", summary: "Fixture", rationale: "Fixture", dataBasis: "Fixture", consequences: "No scope widening", proposedBy: f.chair.userId, classification: "PUBLIC", requiredMajority: "SIMPLE", status: "DRAFT" });
  const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.secretary.userId));
  await db.update(roleAssignments).set({ legalEntityId: "LEN_BEYU_FAMILY_TRUST" }).where(eq(roleAssignments.userId, f.secretary.userId));
  await db.insert(roleAssignments).values({ ...grants[0], id: "RAS_APPT_SCOPE_PROBE", roleId: "ROL_AUDITOR", legalEntityId: "LEN_BEYU_HOLDINGS" });
  const mixed = { ...await executionPrincipal(f.secretary.userId), entityScope: ["LEN_BEYU_FAMILY_TRUST", "LEN_BEYU_HOLDINGS"] };
  try { await expect(as(mixed, () => tableResolution(mixed, { resolutionId: id }, ctx))).rejects.toHaveProperty("code", "FORBIDDEN"); }
  finally {
   await db.delete(roleAssignments).where(eq(roleAssignments.id, "RAS_APPT_SCOPE_PROBE"));
   for (const g of grants) await db.update(roleAssignments).set({ legalEntityId: g.legalEntityId }).where(eq(roleAssignments.id, g.id));
  }
 });
 it("never lets a service account exercise a retained presiding seat", async () => {
  const id = "RES_APPT_SERVICE_PROBE";
  await db.insert(resolutions).values({ id, reference: id, bodyId: f.bodyId, tenantId: f.chair.tenantId, title: "Human authority probe", category: "POLICY", summary: "Fixture", rationale: "Fixture", dataBasis: "Fixture", consequences: "No machine authority", proposedBy: f.chair.userId, classification: "PUBLIC", requiredMajority: "SIMPLE", status: "DRAFT" });
  await db.update(users).set({ isServiceAccount: true }).where(eq(users.id, f.secretary.userId));
  try { await expect(as(f.secretary, () => tableResolution(f.secretary, { resolutionId: id }, ctx))).rejects.toHaveProperty("code", "FORBIDDEN"); }
  finally { await db.update(users).set({ isServiceAccount: false }).where(eq(users.id, f.secretary.userId)); }
 });
 it("does not permit self-nomination, backdating or premature activation", async () => {
  await expect(create({ nomineeUserId: f.chair.userId })).rejects.toHaveProperty("code", "FORBIDDEN");
  await expect(create({ appointedOn: "2000-01-01" })).rejects.toHaveProperty("code", "RULE_VIOLATION");
  const a = await create(); await expect(command(a.id, "ACTIVATE", 1)).rejects.toHaveProperty("code", "RULE_VIOLATION");
 });
 it("requires a genuine nomination-specific decision and independent approver", async () => {
  const a = await create(); const r = await appointmentBallot(a.id, f.chair);
  await expect(command(a.id, "APPROVE", 1, f.chair, { resolutionId: r })).rejects.toHaveProperty("code", "FORBIDDEN");
  const b = await create(); await expect(command(b.id, "APPROVE", 1, f.secretary, { resolutionId: r })).rejects.toHaveProperty("code", "RULE_VIOLATION");
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r });
  await expect(command(a.id, "ACCEPT", 2)).rejects.toHaveProperty("code", "FORBIDDEN");
  await command(a.id, "DECLINE", 2, f.candidate);
  await expect(command(a.id, "ACCEPT", 3, f.candidate)).rejects.toHaveProperty("code", "RULE_VIOLATION");
 });
 it("rejects changed instrument evidence", async () => {
  const a = await create(); const r = await appointmentBallot(a.id, f.chair);
  await db.update(documents).set({ version: "CHANGED" }).where(eq(documents.id, a.documentId));
  try { await expect(command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r })).rejects.toHaveProperty("code", "RULE_VIOLATION"); }
  finally { await db.update(documents).set({ version: a.documentVersion }).where(eq(documents.id, a.documentId)); }
 });
 it("rejects service-account nominees and consent without MFA", async () => {
  await db.update(users).set({ isServiceAccount: true }).where(eq(users.id, f.candidate.userId));
  try { await expect(create()).rejects.toHaveProperty("code", "RULE_VIOLATION"); }
  finally { await db.update(users).set({ isServiceAccount: false }).where(eq(users.id, f.candidate.userId)); }
  const a = await create(), r = await appointmentBallot(a.id, f.chair);
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r });
  await expect(command(a.id, "ACCEPT", 2, { ...f.candidate, mfaSatisfied: false })).rejects.toHaveProperty("code", "FORBIDDEN");
 });
 it("rechecks expired authority at activation and rolls back an interrupted activation", async () => {
  const a = await create(), r = await appointmentBallot(a.id, f.chair);
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r }); await command(a.id, "ACCEPT", 2, f.candidate);
  const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.secretary.userId));
  await db.update(roleAssignments).set({ effectiveTo: "2000-01-01" }).where(eq(roleAssignments.userId, f.secretary.userId));
  try { await expect(command(a.id, "ACTIVATE", 3)).rejects.toHaveProperty("code", "FORBIDDEN"); }
  finally { for (const g of grants) await db.update(roleAssignments).set({ effectiveTo: g.effectiveTo }).where(eq(roleAssignments.id, g.id)); }
  const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id));
  await expect(as(f.secretary, async () => { await commandAppointment(f.secretary, f.bodyId, a.id, { command: "ACTIVATE", expectedRevision: 3, note: "Simulated transport rollback" }, ctx); throw Error("Abort entire transaction"); })).rejects.toThrow("Abort entire transaction");
  expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, a.id)))[0].status).toBe("ACCEPTED");
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.partyId, f.candidate.partyId!))).toHaveLength(0);
  expect(await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id))).toEqual(events);
 });
 it("enforces adopted composition rather than merely displaying it", async () => {
  const c = await as(f.chair, () => createBodyCharter(f.chair, f.bodyId, { documentId: "DOC_D4", purpose: "Restrict this body to the current five voting members", rules: { ...charterFixtureRules, maximumVotingMembers: 5 } }, ctx));
  let cr: string | undefined;
  try {
   await as(f.chair, () => commandBodyCharter(f.chair, f.bodyId, c.id, { command: "SUBMIT", expectedRevision: 1, note: "Review maximum membership" }, ctx));
   cr = await concludedCharterBallot(c.id); await as(f.chair, () => decideResolutionClosure(f.chair, { resolutionId: cr! }, ctx));
   await as(f.secretary, () => commandBodyCharter(f.secretary, f.bodyId, c.id, { command: "ADOPT", expectedRevision: 2, note: "Independent adoption of bounded membership", resolutionId: cr }, ctx));
   const a = await create(), r = await appointmentBallot(a.id, f.chair);
   await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r }); await command(a.id, "ACCEPT", 2, f.candidate);
   await expect(command(a.id, "ACTIVATE", 3)).rejects.toHaveProperty("code", "RULE_VIOLATION");
  } finally { await cleanupCharters([c.id], cr ? [cr] : []); }
 });
 it("fails closed on an unchartered legacy body at the new authority boundary", async () => {
  const a = await create(), r = await appointmentBallot(a.id, f.chair);
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r }); await command(a.id, "ACCEPT", 2, f.candidate);
  // Isolated administrator fixture transaction only: rollback restores the charter.
  await expect(db.transaction(async (tx) => {
   const charters = await tx.select().from(governanceCharters).where(eq(governanceCharters.bodyId, f.bodyId));
   for (const c of charters) { await tx.delete(governanceCharterTerms).where(eq(governanceCharterTerms.id, c.id)); await tx.delete(governanceCharters).where(eq(governanceCharters.id, c.id)); }
   await command(a.id, "ACTIVATE", 3);
  })).rejects.toMatchObject({ code: "RULE_VIOLATION", message: expect.stringContaining("adopted, readable charter") });
  expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, a.id)))[0].status).toBe("ACCEPTED");
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.partyId, f.candidate.partyId!))).toHaveLength(0);
 });
 it("serializes consent and never grants RBAC or a seat merely on approval/consent", async () => {
  const before = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.candidate.userId));
  const a = await create(); const r = await appointmentBallot(a.id, f.chair);
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r });
  const attempts = await Promise.allSettled([command(a.id, "ACCEPT", 2, f.candidate), command(a.id, "ACCEPT", 2, f.candidate)]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(attempts.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.partyId, f.candidate.partyId!))).toHaveLength(0);
  const active = await command(a.id, "ACTIVATE", 3);
  expect(active.status).toBe("ACTIVE");
  expect((await db.select().from(governanceMembers).where(eq(governanceMembers.id, active.memberId!)))[0]).toMatchObject({ partyId: f.candidate.partyId, votingRights: true, retiredOn: "2030-12-31" });
  expect(await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.candidate.userId))).toEqual(before);
  const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id)); expect(events).toHaveLength(4); expect(events.find((e) => e.type === "GOVERNANCE_MEMBERSHIP_ACTIVATED")?.causationId).toBeTruthy();
  expect((await db.select().from(notifications).where(eq(notifications.userId, f.candidate.userId))).some((n) => n.linkHref?.includes(a.id))).toBe(true);
  expect((await verifyAuditChain()).verified).toBe(true); expect((await verifyEventChain()).verified).toBe(true);
 });
 it("blocks overlapping membership after a fresh independent approval and consent", async () => {
  const a = await create(); const r = await appointmentBallot(a.id, f.chair);
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r }); await command(a.id, "ACCEPT", 2, f.candidate);
  await expect(command(a.id, "ACTIVATE", 3)).rejects.toHaveProperty("code", "RULE_VIOLATION");
  expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, a.id)))[0].status).toBe("ACCEPTED");
 });
 it("preserves 0048 direct self-appointment denial", async () => {
  await expect(as(f.chair, () => db.execute(sql`insert into governance_members(id,body_id,party_id,seat_role,appointed_on) values('FORGED_APPT',${f.bodyId},${f.candidate.partyId},'CHAIR',CURRENT_DATE)`))).rejects.toMatchObject({ cause: { code: "42501" } });
 });
});
