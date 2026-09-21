import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { documents } from "../../src/db/schema";
import { createBodyCharter } from "../../src/lib/governance/charter-service";
import { executionPrincipal } from "../helpers/governance-execution";
import { charterFixtureRules, cleanupCharters } from "../helpers/charters";
let runtime: Client, id: string, tenant: string;
async function scoped(fn: () => Promise<void>, opts: { tenant?: string; entity?: string; classification?: string; read?: string } = {}) {
 await runtime.query("begin");
 try {
  await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_entity_ids',$2,true),set_config('beyu.governance_classifications',$3,true),set_config('beyu.governance_actions_read',$4,true),set_config('beyu.global_scope','on',true)`, [opts.tenant ?? tenant, opts.entity ?? "", opts.classification ?? "PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED", opts.read ?? "on"]);
  await fn();
 } finally { await runtime.query("rollback"); }
}
beforeAll(async () => {
 if (!process.env.BEYU_RUNTIME_DATABASE_URL) throw Error("Actual runtime DSN required");
 runtime = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL }); await runtime.connect();
 expect((await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
 const p = await executionPrincipal(); tenant = p.tenantId;
 const [d] = await db.select().from(documents).where(eq(documents.id, "DOC_D4"));
 await db.insert(documents).values({ ...d, id: "DOC_CHARTER_RLS", classification: "RESTRICTED" });
 await db.insert(documents).values({ ...d, id: "DOC_CHARTER_COUNTRY", jurisdictionCode: "ZZ" });
 id = (await createBodyCharter(p, "GOV_GROUP_BOARD", { documentId: "DOC_CHARTER_RLS", purpose: "Non-owner database isolation fixture for charter terms", rules: charterFixtureRules }, { traceId: "CHARTER_RLS" })).id;
});
afterAll(async () => { if (id) await cleanupCharters([id], []); await db.delete(documents).where(eq(documents.id, "DOC_CHARTER_RLS")); await db.delete(documents).where(eq(documents.id, "DOC_CHARTER_COUNTRY")); if (runtime) await runtime.end(); });
describe("charter direct PostgreSQL boundary", () => {
 it("denies both tables without trusted context", async () => {
  for (const table of ["governance_charters", "governance_charter_terms"]) expect((await runtime.query(`select id from ${table} where id=$1`, [id])).rowCount).toBe(0);
 });
 it.each([{ tenant: "TEN_BEYU_FINTECH" }, { entity: "WRONG_ENTITY" }, { read: "off" }])("denies %j despite global_scope", async (opts) => scoped(async () => {
  for (const table of ["governance_charters", "governance_charter_terms"]) expect((await runtime.query(`select id from ${table} where id=$1`, [id])).rowCount).toBe(0);
 }, opts));
 it("exposes only control metadata when terms exceed clearance", async () => scoped(async () => {
  expect((await runtime.query("select id from governance_charters where id=$1", [id])).rowCount).toBe(1);
  expect((await runtime.query("select * from governance_charter_terms where id=$1", [id])).rowCount).toBe(0);
 }, { classification: "PUBLIC" }));
 it("cannot edit/delete immutable terms or delete their header", async () => scoped(async () => {
  expect((await runtime.query("update governance_charter_terms set purpose='forged' where id=$1", [id])).rowCount).toBe(0);
  expect((await runtime.query("delete from governance_charter_terms where id=$1", [id])).rowCount).toBe(0);
  expect((await runtime.query("delete from governance_charters where id=$1", [id])).rowCount).toBe(0);
 }));
 it.each(["status='ADOPTED',revision=revision+1", "body_id='GOV_TRUSTEE_BOARD',status='IN_REVIEW',revision=revision+1", "status='IN_REVIEW',revision=revision", "created_by_user_id='USR_GRACE_KILELE',status='IN_REVIEW',revision=revision+1"])("denies malformed header changes %s", async (set) => scoped(async () => {
  await expect(runtime.query(`update governance_charters set ${set} where id=$1`, [id])).rejects.toHaveProperty("code", "23514");
 }));
 it("blocks a forged cross-country document snapshot at the database boundary", async () => scoped(async () => {
  const [doc] = await db.select().from(documents).where(eq(documents.id, "DOC_CHARTER_COUNTRY"));
  await runtime.query("select set_config('beyu.governance_charter_actor','USR_AMANI_BEYU',true)");
  await runtime.query(`insert into governance_charters(id,body_id,version,created_by_user_id,authority_body_id,created_by_party_id) select 'GCH_RLS_FORGED','GOV_GROUP_BOARD',10000,id,'GOV_GROUP_BOARD',party_id from users where id='USR_AMANI_BEYU'`);
  await expect(runtime.query(`insert into governance_charter_terms(id,document_id,document_version,document_checksum,purpose,rules,classification) values('GCH_RLS_FORGED',$1,$2,$3,'Cross-country forgery',$4,'PUBLIC')`, [doc.id, doc.version, doc.checksum, JSON.stringify(charterFixtureRules)])).rejects.toHaveProperty("code", "23514");
 }));
 it("keeps referenced registry artifacts from being deleted", async () => scoped(async () => {
  await expect(runtime.query("delete from documents where id='DOC_CHARTER_RLS'")).rejects.toHaveProperty("code", "23503");
 }));
});
