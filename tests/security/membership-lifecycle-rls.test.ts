import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { proposeMembershipChange } from "../../src/lib/governance/membership-service";
import { asAppointmentActor as as } from "../helpers/appointments";
import { membershipFixture,membershipBallot,cleanupMembership } from "../helpers/membership";
let f:Awaited<ReturnType<typeof membershipFixture>>,runtime:Client,id:string,memberId:string,resolutionId:string;
async function scoped(fn:()=>Promise<void>,o:{tenant?:string;entity?:string;classification?:string;actor?:string}={}){await runtime.query("begin");try{await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_actions_read','on',true),set_config('beyu.governance_entity_ids',$2,true),set_config('beyu.governance_classifications',$3,true),set_config('beyu.membership_actor',$4,true),set_config('beyu.membership_change_id',$5,true),set_config('beyu.global_scope','on',true)`,[o.tenant??f.chair.tenantId,o.entity??"",o.classification??"PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED",o.actor??f.secretary.userId,id]);await fn();}finally{await runtime.query("rollback");}}
const apply=()=>runtime.query("update governance_membership_changes set status='APPLIED',resolution_id=$2,applied_by_user_id=$3,applied_at=now() where id=$1 returning status",[id,resolutionId,f.secretary.userId]);
beforeAll(async()=>{
 if(!process.env.BEYU_RUNTIME_DATABASE_URL)throw Error("Actual runtime DSN required");runtime=new Client({connectionString:process.env.BEYU_RUNTIME_DATABASE_URL});await runtime.connect();expect((await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
 await cleanupMembership("MEMBERSHIP_RLS");f=await membershipFixture("MEMBERSHIP_RLS");memberId=f.members[0].id;
 await db.execute(sql`insert into documents select (jsonb_populate_record(null::documents,to_jsonb(d)||'{"id":"DOC_MEMBERSHIP_RLS","classification":"RESTRICTED"}'::jsonb)).* from documents d where id='DOC_D4'`);
 const r=await as(f.chair,()=>proposeMembershipChange(f.chair,f.childId,memberId,{command:"SUSPEND",expectedRevision:0,documentId:"DOC_MEMBERSHIP_RLS",rationale:"Exact restricted membership lifecycle evidence"},{traceId:"MEMBERSHIP_RLS"}));id=r.id;resolutionId=await membershipBallot(id,f);
},120000);
afterAll(async()=>{if(runtime)await runtime.end();await cleanupMembership("MEMBERSHIP_RLS");await db.execute(sql`delete from documents where id='DOC_MEMBERSHIP_RLS'`);});
describe("actual non-owner membership lifecycle boundary",()=>{
 it.each([["beyu.governance_context","off"],["beyu.governance_classifications","PUBLIC"],["beyu.current_tenant_ids","TEN_WRONG_SCOPE"]])("cannot hide deferred evidence using %s=%s",async(key,value)=>scoped(async()=>{
  expect((await apply()).rowCount).toBe(1);
  await runtime.query("select set_config($1,$2,true)",[key,value]);
  await expect(runtime.query("set constraints all immediate")).rejects.toHaveProperty("code","23514");
 }));
 it("denies missing context",async()=>{expect((await runtime.query("select id from governance_membership_changes where id=$1",[id])).rowCount).toBe(0);});
 it.each([{tenant:"TEN_BEYU_FINTECH"},{entity:"WRONG_ENTITY"},{classification:"PUBLIC"}])("enforces %j despite global flag",async(o)=>scoped(async()=>{expect((await runtime.query("select id from governance_membership_changes where id=$1",[id])).rowCount).toBe(0);expect((await apply()).rowCount).toBe(0);},o));
 it("denies a nonpresider with forged transaction flags",async()=>scoped(async()=>{await expect(apply()).rejects.toHaveProperty("code","23514");},{actor:f.candidate.userId}));
 it("requires the exact decision",async()=>scoped(async()=>{await expect(runtime.query("update governance_membership_changes set status='APPLIED',resolution_id='RES_C1',applied_by_user_id=$2,applied_at=now() where id=$1",[id,f.secretary.userId])).rejects.toHaveProperty("code","23514");}));
 it("rejects partial commit while leaving evidence and membership unchanged",async()=>scoped(async()=>{expect((await apply()).rowCount).toBe(1);await expect(runtime.query("commit")).rejects.toMatchObject({code:"23514",message:expect.stringContaining("atomically")});expect((await db.execute(sql`select lifecycle_status,lifecycle_revision from governance_members where id=${memberId}`)).rows).toEqual([{lifecycle_status:"ACTIVE",lifecycle_revision:0}]);}));
 it("permits only the exact paired projection, never seat/term mutation",async()=>{
  await scoped(async()=>{await apply();await expect(runtime.query("update governance_members set lifecycle_status='SUSPENDED',lifecycle_revision=1,voting_rights=false where id=$1",[memberId])).rejects.toHaveProperty("code","42501");});
  await scoped(async()=>{await apply();expect((await runtime.query("update governance_members set lifecycle_status='SUSPENDED',lifecycle_revision=1 where id=$1 returning lifecycle_status",[memberId])).rows).toEqual([{lifecycle_status:"SUSPENDED"}]);await runtime.query("set constraints all immediate");expect((await runtime.query("select beyu_current_body_composition_valid($1) as valid",[f.childId])).rows).toEqual([{valid:false}]);});
 });
 it("retains historical ballots but forbids new votes from an inactive seat",async()=>{
  await db.execute(sql`insert into resolutions(id,reference,tenant_id,body_id,title,category,summary,rationale,data_basis,consequences,proposed_by,status,required_majority,classification) values('RES_MEMBERSHIP_LIVE','RES_MEMBERSHIP_LIVE',${f.chair.tenantId},${f.childId},'Live electorate','POLICY','Fixture','Fixture','Fixture','No grants',${f.candidate.userId},'DRAFT','SIMPLE','PUBLIC')`);
  try{
   await scoped(async()=>{await runtime.query("insert into resolution_votes(id,resolution_id,member_id,vote) values('RV_MEMBER_LIVE','RES_MEMBERSHIP_LIVE',$1,'FOR')",[memberId]);await apply();await runtime.query("update governance_members set lifecycle_status='SUSPENDED',lifecycle_revision=1 where id=$1",[memberId]);expect((await runtime.query("select vote from resolution_votes where id='RV_MEMBER_LIVE'")).rows).toEqual([{vote:"FOR"}]);await expect(runtime.query("update resolution_votes set vote='AGAINST' where id='RV_MEMBER_LIVE'")).rejects.toHaveProperty("code","42501");});
   await scoped(async()=>{await apply();await runtime.query("update governance_members set lifecycle_status='SUSPENDED',lifecycle_revision=1 where id=$1",[memberId]);await expect(runtime.query("insert into resolution_votes(id,resolution_id,member_id,vote) values('RV_MEMBER_LIVE','RES_MEMBERSHIP_LIVE',$1,'FOR')",[memberId])).rejects.toHaveProperty("code","42501");});
  }finally{await db.execute(sql`delete from resolutions where id='RES_MEMBERSHIP_LIVE'`);}
 });
 it("cannot rewrite original evidence or delete history",async()=>{
  await scoped(async()=>{await expect(runtime.query("update governance_membership_changes set status='APPLIED',resolution_id=$2,applied_by_user_id=$3,applied_at=now(),from_status='SUSPENDED' where id=$1",[id,resolutionId,f.secretary.userId])).rejects.toHaveProperty("code","23514");});
  await scoped(async()=>{expect((await runtime.query("delete from governance_membership_changes where id=$1",[id])).rowCount).toBe(0);expect((await runtime.query("delete from governance_members where id=$1",[memberId])).rowCount).toBe(0);});
 });
});
