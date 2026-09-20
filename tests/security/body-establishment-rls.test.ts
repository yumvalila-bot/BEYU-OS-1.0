import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Client } from "pg";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { documents } from "../../src/db/schema";
import { proposeBodyEstablishment } from "../../src/lib/governance/establishment-service";
import { establishmentFixture, establishmentInput, cleanupEstablishments, asEstablishmentActor as as } from "../helpers/establishments";
let runtime: Client, f: Awaited<ReturnType<typeof establishmentFixture>>, id: string;
const prefix = "ESTABLISH_RLS";
async function scoped(fn: () => Promise<void>, options: { tenant?: string; entity?: string; classification?: string; read?: string } = {}) {
 await runtime.query("begin");
 try {
  await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_entity_ids',$2,true),set_config('beyu.governance_classifications',$3,true),set_config('beyu.governance_actions_read',$4,true),set_config('beyu.global_scope','on',true),set_config('beyu.body_establishment_actor',$5,true)`, [options.tenant ?? f.chair.tenantId, options.entity ?? "", options.classification ?? "PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED", options.read ?? "on", f.chair.userId]);
  await fn();
 } finally { await runtime.query("rollback"); }
}
beforeAll(async () => {
 if (!process.env.BEYU_RUNTIME_DATABASE_URL) throw Error("Actual runtime DSN required");
 runtime = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL }); await runtime.connect();
 expect((await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
 await cleanupEstablishments(prefix); f = await establishmentFixture(prefix);
 await db.execute(sql`insert into documents select (jsonb_populate_record(null::documents,to_jsonb(d)||'{"id":"DOC_ESTABLISH_RLS","classification":"RESTRICTED"}'::jsonb)).* from documents d where id='DOC_D4'`);
 id = (await as(f.chair, () => proposeBodyEstablishment(f.chair, f.bodyId, establishmentInput({ documentId: "DOC_ESTABLISH_RLS" }), { traceId: "ESTABLISHMENT_RLS" }))).id;
});
afterAll(async () => { await cleanupEstablishments(prefix); await db.execute(sql`delete from documents where id='DOC_ESTABLISH_RLS'`); if (runtime) await runtime.end(); });
describe("body establishment actual non-owner PostgreSQL boundary", () => {
 it("has no unscoped visibility", async () => { expect((await runtime.query("select id from governance_body_establishments where id=$1", [id])).rowCount).toBe(0); });
 it.each([{ tenant: "TEN_BEYU_FINTECH" }, { entity: "LEN_BEYU_FAMILY_TRUST" }, { classification: "PUBLIC" }, { read: "off" }])("cannot widen %j with a global flag", async (scope) => scoped(async () => { expect((await runtime.query("select id from governance_body_establishments where id=$1", [id])).rowCount).toBe(0); }, scope));
 it("permits the actual scoped read but never history deletion", async () => scoped(async () => {
  expect((await runtime.query("select id from governance_body_establishments where id=$1", [id])).rowCount).toBe(1);
  expect((await runtime.query("delete from governance_body_establishments where id=$1", [id])).rowCount).toBe(0);
 }));
 it.each(["status='ESTABLISHED',revision=2,body_id='GOV_FORGED_ESTABLISHMENT'", "status='IN_REVIEW',revision=2,purpose='Changed immutable powers'"])("rejects SQL authority/terms forgery: %s", async (set) => scoped(async () => {
  await expect(runtime.query(`update governance_body_establishments set ${set} where id=$1`, [id])).rejects.toHaveProperty("code", "23514");
 }));
 it.each(["entityScope", "jurisdictionCode"] as const)("SQL transitions reject wrong instrument %s", async (field) => {
  const [doc] = await db.select().from(documents).where(eq(documents.id, "DOC_ESTABLISH_RLS"));
  await db.update(documents).set({ [field]: field === "entityScope" ? "OTHER_ENTITY" : "ZZ" }).where(eq(documents.id, doc.id));
  try { await scoped(async () => { await expect(runtime.query("update governance_body_establishments set status='IN_REVIEW',revision=2 where id=$1", [id])).rejects.toHaveProperty("code", "23514"); }); }
  finally { await db.update(documents).set({ [field]: doc[field] }).where(eq(documents.id, doc.id)); }
 });
 it("cannot create a body merely by setting a proposal context flag", async () => scoped(async () => {
  await runtime.query("select set_config('beyu.body_establishment_id',$1,true)", [id]);
  await expect(runtime.query(`insert into governance_bodies select (jsonb_populate_record(null::governance_bodies,to_jsonb(b)||'{"id":"GOV_FORGED_ESTABLISHMENT","code":"GOV_FORGED_ESTABLISHMENT","status":"DRAFT","body_type":"COMMITTEE"}'::jsonb)).* from governance_bodies b where id=$1`, [f.bodyId])).rejects.toHaveProperty("code", "42501");
 }));
});
