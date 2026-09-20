import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { documents, governanceBodies, governanceMembers, governanceCharters, governanceCharterTerms, resolutions, resolutionVotes, enterpriseEvents } from "../../src/db/schema";
import { createBodyCharter, commandBodyCharter, readBodyCharters } from "../../src/lib/governance/charter-service";
import { assessComposition, currentCharterComposition } from "../../src/lib/governance/charter-rules";
import { CharterRulesSchema } from "../../src/lib/governance/charter-contract";
import { decideResolutionClosure, tableResolution } from "../../src/lib/governance-vote-service";
import { executionPrincipal } from "../helpers/governance-execution";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import { verifyAuditChain, verifyEventChain } from "../../src/lib/audit";
import { resetAuditLedgers } from "../helpers/ledger-reset";
import type { Principal } from "../../src/lib/authz";
const BODY = "GOV_CHT_TEST", ctx = { traceId: "CHARTER_TEST" };
const rules = { quorumMinimum: 4, majorityRule: "SIMPLE" as const, minimumVotingMembers: 4, maximumVotingMembers: 8, requiredSeats: [{ role: "CHAIR" as const, minimum: 1, maximum: 1 }, { role: "SECRETARY" as const, minimum: 1, maximum: 1 }] };
let chair: Principal, secretary: Principal; let sequence = 0;
async function as<T>(p: Principal, fn: () => Promise<T>) { return db.transaction(async (tx) => { await tx.execute(sql`set local role beyu_runtime`); return withTenantDatabaseContext(p, fn); }); }
const input = (changes = {}) => ({ documentId: "DOC_CHT_TEST", purpose: "Charter requiring accountable presiding seats and bounded voting membership", rules, ...changes });
const create = (p = chair, changes = {}) => as(p, () => createBodyCharter(p, BODY, input(changes), ctx));
const command = (id: string, command: string, expectedRevision: number, p = chair, extra = {}) => as(p, () => commandBodyCharter(p, BODY, id, { command, expectedRevision, note: "Review the constitutional charter terms", ...extra }, ctx));
async function proposal(charterId: string, approve = true) {
 const id = `RES_CHT_${++sequence}`;
 await db.insert(resolutions).values({ id, reference: id, tenantId: chair.tenantId, bodyId: BODY, title: "Adopt scoped charter terms", category: "POLICY", summary: "Fixture", rationale: "Fixture", dataBasis: "Fixture", consequences: "No new authority", proposedBy: chair.userId, classification: "RESTRICTED", requiredMajority: "SIMPLE", status: approve ? "TABLED" : "DRAFT", linkedObjectType: "GOVERNANCE_CHARTER", linkedObjectId: charterId, votingOpensAt: new Date(0), votingClosesAt: new Date(1) });
 if (approve) {
  const members = await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, BODY));
  for (const m of members) await db.insert(resolutionVotes).values({ id: `${id}_${m.id}`, resolutionId: id, memberId: m.id, vote: "FOR" });
  expect((await as(chair, () => decideResolutionClosure(chair, { resolutionId: id }, ctx))).outcome).toBe("APPROVED");
 }
 return id;
}
async function cleanup() {
 await db.execute(sql`delete from governance_charter_terms where id in (select id from governance_charters where body_id=${BODY})`);
 await db.delete(governanceCharters).where(eq(governanceCharters.bodyId, BODY));
 await db.execute(sql`delete from resolution_votes where resolution_id in (select id from resolutions where body_id=${BODY})`);
 await db.delete(resolutions).where(eq(resolutions.bodyId, BODY)); await db.delete(governanceMembers).where(eq(governanceMembers.bodyId, BODY)); await db.delete(governanceBodies).where(eq(governanceBodies.id, BODY)); await db.delete(documents).where(eq(documents.id, "DOC_CHT_TEST"));
}
beforeAll(async () => {
 await cleanup(); await resetAuditLedgers(); chair = await executionPrincipal(); secretary = await executionPrincipal("USR_GRACE_KILELE");
 const [b] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, "GOV_GROUP_BOARD")); await db.insert(governanceBodies).values({ ...b, id: BODY, code: BODY });
 for (const m of await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, b.id))) await db.insert(governanceMembers).values({ ...m, id: `CHT_${m.id}`, bodyId: BODY });
 const [d] = await db.select().from(documents).where(eq(documents.id, "DOC_D4")); await db.insert(documents).values({ ...d, id: "DOC_CHT_TEST", classification: "RESTRICTED" });
});
afterAll(cleanup);
describe("governed charter lifecycle", () => {
 it("rejects unknown roles, incoherent bounds, duplicated rules and forged fields", () => {
  expect(CharterRulesSchema.safeParse({ ...rules, minimumVotingMembers: 9 }).success).toBe(false);
  expect(CharterRulesSchema.safeParse({ ...rules, requiredSeats: [...rules.requiredSeats, rules.requiredSeats[0]] }).success).toBe(false);
  expect(assessComposition({ ...rules, majorityRule: "UNKNOWN" }, []).satisfied).toBe(false);
 });
 it.each(["mfa", "entity", "clearance", "permission"])("denies absent %s authority", async (kind) => {
  const p = { ...chair, ...(kind === "mfa" ? { mfaSatisfied: false } : kind === "entity" ? { entityScope: ["WRONG_ENTITY"] } : kind === "clearance" ? { clearance: "PUBLIC" as const } : { permissions: new Set<never>() }) };
  await expect(create(p)).rejects.toHaveProperty("code");
 });
 it("does not inflate composition with duplicate parties, observers or future appointments", () => {
  const m = { partyId: "PARTY", seatRole: "CHAIR", votingRights: true, appointedOn: "2000-01-01", retiredOn: null };
  expect(assessComposition(rules, [m, m]).violations).toContain("Duplicate active party seats require reconciliation.");
  expect(assessComposition(rules, [{ ...m, seatRole: "OBSERVER" }]).satisfied).toBe(false);
  expect(assessComposition(rules, [{ ...m, appointedOn: "2999-01-01" }]).votingMembers).toBe(0);
  expect(assessComposition(rules, [{ ...m, retiredOn: "1900-01-01" }]).votingMembers).toBe(0);
 });
 it("does not modify body voting rules by adopting prose or JSON", async () => {
  await expect(create(chair, { rules: { ...rules, quorumMinimum: 1 } })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
 });
 it("serializes concurrent versions and rejects stale transition revisions", async () => {
  const [a, b] = await Promise.all([create(), create()]); expect(a.version).not.toBe(b.version);
  const results = await Promise.allSettled([command(a.id, "SUBMIT", 1), command(a.id, "SUBMIT", 1)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
 });
 it("requires submitted state, charter-specific provenance and independent adopter", async () => {
  const c = await create(); const r = await proposal(c.id);
  await expect(command(c.id, "ADOPT", 1, secretary, { resolutionId: r })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
  await command(c.id, "SUBMIT", 1);
  await expect(command(c.id, "ADOPT", 2, chair, { resolutionId: r })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const wrong = await proposal("WRONG_CHARTER");
  await expect(command(c.id, "ADOPT", 2, secretary, { resolutionId: wrong })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
 });
 it("rejects drifted document snapshots before submission", async () => {
  const c = await create(); await db.update(documents).set({ version: "changed" }).where(eq(documents.id, "DOC_CHT_TEST"));
  try { await expect(command(c.id, "SUBMIT", 1)).rejects.toMatchObject({ code: "RULE_VIOLATION" }); }
  finally { await db.update(documents).set({ version: c.terms.documentVersion }).where(eq(documents.id, "DOC_CHT_TEST")); }
 });
 it("refuses unmet composition and later enforces adopted rules on real resolution tabling", async () => {
  const c = await create(); await command(c.id, "SUBMIT", 1); const r = await proposal(c.id);
  await db.update(governanceMembers).set({ retiredOn: "1900-01-01" }).where(eq(governanceMembers.id, "CHT_GMB_BRD_CEO"));
  try { await expect(command(c.id, "ADOPT", 2, secretary, { resolutionId: r })).rejects.toMatchObject({ code: "RULE_VIOLATION" }); }
  finally { await db.update(governanceMembers).set({ retiredOn: null }).where(eq(governanceMembers.id, "CHT_GMB_BRD_CEO")); }
  expect((await command(c.id, "ADOPT", 2, secretary, { resolutionId: r })).status).toBe("ADOPTED");
  const draft = await proposal(c.id, false);
  await db.update(governanceMembers).set({ retiredOn: "1900-01-01" }).where(eq(governanceMembers.id, "CHT_GMB_BRD_CEO"));
  try { await expect(as(secretary, () => tableResolution(secretary, { resolutionId: draft }, ctx))).rejects.toMatchObject({ code: "RULE_VIOLATION" }); }
  finally { await db.update(governanceMembers).set({ retiredOn: null }).where(eq(governanceMembers.id, "CHT_GMB_BRD_CEO")); }
  expect((await as(chair, () => tableResolution(chair, { resolutionId: draft }, ctx))).status).toBe("TABLED");
  expect((await verifyAuditChain()).verified).toBe(true); expect((await verifyEventChain()).verified).toBe(true);
  const events = await db.select().from(enterpriseEvents).where(and(eq(enterpriseEvents.subjectId, c.id), eq(enterpriseEvents.type, "GOVERNANCE_CHARTER_ADOPTED")));
  expect(events).toHaveLength(1); expect(events[0].causationId).toBeTruthy();
 });
 it("hides classified terms but never treats a hidden adopted charter as absent", async () => {
  const p = { ...chair, clearance: "PUBLIC" as const };
  await as(p, async () => {
   const view = await readBodyCharters(p, BODY); expect(view.charters.length).toBeGreaterThan(0); expect(view.charters.every((c) => c.terms === null)).toBe(true);
   const assessment = await currentCharterComposition(view.body); expect(assessment.charter).not.toBeNull(); expect(assessment.satisfied).toBe(false);
   expect((await db.select().from(governanceCharterTerms)).length).toBe(0);
  });
 });
 it("preserves FORCE RLS, immutable adopted headers, immutable terms and 0048 membership protection", async () => {
  const adopted = (await db.select().from(governanceCharters).where(and(eq(governanceCharters.bodyId, BODY), eq(governanceCharters.status, "ADOPTED"))))[0];
  await as(chair, async () => {
   expect(await db.update(governanceCharterTerms).set({ purpose: "Tampered" }).where(eq(governanceCharterTerms.id, adopted.id)).returning()).toHaveLength(0);
   expect(await db.delete(governanceCharters).where(eq(governanceCharters.id, adopted.id)).returning()).toHaveLength(0);
  });
  await expect(as(chair, () => db.update(governanceCharters).set({ revision: adopted.revision + 1, status: "DRAFT" }).where(eq(governanceCharters.id, adopted.id)))).rejects.toThrow();
  await expect(as(chair, () => db.update(governanceMembers).set({ seatRole: "CHAIR" }).where(eq(governanceMembers.id, "CHT_GMB_BRD_CFO")))).rejects.toThrow();
  const flags = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(sql`select relrowsecurity,relforcerowsecurity from pg_class where relname in ('governance_charters','governance_charter_terms')`);
  expect(flags.rows).toHaveLength(2); expect(flags.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
 });
 it("rolls back a created charter and its events together", async () => {
  let id = ""; await expect(db.transaction(async () => { const c = await create(); id = c.id; throw Error("rollback"); })).rejects.toThrow("rollback");
  expect(await db.select().from(governanceCharters).where(eq(governanceCharters.id, id))).toHaveLength(0);
  expect(await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, id))).toHaveLength(0);
 });
});
