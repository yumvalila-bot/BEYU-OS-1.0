import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { eq,sql } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceMembers,governanceMembershipChanges,roleAssignments,governanceCapabilityRegistry,auditLog,enterpriseEvents,governanceAppointments,documents } from "../../src/db/schema";
import { proposeMembershipChange,applyMembershipChange } from "../../src/lib/governance/membership-service";
import { currentCharterComposition } from "../../src/lib/governance/charter-rules";
import { authorizeBodyPresider } from "../../src/lib/governance/body-authority";
import { asAppointmentActor as as } from "../helpers/appointments";
import { membershipFixture,membershipBallot,cleanupMembership } from "../helpers/membership";
let f:Awaited<ReturnType<typeof membershipFixture>>;
const ctx={traceId:"MEMBERSHIP_LIFECYCLE_PROOF"};
const target=()=>f.members.find(m=>m.partyId===f.candidate.partyId)!;
const propose=(command="SUSPEND",expectedRevision=0,p=f.chair,extra={})=>as(p,()=>proposeMembershipChange(p,f.childId,target().id,{command,expectedRevision,documentId:"DOC_D4",rationale:"Review exact original membership and independent current authority",...extra},ctx));
const apply=(id:string,resolutionId:string,p=f.secretary)=>as(p,()=>applyMembershipChange(p,f.childId,id,{resolutionId,note:"Independently apply the exact current superior decision"},ctx));
async function request(command="SUSPEND",revision=0){const r=await propose(command,revision);return {r,resolutionId:await membershipBallot(r.id,f)};}
beforeAll(async()=>{await cleanupMembership("MEMBERSHIP");f=await membershipFixture("MEMBERSHIP");},120000);
afterAll(()=>cleanupMembership("MEMBERSHIP"));
describe("governed membership lifecycle",()=>{
 it("denies nonpresiders, forged authority, and another person's resignation",async()=>{
  await expect(propose("SUSPEND",0,f.candidate)).rejects.toHaveProperty("code","FORBIDDEN");
  await expect(propose("RESIGN",0,f.secretary)).rejects.toHaveProperty("code","FORBIDDEN");
  await expect(propose("SUSPEND",0,f.chair,{authorityBodyId:f.childId})).rejects.toThrow();
 });
 it("requires exact independent superior approval",async()=>{
  const {r,resolutionId}=await request();await expect(apply(r.id,resolutionId,f.chair)).rejects.toHaveProperty("code","FORBIDDEN");
  const other=await propose();await expect(apply(other.id,resolutionId)).rejects.toHaveProperty("code","RULE_VIOLATION");
 });
 it.each(["expired","revoked"])("denies %s authority after approval",async(kind)=>{
  const {r,resolutionId}=await request(),grants=await db.select().from(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));
  if(kind==="expired")await db.update(roleAssignments).set({effectiveTo:"2000-01-01"}).where(eq(roleAssignments.userId,f.secretary.userId));else await db.delete(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));
  try{await expect(apply(r.id,resolutionId)).rejects.toHaveProperty("code","FORBIDDEN");}finally{if(kind==="revoked")await db.insert(roleAssignments).values(grants);else for(const g of grants)await db.update(roleAssignments).set({effectiveTo:g.effectiveTo}).where(eq(roleAssignments.id,g.id));}
 });
 it("rechecks scoped instruments and MFA",async()=>{
  const {r,resolutionId}=await request();await expect(apply(r.id,resolutionId,{...f.secretary,mfaSatisfied:false})).rejects.toHaveProperty("code","FORBIDDEN");
  await expect(db.transaction(async tx=>{await tx.update(documents).set({jurisdictionCode:"ZZ"}).where(eq(documents.id,"DOC_D4"));await apply(r.id,resolutionId);})).rejects.toHaveProperty("code","RULE_VIOLATION");
 });
 it("rolls back member, evidence, audits and events together",async()=>{
  const {r,resolutionId}=await request(),before=await db.select().from(governanceMembers),audits=await db.select().from(auditLog),events=await db.select().from(enterpriseEvents);
  await expect(as(f.secretary,async()=>{await applyMembershipChange(f.secretary,f.childId,r.id,{resolutionId,note:"Rollback every lifecycle material write"},ctx);throw Error("rollback lifecycle");})).rejects.toThrow("rollback lifecycle");
  expect(await db.select().from(governanceMembers)).toEqual(before);expect(await db.select().from(auditLog)).toEqual(audits);expect(await db.select().from(enterpriseEvents)).toEqual(events);
 });
 it("serializes suspension, preserves evidence and disables presiding/composition without RBAC mutation",async()=>{
  const {r,resolutionId}=await request(),roles=await db.select().from(roleAssignments),caps=await db.select().from(governanceCapabilityRegistry),appointments=await db.select().from(governanceAppointments);
  const results=await Promise.allSettled([apply(r.id,resolutionId),apply(r.id,resolutionId)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.find(r=>r.status==="rejected")).toMatchObject({reason:{code:"CONFLICT"}});
  expect((await db.select().from(governanceMembers).where(eq(governanceMembers.id,target().id)))[0]).toEqual({...target(),lifecycleStatus:"SUSPENDED",lifecycleRevision:1});
  await expect(as(f.candidate,()=>authorizeBodyPresider(f.candidate,f.childId,"PUBLIC","NOMINATE","appointment"))).rejects.toHaveProperty("code","FORBIDDEN");
  expect(await as(f.chair,()=>currentCharterComposition({id:f.childId,quorumMinimum:4,majorityRule:"SIMPLE"}))).toMatchObject({satisfied:false});
  expect(await db.select().from(roleAssignments)).toEqual(roles);expect(await db.select().from(governanceCapabilityRegistry)).toEqual(caps);expect(await db.select().from(governanceAppointments)).toEqual(appointments);
  const events=await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId,target().id));expect(events.filter(e=>e.type==="GOVERNANCE_MEMBER_SUSPENDED")).toHaveLength(1);expect(events.find(e=>e.type==="GOVERNANCE_MEMBER_SUSPENDED")).toMatchObject({correlationId:ctx.traceId,causationId:expect.any(String)});
 });
 it("reinstates only through the superior while the child lacks composition, without renewing its dates",async()=>{
  const {r,resolutionId}=await request("REINSTATE",1);await apply(r.id,resolutionId);
  expect((await db.select().from(governanceMembers).where(eq(governanceMembers.id,target().id)))[0]).toEqual({...target(),lifecycleStatus:"ACTIVE",lifecycleRevision:2});
  expect(await as(f.chair,()=>currentCharterComposition({id:f.childId,quorumMinimum:4,majorityRule:"SIMPLE"}))).toMatchObject({satisfied:true});
 });
 it("permits personal resignation without superior veto and never deletes history",async()=>{
  await expect(propose("RESIGN",2,{...f.candidate,mfaSatisfied:false})).rejects.toHaveProperty("code","FORBIDDEN");
  const resigned=await propose("RESIGN",2,f.candidate);expect(resigned.status).toBe("APPLIED");expect(resigned.appliedByPartyId).toBe(f.candidate.partyId);
  expect((await db.select().from(governanceMembers).where(eq(governanceMembers.id,target().id)))[0]).toEqual({...target(),lifecycleStatus:"RESIGNED",lifecycleRevision:3});
  await expect(propose("REINSTATE",3)).rejects.toHaveProperty("code","RULE_VIOLATION");
  expect((await db.select().from(governanceMembershipChanges).where(eq(governanceMembershipChanges.memberId,target().id))).filter(c=>c.status==="APPLIED")).toHaveLength(3);
 });
 it("removal is terminal and preserves every original term field",async()=>{
  const m=f.members.find(m=>m.partyId===f.candidates[3].partyId)!;
  const r=await as(f.chair,()=>proposeMembershipChange(f.chair,f.childId,m.id,{command:"REMOVE",expectedRevision:0,documentId:"DOC_D4",rationale:"Superior-directed removal preserves historical seat and term"},ctx));
  const resolutionId=await membershipBallot(r.id,f);await apply(r.id,resolutionId);
  expect((await db.select().from(governanceMembers).where(eq(governanceMembers.id,m.id)))[0]).toEqual({...m,lifecycleStatus:"REMOVED",lifecycleRevision:1});
  await expect(as(f.chair,()=>proposeMembershipChange(f.chair,f.childId,m.id,{command:"REINSTATE",expectedRevision:1,documentId:"DOC_D4",rationale:"A removed member requires a new governed appointment"},ctx))).rejects.toHaveProperty("code","RULE_VIOLATION");
 });
 it("retains membership UPDATE/DELETE protections",async()=>{
  await expect(as(f.secretary,()=>db.update(governanceMembers).set({votingRights:false}).where(eq(governanceMembers.id,target().id)))).rejects.toMatchObject({cause:{code:"42501"}});
  expect(await as(f.secretary,()=>db.delete(governanceMembers).where(eq(governanceMembers.id,target().id)).returning())).toHaveLength(0);
  expect((await db.execute(sql`select count(*) as n from governance_members where body_id=${f.childId}`)).rows[0].n).toBe("4");
 });
});
