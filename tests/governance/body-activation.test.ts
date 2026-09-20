import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodyActivations, governanceBodies, governanceCharters, governanceAppointments, governanceMembers, roleAssignments, governanceCapabilityRegistry, constitutionArticles, documents, auditLog, enterpriseEvents } from "../../src/db/schema";
import { proposeBodyActivation, commandBodyActivation } from "../../src/lib/governance/activation-service";
import { currentCharterComposition } from "../../src/lib/governance/charter-rules";
import { bodyActivationFixture, activationBallot, cleanupBodyActivation, activationContext as ctx } from "../helpers/body-activation";
import { asAppointmentActor as as } from "../helpers/appointments";
let f: Awaited<ReturnType<typeof bodyActivationFixture>>;
const create = (ids = f.nominations.map((n)=>n.id), p=f.chair) => as(p,()=>proposeBodyActivation(p,f.childId,{nominationIds:ids,rationale:"Activate this exact charter and consented initial composition"},ctx));
const command = (id:string,command:string,expectedRevision:number,p=f.secretary,extra={}) => as(p,()=>commandBodyActivation(p,f.childId,id,{command,expectedRevision,note:"Review exact initial composition and superior mandate",...extra},ctx));
async function approved() { const p=await create(); await command(p.id,"SUBMIT",1,f.chair); const resolutionId=await activationBallot(p.id,f); await command(p.id,"APPROVE",2,f.secretary,{resolutionId}); return p; }
beforeAll(async()=>{await cleanupBodyActivation("BODY_ACT");f=await bodyActivationFixture("BODY_ACT");},120000);
afterAll(()=>cleanupBodyActivation("BODY_ACT"));
describe("atomic superior-controlled body activation",()=>{
 it("rejects insufficient composition and non-presiding callers",async()=>{
  await expect(create(f.nominations.slice(0,3).map((n)=>n.id))).rejects.toHaveProperty("code","RULE_VIOLATION");
  await expect(create(f.nominations.map((n)=>n.id),f.candidate)).rejects.toHaveProperty("code","FORBIDDEN");
 });
 it("requires independent exact reserved-matter approval",async()=>{
  const p=await create();await command(p.id,"SUBMIT",1,f.chair);const resolutionId=await activationBallot(p.id,f);
  await expect(command(p.id,"APPROVE",2,f.chair,{resolutionId})).rejects.toHaveProperty("code","FORBIDDEN");
  const other=await create();await command(other.id,"SUBMIT",1,f.chair);
  await expect(command(other.id,"APPROVE",2,f.secretary,{resolutionId})).rejects.toHaveProperty("code","RULE_VIOLATION");
 });
 it.each(["expired","revoked","mfa"])("rechecks %s authority after plan approval",async(kind)=>{
  const p=await approved(),grants=await db.select().from(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));
  if(kind==="expired") await db.update(roleAssignments).set({effectiveTo:"2000-01-01"}).where(eq(roleAssignments.userId,f.secretary.userId));
  if(kind==="revoked") await db.delete(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));
  try {await expect(command(p.id,"ACTIVATE",3,kind==="mfa"?{...f.secretary,mfaSatisfied:false}:f.secretary)).rejects.toHaveProperty("code","FORBIDDEN");}
  finally{if(kind==="revoked")await db.insert(roleAssignments).values(grants);else if(kind==="expired")for(const g of grants)await db.update(roleAssignments).set({effectiveTo:g.effectiveTo}).where(eq(roleAssignments.id,g.id));}
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.childId))).toHaveLength(0);
 });
 it("rechecks constitution and instrument jurisdiction at activation",async()=>{
  const p=await approved();
  await expect(db.transaction(async(tx)=>{await tx.update(constitutionArticles).set({status:"SUSPENDED"}).where(eq(constitutionArticles.articleNo,1));await command(p.id,"ACTIVATE",3);})).rejects.toHaveProperty("code","POLICY_DENIED");
  await expect(db.transaction(async(tx)=>{await tx.update(documents).set({jurisdictionCode:"ZZ"}).where(eq(documents.id,"DOC_D4"));await command(p.id,"ACTIVATE",3);})).rejects.toHaveProperty("code","RULE_VIOLATION");
 });
 it("rolls back even after member inserts have begun",async()=>{
  const p=await approved();
  await db.execute(sql`create function test_body_activation_abort() returns trigger language plpgsql as $$ begin if NEW.body_id=(select body_id from governance_body_establishments where parent_body_id='GOV_BODY_ACT') and NEW.seat_role='SECRETARY' then raise exception 'interrupt initial membership'; end if; return NEW; end $$`);
  await db.execute(sql`create trigger test_body_activation_abort after insert on governance_members for each row execute function test_body_activation_abort()`);
  try{await expect(command(p.id,"ACTIVATE",3)).rejects.toThrow();}
  finally{await db.execute(sql`drop trigger test_body_activation_abort on governance_members`);await db.execute(sql`drop function test_body_activation_abort()`);}
  expect((await db.select().from(governanceBodyActivations).where(eq(governanceBodyActivations.id,p.id)))[0].status).toBe("APPROVED");
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.childId))).toHaveLength(0);
  expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.bodyId,f.childId))).every(n=>n.status==="ACCEPTED")).toBe(true);
 });
 it("rolls back memberships, charter, body, plan, audits and events as one transaction",async()=>{
  const p=await approved();const audits=await db.select().from(auditLog),events=await db.select().from(enterpriseEvents);
  await expect(as(f.secretary,async()=>{await commandBodyActivation(f.secretary,f.childId,p.id,{command:"ACTIVATE",expectedRevision:3,note:"Prove whole activation rollback after every material write"},ctx);throw Error("rollback activation");})).rejects.toThrow("rollback activation");
  expect((await db.select().from(governanceBodies).where(eq(governanceBodies.id,f.childId)))[0].status).toBe("DRAFT");
  expect((await db.select().from(governanceCharters).where(eq(governanceCharters.id,f.initialCharterId)))[0].status).toBe("APPROVED");
  expect((await db.select().from(governanceBodyActivations).where(eq(governanceBodyActivations.id,p.id)))[0].status).toBe("APPROVED");
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.childId))).toHaveLength(0);
  expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.bodyId,f.childId))).every((n)=>n.status==="ACCEPTED")).toBe(true);
  expect(await db.select().from(auditLog)).toEqual(audits);expect(await db.select().from(enterpriseEvents)).toEqual(events);
 });
 it("activates exactly once under concurrency without RBAC/Finance grants or rewritten approval history",async()=>{
  const p=await approved();const roles=await db.select().from(roleAssignments),capabilities=await db.select().from(governanceCapabilityRegistry);
  const [beforeCharter]=await db.select().from(governanceCharters).where(eq(governanceCharters.id,f.initialCharterId));
  const attempts=await Promise.allSettled([command(p.id,"ACTIVATE",3),command(p.id,"ACTIVATE",3)]);
  expect(attempts.filter((r)=>r.status==="fulfilled")).toHaveLength(1);expect(attempts.find((r)=>r.status==="rejected")).toMatchObject({reason:{code:"CONFLICT"}});
  const [body]=await db.select().from(governanceBodies).where(eq(governanceBodies.id,f.childId));expect(body.status).toBe("ACTIVE");
  expect(await as(f.chair,()=>currentCharterComposition(body))).toMatchObject({satisfied:true,coverage:"ADOPTED_CHARTER"});
  const members=await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.childId));expect(members).toHaveLength(4);
  const rows=await db.select().from(governanceAppointments).where(eq(governanceAppointments.bodyId,f.childId));expect(rows.every((n)=>n.status==="ACTIVE"&&members.some((m)=>m.id===n.memberId&&m.partyId===n.partyId))).toBe(true);
  const [charter]=await db.select().from(governanceCharters).where(eq(governanceCharters.id,f.initialCharterId));expect(charter).toEqual({...beforeCharter,status:"ADOPTED",revision:beforeCharter.revision+1});
  expect(await db.select().from(roleAssignments)).toEqual(roles);expect(await db.select().from(governanceCapabilityRegistry)).toEqual(capabilities);
  const events=await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId,f.childId));expect(events.filter((e)=>e.type==="GOVERNANCE_BODY_ACTIVATED")).toHaveLength(1);
  expect(events.find((e)=>e.type==="GOVERNANCE_BODY_ACTIVATED")).toMatchObject({correlationId:ctx.traceId,causationId:expect.any(String)});
 });
});
