import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { apiPost, apiGetJson, login, serverAvailable } from "../helpers/http";
import { charterFixtureRules, concludedCharterBallot, cleanupCharters } from "../helpers/charters";
const available = await serverAvailable(); const ids: string[] = [], decisions: string[] = [];
let chair: string, secretary: string;
const path = "/api/v1/governance/bodies/GOV_GROUP_BOARD/charters";
const payload = { documentId: "DOC_D4", purpose: "Governed board terms, composition and voting requirements", rules: charterFixtureRules };
type Result = { data: { id: string; revision: number; status: string }; error?: { code: string } };
beforeAll(async () => { if (available) { chair = await login("ceo@beyu.os"); secretary = await login("governance@beyu.os"); } }, 120000);
afterAll(() => cleanupCharters(ids, decisions));
describe.skipIf(!available)("charter HTTP security boundary", () => {
 it("requires authentication and rejects client identity/state", async () => {
  expect((await apiGetJson(path)).status).toBe(401);
  expect((await apiPost(path, payload)).status).toBe(401);
  expect((await apiPost(path, { ...payload, status: "ADOPTED", createdByUserId: "USR_AMANI_BEYU" }, { cookie: chair })).status).toBe(422);
 });
 it("replays creation exactly once and rejects changed intent", async () => {
  const key = crypto.randomUUID(); const a = await apiPost<Result>(path, payload, { cookie: chair, idempotencyKey: key });
  expect(a.status, JSON.stringify(a.body)).toBe(201); ids.push(a.body.data.id);
  const b = await apiPost<Result>(path, payload, { cookie: chair, idempotencyKey: key }); expect(b.body.data.id).toBe(a.body.data.id);
  expect((await apiPost(path, { ...payload, purpose: "A different charter intention" }, { cookie: chair, idempotencyKey: key })).status).toBe(409);
 });
 it("adopts only after review, actual linked decision and independent human action", async () => {
  const created = await apiPost<Result>(path, payload, { cookie: chair }); expect(created.status).toBe(201); const id = created.body.data.id; ids.push(id);
  const cmd = (command: string, expectedRevision: number, cookie: string, extra = {}) => apiPost<Result>(`${path}/${id}`, { command, expectedRevision, note: "Reviewed the scoped charter version", ...extra }, { cookie, idempotencyKey: crypto.randomUUID() });
  expect((await cmd("SUBMIT", 1, chair)).status).toBe(200);
  expect((await cmd("SUBMIT", 1, chair)).status).toBe(409);
  const resolutionId = await concludedCharterBallot(id); decisions.push(resolutionId);
  const premature = await cmd("ADOPT", 2, secretary, { resolutionId });
  expect(premature.status).toBe(422); expect(premature.body.error?.code).toBe("GOVERNANCE_NOT_SATISFIED");
  const decision = await apiPost(`/api/v1/governance/resolutions/${resolutionId}/decision`, {}, { cookie: chair }); expect(decision.status, JSON.stringify(decision.body)).toBe(200);
  expect((await cmd("ADOPT", 2, chair, { resolutionId })).status).toBe(403);
  const adopted = await cmd("ADOPT", 2, secretary, { resolutionId }); expect(adopted.status, JSON.stringify(adopted.body)).toBe(200); expect(adopted.body.data.status).toBe("ADOPTED");
  expect((await cmd("SUBMIT", 3, chair)).status).toBe(422);
 });
});
