import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { apiPost, login, serverAvailable } from "../helpers/http";
import { establishmentFixture, establishmentInput, establishmentBallot, cleanupEstablishments } from "../helpers/establishments";
const available = await serverAvailable(); let f: Awaited<ReturnType<typeof establishmentFixture>>, chair: string, secretary: string, outsider: string;
type Result = { data: { id: string; status: string; bodyId: string }; error?: { message: string } };
const path = () => `/api/v1/governance/bodies/${f.bodyId}/establishments`;
describe.skipIf(!available)("body establishment HTTP authority boundary", () => {
 beforeAll(async () => { await cleanupEstablishments("ESTABLISH_HTTP"); f = await establishmentFixture("ESTABLISH_HTTP"); chair = await login(f.chair.email); secretary = await login(f.secretary.email); outsider = await login(f.candidate.email); }, 120000);
 afterAll(() => cleanupEstablishments("ESTABLISH_HTTP"));
 it("denies unauthenticated, non-presiding and client-forged authority", async () => {
  expect((await apiPost(path(), establishmentInput())).status).toBe(401);
  expect((await apiPost(path(), establishmentInput(), { cookie: outsider, idempotencyKey: crypto.randomUUID() })).status).toBe(403);
  expect((await apiPost(path(), establishmentInput({ status: "ACTIVE" }), { cookie: chair, idempotencyKey: crypto.randomUUID() })).status).toBe(422);
 });
 it("requires a superior decision and independent approval, with idempotent canonical establishment", async () => {
  const input = establishmentInput(), key = crypto.randomUUID();
  const a = await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key }); expect(a.status, JSON.stringify(a.body)).toBe(201);
  expect((await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key })).body.data.id).toBe(a.body.data.id);
  const command = (command: string, expectedRevision: number, cookie: string, extra = {}, idempotencyKey = crypto.randomUUID()) => apiPost<Result>(`${path()}/${a.body.data.id}`, { command, expectedRevision, note: "Independent review of the superior constitutional instrument", ...extra }, { cookie, idempotencyKey });
  expect((await command("SUBMIT", 1, chair)).status).toBe(200);
  const resolutionId = await establishmentBallot(a.body.data.id, f.chair);
  expect((await command("APPROVE", 2, chair, { resolutionId })).status).toBe(403);
  expect((await command("APPROVE", 2, secretary, { resolutionId })).status).toBe(200);
  const establishKey = crypto.randomUUID(), result = await command("ESTABLISH", 3, secretary, {}, establishKey); expect(result.status, JSON.stringify(result.body)).toBe(200); expect(result.body.data.status).toBe("ESTABLISHED");
  const retry = await command("ESTABLISH", 3, secretary, {}, establishKey); expect(retry.body.data.bodyId).toBe(result.body.data.bodyId);
 });
});
