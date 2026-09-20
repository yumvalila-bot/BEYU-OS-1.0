import { createGovernanceAction, listGovernanceActions } from "../../src/lib/governance/action-service";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodies,governanceMembers,governanceBodyChanges,governanceCharters,roleAssignments,governanceCapabilityRegistry,auditLog,enterpriseEvents,governanceAppointments,documents,resolutions,resolutionVotes } from "../../src/db/schema";
import { proposeBodyChange,applyBodyChange,listBodyChanges } from "../../src/lib/governance/body-lifecycle-service";
import { proposeMembershipChange } from "../../src/lib/governance/membership-service";
import { authorizeBodyPresider } from "../../src/lib/governance/body-authority";
import { votingSnapshots } from "../../src/lib/governance-vote-service";
import { asAppointmentActor as as } from "../helpers/appointments";
import { bodyLifecycleFixture,bodyChangeBallot,cleanupBodyLifecycle,ctx } from "../helpers/body-lifecycle";
let f:Awaited<ReturnType<typeof bodyLifecycleFixture>>;
const input=(command="SUSPEND",expectedRevision=0)=>({command,expectedRevision,documentId:"DOC_D4",rationale:"Independent superior decision preserves all original body history"});
const propose=(command="SUSPEND",revision=0,p=f.chair)=>as(p,()=>proposeBodyChange(p,f.childId,input(command,revision),ctx));
const apply=(id:string,resolutionId:string,p=f.secretary)=>as(p,()=>applyBodyChange(p,f.childId,id,{resolutionId,note:"Independently apply this exact superior body mandate"},ctx));
async function request(command="SUSPEND",revision=0){const row=await propose(command,revision);return {row,resolutionId:await bodyChangeBallot(row.id,f)};}
const state=async()=>(await db.select().from(governanceBodies).where(eq(governanceBodies.id,f.childId)))[0];
beforeAll(async()=>{await cleanupBodyLifecycle("BODY_LIFE");f=await bodyLifecycleFixture("BODY_LIFE");},120000);
afterAll(()=>cleanupBodyLifecycle("BODY_LIFE"));
describe("independent superior body lifecycle",()=>{
 it("rejects self-authority, invented superiors, caller fields and invalid transitions",async()=>{
  await expect(propose("SUSPEND",0,f.candidate)).rejects.toHaveProperty("code","FORBIDDEN");
  await expect(as(f.chair,()=>proposeBodyChange(f.chair,f.bodyId,input(),ctx))).rejects.toHaveProperty("code","FORBIDDEN");
  await expect(as(f.chair,()=>proposeBodyChange(f.chair,f.childId,{...input(),authorityBodyId:f.childId},ctx))).rejects.toThrow();
  await expect(propose("ARCHIVE")).rejects.toHaveProperty("code","RULE_VIOLATION");
  await expect(propose("SUSPEND",0,{...f.chair,mfaSatisfied:false})).rejects.toHaveProperty("code","FORBIDDEN");
 });
 it("requires exact independent decision provenance",async()=>{
  const {row,resolutionId}=await request();await expect(apply(row.id,resolutionId,f.chair)).rejects.toHaveProperty("code","FORBIDDEN");
  const other=await propose();await expect(apply(other.id,resolutionId)).rejects.toHaveProperty("code","RULE_VIOLATION");
  await expect(apply(row.id,f.historyId)).rejects.toHaveProperty("code","FORBIDDEN");
 });
 it.each(["expired","revoked"])("rechecks %s grants at execution",async kind=>{
  const {row,resolutionId}=await request(),grants=await db.select().from(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));
  if(kind==="expired")await db.update(roleAssignments).set({effectiveTo:"2000-01-01"}).where(eq(roleAssignments.userId,f.secretary.userId));else await db.delete(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));
  try{await expect(apply(row.id,resolutionId)).rejects.toHaveProperty("code","FORBIDDEN");}finally{if(kind==="revoked")await db.insert(roleAssignments).values(grants);else for(const g of grants)await db.update(roleAssignments).set({effectiveTo:g.effectiveTo}).where(eq(roleAssignments.id,g.id));}
 });
 it.each([{jurisdictionCode:"ZZ"},{entityScope:"WRONG_ENTITY"}])("rechecks current document scope %j",async scope=>{
  const {row,resolutionId}=await request();await expect(db.transaction(async tx=>{await tx.update(documents).set(scope).where(eq(documents.id,"DOC_D4"));await apply(row.id,resolutionId);})).rejects.toHaveProperty("code","RULE_VIOLATION");
 });
 it("requires affected-party recusal even when membership changes after the request",async()=>{
  const {row,resolutionId}=await request();const parent=(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.bodyId))).find(m=>m.partyId!==f.chair.partyId&&m.partyId!==f.secretary.partyId)!;
  await expect(db.transaction(async tx=>{await tx.insert(governanceMembers).values({...parent,id:"GMB_BODY_AFFECTED",bodyId:f.childId,seatRole:"OBSERVER",votingRights:false});await apply(row.id,resolutionId);})).rejects.toHaveProperty("code","RULE_VIOLATION");
 });
 it("rolls back body, request, notifications, audits and events together",async()=>{
  const {row,resolutionId}=await request(),before=await state(),audits=await db.select().from(auditLog),events=await db.select().from(enterpriseEvents);
  await expect(as(f.secretary,async()=>{await applyBodyChange(f.secretary,f.childId,row.id,{resolutionId,note:"Rollback this complete body state transition"},ctx);throw Error("rollback body");})).rejects.toThrow("rollback body");
  expect(await state()).toEqual(before);expect(await db.select().from(auditLog)).toEqual(audits);expect(await db.select().from(enterpriseEvents)).toEqual(events);expect((await db.select().from(governanceBodyChanges).where(eq(governanceBodyChanges.id,row.id)))[0].status).toBe("PROPOSED");
 });
 it("serializes suspension and preserves final ballots without live authority",async()=>{
  const {row,resolutionId}=await request(),before=await state(),members=await db.select().from(governanceMembers),roles=await db.select().from(roleAssignments),caps=await db.select().from(governanceCapabilityRegistry),appointments=await db.select().from(governanceAppointments),charters=await db.select().from(governanceCharters),decisions=await db.select().from(resolutions),ballots=await db.select().from(resolutionVotes);
  const results=await Promise.allSettled([apply(row.id,resolutionId),apply(row.id,resolutionId)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.find(r=>r.status==="rejected")).toMatchObject({reason:{code:"CONFLICT"}});
  expect(await state()).toEqual({...before,status:"SUSPENDED"});
  expect(await db.select().from(governanceMembers)).toEqual(members);expect(await db.select().from(roleAssignments)).toEqual(roles);expect(await db.select().from(governanceCapabilityRegistry)).toEqual(caps);expect(await db.select().from(governanceAppointments)).toEqual(appointments);expect(await db.select().from(governanceCharters)).toEqual(charters);expect(await db.select().from(resolutions)).toEqual(decisions);expect(await db.select().from(resolutionVotes)).toEqual(ballots);
  await expect(as(f.candidate,()=>authorizeBodyPresider(f.candidate,f.childId,"PUBLIC","NOMINATE","appointment"))).rejects.toHaveProperty("code","FORBIDDEN");
  expect((await as(f.candidate,()=>votingSnapshots(f.candidate,[f.historyId]))).get(f.historyId)).toMatchObject({currentVote:"FOR",canVote:false,quorumBasis:"DECISION_RECORD",quorum:{eligible:4,met:true}});
  expect((await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId,row.id))).find(e=>e.type==="GOVERNANCE_BODY_SUSPENDED")).toMatchObject({correlationId:ctx.traceId,causationId:expect.any(String)});
 });
 it("cannot resume by reviving ended membership or ignoring composition",async()=>{
  const {row,resolutionId}=await request("RESUME",1);const member=f.members.find(m=>m.partyId===f.candidate.partyId)!;
  await expect(db.transaction(async()=>{await as(f.candidate,()=>proposeMembershipChange(f.candidate,f.childId,member.id,{command:"RESIGN",expectedRevision:0,documentId:"DOC_D4",rationale:"Personal resignation cannot be vetoed to preserve quorum"},ctx));await apply(row.id,resolutionId);})).rejects.toHaveProperty("code","RULE_VIOLATION");
  expect((await state()).status).toBe("SUSPENDED");await apply(row.id,resolutionId);expect((await state()).status).toBe("ACTIVE");
  await expect(propose("SUSPEND",0)).rejects.toHaveProperty("code","CONFLICT");
 });
 it("blocks wind-down with outstanding decisions or unclosed action evidence",async()=>{
  await expect(db.transaction(async tx=>{const [r]=await tx.select().from(resolutions).where(eq(resolutions.id,f.historyId));await tx.insert(resolutions).values({...r,id:"RES_BODY_OPEN",reference:"RES_BODY_OPEN",status:"DRAFT",decidedByMemberId:null,decisionDate:null});await propose("DISSOLVE",2);})).rejects.toHaveProperty("code","RULE_VIOLATION");
  await expect(db.transaction(async()=>{await as(f.candidate,()=>createGovernanceAction(f.candidate,f.historyId,{title:"Outstanding implementation",description:"Must not strand unresolved mandated action",priority:"NORMAL",dueAt:"2030-12-31T00:00:00Z"},ctx));await propose("DISSOLVE",2);})).rejects.toHaveProperty("code","RULE_VIOLATION");
 });
 it("dissolves through canonical RETIRED, archives immutably and cannot reactivate",async()=>{
  const {row,resolutionId}=await request("DISSOLVE",2),members=await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.childId));await apply(row.id,resolutionId);expect((await state()).status).toBe("RETIRED");
  await expect(propose("RESUME",3)).rejects.toHaveProperty("code","RULE_VIOLATION");
  const archive=await request("ARCHIVE",3);await apply(archive.row.id,archive.resolutionId);
  expect(await as(f.chair,()=>listBodyChanges(f.chair,f.childId))).toMatchObject({revision:4,archived:true,body:{status:"RETIRED"}});
  await expect(propose("ARCHIVE",4)).rejects.toHaveProperty("code","RULE_VIOLATION");
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.childId))).toEqual(members);
  const actions=await as(f.candidate,()=>listGovernanceActions(f.candidate,f.historyId));expect(actions).toHaveLength(1);expect(actions[0]).toMatchObject({...f.action,status:"CLOSED",evidence:[{documentId:"DOC_D4",submittedByUserId:f.candidates[2].userId}]});
  expect((await as(f.candidate,()=>votingSnapshots(f.candidate,[f.historyId]))).get(f.historyId)).toMatchObject({currentVote:"FOR",canVote:false,quorumBasis:"DECISION_RECORD"});
 });
});
