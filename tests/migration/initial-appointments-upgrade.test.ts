import { expect, it } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const adminUrl = process.env.BEYU_ADMIN_DATABASE_URL;
it.skipIf(!adminUrl)("0055 preserves actual ordinary appointment history with same-body-only legacy authority", async () => {
 const root = process.cwd(), name = `beyu_initial_appointments_upgrade_${randomUUID().replaceAll("-", "")}`;
 const master = new Client({ connectionString: adminUrl }); await master.connect();
 const url = new URL(adminUrl!); url.pathname = `/${name}`;
 const runtime = new URL(process.env.BEYU_RUNTIME_DATABASE_URL!); runtime.pathname = `/${name}`;
 const env = { ...process.env, BEYU_ADMIN_DATABASE_URL: url.href, BEYU_TEST_DATABASE_URL: url.href, DATABASE_URL: runtime.href, BEYU_RUNTIME_DATABASE_URL: runtime.href };
 mkdirSync(join(root, "tmp/governance"), { recursive: true });
 const dir = mkdtempSync(join(root, "tmp/governance/initial-appointments-upgrade-")); mkdirSync(join(dir, "drizzle"));
 // 0066 (Shared Search FTS) is additive-only and independent of 0056-0065; the
 // current seed's drizzle inserts reference the mirrored search_tsv column, so
 // 0066 belongs in the predecessor baseline. The migration under test (0055)
 // remains the ONLY upgrade step applied after the predecessor state.
 for (const f of readdirSync(join(root, "drizzle")).filter((f) => /^\d+.*\.sql$/.test(f) && (Number(f.slice(0,4)) <= 54 || f === "0066_shared_search_fulltext.sql"))) copyFileSync(join(root,"drizzle",f),join(dir,"drizzle",f));
 const run = (script: string, cwd: string, label: string) => {
  const r = spawnSync(process.execPath, [join(root,"node_modules/tsx/dist/cli.mjs"),join(root,script)], { cwd, env, encoding:"utf8", timeout: 60000 });
  writeFileSync(join(dir,`${label}.log`),(r.stdout ?? "") + (r.stderr ?? ""));
  expect(r.status, `see ${join(dir,`${label}.log`)}`).toBe(0);
 };
 let created = false; const client = new Client({ connectionString: url.href });
 try {
  await master.query(`create database ${name} owner postgres`); created = true;
  run("scripts/migrate.ts",dir,"predecessor"); run("src/db/seed.ts",root,"seed"); await client.connect();
  const actor = "USR_AMANI_BEYU", approver = "USR_GRACE_KILELE";
  const body = (await client.query("select * from governance_bodies where id='GOV_GROUP_BOARD'")).rows[0];
  const nominee = (await client.query("select id,party_id from users where primary_tenant_id=$1 and id not in ($2,$3) and status='ACTIVE' and not is_service_account limit 1", [body.tenant_id, actor, approver])).rows[0];
  expect(nominee).toBeTruthy();
  const approvingParty = (await client.query("select party_id from users where id=$1", [approver])).rows[0].party_id;
  const decider = (await client.query("select id from governance_members where body_id=$1 and seat_role='CHAIR' limit 1", [body.id])).rows[0].id;
  await client.query("select set_config('beyu.governance_appointment_actor',$1,false)", [actor]);
  for (const id of ["GAP_LEGACY_NOMINATED", "GAP_LEGACY_APPROVED"]) {
   await client.query(`insert into governance_appointments(id,body_id,nominee_user_id,party_id,seat_role,voting_rights,appointed_on,retired_on,document_id,document_version,document_checksum,classification,rationale,nominated_by_user_id,nominated_by_party_id)
    select $1,$2,$3,$4,'MEMBER',true,CURRENT_DATE,'2030-12-31',id,version,checksum,classification,'Preserve exact historical appointment terms',$5,(select party_id from users where id=$5) from documents where id='DOC_D4'`, [id,body.id,nominee.id,nominee.party_id,actor]);
   await client.query(`insert into resolutions(id,reference,tenant_id,body_id,title,category,summary,rationale,data_basis,consequences,proposed_by,status,required_majority,classification,linked_object_type,linked_object_id,quorum_met,decided_by_member_id,decision_date)
    select $1,$1,$2,$3,'Historical appointment mandate','APPOINTMENT','Historical fixture','Historical fixture','Historical fixture','No RBAC grant',$4,'APPROVED',$5,classification,'GOVERNANCE_APPOINTMENT',id,true,$6,now() from governance_appointments where id=$7`, [`RES_${id}`,body.tenant_id,body.id,actor,body.majority_rule,decider,id]);
  }
  await client.query("select set_config('beyu.governance_appointment_actor',$1,false)",[approver]);
  await client.query("update governance_appointments set status='APPROVED',revision=2,approved_by_user_id=$1,approved_by_party_id=(select party_id from users where id=$1),resolution_id='RES_GAP_LEGACY_APPROVED' where id='GAP_LEGACY_APPROVED'",[approver]);
  const before = (await client.query("select * from governance_appointments order by id")).rows;
  copyFileSync(join(root,"drizzle/0055_governance_initial_appointments.sql"),join(dir,"drizzle/0055_governance_initial_appointments.sql"));
  run("scripts/migrate.ts",dir,"upgrade"); run("scripts/migrate.ts",dir,"noop"); run("scripts/setup-db-role.ts",root,"runtime");
  const after = (await client.query("select * from governance_appointments order by id")).rows;
  expect(after.map(({ authority_body_id, initial_charter_id, ...preserved }) => {
   expect(authority_body_id).toBeNull(); expect(initial_charter_id).toBeNull(); return preserved;
  })).toEqual(before);
  // 57 = 0000-0054 (55) + 0066 shared-search baseline (1) + 0055 under test (1).
  expect(Number((await client.query("select count(*) as n from beyu_migrations where mode='APPLIED'")).rows[0].n)).toBe(57);
  async function runtimeScope(who: string, fn: () => Promise<void>) {
   await client.query("begin");
   try {
    await client.query("set local role beyu_runtime");
    await client.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_actions_read','on',true),set_config('beyu.governance_entity_ids','',true),set_config('beyu.governance_classifications','PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED',true),set_config('beyu.governance_appointment_actor',$2,true)`,[body.tenant_id,who]);
    await fn();
   } finally { await client.query("rollback"); }
  }
  await runtimeScope(approver, async () => {
   expect((await client.query("select id from governance_appointments")).rowCount).toBe(2);
   expect((await client.query("update governance_appointments set status='APPROVED',revision=2,approved_by_user_id=$1,approved_by_party_id=$2,resolution_id='RES_GAP_LEGACY_NOMINATED' where id='GAP_LEGACY_NOMINATED' returning status,authority_body_id,initial_charter_id",[approver,approvingParty])).rows).toEqual([{ status: "APPROVED", authority_body_id: null, initial_charter_id: null }]);
  });
  await runtimeScope(nominee.id, async () => {
   expect((await client.query("update governance_appointments set status='ACCEPTED',revision=3,accepted_at=now() where id='GAP_LEGACY_APPROVED' returning status")).rows).toEqual([{ status: "ACCEPTED" }]);
  });
  await runtimeScope(nominee.id, async () => {
   expect((await client.query("update governance_appointments set status='DECLINED',revision=3 where id='GAP_LEGACY_APPROVED' returning status")).rows).toEqual([{ status: "DECLINED" }]);
  });
 } finally {
  await client.end();
  if (created) await master.query(`drop database ${name} with (force)`);
  await master.end();
 }
}, 180000);
