import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { resolutions, resolutionVotes } from "../../src/db/schema";
import { executionPrincipal } from "../helpers/governance-execution";
import { baseUrl, login, serverAvailable } from "../helpers/http";
const available = await serverAvailable();
const id = "RES_SIMULATION_HTTP"; let cookie: string;
const call = (body: string, session: string | null = cookie) => fetch(`${baseUrl()}/api/v1/governance/resolutions/${id}/simulation`, { method: "POST", headers: { "content-type": "application/json", ...(session ? { Cookie: session } : {}) }, body });
describe.skipIf(!available)("read-only simulation HTTP", () => {
 beforeAll(async () => {
  const p = await executionPrincipal(); cookie = await login("ceo@beyu.os");
  await db.insert(resolutions).values({ id, reference: id, tenantId: p.tenantId, bodyId: "GOV_GROUP_BOARD", title: "HTTP simulation", category: "POLICY", summary: "test", rationale: "test", dataBasis: "test", consequences: "test", proposedBy: p.userId, requiredMajority: "SIMPLE", status: "TABLED", classification: "RESTRICTED" });
 }, 120000);
 afterAll(async () => { await db.delete(resolutionVotes).where(eq(resolutionVotes.resolutionId, id)); await db.delete(resolutions).where(eq(resolutions.id, id)); });
 it("requires authentication", async () => { expect((await call("{}", null)).status).toBe(401); });
 it("rejects malformed JSON, unknown authority fields and ineligible ballots", async () => {
  expect((await call("{")).status).toBe(422);
  expect((await call(JSON.stringify({ tenantId: "TEN_BEYU_TRUST", authorityGranted: true }))).status).toBe(422);
  expect((await call(JSON.stringify({ ballots: [{ memberId: "NOT_A_MEMBER", vote: "FOR" }] }))).status).toBe(422);
 });
 it("returns explicitly hypothetical results, not an approval or execution token", async () => {
  const response = await call("{}"); expect(response.status).toBe(200);
  const body = await response.json(); expect(body.data).toMatchObject({ authorityGranted: false, approvalGranted: false, executionPermitted: false, mode: "READ_ONLY_SIMULATION" });
  expect(body.data.limitations.length).toBeGreaterThan(0);
  expect(await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, id))).toHaveLength(0);
  expect((await db.select().from(resolutions).where(eq(resolutions.id, id)))[0].status).toBe("TABLED");
 });
});
