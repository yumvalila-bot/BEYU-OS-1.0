import { predecessorInitialHistory } from "../helpers/predecessor-initial-history";
import { expect, it } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const adminUrl=process.env.BEYU_ADMIN_DATABASE_URL;
it.skipIf(!adminUrl)("0056 upgrades real consented initial appointments without rewriting any historical authority",async()=>{
 const root=process.cwd(),name=`beyu_activation_upgrade_${randomUUID().replaceAll("-","")}`;
 const master=new Client({connectionString:adminUrl});await master.connect();
 const admin=new URL(adminUrl!);admin.pathname=`/${name}`;
 const runtime=new URL(process.env.BEYU_RUNTIME_DATABASE_URL!);runtime.pathname=`/${name}`;
 const env={...process.env,BEYU_ADMIN_DATABASE_URL:admin.href,BEYU_TEST_DATABASE_URL:admin.href,DATABASE_URL:runtime.href,BEYU_RUNTIME_DATABASE_URL:runtime.href};
 mkdirSync(join(root,"tmp/governance"),{recursive:true});const dir=mkdtempSync(join(root,"tmp/governance/body-activation-upgrade-"));mkdirSync(join(dir,"drizzle"));
 for(const f of readdirSync(join(root,"drizzle")).filter(f=>/^\d+.*\.sql$/.test(f)&&Number(f.slice(0,4))<=55))copyFileSync(join(root,"drizzle",f),join(dir,"drizzle",f));
 const run=(script:string,cwd:string,label:string)=>{const r=spawnSync(process.execPath,[join(root,"node_modules/tsx/dist/cli.mjs"),script],{cwd,env,encoding:"utf8",timeout:90000});writeFileSync(join(dir,`${label}.log`),(r.stdout??"")+(r.stderr??""));expect(r.status,`see ${join(dir,`${label}.log`)}`).toBe(0);};
 const client=new Client({connectionString:admin.href});let created=false;
 try{
  await master.query(`create database ${name} owner postgres`);created=true;
  run(join(root,"scripts/migrate.ts"),dir,"predecessor");run(join(root,"scripts/setup-db-role.ts"),root,"runtime-before");run(join(root,"src/db/seed.ts"),root,"seed");
  await client.connect();
  await predecessorInitialHistory(client);
  const tables=["governance_bodies","governance_body_establishments","governance_charters","governance_charter_terms","governance_appointments","governance_members","resolutions","resolution_votes","role_assignments","governance_capability_registry","audit_log","enterprise_events"];
  const snapshot=async()=>{const result:Record<string,unknown>={};for(const t of tables)result[t]=(await client.query(`select * from ${t} t order by to_jsonb(t)::text`)).rows;return result;};
  const before=await snapshot();
  expect((await client.query("select status from governance_appointments")).rows).toEqual(Array.from({length:4},()=>({status:"ACCEPTED"})));
  copyFileSync(join(root,"drizzle/0056_governance_body_activation.sql"),join(dir,"drizzle/0056_governance_body_activation.sql"));
  run(join(root,"scripts/migrate.ts"),dir,"upgrade");run(join(root,"scripts/migrate.ts"),dir,"noop");run(join(root,"scripts/setup-db-role.ts"),root,"runtime-after");
  expect(await snapshot()).toEqual(before);
  expect((await client.query("select id from governance_body_activations")).rowCount).toBe(0);
  expect(Number((await client.query("select count(*) as n from beyu_migrations where mode='APPLIED'")).rows[0].n)).toBe(57);
  await client.query("begin");await client.query("set local role beyu_runtime");
  expect((await client.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
  expect((await client.query("select id from governance_body_activations")).rowCount).toBe(0);
  await client.query("rollback");
 }finally{await client.end();if(created)await master.query(`drop database ${name} with (force)`);await master.end();}
},180000);
