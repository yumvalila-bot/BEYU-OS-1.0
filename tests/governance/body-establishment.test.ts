import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { constitutionArticles, governanceBodies, governanceBodyEstablishments, governanceMembers, governanceCapabilityRegistry, roleAssignments, enterpriseEvents, documents } from "../../src/db/schema";
import { proposeBodyEstablishment, commandBodyEstablishment, listBodyEstablishments } from "../../src/lib/governance/establishment-service";
import { nominateMember } from "../../src/lib/governance/appointment-service";
import { establishmentFixture, establishmentInput, establishmentBallot, cleanupEstablishments, asEstablishmentActor as as } from "../helpers/establishments";
import { createBodyCharter, commandBodyCharter } from "../../src/lib/governance/charter-service";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
import { concludedCharterBallot, charterFixtureRules } from "../helpers/charters";
import { appointmentInput } from "../helpers/appointments";
let f: Awaited<ReturnType<typeof establishmentFixture>>;
const prefix = "ESTABLISH_TEST", ctx = { traceId: "ESTABLISHMENT_TEST" };
beforeAll(async () => { await cleanupEstablishments(prefix); f = await establishmentFixture(prefix); });
afterAll(async () => { await cleanupEstablishments(prefix); await db.execute(sql`delete from documents where id='DOC_ESTABLISH_PRIVATE'`); });
const create = (extra = {}, p = f.chair) => as(p, () => proposeBodyEstablishment(p, f.bodyId, establishmentInput(extra), ctx));
const command = (id: string, command: string, expectedRevision: number, extra = {}, p = f.secretary) => as(p, () => commandBodyEstablishment(p, f.bodyId, id, { command, expectedRevision, note: "Independent superior constitutional review", ...extra }, ctx));
async function reviewed(extra = {}) { const a = await create(extra); await command(a.id, "SUBMIT", 1, {}, f.chair); const resolutionId = await establishmentBallot(a.id, f.chair); return { a, resolutionId }; }
describe("superior-body establishment without automatic authority", () => {
 it("rejects client authority/scope/outcome and weaker voting rules", async () => {
  for (const extra of [{ status: "ACTIVE" }, { tenantId: "TEN_OTHER" }, { legalEntityId: "LEN_OTHER" }, { countryCode: "ZZ" }, { bodyType: "BOARD" }]) await expect(create(extra)).rejects.toThrow();
  await expect(create({ rules: { ...establishmentInput().rules, quorumMinimum: 1 } })).rejects.toHaveProperty("code", "RULE_VIOLATION");
 });
 it("requires an existing human superior seat, not just RBAC", async () => { await expect(create({}, f.candidate)).rejects.toHaveProperty("code", "FORBIDDEN"); });
 it("requires a proposal-specific reserved-matter decision and independent approval", async () => {
  const { a, resolutionId } = await reviewed();
  await expect(command(a.id, "APPROVE", 2, { resolutionId }, f.chair)).rejects.toHaveProperty("code", "FORBIDDEN");
  const other = await create(); await command(other.id, "SUBMIT", 1);
  await expect(command(other.id, "APPROVE", 2, { resolutionId })).rejects.toHaveProperty("code", "RULE_VIOLATION");
  const wrongCategory = await establishmentBallot(other.id, f.chair, "POLICY");
  await expect(command(other.id, "APPROVE", 2, { resolutionId: wrongCategory })).rejects.toHaveProperty("code", "RULE_VIOLATION");
 });
 it("rejects expired superior authority at establishment", async () => {
  const { a, resolutionId } = await reviewed(); await command(a.id, "APPROVE", 2, { resolutionId });
  const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.secretary.userId));
  await db.update(roleAssignments).set({ effectiveTo: "2000-01-01" }).where(eq(roleAssignments.userId, f.secretary.userId));
  try { await expect(command(a.id, "ESTABLISH", 3)).rejects.toHaveProperty("code", "FORBIDDEN"); }
  finally { for (const g of grants) await db.update(roleAssignments).set({ effectiveTo: g.effectiveTo }).where(eq(roleAssignments.id, g.id)); }
 });
 it("rejects wrong-country instruments and changed instrument versions", async () => {
  const { a, resolutionId } = await reviewed(); await command(a.id, "APPROVE", 2, { resolutionId });
  const [doc] = await db.select().from(documents).where(eq(documents.id, a.documentId));
  await db.update(documents).set({ jurisdictionCode: "ZZ" }).where(eq(documents.id, doc.id));
  try { await expect(command(a.id, "ESTABLISH", 3)).rejects.toHaveProperty("code", "RULE_VIOLATION"); }
  finally { await db.update(documents).set({ jurisdictionCode: doc.jurisdictionCode }).where(eq(documents.id, doc.id)); }
  await db.update(documents).set({ version: "CHANGED" }).where(eq(documents.id, doc.id));
  try { await expect(command(a.id, "ESTABLISH", 3)).rejects.toHaveProperty("code", "RULE_VIOLATION"); }
  finally { await db.update(documents).set({ version: doc.version }).where(eq(documents.id, doc.id)); }
 });
 it("rolls back canonical body and event creation together", async () => {
  const { a, resolutionId } = await reviewed(); await command(a.id, "APPROVE", 2, { resolutionId });
  const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id));
  await expect(as(f.secretary, async () => { await commandBodyEstablishment(f.secretary, f.bodyId, a.id, { command: "ESTABLISH", expectedRevision: 3, note: "Abort the complete outer transaction" }, ctx); throw Error("Rollback establishment"); })).rejects.toThrow("Rollback establishment");
  expect(await db.select().from(governanceBodies).where(eq(governanceBodies.code, a.code))).toHaveLength(0);
  expect((await db.select().from(governanceBodyEstablishments).where(eq(governanceBodyEstablishments.id, a.id)))[0].status).toBe("APPROVED");
  expect(await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id))).toEqual(events);
 });
 it("serializes establishment and cannot self-activate, self-appoint, grant roles or duplicate bodies", async () => {
  const { a, resolutionId } = await reviewed(); await command(a.id, "APPROVE", 2, { resolutionId });
  const roles = await db.select().from(roleAssignments), capabilities = await db.select().from(governanceCapabilityRegistry);
  const attempts = await Promise.allSettled([command(a.id, "ESTABLISH", 3), command(a.id, "ESTABLISH", 3)]);
  expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1); expect(attempts.find((a) => a.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
  const [result] = await db.select().from(governanceBodyEstablishments).where(eq(governanceBodyEstablishments.id, a.id));
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, result.bodyId!));
  expect(body).toMatchObject({ code: a.code, status: "DRAFT", bodyType: "COMMITTEE", legalEntityId: "LEN_BEYU_HOLDINGS", tenantId: f.chair.tenantId, classification: a.classification });
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, body.id))).toHaveLength(0);
  expect(await db.select().from(roleAssignments)).toEqual(roles); expect(await db.select().from(governanceCapabilityRegistry)).toEqual(capabilities);
  await expect(as(f.secretary, () => nominateMember(f.secretary, body.id, appointmentInput(f.candidate.userId), ctx))).rejects.toHaveProperty("code", "FORBIDDEN");
  await expect(as(f.secretary, () => db.update(governanceBodies).set({ status: "ACTIVE" }).where(eq(governanceBodies.id, body.id)))).rejects.toMatchObject({ cause: { code: "42501" } });
  const duplicate = await reviewed({ code: a.code }); await command(duplicate.a.id, "APPROVE", 2, { resolutionId: duplicate.resolutionId });
  await expect(command(duplicate.a.id, "ESTABLISH", 3)).rejects.toHaveProperty("code", "CONFLICT");
  expect(await db.select().from(governanceBodies).where(eq(governanceBodies.code, a.code))).toHaveLength(1);
  const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, a.id)); expect(events).toHaveLength(4); expect(events.every((e) => e.correlationId === ctx.traceId)).toBe(true);
  expect(events.find((e) => e.type === "GOVERNANCE_BODY_ESTABLISHED")?.causationId).toBeTruthy();
 });
 it("does not expose classified proposal or canonical body identity to a lower-clearance reader", async () => {
  await db.execute(sql`insert into documents select (jsonb_populate_record(null::documents,to_jsonb(d)||'{"id":"DOC_ESTABLISH_PRIVATE","classification":"RESTRICTED"}'::jsonb)).* from documents d where id='DOC_D4'`);
  const { a, resolutionId } = await reviewed({ documentId: "DOC_ESTABLISH_PRIVATE" });
  await command(a.id, "APPROVE", 2, { resolutionId }); const established = await command(a.id, "ESTABLISH", 3);
  const low = { ...f.chair, clearance: "PUBLIC" as const };
  expect((await as(low, () => listBodyEstablishments(low, f.bodyId))).proposals.some((r) => r.id === a.id)).toBe(false);
  expect(await as(low, () => db.select().from(governanceBodies).where(eq(governanceBodies.id, established.bodyId!)))).toHaveLength(0);
  expect(await as(f.chair, () => db.select().from(governanceBodies).where(eq(governanceBodies.id, established.bodyId!)))).toHaveLength(1);
 });
 it("fails closed without the effective constitutional foundation", async () => {
  await expect(db.transaction(async (tx) => {
   await tx.update(constitutionArticles).set({ status: "SUSPENDED" }).where(eq(constitutionArticles.articleNo, 1));
   await create();
  })).rejects.toHaveProperty("code", "POLICY_DENIED");
 });
 it("requires the same adopted superior charter at execution, not a stale authority snapshot", async () => {
  const { a, resolutionId } = await reviewed(); await command(a.id, "APPROVE", 2, { resolutionId });
  const c = await as(f.chair, () => createBodyCharter(f.chair, f.bodyId, { documentId: "DOC_D4", purpose: "New superior charter requires review of outstanding establishment mandates", rules: charterFixtureRules }, ctx));
  await as(f.chair, () => commandBodyCharter(f.chair, f.bodyId, c.id, { command: "SUBMIT", expectedRevision: 1, note: "Review the new superior terms" }, ctx));
  const r = await concludedCharterBallot(c.id); await as(f.chair, () => decideResolutionClosure(f.chair, { resolutionId: r }, ctx));
  await as(f.secretary, () => commandBodyCharter(f.secretary, f.bodyId, c.id, { command: "ADOPT", expectedRevision: 2, note: "Independently adopt new superior terms", resolutionId: r }, ctx));
  await expect(command(a.id, "ESTABLISH", 3)).rejects.toHaveProperty("code", "RULE_VIOLATION");
 });
 it("forces RLS and cannot commit an established proposal without its exact canonical body", async () => {
  const flags = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(sql`select relrowsecurity,relforcerowsecurity from pg_class where relname='governance_body_establishments'`);
  expect(flags.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  const { a, resolutionId } = await reviewed(); await command(a.id, "APPROVE", 2, { resolutionId });
  const error = await as(f.secretary, async () => {
   await db.execute(sql`select set_config('beyu.body_establishment_actor',${f.secretary.userId},true)`);
   await db.execute(sql`update governance_body_establishments set status='ESTABLISHED',revision=4,body_id='GOV_ESTABLISH_MISSING' where id=${a.id}`);
  }).then(() => null, (e) => e);
  expect(error?.cause?.code ?? error?.code).toBe("23514");
  expect((await db.select().from(governanceBodyEstablishments).where(eq(governanceBodyEstablishments.id, a.id)))[0].status).toBe("APPROVED");
 });
 it("retains RLS, terms and history and cannot forge establishment", async () => {
  const a = await create();
  await expect(as({ ...f.chair, entityScope: ["LEN_BEYU_FAMILY_TRUST"] }, () => listBodyEstablishments({ ...f.chair, entityScope: ["LEN_BEYU_FAMILY_TRUST"] }, f.bodyId))).rejects.toHaveProperty("code", "NOT_FOUND");
  await expect(as(f.chair, () => db.execute(sql`update governance_body_establishments set status='ESTABLISHED',revision=2 where id=${a.id}`))).rejects.toMatchObject({ cause: { code: "23514" } });
  const removed = await as(f.chair, () => db.delete(governanceBodyEstablishments).where(eq(governanceBodyEstablishments.id, a.id)).returning()); expect(removed).toHaveLength(0);
 });
});
