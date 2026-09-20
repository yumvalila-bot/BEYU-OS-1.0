import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { proposeBodyActivation, commandBodyActivation } from "../../src/lib/governance/activation-service";
import { bodyActivationFixture, activationBallot, cleanupBodyActivation, activationContext as ctx } from "../helpers/body-activation";
import { asAppointmentActor as as } from "../helpers/appointments";
let runtime: Client, f: Awaited<ReturnType<typeof bodyActivationFixture>>, id: string;
async function scoped(fn: () => Promise<void>, options: { tenant?: string; entity?: string; classification?: string; actor?: string } = {}) {
 await runtime.query("begin");
 try {
  await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_actions_read','on',true),set_config('beyu.governance_entity_ids',$2,true),set_config('beyu.governance_classifications',$3,true),set_config('beyu.body_activation_actor',$4,true),set_config('beyu.body_activation_id',$5,true),set_config('beyu.global_scope','on',true)`, [options.tenant ?? f.chair.tenantId, options.entity ?? "", options.classification ?? "PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED", options.actor ?? f.secretary.userId,id]);
  await fn();
 } finally { await runtime.query("rollback"); }
}
const activate = () => runtime.query("update governance_body_activations set status='ACTIVE',revision=4,activated_by_user_id=$2,activated_at=now() where id=$1 returning status",[id,f.secretary.userId]);
beforeAll(async()=>{
 if(!process.env.BEYU_RUNTIME_DATABASE_URL)throw Error("Actual runtime DSN required");
 runtime=new Client({connectionString:process.env.BEYU_RUNTIME_DATABASE_URL});await runtime.connect();
 expect((await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
 await cleanupBodyActivation("BODY_ACT_RLS");
 await db.execute(sql`insert into documents select (jsonb_populate_record(null::documents,to_jsonb(d)||'{"id":"DOC_BODY_ACT_RLS","classification":"RESTRICTED"}'::jsonb)).* from documents d where id='DOC_D4'`);
 f=await bodyActivationFixture("BODY_ACT_RLS","DOC_BODY_ACT_RLS");
 const p=await as(f.chair,()=>proposeBodyActivation(f.chair,f.childId,{nominationIds:f.nominations.map(n=>n.id),rationale:"Frozen restricted initial composition for database boundary proof"},ctx));id=p.id;
 await as(f.chair,()=>commandBodyActivation(f.chair,f.childId,id,{command:"SUBMIT",expectedRevision:1,note:"Submit exact immutable composition"},ctx));
 const resolutionId=await activationBallot(id,f);
 await as(f.secretary,()=>commandBodyActivation(f.secretary,f.childId,id,{command:"APPROVE",expectedRevision:2,resolutionId,note:"Independent superior approval of exact plan"},ctx));
},120000);
afterAll(async()=>{if(runtime)await runtime.end();await cleanupBodyActivation("BODY_ACT_RLS");await db.execute(sql`delete from documents where id='DOC_BODY_ACT_RLS'`);});
describe("atomic body activation actual non-owner SQL",()=>{
 it("fails closed without scope",async()=>{expect((await runtime.query("select id from governance_body_activations where id=$1",[id])).rowCount).toBe(0);});
 it.each([{tenant:"TEN_BEYU_FINTECH"},{entity:"WRONG_ENTITY"},{classification:"PUBLIC"}])("enforces %j despite a forged global flag",async(options)=>scoped(async()=>{
  expect((await runtime.query("select id from governance_body_activations where id=$1",[id])).rowCount).toBe(0);
  expect((await activate()).rowCount).toBe(0);
 },options));
 it("exposes the exact approved evidence only within scope",async()=>scoped(async()=>{
  expect((await runtime.query("select status,nomination_ids from governance_body_activations where id=$1",[id])).rows).toEqual([{status:"APPROVED",nomination_ids:f.nominations.map(n=>n.id).sort()}]);
 }));
 it("denies non-presider even with forged transaction gates",async()=>scoped(async()=>{await expect(activate()).rejects.toHaveProperty("code","23514");},{actor:f.candidate.userId}));
 it("rejects self-activation by the plan's proposer",async()=>scoped(async()=>{
  await expect(runtime.query("update governance_body_activations set status='ACTIVE',revision=4,activated_by_user_id=$2,activated_at=now() where id=$1",[id,f.chair.userId])).rejects.toHaveProperty("code","23514");
 },{actor:f.chair.userId}));
 it("rejects a partial COMMIT, not just an application validation",async()=>scoped(async()=>{
  expect((await activate()).rows).toEqual([{status:"ACTIVE"}]);
  await expect(runtime.query("commit")).rejects.toMatchObject({code:"23514",message:expect.stringContaining("atomically")});
  expect((await db.execute(sql`select status,revision from governance_body_activations where id=${id}`)).rows).toEqual([{status:"APPROVED",revision:3}]);
 }));
 it.each([{nomination_ids:[]},{initial_charter_id:null},{authority_body_id:"GOV_GROUP_BOARD"},{rationale:"Substitute frozen evidence"},{created_at:"2000-01-01T00:00:00Z"}])("rejects immutable substitution %j",async(fields)=>scoped(async()=>{
  await expect(runtime.query("update governance_body_activations set (nomination_ids,initial_charter_id,authority_body_id,rationale,created_at,status,revision,activated_by_user_id,activated_at)=(select nomination_ids,initial_charter_id,authority_body_id,rationale,created_at,'ACTIVE',4,$3,now() from jsonb_populate_record(null::governance_body_activations,to_jsonb(governance_body_activations)||$2::jsonb)) where id=$1",[id,JSON.stringify(fields),f.secretary.userId])).rejects.toHaveProperty("code","23514");
 }));
 it("cannot delete approval history",async()=>scoped(async()=>{expect((await runtime.query("delete from governance_body_activations where id=$1",[id])).rowCount).toBe(0);}));
 it("cannot activate a body or effectuate its charter with flags alone",async()=>{
  await scoped(async()=>{await expect(runtime.query("update governance_bodies set status='ACTIVE' where id=$1",[f.childId])).rejects.toHaveProperty("code","42501");});
  await scoped(async()=>{await expect(runtime.query("update governance_charters set status='ADOPTED',revision=revision+1 where id=$1",[f.initialCharterId])).rejects.toHaveProperty("code","23514");});
 });
 it("even a pending exact activation cannot rewrite body metadata or charter approval provenance",async()=>{
  await scoped(async()=>{await activate();await expect(runtime.query("update governance_bodies set status='ACTIVE',quorum_minimum=1 where id=$1",[f.childId])).rejects.toHaveProperty("code","42501");});
  await scoped(async()=>{await activate();await expect(runtime.query("update governance_charters set status='ADOPTED',revision=revision+1,adopted_at=now() where id=$1",[f.initialCharterId])).rejects.toHaveProperty("code","23514");});
 });
});
