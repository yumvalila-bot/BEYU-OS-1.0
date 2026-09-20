import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { apiPost, login, serverAvailable } from "../helpers/http";
import { initialCharterFixture } from "../helpers/initial-charters";
import { cleanupEstablishments } from "../helpers/establishments";
import { charterFixtureRules, concludedCharterBallot } from "../helpers/charters";
const available = await serverAvailable(), prefix = "INITIAL_CHARTER_HTTP";
let f: Awaited<ReturnType<typeof initialCharterFixture>>, chair: string, secretary: string, outsider: string;
type Result = { data: { id: string; status: string; authorityBodyId: string } };
const path = () => `/api/v1/governance/bodies/${f.childId}/charters`;
const input = { documentId: "DOC_D4", purpose: "Initial charter needs superior approval and remains non-effective", rules: charterFixtureRules };
describe.skipIf(!available)("initial charter actual HTTP boundary", () => {
 beforeAll(async () => { await cleanupEstablishments(prefix); f = await initialCharterFixture(prefix); chair = await login(f.chair.email); secretary = await login(f.secretary.email); outsider = await login(f.candidate.email); }, 120000);
 afterAll(() => cleanupEstablishments(prefix));
 it("denies anonymous, non-presider and caller-selected superior/state", async () => {
  expect((await apiPost(path(), input)).status).toBe(401);
  expect((await apiPost(path(), input, { cookie: outsider })).status).toBe(403);
  for (const extra of [{ status: "ADOPTED" }, { authorityBodyId: f.childId }, { createdByPartyId: f.secretary.partyId }]) expect((await apiPost(path(), { ...input, ...extra }, { cookie: chair })).status).toBe(422);
 });
 it("replays superior approval without making the charter effective", async () => {
  const key = crypto.randomUUID(); const a = await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key }); expect(a.status, JSON.stringify(a.body)).toBe(201);
  expect(a.body.data.authorityBodyId).toBe(f.bodyId);
  expect((await apiPost<Result>(path(), input, { cookie: chair, idempotencyKey: key })).body.data.id).toBe(a.body.data.id);
  const id = a.body.data.id, cmd = (command: string, expectedRevision: number, cookie: string, extra = {}, idempotencyKey = crypto.randomUUID()) => apiPost<Result>(`${path()}/${id}`, { command, expectedRevision, note: "Independent superior initial charter review", ...extra }, { cookie, idempotencyKey });
  expect((await cmd("SUBMIT", 1, chair)).status).toBe(200);
  const resolutionId = await concludedCharterBallot(id);
  expect((await cmd("ADOPT", 2, secretary, { resolutionId })).status).toBe(422);
  expect((await apiPost(`/api/v1/governance/resolutions/${resolutionId}/decision`, {}, { cookie: chair })).status).toBe(200);
  expect((await cmd("ADOPT", 2, chair, { resolutionId })).status).toBe(403);
  const approvalKey = crypto.randomUUID(); const result = await cmd("ADOPT", 2, secretary, { resolutionId }, approvalKey);
  expect(result.status, JSON.stringify(result.body)).toBe(200); expect(result.body.data.status).toBe("APPROVED");
  expect((await cmd("ADOPT", 2, secretary, { resolutionId }, approvalKey)).body.data.status).toBe("APPROVED");
 });
});
