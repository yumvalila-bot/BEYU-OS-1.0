/** Direct SQL, real NON-OWNER/NOBYPASSRLS login. No application WHERE guard. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

let admin: Client;
let runtime: Client;
const A = "TEN_BEYU_TZ";
const B = "TEN_BEYU_FINTECH";
const tableNames = ["governance_bodies", "governance_members", "resolutions", "resolution_votes"];

async function context(tenant = A, entity = "", classifications = "PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED") {
  await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true),
    set_config('beyu.global_scope','on',true), set_config('beyu.governance_context','on',true),
    set_config('beyu.governance_entity_ids',$2,true), set_config('beyu.governance_classifications',$3,true)`, [tenant, entity, classifications]);
}
async function asRuntime(operation: () => Promise<void>) {
  await runtime.query("begin");
  try { await operation(); } finally { await runtime.query("rollback"); }
}
async function cleanup() {
  await admin.query("delete from resolution_votes where id like 'ISO_GOV_%'");
  await admin.query("delete from resolutions where id like 'ISO_GOV_%'");
  await admin.query("delete from governance_members where id like 'ISO_GOV_%'");
  await admin.query("delete from governance_bodies where id like 'ISO_GOV_%'");
}
beforeAll(async () => {
  if (!process.env.BEYU_RUNTIME_DATABASE_URL) throw new Error("Real runtime DSN required; RLS tests must not skip");
  admin = new Client({ connectionString: process.env.BEYU_ADMIN_DATABASE_URL });
  runtime = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL });
  await admin.connect(); await runtime.connect(); await cleanup();
  const who = await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user");
  expect(who.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  for (const [suffix, tenant] of [["A", A], ["B", B]]) {
    await admin.query(`insert into governance_bodies (id,tenant_id,code,name,body_type,legal_entity_id)
      values ($1,$2,$1,'Isolation probe','BOARD','LEN_BEYU_HOLDINGS')`, [`ISO_GOV_${suffix}`, tenant]);
    await admin.query(`insert into governance_members (id,body_id,party_id,seat_role,appointed_on)
      select $1,$1,party_id,'MEMBER','2000-01-01' from users order by id limit 1`, [`ISO_GOV_${suffix}`]);
    await admin.query(`insert into resolutions (id,tenant_id,body_id,reference,title,category,summary,rationale,data_basis,consequences,proposed_by,status)
      values ($1,$2,$1,$1,'Isolation','OTHER','Probe','Probe','Probe','None','TEST','TABLED')`, [`ISO_GOV_${suffix}`, tenant]);
    await admin.query(`insert into resolution_votes (id,resolution_id,member_id,vote) values ($1,$1,$1,'FOR')`, [`ISO_GOV_${suffix}`]);
  }
});
afterAll(async () => { if (admin) { await cleanup(); await admin.end(); } if (runtime) await runtime.end(); });

describe("core governance RLS", () => {
  it("enables and forces RLS on all four canonical tables", async () => {
    const r = await admin.query("select relname,relrowsecurity,relforcerowsecurity from pg_class where relname=any($1)", [tableNames]);
    expect(r.rows).toHaveLength(4);
    expect(r.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
  });
  it.each(tableNames)("denies %s without context", async (table) => {
    expect((await runtime.query(`select id from ${table} where id like 'ISO_GOV_%'`)).rowCount).toBe(0);
  });
  it.each(tableNames)("isolates %s despite global_scope=on", async (table) => asRuntime(async () => {
    await context();
    expect((await runtime.query(`select id from ${table} where id like 'ISO_GOV_%'`)).rows).toEqual([{ id: "ISO_GOV_A" }]);
  }));
  it.each(tableNames)("denies wrong-entity access to %s", async (table) => asRuntime(async () => {
    await context(A, "WRONG_ENTITY");
    expect((await runtime.query(`select id from ${table} where id like 'ISO_GOV_%'`)).rowCount).toBe(0);
  }));
  it("propagates classification ceilings to ballots", async () => asRuntime(async () => {
    await context(A, "", "PUBLIC");
    expect((await runtime.query("select id from resolutions where id='ISO_GOV_A'")).rowCount).toBe(0);
    expect((await runtime.query("select id from resolution_votes where id='ISO_GOV_A'")).rowCount).toBe(0);
  }));
  it("rejects cross-body ballot insertion even with both tenant scopes", async () => asRuntime(async () => {
    await context(`${A},${B}`);
    await expect(runtime.query(`insert into resolution_votes (id,resolution_id,member_id,vote)
      values ('ISO_GOV_FORGED','ISO_GOV_A','ISO_GOV_B','FOR')`)).rejects.toMatchObject({ code: "42501" });
  }));
  it.each(["governance_bodies", "governance_members"])("cannot rewrite authority in %s", async (table) => asRuntime(async () => {
    await context();
    await expect(runtime.query(`update ${table} set id=id where id='ISO_GOV_A'`)).rejects.toMatchObject({ code: "42501" });
  }));
  it.each(tableNames)("cannot erase %s", async (table) => asRuntime(async () => {
    await context();
    expect((await runtime.query(`delete from ${table} where id='ISO_GOV_A'`)).rowCount).toBe(0);
  }));
  it("cannot change finalized resolutions or ballots", async () => {
    await admin.query("update resolutions set status='APPROVED' where id='ISO_GOV_A'");
    await asRuntime(async () => {
      await context();
      expect((await runtime.query("update resolutions set title='Tampered' where id='ISO_GOV_A'")).rowCount).toBe(0);
      expect((await runtime.query("update resolution_votes set vote='AGAINST' where id='ISO_GOV_A'")).rowCount).toBe(0);
    });
  });
  it("does not retain scope after rollback on a reused connection", async () => {
    expect((await runtime.query("select id from resolutions where id='ISO_GOV_A'")).rowCount).toBe(0);
  });
});
