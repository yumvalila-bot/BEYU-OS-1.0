import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceMembers, governanceAppointments } from "../../src/db/schema";
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
 it("denies rebinding-based self-approval with a real authenticated HTTP session", async () => {
  const a = await apiPost<Result>(path(), appointmentInput(f.candidate.userId), { cookie: chair, idempotencyKey: crypto.randomUUID() });
  expect(a.status, JSON.stringify(a.body)).toBe(201);
  const resolutionId = await appointmentBallot(a.body.data.id, f.chair);
  await withReboundAppointmentActors(f, async () => {
   const denied = await apiPost<Result>(`${path()}/${a.body.data.id}`, { command: "APPROVE", expectedRevision: 1, resolutionId, note: "Original nominator cannot approve through another account" }, { cookie: secretary, idempotencyKey: crypto.randomUUID() });
   expect(denied.status, JSON.stringify(denied.body)).toBe(403);
   expect(denied.body.error?.message).toContain("nominating person");
   expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, a.body.data.id)))[0]).toMatchObject({ status: "NOMINATED", revision: 1, nominatedByPartyId: f.chair.partyId, approvedByPartyId: null });
  });
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
