import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { db } from "../../src/db";
import { auditLog, enterpriseEvents, governanceAppointments, governanceMembers, roleAssignments } from "../../src/db/schema";
import { commandAppointment, nominateMember } from "../../src/lib/governance/appointment-service";
import { appointmentBallot, appointmentFixture, appointmentInput, asAppointmentActor as as, cleanupAppointments } from "../helpers/appointments";
import { withReboundAppointmentActors } from "../helpers/appointment-identity";
const ctx = { traceId: "APPOINTMENT_ORIGIN_TEST" };
let f: Awaited<ReturnType<typeof appointmentFixture>>, runtime: Client;
const create = (extra = {}) => as(f.chair, () => nominateMember(f.chair, f.bodyId, appointmentInput(f.candidate.userId, extra), ctx));
const command = (id: string, name: string, revision: number, p = f.secretary, extra = {}) => as(p, () => commandAppointment(p, f.bodyId, id, { command: name, expectedRevision: revision, note: "Verify immutable original human provenance", ...extra }, ctx));
async function scoped(actor: string, fn: () => Promise<void>) {
 await runtime.query("begin");
 try {
  await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_actions_read','on',true),set_config('beyu.governance_entity_ids','',true),set_config('beyu.governance_classifications','PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED',true),set_config('beyu.governance_appointment_actor',$2,true)`, [f.chair.tenantId, actor]);
  await fn();
 } finally { await runtime.query("rollback"); }
}
beforeAll(async () => {
 await cleanupAppointments("APPT_ORIGIN"); f = await appointmentFixture("APPT_ORIGIN");
 if (!process.env.BEYU_RUNTIME_DATABASE_URL) throw Error("Actual runtime DSN required");
 runtime = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL }); await runtime.connect();
 expect((await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
});
afterAll(async () => { if (runtime) await runtime.end(); await cleanupAppointments("APPT_ORIGIN"); });
describe("immutable appointment human provenance", () => {
 it("snapshots both original people without granting membership or RBAC", async () => {
  const before = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.candidate.userId));
  const a = await create(); expect(a).toMatchObject({ nominatedByPartyId: f.chair.partyId, approvedByPartyId: null });
  const r = await appointmentBallot(a.id, f.chair);
  const approved = await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r });
  expect(approved).toMatchObject({ nominatedByPartyId: f.chair.partyId, approvedByPartyId: f.secretary.partyId });
  const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id));
  expect(events).toHaveLength(2); expect(events[1].payload).toMatchObject({ nominatedByPartyId: f.chair.partyId, approvedByPartyId: f.secretary.partyId });
  expect((await db.select().from(auditLog).where(eq(auditLog.objectId, a.id)))).toHaveLength(2);
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.partyId, f.candidate.partyId!))).toHaveLength(0);
  expect(await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.candidate.userId))).toEqual(before);
 });
 it("rejects caller-supplied party provenance", async () => {
  await expect(create({ nominatedByPartyId: f.secretary.partyId })).rejects.toThrow();
  await expect(create({ approvedByPartyId: f.secretary.partyId })).rejects.toThrow();
 });
 it("does not let the original nominating person approve through another account after rebinding", async () => {
  const a = await create(), r = await appointmentBallot(a.id, f.chair);
  const before = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id));
  await withReboundAppointmentActors(f, async () => {
   await expect(command(a.id, "APPROVE", 1, { ...f.secretary, partyId: f.chair.partyId }, { resolutionId: r })).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("nominating person") });
  });
  expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, a.id)))[0]).toEqual(a);
  expect(await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id))).toEqual(before);
  // The unchanged intention can still be approved by the genuine independent person.
  expect((await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r })).approvedByPartyId).toBe(f.secretary.partyId);
 });
 it.each([null, "forged-party"])("SQL rejects missing or forged nomination provenance: %s", async (party) => {
  const a = await create();
  await scoped(f.chair.userId, async () => {
   await expect(runtime.query(`insert into governance_appointments select (jsonb_populate_record(null::governance_appointments,to_jsonb(a)||$2::jsonb)).* from governance_appointments a where id=$1`, [a.id, JSON.stringify({ id: `${a.id}_FORGED`, nominated_by_party_id: party })])).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("Original nominating party") });
  });
 });
 it("SQL rejects rebinding-based self-approval independently of the service", async () => {
  const a = await create(), r = await appointmentBallot(a.id, f.chair);
  await withReboundAppointmentActors(f, async () => scoped(f.secretary.userId, async () => {
   await expect(runtime.query(`update governance_appointments set status='APPROVED',revision=2,resolution_id=$2,approved_by_user_id=$3,approved_by_party_id=$4 where id=$1`, [a.id, r, f.secretary.userId, f.chair.partyId])).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("original nominating party") });
  }));
 });
 it("SQL accepts correctly snapshotted independent approval, but never a provenance rewrite", async () => {
  const a = await create(), r = await appointmentBallot(a.id, f.chair);
  await scoped(f.secretary.userId, async () => {
   const approved = await runtime.query(`update governance_appointments set status='APPROVED',revision=2,resolution_id=$2,approved_by_user_id=$3,approved_by_party_id=$4 where id=$1 returning nominated_by_party_id,approved_by_party_id`, [a.id, r, f.secretary.userId, f.secretary.partyId]);
   expect(approved.rows).toEqual([{ nominated_by_party_id: f.chair.partyId, approved_by_party_id: f.secretary.partyId }]);
  });
  await scoped(f.secretary.userId, async () => {
   await expect(runtime.query(`update governance_appointments set status='APPROVED',revision=2,resolution_id=$2,approved_by_user_id=$3,approved_by_party_id=$4,nominated_by_party_id=$5 where id=$1`, [a.id, r, f.secretary.userId, f.secretary.partyId, f.candidate.partyId])).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("Immutable appointment party") });
  });
 });
 it("SQL preserves original approval identity during nominee consent", async () => {
  const a = await create(), r = await appointmentBallot(a.id, f.chair);
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r });
  await scoped(f.candidate.userId, async () => {
   await expect(runtime.query(`update governance_appointments set status='ACCEPTED',revision=3,accepted_at=now(),approved_by_party_id=$2 where id=$1`, [a.id, f.chair.partyId])).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("Immutable appointment party") });
  });
  const accepted = await command(a.id, "ACCEPT", 2, f.candidate);
  expect(accepted.approvedByPartyId).toBe(f.secretary.partyId);
 });
 it.each(["nominating", "approving"])("missing historical %s provenance cannot progress, but a nominee may decline", async (missing) => {
  const a = await create(), r = await appointmentBallot(a.id, f.chair);
  await command(a.id, "APPROVE", 1, f.secretary, { resolutionId: r });
  // Emulate a legacy row in a disposable transaction only. Actual predecessor replay
  // is independently covered by the migration test, without disabling its guards.
  await expect(db.transaction(async (tx) => {
   await tx.execute(sql`alter table governance_appointments disable trigger governance_appointment_origin_guard`);
   await tx.execute(sql`select set_config('beyu.governance_appointment_actor', ${f.candidate.userId}, true)`);
   await tx.update(governanceAppointments).set({ ...(missing === "nominating" ? { nominatedByPartyId: null } : { approvedByPartyId: null }), status: "ACCEPTED", revision: 3, acceptedAt: new Date() }).where(eq(governanceAppointments.id, a.id));
   await tx.execute(sql`set constraints all immediate`);
   await tx.execute(sql`alter table governance_appointments enable trigger governance_appointment_origin_guard`);
   await expect(command(a.id, "ACTIVATE", 3)).rejects.toMatchObject({ code: "RULE_VIOLATION", message: expect.stringContaining(`Original ${missing} party is unknown`) });
   expect((await command(a.id, "DECLINE", 3, f.candidate)).status).toBe("DECLINED");
   throw Error("rollback isolated legacy fixture");
  })).rejects.toThrow("rollback isolated legacy fixture");
 });
});
