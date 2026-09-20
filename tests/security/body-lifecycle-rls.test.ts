import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { proposeBodyChange } from "../../src/lib/governance/body-lifecycle-service";
import { asAppointmentActor as as } from "../helpers/appointments";
import { bodyLifecycleFixture,bodyChangeBallot,cleanupBodyLifecycle,ctx } from "../helpers/body-lifecycle";
let f:Awaited<ReturnType<typeof bodyLifecycleFixture>>,runtime:Client,id:string,resolutionId:string;
async function scoped(fn:()=>Promise<void>,o:{tenant?:string;entity?:string;classification?:string;actor?:string}={}){
 await runtime.query("begin");try{await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_actions_read','on',true),set_config('beyu.governance_entity_ids',$2,true),set_config('beyu.governance_classifications',$3,true),set_config('beyu.body_change_actor',$4,true),set_config('beyu.body_change_id',$5,true),set_config('beyu.global_scope','on',true)`,[o.tenant??f.chair.tenantId,o.entity??"",o.classification??"PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED",o.actor??f.secretary.userId,id]);await fn();}finally{await runtime.query("rollback");}
}
const apply=()=>runtime.query("update governance_body_changes set status='APPLIED',resolution_id=$2,applied_by_user_id=$3,applied_at=now() where id=$1 returning status",[id,resolutionId,f.secretary.userId]);
const project=()=>runtime.query("update governance_bodies set status='SUSPENDED' where id=$1 returning status",[f.childId]);
beforeAll(async()=>{
 if(!process.env.BEYU_RUNTIME_DATABASE_URL)throw Error("Actual runtime DSN required");runtime=new Client({connectionString:process.env.BEYU_RUNTIME_DATABASE_URL});await runtime.connect();expect((await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
 await cleanupBodyLifecycle("BODY_LIFE_RLS");f=await bodyLifecycleFixture("BODY_LIFE_RLS");
 await db.execute(sql`insert into documents select (jsonb_populate_record(null::documents,to_jsonb(d)||'{"id":"DOC_BODY_LIFE_RLS","classification":"RESTRICTED"}'::jsonb)).* from documents d where id='DOC_D4'`);
 const r=await as(f.chair,()=>proposeBodyChange(f.chair,f.childId,{command:"SUSPEND",expectedRevision:0,documentId:"DOC_BODY_LIFE_RLS",rationale:"Exact restricted body lifecycle evidence"},ctx));id=r.id;resolutionId=await bodyChangeBallot(id,f);
 await db.execute(sql`insert into resolutions(id,reference,tenant_id,body_id,title,category,summary,rationale,data_basis,consequences,proposed_by,classification) values('RES_BODY_LIFE_LIVE','RES_BODY_LIFE_LIVE',${f.chair.tenantId},${f.childId},'Live body authority','POLICY','Fixture','Fixture','Fixture','No grants',${f.candidate.userId},'PUBLIC')`);
},120000);
afterAll(async()=>{if(runtime)await runtime.end();await cleanupBodyLifecycle("BODY_LIFE_RLS");await db.execute(sql`delete from documents where id='DOC_BODY_LIFE_RLS'`);});
describe("actual non-owner body lifecycle SQL boundary",()=>{
 it.each([["beyu.governance_context","off"],["beyu.governance_classifications","PUBLIC"],["beyu.current_tenant_ids","TEN_WRONG_SCOPE"]])("cannot hide deferred evidence using %s=%s",async(key,value)=>scoped(async()=>{
  expect((await apply()).rowCount).toBe(1);
  await runtime.query("select set_config($1,$2,true)",[key,value]);
  await expect(runtime.query("set constraints all immediate")).rejects.toHaveProperty("code","23514");
 }));
 it("fails closed without context",async()=>{expect((await runtime.query("select id from governance_body_changes where id=$1",[id])).rowCount).toBe(0);});
 it.each([{tenant:"TEN_BEYU_FINTECH"},{entity:"WRONG_ENTITY"},{classification:"PUBLIC"}])("enforces %j despite a global flag",async o=>scoped(async()=>{expect((await runtime.query("select id from governance_body_changes where id=$1",[id])).rowCount).toBe(0);expect((await apply()).rowCount).toBe(0);},o));
 it("denies forged self-authority and flags",async()=>scoped(async()=>{await expect(apply()).rejects.toHaveProperty("code","23514");},{actor:f.candidate.userId}));
 it("requires exact decision and immutable affected parties",async()=>{
  await scoped(async()=>{await expect(runtime.query("update governance_body_changes set status='APPLIED',resolution_id='RES_C1',applied_by_user_id=$2 where id=$1",[id,f.secretary.userId])).rejects.toHaveProperty("code","23514");});
  await scoped(async()=>{await expect(runtime.query("update governance_body_changes set status='APPLIED',resolution_id=$2,applied_by_user_id=$3,affected_party_ids='[]' where id=$1",[id,resolutionId,f.secretary.userId])).rejects.toHaveProperty("code","23514");});
 });
 it("rejects an exactly linked approved reference without a matching decision event",async()=>{
  await db.execute(sql`insert into resolutions select (jsonb_populate_record(null::resolutions,to_jsonb(r)||'{"id":"RES_BODY_FORGED","reference":"RES_BODY_FORGED"}'::jsonb)).* from resolutions r where r.id=${resolutionId}`);
  try{await scoped(async()=>{await expect(runtime.query("update governance_body_changes set status='APPLIED',resolution_id='RES_BODY_FORGED',applied_by_user_id=$2 where id=$1",[id,f.secretary.userId])).rejects.toHaveProperty("code","23514");});}finally{await db.execute(sql`delete from resolutions where id='RES_BODY_FORGED'`);}
 });
 it("rejects partial COMMIT and arbitrary body projection",async()=>{
  await scoped(async()=>{expect((await apply()).rowCount).toBe(1);await expect(runtime.query("commit")).rejects.toMatchObject({code:"23514",message:expect.stringContaining("atomically")});});
  expect((await db.execute(sql`select status from governance_bodies where id=${f.childId}`)).rows).toEqual([{status:"ACTIVE"}]);
  await scoped(async()=>{await expect(project()).rejects.toHaveProperty("code","42501");});
 });
 it("accepts only paired status projection and leaves metadata protected",async()=>{
  await scoped(async()=>{await apply();await expect(runtime.query("update governance_bodies set status='SUSPENDED',quorum_minimum=1 where id=$1",[f.childId])).rejects.toHaveProperty("code","42501");});
  await scoped(async()=>{await apply();expect((await project()).rows).toEqual([{status:"SUSPENDED"}]);await runtime.query("set constraints all immediate");expect((await runtime.query("select vote from resolution_votes where resolution_id=$1",[f.historyId])).rows).toHaveLength(4);});
 });
 it("preserves final ballots but rejects new/updated ballots and new resolutions while inactive",async()=>{
  const member=f.members[0];
  await scoped(async()=>{await runtime.query("insert into resolution_votes(id,resolution_id,member_id,vote) values('RV_BODY_LIVE','RES_BODY_LIFE_LIVE',$1,'FOR')",[member.id]);await apply();await project();expect((await runtime.query("update resolution_votes set vote='AGAINST' where resolution_id=$1 and member_id=$2",[f.historyId,member.id])).rowCount).toBe(0);await expect(runtime.query("update resolution_votes set vote='AGAINST' where id='RV_BODY_LIVE'")).rejects.toHaveProperty("code","42501");});
  await scoped(async()=>{await apply();await project();await expect(runtime.query("insert into resolution_votes(id,resolution_id,member_id,vote) values('RV_BODY_INACTIVE',$1,$2,'FOR')",["RES_BODY_LIFE_LIVE",member.id])).rejects.toHaveProperty("code","42501");});
  await scoped(async()=>{await apply();await project();await expect(runtime.query("insert into resolutions(id,reference,tenant_id,body_id,title,category,summary,rationale,data_basis,consequences,proposed_by,classification) values('RES_BODY_INACTIVE','RES_BODY_INACTIVE',$1,$2,'Denied inactive proposal','POLICY','Fixture','Fixture','Fixture','No grants',$3,'PUBLIC')",[f.chair.tenantId,f.childId,f.candidate.userId])).rejects.toHaveProperty("code","42501");});
 });
 it("serializes mandated work against suspension without hiding closed action evidence",async()=>scoped(async()=>{
  const insert=(id:string)=>runtime.query("insert into tasks(id,tenant_id,title,description,source_resolution_id,created_by_user_id,due_at) values($1,$2,'Recorded governed work','Body lifecycle boundary',$3,$4,'2030-12-31')",[id,f.chair.tenantId,f.historyId,f.candidate.userId]);
  expect((await insert("TSK_BODY_LIVE")).rowCount).toBe(1);await apply();await project();
  expect((await runtime.query("select id from governance_action_evidence where task_id=$1",[f.action.id])).rowCount).toBe(1);
  await expect(insert("TSK_BODY_INACTIVE")).rejects.toHaveProperty("code","42501");
 }));
 it("cannot erase body, membership or request history",async()=>scoped(async()=>{
  expect((await runtime.query("delete from governance_body_changes where id=$1",[id])).rowCount).toBe(0);
  expect((await runtime.query("delete from governance_bodies where id=$1",[f.childId])).rowCount).toBe(0);
  expect((await runtime.query("delete from governance_members where body_id=$1",[f.childId])).rowCount).toBe(0);
 }));
});
