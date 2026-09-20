import { expect, it } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const adminUrl = process.env.BEYU_ADMIN_DATABASE_URL;
it.skipIf(!adminUrl)("0053 preserves actual pre-upgrade charter history without guessing missing authority identities", async () => {
 const root = process.cwd(), name = `beyu_charter_upgrade_${randomUUID().replaceAll("-", "")}`;
 const master = new Client({ connectionString: adminUrl }); await master.connect();
 const url = new URL(adminUrl!); url.pathname = `/${name}`;
 const runtime = new URL(process.env.BEYU_RUNTIME_DATABASE_URL!); runtime.pathname = `/${name}`;
 const env = { ...process.env, BEYU_ADMIN_DATABASE_URL: url.href, BEYU_TEST_DATABASE_URL: url.href, DATABASE_URL: runtime.href, BEYU_RUNTIME_DATABASE_URL: runtime.href };
 mkdirSync(join(root, "tmp/governance"), { recursive: true });
 const dir = mkdtempSync(join(root, "tmp/governance/charter-upgrade-")); mkdirSync(join(dir, "drizzle"));
 for (const f of readdirSync(join(root, "drizzle")).filter((f) => /^\d+.*\.sql$/.test(f) && Number(f.slice(0,4)) <= 52)) copyFileSync(join(root,"drizzle",f),join(dir,"drizzle",f));
 const run = (script: string, cwd: string, label: string) => {
  const r = spawnSync(process.execPath, [join(root,"node_modules/tsx/dist/cli.mjs"),join(root,script)], { cwd, env, encoding:"utf8", timeout: 60000 });
  writeFileSync(join(dir,`${label}.log`),(r.stdout ?? "") + (r.stderr ?? ""));
  expect(r.status, `see ${join(dir,`${label}.log`)}`).toBe(0);
 };
 let created = false; const client = new Client({ connectionString: url.href });
 try {
  await master.query(`create database ${name} owner postgres`); created = true;
  run("scripts/migrate.ts",dir,"predecessor"); run("src/db/seed.ts",root,"seed"); await client.connect();
  await client.query("insert into governance_charters(id,body_id,version,created_by_user_id) values('GCH_UPGRADE_HISTORY','GOV_GROUP_BOARD',10000,'USR_AMANI_BEYU')");
  await client.query(`insert into governance_charter_terms(id,document_id,document_version,document_checksum,purpose,rules,classification)
    select 'GCH_UPGRADE_HISTORY',id,version,checksum,'Preserved historical charter terms',$1::jsonb,classification from documents where id='DOC_D4'`, [JSON.stringify({quorumMinimum:4,majorityRule:"SIMPLE",minimumVotingMembers:4,maximumVotingMembers:8,requiredSeats:[{role:"CHAIR",minimum:1,maximum:1}]})]);
  const originalTerms = (await client.query("select * from governance_charter_terms where id='GCH_UPGRADE_HISTORY'")).rows[0];
  const before = (await client.query("select * from governance_charters where id='GCH_UPGRADE_HISTORY'")).rows[0];
  copyFileSync(join(root,"drizzle/0053_governance_initial_charters.sql"),join(dir,"drizzle/0053_governance_initial_charters.sql"));
  run("scripts/migrate.ts",dir,"upgrade"); run("scripts/migrate.ts",dir,"noop"); run("scripts/setup-db-role.ts",root,"runtime");
  const after = (await client.query("select * from governance_charters where id='GCH_UPGRADE_HISTORY'")).rows[0];
  const { authority_body_id, created_by_party_id, ...preserved } = after;
  expect((await client.query("select * from governance_charter_terms where id='GCH_UPGRADE_HISTORY'")).rows[0]).toEqual(originalTerms);
  expect(preserved).toEqual(before); expect(authority_body_id).toBeNull(); expect(created_by_party_id).toBeNull();
  expect(Number((await client.query("select count(*) as n from beyu_migrations where mode='APPLIED'")).rows[0].n)).toBe(54);
  await client.query("begin");
  const tenant = (await client.query("select tenant_id from governance_bodies where id='GOV_GROUP_BOARD'")).rows[0].tenant_id;
  await client.query("set local role beyu_runtime");
  await client.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_actions_read','on',true),set_config('beyu.governance_entity_ids','',true),set_config('beyu.governance_classifications','PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED',true),set_config('beyu.governance_charter_actor','USR_AMANI_BEYU',true)`,[tenant]);
  expect((await client.query("select id from governance_charters where id='GCH_UPGRADE_HISTORY'")).rowCount).toBe(1);
  await expect(client.query("update governance_charters set status='IN_REVIEW',revision=revision+1 where id='GCH_UPGRADE_HISTORY'")).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("Recorded charter authority") });
  await client.query("rollback");
 } finally {
  await client.end();
  if (created) await master.query(`drop database ${name} with (force)`);
  await master.end();
 }
}, 180000);
