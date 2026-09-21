import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceMembers, governanceAppointments, idempotencyRecords, users } from "../../src/db/schema";
import { apiPost, login, serverAvailable } from "../helpers/http";
import { appointmentFixture, appointmentInput, appointmentBallot, cleanupAppointments } from "../helpers/appointments";
import { withReboundAppointmentActors } from "../helpers/appointment-identity";
const available = await serverAvailable(); let f: Awaited<ReturnType<typeof appointmentFixture>>, chair: string, secretary: string, candidate: string;
type Result = { data: { id: string; status: string; memberId: string }; error?: { message: string } };
const path = () => `/api/v1/governance/bodies/${f.bodyId}/appointments`;
describe.skipIf(!available)("appointment actual HTTP authority boundary", () => {
 beforeAll(async () => { await cleanupAppointments("APPT_HTTP"); f = await appointmentFixture("APPT_HTTP"); chair = await login(f.chair.email); secretary = await login(f.secretary.email); candidate = await login(f.candidate.email); }, 120000);
 afterAll(() => cleanupAppointments("APPT_HTTP"));
 it("denies unauthenticated and forged state requests", async () => {
  expect((await apiPost(path(), appointmentInput(f.candidate.userId))).status).toBe(401);
  expect((await apiPost(path(), appointmentInput(f.candidate.userId, { status: "ACTIVE" }), { cookie: chair })).status).toBe(422);
 });
 it("releases a known rolled-back nomination denial for an unchanged retry", async () => {
  const key = crypto.randomUUID(), input = appointmentInput(f.candidate.userId);
  await db.update(users).set({ isServiceAccount: true }).where(eq(users.id, f.candidate.userId));
  try {
   const denied = await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key });
   expect(denied.status, JSON.stringify(denied.body)).toBe(422);
   expect(denied.body.error?.message).toContain("active human nominee");
  } finally { await db.update(users).set({ isServiceAccount: false }).where(eq(users.id, f.candidate.userId)); }
  const created = await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const replay = await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key });
  expect(replay.status).toBe(201); expect(replay.body.data).toEqual(created.body.data);
 });
 it("denies rebinding-based self-approval with a real authenticated HTTP session", async () => {
  const a = await apiPost<Result>(path(), appointmentInput(f.candidate.userId), { cookie: chair, idempotencyKey: crypto.randomUUID() });
  expect(a.status, JSON.stringify(a.body)).toBe(201);
  const resolutionId = await appointmentBallot(a.body.data.id, f.chair);
  const key = crypto.randomUUID();
  const intention = { command: "APPROVE", expectedRevision: 1, resolutionId, note: "Original nominator cannot approve through another account" };
  await withReboundAppointmentActors(f, async () => {
   const denied = await apiPost<Result>(`${path()}/${a.body.data.id}`, intention, { cookie: secretary, idempotencyKey: key });
   expect(denied.status, JSON.stringify(denied.body)).toBe(403);
   expect(denied.body.error?.message).toContain("nominating person");
   expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, a.body.data.id)))[0]).toMatchObject({ status: "NOMINATED", revision: 1, nominatedByPartyId: f.chair.partyId, approvedByPartyId: null });
  });
  const approved = await apiPost<Result>(`${path()}/${a.body.data.id}`, intention, { cookie: secretary, idempotencyKey: key });
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  const replay = await apiPost<Result>(`${path()}/${a.body.data.id}`, intention, { cookie: secretary, idempotencyKey: key });
  expect(replay.status).toBe(200); expect(replay.body.data).toEqual(approved.body.data);
 });
 it("keeps an unknown SQL failure in flight rather than automatically executing a second nomination", async () => {
  const key = crypto.randomUUID(), input = appointmentInput(f.candidate.userId);
  const before = await db.select().from(governanceAppointments).where(eq(governanceAppointments.bodyId, f.bodyId));
  await db.execute(sql`create function test_appt_origin_unknown_failure() returns trigger language plpgsql as $$ begin if NEW.body_id='GOV_APPT_HTTP' then raise exception 'Disposable unknown appointment failure'; end if; return NEW; end $$`);
  await db.execute(sql`create trigger test_appt_origin_unknown_failure after insert on governance_appointments for each row execute function test_appt_origin_unknown_failure()`);
  try {
   const failed = await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key });
   expect(failed.status, JSON.stringify(failed.body)).toBe(500);
  } finally {
   await db.execute(sql`drop trigger test_appt_origin_unknown_failure on governance_appointments`);
   await db.execute(sql`drop function test_appt_origin_unknown_failure()`);
  }
  try {
   const blocked = await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key });
   expect(blocked.status, JSON.stringify(blocked.body)).toBe(409);
   expect(blocked.body.error?.message).toContain("currently being processed");
   expect(await db.select().from(governanceAppointments).where(eq(governanceAppointments.bodyId, f.bodyId))).toEqual(before);
   expect((await db.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.idempotencyKey, key), eq(idempotencyRecords.actorUserId, f.chair.userId))))[0].state).toBe("IN_FLIGHT");
  } finally {
   // Fixture cleanup only; production requires reconciliation, never auto-reclaim.
   await db.delete(idempotencyRecords).where(and(eq(idempotencyRecords.idempotencyKey, key), eq(idempotencyRecords.actorUserId, f.chair.userId)));
  }
 });
 it("deduplicates nomination and requires independent approval, actual nominee consent and fresh activation", async () => {
  const key = crypto.randomUUID(), input = appointmentInput(f.candidate.userId);
  const a = await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key }); expect(a.status, JSON.stringify(a.body)).toBe(201);
  const retry = await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key }); expect(retry.body.data.id).toBe(a.body.data.id);
  expect((await apiPost(path(), { ...input, rationale: "A different appointment intention entirely" }, { cookie: chair, idempotencyKey: key })).status).toBe(409);
  const r = await appointmentBallot(a.body.data.id, f.chair);
  const command = (command: string, expectedRevision: number, cookie: string, extra = {}) => apiPost<Result>(`${path()}/${a.body.data.id}`, { command, expectedRevision, note: "Reviewed the appointment instrument and eligibility", ...extra }, { cookie, idempotencyKey: crypto.randomUUID() });
  expect((await command("APPROVE", 1, chair, { resolutionId: r })).status).toBe(403);
  const approved = await command("APPROVE", 1, secretary, { resolutionId: r }); expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  expect((await command("ACCEPT", 2, secretary)).status).toBe(403);
  expect((await command("ACCEPT", 2, candidate)).status).toBe(200);
  expect((await command("ACTIVATE", 3, candidate)).status).toBe(403);
  const active = await command("ACTIVATE", 3, secretary); expect(active.status, JSON.stringify(active.body)).toBe(200);
  expect((await db.select().from(governanceMembers).where(eq(governanceMembers.id, active.body.data.memberId)))[0].partyId).toBe(f.candidate.partyId);
 });
});
