import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodies, governanceMembers, governanceAppointments } from "../../src/db/schema";
import { apiPost, login, serverAvailable } from "../helpers/http";
import { appointmentInput, appointmentBallot } from "../helpers/appointments";
import { initialAppointmentFixture } from "../helpers/initial-appointments";
import { cleanupEstablishments } from "../helpers/establishments";
const available = await serverAvailable();
let f: Awaited<ReturnType<typeof initialAppointmentFixture>>, chair: string, secretary: string, candidate: string;
type Result = { data: { id: string; status: string; authorityBodyId: string; initialCharterId: string } };
const path = () => `/api/v1/governance/bodies/${f.childId}/appointments`;
describe.skipIf(!available)("initial appointments actual HTTP", () => {
 beforeAll(async () => { await cleanupEstablishments("INITIAL_APPT_HTTP"); f = await initialAppointmentFixture("INITIAL_APPT_HTTP"); chair = await login(f.chair.email); secretary = await login(f.secretary.email); candidate = await login(f.candidate.email); }, 120000);
 afterAll(() => cleanupEstablishments("INITIAL_APPT_HTTP"));
 it("denies anonymous, non-presider and caller-selected authority", async () => {
  const input = appointmentInput(f.candidate.userId);
  expect((await apiPost(path(), input)).status).toBe(401);
  expect((await apiPost(path(), input, { cookie: candidate })).status).toBe(403);
  for (const extra of [{ authorityBodyId: f.childId }, { initialCharterId: f.initialCharterId }, { status: "ACTIVE" }]) expect((await apiPost(path(), { ...input, ...extra }, { cookie: chair })).status).toBe(422);
 });
 it("prepares consent with the exact superior decision, never partial membership activation", async () => {
  const input = appointmentInput(f.candidate.userId), key = crypto.randomUUID();
  const a = await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key }); expect(a.status, JSON.stringify(a.body)).toBe(201);
  expect(a.body.data).toMatchObject({ authorityBodyId: f.bodyId, initialCharterId: f.initialCharterId, status: "NOMINATED" });
  expect((await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key })).body.data.id).toBe(a.body.data.id);
  const resolutionId = await appointmentBallot(a.body.data.id, f.chair);
  const command = (command: string, revision: number, cookie: string, extra = {}) => apiPost<Result>(`${path()}/${a.body.data.id}`, { command, expectedRevision: revision, note: "Initial appointment consent is not operational authority", ...extra }, { cookie, idempotencyKey: crypto.randomUUID() });
  expect((await command("APPROVE", 1, chair, { resolutionId })).status).toBe(403);
  const approved = await command("APPROVE", 1, secretary, { resolutionId }); expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  expect((await command("ACCEPT", 2, secretary)).status).toBe(403);
  expect((await command("ACCEPT", 2, candidate)).status).toBe(200);
  expect((await command("ACTIVATE", 3, secretary)).status).toBe(422);
  expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, a.body.data.id)))[0]).toMatchObject({ status: "ACCEPTED", memberId: null });
  expect((await db.select().from(governanceBodies).where(eq(governanceBodies.id, f.childId)))[0].status).toBe("DRAFT");
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, f.childId))).toHaveLength(0);
 });
});
