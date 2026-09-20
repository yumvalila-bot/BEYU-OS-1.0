import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../../src/db";
import { enterpriseEvents, roleAssignments } from "../../src/db/schema";
import { apiPost, apiGetJson, login, serverAvailable } from "../helpers/http";
import { executionPrincipal, executionResolution, cleanupExecution } from "../helpers/governance-execution";
const available = await serverAvailable();
let chair = "", secretary = "", resolutionId = "";
const payload = () => ({ title: "HTTP governed implementation action", description: "Verify evidence, identity, replay and separation of duties", priority: "NORMAL", dueAt: new Date(Date.now() + 86400000).toISOString() });
const createPath = () => `/api/v1/governance/resolutions/${resolutionId}/actions`;
type Envelope = { data: { id: string; status: string; version: number }; error?: { code: string } };
beforeAll(async () => {
  if (!available) return;
  await cleanupExecution("GEXHTTP");
  resolutionId = await executionResolution(await executionPrincipal(), "GEXHTTP");
  chair = await login("ceo@beyu.os"); secretary = await login("governance@beyu.os");
}, 120000);
afterAll(async () => { if (available) await cleanupExecution("GEXHTTP"); });
describe.skipIf(!available)("governance actions — actual HTTP boundary", () => {
  it("requires authentication for reads and writes", async () => {
    expect((await apiPost(createPath(), payload())).status).toBe(401);
    expect((await apiGetJson(createPath())).status).toBe(401);
  });
  it.each([{ tenantId: "TEN_BEYU_FINTECH" }, { status: "CLOSED" }, { createdByUserId: "USR_GRACE_KILELE" }])("rejects client-controlled authority %j", async (forgery) => {
    expect((await apiPost(createPath(), { ...payload(), ...forgery }, { cookie: chair })).status).toBe(422);
  });
  it("uses idempotency for exactly one mandate and rejects key substitution", async () => {
    const body = payload(); const key = randomUUID();
    const first = await apiPost<Envelope>(createPath(), body, { cookie: chair, idempotencyKey: key });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const replay = await apiPost<Envelope>(createPath(), body, { cookie: chair, idempotencyKey: key });
    expect(replay.status).toBe(201); expect(replay.body.data.id).toBe(first.body.data.id);
    const conflict = await apiPost(createPath(), { ...body, title: "Changed mandate" }, { cookie: chair, idempotencyKey: key });
    expect(conflict.status).toBe(409);
    const events = await db.select().from(enterpriseEvents).where(and(eq(enterpriseEvents.subjectId, first.body.data.id), eq(enterpriseEvents.type, "GOVERNANCE_ACTION_CREATED")));
    expect(events).toHaveLength(1);
  });
  it("reauthorizes source scope before returning a stored idempotent response", async () => {
    const key = randomUUID(); const body = payload();
    const created = await apiPost<Envelope>(createPath(), body, { cookie: chair, idempotencyKey: key }); expect(created.status).toBe(201);
    const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, "USR_AMANI_BEYU"));
    try {
      await db.update(roleAssignments).set({ legalEntityId: "LEN_BEYU_TZ_HOLDING" }).where(eq(roleAssignments.userId, "USR_AMANI_BEYU"));
      expect((await apiPost(createPath(), body, { cookie: chair, idempotencyKey: key })).status).toBe(404);
    } finally { for (const grant of grants) await db.update(roleAssignments).set({ legalEntityId: grant.legalEntityId }).where(eq(roleAssignments.id, grant.id)); }
    expect((await apiPost<Envelope>(createPath(), body, { cookie: chair, idempotencyKey: key })).body.data.id).toBe(created.body.data.id);
  });
  it("executes evidence, independent verification and closure through authenticated requests", async () => {
    const created = await apiPost<Envelope>(createPath(), payload(), { cookie: chair, idempotencyKey: randomUUID() });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const path = `/api/v1/governance/actions/${id}`;
    const cmd = (command: string, expectedVersion: number, cookie = chair, extra = {}) => apiPost<Envelope>(path, {
      command, expectedVersion, note: "HTTP accountability and verification evidence", ...extra,
    }, { cookie, idempotencyKey: randomUUID() });
    expect((await cmd("ASSIGN", 1, chair, { assigneeUserId: "USR_AMANI_BEYU" })).status).toBe(200);
    expect((await cmd("START", 1)).status).toBe(409);
    expect((await cmd("START", 2, secretary)).status).toBe(403);
    expect((await cmd("START", 2)).status).toBe(200);
    expect((await cmd("COMPLETE", 3)).status).toBe(422);
    const evidence = await cmd("SUBMIT_EVIDENCE", 3, chair, { documentId: "DOC_D4" }); expect(evidence.status, JSON.stringify(evidence.body)).toBe(200);
    expect((await cmd("COMPLETE", 4)).status).toBe(200);
    expect((await cmd("VERIFY", 5)).status).toBe(403);
    expect((await cmd("CLOSE", 5, secretary)).status).toBe(422);
    expect((await cmd("VERIFY", 5, secretary)).status).toBe(200);
    expect((await cmd("CLOSE", 6)).body.data.status).toBe("CLOSED");
    const list = await apiGetJson<{ data: { id: string; status: string; evidence: unknown[] }[] }>(createPath(), { cookie: chair });
    expect(list.status).toBe(200); expect(list.body.data.find((a) => a.id === id)).toMatchObject({ status: "CLOSED", evidence: [expect.anything()] });
  });
});
