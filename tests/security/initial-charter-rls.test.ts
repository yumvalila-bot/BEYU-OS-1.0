import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { documents } from "../../src/db/schema";
import { Client } from "pg";
import { createBodyCharter, commandBodyCharter } from "../../src/lib/governance/charter-service";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
import { initialCharterFixture, initialCharterContext as ctx } from "../helpers/initial-charters";
import { cleanupEstablishments, asEstablishmentActor as as } from "../helpers/establishments";
import { charterFixtureRules, concludedCharterBallot } from "../helpers/charters";
let f: Awaited<ReturnType<typeof initialCharterFixture>>, runtime: Client, id: string, resolutionId: string;
const prefix = "INITIAL_CHARTER_SQL";
beforeAll(async () => {
 await cleanupEstablishments(prefix); f = await initialCharterFixture(prefix);
 runtime = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL }); await runtime.connect();
 expect((await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
 id = (await as(f.chair, () => createBodyCharter(f.chair, f.childId, { documentId: "DOC_D4", purpose: "Non-owner superior charter authority boundaries", rules: charterFixtureRules }, ctx))).id;
 await as(f.chair, () => commandBodyCharter(f.chair, f.childId, id, { command: "SUBMIT", expectedRevision: 1, note: "Review initial charter authority" }, ctx));
 resolutionId = await concludedCharterBallot(id); await as(f.chair, () => decideResolutionClosure(f.chair, { resolutionId }, ctx));
});
afterAll(async () => { await runtime?.end(); await cleanupEstablishments(prefix); });
async function scoped(fn: () => Promise<void>, overrides: { tenant?: string; entity?: string; actor?: string } = {}) {
 await runtime.query("begin");
 try {
  await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_entity_ids',$2,true),set_config('beyu.governance_classifications','PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED',true),set_config('beyu.governance_actions_read','on',true),set_config('beyu.global_scope','on',true),set_config('beyu.governance_charter_actor',$3,true)`, [overrides.tenant ?? f.chair.tenantId, overrides.entity ?? "", overrides.actor ?? f.secretary.userId]);
  await fn();
 } finally { await runtime.query("rollback"); }
}
const approve = (status = "APPROVED") => runtime.query("update governance_charters set status=$1, revision=revision+1,resolution_id=$2,adopted_by_user_id=$3,adopted_at=now() where id=$4", [status, resolutionId, f.secretary.userId, id]);
describe("initial charter non-owner SQL boundary", () => {
 it("has no unscoped visibility", async () => { expect((await runtime.query("select id from governance_charters where id=$1", [id])).rowCount).toBe(0); });
 it.each([{ tenant: "TEN_OTHER" }, { entity: "WRONG_ENTITY" }])("retains %j isolation despite global flag", async (options) => scoped(async () => { expect((await runtime.query("select id from governance_charters where id=$1", [id])).rowCount).toBe(0); }, options));
 it("does not make a dormant charter effective, even with a genuine superior decision", async () => scoped(async () => { await expect(approve("ADOPTED")).rejects.toHaveProperty("code", "23514"); }));
 it.each(["", "USR_AMANI_BEYU"])("rejects missing or author-as-approver context %s", async (actor) => scoped(async () => { await expect(approve()).rejects.toHaveProperty("code", "23514"); }, { actor }));
 it("rejects an RBAC-only nominee without a superior seat", async () => scoped(async () => { await expect(approve()).rejects.toHaveProperty("code", "23514"); }, { actor: f.candidate.userId }));
 it.each(["authority_body_id=body_id", "created_by_party_id=(select party_id from users where id='USR_GRACE_KILELE')"])("cannot replace immutable authority provenance: %s", async (set) => scoped(async () => { await expect(runtime.query(`update governance_charters set ${set},revision=revision+1 where id=$1`, [id])).rejects.toHaveProperty("code", "23514"); }));
 it.each(["jurisdictionCode", "entityScope", "authorityStatus"] as const)("rechecks %s at direct SQL approval", async (field) => {
  const [doc] = await db.select().from(documents).where(eq(documents.id, "DOC_D4"));
  await db.update(documents).set({ [field]: field === "authorityStatus" ? "EXPIRED" : "ZZ" }).where(eq(documents.id, doc.id));
  try { await scoped(async () => { await expect(approve()).rejects.toHaveProperty("code", "23514"); }); }
  finally { await db.update(documents).set({ [field]: doc[field] }).where(eq(documents.id, doc.id)); }
 });
 it("cannot delete history or modify its terms", async () => scoped(async () => {
  expect((await runtime.query("delete from governance_charters where id=$1", [id])).rowCount).toBe(0);
  expect((await runtime.query("update governance_charter_terms set purpose='forged' where id=$1", [id])).rowCount).toBe(0);
 }));
 it("preserves body activation denial", async () => scoped(async () => { await expect(runtime.query("update governance_bodies set status='ACTIVE' where id=$1", [f.childId])).rejects.toHaveProperty("code", "42501"); }));
 it("preserves member insertion denial", async () => scoped(async () => { await expect(runtime.query("insert into governance_members(id,body_id,party_id,seat_role,appointed_on) values('INITIAL_FORGED_MEMBER',$1,$2,'CHAIR',CURRENT_DATE)", [f.childId, f.candidate.partyId])).rejects.toHaveProperty("code", "42501"); }));
});
